/**
 * Git Operations Service - DreamNode local git operations
 *
 * Handles local git operations on DreamNode repositories with vault path resolution.
 * This service wraps stateless git-utils.ts functions with Obsidian vault context.
 */

const path = require('path');

import { App } from 'obsidian';
import { GitStatus } from '../types/dreamnode';
import {
  getGitStatus as getGitStatusUtil,
  hasUncommittedChanges as hasUncommittedChangesUtil,
  hasStashes as hasStashesUtil,
  hasUnpushedCommits as hasUnpushedCommitsUtil,
  getUnpushedCommitCount as getUnpushedCommitCountUtil,
  stashChanges as stashChangesUtil,
  popStash as popStashUtil,
  commitAllChanges as commitAllChangesUtil,
  openInFinder as openInFinderUtil,
  openInTerminal as openInTerminalUtil,
  runNpmBuild as runNpmBuildUtil
} from './git-utils';

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
    return stashChangesUtil(fullPath);
  }

  /**
   * Pop the most recent stash (if any exists)
   */
  async popStash(repoPath: string): Promise<void> {
    const fullPath = this.getFullPath(repoPath);
    return popStashUtil(fullPath);
  }

  /**
   * Check if a repository has uncommitted changes
   */
  async hasUncommittedChanges(repoPath: string): Promise<boolean> {
    const fullPath = this.getFullPath(repoPath);
    return hasUncommittedChangesUtil(fullPath);
  }

  /**
   * Commit all uncommitted changes with a given message
   * Returns true if changes were committed, false if there was nothing to commit
   */
  async commitAllChanges(repoPath: string, commitMessage: string): Promise<boolean> {
    const fullPath = this.getFullPath(repoPath);
    return commitAllChangesUtil(fullPath, commitMessage);
  }

  /**
   * Check if a repository has any stashes
   */
  async hasStashes(repoPath: string): Promise<boolean> {
    const fullPath = this.getFullPath(repoPath);
    return hasStashesUtil(fullPath);
  }

  /**
   * Check if a repository has unpushed commits (ahead of remote)
   */
  async hasUnpushedCommits(repoPath: string): Promise<boolean> {
    const fullPath = this.getFullPath(repoPath);
    return hasUnpushedCommitsUtil(fullPath);
  }

  /**
   * Get count of unpushed commits (for details)
   */
  async getUnpushedCommitCount(repoPath: string): Promise<number> {
    const fullPath = this.getFullPath(repoPath);
    return getUnpushedCommitCountUtil(fullPath);
  }

  /**
   * Open repository folder in Finder (macOS) or Explorer (Windows)
   */
  async openInFinder(repoPath: string): Promise<void> {
    const fullPath = this.getFullPath(repoPath);
    return openInFinderUtil(fullPath);
  }

  /**
   * Open terminal at repository folder and run claude --continue command
   */
  async openInTerminal(repoPath: string): Promise<void> {
    const fullPath = this.getFullPath(repoPath);
    return openInTerminalUtil(fullPath, 'claude --continue || claude');
  }

  /**
   * Run npm build in a DreamNode repository
   */
  async buildDreamNode(repoPath: string): Promise<void> {
    const fullPath = this.getFullPath(repoPath);
    return runNpmBuildUtil(fullPath);
  }

  /**
   * Get comprehensive git status for a repository
   * Returns full GitStatus object with all status flags and details
   */
  async getGitStatus(repoPath: string): Promise<GitStatus> {
    const fullPath = this.getFullPath(repoPath);
    return getGitStatusUtil(fullPath);
  }
}
