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
  degree: number; // 0 = selected, 1 = direct neighbor, 2 = 2nd degree, 10 = viewport
  priority: number; // Lower = higher priority
  distance?: number; // Distance from camera (for viewport-based loading)
}

export class MediaLoadingService {
  private mediaCache: Map<string, { dreamTalkMedia: MediaFile[], dreamSongContent: CanvasFile[] }> = new Map();
  private loadingQueue: MediaLoadTask[] = [];
  private isProcessingQueue = false;
  private maxConcurrentLoads = 3;
  private maxSecondDegreeNodes = 50; // Cap 2nd degree to prevent loading entire graph

  // Viewport-based loading (constellation mode)
  private viewportQueue: Map<string, number> = new Map(); // nodeId -> distance
  private viewportBatchTimer: ReturnType<typeof setTimeout> | null = null;
  private viewportBatchDelay = 100; // 100ms debounce for same-frame batching
  private requestedNodes: Set<string> = new Set(); // Track all requested nodes to prevent duplicate requests

  /**
   * Load all nodes by distance from camera (startup background loading)
   * Phase 1: Immediate FOV nodes (within scaling zone)
   * Phase 2: Remaining nodes by distance (background streaming)
   */
  async loadAllNodesByDistance(): Promise<void> {
    console.log(`[MediaLoading] ⏰ ${Date.now()} - 🎬 START loadAllNodesByDistance()`);

    const store = useInterBrainStore.getState();
    const allNodeIds = Array.from(store.realNodes.keys());

    if (allNodeIds.length === 0) {
      console.log('[MediaLoading] No nodes to load');
      return;
    }

    console.log(`[MediaLoading] ⏰ ${Date.now()} - Found ${allNodeIds.length} nodes to process`);

    // Calculate distance for each node from FOV center (0, 0, 1500)
    const FOV_CENTER = { x: 0, y: 0, z: 1500 }; // DEFAULT_SCALING_CONFIG.intersectionPoint
    const FOV_OUTER_RADIUS = 3000; // DEFAULT_SCALING_CONFIG.outerRadius

    // Process nodes in chunks to avoid blocking
    const CHUNK_SIZE = 10;
    const fovTasks: MediaLoadTask[] = [];
    const backgroundTasks: MediaLoadTask[] = [];

    console.log(`[MediaLoading] ⏰ ${Date.now()} - Processing first chunk of ${CHUNK_SIZE} nodes synchronously...`);
    // Process first chunk immediately to start FOV loading ASAP
    for (let i = 0; i < Math.min(CHUNK_SIZE, allNodeIds.length); i++) {
      const nodeId = allNodeIds[i];
      const nodeData = store.realNodes.get(nodeId);
      if (!nodeData) continue;

      const pos = nodeData.node.position;
      if (!pos) continue;

      const distance = Math.sqrt(
        Math.pow(pos[0] - FOV_CENTER.x, 2) +
        Math.pow(pos[1] - FOV_CENTER.y, 2) +
        Math.pow(pos[2] - FOV_CENTER.z, 2)
      );

      const task: MediaLoadTask = {
        nodeId,
        degree: distance < FOV_OUTER_RADIUS ? 0 : 10,
        priority: distance < FOV_OUTER_RADIUS ? distance : 10000 + distance,
        distance
      };

      this.requestedNodes.add(nodeId);

      if (distance < FOV_OUTER_RADIUS) {
        fovTasks.push(task);
      } else {
        backgroundTasks.push(task);
      }
    }

    // Add first batch and start processing immediately
    this.loadingQueue.push(...fovTasks, ...backgroundTasks);
    console.log(`[MediaLoading] ⏰ ${Date.now()} - Phase 1 batch: ${fovTasks.length} FOV nodes, ${backgroundTasks.length} background`);
    console.log(`[MediaLoading] ⏰ ${Date.now()} - 🚀 Starting processQueue() for first batch (NON-BLOCKING)`);

    // Start processing first batch (non-blocking)
    if (!this.isProcessingQueue) {
      this.processQueue();
    }

    console.log(`[MediaLoading] ⏰ ${Date.now()} - ✅ END loadAllNodesByDistance() - processQueue() running in background`);

    // Process remaining nodes in background (async, non-blocking)
    setTimeout(() => {
      console.log(`[MediaLoading] ⏰ ${Date.now()} - Processing remaining ${allNodeIds.length - CHUNK_SIZE} nodes in setTimeout...`);
      const remainingFovTasks: MediaLoadTask[] = [];
      const remainingBackgroundTasks: MediaLoadTask[] = [];

      for (let i = CHUNK_SIZE; i < allNodeIds.length; i++) {
        const nodeId = allNodeIds[i];
        const nodeData = store.realNodes.get(nodeId);
        if (!nodeData) continue;

        const pos = nodeData.node.position;
        if (!pos) continue;

        const distance = Math.sqrt(
          Math.pow(pos[0] - FOV_CENTER.x, 2) +
          Math.pow(pos[1] - FOV_CENTER.y, 2) +
          Math.pow(pos[2] - FOV_CENTER.z, 2)
        );

        const task: MediaLoadTask = {
          nodeId,
          degree: distance < FOV_OUTER_RADIUS ? 0 : 10,
          priority: distance < FOV_OUTER_RADIUS ? distance : 10000 + distance,
          distance
        };

        this.requestedNodes.add(nodeId);

        if (distance < FOV_OUTER_RADIUS) {
          remainingFovTasks.push(task);
        } else {
          remainingBackgroundTasks.push(task);
        }
      }

      // Sort by priority
      remainingFovTasks.sort((a, b) => a.priority - b.priority);
      remainingBackgroundTasks.sort((a, b) => a.priority - b.priority);

      // Add to queue
      this.loadingQueue.push(...remainingFovTasks, ...remainingBackgroundTasks);
      console.log(`[MediaLoading] ⏰ ${Date.now()} - Phase 2 batch: ${remainingFovTasks.length} FOV nodes, ${remainingBackgroundTasks.length} background`);
    }, 0);
  }

  /**
   * Load media for a node and its 2-degree neighborhood
   * Smart: Only loads nodes not already cached (no-op if all loaded)
   */
  async loadNodeWithNeighborhood(selectedNodeId: string): Promise<void> {
    console.log(`[MediaLoading] Loading neighborhood for ${selectedNodeId}`);

    // Build relationship graph (2 degrees)
    const visited = new Set<string>();
    const queue: MediaLoadTask[] = [{ nodeId: selectedNodeId, degree: 0, priority: 0 }];
    const nodesToLoad: MediaLoadTask[] = [];

    while (queue.length > 0) {
      const task = queue.shift()!;

      if (visited.has(task.nodeId) || task.degree > 2) continue;
      visited.add(task.nodeId);

      // Only add to load list if not already cached
      if (!this.mediaCache.has(task.nodeId)) {
        nodesToLoad.push(task);
      }

      // Queue neighbors if within degree limit
      if (task.degree < 2) {
        const store = useInterBrainStore.getState();
        const node = this.getNode(task.nodeId, store);

        if (node) {
          const neighbors = [
            ...(node.liminalWebConnections || []),
            ...(node.submodules || []),
            ...(node.supermodules || [])
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

    // Early exit if all nodes already cached
    if (nodesToLoad.length === 0) {
      console.log(`[MediaLoading] All neighborhood nodes already loaded (cache hit)`);
      return;
    }

    // Cap 2nd degree nodes to prevent loading too much
    const cappedNodesToLoad = nodesToLoad.slice(0, this.maxSecondDegreeNodes);

    console.log(`[MediaLoading] Queuing ${cappedNodesToLoad.length} uncached nodes (${nodesToLoad.length - cappedNodesToLoad.length} capped)`);

    // Sort by priority (degree 0 first, then 1, then 2)
    cappedNodesToLoad.sort((a, b) => a.priority - b.priority);

    // Prepend to loading queue (higher priority than background streaming)
    this.loadingQueue.unshift(...cappedNodesToLoad);

    // Re-sort queue to respect priorities
    this.loadingQueue.sort((a, b) => a.priority - b.priority);

    // Start processing queue if not already running
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  /**
   * Process loading queue with concurrency control
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      console.log(`[MediaLoading] ⏰ ${Date.now()} - ⚠️ processQueue() already running, skipping`);
      return;
    }
    this.isProcessingQueue = true;
    console.log(`[MediaLoading] ⏰ ${Date.now()} - 🔄 processQueue() STARTED - queue size: ${this.loadingQueue.length}`);

    const activeLoads: Promise<void>[] = [];

    while (this.loadingQueue.length > 0) {
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

    // Don't wait for remaining loads - let them complete in background
    console.log(`[MediaLoading] ⏰ ${Date.now()} - Queue exhausted, ${activeLoads.length} loads still running in background`);

    // Clean up remaining loads in background without blocking
    Promise.all(activeLoads).then(() => {
      this.isProcessingQueue = false;
      console.log(`[MediaLoading] ⏰ ${Date.now()} - ✅ All background loads COMPLETE`);
    });
  }

  /**
   * Load media for a single node
   */
  private async loadNodeMedia(nodeId: string): Promise<void> {
    console.log(`[MediaLoading] ⏰ ${Date.now()} - 📥 START loading media for ${nodeId.slice(0, 8)}...`);
    const store = useInterBrainStore.getState();
    const node = this.getNode(nodeId, store);

    if (!node) {
      console.warn(`[MediaLoading] Node not found: ${nodeId}`);
      return;
    }

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
    // Use setTimeout to ensure each update gets its own event loop tick and React render
    setTimeout(() => {
      console.log(`[MediaLoading] ⏰ ${Date.now()} - 💾 Updating store for ${node.name}`);
      const existingData = store.realNodes.get(nodeId);
      if (existingData) {
        const updatedData = {
          ...existingData,
          node: {
            ...existingData.node,
            dreamTalkMedia,
            dreamSongContent
          }
        };

        store.updateRealNode(nodeId, updatedData);
        console.log(`[MediaLoading] ⏰ ${Date.now()} - ✅ Media loaded and stored for ${node.name}`);
      }
    }, 1); // 1ms is enough to create a new event loop tick
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
   * Request viewport-based media loading (constellation mode)
   * Debounced batch processing - called from DreamNode3D useFrame
   */
  requestViewportLoad(nodeId: string, distance: number): void {
    // Skip if already loaded, already requested, or currently in loading queue
    if (this.mediaCache.has(nodeId) || this.requestedNodes.has(nodeId)) {
      return;
    }

    // Mark as requested to prevent duplicate requests
    this.requestedNodes.add(nodeId);

    // Add to viewport queue with distance priority
    this.viewportQueue.set(nodeId, distance);

    // Debounce batch processing (100ms to catch same-frame requests)
    if (this.viewportBatchTimer) {
      clearTimeout(this.viewportBatchTimer);
    }

    this.viewportBatchTimer = setTimeout(() => {
      this.processViewportQueue();
    }, this.viewportBatchDelay);
  }

  /**
   * Process queued viewport loads as low-priority background tasks
   * Sorted by distance - closest nodes load first
   */
  private async processViewportQueue(): Promise<void> {
    if (this.viewportQueue.size === 0) {
      return;
    }

    // Convert to array and sort by distance (closest first)
    const nodesToLoad = Array.from(this.viewportQueue.entries())
      .sort((a, b) => a[1] - b[1]); // Sort by distance (smaller = closer)

    this.viewportQueue.clear();

    console.log(`[MediaLoading] Processing ${nodesToLoad.length} viewport nodes by distance`);

    // Add to loading queue with distance-based priority
    const viewportTasks: MediaLoadTask[] = nodesToLoad.map(([nodeId, distance]) => ({
      nodeId,
      degree: 10, // Viewport loads (lower priority than relationship-based)
      priority: 10 + distance, // Closer nodes = lower priority number = load first
      distance
    }));

    // Append to existing queue (after relationship-based loads)
    this.loadingQueue.push(...viewportTasks);

    // Re-sort entire queue to respect distance priorities
    this.loadingQueue.sort((a, b) => a.priority - b.priority);

    // Trigger queue processing if not already running
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  /**
   * Clear media cache (call on vault rescan)
   */
  clearCache(): void {
    console.log('[MediaLoading] Clearing cache');
    this.mediaCache.clear();
    this.loadingQueue = [];
    this.viewportQueue.clear();
    this.requestedNodes.clear();
    if (this.viewportBatchTimer) {
      clearTimeout(this.viewportBatchTimer);
      this.viewportBatchTimer = null;
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
