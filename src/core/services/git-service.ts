/**
 * GitService - Backwards compatibility facade
 *
 * This class delegates to the split services:
 * - GitOperationsService (dreamnode feature) - local git operations
 * - GitSyncService (social-resonance feature) - P2P/remote sync operations
 *
 * New code should import directly from the feature services.
 * This facade exists for backwards compatibility during migration.
 */

import { App } from 'obsidian';
import { GitOperationsService } from '../../features/dreamnode/services/git-operations';
import { GitSyncService, CommitInfo, FetchResult } from '../../features/social-resonance/services/git-sync-service';

// Re-export types for backwards compatibility
export type { CommitInfo, FetchResult };

export class GitService {
  private gitOps: GitOperationsService;
  private gitSync: GitSyncService;

  constructor(app?: App) {
    this.gitOps = new GitOperationsService(app);
    this.gitSync = new GitSyncService(app);
  }

  // === Local Git Operations (delegated to GitOperationsService) ===

  async stashChanges(repoPath: string): Promise<void> {
    return this.gitOps.stashChanges(repoPath);
  }

  async popStash(repoPath: string): Promise<void> {
    return this.gitOps.popStash(repoPath);
  }

  async hasUncommittedChanges(repoPath: string): Promise<boolean> {
    return this.gitOps.hasUncommittedChanges(repoPath);
  }

  async commitAllChanges(repoPath: string, commitMessage: string): Promise<boolean> {
    return this.gitOps.commitAllChanges(repoPath, commitMessage);
  }

  async hasStashes(repoPath: string): Promise<boolean> {
    return this.gitOps.hasStashes(repoPath);
  }

  async hasUnpushedCommits(repoPath: string): Promise<boolean> {
    return this.gitOps.hasUnpushedCommits(repoPath);
  }

  async getUnpushedCommitCount(repoPath: string): Promise<number> {
    return this.gitOps.getUnpushedCommitCount(repoPath);
  }

  async openInFinder(repoPath: string): Promise<void> {
    return this.gitOps.openInFinder(repoPath);
  }

  async openInTerminal(repoPath: string): Promise<void> {
    return this.gitOps.openInTerminal(repoPath);
  }

  async buildDreamNode(repoPath: string): Promise<void> {
    return this.gitOps.buildDreamNode(repoPath);
  }

  // === Remote Sync Operations (delegated to GitSyncService) ===

  async fetchUpdates(repoPath: string): Promise<FetchResult> {
    return this.gitSync.fetchUpdates(repoPath);
  }

  async pullUpdates(repoPath: string, commits?: string[]): Promise<void> {
    return this.gitSync.pullUpdates(repoPath, commits);
  }

  async checkDivergentBranches(repoPath: string): Promise<{ hasDivergence: boolean; localCommits: number; remoteCommits: number }> {
    return this.gitSync.checkDivergentBranches(repoPath);
  }

  async isReadOnlyRepo(repoPath: string): Promise<boolean> {
    return this.gitSync.isReadOnlyRepo(repoPath);
  }

  async resetToRemote(repoPath: string): Promise<void> {
    return this.gitSync.resetToRemote(repoPath);
  }

  async pushToAvailableRemote(repoPath: string, radiclePassphrase?: string): Promise<{ remote: string; type: 'radicle' | 'github' | 'other' | 'dual' }> {
    return this.gitSync.pushToAvailableRemote(repoPath, radiclePassphrase);
  }
}
