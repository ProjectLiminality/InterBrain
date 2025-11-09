/**
 * Update Management Commands
 *
 * Commands for checking, previewing, and applying updates to DreamNodes
 */

import { Plugin } from 'obsidian';
import { UIService } from '../services/ui-service';
import { getUpdateCheckerService } from '../services/update-checker-service';
import { getUpdateSummaryService, initializeUpdateSummaryService } from '../services/update-summary-service';
import { useInterBrainStore } from '../store/interbrain-store';
import { GitService } from '../services/git-service';
import { UpdatePreviewModal } from '../ui/update-preview-modal';

const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * Check if submodules have updates from their standalone network versions
 * Workflow: Alice updates Circle (standalone) → shares to network →
 *           Alice runs "Check for Updates" on Cylinder → sees Circle submodule has updates
 */
async function checkSubmoduleUpdatesFromNetwork(
  selectedNode: any,
  gitService: GitService,
  store: any,
  uiService: UIService
): Promise<void> {
  try {
    const adapter = (window as any).app.vault.adapter;
    const vaultPath = adapter.basePath || '';
    const parentPath = path.join(vaultPath, selectedNode.repoPath);

    // Parse .gitmodules to find submodules
    const gitmodulesPath = path.join(parentPath, '.gitmodules');
    try {
      await fs.access(gitmodulesPath);
    } catch {
      // No .gitmodules file - no submodules to check
      return;
    }

    const gitmodulesContent = await fs.readFile(gitmodulesPath, 'utf-8');
    const submodules = parseGitmodules(gitmodulesContent);

    if (submodules.length === 0) {
      return;
    }

    console.log(`[SubmoduleUpdates] Checking ${submodules.length} submodules for updates...`);

    // Check each submodule for updates from standalone version
    for (const submodule of submodules) {
      const submodulePath = path.join(parentPath, submodule.path);
      const standalonePath = path.join(vaultPath, submodule.name);

      // Check if both standalone and submodule exist
      try {
        await fs.access(standalonePath);
        await fs.access(submodulePath);
      } catch {
        console.log(`[SubmoduleUpdates] Standalone or submodule ${submodule.name} not found - skipping`);
        continue;
      }

      // Compare commit hashes: standalone vs submodule
      try {
        const standaloneHead = await execAsync('git rev-parse HEAD', { cwd: standalonePath });
        const submoduleHead = await execAsync('git rev-parse HEAD', { cwd: submodulePath });

        const standaloneCommit = standaloneHead.stdout.trim();
        const submoduleCommit = submoduleHead.stdout.trim();

        if (standaloneCommit !== submoduleCommit) {
          // Check if standalone is ahead of submodule
          try {
            const { stdout: commitsAhead } = await execAsync(
              `git rev-list --count ${submoduleCommit}..${standaloneCommit}`,
              { cwd: standalonePath }
            );

            const numCommitsAhead = parseInt(commitsAhead.trim());

            if (numCommitsAhead > 0) {
              console.log(`[SubmoduleUpdates] ${submodule.name} standalone is ${numCommitsAhead} commits ahead of submodule`);

              // Show notification about submodule being behind
              uiService.showInfo(`${submodule.name} (submodule) is ${numCommitsAhead} commit(s) behind standalone version`);
            }
          } catch (error) {
            console.warn(`[SubmoduleUpdates] Could not compare commits for ${submodule.name}:`, error);
          }
        }
      } catch (error) {
        console.warn(`[SubmoduleUpdates] Failed to check ${submodule.name}:`, error);
      }
    }
  } catch (error) {
    console.error('[SubmoduleUpdates] Error checking submodules:', error);
  }
}

/**
 * Parse .gitmodules file to extract submodule information
 */
function parseGitmodules(content: string): Array<{path: string, url: string, name: string}> {
  const submodules: Array<{path: string, url: string, name: string}> = [];
  const lines = content.split('\n');

  let currentSubmodule: any = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Start of new submodule section
    if (trimmed.startsWith('[submodule ')) {
      if (currentSubmodule && currentSubmodule.path && currentSubmodule.url) {
        submodules.push(currentSubmodule);
      }
      const nameMatch = trimmed.match(/\[submodule "([^"]+)"\]/);
      currentSubmodule = {
        name: nameMatch ? nameMatch[1] : '',
        path: '',
        url: ''
      };
    }
    // Path entry
    else if (trimmed.startsWith('path = ') && currentSubmodule) {
      currentSubmodule.path = trimmed.substring(7).trim();
    }
    // URL entry
    else if (trimmed.startsWith('url = ') && currentSubmodule) {
      currentSubmodule.url = trimmed.substring(6).trim();

      // Extract name from Radicle URL if not already set
      if (!currentSubmodule.name && currentSubmodule.url.includes('rad://')) {
        // For Radicle URLs, the name should match the standalone repo name
        // We'll infer it from the path since that's how we clone them
        currentSubmodule.name = path.basename(currentSubmodule.path);
      }
    }
  }

  // Don't forget the last submodule
  if (currentSubmodule && currentSubmodule.path && currentSubmodule.url) {
    submodules.push(currentSubmodule);
  }

  return submodules;
}

export function registerUpdateCommands(plugin: Plugin, uiService: UIService): void {
  const gitService = new GitService(plugin.app);

  // Check for updates (manual trigger)
  plugin.addCommand({
    id: 'check-for-updates',
    name: 'Check for Updates',
    callback: async () => {
      const loadingNotice = uiService.showLoading('Checking for updates...');
      try {
        const updateChecker = getUpdateCheckerService();
        await updateChecker.checkAllDreamNodesForUpdates();

        const store = useInterBrainStore.getState();
        const updateCount = store.updateStatus.size;

        if (updateCount === 0) {
          uiService.showSuccess('All DreamNodes are up to date');
        } else {
          uiService.showSuccess(`Found updates for ${updateCount} DreamNode${updateCount > 1 ? 's' : ''}`);
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
      console.log('[UpdatePreview] Command triggered');
      const store = useInterBrainStore.getState();
      const selectedNode = store.selectedNode;

      if (!selectedNode) {
        console.log('[UpdatePreview] No node selected');
        uiService.showError('Please select a DreamNode first');
        return;
      }

      console.log('[UpdatePreview] Selected node:', selectedNode.name, selectedNode.id);

      // Always fetch first to ensure we have latest update status (root + submodules)
      const fetchNotice = uiService.showLoading('Checking for updates...');
      try {
        // Check root repo for updates
        const fetchResult = await gitService.fetchUpdates(selectedNode.repoPath);
        if (fetchResult.hasUpdates) {
          store.setNodeUpdateStatus(selectedNode.id, fetchResult);
        } else {
          store.clearNodeUpdateStatus(selectedNode.id);
        }

        // NEW: Check submodules for updates from their standalone repos
        await checkSubmoduleUpdatesFromNetwork(selectedNode, gitService, store, uiService);

      } catch (error) {
        console.error('[UpdatePreview] Fetch failed:', error);
        fetchNotice.hide();
        uiService.showError('Failed to check for updates');
        return;
      }
      fetchNotice.hide();

      const updateStatus = store.getNodeUpdateStatus(selectedNode.id);
      console.log('[UpdatePreview] Update status:', updateStatus);

      if (!updateStatus || !updateStatus.hasUpdates) {
        console.log('[UpdatePreview] No updates available');
        uiService.showInfo(`${selectedNode.name} is up to date`);
        return;
      }

      console.log('[UpdatePreview] Found updates:', updateStatus.commits.length, 'commits');

      const loadingNotice = uiService.showLoading('Generating update summary...');
      try {
        // Initialize summary service with API key from settings if available
        const settings = (plugin as any).settings;
        const apiKey = settings?.claudeApiKey;
        console.log('[UpdatePreview] API key available:', !!apiKey);

        if (apiKey) {
          initializeUpdateSummaryService(apiKey);
        }

        const summaryService = getUpdateSummaryService();
        console.log('[UpdatePreview] Generating summary...');
        const summary = await summaryService.generateUpdateSummary(updateStatus);
        console.log('[UpdatePreview] Summary generated:', summary);

        // Hide loading notice before showing modal
        loadingNotice.hide();

        // Show modal with update preview
        console.log('[UpdatePreview] Opening modal...');
        const modal = new UpdatePreviewModal(
          plugin.app,
          selectedNode.name,
          updateStatus,
          summary,
          // On Accept
          async () => {
            console.log('[UpdatePreview] User accepted update');

            // Check if this is a read-only repo with divergent branches
            const divergentCheck = await gitService.checkDivergentBranches(selectedNode.repoPath);
            const isReadOnly = await gitService.isReadOnlyRepo(selectedNode.repoPath);

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
                console.log('[UpdatePreview] User aborted update due to divergent branches');
                return;
              }

              // User confirmed - reset to remote
              console.log('[UpdatePreview] Resetting read-only repo to remote');
              const resetNotice = uiService.showLoading(`Resetting ${selectedNode.name} to remote...`);
              try {
                await gitService.resetToRemote(selectedNode.repoPath);
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
              // Pull updates (will be fast-forward only now)
              await gitService.pullUpdates(selectedNode.repoPath);

              // Check for coherence beacons in the commits we just pulled
              applyNotice.hide();
              const checkingNotice = uiService.showLoading('Checking for new relationships...');
              try {
                // Use the commits we already fetched (from updateStatus) instead of re-fetching
                const beacons = await (plugin as any).coherenceBeaconService.checkCommitsForBeacons(
                  selectedNode.repoPath,
                  updateStatus.commits
                );
                checkingNotice.hide();

                if (beacons.length > 0) {
                  console.log(`[UpdatePreview] Found ${beacons.length} coherence beacon(s)`);

                  // Import modal dynamically to avoid circular dependencies
                  const { CoherenceBeaconModal } = await import('../ui/coherence-beacon-modal');

                  // Process each beacon sequentially
                  for (const beacon of beacons) {
                    await new Promise<void>((resolve) => {
                      const beaconModal = new CoherenceBeaconModal(
                        plugin.app,
                        beacon,
                        // On Accept - clone the supermodule
                        async () => {
                          try {
                            new Notice(`Cloning ${beacon.title}...`);
                            await (plugin as any).coherenceBeaconService.acceptBeacon(selectedNode.repoPath, beacon);
                            new Notice(`Successfully cloned ${beacon.title}! 🌟`);
                          } catch (error) {
                            console.error('Failed to accept beacon:', error);
                            new Notice(`Failed to clone ${beacon.title}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                          } finally {
                            resolve();
                          }
                        },
                        // On Reject - skip this supermodule
                        async () => {
                          await (plugin as any).coherenceBeaconService.rejectBeacon(selectedNode.repoPath, beacon);
                          new Notice(`Skipped ${beacon.title}`);
                          resolve();
                        }
                      );
                      beaconModal.open();
                    });
                  }
                } else {
                  console.log('[UpdatePreview] No coherence beacons found');
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
                  await gitService.buildDreamNode(selectedNode.repoPath);
                  buildNotice.hide();

                  // Auto-reload plugin after build using lightweight reload
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
            console.log('[UpdatePreview] User rejected update');
            uiService.showInfo('Update cancelled');
          }
        );

        modal.open();
        console.log('[UpdatePreview] Modal opened');
      } catch (error) {
        console.error('[UpdatePreview] Error:', error);
        loadingNotice.hide();
        uiService.showError('Failed to generate update preview');
      }
    }
  });

  // Apply updates to selected DreamNode
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
        await gitService.pullUpdates(selectedNode.repoPath);

        // If it's the InterBrain node, run build
        if (selectedNode.id === '550e8400-e29b-41d4-a716-446655440000') {
          const buildNotice = uiService.showLoading('Building InterBrain...');
          try {
            await gitService.buildDreamNode(selectedNode.repoPath);
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

/**
 * Generate markdown for update preview
 * NOTE: Currently unused - kept for potential future use
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function generateUpdatePreviewMarkdown(
  nodeName: string,
  updateStatus: import('../services/git-service').FetchResult,
  summary: import('../services/update-summary-service').UpdateSummary
): string {
  const { commits, filesChanged, insertions, deletions } = updateStatus;

  return `# Updates Available for ${nodeName}

## Summary

**${summary.overallImpact}**

### What's New
${summary.userFacingChanges}

### Technical Improvements
${summary.technicalImprovements}

---

## Update Details

- **Commits**: ${commits.length}
- **Files Changed**: ${filesChanged}
- **Lines Added**: ${insertions}
- **Lines Removed**: ${deletions}

## Commit History

${commits.map((commit, i) => {
  const date = new Date(commit.timestamp * 1000).toLocaleDateString();
  return `### ${i + 1}. ${commit.subject}

**Author**: ${commit.author} (${commit.email})
**Date**: ${date}

${commit.body || '_No additional details_'}
`;
}).join('\n\n')}

---

## Next Steps

To apply these updates:
1. Run the command: **Apply Updates to Selected DreamNode**
2. Or use the hotkey (if configured)

_This preview was automatically generated. You can close this tab after reviewing._
`;
}
