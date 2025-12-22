/**
 * Coherence Beacon Commands
 *
 * User-facing command for checking coherence beacons.
 * Beacons signal supermodule relationships - when your DreamNode
 * is referenced by another DreamNode.
 */

import { Notice } from 'obsidian';
import type InterBrainPlugin from '../../main';
import { CoherenceBeaconModal } from './ui/coherence-beacon-modal';
import { useInterBrainStore } from '../../core/store/interbrain-store';

export function registerCoherenceBeaconCommands(plugin: InterBrainPlugin) {
  // Command: Ignite coherence beacons for current DreamNode's submodules
  // Creates beacon commits in sovereign repos to signal "you are included in this parent"
  plugin.addCommand({
    id: 'ignite-coherence-beacons',
    name: 'Ignite Coherence Beacons (Share Submodule Relationships)',
    callback: async () => {
      const store = useInterBrainStore.getState();
      const selectedNode = store.selectedNode;

      if (!selectedNode) {
        new Notice('No DreamNode selected');
        return;
      }

      new Notice(`Igniting beacons for ${selectedNode.name}'s submodules...`);

      try {
        const results = await plugin.coherenceBeaconService.igniteBeacons(selectedNode.repoPath);

        if (results.length === 0) {
          new Notice('No submodules found - nothing to broadcast');
          return;
        }

        // Summarize results
        const created = results.filter(r => r.status === 'created').length;
        const skipped = results.filter(r => r.status === 'skipped').length;
        const errors = results.filter(r => r.status === 'error').length;

        if (errors > 0) {
          new Notice(`Beacons: ${created} created, ${skipped} skipped, ${errors} failed`);
          // Log detailed errors
          for (const r of results.filter(r => r.status === 'error')) {
            console.error(`[CoherenceBeacon] Failed for ${r.submoduleName}: ${r.message}`);
          }
        } else if (created > 0) {
          new Notice(`Broadcasted relationships to ${created} DreamNode${created > 1 ? 's' : ''}`);
        } else {
          new Notice('All submodules already have beacon relationships');
        }
      } catch (error) {
        console.error('[CoherenceBeacon] Ignite failed:', error);
        new Notice('Failed to ignite beacons: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    }
  });

  // Command: Check current DreamNode for coherence beacons (incoming)
  plugin.addCommand({
    id: 'check-coherence-beacons',
    name: 'Check Current DreamNode for Coherence Beacons',
    callback: async () => {
      const store = useInterBrainStore.getState();
      const selectedNode = store.selectedNode;

      if (!selectedNode) {
        new Notice('No DreamNode selected');
        return;
      }

      new Notice(`Checking ${selectedNode.name} for relationship beacons...`);

      try {
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
                  new Notice(`Successfully cloned ${beacon.title}!`);
                } catch (error) {
                  console.error('[CoherenceBeacon] Failed to accept beacon:', error);
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
        console.error('[CoherenceBeacon] Check failed:', error);
        new Notice('Failed to check for relationship beacons');
      }
    }
  });
}
