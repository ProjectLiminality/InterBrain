import { Notice } from 'obsidian';
import type InterBrainPlugin from '../../main';
import { CoherenceBeaconModal } from '../../core/ui/coherence-beacon-modal';
import { useInterBrainStore } from '../../core/store/interbrain-store';

// Removed unused imports

export function registerCoherenceBeaconCommands(plugin: InterBrainPlugin) {
  // Command: Push current DreamNode to network (Intelligent: Radicle → GitHub → Other)
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

        new Notice(`📤 Detecting available remote for ${selectedNode.name}...`);

        // Use intelligent push that detects available remotes
        const { GitService } = await import('../../core/services/git-service');
        const gitService = new GitService(plugin.app);

        // Get Radicle passphrase from settings for automatic node start
        const passphrase = (plugin as any).settings?.radiclePassphrase || undefined;
        const result = await gitService.pushToAvailableRemote(selectedNode.repoPath, passphrase);

        // Show success with remote type
        const remoteTypeLabel =
          result.type === 'dual' ? 'Radicle + GitHub' :
          result.type === 'radicle' ? 'Radicle' :
          result.type === 'github' ? 'GitHub' :
          'remote';
        new Notice(`✓ Pushed ${selectedNode.name} to ${remoteTypeLabel}!`);

        console.log(`CoherenceBeaconCommands: Pushed to ${result.remote} (${result.type})`);

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
    const { GitService } = await import('../../core/services/git-service');
    const gitService = new GitService(plugin.app);

    // Pull updates
    await gitService.pullUpdates(repoPath);

    const buildNotice = new Notice('Building InterBrain plugin...', 0);

    // Build the plugin
    await gitService.buildDreamNode(repoPath);

    buildNotice.hide();
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
