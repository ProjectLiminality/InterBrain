// Access Node.js modules directly in Electron context (following GitDreamNodeService pattern)
 
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
 

const execAsync = promisify(exec);

import { App } from 'obsidian';

// Type for accessing file system path from Obsidian vault adapter
interface VaultAdapter {
  path?: string;
  basePath?: string;
}

export class GitService {
  private vaultPath: string = '';
  
  constructor(private app?: App) {
    if (app) {
      this.initializeVaultPath(app);
    }
  }
  
  private initializeVaultPath(app: App): void {
    // Get vault file system path for Node.js fs operations (same as GitDreamNodeService)
    const adapter = app.vault.adapter as VaultAdapter;
    
    // Try different ways to get the vault path
    let vaultPath = '';
    if (typeof adapter.path === 'string') {
      vaultPath = adapter.path;
    } else if (typeof adapter.basePath === 'string') {
      vaultPath = adapter.basePath;
    } else if (adapter.path && typeof adapter.path === 'object') {
      // Sometimes path is an object with properties
       
      vaultPath = (adapter.path as any).path || (adapter.path as any).basePath || '';
    }
    
    this.vaultPath = vaultPath;
  }
  
  private getFullPath(repoPath: string): string {
    if (!this.vaultPath) {
      console.warn('GitService: Vault path not initialized, using relative path');
      return repoPath;
    }
    return path.join(this.vaultPath, repoPath);
  }
  async commitWithAI(nodePath: string): Promise<void> {
    // TODO: Implement AI-assisted git commit
    console.log(`Would commit changes for: ${nodePath}`);
    throw new Error('Git operations not yet implemented');
  }

  async createDreamNode(name: string, type: 'dream' | 'dreamer'): Promise<string> {
    // TODO: Implement git init + initial commit
    console.log(`Would create ${type} node: ${name}`);
    throw new Error('DreamNode creation not yet implemented');
  }

  async weaveDreams(nodeIds: string[]): Promise<string> {
    // TODO: Implement git submodule operations
    console.log(`Would weave nodes: ${nodeIds.join(', ')}`);
    throw new Error('Dream weaving not yet implemented');
  }

  /**
   * Stash all uncommitted changes with a creator mode message
   */
  async stashChanges(repoPath: string): Promise<void> {
    const fullPath = this.getFullPath(repoPath);
    try {
      console.log(`GitService: Stashing changes in ${fullPath}`);
      
      // First check if there are any changes to stash
      const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: fullPath });
      if (!statusOutput.trim()) {
        console.log('GitService: No changes to stash');
        return;
      }
      
      // Add all changes
      await execAsync('git add -A', { cwd: fullPath });
      
      // Then stash with a specific message
      const stashMessage = 'InterBrain creator mode';
      await execAsync(`git stash push -m "${stashMessage}"`, { cwd: fullPath });
      
      console.log(`GitService: Successfully stashed changes in: ${fullPath}`);
    } catch (error) {
      console.error('GitService: Failed to stash changes:', error);
      // Check if error is because there's nothing to stash
      if (error instanceof Error && (
        error.message.includes('No local changes') || 
        error.message.includes('No tracked files')
      )) {
        console.log('GitService: No changes to stash (expected)');
        return;
      }
      throw new Error(`Failed to stash changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Pop the most recent stash (if any exists)
   */
  async popStash(repoPath: string): Promise<void> {
    const fullPath = this.getFullPath(repoPath);
    try {
      console.log(`GitService: Checking for stashes in ${fullPath}`);
      
      // Check if there are any stashes first
      const { stdout } = await execAsync('git stash list', { cwd: fullPath });
      if (!stdout.trim()) {
        console.log('GitService: No stashes to pop');
        return;
      }
      
      console.log(`GitService: Found stashes, popping most recent from ${fullPath}`);
      
      // Pop the stash
      await execAsync('git stash pop', { cwd: fullPath });
      console.log(`GitService: Successfully popped stash in: ${fullPath}`);
    } catch (error) {
      console.error('GitService: Failed to pop stash:', error);
      throw new Error(`Failed to pop stash: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a repository has uncommitted changes
   */
  async hasUncommittedChanges(repoPath: string): Promise<boolean> {
    const fullPath = this.getFullPath(repoPath);
    try {
      const { stdout } = await execAsync('git status --porcelain', { cwd: fullPath });
      return stdout.trim().length > 0;
    } catch (error) {
      console.error('Failed to check git status:', error);
      return false;
    }
  }

  /**
   * Commit all uncommitted changes with a given message
   * Returns true if changes were committed, false if there was nothing to commit
   */
  async commitAllChanges(repoPath: string, commitMessage: string): Promise<boolean> {
    const fullPath = this.getFullPath(repoPath);
    try {
      console.log(`GitService: Committing all changes in ${fullPath}`);

      // First check if there are any changes to commit
      const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: fullPath });
      if (!statusOutput.trim()) {
        console.log('GitService: No changes to commit');
        return false;
      }

      // Add all changes
      await execAsync('git add -A', { cwd: fullPath });

      // Commit with the provided message
      await execAsync(`git commit -m "${commitMessage}"`, { cwd: fullPath });

      console.log(`GitService: Successfully committed changes in: ${fullPath}`);
      return true;
    } catch (error) {
      console.error('GitService: Failed to commit changes:', error);
      // Check if error is because there's nothing to commit
      if (error instanceof Error && (
        error.message.includes('nothing to commit') ||
        error.message.includes('no changes added')
      )) {
        console.log('GitService: No changes to commit (expected)');
        return false;
      }
      throw new Error(`Failed to commit changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a repository has any stashes
   */
  async hasStashes(repoPath: string): Promise<boolean> {
    const fullPath = this.getFullPath(repoPath);
    try {
      const { stdout } = await execAsync('git stash list', { cwd: fullPath });
      return stdout.trim().length > 0;
    } catch (error) {
      console.error('Failed to check stashes:', error);
      return false;
    }
  }

  /**
   * Check if a repository has unpushed commits (ahead of remote)
   */
  async hasUnpushedCommits(repoPath: string): Promise<boolean> {
    const fullPath = this.getFullPath(repoPath);
    try {
      // First check if there's a remote tracking branch
      const { stdout: branchInfo } = await execAsync('git branch -vv', { cwd: fullPath });
      const currentBranchLine = branchInfo.split('\n').find((line: string) => line.startsWith('*'));
      
      if (!currentBranchLine || !currentBranchLine.includes('[')) {
        // No remote tracking branch
        return false;
      }
      
      // Check for unpushed commits using rev-list
      const { stdout: aheadCount } = await execAsync('git rev-list --count @{upstream}..HEAD', { cwd: fullPath });
      const count = parseInt(aheadCount.trim(), 10);
      
      return count > 0;
    } catch (error) {
      // If there's no upstream or other git errors, assume no unpushed commits
      console.log(`GitService: No upstream or git error in ${fullPath}:`, error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  /**
   * Get count of unpushed commits (for details)
   */
  async getUnpushedCommitCount(repoPath: string): Promise<number> {
    const fullPath = this.getFullPath(repoPath);
    try {
      const { stdout } = await execAsync('git rev-list --count @{upstream}..HEAD', { cwd: fullPath });
      return parseInt(stdout.trim(), 10) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Open repository folder in Finder (macOS) or Explorer (Windows)
   */
  async openInFinder(repoPath: string): Promise<void> {
    const fullPath = this.getFullPath(repoPath);
    try {
      console.log(`GitService: Opening ${fullPath} in Finder`);

      // Use macOS 'open' command to reveal the folder in Finder
      await execAsync(`open "${fullPath}"`, { cwd: fullPath });

      console.log(`GitService: Successfully opened ${fullPath} in Finder`);
    } catch (error) {
      console.error('GitService: Failed to open in Finder:', error);
      throw new Error(`Failed to open in Finder: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Open terminal at repository folder and run claude command
   */
  async openInTerminal(repoPath: string): Promise<void> {
    const fullPath = this.getFullPath(repoPath);
    try {
      console.log(`GitService: Opening terminal at ${fullPath} and running claude`);

      // Use osascript to open a new Terminal tab at the specified directory and run claude
      const script = `
        tell application "Terminal"
          do script "cd '${fullPath}' && claude"
          activate
        end tell
      `;

      await execAsync(`osascript -e '${script}'`);

      console.log(`GitService: Successfully opened terminal at ${fullPath} and started claude`);
    } catch (error) {
      console.error('GitService: Failed to open in Terminal:', error);
      throw new Error(`Failed to open in Terminal: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetch updates from remote without merging
   * Returns metadata about new commits available
   */
  async fetchUpdates(repoPath: string): Promise<FetchResult> {
    const fullPath = this.getFullPath(repoPath);
    try {
      console.log(`GitService: Fetching updates for ${fullPath}`);

      // First check if there's a remote configured
      const { stdout: remoteOutput } = await execAsync('git remote', { cwd: fullPath });
      if (!remoteOutput.trim()) {
        return {
          hasUpdates: false,
          commits: [],
          filesChanged: 0,
          insertions: 0,
          deletions: 0
        };
      }

      // Determine which remote to fetch from (avoid broken Radicle remotes if CLI not available)
      let remoteName = 'origin'; // Default
      const remotes = remoteOutput.trim().split('\n');

      try {
        // Try to get the upstream remote for current branch
        const { stdout: upstreamOutput } = await execAsync('git rev-parse --abbrev-ref --symbolic-full-name @{upstream}', { cwd: fullPath });
        const upstream = upstreamOutput.trim();
        if (upstream && upstream !== '@{upstream}') {
          // Extract remote name from refs/remotes/<remote>/<branch>
          const remoteMatch = upstream.match(/^([^/]+)\//);
          if (remoteMatch) {
            const detectedRemote = remoteMatch[1];

            // Skip 'rad' remote if Radicle CLI is not available
            if (detectedRemote === 'rad') {
              const { serviceManager } = await import('./service-manager');
              const radicleService = serviceManager.getRadicleService();
              const isRadicleAvailable = await radicleService.isAvailable();

              if (!isRadicleAvailable) {
                console.log(`GitService: Skipping 'rad' remote - Radicle CLI not available`);
                // Fall through to manual selection below
              } else {
                remoteName = detectedRemote;
              }
            } else {
              remoteName = detectedRemote;
            }
          }
        }
      } catch {
        // No upstream configured, continue to manual selection
      }

      // If we're still on 'origin' (default), try to pick a better remote
      if (remoteName === 'origin' && !remotes.includes('origin')) {
        // Try common remotes in order (skip 'rad' if Radicle unavailable)
        if (remotes.includes('github')) {
          remoteName = 'github';
        } else if (remotes.length > 0) {
          // Pick first non-rad remote
          remoteName = remotes.find((r: string) => r !== 'rad') || remotes[0];
        }
      }

      // Fetch from specific remote (not all remotes)
      console.log(`GitService: Fetching from remote: ${remoteName}`);

      // If fetching from Radicle, enhance PATH with git-remote-rad helper
      const execOptions: any = { cwd: fullPath };
      if (remoteName === 'rad') {
        const homeDir = (globalThis as any).process?.env?.HOME || '';
        const radicleGitHelperPaths = [
          `${homeDir}/.radicle/bin`,
          '/usr/local/bin',
          '/opt/homebrew/bin'
        ];

        const enhancedPath = radicleGitHelperPaths.join(':') + ':' + ((globalThis as any).process?.env?.PATH || '');
        execOptions.env = {
          ...(globalThis as any).process.env,
          PATH: enhancedPath
        };
        console.log(`GitService: Enhanced PATH for Radicle fetch: ${enhancedPath}`);
      }

      try {
        await execAsync(`git fetch ${remoteName}`, execOptions);
      } catch (fetchError: any) {
        // Handle fetch errors gracefully (remote not found, network issues, etc.)
        const errorMsg = fetchError.message || '';
        const errorOutput = fetchError.stderr || fetchError.stdout || '';
        console.log(`GitService: Fetch failed from ${remoteName}:`, errorMsg);
        if (errorOutput) {
          console.log(`GitService: Fetch error output:`, errorOutput);
        }

        if (errorMsg.includes('Repository not found') ||
            errorMsg.includes('remote-rad') ||
            errorMsg.includes('Could not resolve host')) {
          console.log(`GitService: Treating as no updates (remote unavailable or no access)`);
          return {
            hasUpdates: false,
            commits: [],
            filesChanged: 0,
            insertions: 0,
            deletions: 0
          };
        }
        // Re-throw other unexpected errors
        throw fetchError;
      }

      // ALSO fetch from peer remotes (for pure p2p collaboration)
      // Peer remotes have URLs like rad://RID/DID (with DID suffix)
      console.log(`GitService: Checking for peer remotes...`);
      const { stdout: remoteVerbose } = await execAsync('git remote -v', { cwd: fullPath });
      const peerRemotes = new Set<string>();

      for (const line of remoteVerbose.split('\n')) {
        const match = line.match(/^(\S+)\s+rad:\/\/\S+\/did:key:\S+/);
        if (match) {
          const peerName = match[1];
          peerRemotes.add(peerName);
        }
      }

      if (peerRemotes.size > 0) {
        console.log(`GitService: Found ${peerRemotes.size} peer remote(s): ${Array.from(peerRemotes).join(', ')}`);
        for (const peerName of peerRemotes) {
          try {
            console.log(`GitService: Fetching from peer ${peerName}...`);
            await execAsync(`git fetch ${peerName}`, execOptions);
            console.log(`GitService: Successfully fetched from ${peerName}`);
          } catch (peerFetchError: any) {
            console.warn(`GitService: Failed to fetch from peer ${peerName}:`, peerFetchError.message);
            // Continue with other peers even if one fails
          }
        }
      } else {
        console.log(`GitService: No peer remotes found`);
      }

      // Check current branch
      const { stdout: branchOutput } = await execAsync('git branch --show-current', { cwd: fullPath });
      const currentBranch = branchOutput.trim();
      console.log(`[GitService] Current branch: ${currentBranch}`);

      // Check upstream tracking branch
      try {
        const { stdout: upstreamOutput } = await execAsync(`git rev-parse --abbrev-ref ${currentBranch}@{upstream}`, { cwd: fullPath });
        const upstream = upstreamOutput.trim();
        console.log(`[GitService] Upstream tracking: ${upstream}`);
      } catch {
        console.log(`[GitService] No upstream tracking branch configured`);
      }

      // For pure p2p: Check for updates from ALL peer branches, not just upstream
      // Build list of refs to check: upstream + all peer main branches
      const refsToCheck: string[] = [];

      // Add upstream (canonical rad/main)
      try {
        const { stdout: upstreamRef } = await execAsync(`git rev-parse --abbrev-ref ${currentBranch}@{upstream}`, { cwd: fullPath });
        if (upstreamRef.trim()) {
          refsToCheck.push(upstreamRef.trim());
        }
      } catch {
        // No upstream, that's ok
      }

      // Add all peer branches (Martina/main, Bob/main, etc.)
      for (const peerName of peerRemotes) {
        refsToCheck.push(`${peerName}/${currentBranch}`);
      }

      console.log(`[GitService] Checking for updates from: ${refsToCheck.join(', ')}`);

      // Check each ref for new commits and track source
      const commits: CommitInfo[] = [];
      for (const ref of refsToCheck) {
        try {
          const { stdout } = await execAsync(
            `git log HEAD..${ref} --format="%H%x00%an%x00%ae%x00%at%x00%s%x00%b%x00"`,
            { cwd: fullPath }
          );
          if (stdout.trim()) {
            console.log(`[GitService] Found updates from ${ref}`);

            // Parse commits from this ref
            const commitBlocks = stdout.trim().split('\x00\n').filter((block: string) => block.trim());

            for (const block of commitBlocks) {
              const parts = block.split('\x00');
              const hash = parts[0] || '';
              const author = parts[1] || 'Unknown';
              const email = parts[2] || '';
              const timestamp = parseInt(parts[3] || '0', 10);
              const subject = parts[4] || 'No subject';
              const body = parts[5] || '';

              commits.push({
                hash,
                author,
                email,
                timestamp,
                subject,
                body: body.trim(),
                source: ref // Track which ref (peer) this commit came from
              });
            }
          }
        } catch {
          // Ref might not exist, skip it
          console.log(`[GitService] No commits from ${ref} (may not exist)`);
        }
      }

      console.log('[GitService] Parsed commits from all refs:', commits.length);

      if (commits.length === 0) {
        console.log('[GitService] No updates from any peer or upstream');
        return {
          hasUpdates: false,
          commits: [],
          filesChanged: 0,
          insertions: 0,
          deletions: 0
        };
      }

      console.log('[GitService] Commits with sources:', commits);

      // Get diff stats
      const { stdout: statsOutput } = await execAsync(
        'git diff --shortstat HEAD @{upstream}',
        { cwd: fullPath }
      );

      // Parse stats like: "12 files changed, 450 insertions(+), 200 deletions(-)"
      const filesMatch = statsOutput.match(/(\d+) files? changed/);
      const insertMatch = statsOutput.match(/(\d+) insertions?/);
      const deleteMatch = statsOutput.match(/(\d+) deletions?/);

      return {
        hasUpdates: true,
        commits,
        filesChanged: filesMatch ? parseInt(filesMatch[1], 10) : 0,
        insertions: insertMatch ? parseInt(insertMatch[1], 10) : 0,
        deletions: deleteMatch ? parseInt(deleteMatch[1], 10) : 0
      };
    } catch (error) {
      console.error('GitService: Failed to fetch updates:', error);
      // Return no updates on error (remote might not exist, network issue, etc.)
      return {
        hasUpdates: false,
        commits: [],
        filesChanged: 0,
        insertions: 0,
        deletions: 0
      };
    }
  }

  /**
   * Pull updates from remote (merge fetched changes)
   * Uses regular git pull (fetch + merge) to support Radicle's peer-to-peer workflow
   * In Radicle, divergent branches are normal and should be merged, not rejected
   */
  async pullUpdates(repoPath: string): Promise<void> {
    const fullPath = this.getFullPath(repoPath);
    try {
      console.log(`GitService: Pulling updates for ${fullPath}`);

      // Enhance PATH for Radicle git-remote-rad helper
      const homeDir = (globalThis as any).process?.env?.HOME || '';
      const radicleGitHelperPaths = [
        `${homeDir}/.radicle/bin`,
        '/usr/local/bin',
        '/opt/homebrew/bin'
      ];

      const enhancedPath = radicleGitHelperPaths.join(':') + ':' + ((globalThis as any).process?.env?.PATH || '');
      const execOptions = {
        cwd: fullPath,
        env: {
          ...(globalThis as any).process.env,
          PATH: enhancedPath
        }
      };

      // Use git pull with --no-rebase to support Radicle's merge-based collaboration
      // This explicitly tells git to merge (not rebase) when branches diverge
      await execAsync('git pull --no-rebase', execOptions);
      console.log(`GitService: Successfully pulled updates in: ${fullPath}`);
    } catch (error) {
      console.error('GitService: Failed to pull updates:', error);
      throw new Error(`Failed to pull updates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if branches have diverged (local and remote have different commits)
   * Note: In Radicle p2p workflow, divergence is normal and gets resolved via merge
   */
  async checkDivergentBranches(repoPath: string): Promise<{ hasDivergence: boolean; localCommits: number; remoteCommits: number }> {
    const fullPath = this.getFullPath(repoPath);
    try {
      // Get current branch
      const { stdout: branchOutput } = await execAsync('git branch --show-current', { cwd: fullPath });
      const currentBranch = branchOutput.trim();

      if (!currentBranch) {
        return { hasDivergence: false, localCommits: 0, remoteCommits: 0 };
      }

      // Try to get upstream tracking branch (e.g., rad/main, origin/main, github/main)
      let upstream: string;
      try {
        const { stdout: upstreamOutput } = await execAsync(`git rev-parse --abbrev-ref ${currentBranch}@{upstream}`, { cwd: fullPath });
        upstream = upstreamOutput.trim();
      } catch {
        // No upstream tracking branch configured - not an error in Radicle
        // This can happen with fresh clones or repos without remotes
        console.log(`GitService: No upstream tracking branch for ${currentBranch}, skipping divergence check`);
        return { hasDivergence: false, localCommits: 0, remoteCommits: 0 };
      }

      // Count commits ahead/behind using upstream tracking branch
      const { stdout } = await execAsync(`git rev-list --left-right --count ${upstream}...HEAD`, { cwd: fullPath });
      const [remoteCommits, localCommits] = stdout.trim().split('\t').map(Number);

      const hasDivergence = localCommits > 0 && remoteCommits > 0;

      return { hasDivergence, localCommits, remoteCommits };
    } catch (error) {
      console.error('GitService: Failed to check divergent branches:', error);
      // If check fails, assume no divergence to allow pull
      return { hasDivergence: false, localCommits: 0, remoteCommits: 0 };
    }
  }

  /**
   * Check if repository is read-only (GitHub-only without push access)
   */
  async isReadOnlyRepo(repoPath: string): Promise<boolean> {
    const fullPath = this.getFullPath(repoPath);
    try {
      // Check for remotes
      const { stdout: remotesOutput } = await execAsync('git remote -v', { cwd: fullPath });

      // If has Radicle remote, it's not read-only
      if (remotesOutput.includes('rad://') || remotesOutput.includes('rad\t')) {
        return false;
      }

      // If no GitHub remote, not read-only
      const hasGitHub = remotesOutput.includes('github.com');
      if (!hasGitHub) {
        return false;
      }

      // Extract repository owner from GitHub URL
      const githubMatch = remotesOutput.match(/github\.com[:/]([^/]+)\/([^/\s.]+)/);
      if (!githubMatch) {
        return false;
      }

      const repoOwner = githubMatch[1];

      // Check authenticated GitHub user
      try {
        const { stdout: ghUser } = await execAsync('gh api user -q .login 2>&1', { cwd: fullPath });
        const currentUser = ghUser.trim();

        if (!currentUser) {
          // Not authenticated - assume read-only
          return true;
        }

        // Read-only if user doesn't own the repo
        return repoOwner !== currentUser;
      } catch {
        // gh command failed - assume read-only
        return true;
      }
    } catch (error) {
      console.error('GitService: Failed to check read-only status:', error);
      return false; // Fail open
    }
  }

  /**
   * Reset local branch to match remote (discard local commits)
   */
  async resetToRemote(repoPath: string): Promise<void> {
    const fullPath = this.getFullPath(repoPath);
    try {
      console.log(`GitService: Resetting ${fullPath} to remote`);

      // Get current branch
      const { stdout: branchOutput } = await execAsync('git branch --show-current', { cwd: fullPath });
      const currentBranch = branchOutput.trim();

      if (!currentBranch) {
        throw new Error('Not on a branch');
      }

      // Reset to origin
      await execAsync(`git reset --hard origin/${currentBranch}`, { cwd: fullPath });
      console.log(`GitService: Successfully reset to origin/${currentBranch}`);
    } catch (error) {
      console.error('GitService: Failed to reset to remote:', error);
      throw new Error(`Failed to reset to remote: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Run npm build in a DreamNode repository
   */
  async buildDreamNode(repoPath: string): Promise<void> {
    const fullPath = this.getFullPath(repoPath);
    try {
      console.log(`GitService: Running build for ${fullPath}`);

      // Find node path first (npm requires node in PATH)
      let nodePath = 'node';
      try {
        const { stdout } = await execAsync('which node');
        nodePath = stdout.trim() || 'node';
      } catch {
        // Fallback to common locations if 'which' fails
        const commonNodePaths = [
          '/usr/local/bin/node',
          '/opt/homebrew/bin/node',
          `${(globalThis as any).process?.env?.HOME}/.nvm/versions/node/*/bin/node`
        ];

        for (const testPath of commonNodePaths) {
          try {
            await execAsync(`test -f ${testPath}`);
            nodePath = testPath;
            break;
          } catch {
            continue;
          }
        }
      }

      // Find npm path (needed because Electron/Obsidian doesn't inherit full shell PATH)
      let npmPath = 'npm';
      try {
        const { stdout } = await execAsync('which npm');
        npmPath = stdout.trim() || 'npm';
      } catch {
        // Fallback to common locations if 'which' fails
        const commonPaths = [
          '/usr/local/bin/npm',
          '/opt/homebrew/bin/npm',
          `${(globalThis as any).process?.env?.HOME}/.nvm/versions/node/*/bin/npm`
        ];

        for (const testPath of commonPaths) {
          try {
            await execAsync(`test -f ${testPath}`);
            npmPath = testPath;
            break;
          } catch {
            continue;
          }
        }
      }

      // Extract bin directory from node path to add to PATH
      const nodeBinDir = nodePath.substring(0, nodePath.lastIndexOf('/'));
      const enhancedEnv = {
        ...(globalThis as any).process.env,
        PATH: `${nodeBinDir}:${(globalThis as any).process.env.PATH || ''}`
      };

      console.log(`GitService: Using node at: ${nodePath}`);
      console.log(`GitService: Using npm at: ${npmPath}`);
      console.log(`GitService: Enhanced PATH: ${enhancedEnv.PATH}`);

      await execAsync(`${npmPath} run build`, { cwd: fullPath, env: enhancedEnv });
      console.log(`GitService: Successfully built: ${fullPath}`);
    } catch (error) {
      console.error('GitService: Failed to build:', error);
      throw new Error(`Failed to build: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Detect available git remote and push to it intelligently
   * Strategy:
   * - If both Radicle (rad) and GitHub (github) exist: Push to BOTH
   * - Otherwise: Priority is Radicle → GitHub → origin → first available
   *
   * Radicle: Full collaboration (push/pull)
   * GitHub: Publishing layer (push only)
   */
  async pushToAvailableRemote(repoPath: string, radiclePassphrase?: string): Promise<{ remote: string; type: 'radicle' | 'github' | 'other' | 'dual' }> {
    const fullPath = this.getFullPath(repoPath);

    try {
      console.log(`\n🔍 [GitService] ===== PUSH TO NETWORK DEBUG =====`);
      console.log(`📂 [GitService] Full path: ${fullPath}`);

      // Check git status first
      const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: fullPath });
      const hasUncommittedChanges = !!statusOutput.trim();
      console.log(`📊 [GitService] Git status:\n${statusOutput || '  (no changes)'}`);

      // If there are uncommitted changes, commit them first
      if (hasUncommittedChanges) {
        console.log(`⚠️ [GitService] Found uncommitted changes - committing before push...`);

        // FIRST: Check if any submodules have internal uncommitted changes
        // In --porcelain format, submodule changes show as " M <path>" (space + M)
        // We need to verify these are actually submodules by checking .gitmodules
        const potentialSubmoduleChanges = statusOutput
          .split('\n')
          .filter(line => line.startsWith(' M '))
          .map(line => line.trim().substring(2).trim()); // Extract path from " M Square"

        console.log(`🔍 [GitService] Found ${potentialSubmoduleChanges.length} potential submodule changes: ${potentialSubmoduleChanges.join(', ')}`);

        if (potentialSubmoduleChanges.length > 0) {
          // Parse .gitmodules to verify which paths are actually submodules
          const gitmodulesPath = path.join(fullPath, '.gitmodules');
          let submodulePaths: string[] = [];

          try {
            const fs = require('fs').promises;
            const gitmodulesContent = await fs.readFile(gitmodulesPath, 'utf-8');

            // Extract all submodule paths
            const lines = gitmodulesContent.split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('path =')) {
                const submodulePath = trimmed.split('=')[1].trim();
                submodulePaths.push(submodulePath);
              }
            }

            console.log(`📦 [GitService] Submodule paths from .gitmodules: ${submodulePaths.join(', ')}`);
          } catch (error: any) {
            console.log(`⚠️ [GitService] No .gitmodules file found or couldn't read it`);
          }

          // Filter to only actual submodules
          const submoduleChanges = potentialSubmoduleChanges.filter(path =>
            submodulePaths.includes(path)
          );

          console.log(`📦 [GitService] Confirmed ${submoduleChanges.length} submodule(s) with internal changes: ${submoduleChanges.join(', ')}`);

        if (submoduleChanges.length > 0) {
          console.log(`📦 [GitService] Processing ${submoduleChanges.length} submodule commit(s)...`);

          try {
            // For each confirmed submodule with changes, commit inside it first
            for (const submodulePath of submoduleChanges) {
              const fullSubmodulePath = path.join(fullPath, submodulePath);

              console.log(`📦 [GitService] Committing changes in submodule: ${submodulePath}`);

              // Stage all changes in submodule
              await execAsync('git add -A', { cwd: fullSubmodulePath });

              // Commit in submodule
              const timestamp = new Date().toISOString();
              await execAsync(`git commit -m "Auto-commit submodule changes (${timestamp})"`, { cwd: fullSubmodulePath });

              console.log(`✅ [GitService] Submodule ${submodulePath} committed`);
            }
          } catch (submoduleError: any) {
            console.warn(`⚠️ [GitService] Could not process submodules: ${submoduleError.message}`);
            console.warn(`   Continuing with parent commit...`);
          }
        }
        } // Close the outer if statement

        // Stage all changes (including updated submodule pointers)
        await execAsync('git add -A', { cwd: fullPath });

        // Commit with AI or fallback message
        try {
          // Try to use AI commit (if available)
          const { GitService } = await import('./git-service');
          const gitService = new GitService(this.app);
          await gitService.commitWithAI(repoPath);
          console.log(`✅ [GitService] Changes committed with AI message`);
        } catch (aiError) {
          // Fallback: Simple commit message
          console.log(`ℹ️ [GitService] AI commit failed, using fallback message`);
          try {
            const timestamp = new Date().toISOString();
            const result = await execAsync(`git commit -m "Auto-commit before push (${timestamp})"`, { cwd: fullPath });
            console.log(`✅ [GitService] Changes committed with fallback message`);
            console.log(`   Commit output: ${result.stdout}`);
          } catch (commitError: any) {
            console.error(`❌ [GitService] Git commit failed:`, commitError);
            console.error(`   stderr: ${commitError.stderr || 'none'}`);
            console.error(`   stdout: ${commitError.stdout || 'none'}`);
            throw new Error(`Failed to commit changes: ${commitError.message}`);
          }
        }
      }

      // Check current branch
      const { stdout: branchOutput } = await execAsync('git branch --show-current', { cwd: fullPath });
      const currentBranch = branchOutput.trim();
      console.log(`🌿 [GitService] Current branch: ${currentBranch}`);

      // Get all configured remotes
      const { stdout: remotesOutput } = await execAsync('git remote -v', { cwd: fullPath });
      console.log(`🌐 [GitService] Configured remotes:\n${remotesOutput}`);

      const { stdout: remoteListOutput } = await execAsync('git remote', { cwd: fullPath });
      const remotes = remoteListOutput.trim().split('\n').filter((r: string) => r);

      if (remotes.length === 0) {
        console.log(`⚠️ [GitService] No remotes found - initializing Radicle...`);

        // Auto-initialize with Radicle if no remotes exist
        const serviceManager = await import('./service-manager');
        const radicleService = serviceManager.serviceManager.getRadicleService();

        if (!await radicleService.isAvailable()) {
          throw new Error('No git remotes configured and Radicle CLI not available. Please install Radicle or set up GitHub.');
        }

        // Initialize as Radicle repository (no passphrase - rely on ssh-agent)
        const path = require('path');
        const dirName = path.basename(fullPath);
        console.log(`🔧 [GitService] Initializing ${dirName} as Radicle repository...`);
        await radicleService.init(fullPath, dirName, undefined, undefined);
        console.log(`✅ [GitService] Radicle initialized!`);

        // Re-fetch remotes after initialization
        const { stdout: newRemoteList } = await execAsync('git remote', { cwd: fullPath });
        remotes.length = 0;
        remotes.push(...newRemoteList.trim().split('\n').filter((r: string) => r));
      }

      const hasRadicle = remotes.includes('rad');
      const hasGitHub = remotes.includes('github');
      const hasOrigin = remotes.includes('origin');

      // DUAL REMOTE MODE: If both Radicle and GitHub exist, push to BOTH
      if (hasRadicle && hasGitHub) {
        console.log(`\n🌐 [GitService] DUAL REMOTE MODE: Found both Radicle and GitHub`);
        console.log(`📡 [GitService] Strategy: Radicle (collaboration) + GitHub (publishing)`);

        // Push to Radicle first (collaboration layer)
        console.log(`\n🚀 [GitService] [1/2] Pushing to Radicle...`);
        const serviceManager = await import('./service-manager');
        const radicleService = serviceManager.serviceManager.getRadicleService();
        await radicleService.share(fullPath, radiclePassphrase);
        console.log(`✅ [GitService] Radicle sync complete!`);

        // Then push to GitHub (publishing layer)
        console.log(`\n🚀 [GitService] [2/2] Pushing to GitHub...`);
        const { stdout: ghPushOutput, stderr: ghPushError } = await execAsync(`git push github ${currentBranch}`, { cwd: fullPath });
        console.log(`📤 [GitService] GitHub push stdout:\n${ghPushOutput || '(empty)'}`);
        if (ghPushError) {
          console.log(`⚠️ [GitService] GitHub push stderr:\n${ghPushError}`);
        }
        console.log(`✅ [GitService] GitHub push complete!`);

        console.log(`\n🎉 [GitService] DUAL PUSH COMPLETE: Radicle + GitHub`);
        return { remote: 'rad + github', type: 'dual' };
      }

      // SINGLE REMOTE MODE: Priority-based selection
      // Priority 1: Radicle only
      if (hasRadicle) {
        console.log(`\n🚀 [GitService] Found Radicle remote - using RadicleService.share()`);
        const serviceManager = await import('./service-manager');
        const radicleService = serviceManager.serviceManager.getRadicleService();
        await radicleService.share(fullPath, radiclePassphrase);
        console.log(`✅ [GitService] Radicle sync complete!`);
        return { remote: 'rad', type: 'radicle' };
      }

      // Priority 2: GitHub only
      if (hasGitHub) {
        console.log(`\n🚀 [GitService] Found GitHub remote - pushing to github ${currentBranch}`);
        const { stdout: pushOutput, stderr: pushError } = await execAsync(`git push github ${currentBranch}`, { cwd: fullPath });
        console.log(`📤 [GitService] Push stdout:\n${pushOutput || '(empty)'}`);
        if (pushError) {
          console.log(`⚠️ [GitService] Push stderr:\n${pushError}`);
        }
        console.log(`✅ [GitService] GitHub push complete!`);
        return { remote: 'github', type: 'github' };
      }

      // Priority 3: origin (could be GitHub or other)
      if (hasOrigin) {
        try {
          const { stdout: originUrl } = await execAsync('git remote get-url origin', { cwd: fullPath });
          const isGitHub = originUrl.includes('github.com');

          console.log(`\n🚀 [GitService] Found origin remote (${isGitHub ? 'GitHub' : 'other'}): ${originUrl.trim()}`);

          // Skip GitHub HTTPS URLs that would require interactive auth
          if (isGitHub && originUrl.startsWith('https://')) {
            console.log(`⚠️ [GitService] Skipping GitHub HTTPS remote (requires authentication)`);
            throw new Error('GitHub HTTPS remote requires authentication - skipping');
          }

          console.log(`🚀 [GitService] Pushing to origin ${currentBranch}...`);
          const { stdout: pushOutput, stderr: pushError } = await execAsync(`git push origin ${currentBranch}`, { cwd: fullPath });
          console.log(`📤 [GitService] Push stdout:\n${pushOutput || '(empty)'}`);
          if (pushError) {
            console.log(`⚠️ [GitService] Push stderr:\n${pushError}`);
          }
          console.log(`✅ [GitService] Origin push complete!`);
          return { remote: 'origin', type: isGitHub ? 'github' : 'other' };
        } catch (error) {
          console.error('❌ [GitService] Failed to push to origin:', error);
          // Fall through to try other remotes
        }
      }

      // Fallback: Try remaining remotes in order, skipping problematic ones
      console.log(`\n🔍 [GitService] Trying remaining remotes in order...`);

      for (const remote of remotes) {
        try {
          // Check remote URL to skip HTTPS GitHub
          const { stdout: remoteUrl } = await execAsync(`git remote get-url ${remote}`, { cwd: fullPath });
          const isGitHubHttps = remoteUrl.includes('github.com') && remoteUrl.startsWith('https://');

          if (isGitHubHttps) {
            console.log(`⚠️ [GitService] Skipping ${remote} (GitHub HTTPS requires auth): ${remoteUrl.trim()}`);
            continue;
          }

          console.log(`\n🚀 [GitService] Trying remote: ${remote} (${remoteUrl.trim()})`);
          const { stdout: pushOutput, stderr: pushError } = await execAsync(`git push ${remote} ${currentBranch}`, { cwd: fullPath });
          console.log(`📤 [GitService] Push stdout:\n${pushOutput || '(empty)'}`);
          if (pushError) {
            console.log(`⚠️ [GitService] Push stderr:\n${pushError}`);
          }
          console.log(`✅ [GitService] Push complete to ${remote}!`);

          const isGitHub = remoteUrl.includes('github.com');
          return { remote, type: isGitHub ? 'github' : 'other' };
        } catch (error) {
          console.warn(`⚠️ [GitService] Failed to push to ${remote}, trying next...`, error);
          continue;
        }
      }

      // If we get here, all remotes failed
      throw new Error('No pushable remotes available (all remotes require authentication or failed)');

    } catch (error) {
      console.error('❌ [GitService] Failed to push to remote:', error);
      if (error instanceof Error) {
        console.error('❌ [GitService] Error details:', {
          message: error.message,
          stack: error.stack
        });
      }
      throw new Error(`Failed to push changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Information about a single commit
 */
export interface CommitInfo {
  hash: string;
  author: string;
  email: string;
  timestamp: number;
  subject: string;
  body: string;
  source?: string; // The ref this commit came from (e.g., "Martina/main", "Bob/main", "rad/main")
}

/**
 * Result of fetching updates from remote
 */
export interface FetchResult {
  hasUpdates: boolean;
  commits: CommitInfo[];
  filesChanged: number;
  insertions: number;
  deletions: number;
}