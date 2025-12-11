/**
 * Update Management Commands
 *
 * User-facing commands for checking, previewing, and applying updates to DreamNodes.
 * This is the UI/UX layer - actual sync logic lives in social-resonance-filter.
 */

import { Plugin } from 'obsidian';
import { UIService } from '../../core/services/ui-service';
import { getUpdateSummaryService, initializeUpdateSummaryService } from './services/update-summary-service';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { GitSyncService, type CommitInfo } from '../social-resonance-filter/services/git-sync-service';
import {
  type SubmoduleUpdate,
  checkSubmoduleUpdatesFromNetwork,
  updateSubmodulesFromStandalone
} from '../social-resonance-filter/utils/submodule-sync';
import { GitOperationsService } from '../dreamnode/utils/git-operations';
import { UpdatePreviewModal } from './ui/update-preview-modal';

const path = require('path');

export function registerUpdateCommands(plugin: Plugin, uiService: UIService): void {
  const gitSyncService = new GitSyncService(plugin.app);
  const gitOpsService = new GitOperationsService(plugin.app);

  // Check for updates on selected DreamNode
  plugin.addCommand({
    id: 'check-for-updates',
    name: 'Check for Updates',
    callback: async () => {
      const store = useInterBrainStore.getState();
      const selectedNode = store.selectedNode;

      if (!selectedNode) {
        uiService.showError('Please select a DreamNode first');
        return;
      }

      const loadingNotice = uiService.showLoading(`Checking ${selectedNode.name} for updates...`);
      try {
        const result = await gitSyncService.fetchUpdates(selectedNode.repoPath);

        if (result.hasUpdates) {
          store.setNodeUpdateStatus(selectedNode.id, result);
          uiService.showSuccess(`Found ${result.commits.length} update(s) for ${selectedNode.name}`);
        } else {
          store.clearNodeUpdateStatus(selectedNode.id);
          uiService.showSuccess(`${selectedNode.name} is up to date`);
        }
      } catch (error) {
        console.error('Update check failed:', error);
        uiService.showError('Failed to check for updates');
      } finally {
        loadingNotice.hide();
      }
    }
  });

  // Preview updates for selected DreamNode
  plugin.addCommand({
    id: 'preview-updates',
    name: 'Preview Updates for Selected DreamNode',
    callback: async () => {
      const store = useInterBrainStore.getState();
      const selectedNode = store.selectedNode;

      if (!selectedNode) {
        uiService.showError('Please select a DreamNode first');
        return;
      }

      // Always fetch first to ensure we have latest update status (root + submodules)
      const fetchNotice = uiService.showLoading('Checking for updates...');
      let submoduleUpdates: SubmoduleUpdate[] = [];

      // Get vault path for submodule checking
      const adapter = (window as any).app.vault.adapter;
      const vaultPath = adapter.basePath || '';
      const parentPath = path.join(vaultPath, selectedNode.repoPath);

      try {
        // Check root repo for updates
        const fetchResult = await gitSyncService.fetchUpdates(selectedNode.repoPath);
        if (fetchResult.hasUpdates) {
          store.setNodeUpdateStatus(selectedNode.id, fetchResult);
        } else {
          store.clearNodeUpdateStatus(selectedNode.id);
        }

        // Check submodules for updates from their standalone repos
        submoduleUpdates = await checkSubmoduleUpdatesFromNetwork(parentPath, vaultPath);

      } catch (error) {
        console.error('[UpdatePreview] Fetch failed:', error);
        fetchNotice.hide();
        uiService.showError('Failed to check for updates');
        return;
      }
      fetchNotice.hide();

      const updateStatus = store.getNodeUpdateStatus(selectedNode.id);

      // Check if EITHER root has updates OR submodules have updates
      const hasRootUpdates = updateStatus && updateStatus.hasUpdates;
      const hasSubmoduleUpdates = submoduleUpdates && submoduleUpdates.length > 0;

      if (!hasRootUpdates && !hasSubmoduleUpdates) {
        uiService.showInfo(`${selectedNode.name} is up to date`);
        return;
      }

      // If only submodules have updates (no root updates), show simple dialog
      if (!hasRootUpdates && hasSubmoduleUpdates) {
        const submoduleList = submoduleUpdates.map(s => `  - ${s.name}: ${s.commitsAhead} commit(s)`).join('\n');
        const confirmed = await uiService.showConfirmDialog(
          'Submodule Updates Available',
          `${selectedNode.name} has no direct updates, but these submodules have updates:\n\n${submoduleList}\n\nUpdate submodules now?`,
          'Update Submodules',
          'Cancel'
        );

        if (confirmed) {
          const updateNotice = uiService.showLoading('Updating submodules...');
          try {
            const result = await updateSubmodulesFromStandalone(parentPath, vaultPath, submoduleUpdates);
            updateNotice.hide();

            if (result.success) {
              uiService.showSuccess(`Updated ${result.updated.length} submodule(s)`);
              // Trigger vault rescan to update UI
              const { serviceManager } = await import('../../core/services/service-manager');
              await serviceManager.scanVault();
            } else {
              uiService.showError(`Updated ${result.updated.length}, failed: ${result.failed.join(', ')}`);
            }
          } catch (error) {
            updateNotice.hide();
            console.error('[UpdatePreview] Submodule update failed:', error);
            uiService.showError('Failed to update submodules');
          }
        }
        return;
      }

      const loadingNotice = uiService.showLoading('Generating update summary...');
      try {
        // Initialize summary service with API key from settings if available
        const settings = (plugin as any).settings;
        const apiKey = settings?.claudeApiKey;

        if (apiKey) {
          initializeUpdateSummaryService(apiKey);
        }

        const summaryService = getUpdateSummaryService();
        const summary = await summaryService.generateUpdateSummary(updateStatus!);

        // Hide loading notice before showing modal
        loadingNotice.hide();

        // Show modal with update preview
        const modal = new UpdatePreviewModal(
          plugin.app,
          selectedNode.name,
          updateStatus!,
          summary,
          // On Accept
          async () => {
            // Check if this is a read-only repo with divergent branches
            const divergentCheck = await gitSyncService.checkDivergentBranches(selectedNode.repoPath);
            const isReadOnly = await gitSyncService.isReadOnlyRepo(selectedNode.repoPath);

            if (isReadOnly && divergentCheck.hasDivergence) {
              // Show warning dialog for read-only repos with local changes
              const confirmed = await uiService.showConfirmDialog(
                'Read-Only DreamNode - Local Changes Will Be Lost',
                `This is a read-only DreamNode and your local branch has diverged from the remote.\n\n` +
                `Your local commits: ${divergentCheck.localCommits}\n` +
                `Remote commits: ${divergentCheck.remoteCommits}\n\n` +
                `By pulling updates, your local changes will be DISCARDED and replaced with the remote version.\n\n` +
                `Continue?`,
                'Continue and Discard Local Changes',
                'Abort'
              );

              if (!confirmed) {
                return;
              }

              // User confirmed - reset to remote
              const resetNotice = uiService.showLoading(`Resetting ${selectedNode.name} to remote...`);
              try {
                await gitSyncService.resetToRemote(selectedNode.repoPath);
                resetNotice.hide();
              } catch (error) {
                resetNotice.hide();
                console.error('[UpdatePreview] Failed to reset:', error);
                uiService.showError(`Failed to reset: ${error instanceof Error ? error.message : 'Unknown error'}`);
                return;
              }
            }

            const applyNotice = uiService.showLoading(`Updating ${selectedNode.name}...`);
            try {
              // Pull updates - cherry-pick peer commits or fast-forward from upstream
              const commitHashes = updateStatus!.commits.map((c: CommitInfo) => c.hash);
              await gitSyncService.pullUpdates(selectedNode.repoPath, commitHashes);

              // Check for coherence beacons in the commits we just pulled
              applyNotice.hide();
              const checkingNotice = uiService.showLoading('Checking for new relationships...');
              try {
                const beacons = await (plugin as any).coherenceBeaconService.checkCommitsForBeacons(
                  selectedNode.repoPath,
                  updateStatus!.commits
                );
                checkingNotice.hide();

                if (beacons.length > 0) {
                  // Import modal dynamically to avoid circular dependencies
                  const { CoherenceBeaconModal } = await import('../coherence-beacon/ui/coherence-beacon-modal');

                  // Process each beacon sequentially
                  for (const beacon of beacons) {
                    await new Promise<void>((resolve) => {
                      const beaconModal = new CoherenceBeaconModal(
                        plugin.app,
                        beacon,
                        // On Accept - clone the supermodule
                        async () => {
                          const { Notice } = await import('obsidian');
                          try {
                            new Notice(`Cloning ${beacon.title}...`);
                            await (plugin as any).coherenceBeaconService.acceptBeacon(selectedNode.repoPath, beacon);
                            new Notice(`Successfully cloned ${beacon.title}!`);
                          } catch (error) {
                            console.error('Failed to accept beacon:', error);
                            new Notice(`Failed to clone ${beacon.title}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                          } finally {
                            resolve();
                          }
                        },
                        // On Reject - skip this supermodule
                        async () => {
                          const { Notice } = await import('obsidian');
                          await (plugin as any).coherenceBeaconService.rejectBeacon(selectedNode.repoPath, beacon);
                          new Notice(`Skipped ${beacon.title}`);
                          resolve();
                        }
                      );
                      beaconModal.open();
                    });
                  }
                }
              } catch (beaconError) {
                checkingNotice.hide();
                console.error('[UpdatePreview] Error checking beacons:', beaconError);
                // Don't fail the update if beacon check fails
              }

              // If it's the InterBrain node, run build and reload
              if (selectedNode.id === '550e8400-e29b-41d4-a716-446655440000') {
                const buildNotice = uiService.showLoading('Building InterBrain...');
                try {
                  await gitOpsService.buildDreamNode(selectedNode.repoPath);
                  buildNotice.hide();

                  // Auto-reload plugin after build
                  const reloadNotice = uiService.showLoading('Reloading plugin...');
                  try {
                    const plugins = (plugin.app as any).plugins;
                    await plugins.disablePlugin('interbrain');
                    await plugins.enablePlugin('interbrain');
                    reloadNotice.hide();
                    uiService.showSuccess(`InterBrain updated and reloaded!`);
                  } catch (reloadError) {
                    reloadNotice.hide();
                    throw reloadError;
                  }
                } catch (buildError) {
                  buildNotice.hide();
                  throw buildError;
                }
              } else {
                uiService.showSuccess(`Successfully updated ${selectedNode.name}!`);
              }

              // Clear update status
              const store = useInterBrainStore.getState();
              store.clearNodeUpdateStatus(selectedNode.id);
            } catch (error) {
              console.error('[UpdatePreview] Failed to apply update:', error);
              uiService.showError(`Failed to update: ${error instanceof Error ? error.message : 'Unknown error'}`);
            } finally {
              applyNotice.hide();
            }
          },
          // On Reject
          () => {
            uiService.showInfo('Update cancelled');
          }
        );

        modal.open();
      } catch (error) {
        console.error('[UpdatePreview] Error:', error);
        loadingNotice.hide();
        uiService.showError('Failed to generate update preview');
      }
    }
  });

  // Apply updates to selected DreamNode (direct apply without preview)
  plugin.addCommand({
    id: 'apply-updates',
    name: 'Apply Updates to Selected DreamNode',
    callback: async () => {
      const store = useInterBrainStore.getState();
      const selectedNode = store.selectedNode;

      if (!selectedNode) {
        uiService.showError('Please select a DreamNode first');
        return;
      }

      const updateStatus = store.getNodeUpdateStatus(selectedNode.id);
      if (!updateStatus || !updateStatus.hasUpdates) {
        uiService.showInfo(`${selectedNode.name} is up to date`);
        return;
      }

      // Confirm with user
      const confirmed = await uiService.promptForText(
        `Apply ${updateStatus.commits.length} update${updateStatus.commits.length > 1 ? 's' : ''} to ${selectedNode.name}?`,
        `Type "update" to confirm`
      );

      if (confirmed !== 'update') {
        uiService.showInfo('Update cancelled');
        return;
      }

      const loadingNotice = uiService.showLoading(`Updating ${selectedNode.name}...`);
      try {
        // Pull updates
        await gitSyncService.pullUpdates(selectedNode.repoPath);

        // If it's the InterBrain node, run build
        if (selectedNode.id === '550e8400-e29b-41d4-a716-446655440000') {
          const buildNotice = uiService.showLoading('Building InterBrain...');
          try {
            await gitOpsService.buildDreamNode(selectedNode.repoPath);
            buildNotice.hide();
          } catch (buildError) {
            buildNotice.hide();
            throw buildError;
          }
        }

        // Clear update status
        store.clearNodeUpdateStatus(selectedNode.id);

        uiService.showSuccess(`Successfully updated ${selectedNode.name}!`);

        // If InterBrain was updated, suggest reload
        if (selectedNode.id === '550e8400-e29b-41d4-a716-446655440000') {
          uiService.showInfo('InterBrain updated - reload Obsidian to use new version');
        }
      } catch (error) {
        console.error('Failed to apply updates:', error);
        uiService.showError(`Failed to update: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        loadingNotice.hide();
      }
    }
  });
}
