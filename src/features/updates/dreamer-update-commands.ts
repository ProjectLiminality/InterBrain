/**
 * Dreamer Update Commands
 *
 * Commands for checking updates across all DreamNodes related to a Dreamer.
 * Implements the "check all projects from this peer" workflow.
 */

import { Notice, Plugin } from 'obsidian';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { DreamNode } from '../../core/types/dreamnode';
import { serviceManager } from '../../core/services/service-manager';

/**
 * Register Dreamer update commands
 */
export function registerDreamerUpdateCommands(plugin: Plugin): void {
  // Command: Check All Updates from Dreamer
  plugin.addCommand({
    id: 'check-all-updates-from-dreamer',
    name: 'Check All Updates from This Peer',
    callback: async () => {
      await checkAllUpdatesFromDreamer(plugin);
    }
  });
}

/**
 * Check for updates on all Dream nodes related to the selected Dreamer
 *
 * Implements the "Does THIS peer have updates for any ideas?" workflow.
 * Iterates through all Dream nodes connected to the Dreamer and checks each for updates.
 */
async function checkAllUpdatesFromDreamer(plugin: Plugin): Promise<void> {
  try {
    const store = useInterBrainStore.getState();
    const selectedNode = store.selectedNode;

    if (!selectedNode) {
      new Notice('No Dreamer node selected');
      return;
    }

    if (selectedNode.type !== 'dreamer') {
      new Notice('Selected node is not a Dreamer - please select a peer');
      return;
    }

    const notice = new Notice(`Checking all projects from ${selectedNode.name}...`, 0);

    // Get all DreamNodes
    const dreamNodeService = serviceManager.getActive();
    const allNodes = await dreamNodeService.list();

    // Find all Dream nodes related to this Dreamer
    const relatedDreams = allNodes.filter((node: DreamNode) =>
      node.type === 'dream' &&
      node.liminalWebConnections.includes(selectedNode.id)
    );

    console.log(`DreamerUpdate: Found ${relatedDreams.length} Dream nodes related to ${selectedNode.name}`);

    if (relatedDreams.length === 0) {
      notice.hide();
      new Notice(`No projects linked to ${selectedNode.name}`);
      return;
    }

    let updatesFound = 0;
    let errors = 0;

    // Check each Dream node for updates
    for (const dream of relatedDreams) {
      console.log(`  - Checking ${dream.name}...`);

      try {
        // Check if this is a Radicle repo
        if (dream.radicleId) {
          // Use Radicle coherence beacon check
          const beacons = await (plugin as any).coherenceBeaconService.checkForBeacons(dream.repoPath);
          if (beacons.length > 0) {
            updatesFound++;
            console.log(`    ✅ Found ${beacons.length} update(s) in ${dream.name}`);
          }
        } else {
          // Use Git fetch for GitHub or other remotes
          const { GitService } = await import('../../core/services/git-service');
          const gitService = new GitService((plugin as any).app);
          const fetchResult = await gitService.fetchUpdates(dream.repoPath);
          if (fetchResult.hasUpdates) {
            updatesFound++;
            console.log(`    ✅ Found ${fetchResult.commits.length} update(s) in ${dream.name}`);
          }
        }
      } catch (error) {
        console.error(`    ❌ Error checking ${dream.name}:`, error);
        errors++;
      }
    }

    notice.hide();

    // Show summary
    if (updatesFound > 0) {
      new Notice(`📦 Found updates in ${updatesFound} project(s) from ${selectedNode.name}`);
      new Notice('💡 Use "Check for Updates" on individual nodes to review and accept changes');
    } else if (errors > 0) {
      new Notice(`Checked ${relatedDreams.length} projects - ${errors} errors (see console)`);
    } else {
      new Notice(`✅ All ${relatedDreams.length} projects from ${selectedNode.name} are up to date`);
    }

  } catch (error) {
    console.error('DreamerUpdate: Failed to check updates:', error);
    new Notice(`❌ Failed to check updates: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
