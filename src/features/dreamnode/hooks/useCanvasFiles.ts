/**
 * useCanvasFiles - React Hook for scanning canvas files in a DreamNode
 *
 * Scans the DreamNode repository for all .canvas files to enable
 * carousel navigation on the back side (DreamSong side).
 */

import { useState, useEffect, useMemo } from 'react';
import { VaultService } from '../../../core/services/vault-service';

export interface CanvasFileInfo {
  /** Full path to the canvas file (relative to vault) */
  path: string;
  /** Filename without extension */
  filename: string;
  /** Human-readable display title (e.g., "MyDreamSong" -> "My Dream Song") */
  displayTitle: string;
}

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
  /** Array of canvas file info, sorted alphabetically */
  canvasFiles: CanvasFileInfo[];
  /** Loading state */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
}

/**
 * Hook to scan for all .canvas files in a DreamNode repository
 */
export function useCanvasFiles(
  repoPath: string,
  vaultService: VaultService | null
): UseCanvasFilesResult {
  const [canvasFiles, setCanvasFiles] = useState<CanvasFileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memoize scan function
  const scanForCanvasFiles = useMemo(() => {
    return async () => {
      if (!repoPath || !vaultService) return;

      setIsLoading(true);
      setError(null);

      try {
        // Read directory contents
        const entries = await vaultService.readdir(repoPath);

        // Filter for .canvas files
        const canvasEntries = entries
          .filter(entry => entry.isFile() && entry.name.endsWith('.canvas'))
          .map(entry => {
            const filename = entry.name.replace('.canvas', '');
            return {
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

        setCanvasFiles(canvasEntries);
      } catch (err) {
        console.error('Error scanning for canvas files:', err);
        setError(err instanceof Error ? err.message : 'Failed to scan canvas files');
        setCanvasFiles([]);
      } finally {
        setIsLoading(false);
      }
    };
  }, [repoPath, vaultService]);

  // Run scan on mount and when dependencies change
  useEffect(() => {
    scanForCanvasFiles();
  }, [scanForCanvasFiles]);

  return {
    canvasFiles,
    isLoading,
    error
  };
}
