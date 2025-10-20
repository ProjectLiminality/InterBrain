import { Notice } from 'obsidian';
import type InterBrainPlugin from '../main';
import { CoherenceBeaconModal } from '../ui/coherence-beacon-modal';
import { useInterBrainStore } from '../store/interbrain-store';
import { serviceManager } from '../services/service-manager';

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

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
