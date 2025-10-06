import { Plugin, Notice } from 'obsidian';
import { UIService } from '../services/ui-service';
import { useInterBrainStore } from '../store/interbrain-store';
import { serviceManager } from '../services/service-manager';

/**
 * Radicle commands for peer-to-peer DreamNode sharing
 * Implements "Save & Share" paradigm - hiding technical complexity
 */
export function registerRadicleCommands(
  plugin: Plugin,
  uiService: UIService
): void {

  // Share DreamNode - Push local commits to Radicle network
  plugin.addCommand({
    id: 'share-dreamnode',
    name: 'Share DreamNode',
    callback: async () => {
      try {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;

        if (!selectedNode) {
          uiService.showError('Please select a DreamNode first');
          return;
        }

        const radicleService = serviceManager.getRadicleService();

        // Check if Radicle is available
        if (!await radicleService.isAvailable()) {
          uiService.showError('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
          return;
        }

        // Check if there are changes to share
        const hasChanges = await radicleService.hasChangesToShare(selectedNode.repoPath);
        if (!hasChanges) {
          uiService.showInfo('Nothing new to share');
          return;
        }

        // Show status indicator
        const notice = new Notice('Sharing to Radicle network...', 0);

        try {
          // Share to Radicle network
          await radicleService.share(selectedNode.repoPath);

          // Success notification
          notice.hide();
          uiService.showSuccess(`${selectedNode.name} shared successfully!`);
        } catch (error) {
          notice.hide();
          console.error('Failed to share DreamNode:', error);
          uiService.showError(`Failed to share: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } catch (error) {
        console.error('Share DreamNode command failed:', error);
        uiService.showError('Failed to share DreamNode');
      }
    }
  });

  // Clone DreamNode from Radicle Network
  plugin.addCommand({
    id: 'clone-from-radicle',
    name: 'Clone DreamNode from Radicle Network',
    callback: async () => {
      try {
        const radicleService = serviceManager.getRadicleService();

        // Check if Radicle is available
        if (!await radicleService.isAvailable()) {
          uiService.showError('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
          return;
        }

        // Prompt for Radicle ID
        const radicleId = await uiService.promptForText(
          'Enter Radicle ID to clone',
          'rad:z42hL2jL4XNk6K8oHQaSWfMgCL7ji'
        );

        if (!radicleId || radicleId.trim() === '') {
          return; // User cancelled
        }

        // Get vault path for destination
        const adapter = plugin.app.vault.adapter as { path?: string; basePath?: string };
        let vaultPath = '';
        if (typeof adapter.path === 'string') {
          vaultPath = adapter.path;
        } else if (typeof adapter.basePath === 'string') {
          vaultPath = adapter.basePath;
        }

        if (!vaultPath) {
          uiService.showError('Could not determine vault path');
          return;
        }

        // Show status indicator
        const notice = new Notice('Cloning from Radicle network...', 0);

        try {
          // Clone from Radicle network - service returns the derived name
          const repoName = await radicleService.clone(radicleId.trim(), vaultPath);

          // Success notification
          notice.hide();
          uiService.showSuccess(`${repoName} cloned successfully!`);

          // Trigger vault scan to pick up the new DreamNode
          const dreamNodeService = serviceManager.getActive();
          if (dreamNodeService.refreshGitStatus) {
            await dreamNodeService.refreshGitStatus();
          }

          // Notify user to look for the new node
          uiService.showInfo(`Look for "${repoName}" in your DreamNodes`);
        } catch (error) {
          notice.hide();
          console.error('Failed to clone DreamNode:', error);
          uiService.showError(`Failed to clone: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } catch (error) {
        console.error('Clone from Radicle command failed:', error);
        uiService.showError('Failed to clone DreamNode');
      }
    }
  });
}
