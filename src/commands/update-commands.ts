/**
 * Update Management Commands
 *
 * Commands for checking, previewing, and applying updates to DreamNodes
 */

import { Plugin } from 'obsidian';
import { UIService } from '../core/services/ui-service';
import { getUpdateCheckerService } from '../services/update-checker-service';
import { getUpdateSummaryService, initializeUpdateSummaryService } from '../services/update-summary-service';
import { useInterBrainStore } from '../core/store/interbrain-store';
import { GitService } from '../core/services/git-service';
import { UpdatePreviewModal } from '../core/ui/update-preview-modal';

const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

interface SubmoduleUpdate {
  name: string;
  path: string;
  commitsAhead: number;
}

/**
 * Update submodules by pulling from their standalone versions
 */
async function updateSubmodules(
  selectedNode: any,
  submoduleUpdates: SubmoduleUpdate[],
  uiService: UIService
): Promise<void> {
  const adapter = (window as any).app.vault.adapter;
  const vaultPath = adapter.basePath || '';
  const parentPath = path.join(vaultPath, selectedNode.repoPath);

  for (const submodule of submoduleUpdates) {
    try {
      const submodulePath = path.join(parentPath, submodule.path);
      const standalonePath = path.join(vaultPath, submodule.name);

      console.log(`[SubmoduleUpdate] Updating ${submodule.name} submodule from standalone...`);

      // Pull standalone commits into submodule
      // Use git pull with relative path to standalone
      const relativePath = path.relative(submodulePath, standalonePath);
      await execAsync(`git pull ${relativePath} main`, { cwd: submodulePath });

      console.log(`[SubmoduleUpdate] ✓ Updated ${submodule.name} submodule`);
    } catch (error) {
      console.error(`[SubmoduleUpdate] Failed to update ${submodule.name}:`, error);
      uiService.showError(`Failed to update ${submodule.name} submodule`);
    }
  }

  // Update parent's submodule pointers and commit
  try {
    // Stage all submodule pointer updates
    for (const submodule of submoduleUpdates) {
      await execAsync(`git add ${submodule.path}`, { cwd: parentPath });
    }

    // Commit the submodule pointer updates
    const submoduleNames = submoduleUpdates.map(s => s.name).join(', ');
    await execAsync(
      `git commit -m "[submodules] Update ${submoduleNames} from standalone versions"`,
      { cwd: parentPath }
    );

    uiService.showSuccess(`Updated ${submoduleUpdates.length} submodule(s) and committed changes`);

    // Trigger vault rescan to update UI
    const { serviceManager } = await import('../core/services/service-manager');
    await serviceManager.scanVault();
  } catch (error) {
    console.error('[SubmoduleUpdate] Failed to commit submodule updates:', error);
    uiService.showError('Failed to commit submodule updates');
  }
}

/**
 * Check if submodules have updates from their standalone network versions
 * Workflow: Alice updates Circle (standalone) → shares to network →
 *           Alice runs "Check for Updates" on Cylinder → sees Circle submodule has updates
 * Returns array of submodules with updates
 */
async function checkSubmoduleUpdatesFromNetwork(
  selectedNode: any,
  _gitService: GitService,
  _store: any,
  _uiService: UIService
): Promise<SubmoduleUpdate[]> {
  const submoduleUpdates: SubmoduleUpdate[] = [];
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
      return submoduleUpdates;
    }

    const gitmodulesContent = await fs.readFile(gitmodulesPath, 'utf-8');
    const submodules = parseGitmodules(gitmodulesContent);

    if (submodules.length === 0) {
      return submoduleUpdates;
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

              // Add to submodule updates list
              submoduleUpdates.push({
                name: submodule.name,
                path: submodule.path,
                commitsAhead: numCommitsAhead
              });
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

  return submoduleUpdates;
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
      let submoduleUpdates: SubmoduleUpdate[] = [];

      try {
        // Check root repo for updates
        const fetchResult = await gitService.fetchUpdates(selectedNode.repoPath);
        if (fetchResult.hasUpdates) {
          store.setNodeUpdateStatus(selectedNode.id, fetchResult);
        } else {
          store.clearNodeUpdateStatus(selectedNode.id);
        }

        // NEW: Check submodules for updates from their standalone repos
        submoduleUpdates = await checkSubmoduleUpdatesFromNetwork(selectedNode, gitService, store, uiService);

      } catch (error) {
        console.error('[UpdatePreview] Fetch failed:', error);
        fetchNotice.hide();
        uiService.showError('Failed to check for updates');
        return;
      }
      fetchNotice.hide();

      const updateStatus = store.getNodeUpdateStatus(selectedNode.id);
      console.log('[UpdatePreview] Update status:', updateStatus);
      console.log('[UpdatePreview] Submodule updates:', submoduleUpdates);

      // Check if EITHER root has updates OR submodules have updates
      const hasRootUpdates = updateStatus && updateStatus.hasUpdates;
      const hasSubmoduleUpdates = submoduleUpdates && submoduleUpdates.length > 0;

      if (!hasRootUpdates && !hasSubmoduleUpdates) {
        console.log('[UpdatePreview] No updates available');
        uiService.showInfo(`${selectedNode.name} is up to date`);
        return;
      }

      // If only submodules have updates (no root updates), show simple dialog
      if (!hasRootUpdates && hasSubmoduleUpdates) {
        const submoduleList = submoduleUpdates.map(s => `  • ${s.name}: ${s.commitsAhead} commit(s)`).join('\n');
        const confirmed = await uiService.showConfirmDialog(
          'Submodule Updates Available',
          `${selectedNode.name} has no direct updates, but these submodules have updates:\n\n${submoduleList}\n\nUpdate submodules now?`,
          'Update Submodules',
          'Cancel'
        );

        if (confirmed) {
          await updateSubmodules(selectedNode, submoduleUpdates, uiService);
        }
        return;
      }

      console.log('[UpdatePreview] Found updates:', updateStatus?.commits?.length || 0, 'commits');

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
        const summary = await summaryService.generateUpdateSummary(updateStatus!);
        console.log('[UpdatePreview] Summary generated:', summary);

        // Hide loading notice before showing modal
        loadingNotice.hide();

        // Show modal with update preview
        console.log('[UpdatePreview] Opening modal...');
        const modal = new UpdatePreviewModal(
          plugin.app,
          selectedNode.name,
          updateStatus!,
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
              // Pull updates - cherry-pick peer commits or fast-forward from upstream
              // Extract commit hashes from updateStatus for cherry-picking
              const commitHashes = updateStatus!.commits.map(c => c.hash);
              await gitService.pullUpdates(selectedNode.repoPath, commitHashes);

              // Check for coherence beacons in the commits we just pulled
              applyNotice.hide();
              const checkingNotice = uiService.showLoading('Checking for new relationships...');
              try {
                // Use the commits we already fetched (from updateStatus) instead of re-fetching
                const beacons = await (plugin as any).coherenceBeaconService.checkCommitsForBeacons(
                  selectedNode.repoPath,
                  updateStatus!.commits
                );
                checkingNotice.hide();

                if (beacons.length > 0) {
                  console.log(`[UpdatePreview] Found ${beacons.length} coherence beacon(s)`);

                  // Import modal dynamically to avoid circular dependencies
                  const { CoherenceBeaconModal } = await import('../core/ui/coherence-beacon-modal');

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
                          const { Notice } = await import('obsidian');
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
  updateStatus: import('../core/services/git-service').FetchResult,
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

${commits.map((commit: any, i: number) => {
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
