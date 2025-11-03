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

      const loadingNotice = uiService.showLoading('Generating update summary...');
      try {
        // Initialize summary service with API key from settings if available
        const settings = (plugin as any).settings;
        const apiKey = settings?.claudeApiKey;
        if (apiKey) {
          initializeUpdateSummaryService(apiKey);
        }

        const summaryService = getUpdateSummaryService();
        const summary = await summaryService.generateUpdateSummary(updateStatus);

        // Create markdown preview
        const markdown = generateUpdatePreviewMarkdown(selectedNode.name, updateStatus, summary);

        // Create temporary file for preview
        const vault = plugin.app.vault;
        const tempPath = `.interbrain-temp-update-preview.md`;

        // Write the preview
        await vault.adapter.write(tempPath, markdown);

        // Open in new leaf
        const leaf = plugin.app.workspace.getLeaf('tab');
        const file = vault.getAbstractFileByPath(tempPath);
        if (file && 'stat' in file) {
          await leaf.openFile(file as any);
        }

        uiService.showSuccess('Update preview ready');
      } catch (error) {
        console.error('Failed to generate update preview:', error);
        uiService.showError('Failed to generate update preview');
      } finally {
        loadingNotice.hide();
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
          uiService.showLoading('Building InterBrain...');
          await gitService.buildDreamNode(selectedNode.repoPath);
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
 */
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
