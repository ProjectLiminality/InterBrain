import { Plugin, Notice } from 'obsidian';
import { UIService } from '../services/ui-service';
import { useInterBrainStore } from '../store/interbrain-store';
import { serviceManager } from '../services/service-manager';
import { PassphraseManager } from '../services/passphrase-manager';

/**
 * Radicle commands for peer-to-peer DreamNode sharing
 * Implements "Save & Share" paradigm - hiding technical complexity
 */
export function registerRadicleCommands(
  plugin: Plugin,
  uiService: UIService,
  passphraseManager: PassphraseManager
): void {

  // Initialize DreamNode with Radicle - One-time setup for peer-to-peer sharing
  plugin.addCommand({
    id: 'initialize-dreamnode-radicle',
    name: 'Initialize DreamNode with Radicle',
    callback: async () => {
      try {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;

        if (!selectedNode) {
          console.log('RadicleCommands: No DreamNode selected for Radicle initialization');
          uiService.showError('Please select a DreamNode first');
          return;
        }

        // Get vault path and resolve full repo path
        const adapter = plugin.app.vault.adapter as { path?: string; basePath?: string };
        let vaultPath = '';
        if (typeof adapter.path === 'string') {
          vaultPath = adapter.path;
        } else if (typeof adapter.basePath === 'string') {
          vaultPath = adapter.basePath;
        }

        const path = require('path');
        const fullRepoPath = path.join(vaultPath, selectedNode.repoPath);

        console.log(`RadicleCommands: Attempting to initialize Radicle for DreamNode: ${selectedNode.name} at ${fullRepoPath}`);
        const radicleService = serviceManager.getRadicleService();

        // Check if Radicle is available
        const isAvailable = await radicleService.isAvailable();
        console.log(`RadicleCommands: Radicle CLI availability check: ${isAvailable}`);
        if (!isAvailable) {
          uiService.showError('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
          return;
        }

        // Show status indicator
        const notice = new Notice('Initializing Radicle for DreamNode...', 0);
        console.log(`RadicleCommands: Starting rad init for ${selectedNode.name}...`);

        try {
          // Try without passphrase first (ssh-agent)
          await radicleService.init(fullRepoPath, selectedNode.name, `DreamNode: ${selectedNode.name}`);

          // Success notification
          notice.hide();
          console.log(`RadicleCommands: Successfully initialized Radicle for ${selectedNode.name}`);
          uiService.showSuccess(`${selectedNode.name} ready for peer-to-peer sharing!`);
        } catch (error: any) {
          // If passphrase is needed, prompt and retry
          if (error.message && error.message.includes('passphrase')) {
            notice.hide();
            console.log('RadicleCommands: Passphrase required, prompting user...');

            const passphrase = await passphraseManager.getPassphrase();
            if (!passphrase) {
              console.log('RadicleCommands: User cancelled passphrase prompt');
              return;
            }

            // Retry with passphrase
            const retryNotice = new Notice('Initializing Radicle for DreamNode...', 0);
            try {
              await radicleService.init(fullRepoPath, selectedNode.name, `DreamNode: ${selectedNode.name}`, passphrase);
              retryNotice.hide();
              console.log(`RadicleCommands: Successfully initialized Radicle for ${selectedNode.name} with passphrase`);
              uiService.showSuccess(`${selectedNode.name} ready for peer-to-peer sharing!`);
            } catch (retryError) {
              retryNotice.hide();
              console.error('RadicleCommands: Failed to initialize with passphrase:', retryError);
              uiService.showError(`Failed to initialize: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
            }
          } else {
            notice.hide();
            console.error('RadicleCommands: Failed to initialize DreamNode with Radicle:', error);
            uiService.showError(`Failed to initialize: ${error.message || 'Unknown error'}`);
          }
        }
      } catch (error) {
        console.error('RadicleCommands: Initialize DreamNode with Radicle command failed:', error);
        uiService.showError('Failed to initialize DreamNode with Radicle');
      }
    }
  });

  // Share DreamNode - Push local commits to Radicle network
  plugin.addCommand({
    id: 'share-dreamnode',
    name: 'Share DreamNode',
    callback: async () => {
      try {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;

        if (!selectedNode) {
          console.log('RadicleCommands: No DreamNode selected for sharing');
          uiService.showError('Please select a DreamNode first');
          return;
        }

        // Get vault path and resolve full repo path
        const adapter = plugin.app.vault.adapter as { path?: string; basePath?: string };
        let vaultPath = '';
        if (typeof adapter.path === 'string') {
          vaultPath = adapter.path;
        } else if (typeof adapter.basePath === 'string') {
          vaultPath = adapter.basePath;
        }

        const path = require('path');
        const fullRepoPath = path.join(vaultPath, selectedNode.repoPath);

        console.log(`RadicleCommands: Attempting to share DreamNode: ${selectedNode.name} at ${fullRepoPath}`);
        const radicleService = serviceManager.getRadicleService();

        // Check if Radicle is available
        const isAvailable = await radicleService.isAvailable();
        console.log(`RadicleCommands: Radicle CLI availability check: ${isAvailable}`);
        if (!isAvailable) {
          uiService.showError('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
          return;
        }

        // Check if there are changes to share
        const hasChanges = await radicleService.hasChangesToShare(fullRepoPath);
        console.log(`RadicleCommands: Has changes to share: ${hasChanges}`);
        if (!hasChanges) {
          uiService.showInfo('Nothing new to share');
          return;
        }

        // Show status indicator
        const notice = new Notice('Sharing to Radicle network...', 0);
        console.log(`RadicleCommands: Starting rad sync for ${selectedNode.name}...`);

        try {
          // Try sharing without passphrase first (ssh-agent)
          await radicleService.share(fullRepoPath);

          // Success notification
          notice.hide();
          console.log(`RadicleCommands: Successfully shared ${selectedNode.name} to Radicle network`);
          uiService.showSuccess(`${selectedNode.name} shared successfully!`);
        } catch (error: any) {
          // If passphrase is needed, prompt and retry
          if (error.message && error.message.includes('passphrase')) {
            notice.hide();
            console.log('RadicleCommands: Passphrase required, prompting user...');

            const passphrase = await passphraseManager.getPassphrase();
            if (!passphrase) {
              console.log('RadicleCommands: User cancelled passphrase prompt');
              return;
            }

            // Retry with passphrase
            const retryNotice = new Notice('Sharing to Radicle network...', 0);
            try {
              await radicleService.share(fullRepoPath, passphrase);
              retryNotice.hide();
              console.log(`RadicleCommands: Successfully shared ${selectedNode.name} with passphrase`);
              uiService.showSuccess(`${selectedNode.name} shared successfully!`);
            } catch (retryError) {
              retryNotice.hide();
              console.error('RadicleCommands: Failed to share with passphrase:', retryError);
              uiService.showError(`Failed to share: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
            }
          } else {
            notice.hide();
            console.error('RadicleCommands: Failed to share DreamNode:', error);
            uiService.showError(`Failed to share: ${error.message || 'Unknown error'}`);
          }
        }
      } catch (error) {
        console.error('RadicleCommands: Share DreamNode command failed:', error);
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
        console.log('RadicleCommands: Clone DreamNode command initiated');
        const radicleService = serviceManager.getRadicleService();

        // Check if Radicle is available
        const isAvailable = await radicleService.isAvailable();
        console.log(`RadicleCommands: Radicle CLI availability check: ${isAvailable}`);
        if (!isAvailable) {
          uiService.showError('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
          return;
        }

        // Prompt for Radicle ID
        const radicleId = await uiService.promptForText(
          'Enter Radicle ID to clone',
          'rad:z42hL2jL4XNk6K8oHQaSWfMgCL7ji'
        );

        if (!radicleId || radicleId.trim() === '') {
          console.log('RadicleCommands: User cancelled Radicle ID input');
          return; // User cancelled
        }

        console.log(`RadicleCommands: Attempting to clone Radicle ID: ${radicleId.trim()}`);

        // Get vault path for destination
        const adapter = plugin.app.vault.adapter as { path?: string; basePath?: string };
        let vaultPath = '';
        if (typeof adapter.path === 'string') {
          vaultPath = adapter.path;
        } else if (typeof adapter.basePath === 'string') {
          vaultPath = adapter.basePath;
        }

        console.log(`RadicleCommands: Target vault path: ${vaultPath}`);
        if (!vaultPath) {
          console.error('RadicleCommands: Could not determine vault path');
          uiService.showError('Could not determine vault path');
          return;
        }

        // Show status indicator
        const notice = new Notice('Cloning from Radicle network...', 0);
        console.log('RadicleCommands: Starting rad clone...');

        try {
          // Try cloning without passphrase first (ssh-agent)
          const repoName = await radicleService.clone(radicleId.trim(), vaultPath);

          // Success notification
          notice.hide();
          console.log(`RadicleCommands: Successfully cloned ${repoName} from Radicle network`);
          uiService.showSuccess(`${repoName} cloned successfully!`);

          // Trigger vault scan to pick up the new DreamNode
          console.log('RadicleCommands: Triggering vault scan to detect new DreamNode...');
          const dreamNodeService = serviceManager.getActive();
          if (dreamNodeService.refreshGitStatus) {
            await dreamNodeService.refreshGitStatus();
            console.log('RadicleCommands: Vault scan complete');
          }

          // Notify user to look for the new node
          uiService.showInfo(`Look for "${repoName}" in your DreamNodes`);
        } catch (error: any) {
          // If passphrase is needed, prompt and retry
          if (error.message && error.message.includes('passphrase')) {
            notice.hide();
            console.log('RadicleCommands: Passphrase required, prompting user...');

            const passphrase = await passphraseManager.getPassphrase();
            if (!passphrase) {
              console.log('RadicleCommands: User cancelled passphrase prompt');
              return;
            }

            // Retry with passphrase
            const retryNotice = new Notice('Cloning from Radicle network...', 0);
            try {
              const repoName = await radicleService.clone(radicleId.trim(), vaultPath, passphrase);
              retryNotice.hide();
              console.log(`RadicleCommands: Successfully cloned ${repoName} with passphrase`);
              uiService.showSuccess(`${repoName} cloned successfully!`);

              // Trigger vault scan
              const dreamNodeService = serviceManager.getActive();
              if (dreamNodeService.refreshGitStatus) {
                await dreamNodeService.refreshGitStatus();
              }

              uiService.showInfo(`Look for "${repoName}" in your DreamNodes`);
            } catch (retryError) {
              retryNotice.hide();
              console.error('RadicleCommands: Failed to clone with passphrase:', retryError);
              uiService.showError(`Failed to clone: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
            }
          } else {
            notice.hide();
            console.error('RadicleCommands: Failed to clone DreamNode:', error);
            uiService.showError(`Failed to clone: ${error.message || 'Unknown error'}`);
          }
        }
      } catch (error) {
        console.error('RadicleCommands: Clone from Radicle command failed:', error);
        uiService.showError('Failed to clone DreamNode');
      }
    }
  });

  // Configure Radicle Passphrase - Optional command for users without ssh-agent
  plugin.addCommand({
    id: 'configure-radicle-passphrase',
    name: 'Configure Radicle Passphrase',
    callback: async () => {
      try {
        console.log('RadicleCommands: Configure Radicle Passphrase command initiated');
        const radicleService = serviceManager.getRadicleService();

        // Check if Radicle is available
        const isAvailable = await radicleService.isAvailable();
        if (!isAvailable) {
          uiService.showError('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
          return;
        }

        // Prompt for passphrase
        const passphrase = await uiService.promptForText(
          'Enter your Radicle passphrase (stored in memory for this session only)',
          ''
        );

        if (!passphrase || passphrase.trim() === '') {
          console.log('RadicleCommands: User cancelled passphrase configuration');
          return;
        }

        // Store in PassphraseManager
        passphraseManager.setPassphrase(passphrase.trim());
        console.log('RadicleCommands: Passphrase configured successfully');
        uiService.showSuccess('Radicle passphrase configured for this session');
      } catch (error) {
        console.error('RadicleCommands: Configure Radicle Passphrase command failed:', error);
        uiService.showError('Failed to configure passphrase');
      }
    }
  });
}
