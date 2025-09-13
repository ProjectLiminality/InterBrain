/**
 * useDreamSongData - React Hook for DreamSong State Management
 *
 * Layer 2 of the three-layer DreamSong architecture.
 * Minimal React state management with hash-based change detection.
 */

import { useState, useEffect, useMemo } from 'react';
import { DreamSongBlock } from '../types/dreamsong';
import { CanvasParserService } from '../services/canvas-parser-service';
import { VaultService } from '../services/vault-service';
import { parseAndResolveCanvas, generateCanvasStructureHash, hashesEqual } from '../services/dreamsong';
import { serviceManager } from '../services/service-manager';

interface UseDreamSongDataOptions {
  canvasParser: CanvasParserService;
  vaultService: VaultService;
}

interface DreamSongDataResult {
  blocks: DreamSongBlock[];
  hasContent: boolean;
  isLoading: boolean;
  error: string | null;
  hash: string | null;
}

/**
 * Custom hook for managing DreamSong data with hash-based change detection
 *
 * This replaces the complex caching system with React's built-in optimization.
 * Only re-renders when the structural hash actually changes.
 */
export function useDreamSongData(
  canvasPath: string,
  dreamNodePath: string,
  options: UseDreamSongDataOptions,
  sourceDreamNodeId?: string
): DreamSongDataResult {
  const { canvasParser, vaultService } = options;

  // Minimal state - only what's necessary for the UI
  const [hash, setHash] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<DreamSongBlock[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memoized parsing function to prevent unnecessary re-runs
  const parseCanvas = useMemo(() => {
    return async () => {
      if (!canvasPath) return;

      setIsLoading(true);
      setError(null);

      try {
        // Check if canvas exists
        const exists = await vaultService.fileExists(canvasPath);
        if (!exists) {
          setBlocks([]);
          setHash(null);
          setIsLoading(false);
          return;
        }

        // Parse raw canvas data
        const canvasData = await canvasParser.parseCanvas(canvasPath);

        // Generate hash first to check if we need to do expensive parsing
        const newHash = generateCanvasStructureHash(canvasData);

        // Compare with current hash - only update if changed
        if (hashesEqual(hash, newHash)) {
          console.log(`⚡ DreamSong hash unchanged: ${newHash}`);
          setIsLoading(false);
          return;
        }

        console.log(`🔄 DreamSong hash changed: ${hash} → ${newHash}`);

        // Hash changed - do full parse and resolve
        const result = await parseAndResolveCanvas(canvasData, dreamNodePath, vaultService, sourceDreamNodeId);

        setBlocks(result.blocks);
        setHash(result.hash);

      } catch (err) {
        console.error('Error parsing DreamSong:', err);
        setError(err instanceof Error ? err.message : 'Unknown parsing error');
        setBlocks([]);
        setHash(null);
      } finally {
        setIsLoading(false);
      }
    };
  }, [canvasPath, dreamNodePath, canvasParser, vaultService, hash]);

  // Effect for parsing when dependencies change
  useEffect(() => {
    parseCanvas();
  }, [parseCanvas]);

  // Effect for real-time file change detection
  useEffect(() => {
    // Get Obsidian app instance for file watching
    const app = serviceManager.getApp();
    if (!app || !canvasPath) {
      return;
    }

    const vault = app.vault;

    // Handler for file modification events
    const handleFileChange = (file: any) => {
      // Check if the changed file is our canvas
      if (file.path === canvasPath) {
        console.log(`🎵 [DreamSong] Canvas file changed: ${canvasPath}, triggering re-parse`);

        // Use a small delay to ensure file write is complete
        setTimeout(() => {
          parseCanvas();
        }, 100);
      }
    };

    // Listen for file modifications
    vault.on('modify', handleFileChange);

    // Also listen for file creation (in case canvas was created after component mount)
    vault.on('create', handleFileChange);

    console.log(`🎵 [DreamSong] Watching for changes to: ${canvasPath}`);

    // Cleanup listener on unmount or path change
    return () => {
      console.log(`🎵 [DreamSong] Stopped watching: ${canvasPath}`);
      vault.off('modify', handleFileChange);
      vault.off('create', handleFileChange);
    };
  }, [canvasPath, parseCanvas]);

  // Derived state
  const hasContent = blocks.length > 0;

  return {
    blocks,
    hasContent,
    isLoading,
    error,
    hash
  };
}

/**
 * Simplified version for when you only need to check if content exists
 * without resolving media paths (more performant)
 */
export function useDreamSongExists(
  canvasPath: string,
  vaultService: VaultService
): { exists: boolean; isLoading: boolean } {
  const [exists, setExists] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!canvasPath) {
      setExists(false);
      return;
    }

    setIsLoading(true);

    vaultService.fileExists(canvasPath)
      .then(setExists)
      .catch(() => setExists(false))
      .finally(() => setIsLoading(false));
  }, [canvasPath, vaultService]);

  return { exists, isLoading };
}