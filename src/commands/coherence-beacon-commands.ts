import { Notice } from 'obsidian';
import type InterBrainPlugin from '../main';
import { CoherenceBeaconModal } from '../ui/coherence-beacon-modal';
import { useInterBrainStore } from '../store/interbrain-store';
import { serviceManager } from '../services/service-manager';

// Removed unused execAsync

export function registerCoherenceBeaconCommands(plugin: InterBrainPlugin) {
  // Command: Push current DreamNode to network
  plugin.addCommand({
    id: 'push-to-network',
    name: 'Push Current DreamNode to Network',
    callback: async () => {
      try {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;

        if (!selectedNode) {
          new Notice('No DreamNode selected');
          return;
        }

        const path = require('path');
        const adapter = plugin.app.vault.adapter as any;
        const vaultPath = adapter.basePath || '';
        const fullPath = path.join(vaultPath, selectedNode.repoPath);

        // Get Radicle service
        const radicleService = serviceManager.getRadicleService();

        // Check if Radicle is initialized
        const radicleId = await radicleService.getRadicleId(fullPath);
        if (!radicleId) {
          new Notice('⚠️ This DreamNode is not initialized with Radicle. Run "Initialize DreamNode with Radicle" first.');
          return;
        }

        new Notice(`Pushing ${selectedNode.name} to network...`);

        // Use RadicleService.share() which runs 'rad sync'
        await radicleService.share(fullPath);

        new Notice(`✓ Pushed ${selectedNode.name} to network!`);

      } catch (error) {
        console.error('Error pushing to network:', error);
        new Notice(`Failed to push: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  });

  // Command: Check current DreamNode for coherence beacons
  plugin.addCommand({
    id: 'check-coherence-beacons',
    name: 'Check Current DreamNode for Updates',
    callback: async () => {
      try {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;

        if (!selectedNode) {
          new Notice('No DreamNode selected');
          return;
        }

        // Special case: If this is the InterBrain DreamNode itself, pull from GitHub and rebuild
        if (selectedNode.name === 'InterBrain') {
          await pullAndRebuildInterBrain(plugin, selectedNode.repoPath);
          return;
        }

        new Notice(`Checking ${selectedNode.name} for updates...`);

        // Check for beacons
        const beacons = await plugin.coherenceBeaconService.checkForBeacons(selectedNode.repoPath);

        if (beacons.length === 0) {
          new Notice('No new supermodule connections found');
          return;
        }

        // Process each beacon
        for (const beacon of beacons) {
          await new Promise<void>((resolve) => {
            const modal = new CoherenceBeaconModal(
              plugin.app,
              beacon,
              // On Accept
              async () => {
                try {
                  new Notice(`Cloning ${beacon.title}...`);
                  await plugin.coherenceBeaconService.acceptBeacon(selectedNode.repoPath, beacon);
                  new Notice(`Successfully cloned ${beacon.title}! 🌟`);
                } catch (error) {
                  console.error('Failed to accept beacon:', error);
                  new Notice(`Failed to clone ${beacon.title}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                } finally {
                  resolve();
                }
              },
              // On Reject
              async () => {
                await plugin.coherenceBeaconService.rejectBeacon(selectedNode.repoPath, beacon);
                new Notice(`Skipped ${beacon.title}`);
                resolve();
              }
            );

            modal.open();
          });
        }

      } catch (error) {
        console.error('Error checking for beacons:', error);
        new Notice('Failed to check for updates');
      }
    }
  });
}

/**
 * Pull latest changes from GitHub and rebuild the InterBrain plugin
 */
async function pullAndRebuildInterBrain(plugin: InterBrainPlugin, repoPath: string): Promise<void> {
  new Notice('Pulling latest InterBrain updates from GitHub...');

  try {
    // Use GitService for proper PATH handling
    const { GitService } = await import('../services/git-service');
    const gitService = new GitService(plugin.app);

    // Pull updates
    await gitService.pullUpdates(repoPath);

    new Notice('Building InterBrain plugin...');

    // Build the plugin
    await gitService.buildDreamNode(repoPath);

    new Notice('✅ InterBrain updated and rebuilt! Reload plugin to see changes.');

    // Show helpful instruction
    setTimeout(() => {
      new Notice('💡 Use Plugin Reloader hotkey to reload InterBrain');
    }, 1000);
  } catch (error) {
    console.error('Pull and rebuild error:', error);
    new Notice(`❌ Failed to update InterBrain: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
