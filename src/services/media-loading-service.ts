/**
 * Media Loading Service
 *
 * Handles lazy loading of DreamNode media (dreamTalkMedia and dreamSongContent).
 * Implements smart preloading based on relationship graph (2-degree neighborhood).
 */

import type { DreamNode, MediaFile, CanvasFile } from '../types/dreamnode';
import { useInterBrainStore } from '../store/interbrain-store';

interface MediaLoadTask {
  nodeId: string;
  degree: number; // 0 = selected, 1 = direct neighbor, 2 = 2nd degree
  priority: number; // Lower = higher priority
}

export class MediaLoadingService {
  private mediaCache: Map<string, { dreamTalkMedia: MediaFile[], dreamSongContent: CanvasFile[] }> = new Map();
  private loadingQueue: MediaLoadTask[] = [];
  private isProcessingQueue = false;
  private abortController: AbortController | null = null;
  private maxConcurrentLoads = 3;
  private maxSecondDegreeNodes = 50; // Cap 2nd degree to prevent loading entire graph

  /**
   * Load media for a node and its 2-degree neighborhood
   */
  async loadNodeWithNeighborhood(selectedNodeId: string): Promise<void> {
    console.log(`[MediaLoading] Loading neighborhood for ${selectedNodeId}`);

    // Cancel any previous loading operation
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    // Clear queue and start fresh
    this.loadingQueue = [];

    // Build relationship graph (2 degrees)
    const visited = new Set<string>();
    const queue: MediaLoadTask[] = [{ nodeId: selectedNodeId, degree: 0, priority: 0 }];
    const nodesToLoad: MediaLoadTask[] = [];

    while (queue.length > 0) {
      const task = queue.shift()!;

      if (visited.has(task.nodeId) || task.degree > 2) continue;
      visited.add(task.nodeId);

      // Add to load list
      nodesToLoad.push(task);

      // Queue neighbors if within degree limit
      if (task.degree < 2) {
        const store = useInterBrainStore.getState();
        const node = this.getNode(task.nodeId, store);

        if (node) {
          const neighbors = [
            ...node.liminalWebConnections,
            ...node.submodules,
            ...node.supermodules
          ];

          // Add neighbors with incremented degree and priority
          neighbors.forEach(neighborId => {
            if (!visited.has(neighborId)) {
              queue.push({
                nodeId: neighborId,
                degree: task.degree + 1,
                priority: task.degree + 1 // Priority increases with distance
              });
            }
          });
        }
      }
    }

    // Cap 2nd degree nodes to prevent loading too much
    const cappedNodesToLoad = nodesToLoad.slice(0, this.maxSecondDegreeNodes);

    console.log(`[MediaLoading] Queuing ${cappedNodesToLoad.length} nodes (${nodesToLoad.length - cappedNodesToLoad.length} capped)`);

    // Sort by priority (degree 0 first, then 1, then 2)
    cappedNodesToLoad.sort((a, b) => a.priority - b.priority);

    // Add to loading queue
    this.loadingQueue = cappedNodesToLoad;

    // Start processing queue
    this.processQueue();
  }

  /**
   * Process loading queue with concurrency control
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    const activeLoads: Promise<void>[] = [];

    while (this.loadingQueue.length > 0 && !this.abortController?.signal.aborted) {
      // Wait if we hit concurrency limit
      if (activeLoads.length >= this.maxConcurrentLoads) {
        await Promise.race(activeLoads);
        // Remove completed loads
        activeLoads.splice(0, activeLoads.findIndex(p => p === undefined) + 1);
      }

      const task = this.loadingQueue.shift()!;

      // Skip if already cached
      if (this.mediaCache.has(task.nodeId)) {
        console.log(`[MediaLoading] Cache hit for ${task.nodeId}`);
        continue;
      }

      // Start loading (don't await - parallel loading)
      const loadPromise = this.loadNodeMedia(task.nodeId)
        .then(() => {
          // Remove from active loads when done
          const index = activeLoads.indexOf(loadPromise);
          if (index > -1) activeLoads.splice(index, 1);
        })
        .catch(error => {
          console.error(`[MediaLoading] Failed to load ${task.nodeId}:`, error);
        });

      activeLoads.push(loadPromise);
    }

    // Wait for remaining loads to complete
    await Promise.all(activeLoads);

    this.isProcessingQueue = false;
    console.log(`[MediaLoading] Queue processing complete`);
  }

  /**
   * Load media for a single node
   */
  private async loadNodeMedia(nodeId: string): Promise<void> {
    if (this.abortController?.signal.aborted) return;

    const store = useInterBrainStore.getState();
    const node = this.getNode(nodeId, store);

    if (!node) {
      console.warn(`[MediaLoading] Node not found: ${nodeId}`);
      return;
    }

    console.log(`[MediaLoading] Loading media for ${node.name}`);

    const fs = require('fs').promises;

    // Load dreamTalkMedia
    const dreamTalkMedia: MediaFile[] = await Promise.all(
      node.dreamTalkMedia.map(async (media) => {
        // Skip if already loaded
        if (media.data && media.data.length > 0) {
          return media;
        }

        try {
          // Read file and convert to base64 data URL
          const buffer = await fs.readFile(media.absolutePath);
          const base64 = buffer.toString('base64');
          const dataUrl = `data:${media.type};base64,${base64}`;

          return {
            ...media,
            data: dataUrl
          };
        } catch (error) {
          console.error(`[MediaLoading] Failed to load ${media.path}:`, error);
          return media; // Return with empty data
        }
      })
    );

    // Load dreamSongContent (canvas files)
    const dreamSongContent: CanvasFile[] = await Promise.all(
      node.dreamSongContent.map(async (canvas) => {
        // Skip if already loaded
        if (canvas.content !== null && canvas.content !== undefined) {
          return canvas;
        }

        try {
          const content = await fs.readFile(canvas.absolutePath, 'utf-8');
          return {
            ...canvas,
            content
          };
        } catch (error) {
          console.error(`[MediaLoading] Failed to load ${canvas.path}:`, error);
          return canvas; // Return with null content
        }
      })
    );

    // Cache the loaded media
    this.mediaCache.set(nodeId, { dreamTalkMedia, dreamSongContent });

    // Update node in store with loaded media
    store.updateRealNode(nodeId, {
      ...node,
      dreamTalkMedia,
      dreamSongContent
    });

    console.log(`[MediaLoading] Loaded media for ${node.name}`);
  }

  /**
   * Get node from store (handles both mock and real modes)
   */
  private getNode(nodeId: string, store: ReturnType<typeof useInterBrainStore.getState>): DreamNode | null {
    const realNodeData = store.realNodes.get(nodeId);
    return realNodeData?.node || null;
  }

  /**
   * Check if media is loaded for a node
   */
  isMediaLoaded(nodeId: string): boolean {
    return this.mediaCache.has(nodeId);
  }

  /**
   * Clear media cache (call on vault rescan)
   */
  clearCache(): void {
    console.log('[MediaLoading] Clearing cache');
    this.mediaCache.clear();
    this.loadingQueue = [];
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number, keys: string[] } {
    return {
      size: this.mediaCache.size,
      keys: Array.from(this.mediaCache.keys())
    };
  }
}

// Singleton instance
let _mediaLoadingServiceInstance: MediaLoadingService | null = null;

export function initializeMediaLoadingService(): void {
  _mediaLoadingServiceInstance = new MediaLoadingService();
  console.log('[MediaLoading] Service initialized');
}

export function getMediaLoadingService(): MediaLoadingService {
  if (!_mediaLoadingServiceInstance) {
    throw new Error('MediaLoadingService not initialized. Call initializeMediaLoadingService() first.');
  }
  return _mediaLoadingServiceInstance;
}
