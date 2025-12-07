import { Notice } from 'obsidian';
import type InterBrainPlugin from '../../main';
import { serviceManager } from '../services/service-manager';

const fs = require('fs');
const path = require('path');
const fsPromises = fs.promises;

// InterBrain node UUID - the anchor of the space
const INTERBRAIN_UUID = '550e8400-e29b-41d4-a716-446655440000';

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

    // Load all UDD files in parallel (include type for dreamer detection)
    const uddDataMap = new Map<string, { uuid: string; type: string; relationships: string[]; path: string; dirName: string }>();

    await Promise.all(
      dreamNodeDirs.map(async ({ name, path: dirPath }) => {
        try {
          const uddPath = path.join(dirPath, '.udd');
          const uddContent = await fsPromises.readFile(uddPath, 'utf-8');
          const udd = JSON.parse(uddContent);

          uddDataMap.set(udd.uuid, {
            uuid: udd.uuid,
            type: udd.type || 'dream', // Default to 'dream' if type missing
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

    // First, ensure all dreamer nodes are linked to InterBrain (the anchor of the space)
    const interbrainData = uddDataMap.get(INTERBRAIN_UUID);
    if (interbrainData) {
      for (const [uuid, data] of uddDataMap) {
        if (data.type === 'dreamer' && uuid !== INTERBRAIN_UUID) {
          // Check if dreamer is linked to InterBrain
          if (!data.relationships.includes(INTERBRAIN_UUID)) {
            console.log(`[RelationshipSync] Auto-linking dreamer ${data.dirName} to InterBrain`);
            if (!fixesNeeded.has(uuid)) {
              fixesNeeded.set(uuid, new Set());
            }
            fixesNeeded.get(uuid)!.add(INTERBRAIN_UUID);
          }

          // Check if InterBrain is linked back to dreamer (bidirectional)
          if (!interbrainData.relationships.includes(uuid)) {
            console.log(`[RelationshipSync] Auto-linking InterBrain to dreamer ${data.dirName}`);
            if (!fixesNeeded.has(INTERBRAIN_UUID)) {
              fixesNeeded.set(INTERBRAIN_UUID, new Set());
            }
            fixesNeeded.get(INTERBRAIN_UUID)!.add(uuid);
          }
        }
      }
    } else {
      console.warn(`[RelationshipSync] InterBrain node (${INTERBRAIN_UUID}) not found - skipping auto-link for dreamers`);
    }

    // Then handle general bidirectional relationship sync
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

    // Apply fixes in parallel (skip if no fixes needed)
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

          // Commit metadata change if there's a diff (git will refuse if no diff)
          // This ensures clean git state for future pulls/merges
          try {
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);

            const nodePath = path.dirname(data.path);

            // Check if there's actually a diff to commit
            const { stdout: diffOutput } = await execAsync('git diff --quiet .udd || echo "has-diff"', { cwd: nodePath });

            if (diffOutput.trim() === 'has-diff') {
              await execAsync('git add .udd', { cwd: nodePath });
              await execAsync(
                `git commit -m "[metadata] Sync bidirectional relationships"`,
                { cwd: nodePath }
              );
              console.log(`[RelationshipSync] ✓ Committed metadata for ${data.dirName}`);
            } else {
              console.log(`[RelationshipSync] No git diff for ${data.dirName} - skipping commit`);
            }
          } catch (commitError: any) {
            // Non-critical - relationship is already fixed on disk
            if (!commitError.message?.includes('nothing to commit')) {
              console.warn(`[RelationshipSync] Could not commit metadata (non-critical):`, commitError);
            }
          }

          fixedCount++;
          console.log(`[RelationshipSync] Fixed ${data.dirName} - added ${missingRelationships.size} relationships`);
        } catch (error) {
          errorCount++;
          console.error(`[RelationshipSync] Error fixing node ${uuid}:`, error);
        }
      })
    );

    console.log(`[RelationshipSync] Complete - Fixed: ${fixedCount}, Errors: ${errorCount}`);

    // PHASE 2: Commit any uncommitted .udd files (even if relationships are already correct)
    // This ensures clean git state for future pulls/merges
    console.log(`[RelationshipSync] Phase 2: Checking for uncommitted .udd files...`);

    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    let committedCount = 0;

    await Promise.all(
      dreamNodeDirs.map(async (dir) => {
        try {
          const nodePath = dir.path;
          const uddPath = path.join(nodePath, '.udd');

          // Check if .udd exists and has uncommitted changes
          try {
            await fsPromises.access(uddPath);
          } catch {
            return; // No .udd file
          }

          // Check for uncommitted changes to .udd
          const { stdout: diffOutput } = await execAsync('git diff --quiet .udd || echo "has-diff"', { cwd: nodePath });

          if (diffOutput.trim() === 'has-diff') {
            try {
              await execAsync('git add .udd', { cwd: nodePath });
              await execAsync(
                `git commit -m "[metadata] Commit relationship metadata to history"`,
                { cwd: nodePath }
              );
              committedCount++;
              console.log(`[RelationshipSync] ✓ Committed uncommitted metadata for ${dir.name}`);
            } catch (commitError: any) {
              if (!commitError.message?.includes('nothing to commit')) {
                console.warn(`[RelationshipSync] Could not commit metadata for ${dir.name}:`, commitError);
              }
            }
          }
        } catch (error) {
          console.warn(`[RelationshipSync] Error checking git state for ${dir.name}:`, error);
        }
      })
    );

    console.log(`[RelationshipSync] Phase 2 complete - Committed: ${committedCount} .udd files`);

    // Rescan vault to update UI
    await serviceManager.scanVault();

    const totalMessage = fixedCount > 0
      ? `✓ Fixed ${fixedCount} relationships and committed ${committedCount} metadata files!`
      : committedCount > 0
      ? `✓ All relationships synced. Committed ${committedCount} metadata files to history.`
      : '✓ All relationships are already bidirectional and committed!';

    new Notice(totalMessage);

  } catch (error) {
    console.error('[RelationshipSync] Fatal error:', error);
    new Notice(`Failed to sync relationships: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Clean up dangling relationship references
 * Removes references to non-existent DreamNodes
 */
async function cleanDanglingRelationships(plugin: InterBrainPlugin): Promise<void> {
  try {
    new Notice('Starting relationship cleanup...');

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

    console.log(`[RelationshipCleanup] Found ${dreamNodeDirs.length} DreamNodes to scan`);

    // Build set of valid UUIDs by reading all .udd files
    const validUuids = new Set<string>();

    await Promise.all(
      dreamNodeDirs.map(async ({ path: dirPath }) => {
        try {
          const uddPath = path.join(dirPath, '.udd');
          const uddContent = await fsPromises.readFile(uddPath, 'utf-8');
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
          const liminalWebPath = path.join(dirPath, 'liminal-web.json');
          const liminalWebContent = await fsPromises.readFile(liminalWebPath, 'utf-8');
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
          const liminalWebContent = await fsPromises.readFile(data.path, 'utf-8');
          const liminalWeb = JSON.parse(liminalWebContent);

          // Filter out dangling references
          const cleanedRelationships = (liminalWeb.relationships || []).filter(
            (refUuid: string) => !danglingRefs.has(refUuid)
          );

          const removedCount = (liminalWeb.relationships || []).length - cleanedRelationships.length;

          liminalWeb.relationships = cleanedRelationships;

          // Write back to disk
          await fsPromises.writeFile(data.path, JSON.stringify(liminalWeb, null, 2));

          cleanedCount++;
          console.log(`[RelationshipCleanup] Cleaned "${data.dirName}" - removed ${removedCount} dangling references`);
        } catch (error) {
          errorCount++;
          console.error(`[RelationshipCleanup] Error cleaning ${dirPath}:`, error);
        }
      })
    );

    console.log(`[RelationshipCleanup] Complete - Cleaned: ${cleanedCount}, Errors: ${errorCount}`);

    // Rescan vault to update UI
    await serviceManager.scanVault();

    new Notice(`✓ Removed ${totalDanglingRefs} dangling references from ${cleanedCount} Dreamer nodes! ${errorCount > 0 ? `(${errorCount} errors)` : ''}`);

  } catch (error) {
    console.error('[RelationshipCleanup] Fatal error:', error);
    new Notice(`Failed to clean relationships: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  // Command: Clean dangling relationship references
  plugin.addCommand({
    id: 'clean-dangling-relationships',
    name: 'Clean Dangling Relationship References',
    callback: async () => {
      await cleanDanglingRelationships(plugin);
    }
  });
}
