/**
 * useDreamSongData - React Hook for DreamSong State Management
 *
 * Layer 2 of the three-layer DreamSong architecture.
 * Minimal React state management with hash-based change detection.
 */

import { useState, useEffect, useMemo } from 'react';
import { TFile } from 'obsidian';
import { DreamSongBlock } from '../types/dreamsong';
import { DreamNode } from '../types/dreamnode';
import { CanvasParserService } from '../services/canvas-parser-service';
import { VaultService } from '../services/vault-service';
import { parseAndResolveCanvas, generateCanvasStructureHash, hashesEqual } from '../services/dreamsong';
import { serviceManager } from '../services/service-manager';

interface UseDreamSongDataOptions {
  canvasParser: CanvasParserService;
  vaultService: VaultService;
  dreamNode?: DreamNode; // Optional: for checking Songline features (perspectives/conversations)
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
  const { canvasParser, vaultService, dreamNode } = options;

  // Minimal state - only what's necessary for the UI
  const [hash, setHash] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<DreamSongBlock[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Songline feature detection
  const [hasPerspectives, setHasPerspectives] = useState(false);
  const [hasConversations, setHasConversations] = useState(false);

  // Memoized parsing function to prevent unnecessary re-runs
  const parseCanvas = useMemo(() => {
    return async () => {
      if (!canvasPath) return;

      setIsLoading(true);
      setError(null);

      try {
        // Check if canvas exists
        const canvasExists = await vaultService.fileExists(canvasPath);

        if (canvasExists) {
          // Parse canvas content
          const canvasData = await canvasParser.parseCanvas(canvasPath);

          // Generate hash first to check if we need to do expensive parsing
          const newHash = generateCanvasStructureHash(canvasData);

          // Compare with current hash - only update if changed
          if (hashesEqual(hash, newHash)) {
            console.log(`⚡ DreamSong hash unchanged: ${newHash}`);
            setIsLoading(false);
            return;
          }

          // Hash changed - do full parse and resolve
          const result = await parseAndResolveCanvas(canvasData, dreamNodePath, vaultService, sourceDreamNodeId);

          setBlocks(result.blocks);
          setHash(result.hash);

        } else {
          // No canvas - empty blocks (README now handled as separate section in UI)
          setBlocks([]);
          setHash(null);
        }

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

  // Effect for checking Songline features (perspectives/conversations)
  useEffect(() => {
    if (!dreamNode || !vaultService) {
      setHasPerspectives(false);
      setHasConversations(false);
      return;
    }

    const checkSonglineFeatures = async () => {
      const fs = require('fs').promises;
      const path = require('path');

      try {
        // Get vault base path
        const vaultBasePath = await vaultService.getBasePath();
        const absoluteRepoPath = path.join(vaultBasePath, dreamNode.repoPath);

        // Check for perspectives (DreamNodes only)
        if (dreamNode.type !== 'dreamer') {
          try {
            const perspectivesPath = path.join(absoluteRepoPath, 'perspectives.json');
            const content = await fs.readFile(perspectivesPath, 'utf-8');
            const perspectivesFile = JSON.parse(content);
            const hasPerspectivesContent = perspectivesFile.perspectives?.length > 0;
            setHasPerspectives(hasPerspectivesContent);
          } catch {
            setHasPerspectives(false);
          }
        } else {
          setHasPerspectives(false);
        }

        // Check for conversations (DreamerNodes only)
        if (dreamNode.type === 'dreamer') {
          try {
            const conversationsDir = path.join(absoluteRepoPath, 'conversations');
            await fs.access(conversationsDir);
            const files = await fs.readdir(conversationsDir);
            const audioFiles = files.filter((f: string) => f.endsWith('.mp3') || f.endsWith('.wav'));
            const hasConversationsContent = audioFiles.length > 0;
            setHasConversations(hasConversationsContent);
          } catch {
            setHasConversations(false);
          }
        } else {
          setHasConversations(false);
        }
      } catch (error) {
        console.error('Error checking Songline features:', error);
        setHasPerspectives(false);
        setHasConversations(false);
      }
    };

    checkSonglineFeatures();
  }, [dreamNode, vaultService]);

  // Effect for real-time file change detection
  useEffect(() => {
    // Get Obsidian app instance for file watching
    const app = serviceManager.getApp();
    if (!app || !canvasPath) {
      return;
    }

    const vault = app.vault;

    // Handler for file modification events
    const handleFileChange = (file: TFile) => {
      // Check if the changed file is our canvas
      if (file.path === canvasPath) {
        // Use a small delay to ensure file write is complete
        globalThis.setTimeout(() => {
          parseCanvas();
        }, 100);
      }
    };

    // Listen for file modifications
    // Note: Obsidian's event system types may be incomplete - using 'any' for event listeners
    vault.on('modify', handleFileChange as any);

    // Also listen for file creation (in case canvas was created after component mount)
    vault.on('create', handleFileChange as any);


    // Cleanup listener on unmount or path change
    return () => {
      vault.off('modify', handleFileChange as any);
      vault.off('create', handleFileChange as any);
    };
  }, [canvasPath, parseCanvas]);

  // Derived state - DreamSong should show if ANY of these conditions are met:
  // 1. Canvas/README has content (blocks.length > 0)
  // 2. DreamNode has perspectives
  // 3. DreamerNode has conversations
  const hasContent = blocks.length > 0 || hasPerspectives || hasConversations;

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