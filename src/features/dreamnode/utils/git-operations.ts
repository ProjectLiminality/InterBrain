/**
 * Git Operations Service - DreamNode local git operations
 *
 * Handles local git operations on DreamNode repositories:
 * - Stash/pop for creator mode
 * - Commit changes
 * - Status checks (uncommitted, unpushed, stashes)
 * - Open in Finder/Terminal
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);

import { App } from 'obsidian';
import { GitStatus } from '../types/dreamnode';

// Type for accessing file system path from Obsidian vault adapter
interface VaultAdapter {
  path?: string;
  basePath?: string;
}

export class GitOperationsService {
  private vaultPath: string = '';

  constructor(private app?: App) {
    if (app) {
      this.initializeVaultPath(app);
    }
  }

  private initializeVaultPath(app: App): void {
    const adapter = app.vault.adapter as VaultAdapter;

    let vaultPath = '';
    if (typeof adapter.path === 'string') {
      vaultPath = adapter.path;
    } else if (typeof adapter.basePath === 'string') {
      vaultPath = adapter.basePath;
    } else if (adapter.path && typeof adapter.path === 'object') {
      vaultPath = (adapter.path as any).path || (adapter.path as any).basePath || '';
    }

    this.vaultPath = vaultPath;
  }

  private getFullPath(repoPath: string): string {
    if (!this.vaultPath) {
      console.warn('GitOperationsService: Vault path not initialized, using relative path');
      return repoPath;
    }
    return path.join(this.vaultPath, repoPath);
  }

  /**
   * Stash all uncommitted changes with a creator mode message
   */
  async stashChanges(repoPath: string): Promise<void> {
    const fullPath = this.getFullPath(repoPath);
    try {
      console.log(`GitOperationsService: Stashing changes in ${fullPath}`);

      const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: fullPath });
      if (!statusOutput.trim()) {
        console.log('GitOperationsService: No changes to stash');
        return;
      }

      await execAsync('git add -A', { cwd: fullPath });
      const stashMessage = 'InterBrain creator mode';
      await execAsync(`git stash push -m "${stashMessage}"`, { cwd: fullPath });

      console.log(`GitOperationsService: Successfully stashed changes in: ${fullPath}`);
    } catch (error) {
      console.error('GitOperationsService: Failed to stash changes:', error);
      if (error instanceof Error && (
        error.message.includes('No local changes') ||
        error.message.includes('No tracked files')
      )) {
        console.log('GitOperationsService: No changes to stash (expected)');
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
      console.log(`GitOperationsService: Checking for stashes in ${fullPath}`);

      const { stdout } = await execAsync('git stash list', { cwd: fullPath });
      if (!stdout.trim()) {
        console.log('GitOperationsService: No stashes to pop');
        return;
      }

      console.log(`GitOperationsService: Found stashes, popping most recent from ${fullPath}`);
      await execAsync('git stash pop', { cwd: fullPath });
      console.log(`GitOperationsService: Successfully popped stash in: ${fullPath}`);
    } catch (error) {
      console.error('GitOperationsService: Failed to pop stash:', error);
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
      console.log(`GitOperationsService: Committing all changes in ${fullPath}`);

      const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: fullPath });
      if (!statusOutput.trim()) {
        console.log('GitOperationsService: No changes to commit');
        return false;
      }

      await execAsync('git add -A', { cwd: fullPath });
      await execAsync(`git commit -m "${commitMessage}"`, { cwd: fullPath });

      console.log(`GitOperationsService: Successfully committed changes in: ${fullPath}`);
      return true;
    } catch (error) {
      console.error('GitOperationsService: Failed to commit changes:', error);
      if (error instanceof Error && (
        error.message.includes('nothing to commit') ||
        error.message.includes('no changes added')
      )) {
        console.log('GitOperationsService: No changes to commit (expected)');
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
      const { stdout: branchInfo } = await execAsync('git branch -vv', { cwd: fullPath });
      const currentBranchLine = branchInfo.split('\n').find((line: string) => line.startsWith('*'));

      if (!currentBranchLine || !currentBranchLine.includes('[')) {
        return false;
      }

      const { stdout: aheadCount } = await execAsync('git rev-list --count @{upstream}..HEAD', { cwd: fullPath });
      const count = parseInt(aheadCount.trim(), 10);

      return count > 0;
    } catch (error) {
      console.log(`GitOperationsService: No upstream or git error in ${fullPath}:`, error instanceof Error ? error.message : 'Unknown error');
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
      console.log(`GitOperationsService: Opening ${fullPath} in Finder`);
      await execAsync(`open "${fullPath}"`, { cwd: fullPath });
      console.log(`GitOperationsService: Successfully opened ${fullPath} in Finder`);
    } catch (error) {
      console.error('GitOperationsService: Failed to open in Finder:', error);
      throw new Error(`Failed to open in Finder: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Open terminal at repository folder and run claude --continue command
   */
  async openInTerminal(repoPath: string): Promise<void> {
    const fullPath = this.getFullPath(repoPath);
    try {
      console.log(`GitOperationsService: Opening terminal at ${fullPath} and running claude --continue`);

      const script = `
        tell application "Terminal"
          set newWindow to do script "cd '${fullPath}'"
          do script "claude --continue || claude" in newWindow
          activate
        end tell
      `;

      await execAsync(`osascript -e '${script}'`);

      console.log(`GitOperationsService: Successfully opened terminal at ${fullPath} and started claude --continue`);
    } catch (error) {
      console.error('GitOperationsService: Failed to open in Terminal:', error);
      throw new Error(`Failed to open in Terminal: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Run npm build in a DreamNode repository
   */
  async buildDreamNode(repoPath: string): Promise<void> {
    const fullPath = this.getFullPath(repoPath);
    try {
      console.log(`GitOperationsService: Running build for ${fullPath}`);

      // Find node path first (npm requires node in PATH)
      let nodePath = 'node';
      try {
        const { stdout } = await execAsync('which node');
        nodePath = stdout.trim() || 'node';
      } catch {
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

      // Find npm path
      let npmPath = 'npm';
      try {
        const { stdout } = await execAsync('which npm');
        npmPath = stdout.trim() || 'npm';
      } catch {
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

      console.log(`GitOperationsService: Using node at: ${nodePath}`);
      console.log(`GitOperationsService: Using npm at: ${npmPath}`);
      console.log(`GitOperationsService: Enhanced PATH: ${enhancedEnv.PATH}`);

      // Run npm install first
      console.log(`GitOperationsService: Running npm install for ${fullPath}...`);
      await execAsync(`${npmPath} install`, { cwd: fullPath, env: enhancedEnv });
      console.log(`GitOperationsService: npm install completed`);

      // Then run the build
      await execAsync(`${npmPath} run build`, { cwd: fullPath, env: enhancedEnv });
      console.log(`GitOperationsService: Successfully built: ${fullPath}`);
    } catch (error) {
      console.error('GitOperationsService: Failed to build:', error);
      throw new Error(`Failed to build: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get comprehensive git status for a repository
   * Returns full GitStatus object with all status flags and details
   */
  async getGitStatus(repoPath: string): Promise<GitStatus> {
    const fullPath = this.getFullPath(repoPath);

    try {
      // Check if git repository exists
      const gitDir = path.join(fullPath, '.git');
      if (!fs.existsSync(gitDir)) {
        return {
          hasUncommittedChanges: false,
          hasStashedChanges: false,
          hasUnpushedChanges: false,
          lastChecked: Date.now()
        };
      }

      // Get current commit hash
      let commitHash: string | undefined;
      try {
        const hashResult = await execAsync('git rev-parse HEAD', { cwd: fullPath });
        commitHash = hashResult.stdout.trim();
      } catch {
        // No commits yet
        console.log(`GitOperationsService: No commits yet in ${repoPath}`);
      }

      // Check for uncommitted changes
      const statusResult = await execAsync('git status --porcelain', { cwd: fullPath });
      const hasUncommittedChanges = statusResult.stdout.trim().length > 0;

      // Check for stashed changes
      const stashResult = await execAsync('git stash list', { cwd: fullPath });
      const hasStashedChanges = stashResult.stdout.trim().length > 0;

      // Check for unpushed commits using git status --branch
      let hasUnpushedChanges = false;
      let aheadCount = 0;
      try {
        const statusBranchResult = await execAsync('git status --porcelain=v1 --branch', { cwd: fullPath });
        const branchLine = statusBranchResult.stdout.split('\n')[0];

        // Look for "ahead N" in the branch line
        const aheadMatch = branchLine.match(/\[ahead (\d+)/);
        if (aheadMatch) {
          aheadCount = parseInt(aheadMatch[1], 10);
          hasUnpushedChanges = aheadCount > 0;
        }
      } catch (error) {
        // No upstream or git error
        console.log(`GitOperationsService: Git status error for ${repoPath}:`, error instanceof Error ? error.message : 'Unknown error');
      }

      // Build details if any status flags are set
      let details;
      if (hasUncommittedChanges || hasStashedChanges || hasUnpushedChanges || commitHash) {
        const statusLines = statusResult.stdout.trim().split('\n').filter((line: string) => line.length > 0);
        const staged = statusLines.filter((line: string) => line.charAt(0) !== ' ' && line.charAt(0) !== '?').length;
        const unstaged = statusLines.filter((line: string) => line.charAt(1) !== ' ').length;
        const untracked = statusLines.filter((line: string) => line.startsWith('??')).length;
        const stashCount = hasStashedChanges ? stashResult.stdout.trim().split('\n').length : 0;

        details = { staged, unstaged, untracked, stashCount, aheadCount, commitHash };
      }

      return {
        hasUncommittedChanges,
        hasStashedChanges,
        hasUnpushedChanges,
        lastChecked: Date.now(),
        details
      };

    } catch (error) {
      console.warn(`GitOperationsService: Failed to check git status for ${repoPath}:`, error);
      return {
        hasUncommittedChanges: false,
        hasStashedChanges: false,
        hasUnpushedChanges: false,
        lastChecked: Date.now()
      };
    }
  }
}
