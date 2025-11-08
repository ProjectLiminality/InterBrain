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

      // Always fetch first to ensure we have latest update status
      const fetchNotice = uiService.showLoading('Checking for updates...');
      try {
        const fetchResult = await gitService.fetchUpdates(selectedNode.repoPath);
        if (fetchResult.hasUpdates) {
          store.setNodeUpdateStatus(selectedNode.id, fetchResult);
        } else {
          store.clearNodeUpdateStatus(selectedNode.id);
        }
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

              // If it's the InterBrain node, run build and reload
              if (selectedNode.id === '550e8400-e29b-41d4-a716-446655440000') {
                const buildNotice = uiService.showLoading('Building InterBrain...');
                await gitService.buildDreamNode(selectedNode.repoPath);
                buildNotice.hide();

                // Auto-reload plugin after build using lightweight reload
                const reloadNotice = uiService.showLoading('Reloading plugin...');
                const plugins = (plugin.app as any).plugins;
                await plugins.disablePlugin('interbrain');
                await plugins.enablePlugin('interbrain');
                reloadNotice.hide();
                uiService.showSuccess(`InterBrain updated and reloaded!`);
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
          await gitService.buildDreamNode(selectedNode.repoPath);
          buildNotice.hide();
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
