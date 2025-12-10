/**
 * Vault Scanner Utilities - Discover DreamNodes in filesystem
 *
 * Pure discovery functions - no store interaction.
 * Returns raw data that the service can use to update the store.
 */

const fs = require('fs');
const path = require('path');

const fsPromises = fs.promises;

import { UDDFile } from '../types/dreamnode';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of discovering a DreamNode directory
 */
export interface DiscoveredNode {
  dirPath: string;
  dirName: string;
  udd: UDDFile;
}

/**
 * Result of scanning a vault for DreamNodes
 */
export interface VaultScanResult {
  discovered: DiscoveredNode[];
  errors: Array<{ dirName: string; error: string }>;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Check if a directory is a valid DreamNode (has .git and .udd)
 */
export async function isValidDreamNode(dirPath: string): Promise<boolean> {
  try {
    const gitPath = path.join(dirPath, '.git');
    const uddPath = path.join(dirPath, '.udd');

    const [gitExists, uddExists] = await Promise.all([
      fileExists(gitPath),
      fileExists(uddPath)
    ]);

    return gitExists && uddExists;
  } catch {
    return false;
  }
}

/**
 * Check if a file/directory exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// DISCOVERY
// ============================================================================

/**
 * Scan a vault directory and discover all DreamNode repositories
 *
 * This is a pure discovery function - it doesn't update any store.
 * Returns raw UDD data for each discovered node.
 */
export async function discoverDreamNodes(vaultPath: string): Promise<VaultScanResult> {
  const result: VaultScanResult = {
    discovered: [],
    errors: []
  };

  try {
    // Get all root-level directories
    const entries = await fsPromises.readdir(vaultPath, { withFileTypes: true });
    const directories = entries.filter((entry: { isDirectory(): boolean }) => entry.isDirectory());

    // Check each directory
    for (const dir of directories) {
      const dirPath = path.join(vaultPath, dir.name);

      try {
        // Check if it's a valid DreamNode
        const isValid = await isValidDreamNode(dirPath);
        if (!isValid) continue;

        // Read and parse UDD file
        const uddPath = path.join(dirPath, '.udd');
        const uddContent = await fsPromises.readFile(uddPath, 'utf-8');

        let udd: UDDFile;
        try {
          udd = JSON.parse(uddContent);
        } catch (parseError) {
          result.errors.push({
            dirName: dir.name,
            error: `Invalid JSON in .udd: ${parseError instanceof Error ? parseError.message : 'Parse error'}`
          });
          continue;
        }

        result.discovered.push({
          dirPath,
          dirName: dir.name,
          udd
        });

      } catch (error) {
        result.errors.push({
          dirName: dir.name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

  } catch (error) {
    console.error('vault-scanner: Failed to read vault directory:', error);
  }

  return result;
}

/**
 * Read the UDD file from a DreamNode directory
 */
export async function readUDD(dirPath: string): Promise<UDDFile | null> {
  try {
    const uddPath = path.join(dirPath, '.udd');
    const content = await fsPromises.readFile(uddPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Read the liminal-web.json file from a DreamNode directory
 */
export async function readLiminalWeb(dirPath: string): Promise<string[]> {
  try {
    const liminalWebPath = path.join(dirPath, 'liminal-web.json');
    if (await fileExists(liminalWebPath)) {
      const content = await fsPromises.readFile(liminalWebPath, 'utf-8');
      const data = JSON.parse(content);
      return data.relationships || [];
    }
  } catch {
    // No liminal-web.json or parse error
  }
  return [];
}

// ============================================================================
// MEDIA DISCOVERY
// ============================================================================

/**
 * Get media file info from a DreamNode directory
 */
export interface MediaFileInfo {
  path: string;
  absolutePath: string;
  type: string;
  size: number;
}

/**
 * Discover DreamTalk media file in a DreamNode directory
 */
export async function discoverDreamTalkMedia(
  dirPath: string,
  dreamTalkPath: string | undefined
): Promise<MediaFileInfo | null> {
  if (!dreamTalkPath) return null;

  try {
    const mediaPath = path.join(dirPath, dreamTalkPath);
    if (await fileExists(mediaPath)) {
      const stats = await fsPromises.stat(mediaPath);
      return {
        path: dreamTalkPath,
        absolutePath: mediaPath,
        type: getMimeType(dreamTalkPath),
        size: stats.size
      };
    }
  } catch {
    // File doesn't exist or can't be read
  }
  return null;
}

/**
 * Get MIME type from filename
 */
export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'pdf': 'application/pdf',
    'link': 'text/x-link'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// ============================================================================
// FILE HASH
// ============================================================================

/**
 * Calculate SHA-256 hash of a file
 */
export async function calculateFileHash(filePath: string): Promise<string | undefined> {
  try {
    const crypto = require('crypto');
    const fileBuffer = await fsPromises.readFile(filePath);
    const hash = crypto.createHash('sha256');
    hash.update(fileBuffer);
    return hash.digest('hex');
  } catch {
    return undefined;
  }
}
