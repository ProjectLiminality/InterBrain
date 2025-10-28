import { Notice } from 'obsidian';
import type InterBrainPlugin from '../main';
import { serviceManager } from '../services/service-manager';

const fs = require('fs');
const path = require('path');
const fsPromises = fs.promises;

/**
 * Sync bidirectional relationships across all DreamNodes
 * Ensures that if A points to B, then B also points to A
 */
async function syncBidirectionalRelationships(plugin: InterBrainPlugin): Promise<void> {
  try {
    new Notice('Starting relationship sync...');

    const adapter = plugin.app.vault.adapter as any;
    const vaultPath = adapter.basePath || '';

    // Get all DreamNode directories
    const entries = await fsPromises.readdir(vaultPath, { withFileTypes: true });
    const dreamNodeDirs = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const dirPath = path.join(vaultPath, entry.name);
      const uddPath = path.join(dirPath, '.udd');
      const gitPath = path.join(dirPath, '.git');

      try {
        await fsPromises.access(uddPath);
        await fsPromises.access(gitPath);
        dreamNodeDirs.push({ name: entry.name, path: dirPath });
      } catch {
        // Not a valid DreamNode, skip
        continue;
      }
    }

    console.log(`[RelationshipSync] Found ${dreamNodeDirs.length} DreamNodes to scan`);

    // Load all UDD files in parallel
    const uddDataMap = new Map<string, { uuid: string; relationships: string[]; path: string; dirName: string }>();

    await Promise.all(
      dreamNodeDirs.map(async ({ name, path: dirPath }) => {
        try {
          const uddPath = path.join(dirPath, '.udd');
          const uddContent = await fsPromises.readFile(uddPath, 'utf-8');
          const udd = JSON.parse(uddContent);

          uddDataMap.set(udd.uuid, {
            uuid: udd.uuid,
            relationships: udd.liminalWebRelationships || [],
            path: uddPath,
            dirName: name
          });
        } catch (error) {
          console.error(`[RelationshipSync] Error reading ${name}/.udd:`, error);
        }
      })
    );

    console.log(`[RelationshipSync] Loaded ${uddDataMap.size} UDD files`);

    // Build relationship graph and detect missing bidirectional links
    const fixesNeeded = new Map<string, Set<string>>();

    for (const [uuid, data] of uddDataMap) {
      for (const relatedUuid of data.relationships) {
        const relatedData = uddDataMap.get(relatedUuid);

        if (!relatedData) {
          console.warn(`[RelationshipSync] Node ${data.dirName} references non-existent node ${relatedUuid}`);
          continue;
        }

        // Check if the relationship is bidirectional
        if (!relatedData.relationships.includes(uuid)) {
          console.log(`[RelationshipSync] Found missing bidirectional link: ${data.dirName} -> ${relatedData.dirName} (need to add reverse)`);

          if (!fixesNeeded.has(relatedUuid)) {
            fixesNeeded.set(relatedUuid, new Set());
          }
          fixesNeeded.get(relatedUuid)!.add(uuid);
        }
      }
    }

    console.log(`[RelationshipSync] Found ${fixesNeeded.size} nodes needing relationship fixes`);

    if (fixesNeeded.size === 0) {
      new Notice('✓ All relationships are already bidirectional!');
      return;
    }

    // Apply fixes in parallel
    let fixedCount = 0;
    let errorCount = 0;

    await Promise.all(
      Array.from(fixesNeeded.entries()).map(async ([uuid, missingRelationships]) => {
        try {
          const data = uddDataMap.get(uuid);
          if (!data) return;

          // Read current UDD file
          const uddContent = await fsPromises.readFile(data.path, 'utf-8');
          const udd = JSON.parse(uddContent);

          // Add missing relationships
          const currentRelationships = new Set(udd.liminalWebRelationships || []);
          for (const missingUuid of missingRelationships) {
            currentRelationships.add(missingUuid);
          }

          udd.liminalWebRelationships = Array.from(currentRelationships);

          // Write back to disk
          await fsPromises.writeFile(data.path, JSON.stringify(udd, null, 2));

          fixedCount++;
          console.log(`[RelationshipSync] Fixed ${data.dirName} - added ${missingRelationships.size} relationships`);
        } catch (error) {
          errorCount++;
          console.error(`[RelationshipSync] Error fixing node ${uuid}:`, error);
        }
      })
    );

    console.log(`[RelationshipSync] Complete - Fixed: ${fixedCount}, Errors: ${errorCount}`);

    // Rescan vault to update UI
    await serviceManager.scanVault();

    new Notice(`✓ Fixed ${fixedCount} DreamNode relationships! ${errorCount > 0 ? `(${errorCount} errors)` : ''}`);

  } catch (error) {
    console.error('[RelationshipSync] Fatal error:', error);
    new Notice(`Failed to sync relationships: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function registerRelationshipCommands(plugin: InterBrainPlugin) {
  // Command: Sync bidirectional relationships
  plugin.addCommand({
    id: 'sync-bidirectional-relationships',
    name: 'Sync Bidirectional Relationships',
    callback: async () => {
      await syncBidirectionalRelationships(plugin);
    }
  });
}
