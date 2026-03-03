/**
 * useCanvasFiles - React Hook for scanning backside content in a DreamNode
 *
 * Scans the DreamNode repository for .canvas files and index.html to enable
 * carousel navigation on the back side (DreamSong side).
 *
 * Carousel order:
 *   Index 0: HolonView (submodules — always present, managed by DreamSongSide)
 *   Index 1: Custom UI (index.html — only if present)
 *   Index 2+: Canvas files (DreamSongs)
 */

import { useState, useEffect, useMemo } from 'react';
import { VaultService } from '../../../core/services/vault-service';

export interface BacksideContentItem {
  /** Content type: 'canvas' for DreamSongs, 'html' for custom UI */
  type: 'canvas' | 'html';
  /** Full path to the file (relative to vault) */
  path: string;
  /** Filename without extension */
  filename: string;
  /** Human-readable display title */
  displayTitle: string;
}

/** @deprecated Use BacksideContentItem instead */
export type CanvasFileInfo = BacksideContentItem;

/**
 * Convert PascalCase or camelCase filename to human-readable title
 * "MyDreamSong" -> "My Dream Song"
 * "dreamSong" -> "Dream Song"
 */
function filenameToDisplayTitle(filename: string): string {
  // Add space before uppercase letters, handle consecutive capitals
  const spaced = filename
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ');

  // Capitalize first letter
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

interface UseCanvasFilesResult {
  /** Array of backside content items (HTML + canvas files) */
  backsideItems: BacksideContentItem[];
  /** Convenience: only the canvas files */
  canvasFiles: BacksideContentItem[];
  /** Whether this DreamNode has a custom UI (index.html) */
  hasCustomUI: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
}

/**
 * Hook to scan for backside content in a DreamNode repository.
 * Detects both .canvas files (DreamSongs) and index.html (custom UI).
 */
export function useCanvasFiles(
  repoPath: string,
  vaultService: VaultService | null
): UseCanvasFilesResult {
  const [backsideItems, setBacksideItems] = useState<BacksideContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memoize scan function
  const scanForContent = useMemo(() => {
    return async () => {
      if (!repoPath || !vaultService) return;

      setIsLoading(true);
      setError(null);

      try {
        // Read directory contents
        const entries = await vaultService.readdir(repoPath);

        const items: BacksideContentItem[] = [];

        // Check for index.html (custom UI) — prepended before canvas files
        const hasIndexHtml = entries.some(entry => entry.isFile() && entry.name === 'index.html');
        if (hasIndexHtml) {
          items.push({
            type: 'html',
            path: vaultService.joinPath(repoPath, 'index.html'),
            filename: 'index',
            displayTitle: 'Custom UI'
          });
        }

        // Filter for .canvas files
        const canvasEntries = entries
          .filter(entry => entry.isFile() && entry.name.endsWith('.canvas'))
          .map(entry => {
            const filename = entry.name.replace('.canvas', '');
            return {
              type: 'canvas' as const,
              path: vaultService.joinPath(repoPath, entry.name),
              filename,
              displayTitle: filenameToDisplayTitle(filename)
            };
          })
          // Sort alphabetically by filename, but put "DreamSong" first if present
          .sort((a, b) => {
            if (a.filename.toLowerCase() === 'dreamsong') return -1;
            if (b.filename.toLowerCase() === 'dreamsong') return 1;
            return a.filename.localeCompare(b.filename);
          });

        items.push(...canvasEntries);
        setBacksideItems(items);
      } catch (err) {
        console.error('Error scanning for backside content:', err);
        setError(err instanceof Error ? err.message : 'Failed to scan backside content');
        setBacksideItems([]);
      } finally {
        setIsLoading(false);
      }
    };
  }, [repoPath, vaultService]);

  // Run scan on mount and when dependencies change
  useEffect(() => {
    scanForContent();
  }, [scanForContent]);

  // Derive convenience values
  const canvasFiles = useMemo(
    () => backsideItems.filter(item => item.type === 'canvas'),
    [backsideItems]
  );
  const hasCustomUI = useMemo(
    () => backsideItems.some(item => item.type === 'html'),
    [backsideItems]
  );

  return {
    backsideItems,
    canvasFiles,
    hasCustomUI,
    isLoading,
    error
  };
}
