/**
 * EphemeralNodeManager Component
 *
 * Manages the lifecycle of ephemeral nodes - nodes that are not part of the
 * constellation filter but need to be temporarily mounted for features like:
 * - Liminal web navigation (related nodes not in constellation)
 * - Semantic search results (nodes beyond the mounted limit)
 * - Edge click (revealing parent DreamNode not in constellation)
 *
 * This component:
 * 1. Listens for orchestrator requests that reference unmounted nodes
 * 2. Spawns ephemeral nodes with calculated spawn positions
 * 3. Tracks mounted ephemeral nodes for garbage collection
 * 4. Cleans up ephemeral nodes when no longer needed
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { useInterBrainStore } from '../store/interbrain-store';
import { calculateSpawnPosition, DEFAULT_EPHEMERAL_SPAWN_CONFIG } from '../../features/constellation-layout/utils/EphemeralSpawning';

export interface EphemeralNodeManagerProps {
  /** Callback when an ephemeral node should be spawned */
  onSpawnNode?: (nodeId: string) => void;
  /** Callback when an ephemeral node should be despawned */
  onDespawnNode?: (nodeId: string) => void;
}

/**
 * Hook for spawning ephemeral nodes from other components
 *
 * Returns a function that checks if a node is mounted and spawns it
 * as ephemeral if not.
 */
export function useEphemeralSpawner() {
  const dreamNodesMap = useInterBrainStore(state => state.dreamNodes);
  const constellationFilter = useInterBrainStore(state => state.constellationFilter);
  const ephemeralNodes = useInterBrainStore(state => state.ephemeralNodes);
  const spawnEphemeralNode = useInterBrainStore(state => state.spawnEphemeralNode);

  /**
   * Ensure a node is mounted, spawning it as ephemeral if necessary
   *
   * @param nodeId The node to ensure is mounted
   * @param targetPosition Where the node should animate to
   * @returns true if the node is now mounted (was already or just spawned)
   */
  const ensureNodeMounted = useCallback((
    nodeId: string,
    targetPosition: [number, number, number]
  ): boolean => {
    // Check if node exists in vault
    if (!dreamNodesMap.has(nodeId)) {
      console.warn(`[EphemeralSpawner] Node ${nodeId} not found in dreamNodesMap`);
      return false;
    }

    // Check if already mounted in constellation
    if (constellationFilter.mountedNodes.has(nodeId)) {
      return true; // Already mounted
    }

    // Check if already spawned as ephemeral
    if (ephemeralNodes.has(nodeId)) {
      return true; // Already ephemeral
    }

    // Need to spawn as ephemeral
    const spawnPosition = calculateSpawnPosition(
      targetPosition,
      DEFAULT_EPHEMERAL_SPAWN_CONFIG.spawnRadiusFactor
    );

    console.log(`[EphemeralSpawner] Spawning ephemeral node ${nodeId}`, {
      from: spawnPosition,
      to: targetPosition
    });

    spawnEphemeralNode(nodeId, targetPosition, spawnPosition);
    return true;
  }, [dreamNodesMap, constellationFilter.mountedNodes, ephemeralNodes, spawnEphemeralNode]);

  /**
   * Check if a node is currently mounted (constellation or ephemeral)
   */
  const isNodeMounted = useCallback((nodeId: string): boolean => {
    return constellationFilter.mountedNodes.has(nodeId) || ephemeralNodes.has(nodeId);
  }, [constellationFilter.mountedNodes, ephemeralNodes]);

  /**
   * Check if a node is ephemeral (not in constellation, dynamically spawned)
   */
  const isNodeEphemeral = useCallback((nodeId: string): boolean => {
    return ephemeralNodes.has(nodeId);
  }, [ephemeralNodes]);

  return {
    ensureNodeMounted,
    isNodeMounted,
    isNodeEphemeral
  };
}

/**
 * Hook for garbage collecting ephemeral nodes
 *
 * Returns functions for cleaning up ephemeral nodes when they're no longer needed.
 */
export function useEphemeralGarbageCollector() {
  const despawnEphemeralNode = useInterBrainStore(state => state.despawnEphemeralNode);
  const clearEphemeralNodes = useInterBrainStore(state => state.clearEphemeralNodes);

  /**
   * Mark an ephemeral node for garbage collection
   * The node should animate out before this is called
   */
  const collectNode = useCallback((nodeId: string) => {
    console.log(`[EphemeralGC] Collecting ephemeral node ${nodeId}`);
    despawnEphemeralNode(nodeId);
  }, [despawnEphemeralNode]);

  /**
   * Clear all ephemeral nodes (e.g., when returning to constellation)
   */
  const collectAllNodes = useCallback(() => {
    console.log('[EphemeralGC] Clearing all ephemeral nodes');
    clearEphemeralNodes();
  }, [clearEphemeralNodes]);

  return {
    collectNode,
    collectAllNodes
  };
}

/**
 * EphemeralNodeManager Component
 *
 * This is a "headless" component that manages ephemeral node state.
 * The actual rendering of ephemeral nodes happens in DreamspaceCanvas
 * through the dreamNodes filtering logic.
 *
 * This component's primary role is to clean up stale ephemeral nodes
 * and respond to spatial layout changes.
 */
export function EphemeralNodeManager({ onSpawnNode, onDespawnNode }: EphemeralNodeManagerProps) {
  const spatialLayout = useInterBrainStore(state => state.spatialLayout);
  const ephemeralNodes = useInterBrainStore(state => state.ephemeralNodes);
  const clearEphemeralNodes = useInterBrainStore(state => state.clearEphemeralNodes);
  const prevLayoutRef = useRef(spatialLayout);

  // Clean up ephemeral nodes when returning to constellation
  useEffect(() => {
    const prevLayout = prevLayoutRef.current;
    prevLayoutRef.current = spatialLayout;

    if (spatialLayout === 'constellation' && prevLayout !== 'constellation') {
      // Transitioning to constellation - clear ephemeral nodes
      // The DreamNode3D components should animate out before this triggers
      console.log('[EphemeralNodeManager] Clearing ephemeral nodes on constellation return');
      clearEphemeralNodes();
    }
  }, [spatialLayout, clearEphemeralNodes]);

  // Track spawn/despawn events for callbacks
  const prevEphemeralRef = useRef(new Set<string>());

  useEffect(() => {
    const currentIds = new Set(ephemeralNodes.keys());
    const prevIds = prevEphemeralRef.current;

    // Find newly spawned nodes
    for (const id of currentIds) {
      if (!prevIds.has(id)) {
        onSpawnNode?.(id);
      }
    }

    // Find despawned nodes
    for (const id of prevIds) {
      if (!currentIds.has(id)) {
        onDespawnNode?.(id);
      }
    }

    prevEphemeralRef.current = currentIds;
  }, [ephemeralNodes, onSpawnNode, onDespawnNode]);

  // This is a headless component - no visual output
  return null;
}

export default EphemeralNodeManager;
