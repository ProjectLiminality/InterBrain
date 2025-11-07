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
          const remoteMatch = upstream.match(/^([^\/]+)\//);
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
          remoteName = remotes.find(r => r !== 'rad') || remotes[0];
        }
      }

      // Fetch from specific remote (not all remotes)
      console.log(`GitService: Fetching from remote: ${remoteName}`);
      try {
        await execAsync(`git fetch ${remoteName}`, { cwd: fullPath });
      } catch (fetchError: any) {
        // Handle fetch errors gracefully (remote not found, network issues, etc.)
        const errorMsg = fetchError.message || '';
        if (errorMsg.includes('Repository not found') ||
            errorMsg.includes('remote-rad') ||
            errorMsg.includes('Could not resolve host')) {
          console.log(`GitService: Fetch failed (${errorMsg.split('\n')[0]}) - treating as no updates`);
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

      // Check if there are new commits (compare HEAD with @{upstream})
      // Use %x00 (null byte) as delimiter to handle multiline commit messages
      const { stdout: logOutput } = await execAsync(
        'git log HEAD..@{upstream} --format="%H%x00%an%x00%ae%x00%at%x00%s%x00%b%x00"',
        { cwd: fullPath }
      );

      console.log('[GitService] Raw git log output:', logOutput);

      if (!logOutput.trim()) {
        return {
          hasUpdates: false,
          commits: [],
          filesChanged: 0,
          insertions: 0,
          deletions: 0
        };
      }

      // Parse commits - split by double null byte (between commits)
      const commitBlocks = logOutput.trim().split('\x00\n').filter((block: string) => block.trim());
      console.log('[GitService] Found commit blocks:', commitBlocks.length);

      const commits: CommitInfo[] = commitBlocks.map((block: string) => {
        const parts = block.split('\x00');
        console.log('[GitService] Parsing commit block parts:', parts.length, parts);

        const hash = parts[0] || '';
        const author = parts[1] || 'Unknown';
        const email = parts[2] || '';
        const timestamp = parseInt(parts[3] || '0', 10);
        const subject = parts[4] || 'No subject';
        const body = parts[5] || '';

        return {
          hash,
          author,
          email,
          timestamp,
          subject,
          body: body.trim()
        };
      });

      console.log('[GitService] Parsed commits:', commits);

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
   */
  async pullUpdates(repoPath: string): Promise<void> {
    const fullPath = this.getFullPath(repoPath);
    try {
      console.log(`GitService: Pulling updates for ${fullPath}`);
      await execAsync('git pull', { cwd: fullPath });
      console.log(`GitService: Successfully pulled updates in: ${fullPath}`);
    } catch (error) {
      console.error('GitService: Failed to pull updates:', error);
      throw new Error(`Failed to pull updates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Run npm build in a DreamNode repository
   */
  async buildDreamNode(repoPath: string): Promise<void> {
    const fullPath = this.getFullPath(repoPath);
    try {
      console.log(`GitService: Running build for ${fullPath}`);

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
          `${process.env.HOME}/.nvm/versions/node/*/bin/npm`
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

      console.log(`GitService: Using npm at: ${npmPath}`);
      await execAsync(`${npmPath} run build`, { cwd: fullPath });
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
  async pushToAvailableRemote(repoPath: string): Promise<{ remote: string; type: 'radicle' | 'github' | 'other' | 'dual' }> {
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

        // Stage all changes
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
          const timestamp = new Date().toISOString();
          await execAsync(`git commit -m "Auto-commit before push (${timestamp})"`, { cwd: fullPath });
          console.log(`✅ [GitService] Changes committed with fallback message`);
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
        throw new Error('No git remotes configured. Please set up GitHub or Radicle first.');
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
        await radicleService.share(fullPath);
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
        await radicleService.share(fullPath);
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

          console.log(`\n🚀 [GitService] Found origin remote (${isGitHub ? 'GitHub' : 'other'}) - pushing to origin ${currentBranch}`);
          const { stdout: pushOutput, stderr: pushError } = await execAsync(`git push origin ${currentBranch}`, { cwd: fullPath });
          console.log(`📤 [GitService] Push stdout:\n${pushOutput || '(empty)'}`);
          if (pushError) {
            console.log(`⚠️ [GitService] Push stderr:\n${pushError}`);
          }
          console.log(`✅ [GitService] Origin push complete!`);
          return { remote: 'origin', type: isGitHub ? 'github' : 'other' };
        } catch (error) {
          console.error('❌ [GitService] Failed to get origin URL:', error);
          throw new Error('Failed to detect origin remote URL');
        }
      }

      // Fallback: Use first available remote
      const firstRemote = remotes[0];
      console.log(`\n🚀 [GitService] Using first available remote: ${firstRemote}`);
      const { stdout: pushOutput, stderr: pushError } = await execAsync(`git push ${firstRemote} ${currentBranch}`, { cwd: fullPath });
      console.log(`📤 [GitService] Push stdout:\n${pushOutput || '(empty)'}`);
      if (pushError) {
        console.log(`⚠️ [GitService] Push stderr:\n${pushError}`);
      }
      console.log(`✅ [GitService] Push complete!`);
      return { remote: firstRemote, type: 'other' };

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