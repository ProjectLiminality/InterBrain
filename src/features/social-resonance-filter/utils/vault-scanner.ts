/**
 * Vault Scanner Utilities
 *
 * Shared logic for scanning the vault for DreamNodes and building
 * mappings needed by peer discovery and sync operations.
 */

const path = require('path');
const fs = require('fs').promises;

/**
 * Basic info about a DreamNode directory
 */
export interface DreamNodeDir {
  name: string;
  path: string;
}

/**
 * UDD data loaded from a DreamNode, with optional relationships
 */
export interface UDDData {
  uuid: string;
  type: 'dream' | 'dreamer';
  did?: string;
  radicleId?: string;
  relationships: string[];  // From liminal-web.json for dreamers
  uddPath: string;
  dirPath: string;
  dirName: string;
}

/**
 * Result of scanning the vault for DreamNodes
 */
export interface VaultScanResult {
  /** Map of UUID -> UDD data */
  uddDataMap: Map<string, UDDData>;
  /** Reverse mapping: DID -> UUID (for dreamer nodes) */
  didToUuidMap: Map<string, string>;
}

/**
 * Find all DreamNode directories in the vault
 * A valid DreamNode has both .udd and .git
 */
export async function findDreamNodeDirs(vaultPath: string): Promise<DreamNodeDir[]> {
  const entries = await fs.readdir(vaultPath, { withFileTypes: true });
  const dreamNodeDirs: DreamNodeDir[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const dirPath = path.join(vaultPath, entry.name);
    const uddPath = path.join(dirPath, '.udd');
    const gitPath = path.join(dirPath, '.git');

    try {
      await fs.access(uddPath);
      await fs.access(gitPath);
      dreamNodeDirs.push({ name: entry.name, path: dirPath });
    } catch {
      // Not a valid DreamNode, skip
      continue;
    }
  }

  return dreamNodeDirs;
}

/**
 * Load UDD data for a single DreamNode
 * Optionally loads liminal-web.json relationships for dreamer nodes
 */
export async function loadUDDData(
  dirName: string,
  dirPath: string,
  includeRelationships: boolean = false
): Promise<UDDData | null> {
  try {
    const uddPath = path.join(dirPath, '.udd');
    const uddContent = await fs.readFile(uddPath, 'utf-8');
    const udd = JSON.parse(uddContent);

    const nodeType = udd.type || 'dream';
    let relationships: string[] = [];

    // For dreamer nodes, optionally load liminal-web.json
    if (includeRelationships && nodeType === 'dreamer') {
      try {
        const liminalWebPath = path.join(dirPath, 'liminal-web.json');
        const liminalWebContent = await fs.readFile(liminalWebPath, 'utf-8');
        const liminalWeb = JSON.parse(liminalWebContent);
        relationships = liminalWeb.relationships || [];
      } catch {
        // No liminal-web.json is normal for new dreamers
      }
    }

    return {
      uuid: udd.uuid,
      type: nodeType,
      did: udd.did,
      radicleId: udd.radicleId,
      relationships,
      uddPath,
      dirPath,
      dirName
    };
  } catch (error) {
    console.error(`[VaultScanner] Error reading ${dirName}/.udd:`, error);
    return null;
  }
}

/**
 * Scan the vault and load all DreamNode UDD data
 * Returns mappings needed for peer operations
 */
export async function scanVaultForDreamNodes(
  vaultPath: string,
  includeRelationships: boolean = false
): Promise<VaultScanResult> {
  const dreamNodeDirs = await findDreamNodeDirs(vaultPath);

  const uddDataMap = new Map<string, UDDData>();
  const didToUuidMap = new Map<string, string>();

  // Load all UDD files in parallel
  const results = await Promise.all(
    dreamNodeDirs.map(({ name, path: dirPath }) =>
      loadUDDData(name, dirPath, includeRelationships)
    )
  );

  // Build maps from results
  for (const data of results) {
    if (!data) continue;

    uddDataMap.set(data.uuid, data);

    // Build reverse DID->UUID mapping for dreamers
    if (data.type === 'dreamer' && data.did) {
      didToUuidMap.set(data.did, data.uuid);
    }
  }

  return { uddDataMap, didToUuidMap };
}

/**
 * Update liminal-web.json relationships for a dreamer
 */
export async function updateLiminalWebRelationships(
  dreamerDirPath: string,
  newRelationshipUuid: string
): Promise<boolean> {
  const liminalWebPath = path.join(dreamerDirPath, 'liminal-web.json');

  try {
    let liminalWeb: { relationships: string[] } = { relationships: [] };

    try {
      const content = await fs.readFile(liminalWebPath, 'utf-8');
      liminalWeb = JSON.parse(content);
      liminalWeb.relationships = liminalWeb.relationships || [];
    } catch {
      // File doesn't exist, use empty
    }

    if (liminalWeb.relationships.includes(newRelationshipUuid)) {
      return false; // Already exists
    }

    liminalWeb.relationships.push(newRelationshipUuid);
    await fs.writeFile(liminalWebPath, JSON.stringify(liminalWeb, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error(`[VaultScanner] Failed to update liminal-web.json:`, error);
    return false;
  }
}
