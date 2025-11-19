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

  /**
   * Get list of peer DIDs seeding a repository (from Radicle routing table)
   * This enables transitive discovery: Alice can discover that Bob/Charlie accepted coherence beacon
   * @param repoPath Path to DreamNode repository
   * @returns Array of peer DIDs currently seeding this repo (discovered via inventory announcements)
   */
  getSeeders(repoPath: string): Promise<string[]>;
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
      const { stdout } = await execAsync(`"${radCmd}" node`);
      // Output format: "✓ Node is running." when running
      const isRunning = stdout.includes('Node is running');
      // Reduced logging - only log when NOT running (actionable)
      if (!isRunning) {
        console.log(`RadicleService: Node not running, will start it`);
      }
      return isRunning;
    } catch {
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
    }

    // CRITICAL: Add Radicle bin to PATH so rad can find radicle-node binary
    const path = require('path');
    const radBinDir = path.dirname(radCmd);
    env.PATH = `${radBinDir}:${env.PATH}`;

    try {
      await execAsync(`"${radCmd}" node start`, { env });
      // Node start successful - no need to log (reduces noise)
    } catch (error: any) {
      console.error('RadicleService: node start failed:', error.message);
      throw error;
    }

    // Wait for node to be fully ready (silent)
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * Ensure Radicle node is running, start if needed
   */
  private async ensureNodeRunning(passphrase?: string): Promise<void> {
    const isRunning = await this.isNodeRunning();
    if (!isRunning) {
      await this.startNode(passphrase);
    }
    // Silent when already running (reduces log noise)
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
      execOptions.cwd = repoPath;
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
      // Use --scope all for public seed infrastructure (Phase 1 approach)
      // This allows cloning from any public seed without requiring peer following
      console.log(`RadicleService: Running 'rad clone ${radicleId} --scope all' in ${destinationPath}`);
      cloneResult = await execAsync(`"${radCmd}" clone ${radicleId} --scope all`, {
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

    // NOTE: Peer relationship configuration (following, delegates, remotes, scope)
    // is now handled by the comprehensive "Sync Radicle Peer Following" command
    // which runs at the end of URI handler flows. This ensures:
    // - Single source of truth for all peer configuration
    // - Idempotent operations (safe to run multiple times)
    // - Complete relationship setup (not just delegate following)

    return { repoName, alreadyExisted: false };
  }

  async share(dreamNodePath: string, passphrase?: string, recipientDid?: string): Promise<void> {
    if (!await this.isAvailable()) {
      throw new Error('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
    }

    if (recipientDid) {
      console.log(`RadicleService: Will add ${recipientDid} as delegate after publishing`);
    }

    const radCmd = this.getRadCommand();

    // Convert to absolute path if needed
    const path = require('path');
    const absoluteDreamNodePath = path.isAbsolute(dreamNodePath)
      ? dreamNodePath
      : path.resolve(dreamNodePath);
    console.log(`RadicleService: [DEBUG] Original path: ${dreamNodePath}`);
    console.log(`RadicleService: [DEBUG] Absolute path: ${absoluteDreamNodePath}`);

    // Prepare environment with passphrase and enhanced PATH for git-remote-rad helper
    const process = require('process');
    const os = require('os');
    const homeDir = os.homedir();
    const radicleGitHelperPaths = [
      `${homeDir}/.radicle/bin`,
      '/usr/local/bin',
      '/opt/homebrew/bin'
    ];
    const enhancedPath = radicleGitHelperPaths.join(':') + ':' + (process.env.PATH || '');

    const env = { ...process.env };
    env.PATH = enhancedPath;
    if (passphrase) {
      env.RAD_PASSPHRASE = passphrase;
      console.log('RadicleService: Using provided passphrase via RAD_PASSPHRASE');
    } else {
      console.log('RadicleService: No passphrase provided, relying on ssh-agent');
    }

    try {
      // STEP 1: Push commits to Radicle storage
      console.log(`RadicleService: Pushing commits to Radicle storage...`);
      console.log(`RadicleService: [DEBUG] absoluteDreamNodePath = ${absoluteDreamNodePath}`);
      console.log(`RadicleService: [DEBUG] env.PATH = ${env.PATH}`);

      const { spawn } = require('child_process');
      await new Promise<void>((resolve, reject) => {
        const child = spawn('git', ['push', 'rad', 'main'], {
          env: env,
          cwd: absoluteDreamNodePath,
          stdio: ['pipe', 'pipe', 'pipe']
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
          console.log('RadicleService: git push output:', stdout);
          if (stderr) console.log('RadicleService: git push stderr:', stderr);

          if (code === 0 || stdout.includes('up to date')) {
            resolve();
          } else {
            reject(new Error(`git push failed with code ${code}`));
          }
        });

        child.on('error', (error) => {
          console.error('RadicleService: git push spawn error:', error);
          reject(error);
        });

        child.stdin?.end();
      });

      // STEP 2: Check if already public before attempting to publish
      console.log(`RadicleService: Checking if repository is already public...`);
      const isAlreadyPublic = await new Promise<boolean>((resolve) => {
        const child = spawn(radCmd, ['inspect'], {
          env: env,
          cwd: absoluteDreamNodePath,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';

        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.on('close', () => {
          // Check if output contains "visibility: public"
          const isPublic = stdout.toLowerCase().includes('visibility: public');
          resolve(isPublic);
        });

        child.on('error', () => {
          // If rad inspect fails, assume not public
          resolve(false);
        });

        child.stdin?.end();
      });

      if (isAlreadyPublic) {
        console.log(`ℹ️ RadicleService: Repository is already public - skipping rad publish`);
        // Still add delegate if recipient specified
        if (recipientDid) {
          console.log(`RadicleService: Adding ${recipientDid} as delegate (repo already public)...`);
          await this.addDelegate(absoluteDreamNodePath, recipientDid, passphrase);
        }
        return; // Skip publish, exit successfully
      }

      // STEP 3: Publish to network (use rad id update for multi-delegate support)
      console.log(`RadicleService: Publishing to Radicle network (rad id update --visibility public)...`);
      await new Promise<void>((resolve, reject) => {
        const child = spawn(radCmd, [
          'id', 'update',
          '--title', 'Publish repository',
          '--description', 'Make repository publicly accessible',
          '--visibility', 'public',
          '--no-confirm'
        ], {
          env: env,
          cwd: absoluteDreamNodePath,
          stdio: ['pipe', 'pipe', 'pipe']
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
          console.log('RadicleService: rad id update output:', stdout);
          if (stderr) console.log('RadicleService: rad id update stderr:', stderr);

          if (code === 0) {
            console.log('✅ RadicleService: Successfully published to network!');
            resolve();
          } else if (stderr.includes('already public') || stderr.includes('No identity updates')) {
            console.log('ℹ️ RadicleService: Repository already public (no changes needed)');
            resolve(); // Not an error
          } else {
            reject(new Error(`rad id update exited with code ${code}`));
          }
        });

        child.on('error', (error) => {
          console.error('RadicleService: rad id update spawn error:', error);
          reject(error);
        });

        child.stdin?.end();
      });

      // STEP 4: Announce to network for immediate peer discovery
      // This ensures other nodes can find this repository right away
      console.log(`RadicleService: Announcing repository to network (rad sync --announce)...`);
      await new Promise<void>((resolve, reject) => {
        const child = spawn(radCmd, ['sync', '--announce'], {
          env: env,
          cwd: absoluteDreamNodePath,
          stdio: ['pipe', 'pipe', 'pipe']
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
          console.log('RadicleService: rad sync --announce output:', stdout);
          if (stderr) console.log('RadicleService: rad sync --announce stderr:', stderr);

          // Announce can fail if no seeds found (not critical)
          if (code === 0 || stdout.includes('No seeds found')) {
            console.log('✅ RadicleService: Repository announced to network');
            resolve();
          } else {
            console.warn(`⚠️ RadicleService: rad sync --announce exited with code ${code} (not critical)`);
            resolve(); // Don't fail the whole operation
          }
        });

        child.on('error', (error) => {
          console.warn('RadicleService: rad sync --announce spawn error (not critical):', error);
          resolve(); // Don't fail the whole operation
        });

        child.stdin?.end();
      });

      // STEP 5: Add recipient as delegate if specified
      if (recipientDid) {
        console.log(`RadicleService: Adding ${recipientDid} as delegate after successful publish...`);
        await this.addDelegate(absoluteDreamNodePath, recipientDid, passphrase);
      }
    } catch (error: any) {
      console.error('RadicleService: Failed to publish to network:', error);

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
   * @returns true if delegate was added, false if already exists
   */
  async addDelegate(dreamNodePath: string, peerDID: string, passphrase?: string): Promise<boolean> {
    if (!await this.isAvailable()) {
      throw new Error('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
    }

    const radCmd = this.getRadCommand();

    // IDEMPOTENCY CHECK: Check if peer is already a delegate (canonical or pending)
    try {
      // Check canonical identity first
      const { stdout } = await execAsync(`"${radCmd}" inspect --identity`, { cwd: dreamNodePath });
      const identity = JSON.parse(stdout);

      if (identity.delegates && Array.isArray(identity.delegates)) {
        if (identity.delegates.includes(peerDID)) {
          console.log(`RadicleService: ${peerDID} is already a delegate (canonical) - skipping`);
          return false; // Already exists in canonical state
        }
      }

      // Check pending revisions - see if there's already an active/accepted revision adding this delegate
      const { stdout: idListOutput } = await execAsync(`"${radCmd}" id list`, { cwd: dreamNodePath });
      const lines = idListOutput.split('\n');

      for (const line of lines) {
        // Look for active or accepted revisions (not redacted/rejected)
        if ((line.includes('active') || line.includes('accepted')) &&
            line.includes('Add peer as equal collaborator')) {
          // Extract revision ID (first column after │)
          const revisionMatch = line.match(/│\s+●\s+([a-f0-9]+)/);
          if (revisionMatch) {
            const revisionId = revisionMatch[1];
            // Check if this revision is trying to add our peer
            const { stdout: showOutput } = await execAsync(`"${radCmd}" id show ${revisionId}`, { cwd: dreamNodePath });
            if (showOutput.includes(peerDID)) {
              console.log(`RadicleService: ${peerDID} already has pending revision ${revisionId} - skipping`);
              return false; // Already has a pending revision
            }
          }
        }
      }
    } catch (inspectError) {
      console.warn(`RadicleService: Could not check existing delegates (will attempt to add):`, inspectError);
    }

    const title = `Add peer as equal collaborator`;
    const description = `Adding ${peerDID} as equal delegate for peer-to-peer collaboration`;

    // Prepare environment with passphrase if provided
    const env = { ...process.env };
    if (passphrase) {
      env.RAD_PASSPHRASE = passphrase;
    }

    try {
      const result = await execAsync(
        `"${radCmd}" id update --delegate "${peerDID}" --threshold 1 --title "${title}" --description "${description}"`,
        { cwd: dreamNodePath, env }
      );
      console.log(`RadicleService: Added ${peerDID} as delegate:`, result.stdout);

      // Note: With threshold=1, the revision is implicitly accepted by the author
      // Radicle automatically applies your verdict when you create the revision
      // The revision will reach quorum and move to "accepted" state automatically
      console.log(`ℹ️ RadicleService: Revision created and implicitly accepted (threshold=1, you are sole delegate)`);

      return true; // Successfully added
    } catch (error: any) {
      // Log full error details for debugging
      console.error(`RadicleService: rad id update failed:`, error);
      console.error(`RadicleService: stderr:`, error.stderr);
      console.error(`RadicleService: stdout:`, error.stdout);
      throw new Error(`Failed to add delegate: ${error.stderr || error.message}`);
    }
  }

  /**
   * Set repository seeding scope to 'followed' for private collaboration
   * @returns true if scope was set, false if already correct
   */
  async setSeedingScope(dreamNodePath: string, radicleId: string, scope: 'all' | 'followed' = 'followed'): Promise<boolean> {
    if (!await this.isAvailable()) {
      throw new Error('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
    }

    const radCmd = this.getRadCommand();

    // IDEMPOTENCY CHECK: Check if seeding policy already exists with correct scope
    try {
      const { stdout: seedListOutput } = await execAsync(`"${radCmd}" seed`, { cwd: dreamNodePath });

      // Parse table output to find this RID's seeding policy
      // Format: "│ rad:z... Name  allow  followed │" or "│ rad:z... Name  allow  all │"
      const lines = seedListOutput.split('\n');
      for (const line of lines) {
        if (line.includes(radicleId)) {
          // Check if the scope in this line matches desired scope
          const hasCorrectScope = line.trim().endsWith(`${scope}│`) || line.includes(`${scope} │`);
          if (hasCorrectScope) {
            console.log(`RadicleService: Seeding scope for ${radicleId} already set to '${scope}' - skipping`);
            return false; // Already correct
          }
          break;
        }
      }
    } catch (listError) {
      console.warn(`RadicleService: Could not check existing seeding scope (will attempt to set):`, listError);
    }

    try {
      // Use --no-fetch to avoid blocking on seed node sync
      // The Radicle node will naturally sync in the background later
      const result = await execAsync(
        `"${radCmd}" seed "${radicleId}" --scope ${scope} --no-fetch`,
        { cwd: dreamNodePath }
      );
      console.log(`RadicleService: Set seeding scope to '${scope}' (no-fetch):`, result.stdout);
      return true; // Successfully set
    } catch (error: any) {
      throw new Error(`Failed to set seeding scope: ${error.message}`);
    }
  }

  /**
   * Strip rad: or did:key: prefix from Radicle identifiers for git URL construction
   */
  private stripRadiclePrefix(id: string): string {
    if (id.startsWith('rad:')) {
      return id.slice(4); // Remove 'rad:'
    }
    if (id.startsWith('did:key:')) {
      return id.slice(8); // Remove 'did:key:'
    }
    return id;
  }

  /**
   * Add a peer's fork as a git remote
   * @returns true if remote was added, false if already exists
   */
  async addPeerRemote(dreamNodePath: string, peerName: string, radicleId: string, peerDID: string): Promise<boolean> {
    // Strip prefixes for git remote URL construction
    const cleanRid = this.stripRadiclePrefix(radicleId);
    const cleanDid = this.stripRadiclePrefix(peerDID);
    const remoteUrl = `rad://${cleanRid}/${cleanDid}`;

    try {
      // IDEMPOTENCY CHECK: Check if remote already exists
      const { stdout: existingRemotes } = await execAsync('git remote', { cwd: dreamNodePath });
      if (existingRemotes.split('\n').includes(peerName)) {
        console.log(`RadicleService: Remote '${peerName}' already exists, skipping`);
        return false; // Already exists
      }

      // Add the remote
      await execAsync(`git remote add "${peerName}" "${remoteUrl}"`, { cwd: dreamNodePath });
      console.log(`RadicleService: Added git remote '${peerName}' -> ${remoteUrl}`);
      return true; // Successfully added
    } catch (error: any) {
      throw new Error(`Failed to add peer remote: ${error.message}`);
    }
  }

  /**
   * Get all git remotes with their URLs
   * @returns Map of remote name -> { fetch: url, push: url }
   */
  async getRemotes(dreamNodePath: string): Promise<Map<string, { fetch: string; push: string }>> {
    try {
      const { stdout } = await execAsync('git remote -v', { cwd: dreamNodePath });
      const remotes = new Map<string, { fetch: string; push: string }>();

      for (const line of stdout.split('\n')) {
        const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
        if (match) {
          const [, name, url, type] = match;
          if (!remotes.has(name)) {
            remotes.set(name, { fetch: '', push: '' });
          }
          const remote = remotes.get(name)!;
          if (type === 'fetch') remote.fetch = url;
          if (type === 'push') remote.push = url;
        }
      }

      return remotes;
    } catch (error: any) {
      throw new Error(`Failed to get remotes: ${error.message}`);
    }
  }

  /**
   * Remove a git remote
   * @returns true if remote was removed, false if didn't exist
   */
  async removeRemote(dreamNodePath: string, remoteName: string): Promise<boolean> {
    try {
      const { stdout: existingRemotes } = await execAsync('git remote', { cwd: dreamNodePath });
      if (!existingRemotes.split('\n').includes(remoteName)) {
        console.log(`RadicleService: Remote '${remoteName}' doesn't exist, skipping removal`);
        return false; // Doesn't exist
      }

      await execAsync(`git remote remove "${remoteName}"`, { cwd: dreamNodePath });
      console.log(`RadicleService: Removed git remote '${remoteName}'`);
      return true; // Successfully removed
    } catch (error: any) {
      throw new Error(`Failed to remove remote: ${error.message}`);
    }
  }

  /**
   * Reconcile git remotes to match desired state (declarative sync)
   * @param dreamNodePath Path to the DreamNode repository
   * @param radicleId RID of the repository
   * @param desiredPeers Map of peer name -> DID for desired state
   * @returns Summary of changes made
   */
  async reconcileRemotes(
    dreamNodePath: string,
    radicleId: string,
    desiredPeers: Map<string, string>
  ): Promise<{ added: number; updated: number; removed: number; unchanged: number }> {
    const result = { added: 0, updated: 0, removed: 0, unchanged: 0 };

    try {
      // Get current remotes
      const currentRemotes = await this.getRemotes(dreamNodePath);

      // Build desired remote URLs (strip prefixes)
      const desiredRemotes = new Map<string, string>();
      const cleanRid = this.stripRadiclePrefix(radicleId);
      for (const [peerName, peerDID] of desiredPeers) {
        const cleanDid = this.stripRadiclePrefix(peerDID);
        desiredRemotes.set(peerName, `rad://${cleanRid}/${cleanDid}`);
      }

      // Find remotes to add, update, or keep
      for (const [peerName, desiredUrl] of desiredRemotes) {
        const current = currentRemotes.get(peerName);

        if (!current) {
          // ADD: Remote doesn't exist
          const did = desiredPeers.get(peerName)!;
          await this.addPeerRemote(dreamNodePath, peerName, radicleId, did);
          result.added++;
          console.log(`🔧 [Reconcile] ADDED remote '${peerName}' -> ${desiredUrl}`);
        } else if (current.fetch !== desiredUrl || current.push !== desiredUrl) {
          // UPDATE: Remote exists but points to wrong DID
          console.log(`🔧 [Reconcile] UPDATE remote '${peerName}': ${current.fetch} -> ${desiredUrl}`);
          await this.removeRemote(dreamNodePath, peerName);
          const did = desiredPeers.get(peerName)!;
          await this.addPeerRemote(dreamNodePath, peerName, radicleId, did);
          result.updated++;
        } else {
          // UNCHANGED: Remote exists and is correct
          result.unchanged++;
          console.log(`✅ [Reconcile] OK remote '${peerName}' -> ${desiredUrl}`);
        }
      }

      // Find remotes to remove (exist but not in desired state)
      for (const [remoteName, remote] of currentRemotes) {
        // Skip 'rad' remote (default Radicle remote) and 'origin' (if exists)
        if (remoteName === 'rad' || remoteName === 'origin') {
          console.log(`✅ [Reconcile] SKIP system remote '${remoteName}'`);
          continue;
        }

        // Skip remotes that don't look like Radicle peer remotes
        if (!remote.fetch.startsWith('rad://')) {
          console.log(`✅ [Reconcile] SKIP non-Radicle remote '${remoteName}'`);
          continue;
        }

        if (!desiredRemotes.has(remoteName)) {
          // REMOVE: Remote exists but not in desired state
          console.log(`🔧 [Reconcile] REMOVE orphaned remote '${remoteName}' (not in liminal-web)`);
          await this.removeRemote(dreamNodePath, remoteName);
          result.removed++;
        }
      }

      return result;
    } catch (error: any) {
      throw new Error(`Failed to reconcile remotes: ${error.message}`);
    }
  }

  /**
   * Get list of peer DIDs seeding a repository (discovered via Radicle routing table)
   * Enables transitive discovery: Alice discovers Bob/Charlie accepted coherence beacon
   * @param repoPath Path to DreamNode repository
   * @returns Array of peer DIDs currently seeding this repo
   */
  async getSeeders(repoPath: string): Promise<string[]> {
    if (!await this.isAvailable()) {
      console.warn('RadicleService: Radicle CLI not available for getSeeders()');
      return [];
    }

    try {
      const radCmd = this.getRadCommand();

      // First, get the RID for this repository
      const radicleId = await this.getRadicleId(repoPath);
      if (!radicleId) {
        console.warn(`RadicleService: Could not get Radicle ID for ${repoPath}`);
        return [];
      }

      // Query the routing table for this RID in JSON format
      // Output format: {"rid":"rad:z...","nid":"z6Mk..."}
      // One JSON object per line, nid is the peer DID (without did:key: prefix)
      const { stdout } = await execAsync(`"${radCmd}" node routing --rid ${radicleId} --json`);

      // Parse JSON lines
      const dids: string[] = [];
      const lines = stdout.split('\n').filter(line => line.trim().length > 0);

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.nid && entry.nid.startsWith('z6Mk')) {
            // Normalize to full did:key: format
            const did = `did:key:${entry.nid}`;
            dids.push(did);
            console.log(`RadicleService: Found seeder: ${did}`);
          }
        } catch (parseError) {
          console.warn(`RadicleService: Could not parse routing table entry: ${line}`);
        }
      }

      console.log(`RadicleService: getSeeders() found ${dids.length} peer(s) seeding ${repoPath}`);
      return dids;
    } catch (error: any) {
      // Non-critical error - repo may not be seeded yet or network issues
      console.warn(`RadicleService: Could not get seeders for ${repoPath}:`, error.message);
      return [];
    }
  }
}
