/**
 * Housekeeping Commands
 *
 * Maintenance commands to ensure system coherence and robustness:
 * - Synchronize Radicle follow relationships
 * - Repair broken links
 * - Clean up stale metadata
 */

import { Notice, Plugin } from 'obsidian';
import { DreamNode } from '../../core/types/dreamnode';
import { serviceManager } from '../../core/services/service-manager';

/**
 * Register all housekeeping commands
 */
export function registerHousekeepingCommands(plugin: Plugin): void {
  // Command: Synchronize Radicle Follow Relationships
  plugin.addCommand({
    id: 'sync-radicle-follows',
    name: 'Housekeeping: Sync Radicle Follow Relationships',
    callback: async () => {
      await syncRadicleFollowRelationships(plugin);
    }
  });
}

/**
 * Ensure all Radicle Dreamer ↔ Radicle Dream relationships have proper follow setup
 *
 * Scans vault for:
 * - Dreamer nodes with Radicle DIDs
 * - Dream nodes with Radicle IDs
 * - Relationships between them
 *
 * For each pair, verifies we're following the peer's DID for that repository.
 * This is the "housekeeping" command that ensures collaboration handshakes are complete.
 */
async function syncRadicleFollowRelationships(_plugin: Plugin): Promise<void> {
  const notice = new Notice('🔄 Synchronizing Radicle follow relationships...', 0);

  try {
    // Get all DreamNodes from the service
    const dreamNodeService = serviceManager.getActive();
    const allNodes = await dreamNodeService.list();

    // Find all Radicle Dreamer nodes (have radicleId which is their DID)
    const radicledreamers = allNodes.filter((node: DreamNode) =>
      node.type === 'dreamer' && node.radicleId
    );

    console.log(`Housekeeping: Found ${radicledreamers.length} Radicle Dreamer nodes`);

    if (radicledreamers.length === 0) {
      notice.hide();
      new Notice('No Radicle peers found - nothing to synchronize');
      return;
    }

    let followsChecked = 0;
    let followsEstablished = 0;
    let errors = 0;

    // For each Radicle Dreamer, check all their related Dream nodes
    for (const dreamer of radicledreamers) {
      console.log(`\nHousekeeping: Checking peer "${dreamer.name}" (${dreamer.radicleId})`);

      // Find all Dream nodes related to this Dreamer
      for (const dreamId of dreamer.liminalWebConnections) {
        const dream = allNodes.find((n: DreamNode) => n.id === dreamId && n.type === 'dream');

        // Skip if not a Dream node or doesn't have Radicle ID
        if (!dream || !dream.radicleId) {
          continue;
        }

        console.log(`  - Dream: "${dream.name}" (${dream.radicleId})`);
        followsChecked++;

        try {
          // Get the repository delegate (owner's DID)
          const radicleService = serviceManager.getRadicleService() as any;
          const delegateDid = await radicleService.getRepositoryDelegate(dream.radicleId);

          if (!delegateDid) {
            console.warn(`    ⚠️ Could not determine delegate for ${dream.radicleId}`);
            continue;
          }

          // Check if this delegate matches our Dreamer's DID
          if (delegateDid === dreamer.radicleId) {
            console.log(`    ✓ Correct delegate - ensuring follow...`);

            // Establish follow relationship (idempotent - won't duplicate if already following)
            await radicleService.followPeer(dreamer.radicleId);
            followsEstablished++;

            console.log(`    ✅ Follow relationship confirmed`);
          } else {
            console.log(`    ℹ️ Delegate mismatch (expected ${dreamer.radicleId}, got ${delegateDid})`);
            console.log(`    ℹ️ This Dream may have been cloned from someone else originally`);
          }

        } catch (error) {
          console.error(`    ❌ Error processing ${dream.name}:`, error);
          errors++;
        }
      }
    }

    notice.hide();

    // Show summary
    const parts: string[] = [];
    parts.push(`Checked ${followsChecked} Dream nodes`);
    if (followsEstablished > 0) {
      parts.push(`Established ${followsEstablished} follow relationships`);
    }
    if (errors > 0) {
      parts.push(`${errors} errors (see console)`);
    }

    const summary = parts.join(', ');
    new Notice(`✅ Radicle sync complete: ${summary}`);

  } catch (error) {
    notice.hide();
    console.error('Housekeeping: Failed to sync Radicle follows:', error);
    new Notice(`❌ Failed to sync: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
