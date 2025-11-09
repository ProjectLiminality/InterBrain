/**
 * RadicleService - Peer-to-peer networking via Radicle CLI
 *
 * Implements integration with Radicle network for decentralized DreamNode sharing.
 * Provides "Save & Share" paradigm - hiding git/Radicle complexity behind familiar metaphors.
 */

// Access Node.js modules directly in Electron context
const { exec } = require('child_process');
const { promisify } = require('util');
const os = require('os');
const path = require('path');
const process = require('process');

const execAsync = promisify(exec);

export interface RadicleIdentity {
  /** Radicle DID (Decentralized Identifier) */
  did: string;
  /** Human-readable alias/name */
  alias?: string;
}

export interface RadicleService {
  /**
   * Check if Radicle CLI is available on this system
   */
  isAvailable(): Promise<boolean>;

  /**
   * Check if Radicle node is currently running
   */
  isNodeRunning(): Promise<boolean>;

  /**
   * Initialize a DreamNode repository with Radicle
   * @param passphrase Optional passphrase (uses ssh-agent if not provided)
   */
  init(dreamNodePath: string, name?: string, description?: string, passphrase?: string): Promise<void>;

  /**
   * Clone a DreamNode from the Radicle network
   * @param passphrase Optional passphrase (uses ssh-agent if not provided)
   * @param targetDirName Optional exact directory name (for nested submodules to avoid UUID prefix conflicts)
   * @returns Object with repo name and whether it was already cloned
   */
  clone(radicleId: string, destinationPath: string, passphrase?: string, targetDirName?: string): Promise<{ repoName: string; alreadyExisted: boolean }>;

  /**
   * Share DreamNode to Radicle network (sync changes)
   * @param passphrase Optional passphrase (uses ssh-agent if not provided)
   */
  share(dreamNodePath: string, passphrase?: string): Promise<void>;

  /**
   * Check if there are local commits to share
   */
  hasChangesToShare(dreamNodePath: string): Promise<boolean>;

  /**
   * Get Radicle ID for a repository
   * @param passphrase Optional passphrase (uses ssh-agent if not provided)
   */
  getRadicleId(repoPath: string, passphrase?: string): Promise<string | null>;

  /**
   * Get current user's Radicle identity
   */
  getIdentity(): Promise<RadicleIdentity>;
}

export class RadicleServiceImpl implements RadicleService {
  private _isAvailable: boolean | null = null;
  private _isPlatformSupported: boolean | null = null;
  private _radCommand: string | null = null;

  /**
   * Check if current platform supports Radicle (macOS/Linux only)
   * Windows users will use GitHub-based implementation (future)
   *
   * 🧪 TESTING: Set SIMULATE_WINDOWS=true to test GitHub fallback on macOS
   */
  private isPlatformSupported(): boolean {
    if (this._isPlatformSupported !== null) {
      return this._isPlatformSupported;
    }

    // 🧪 TESTING MODE: Simulate Windows to test GitHub fallback
    const simulateWindows = process.env.SIMULATE_WINDOWS === 'true';
    if (simulateWindows) {
      console.log('🧪 [TEST MODE] Simulating Windows - Radicle disabled, GitHub fallback active');
      this._isPlatformSupported = false;
      return false;
    }

    const platform = os.platform();
    const isSupported = platform === 'darwin' || platform === 'linux';

    if (!isSupported && platform === 'win32') {
      console.log('RadicleService: Windows detected - Radicle features disabled (GitHub implementation coming soon)');
    }

    this._isPlatformSupported = isSupported;
    return this._isPlatformSupported;
  }

  /**
   * Find the rad command in common installation locations
   */
  private async findRadCommand(): Promise<string | null> {
    const homeDir = os.homedir();
    const possiblePaths = [
      'rad', // Try PATH first
      path.join(homeDir, '.radicle', 'bin', 'rad'), // Standard Radicle install location
      '/usr/local/bin/rad', // Homebrew default
      '/opt/homebrew/bin/rad', // Homebrew on Apple Silicon
    ];

    for (const radPath of possiblePaths) {
      try {
        await execAsync(`"${radPath}" --version`);
        return radPath;
      } catch {
        // Continue to next path
      }
    }

    return null;
  }

  async isAvailable(): Promise<boolean> {
    // Cache the result - CLI availability doesn't change during runtime
    if (this._isAvailable !== null) {
      return this._isAvailable;
    }

    // Platform check first
    if (!this.isPlatformSupported()) {
      console.log('RadicleService: Platform not supported');
      this._isAvailable = false;
      return false;
    }

    // Find rad command
    this._radCommand = await this.findRadCommand();
    this._isAvailable = this._radCommand !== null;

    if (!this._isAvailable) {
      console.log('RadicleService: rad command not found in any standard location');
    }

    return this._isAvailable;
  }

  /**
   * Get the rad command (with full path if needed)
   */
  private getRadCommand(): string {
    if (!this._radCommand) {
      throw new Error('Radicle CLI not available');
    }
    return this._radCommand;
  }

  async init(dreamNodePath: string, name?: string, description?: string, passphrase?: string): Promise<void> {
    if (!await this.isAvailable()) {
      throw new Error('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
    }

    // Ensure Radicle node is running before initializing
    await this.ensureNodeRunning(passphrase);

    const radCmd = this.getRadCommand();

    // Build command with proper flags to bypass TTY requirements
    // IMPORTANT: Pass the path as the first argument to rad init
    // NOTE: name parameter should be pre-sanitized (e.g., directory name in PascalCase)
    const args = ['init', `"${dreamNodePath}"`, '--public', '--default-branch', 'main', '--no-confirm'];
    if (name) {
      args.push('--name', `"${name}"`);
    }
    if (description) {
      args.push('--description', `"${description}"`);
    }

    const command = `"${radCmd}" ${args.join(' ')}`;
    console.log(`RadicleService: Running '${command}'`);

    // Prepare environment with passphrase if provided
    const env = { ...(globalThis as any).process.env };
    if (passphrase) {
      env.RAD_PASSPHRASE = passphrase;
      console.log('RadicleService: Using provided passphrase via RAD_PASSPHRASE');
    } else {
      console.log('RadicleService: No passphrase provided, relying on ssh-agent');
    }

    // Debug: Check if directory exists and has .git
    const fs = require('fs');
    const gitPath = require('path').join(dreamNodePath, '.git');
    console.log(`RadicleService: Checking if ${gitPath} exists:`, fs.existsSync(gitPath));

    // Debug: Try running git status to verify the repo works
    try {
      await execAsync('git status', { cwd: dreamNodePath });
      console.log(`RadicleService: git status works in ${dreamNodePath}`);
    } catch (gitErr: any) {
      console.error(`RadicleService: git status failed:`, gitErr.message);
    }

    try {
      // Use spawn instead of exec to provide proper stdin
      const { spawn } = require('child_process');
      const { promisify } = require('util');

      const spawnPromise = () => new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn(radCmd, ['init', dreamNodePath, '--public', '--default-branch', 'main', '--no-confirm', ...(name ? ['--name', name] : []), ...(description ? ['--description', description] : [])], {
          env: env,
          cwd: dreamNodePath,
          stdio: ['pipe', 'pipe', 'pipe']  // Provide stdin pipe
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('close', (code) => {
          console.log(`RadicleService: spawn closed with code ${code}`);
          console.log(`RadicleService: stdout:`, stdout);
          console.log(`RadicleService: stderr:`, stderr);

          if (code === 0) {
            resolve({ stdout, stderr });
          } else {
            const error: any = new Error(`Command exited with code ${code}`);
            error.stdout = stdout;
            error.stderr = stderr;
            reject(error);
          }
        });

        child.on('error', (error) => {
          console.error(`RadicleService: spawn error:`, error);
          reject(error);
        });

        // Close stdin immediately since we're non-interactive
        child.stdin?.end();
      });

      const result = await spawnPromise();

      console.log('RadicleService: rad init output:', result.stdout);
      if (result.stderr) {
        console.warn('RadicleService: rad init stderr:', result.stderr);
      }
    } catch (error: any) {
      const errorOutput = error.stderr || error.stdout || error.message || '';

      // Check if already initialized in storage - this means we need to use rad checkout
      // Error format: "attempt to reinitialize '/Users/.../storage/z2KWk...'"
      if (errorOutput.includes('reinitialize') && errorOutput.includes('/storage/')) {
        console.log(`RadicleService: Repository exists in Radicle storage but working directory not linked`);

        // Extract Radicle ID from storage path
        // Path format: /Users/username/.radicle/storage/z2KWkLyACv7ycuZva8C5NFo1m9EGC (no rad: prefix in path)
        const storageMatch = errorOutput.match(/\/storage\/(z[A-Za-z0-9]+)/);
        if (storageMatch && storageMatch[1]) {
          const radicleId = `rad:${storageMatch[1]}`; // Add rad: prefix
          console.log(`RadicleService: Found Radicle ID in storage: ${radicleId}`);

          // Return a special error that includes the Radicle ID
          throw new Error(`RADICLE_STORAGE_EXISTS:${radicleId}`);
        }

        // Fallback if we can't extract ID
        throw new Error('Repository exists in Radicle storage but working directory not linked. Run "rad ." to check status.');
      }

      // Check if already initialized normally - this is expected and not an error
      if (errorOutput.includes('already initialized')) {
        console.log(`RadicleService: Repository already initialized (not an error)`);
        throw new Error(errorOutput); // Throw with clean message for caller to handle
      }

      // Log unexpected errors
      console.error('RadicleService: rad init failed:', error);
      console.error('RadicleService: rad init stdout:', error.stdout);
      console.error('RadicleService: rad init stderr:', error.stderr);

      // Check if error is due to missing passphrase
      if (errorOutput.includes('RAD_PASSPHRASE') || errorOutput.includes('passphrase')) {
        throw new Error('Radicle passphrase required. Please configure your passphrase or ensure ssh-agent is running.');
      }

      throw new Error(`Failed to initialize Radicle: ${errorOutput || error.message || 'Unknown error'}`);
    }
  }

  /**
   * Check if Radicle node is running
   */
  async isNodeRunning(): Promise<boolean> {
    try {
      const radCmd = this.getRadCommand();
      const { stdout } = await execAsync(`"${radCmd}" node status`);
      const isRunning = stdout.includes('Running');
      console.log(`RadicleService: Node status check: ${isRunning ? 'running' : 'not running'}`);
      return isRunning;
    } catch {
      console.log('RadicleService: Node status check failed, assuming not running');
      return false;
    }
  }

  /**
   * Start Radicle node
   */
  private async startNode(passphrase?: string): Promise<void> {
    const radCmd = this.getRadCommand();
    const env = { ...process.env };

    if (passphrase) {
      env.RAD_PASSPHRASE = passphrase;
      console.log('RadicleService: Using passphrase for node start (length:', passphrase.length, ')');
    } else {
      console.log('RadicleService: No passphrase provided for node start');
    }

    // CRITICAL: Add Radicle bin to PATH so rad can find radicle-node binary
    const path = require('path');
    const radBinDir = path.dirname(radCmd);
    env.PATH = `${radBinDir}:${env.PATH}`;

    console.log('RadicleService: Starting Radicle node...');
    try {
      const result = await execAsync(`"${radCmd}" node start`, { env });
      console.log('RadicleService: Radicle node started successfully');
      if (result.stdout) console.log('RadicleService: node start stdout:', result.stdout);
      if (result.stderr) console.log('RadicleService: node start stderr:', result.stderr);
    } catch (error: any) {
      console.error('RadicleService: node start failed:', error.message);
      if (error.stdout) console.error('RadicleService: node start stdout:', error.stdout);
      if (error.stderr) console.error('RadicleService: node start stderr:', error.stderr);
      throw error;
    }

    // Wait for node to be fully ready
    console.log('RadicleService: Waiting for node to be fully ready...');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * Ensure Radicle node is running, start if needed
   */
  private async ensureNodeRunning(passphrase?: string): Promise<void> {
    const isRunning = await this.isNodeRunning();
    if (!isRunning) {
      console.log('RadicleService: Node not running, starting it...');
      await this.startNode(passphrase);
    } else {
      console.log('RadicleService: Node already running');
    }
  }

  /**
   * Follow a peer's Radicle DID to receive their updates
   * This is ESSENTIAL for bidirectional collaboration
   */
  async followPeer(peerDid: string, passphrase?: string, repoPath?: string): Promise<void> {
    if (!await this.isAvailable()) {
      throw new Error('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
    }

    const radCmd = this.getRadCommand();

    // Prepare environment with passphrase if provided
    const env = { ...process.env };
    if (passphrase) {
      env.RAD_PASSPHRASE = passphrase;
    }

    // Prepare execution options - run from repo directory if provided
    const execOptions: any = { env };
    if (repoPath) {
      const fullPath = this.getFullPath(repoPath);
      execOptions.cwd = fullPath;
      console.log(`RadicleService: Following peer ${peerDid} in repo ${repoPath}...`);
    } else {
      console.log(`RadicleService: Following peer ${peerDid} globally...`);
    }

    try {
      await execAsync(`"${radCmd}" follow ${peerDid}`, execOptions);
      console.log(`RadicleService: ✅ Now following ${peerDid} - will receive their updates`);
    } catch (error: any) {
      const errorOutput = error.stderr || error.stdout || error.message || '';

      // Check if already following - not an error
      if (errorOutput.includes('already following') || errorOutput.includes('Already following')) {
        console.log(`RadicleService: Already following ${peerDid} (not an error)`);
        return;
      }

      // Log other errors but don't fail
      console.warn(`RadicleService: Could not follow peer ${peerDid}:`, errorOutput);
      throw new Error(`Failed to follow peer: ${errorOutput || error.message}`);
    }
  }

  /**
   * Get the delegate (owner) DID for a repository
   */
  async getRepositoryDelegate(radicleId: string, passphrase?: string): Promise<string | null> {
    if (!await this.isAvailable()) {
      return null;
    }

    const radCmd = this.getRadCommand();

    // Prepare environment with passphrase if provided
    const env = { ...process.env };
    if (passphrase) {
      env.RAD_PASSPHRASE = passphrase;
    }

    try {
      // Use rad inspect to get repository metadata
      const { stdout } = await execAsync(`"${radCmd}" inspect ${radicleId}`, { env });

      // Parse the delegate DID from the output
      // Format: delegate: did:key:z6Mkxyz...
      const delegateMatch = stdout.match(/delegate:\s*(did:key:[A-Za-z0-9]+)/i);

      if (delegateMatch && delegateMatch[1]) {
        const delegateDid = delegateMatch[1];
        console.log(`RadicleService: Found delegate for ${radicleId}: ${delegateDid}`);
        return delegateDid;
      }

      console.warn(`RadicleService: Could not parse delegate DID from rad inspect output`);
      return null;
    } catch (error: any) {
      console.warn(`RadicleService: Failed to get repository delegate:`, error.message);
      return null;
    }
  }

  /**
   * Get Radicle ID for a repository
   */
  async getRadicleId(repoPath: string, passphrase?: string): Promise<string | null> {
    // Check availability first - return null silently if not available
    if (!await this.isAvailable()) {
      return null;
    }

    try {
      // Ensure Radicle node is running before querying repository
      await this.ensureNodeRunning(passphrase);

      const radCmd = this.getRadCommand();
      const { stdout } = await execAsync(`"${radCmd}" .`, { cwd: repoPath });
      const radicleId = stdout.trim();

      if (radicleId && radicleId.startsWith('rad:')) {
        console.log(`RadicleService: Got Radicle ID: ${radicleId}`);
        return radicleId;
      }

      console.log(`RadicleService: rad . returned output but not a valid Radicle ID: "${radicleId}"`);
      return null;
    } catch (error: any) {
      // Log the error for debugging with full details
      const errorOutput = error.stderr || error.stdout || error.message || 'Unknown error';
      console.log(`RadicleService: rad . failed for ${repoPath}:`, errorOutput);
      // Silent failure - repository may not be initialized yet
      return null;
    }
  }

  /**
   * Find repositories by Radicle ID
   * OPTIMIZED: Parallel checks with early exit
   */
  private async findReposByRadicleId(vaultPath: string, radicleId: string): Promise<string[]> {
    const path = require('path');
    const fs = require('fs');

    try {
      const entries = await fs.promises.readdir(vaultPath, { withFileTypes: true });
      const directories = entries.filter((entry: any) => entry.isDirectory() && !entry.name.startsWith('.'));

      // OPTIMIZATION 1: Check all .udd files in parallel (fast path)
      const uddChecks = await Promise.all(
        directories.map(async (dir: any) => {
          const dirPath = path.join(vaultPath, dir.name);
          const uddPath = path.join(dirPath, '.udd');

          try {
            const uddContent = await fs.promises.readFile(uddPath, 'utf-8');
            const udd = JSON.parse(uddContent);

            if (udd.radicleId === radicleId) {
              return { dirName: dir.name, found: true, method: '.udd file' };
            }
          } catch {
            // .udd file doesn't exist or couldn't be read
          }

          return { dirName: dir.name, found: false, method: null };
        })
      );

      // OPTIMIZATION 2: Early exit if found in .udd files
      const uddMatch = uddChecks.find(check => check.found);
      if (uddMatch) {
        console.log(`RadicleService: Found matching Radicle ID in "${uddMatch.dirName}" (${uddMatch.method})`);
        return [uddMatch.dirName];
      }

      // OPTIMIZATION 3: Fallback to git checks in parallel (slow path, only if needed)
      const gitChecks = await Promise.all(
        directories.map(async (dir: any) => {
          const dirPath = path.join(vaultPath, dir.name);
          const repoRadicleId = await this.getRadicleId(dirPath);

          if (repoRadicleId === radicleId) {
            return { dirName: dir.name, found: true };
          }

          return { dirName: dir.name, found: false };
        })
      );

      // OPTIMIZATION 4: Early exit after first git match
      const gitMatch = gitChecks.find(check => check.found);
      if (gitMatch) {
        console.log(`RadicleService: Found matching Radicle ID in "${gitMatch.dirName}" (git repository)`);
        return [gitMatch.dirName];
      }

      return [];
    } catch (error) {
      console.error('RadicleService: Error scanning for Radicle IDs:', error);
      return [];
    }
  }

  async clone(radicleId: string, destinationPath: string, passphrase?: string): Promise<{ repoName: string; alreadyExisted: boolean }> {
    if (!await this.isAvailable()) {
      throw new Error('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
    }

    // Check if this Radicle ID is already cloned
    const path = require('path');
    const fs = require('fs');

    console.log(`RadicleService: Checking if ${radicleId} already exists...`);
    const existingRepos = await this.findReposByRadicleId(destinationPath, radicleId);

    if (existingRepos.length > 0) {
      const existingRepoName = existingRepos[0];
      console.log(`RadicleService: ✅ Repository already exists as "${existingRepoName}" - skipping clone`);

      // Return existing repo name with alreadyExisted flag
      return { repoName: existingRepoName, alreadyExisted: true };
    }

    // Ensure Radicle node is running before attempting to clone
    await this.ensureNodeRunning(passphrase);

    const radCmd = this.getRadCommand();

    // Prepare environment with passphrase if provided
    const env = { ...process.env };
    if (passphrase) {
      env.RAD_PASSPHRASE = passphrase;
      console.log('RadicleService: Using provided passphrase via RAD_PASSPHRASE');
    } else {
      console.log('RadicleService: No passphrase provided, relying on ssh-agent');
    }

    // CRITICAL: Add Radicle bin to PATH so rad can find radicle-node binary
    const radBinDir = path.dirname(radCmd);
    env.PATH = `${radBinDir}:${env.PATH}`;

    // Clone the repository
    let cloneResult: any;

    try {
      console.log(`RadicleService: Running 'rad clone ${radicleId}' in ${destinationPath}`);
      cloneResult = await execAsync(`"${radCmd}" clone ${radicleId}`, {
        cwd: destinationPath,
        env: env,
      });
      console.log('RadicleService: rad clone output:', cloneResult.stdout);
      if (cloneResult.stderr) {
        console.warn('RadicleService: rad clone stderr:', cloneResult.stderr);
      }
    } catch (cloneError: any) {
      const errorOutput = cloneError.stdout || cloneError.stderr || cloneError.message || '';

      // Check if error is due to directory already existing
      // Error format: "the directory path "RepoName" already exists"
      const existsMatch = errorOutput.match(/directory path "([^"]+)" already exists/);

      if (existsMatch && existsMatch[1]) {
        const existingName = existsMatch[1];
        throw new Error(`Clone aborted: A directory named "${existingName}" already exists. Please rename the existing directory and try again.`);
      }

      // Check if error is due to missing passphrase
      if (errorOutput.includes('RAD_PASSPHRASE') || errorOutput.includes('passphrase')) {
        throw new Error('Radicle passphrase required. Please configure your passphrase or ensure ssh-agent is running.');
      }

      // Other error
      throw new Error(`Failed to clone from Radicle network: ${errorOutput || cloneError.message || 'Unknown error'}`);
    }

    // Parse repository name from clone output
    // Example output: "Creating checkout in ./TestRepo"
    const cloneOutput = cloneResult.stdout || cloneResult.stderr || '';
    const match = cloneOutput.match(/Creating checkout in \.\/([^./\s]+)/);

    let repoName: string;
    if (match && match[1]) {
      repoName = match[1];
      console.log(`RadicleService: Parsed repository name from clone output: ${repoName}`);
    } else {
      // Fallback: Try to list directories and find the newest one
      console.warn('RadicleService: Could not parse repo name from output, falling back to directory scan');
      const entries = await fs.promises.readdir(destinationPath, { withFileTypes: true });
      const dirs = entries.filter((e: any) => e.isDirectory() && !e.name.startsWith('.'));

      if (dirs.length === 0) {
        throw new Error('Clone succeeded but could not find cloned repository directory');
      }

      // Sort by modification time and take the newest
      const dirsWithStats = await Promise.all(
        dirs.map(async (d: any) => ({
          name: d.name,
          stats: await fs.promises.stat(path.join(destinationPath, d.name))
        }))
      );
      dirsWithStats.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);
      repoName = dirsWithStats[0].name;
      console.log(`RadicleService: Using newest directory as repo name: ${repoName}`);
    }

    // OPTIMIZATION: Save Radicle ID to .udd file for instant future lookups
    // Also normalize title to human-readable format if needed
    try {
      const repoPath = path.join(destinationPath, repoName);
      const uddPath = path.join(repoPath, '.udd');

      // Read existing .udd file
      const uddContent = await fs.promises.readFile(uddPath, 'utf-8');
      const udd = JSON.parse(uddContent);

      // Add/update radicleId field
      udd.radicleId = radicleId;

      // Normalize title to human-readable format using established naming schema
      // Import title normalization utilities
      const { isPascalCase, pascalCaseToTitle } = await import('../utils/title-sanitization');

      // Check if title needs normalization (kebab-case, snake_case, or PascalCase)
      let titleNormalized = false;
      if (udd.title) {
        const originalTitle = udd.title;

        // If title contains hyphens, underscores, or periods as separators
        if (/[-_.]+/.test(udd.title)) {
          udd.title = udd.title
            .split(/[-_.]+/)
            .filter((word: string) => word.length > 0)
            .map((word: string) => {
              const cleaned = word.trim();
              if (cleaned.length === 0) return '';
              return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
            })
            .join(' ')
            .trim();
          titleNormalized = udd.title !== originalTitle;
        }
        // If title is pure PascalCase (no separators), convert to spaced format
        else if (isPascalCase(udd.title)) {
          udd.title = pascalCaseToTitle(udd.title);
          titleNormalized = udd.title !== originalTitle;
        }
      }

      // Write back to .udd file
      await fs.promises.writeFile(uddPath, JSON.stringify(udd, null, 2), 'utf-8');
      console.log(`RadicleService: ✅ Saved Radicle ID to .udd file for instant future lookups`);
      if (titleNormalized) {
        console.log(`RadicleService: ✅ Normalized title to human-readable format: "${udd.title}"`);
      }
    } catch (error) {
      console.warn(`RadicleService: ⚠️ Could not save Radicle ID to .udd file (non-critical):`, error);
      // Don't fail the clone if .udd update fails
    }

    // CRITICAL: Follow the repository delegate to receive their updates
    // This is ESSENTIAL for the Radicle peer-to-peer collaboration model
    try {
      console.log(`RadicleService: Establishing peer following relationship...`);
      const delegateDid = await this.getRepositoryDelegate(radicleId, passphrase);

      if (delegateDid) {
        await this.followPeer(delegateDid, passphrase);
        console.log(`RadicleService: ✅ Collaboration handshake complete - following ${delegateDid}`);
      } else {
        console.warn(`RadicleService: ⚠️ Could not determine repository delegate - peer following skipped`);
        console.warn(`RadicleService: ⚠️ You may not receive updates from this repository's owner`);
      }
    } catch (followError: any) {
      // Don't fail the clone if following fails - log warning
      console.warn(`RadicleService: ⚠️ Could not follow repository delegate (non-critical):`, followError.message);
      console.warn(`RadicleService: ⚠️ You may not receive updates automatically. Run 'rad follow <DID>' manually if needed.`);
    }

    return { repoName, alreadyExisted: false };
  }

  async share(dreamNodePath: string, passphrase?: string): Promise<void> {
    if (!await this.isAvailable()) {
      throw new Error('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
    }

    // Ensure Radicle node is running before attempting to share
    await this.ensureNodeRunning(passphrase);

    const radCmd = this.getRadCommand();

    // Prepare environment with passphrase and enhanced PATH for git-remote-rad helper
    const homeDir = (globalThis as any).process?.env?.HOME || '';
    const radicleGitHelperPaths = [
      `${homeDir}/.radicle/bin`,
      '/usr/local/bin',
      '/opt/homebrew/bin'
    ];
    const enhancedPath = radicleGitHelperPaths.join(':') + ':' + ((globalThis as any).process?.env?.PATH || '');

    const env = { ...(globalThis as any).process.env };
    env.PATH = enhancedPath;
    if (passphrase) {
      env.RAD_PASSPHRASE = passphrase;
      console.log('RadicleService: Using provided passphrase via RAD_PASSPHRASE');
    } else {
      console.log('RadicleService: No passphrase provided, relying on ssh-agent');
    }

    try {
      // STEP 1: Push commits to Radicle remote
      // rad sync alone doesn't push commits - need explicit git push
      console.log(`RadicleService: Pushing commits to Radicle remote...`);
      console.log(`RadicleService: Enhanced PATH for git-remote-rad: ${enhancedPath}`);
      try {
        const pushResult = await execAsync('git push rad main', {
          cwd: dreamNodePath,
          env: env,
        });
        console.log('RadicleService: git push rad main output:', pushResult.stdout);
        if (pushResult.stderr) {
          console.log('RadicleService: git push rad main stderr:', pushResult.stderr);
        }
      } catch (pushError: any) {
        // If push fails, log but continue - might be up to date
        console.warn('RadicleService: git push warning (continuing anyway):', pushError.message);
      }

      // STEP 2: Seed the repository to public seeds for async sharing
      // This ensures others can fetch your changes even when you're offline
      console.log(`RadicleService: Seeding repository to enable async sharing...`);
      try {
        const seedResult = await execAsync(`"${radCmd}" seed`, {
          cwd: dreamNodePath,
          env: env,
        });
        console.log('RadicleService: rad seed output:', seedResult.stdout);
      } catch (seedError: any) {
        // Seeding might fail if already seeded or network issues - not critical
        console.warn('RadicleService: rad seed warning (continuing anyway):', seedError.message);
      }

      // STEP 3: Sync to announce changes to network
      console.log(`RadicleService: Running '${radCmd} sync' in ${dreamNodePath}`);
      const result = await execAsync(`"${radCmd}" sync`, {
        cwd: dreamNodePath,
        env: env,
      });
      console.log('RadicleService: rad sync output:', result.stdout);
      if (result.stderr) {
        console.warn('RadicleService: rad sync stderr:', result.stderr);
      }
    } catch (error: any) {
      console.error('RadicleService: rad sync failed:', error);

      // Check if error is due to missing passphrase
      if (error.message && error.message.includes('RAD_PASSPHRASE')) {
        throw new Error('Radicle passphrase required. Please configure your passphrase or ensure ssh-agent is running.');
      }

      throw new Error(`Failed to share to Radicle network: ${error.message || 'Unknown error'}`);
    }
  }

  async hasChangesToShare(dreamNodePath: string): Promise<boolean> {
    try {
      // Check if there are commits that haven't been pushed to Radicle
      // Use git to check if there are unpushed commits
      const { stdout } = await execAsync('git log @{u}.. --oneline', {
        cwd: dreamNodePath,
      });

      return stdout.trim().length > 0;
    } catch {
      // If there's no upstream configured yet, check if there are any commits
      try {
        const { stdout } = await execAsync('git log --oneline', {
          cwd: dreamNodePath,
        });
        return stdout.trim().length > 0;
      } catch {
        // No commits at all
        return false;
      }
    }
  }

  async getIdentity(): Promise<RadicleIdentity> {
    if (!await this.isAvailable()) {
      throw new Error('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
    }

    try {
      const radCmd = this.getRadCommand();
      const { stdout } = await execAsync(`"${radCmd}" self --did`);
      const did = stdout.trim();

      // Try to get alias (optional)
      let alias: string | undefined;
      try {
        const radCmd = this.getRadCommand();
        const aliasResult = await execAsync(`"${radCmd}" self --alias`);
        alias = aliasResult.stdout.trim();
      } catch {
        // Alias is optional, continue without it
      }

      return { did, alias };
    } catch (error) {
      console.error('Failed to get Radicle identity:', error);
      throw new Error(`Failed to get Radicle identity: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add a peer as an equal delegate to a repository
   * Sets threshold to 1 for true peer-to-peer equality
   */
  async addDelegate(dreamNodePath: string, peerDID: string, peerName: string, passphrase?: string): Promise<void> {
    if (!await this.isAvailable()) {
      throw new Error('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
    }

    await this.ensureNodeRunning(passphrase);

    const radCmd = this.getRadCommand();
    const title = `Add ${peerName} as equal collaborator`;
    const description = `Making ${peerName} an equal delegate for peer-to-peer collaboration`;

    try {
      const result = await execAsync(
        `"${radCmd}" id update --delegate "${peerDID}" --threshold 1 --title "${title}" --description "${description}"`,
        { cwd: dreamNodePath }
      );
      console.log(`RadicleService: Added ${peerName} as delegate:`, result.stdout);
    } catch (error: any) {
      throw new Error(`Failed to add delegate: ${error.message}`);
    }
  }

  /**
   * Set repository seeding scope to 'followed' for private collaboration
   */
  async setSeedingScope(dreamNodePath: string, radicleId: string, scope: 'all' | 'followed' = 'followed'): Promise<void> {
    if (!await this.isAvailable()) {
      throw new Error('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
    }

    const radCmd = this.getRadCommand();

    try {
      const result = await execAsync(
        `"${radCmd}" seed "${radicleId}" --scope ${scope}`,
        { cwd: dreamNodePath }
      );
      console.log(`RadicleService: Set seeding scope to '${scope}':`, result.stdout);
    } catch (error: any) {
      throw new Error(`Failed to set seeding scope: ${error.message}`);
    }
  }

  /**
   * Add a peer's fork as a git remote
   */
  async addPeerRemote(dreamNodePath: string, peerName: string, radicleId: string, peerDID: string): Promise<void> {
    const remoteUrl = `rad://${radicleId}/${peerDID}`;

    try {
      // Check if remote already exists
      const { stdout: existingRemotes } = await execAsync('git remote', { cwd: dreamNodePath });
      if (existingRemotes.split('\n').includes(peerName)) {
        console.log(`RadicleService: Remote '${peerName}' already exists, skipping`);
        return;
      }

      // Add the remote
      await execAsync(`git remote add "${peerName}" "${remoteUrl}"`, { cwd: dreamNodePath });
      console.log(`RadicleService: Added git remote '${peerName}' -> ${remoteUrl}`);
    } catch (error: any) {
      throw new Error(`Failed to add peer remote: ${error.message}`);
    }
  }
}
