/**
 * Coherence Beacon Commands
 *
 * Command for igniting coherence beacons - broadcasting submodule
 * relationships to sovereign repos so they can discover supermodules.
 *
 * Note: Beacon *detection* is now handled by the unified cherry-pick
 * workflow (Check for Updates → cherry-pick-preview command).
 */

import { Notice } from 'obsidian';
import type InterBrainPlugin from '../../main';
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
}
