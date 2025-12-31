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
   * Initialize a DreamNode repository with Radicle (private by default)
   * @param passphrase Optional passphrase (uses ssh-agent if not provided)
   * @returns The Radicle ID (RID) if successfully initialized, null otherwise
   */
  init(dreamNodePath: string, name?: string, description?: string, passphrase?: string): Promise<string | null>;

  /**
   * Clone a DreamNode from the Radicle network
   * @param passphrase Optional passphrase (uses ssh-agent if not provided)
   * @param peerNid Optional peer Node ID to clone directly from (for private P2P)
   * @returns Object with repo name and whether it was already cloned
   */
  clone(radicleId: string, destinationPath: string, passphrase?: string, peerNid?: string): Promise<{ repoName: string; alreadyExisted: boolean }>;

  /**
   * Share DreamNode to Radicle network (sync changes)
   * @param passphrase Optional passphrase (uses ssh-agent if not provided)
   * @param recipientDid Optional recipient DID to add as delegate
   */
  share(dreamNodePath: string, passphrase?: string, recipientDid?: string): Promise<void>;

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

  /**
   * Follow a peer's Radicle DID to receive their updates
   * This is ESSENTIAL for bidirectional collaboration
   */
  followPeer(peerDid: string, passphrase?: string, repoPath?: string): Promise<void>;

  /**
   * Add a peer as an equal delegate to a repository
   * Sets threshold to 1 for true peer-to-peer equality
   * @returns true if delegate was added, false if already exists
   */
  addDelegate(dreamNodePath: string, peerDID: string, passphrase?: string): Promise<boolean>;

  /**
   * Set repository seeding scope to 'followed' for private collaboration
   * @returns true if scope was set, false if already correct
   */
  setSeedingScope(dreamNodePath: string, radicleId: string, scope?: 'all' | 'followed'): Promise<boolean>;

  /**
   * Reconcile git remotes to match desired state (declarative sync)
   * @param dreamNodePath Path to the DreamNode repository
   * @param radicleId RID of the repository
   * @param desiredPeers Map of peer name -> DID for desired state
   * @returns Summary of changes made
   */
  reconcileRemotes(
    dreamNodePath: string,
    radicleId: string,
    desiredPeers: Map<string, string>
  ): Promise<{ added: number; updated: number; removed: number; unchanged: number }>;

  /**
   * Trigger public seeding and network sync in the background (fire-and-forget)
   * Does NOT wait for completion - returns immediately
   * Used by "Copy Share Link" to make nodes discoverable without blocking UI
   */
  seedInBackground(dreamNodePath: string, radicleId: string): void;

  /**
   * Get the delegate (owner) DID for a repository
   */
  getRepositoryDelegate(radicleId: string, passphrase?: string): Promise<string | null>;
}

export class RadicleServiceImpl implements RadicleService {
  private _isAvailable: boolean | null = null;
  private _isPlatformSupported: boolean | null = null;
  private _radCommand: string | null = null;

  /**
   * Check if current platform supports Radicle P2P features (macOS/Linux only)
   *
   * Windows Support Status:
   * - Radicle CLI (rad) works on Windows as of v1.3.0
   * - git-remote-rad and radicle-node are not yet available
   * - P2P collaboration features require the full Radicle stack
   * - Local operations (create DreamNodes, dreamweaving) work on Windows
   * - See src/features/social-resonance-filter/docs/platform-support.md for details
   *
   * 🧪 TESTING: Set SIMULATE_WINDOWS=true to test Windows behavior on macOS
   */
  private isPlatformSupported(): boolean {
    if (this._isPlatformSupported !== null) {
      return this._isPlatformSupported;
    }

    // 🧪 TESTING MODE: Simulate Windows to test behavior
    const simulateWindows = process.env.SIMULATE_WINDOWS === 'true';
    if (simulateWindows) {
      console.log('🧪 [TEST MODE] Simulating Windows - Radicle P2P features disabled');
      this._isPlatformSupported = false;
      return false;
    }

    const platform = os.platform();
    const isSupported = platform === 'darwin' || platform === 'linux';

    if (!isSupported && platform === 'win32') {
      console.log('RadicleService: Windows detected - P2P collaboration features not yet available');
      console.log('RadicleService: Local features (DreamNode creation, dreamweaving) work normally');
      console.log('RadicleService: See platform-support.md in social-resonance-filter/docs for details');
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

  async init(dreamNodePath: string, name?: string, description?: string, passphrase?: string): Promise<string | null> {
    if (!await this.isAvailable()) {
      console.warn('RadicleService: Radicle CLI not available, skipping init');
      return null;
    }

    // Ensure Radicle node is running before initializing
    try {
      await this.ensureNodeRunning(passphrase);
    } catch (nodeError) {
      console.warn('RadicleService: Could not ensure node is running:', nodeError);
      // Continue anyway - node might already be running
    }

    const radCmd = this.getRadCommand();

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

    try {
      // Use spawn instead of exec to provide proper stdin (bypasses TTY requirement)
      // IMPORTANT: --name is REQUIRED for non-TTY mode
      // IMPORTANT: --private keeps repo local until explicitly shared
      const { spawn } = require('child_process');
      const repoName = name || require('path').basename(dreamNodePath);

      const spawnArgs = [
        'init',
        dreamNodePath,
        '--private',           // Private = not announced, stays local until share
        '--default-branch', 'main',
        '--no-confirm',
        // NOTE: No --no-seed flag. Repo is auto-seeded so direct peers can fetch.
        // Privacy comes from --private (not announced), not from refusing to serve.
        '--name', repoName,    // REQUIRED for non-TTY mode
      ];
      if (description) {
        spawnArgs.push('--description', description);
      }

      console.log(`RadicleService: Running rad ${spawnArgs.join(' ')}`);

      const spawnPromise = () => new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn(radCmd, spawnArgs, {
          env: env,
          cwd: dreamNodePath,
          stdio: ['pipe', 'pipe', 'pipe']  // Provide stdin pipe
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data: any) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data: any) => {
          stderr += data.toString();
        });

        child.on('close', (code: number | null) => {
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

        child.on('error', (error: Error) => {
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

      // Extract RID from rad init output
      // Expected format: "Repository rad:z... created."
      const ridMatch = result.stdout.match(/rad:z[a-zA-Z0-9]+/);
      if (ridMatch) {
        const radicleId = ridMatch[0];
        console.log(`RadicleService: Captured Radicle ID: ${radicleId}`);
        return radicleId;
      }

      console.warn('RadicleService: Could not extract RID from rad init output');
      return null;
    } catch (error: any) {
      const errorOutput = error.stderr || error.stdout || error.message || '';

      // Check if already initialized in storage - extract RID if possible
      if (errorOutput.includes('reinitialize') && errorOutput.includes('/storage/')) {
        console.log(`RadicleService: Repository exists in Radicle storage`);
        const storageMatch = errorOutput.match(/\/storage\/(z[A-Za-z0-9]+)/);
        if (storageMatch && storageMatch[1]) {
          const radicleId = `rad:${storageMatch[1]}`;
          console.log(`RadicleService: Found existing Radicle ID: ${radicleId}`);
          return radicleId;
        }
      }

      // Check if already initialized normally - try to get existing RID
      if (errorOutput.includes('already initialized')) {
        console.log(`RadicleService: Repository already initialized, attempting to get existing RID`);
        try {
          const existingRid = await this.getRadicleId(dreamNodePath, passphrase);
          if (existingRid) {
            return existingRid;
          }
        } catch {
          // Ignore - will return null
        }
      }

      // Log unexpected errors but don't throw - graceful degradation
      console.warn('RadicleService: rad init failed (non-fatal):', errorOutput || error.message);
      return null;
    }
  }

  /**
   * Check if Radicle node is running
   * Supports multiple Radicle versions (1.0 and 1.5+)
   */
  async isNodeRunning(): Promise<boolean> {
    try {
      const radCmd = this.getRadCommand();
      const { stdout } = await execAsync(`"${radCmd}" node`);

      // Check for multiple output formats for backwards compatibility:
      // - Radicle 1.0: "✓ Node is running."
      // - Radicle 1.5: "✓ Node is running with Node ID z6Mks..."
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

  async clone(radicleId: string, destinationPath: string, passphrase?: string, peerNid?: string): Promise<{ repoName: string; alreadyExisted: boolean }> {
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
      // SEED-RELAYED MODE (Current): Clone from seeds in routing table
      // --scope all: Simplified for private beta - trust model is link-based
      // (Only people you share links with can clone)
      //
      // FUTURE: Use --scope followed for stricter access control when
      // backpropagation UX is refined (recipients add DID to dreamer metadata)
      //
      // NOTE: peerNid parameter is preserved for future DIRECT P2P MODE when
      // Radicle ships NAT hole-punching. Will re-enable --seed flag then.
      // See docs/radicle-architecture.md for dual-mode documentation.
      const cloneCmd = `"${radCmd}" clone ${radicleId} --scope all`;

      // Log the mode we're using
      if (peerNid) {
        console.log(`RadicleService: Running '${cloneCmd}' (seed-relayed mode, peerNid preserved for future direct P2P: ${peerNid})`);
      } else {
        console.log(`RadicleService: Running '${cloneCmd}' (seed-relayed mode, from routing table)`);
      }

      // FUTURE DIRECT P2P MODE (when hole-punching ships):
      // if (peerNid) {
      //   const rawNid = peerNid.replace(/^did:key:/, '');
      //   cloneCmd += ` --seed ${rawNid}`;
      // }
      cloneResult = await execAsync(cloneCmd, {
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

      // Check if error is due to network propagation (no seeds found)
      if (errorOutput.includes('no seeds found') || errorOutput.includes('Target not met')) {
        // This is a temporary network issue - repository is being propagated to public seeds
        throw new Error('NETWORK_PROPAGATION_DELAY');
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

    // POST-CLONE CLEANUP: Strip UUID suffix from directory name if present
    // Radicle backend adds UUID suffix for uniqueness (e.g., "Name-abc1234" → "Name")
    const cleanName = repoName.replace(/-[a-f0-9]{7}$/i, '');
    if (cleanName !== repoName) {
      const oldPath = path.join(destinationPath, repoName);
      const newPath = path.join(destinationPath, cleanName);
      await fs.promises.rename(oldPath, newPath);
      repoName = cleanName;
    }

    // Initialize submodules if any
    try {
      const repoPath = path.join(destinationPath, repoName);
      await execAsync('git submodule update --init --recursive', { cwd: repoPath, env });
    } catch {
      // No submodules or init failed - non-critical
    }

    // Save Radicle ID to .udd file for instant future lookups
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
      const { isPascalCase, pascalCaseToTitle } = await import('../../dreamnode/utils/title-sanitization');

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

        child.stdout?.on('data', (data: any) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data: any) => {
          stderr += data.toString();
        });

        child.on('close', (code: number | null) => {
          console.log('RadicleService: git push output:', stdout);
          if (stderr) console.log('RadicleService: git push stderr:', stderr);

          if (code === 0 || stdout.includes('up to date')) {
            resolve();
          } else {
            reject(new Error(`git push failed with code ${code}`));
          }
        });

        child.on('error', (error: Error) => {
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

        child.stdout?.on('data', (data: any) => {
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

      // STEP 3: Publish to network (use rad publish for proper network announcement)
      console.log(`RadicleService: Publishing to Radicle network (rad publish)...`);
      await new Promise<void>((resolve, reject) => {
        const child = spawn(radCmd, ['publish'], {
          env: env,
          cwd: absoluteDreamNodePath,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data: any) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data: any) => {
          stderr += data.toString();
        });

        child.on('close', (code: number | null) => {
          console.log('RadicleService: rad publish output:', stdout);
          if (stderr) console.log('RadicleService: rad publish stderr:', stderr);

          // Combine stdout and stderr for error checking
          const output = stdout + stderr;

          if (code === 0) {
            console.log('✅ RadicleService: Successfully published to network!');
            resolve();
          } else if (output.includes('already public') || output.includes('No identity updates')) {
            console.log('ℹ️ RadicleService: Repository already public (no changes needed)');
            resolve(); // Not an error
          } else {
            reject(new Error(`rad publish exited with code ${code}`));
          }
        });

        child.on('error', (error: Error) => {
          console.error('RadicleService: rad publish spawn error:', error);
          reject(error);
        });

        child.stdin?.end();
      });

      // STEP 4: Announce to network with inventory for immediate seed discovery
      // --inventory forces full announcement including routing table updates
      console.log(`RadicleService: Announcing repository to network (rad sync --inventory)...`);
      await new Promise<void>((resolve) => {
        const child = spawn(radCmd, ['sync', '--inventory'], {
          env: env,
          cwd: absoluteDreamNodePath,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data: any) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data: any) => {
          stderr += data.toString();
        });

        child.on('close', (code: number | null) => {
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

        child.on('error', (error: Error) => {
          console.warn('RadicleService: rad sync --announce spawn error (not critical):', error);
          resolve(); // Don't fail the whole operation
        });

        child.stdin?.end();
      });

      // STEP 5: Explicitly register repository with local node for seeding
      // DISABLED: This step is not needed in the current workflow context
      // The rad sync --inventory step already handles network announcement
      // and peers will discover the repository through the normal Radicle propagation

      // console.log(`RadicleService: Registering repository with local node (rad seed)...`);
      // try {
      //   const radicleId = await this.getRadicleId(absoluteDreamNodePath);
      //   if (radicleId) {
      //     await new Promise<void>((resolve, reject) => {
      //       const child = spawn(radCmd, ['seed', radicleId, '--scope', 'all'], {
      //         env: env,
      //         cwd: absoluteDreamNodePath,
      //         stdio: ['pipe', 'pipe', 'pipe']
      //       });
      //
      //       let stdout = '';
      //       let stderr = '';
      //
      //       child.stdout?.on('data', (data) => {
      //         stdout += data.toString();
      //       });
      //
      //       child.stderr?.on('data', (data) => {
      //         stderr += data.toString();
      //       });
      //
      //       child.on('close', (code) => {
      //         console.log('RadicleService: rad seed output:', stdout);
      //         if (stderr) console.log('RadicleService: rad seed stderr:', stderr);
      //
      //         // Success cases: exit code 0 OR "already seeding" message
      //         if (code === 0 || stdout.includes('already seeding') || stderr.includes('already seeding')) {
      //           console.log('✅ RadicleService: Repository registered with local node for seeding');
      //           resolve();
      //         } else {
      //           console.warn(`⚠️ RadicleService: rad seed exited with code ${code} (not critical)`);
      //           resolve(); // Don't fail the whole operation
      //         }
      //       });
      //
      //       child.on('error', (error) => {
      //         console.warn('RadicleService: rad seed spawn error (not critical):', error);
      //         resolve(); // Don't fail the whole operation
      //       });
      //
      //       child.stdin?.end();
      //     });
      //   } else {
      //     console.warn(`⚠️ RadicleService: Could not get Radicle ID for seeding (skipping rad seed)`);
      //   }
      // } catch (seedError) {
      //   console.warn(`⚠️ RadicleService: rad seed failed (not critical):`, seedError);
      //   // Don't fail the whole operation if seeding fails
      // }

      // STEP 6: Add recipient as delegate if specified
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
      // Format: "│ rad:z...    Name    allow    all      │"
      // Note: Multiple spaces between columns, ends with scope then spaces then │
      const lines = seedListOutput.split('\n');
      for (const line of lines) {
        // Match lines that START with │ and contain the exact radicleId
        if (line.startsWith('│') && line.includes(radicleId)) {
          // Split by whitespace and get the last meaningful column before │
          const columns = line.trim().replace(/│/g, '').trim().split(/\s+/);
          // Format: [radicleId, Name, allow, scope]
          const currentScope = columns[columns.length - 1];

          if (currentScope === scope) {
            console.log(`RadicleService: Seeding scope for ${radicleId} already set to '${scope}' - skipping`);
            return false; // Already correct
          } else {
            console.log(`RadicleService: Seeding scope for ${radicleId} is '${currentScope}', updating to '${scope}'`);
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
   * Trigger seeding in the background (fire-and-forget)
   * Does NOT wait for completion - returns immediately
   * Used by "Copy Share Link" to ensure node is discoverable via seeds
   *
   * SEED-RELAYED MODE (current):
   * 1. Sets seeding policy to 'all' (simplified for private beta)
   * 2. Announces to network seeds (CRITICAL for discoverability)
   *
   * PRIVATE BETA: Using --scope all for simplified onboarding.
   * Trust model is link-based (only share links with trusted people).
   * FUTURE: Use --scope followed when backpropagation UX is refined.
   * See docs/radicle-architecture.md for dual-mode documentation.
   */
  seedInBackground(dreamNodePath: string, radicleId: string): void {
    // Fire-and-forget async operation
    (async () => {
      try {
        console.log(`🌐 [Background Seed] Starting seed operation for ${radicleId} (scope: all - private beta)...`);
        const radCmd = this.getRadCommand();
        const { spawn } = require('child_process');

        // STEP 0: Publish repo if still private (required for seeds to announce)
        console.log(`🌐 [Background Seed] Ensuring ${radicleId} is public (rad publish)...`);
        await new Promise<void>((resolve) => {
          const child = spawn(radCmd, ['publish'], {
            cwd: dreamNodePath,
            stdio: ['pipe', 'pipe', 'pipe']
          });

          let stdout = '';
          let stderr = '';

          child.stdout?.on('data', (data: any) => {
            stdout += data.toString();
          });

          child.stderr?.on('data', (data: any) => {
            stderr += data.toString();
          });

          child.on('close', (code: number | null) => {
            const output = stdout + stderr;
            if (code === 0) {
              console.log(`✅ [Background Seed] Repository published successfully`);
            } else if (output.includes('already public')) {
              console.log(`ℹ️ [Background Seed] Repository already public`);
            } else {
              console.warn(`⚠️ [Background Seed] rad publish exited with code ${code}: ${output}`);
            }
            resolve(); // Always resolve, never fail
          });

          child.on('error', (error: Error) => {
            console.warn(`⚠️ [Background Seed] rad publish error (non-critical):`, error);
            resolve();
          });

          child.stdin?.end();
        });

        // STEP 1: Run rad seed with --scope all --no-fetch (private beta simplification)
        // --no-fetch: We're announcing, not fetching - skip slow network sync
        // Trust model: link-based (only share links with trusted people)
        await new Promise<void>((resolve) => {
          const child = spawn(radCmd, ['seed', radicleId, '--scope', 'all', '--no-fetch'], {
            cwd: dreamNodePath,
            stdio: ['pipe', 'pipe', 'pipe']
          });

          let stdout = '';
          let stderr = '';

          child.stdout?.on('data', (data: any) => {
            stdout += data.toString();
          });

          child.stderr?.on('data', (data: any) => {
            stderr += data.toString();
          });

          child.on('close', (code: number | null) => {
            const output = stdout + stderr;
            console.log(`[Background Seed] rad seed output:`, stdout);
            if (stderr) console.log(`[Background Seed] rad seed stderr:`, stderr);

            // Check for actual errors (not just non-zero exit)
            const hasError = output.includes('✗ Error') || output.includes('Target not met') || output.includes('timed out');

            if (code === 0 && !hasError) {
              console.log(`✅ [Background Seed] Successfully seeded ${radicleId} (scope: all - private beta)`);
            } else if (output.includes('Inventory updated') || output.includes('already seeding') || output.includes('Seeding policy')) {
              // Partial success - seeding policy set but fetch may have failed
              console.log(`ℹ️ [Background Seed] Seeding policy set for ${radicleId} (fetch skipped or timed out)`);
            } else {
              console.warn(`⚠️ [Background Seed] rad seed issue for ${radicleId}: ${hasError ? 'network timeout' : `code ${code}`}`);
            }
            resolve(); // Always resolve, never fail
          });

          child.on('error', (error: Error) => {
            console.warn(`⚠️ [Background Seed] rad seed error (non-critical):`, error);
            resolve(); // Always resolve, never fail
          });

          child.stdin?.end();
        });

        // STEP 2: SEED-RELAYED MODE - Announce to network seeds
        // This is CRITICAL for peers to discover and clone the repo via seeds
        console.log(`🌐 [Background Seed] Announcing ${radicleId} to network seeds (rad sync --announce)...`);
        await new Promise<void>((resolve) => {
          const child = spawn(radCmd, ['sync', '--announce'], {
            cwd: dreamNodePath,
            stdio: ['pipe', 'pipe', 'pipe']
          });

          let stdout = '';
          let stderr = '';

          child.stdout?.on('data', (data: any) => {
            stdout += data.toString();
          });

          child.stderr?.on('data', (data: any) => {
            stderr += data.toString();
          });

          child.on('close', (code: number | null) => {
            const output = stdout + stderr;
            console.log(`[Background Seed] rad sync --announce output:`, stdout);
            if (stderr) console.log(`[Background Seed] rad sync --announce stderr:`, stderr);

            // Check for actual errors
            const hasError = output.includes('✗ Error') || output.includes('timed out') || output.includes('All seeds timed out');
            const alreadySynced = output.includes('Nothing to announce') || output.includes('already in sync');

            if (code === 0 && !hasError) {
              console.log(`✅ [Background Seed] Successfully announced ${radicleId} to network seeds`);
            } else if (alreadySynced) {
              console.log(`ℹ️ [Background Seed] ${radicleId} already synced with seeds`);
            } else if (output.includes('No seeds found')) {
              console.warn(`⚠️ [Background Seed] No seeds found for ${radicleId} - repo may not be discoverable yet`);
            } else if (hasError) {
              console.warn(`⚠️ [Background Seed] Announce timed out for ${radicleId} (will retry on next sync)`);
            } else {
              console.warn(`⚠️ [Background Seed] rad sync --announce exited with code ${code} (non-critical)`);
            }
            resolve(); // Always resolve, never fail
          });

          child.on('error', (error: Error) => {
            console.warn(`⚠️ [Background Seed] rad sync --announce error (non-critical):`, error);
            resolve(); // Always resolve, never fail
          });

          child.stdin?.end();
        });

      } catch (error) {
        console.warn(`⚠️ [Background Seed] Failed to seed ${radicleId} (non-critical):`, error);
      }
    })();
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
      const lines = stdout.split('\n').filter((line: string) => line.trim().length > 0);

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.nid && entry.nid.startsWith('z6Mk')) {
            // Normalize to full did:key: format
            const did = `did:key:${entry.nid}`;
            dids.push(did);
            console.log(`RadicleService: Found seeder: ${did}`);
          }
        } catch {
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
