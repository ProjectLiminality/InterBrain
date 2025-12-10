/**
 * Git Utilities - Stateless git command functions
 *
 * All functions take explicit full paths and return results.
 * No state is maintained - the caller is responsible for path resolution.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);

import { GitStatus } from '../types/dreamnode';

// ============================================================================
// REPOSITORY STATUS
// ============================================================================

/**
 * Get comprehensive git status for a repository
 */
export async function getGitStatus(repoPath: string): Promise<GitStatus> {
  try {
    const gitDir = path.join(repoPath, '.git');
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
      const hashResult = await execAsync('git rev-parse HEAD', { cwd: repoPath });
      commitHash = hashResult.stdout.trim();
    } catch {
      // No commits yet
    }

    // Check for uncommitted changes
    const statusResult = await execAsync('git status --porcelain', { cwd: repoPath });
    const hasUncommittedChanges = statusResult.stdout.trim().length > 0;

    // Check for stashed changes
    const stashResult = await execAsync('git stash list', { cwd: repoPath });
    const hasStashedChanges = stashResult.stdout.trim().length > 0;

    // Check for unpushed commits
    let hasUnpushedChanges = false;
    let aheadCount = 0;
    try {
      const statusBranchResult = await execAsync('git status --porcelain=v1 --branch', { cwd: repoPath });
      const branchLine = statusBranchResult.stdout.split('\n')[0];
      const aheadMatch = branchLine.match(/\[ahead (\d+)/);
      if (aheadMatch) {
        aheadCount = parseInt(aheadMatch[1], 10);
        hasUnpushedChanges = aheadCount > 0;
      }
    } catch {
      // No upstream or git error
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
    console.warn(`git-utils: Failed to check git status for ${repoPath}:`, error);
    return {
      hasUncommittedChanges: false,
      hasStashedChanges: false,
      hasUnpushedChanges: false,
      lastChecked: Date.now()
    };
  }
}

/**
 * Check if a repository has uncommitted changes
 */
export async function hasUncommittedChanges(repoPath: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync('git status --porcelain', { cwd: repoPath });
    return stdout.trim().length > 0;
  } catch (error) {
    console.error('git-utils: Failed to check git status:', error);
    return false;
  }
}

/**
 * Check if a repository has any stashes
 */
export async function hasStashes(repoPath: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync('git stash list', { cwd: repoPath });
    return stdout.trim().length > 0;
  } catch (error) {
    console.error('git-utils: Failed to check stashes:', error);
    return false;
  }
}

/**
 * Check if a repository has unpushed commits
 */
export async function hasUnpushedCommits(repoPath: string): Promise<boolean> {
  try {
    const { stdout: branchInfo } = await execAsync('git branch -vv', { cwd: repoPath });
    const currentBranchLine = branchInfo.split('\n').find((line: string) => line.startsWith('*'));

    if (!currentBranchLine || !currentBranchLine.includes('[')) {
      return false;
    }

    const { stdout: aheadCount } = await execAsync('git rev-list --count @{upstream}..HEAD', { cwd: repoPath });
    return parseInt(aheadCount.trim(), 10) > 0;
  } catch {
    return false;
  }
}

/**
 * Get count of unpushed commits
 */
export async function getUnpushedCommitCount(repoPath: string): Promise<number> {
  try {
    const { stdout } = await execAsync('git rev-list --count @{upstream}..HEAD', { cwd: repoPath });
    return parseInt(stdout.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

// ============================================================================
// STASH OPERATIONS
// ============================================================================

/**
 * Stash all uncommitted changes with a message
 */
export async function stashChanges(repoPath: string, message: string = 'InterBrain creator mode'): Promise<void> {
  try {
    const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: repoPath });
    if (!statusOutput.trim()) {
      return; // No changes to stash
    }

    await execAsync('git add -A', { cwd: repoPath });
    await execAsync(`git stash push -m "${message}"`, { cwd: repoPath });
  } catch (error) {
    if (error instanceof Error && (
      error.message.includes('No local changes') ||
      error.message.includes('No tracked files')
    )) {
      return; // Expected - no changes to stash
    }
    throw new Error(`Failed to stash changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Pop the most recent stash if any exists
 */
export async function popStash(repoPath: string): Promise<void> {
  try {
    const { stdout } = await execAsync('git stash list', { cwd: repoPath });
    if (!stdout.trim()) {
      return; // No stashes to pop
    }

    await execAsync('git stash pop', { cwd: repoPath });
  } catch (error) {
    throw new Error(`Failed to pop stash: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================================================
// COMMIT OPERATIONS
// ============================================================================

/**
 * Commit all uncommitted changes with a message
 * Returns true if changes were committed, false if nothing to commit
 */
export async function commitAllChanges(repoPath: string, commitMessage: string): Promise<boolean> {
  try {
    const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: repoPath });
    if (!statusOutput.trim()) {
      return false; // No changes to commit
    }

    await execAsync('git add -A', { cwd: repoPath });
    await execAsync(`git commit -m "${commitMessage}"`, { cwd: repoPath });
    return true;
  } catch (error) {
    if (error instanceof Error && (
      error.message.includes('nothing to commit') ||
      error.message.includes('no changes added')
    )) {
      return false;
    }
    throw new Error(`Failed to commit changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================================================
// REPOSITORY INITIALIZATION
// ============================================================================

/**
 * Initialize a git repository with a template
 */
export async function initRepo(repoPath: string, templatePath?: string): Promise<void> {
  try {
    if (templatePath) {
      await execAsync(`git init --template="${templatePath}"`, { cwd: repoPath });
    } else {
      await execAsync('git init', { cwd: repoPath });
    }
  } catch (error) {
    throw new Error(`Failed to init repo: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if a directory is a git repository
 */
export function isGitRepo(dirPath: string): boolean {
  const gitDir = path.join(dirPath, '.git');
  return fs.existsSync(gitDir);
}

// ============================================================================
// SHELL/FINDER OPERATIONS
// ============================================================================

/**
 * Open repository folder in Finder (macOS)
 */
export async function openInFinder(repoPath: string): Promise<void> {
  try {
    await execAsync(`open "${repoPath}"`);
  } catch (error) {
    throw new Error(`Failed to open in Finder: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Open terminal at repository folder and optionally run a command
 */
export async function openInTerminal(repoPath: string, command?: string): Promise<void> {
  try {
    const script = command
      ? `
        tell application "Terminal"
          set newWindow to do script "cd '${repoPath}'"
          do script "${command}" in newWindow
          activate
        end tell
      `
      : `
        tell application "Terminal"
          do script "cd '${repoPath}'"
          activate
        end tell
      `;

    await execAsync(`osascript -e '${script}'`);
  } catch (error) {
    throw new Error(`Failed to open in Terminal: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================================================
// BUILD OPERATIONS
// ============================================================================

/**
 * Run npm build in a repository
 */
export async function runNpmBuild(repoPath: string): Promise<void> {
  try {
    // Find node/npm paths
    let nodePath = 'node';
    let npmPath = 'npm';

    try {
      const { stdout: nodeStdout } = await execAsync('which node');
      nodePath = nodeStdout.trim() || 'node';
    } catch {
      const commonNodePaths = ['/usr/local/bin/node', '/opt/homebrew/bin/node'];
      for (const testPath of commonNodePaths) {
        if (fs.existsSync(testPath)) {
          nodePath = testPath;
          break;
        }
      }
    }

    try {
      const { stdout: npmStdout } = await execAsync('which npm');
      npmPath = npmStdout.trim() || 'npm';
    } catch {
      const commonPaths = ['/usr/local/bin/npm', '/opt/homebrew/bin/npm'];
      for (const testPath of commonPaths) {
        if (fs.existsSync(testPath)) {
          npmPath = testPath;
          break;
        }
      }
    }

    const nodeBinDir = nodePath.substring(0, nodePath.lastIndexOf('/'));
    const enhancedEnv = {
      ...(globalThis as any).process.env,
      PATH: `${nodeBinDir}:${(globalThis as any).process.env.PATH || ''}`
    };

    await execAsync(`${npmPath} install`, { cwd: repoPath, env: enhancedEnv });
    await execAsync(`${npmPath} run build`, { cwd: repoPath, env: enhancedEnv });
  } catch (error) {
    throw new Error(`Failed to build: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
