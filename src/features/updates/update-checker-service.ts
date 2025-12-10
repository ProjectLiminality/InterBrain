/**
 * Update Checker Service
 *
 * Automatically fetches updates for all DreamNodes on plugin load
 * Runs in background without blocking UI
 * Stores update status in Zustand store for visual indicators
 */

import { App } from 'obsidian';
import { GitSyncService, FetchResult } from '../social-resonance/services/git-sync-service';
import { useInterBrainStore } from '../../core/store/interbrain-store';

export class UpdateCheckerService {
  private gitSyncService: GitSyncService;
  private isRunning: boolean = false;

  constructor(app: App) {
    this.gitSyncService = new GitSyncService(app);
  }

  /**
   * Check for updates across all real DreamNodes
   * Runs in parallel for performance
   */
  async checkAllDreamNodesForUpdates(): Promise<void> {
    if (this.isRunning) {
      console.log('[UpdateChecker] Already running, skipping duplicate check');
      return;
    }

    this.isRunning = true;
    console.log('[UpdateChecker] Starting update check for all DreamNodes...');

    try {
      const store = useInterBrainStore.getState();
      const dreamNodesList = Array.from(store.dreamNodes.values());

      if (dreamNodesList.length === 0) {
        console.log('[UpdateChecker] No DreamNodes found');
        return;
      }

      // Run fetch operations in parallel for performance
      const fetchPromises = dreamNodesList.map(async (nodeData) => {
        const node = nodeData.node;
        try {
          const result = await this.gitSyncService.fetchUpdates(node.repoPath);

          // Store result in Zustand store
          if (result.hasUpdates) {
            console.log(`[UpdateChecker] ✨ Updates available for ${node.name}: ${result.commits.length} new commits`);
            store.setNodeUpdateStatus(node.id, result);
          } else {
            // Clear any existing update status
            store.clearNodeUpdateStatus(node.id);
          }

          return { nodeId: node.id, result };
        } catch (error) {
          console.error(`[UpdateChecker] Failed to check ${node.name}:`, error);
          return { nodeId: node.id, result: null };
        }
      });

      const results = await Promise.all(fetchPromises);

      const updatesAvailable = results.filter(r => r.result?.hasUpdates).length;
      console.log(`[UpdateChecker] ✅ Update check complete: ${updatesAvailable}/${dreamNodesList.length} nodes have updates`);
    } finally {
      this.isRunning = false;
    }
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
