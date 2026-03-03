/**
 * File Scanner Service
 *
 * Scans a directory and produces ExplorerItem[] for the Dream Explorer.
 * Detects submodules by matching against the store's DreamNode map,
 * identifies images, README files, and classifies items by type.
 */

import type { VaultService, VaultDirEntry } from '../../../core/services/vault-service';
import type { DreamNodeData } from '../../../core/store/interbrain-store';
import type { ExplorerItem, ExplorerItemType } from '../types/explorer';

/** Known image extensions */
const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico',
]);

/** Extensions to detect file types for icon selection */
const _CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h',
  'css', 'scss', 'html', 'json', 'yaml', 'yml', 'toml', 'xml',
]);

/**
 * Check if a filename is a README (case-insensitive)
 */
function isReadme(name: string): boolean {
  return /^readme(\.\w+)?$/i.test(name);
}

/**
 * Get file extension (lowercase, no dot)
 */
function getExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return '';
  return name.slice(dot + 1).toLowerCase();
}

/**
 * Classify a directory entry into an ExplorerItemType
 */
function classifyEntry(
  entry: VaultDirEntry,
  entryPath: string,
  dreamNodesMap: Map<string, DreamNodeData>
): { type: ExplorerItemType; dreamNodeId?: string } {
  if (entry.isDirectory()) {
    // Check if this directory is a submodule (matches a DreamNode)
    // repoPath is vault-root-relative (e.g. "TheMovingCastle") but the entry
    // may be nested (e.g. "Financial Agreement Anna/TheMovingCastle").
    // Match by: exact repoPath, OR directory name equals a DreamNode's repoPath basename.
    for (const [uuid, data] of dreamNodesMap) {
      const repoPath = data.node.repoPath;
      if (repoPath === entryPath || repoPath === entry.name) {
        return {
          type: data.node.type === 'dreamer' ? 'dreamer-submodule' : 'dream-submodule',
          dreamNodeId: uuid,
        };
      }
    }
    return { type: 'folder' };
  }

  // Files
  if (isReadme(entry.name)) {
    return { type: 'readme' };
  }

  const ext = getExtension(entry.name);
  if (IMAGE_EXTENSIONS.has(ext)) {
    return { type: 'image' };
  }

  return { type: 'file' };
}

/**
 * Scan a directory and return classified ExplorerItems.
 *
 * @param dirPath - Vault-relative directory path
 * @param vaultService - VaultService instance for fs operations
 * @param dreamNodesMap - Current DreamNodes map for submodule detection
 * @returns Array of ExplorerItems (filtered: no hidden files, no .obsidian)
 */
export async function scanDirectory(
  dirPath: string,
  vaultService: VaultService,
  dreamNodesMap: Map<string, DreamNodeData>
): Promise<ExplorerItem[]> {
  const entries = await vaultService.readdir(dirPath);

  const items: ExplorerItem[] = [];

  for (const entry of entries) {
    // Filter hidden files and .obsidian
    if (entry.name.startsWith('.') || entry.name === '.obsidian') {
      continue;
    }

    const entryPath = dirPath ? `${dirPath}/${entry.name}` : entry.name;
    const { type, dreamNodeId } = classifyEntry(entry, entryPath, dreamNodesMap);

    let size = 0;
    let mediaAbsolutePath: string | undefined;
    const absolutePath = vaultService.getFullPath(entryPath);

    try {
      if (entry.isDirectory()) {
        size = await getDirectorySize(entryPath, vaultService);
      } else {
        const stats = await vaultService.stat(entryPath);
        size = stats.size;
      }
    } catch {
      // stat may fail for some entries; use 0
    }

    // For images, resolve absolute path for preview
    if (type === 'image') {
      mediaAbsolutePath = absolutePath;
    }

    // For submodules, try to find their DreamTalk media for preview
    if ((type === 'dream-submodule' || type === 'dreamer-submodule') && dreamNodeId) {
      const nodeData = dreamNodesMap.get(dreamNodeId);
      if (nodeData?.node.dreamTalkMedia?.[0]?.absolutePath) {
        mediaAbsolutePath = nodeData.node.dreamTalkMedia[0].absolutePath;
      }
    }

    items.push({
      name: entry.name,
      path: entryPath,
      type,
      size,
      isDirectory: entry.isDirectory(),
      dreamNodeId,
      mediaAbsolutePath,
      absolutePath,
    });
  }

  // Sort: README first, then submodules, then folders, then files
  const typeOrder: Record<ExplorerItemType, number> = {
    'readme': 0,
    'dream-submodule': 1,
    'dreamer-submodule': 1,
    'folder': 2,
    'image': 3,
    'file': 3,
  };

  items.sort((a, b) => {
    const orderDiff = typeOrder[a.type] - typeOrder[b.type];
    if (orderDiff !== 0) return orderDiff;
    return a.name.localeCompare(b.name);
  });

  return items;
}

/**
 * Recursively compute total file size of a directory (shallow: 1 level deep).
 * Only sums immediate children to keep it fast — not fully recursive.
 */
async function getDirectorySize(dirPath: string, vaultService: VaultService): Promise<number> {
  try {
    const entries = await vaultService.readdir(dirPath);
    let total = 0;
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const childPath = dirPath ? `${dirPath}/${entry.name}` : entry.name;
      try {
        if (!entry.isDirectory()) {
          const stats = await vaultService.stat(childPath);
          total += stats.size;
        }
      } catch {
        // skip entries we can't stat
      }
    }
    return total;
  } catch {
    return 0;
  }
}
