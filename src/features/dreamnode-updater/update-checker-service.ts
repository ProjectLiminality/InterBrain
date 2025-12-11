/**
 * Update Checker Service
 *
 * Provides update checking functionality for DreamNodes.
 * Single-node checking is performed via GitSyncService directly in commands.
 * This service is kept for backwards compatibility and potential future batch operations.
 */

import { App } from 'obsidian';
import { GitSyncService, FetchResult } from '../social-resonance-filter/services/git-sync-service';
import { useInterBrainStore } from '../../core/store/interbrain-store';

export class UpdateCheckerService {
  private gitSyncService: GitSyncService;

  constructor(app: App) {
    this.gitSyncService = new GitSyncService(app);
  }

  /**
   * Check updates for a single DreamNode
   */
  async checkDreamNodeForUpdates(nodeId: string, repoPath: string): Promise<FetchResult> {
    console.log(`[UpdateChecker] Checking updates for node: ${nodeId}`);

    const result = await this.gitSyncService.fetchUpdates(repoPath);

    // Store result in Zustand store
    const store = useInterBrainStore.getState();
    if (result.hasUpdates) {
      store.setNodeUpdateStatus(nodeId, result);
    } else {
      store.clearNodeUpdateStatus(nodeId);
    }

    return result;
  }
}

// Singleton instance
let updateCheckerService: UpdateCheckerService | null = null;

export function initializeUpdateCheckerService(app: App): UpdateCheckerService {
  if (!updateCheckerService) {
    updateCheckerService = new UpdateCheckerService(app);
  }
  return updateCheckerService;
}

export function getUpdateCheckerService(): UpdateCheckerService {
  if (!updateCheckerService) {
    throw new Error('UpdateCheckerService not initialized - call initializeUpdateCheckerService first');
  }
  return updateCheckerService;
}
