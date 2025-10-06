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
   * Initialize a DreamNode repository with Radicle
   * @param passphrase Optional passphrase (uses ssh-agent if not provided)
   */
  init(dreamNodePath: string, name?: string, description?: string, passphrase?: string): Promise<void>;

  /**
   * Clone a DreamNode from the Radicle network
   * @param passphrase Optional passphrase (uses ssh-agent if not provided)
   * @returns The name of the cloned DreamNode (derived from Radicle metadata)
   */
  clone(radicleId: string, destinationPath: string, passphrase?: string): Promise<string>;

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
   */
  private isPlatformSupported(): boolean {
    if (this._isPlatformSupported !== null) {
      return this._isPlatformSupported;
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
        console.log(`RadicleService: Found rad command at: ${radPath}`);
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

    const radCmd = this.getRadCommand();

    // Build command with proper flags to bypass TTY requirements
    const args = ['init', '--public', '--default-branch', 'main', '--no-confirm'];
    if (name) {
      args.push('--name', name);
    }
    if (description) {
      args.push('--description', description);
    }

    const command = `"${radCmd}" ${args.join(' ')}`;
    console.log(`RadicleService: Running '${command}' in ${dreamNodePath}`);

    // Prepare environment with passphrase if provided
    const env = { ...process.env };
    if (passphrase) {
      env.RAD_PASSPHRASE = passphrase;
      console.log('RadicleService: Using provided passphrase via RAD_PASSPHRASE');
    } else {
      console.log('RadicleService: No passphrase provided, relying on ssh-agent');
    }

    try {
      const result = await execAsync(command, {
        cwd: dreamNodePath,
        env: env,
      });

      console.log('RadicleService: rad init output:', result.stdout);
      if (result.stderr) {
        console.warn('RadicleService: rad init stderr:', result.stderr);
      }
    } catch (error: any) {
      console.error('RadicleService: rad init failed:', error);

      // Check if error is due to missing passphrase
      if (error.message && error.message.includes('RAD_PASSPHRASE')) {
        throw new Error('Radicle passphrase required. Please configure your passphrase or ensure ssh-agent is running.');
      }

      throw new Error(`Failed to initialize Radicle: ${error.message || 'Unknown error'}`);
    }
  }

  async clone(radicleId: string, destinationPath: string, passphrase?: string): Promise<string> {
    if (!await this.isAvailable()) {
      throw new Error('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
    }

    const radCmd = this.getRadCommand();

    // Prepare environment with passphrase if provided
    const env = { ...process.env };
    if (passphrase) {
      env.RAD_PASSPHRASE = passphrase;
      console.log('RadicleService: Using provided passphrase via RAD_PASSPHRASE');
    } else {
      console.log('RadicleService: No passphrase provided, relying on ssh-agent');
    }

    try {
      // Clone the repository
      console.log(`RadicleService: Running '${radCmd} clone ${radicleId}' in ${destinationPath}`);
      const cloneResult = await execAsync(`"${radCmd}" clone ${radicleId}`, {
        cwd: destinationPath,
        env: env,
      });
      console.log('RadicleService: rad clone output:', cloneResult.stdout);
      if (cloneResult.stderr) {
        console.warn('RadicleService: rad clone stderr:', cloneResult.stderr);
      }

      // Extract the repository name from Radicle metadata
      // The cloned directory name is typically the repo name
      console.log(`RadicleService: Inspecting ${radicleId} for repository name...`);
      const { stdout } = await execAsync(`"${radCmd}" inspect ${radicleId} --field name`, {
        cwd: destinationPath,
        env: env,
      });

      const repoName = stdout.trim();
      console.log(`RadicleService: Determined repository name: ${repoName}`);
      if (!repoName) {
        throw new Error('Could not determine repository name from Radicle metadata');
      }

      return repoName;
    } catch (error: any) {
      console.error('RadicleService: rad clone failed:', error);

      // Check if error is due to missing passphrase
      if (error.message && error.message.includes('RAD_PASSPHRASE')) {
        throw new Error('Radicle passphrase required. Please configure your passphrase or ensure ssh-agent is running.');
      }

      throw new Error(`Failed to clone from Radicle network: ${error.message || 'Unknown error'}`);
    }
  }

  async share(dreamNodePath: string, passphrase?: string): Promise<void> {
    if (!await this.isAvailable()) {
      throw new Error('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
    }

    const radCmd = this.getRadCommand();

    // Prepare environment with passphrase if provided
    const env = { ...process.env };
    if (passphrase) {
      env.RAD_PASSPHRASE = passphrase;
      console.log('RadicleService: Using provided passphrase via RAD_PASSPHRASE');
    } else {
      console.log('RadicleService: No passphrase provided, relying on ssh-agent');
    }

    try {
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
}
