import { Notice } from 'obsidian';
import type InterBrainPlugin from '../../main';
import { serviceManager } from '../../core/services/service-manager';
import { VaultService } from '../../core/services/vault-service';

// InterBrain system node UUID - all Dreamers should be related to this
const INTERBRAIN_UUID = '550e8400-e29b-41d4-a716-446655440000';

/**
 * Clean up dangling relationship references in liminal-web.json files
 * Removes references to non-existent DreamNodes (only affects DreamerNodes)
 * Also ensures all Dreamer nodes are related to InterBrain
 */
async function cleanDanglingRelationships(vaultService: VaultService): Promise<void> {
  try {
    new Notice('Starting relationship cleanup...');

    // Get all entries at vault root
    const entries = await vaultService.readdirRoot();
    const dreamNodeDirs: { name: string; path: string }[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const dirPath = entry.name;
      const uddExists = await vaultService.fileExists(vaultService.joinPath(dirPath, '.udd'));
      const gitExists = await vaultService.folderExists(vaultService.joinPath(dirPath, '.git'));

      if (uddExists && gitExists) {
        dreamNodeDirs.push({ name: entry.name, path: dirPath });
      }
    }

    console.log(`[RelationshipCleanup] Found ${dreamNodeDirs.length} DreamNodes to scan`);

    // Build set of valid UUIDs by reading all .udd files
    const validUuids = new Set<string>();

    await Promise.all(
      dreamNodeDirs.map(async ({ path: dirPath }) => {
        try {
          const uddPath = vaultService.joinPath(dirPath, '.udd');
          const uddContent = await vaultService.readFile(uddPath);
          const udd = JSON.parse(uddContent);
          if (udd.uuid) {
            validUuids.add(udd.uuid);
          }
        } catch {
          // Skip invalid .udd files
        }
      })
    );

    console.log(`[RelationshipCleanup] Found ${validUuids.size} valid UUIDs in vault`);

    // Find Dreamer nodes with liminal-web.json and check for dangling references
    const liminalWebFiles = new Map<string, { relationships: string[]; path: string; dirName: string }>();

    await Promise.all(
      dreamNodeDirs.map(async ({ name, path: dirPath }) => {
        try {
          const liminalWebPath = vaultService.joinPath(dirPath, 'liminal-web.json');
          const liminalWebContent = await vaultService.readFile(liminalWebPath);
          const liminalWeb = JSON.parse(liminalWebContent);

          if (liminalWeb.relationships && Array.isArray(liminalWeb.relationships)) {
            liminalWebFiles.set(dirPath, {
              relationships: liminalWeb.relationships,
              path: liminalWebPath,
              dirName: name
            });
          }
        } catch {
          // No liminal-web.json or not a Dreamer node - skip
        }
      })
    );

    console.log(`[RelationshipCleanup] Found ${liminalWebFiles.size} Dreamer nodes to check`);

    // Find dangling references
    const nodesToClean = new Map<string, Set<string>>();

    for (const [dirPath, data] of liminalWebFiles) {
      const danglingRefs = new Set<string>();

      for (const relatedUuid of data.relationships) {
        if (!validUuids.has(relatedUuid)) {
          console.warn(`[RelationshipCleanup] Dreamer "${data.dirName}" references non-existent node ${relatedUuid}`);
          danglingRefs.add(relatedUuid);
        }
      }

      if (danglingRefs.size > 0) {
        nodesToClean.set(dirPath, danglingRefs);
      }
    }

    console.log(`[RelationshipCleanup] Found ${nodesToClean.size} Dreamer nodes with dangling references`);

    if (nodesToClean.size === 0) {
      console.log('[RelationshipCleanup] No dangling references found');
      // Still ensure Dreamers are related to InterBrain even if no dangling refs
      await ensureDreamersRelatedToInterBrain(vaultService, dreamNodeDirs, validUuids);
      await serviceManager.scanVault();
      new Notice('✓ No dangling references found - all relationships are valid!');
      return;
    }

    // Show summary before cleaning
    let totalDanglingRefs = 0;
    for (const danglingRefs of nodesToClean.values()) {
      totalDanglingRefs += danglingRefs.size;
    }

    console.log(`[RelationshipCleanup] Total dangling references to remove: ${totalDanglingRefs}`);
    new Notice(`Found ${totalDanglingRefs} dangling references in ${nodesToClean.size} Dreamer nodes. Cleaning up...`);

    // Clean up dangling references in parallel
    let cleanedCount = 0;
    let errorCount = 0;

    await Promise.all(
      Array.from(nodesToClean.entries()).map(async ([dirPath, danglingRefs]) => {
        try {
          const data = liminalWebFiles.get(dirPath);
          if (!data) return;

          // Read current liminal-web.json file
          const liminalWebContent = await vaultService.readFile(data.path);
          const liminalWeb = JSON.parse(liminalWebContent);

          // Filter out dangling references
          const cleanedRelationships = (liminalWeb.relationships || []).filter(
            (refUuid: string) => !danglingRefs.has(refUuid)
          );

          const removedCount = (liminalWeb.relationships || []).length - cleanedRelationships.length;

          liminalWeb.relationships = cleanedRelationships;

          // Write back to disk
          await vaultService.writeFile(data.path, JSON.stringify(liminalWeb, null, 2));

          cleanedCount++;
          console.log(`[RelationshipCleanup] Cleaned "${data.dirName}" - removed ${removedCount} dangling references`);
        } catch (error) {
          errorCount++;
          console.error(`[RelationshipCleanup] Error cleaning ${dirPath}:`, error);
        }
      })
    );

    console.log(`[RelationshipCleanup] Complete - Cleaned: ${cleanedCount}, Errors: ${errorCount}`);

    // Ensure all Dreamer nodes are related to InterBrain
    await ensureDreamersRelatedToInterBrain(vaultService, dreamNodeDirs, validUuids);

    // Rescan vault to update UI
    await serviceManager.scanVault();

    new Notice(`✓ Removed ${totalDanglingRefs} dangling references from ${cleanedCount} Dreamer nodes! ${errorCount > 0 ? `(${errorCount} errors)` : ''}`);

  } catch (error) {
    console.error('[RelationshipCleanup] Fatal error:', error);
    new Notice(`Failed to clean relationships: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Ensure all Dreamer nodes have a relationship to InterBrain
 * This maintains the social graph integrity where all users are connected to the system node
 */
async function ensureDreamersRelatedToInterBrain(
  vaultService: VaultService,
  dreamNodeDirs: { name: string; path: string }[],
  validUuids: Set<string>
): Promise<void> {
  // Only proceed if InterBrain exists in the vault
  if (!validUuids.has(INTERBRAIN_UUID)) {
    console.log('[RelationshipCleanup] InterBrain node not found in vault, skipping Dreamer relationship check');
    return;
  }

  console.log('[RelationshipCleanup] Ensuring all Dreamers are related to InterBrain...');

  let addedCount = 0;

  await Promise.all(
    dreamNodeDirs.map(async ({ name, path: dirPath }) => {
      try {
        // Read .udd to check if this is a Dreamer node
        const uddPath = vaultService.joinPath(dirPath, '.udd');
        const uddContent = await vaultService.readFile(uddPath);
        const udd = JSON.parse(uddContent);

        // Skip if not a Dreamer node or if it IS the InterBrain node itself
        if (udd.type !== 'dreamer' || udd.uuid === INTERBRAIN_UUID) {
          return;
        }

        // Read or create liminal-web.json
        const liminalWebPath = vaultService.joinPath(dirPath, 'liminal-web.json');
        let liminalWeb: { relationships: string[] } = { relationships: [] };

        try {
          const liminalWebContent = await vaultService.readFile(liminalWebPath);
          liminalWeb = JSON.parse(liminalWebContent);
          if (!Array.isArray(liminalWeb.relationships)) {
            liminalWeb.relationships = [];
          }
        } catch {
          // File doesn't exist, use default
        }

        // Check if InterBrain relationship already exists
        if (!liminalWeb.relationships.includes(INTERBRAIN_UUID)) {
          liminalWeb.relationships.push(INTERBRAIN_UUID);
          await vaultService.writeFile(liminalWebPath, JSON.stringify(liminalWeb, null, 2));
          console.log(`[RelationshipCleanup] Added InterBrain relationship to Dreamer "${name}"`);
          addedCount++;
        }
      } catch (error) {
        console.error(`[RelationshipCleanup] Error checking Dreamer "${name}":`, error);
      }
    })
  );

  if (addedCount > 0) {
    console.log(`[RelationshipCleanup] Added InterBrain relationship to ${addedCount} Dreamer nodes`);
    new Notice(`Added InterBrain relationship to ${addedCount} Dreamer nodes`);
  } else {
    console.log('[RelationshipCleanup] All Dreamers already related to InterBrain');
  }
}

export function registerRelationshipCommands(plugin: InterBrainPlugin) {
  // Command: Clean dangling relationship references
  plugin.addCommand({
    id: 'clean-dangling-relationships',
    name: 'Clean Dangling Relationship References',
    callback: async () => {
      const vaultService = serviceManager.getVaultService();
      if (!vaultService) {
        new Notice('VaultService not initialized');
        return;
      }
      await cleanDanglingRelationships(vaultService);
    }
  });
}
