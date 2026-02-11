/**
 * SpatialOrchestrator Component
 * 
 * Central hub for all spatial layouts and interactions in the dreamspace.
 * Manages DreamNode3D refs and orchestrates position changes via Universal Movement API.
 * 
 * Follows the "test command pattern" from VALUABLE_WORK_EXTRACTION.md:
 * - Pure animation orchestrator
 * - No store updates (that's Step 5)
 * - Direct animation calls on existing refs
 * - Same nodes stay rendered throughout
 */

import React, { useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
import { Vector3, Group, Quaternion } from 'three';
import { DreamNode } from '../../features/dreamnode';
import type { DreamNode3DRef } from '../../features/dreamnode/components/DreamNode3D';
import { buildRelationshipGraph, calculateRingLayoutPositions, calculateRingLayoutPositionsForSearch, DEFAULT_RING_CONFIG } from '../../features/liminal-web-layout';
import { computeConstellationLayout, createFallbackLayout } from '../../features/constellation-layout/ConstellationLayout';
import { computeConstellationFilter } from '../../features/constellation-layout/services/constellation-filter-service';
import { calculateSpawnPosition, calculateExitPosition, DEFAULT_EPHEMERAL_SPAWN_CONFIG } from '../../features/constellation-layout/utils/EphemeralSpawning';
import { useInterBrainStore } from '../store/interbrain-store';
import { queueEphemeralDespawn, cancelEphemeralDespawn } from '../services/ephemeral-despawn-queue';
import type { LayoutIntent, NodeTargetState, LayoutSnapshot } from '../orchestration/types';
import { LAYOUT_SNAPSHOT_VERSION } from '../orchestration/types';
import { saveLayoutSnapshot, clearLayoutSnapshot } from '../orchestration/snapshot-storage';

export interface SpatialOrchestratorRef {
  // === NEW UNIFIED API ===
  /**
   * Execute a layout intent, dispatching target states to all affected nodes.
   * This is the single entry point for all layout transitions in the new architecture.
   *
   * @param intent - The layout intent specifying center and surrounding nodes
   * @param duration - Animation duration in ms (default: 1000)
   */
  executeLayoutIntent: (intent: LayoutIntent, duration?: number) => void;

  /**
   * Get related node IDs for a given node (opposite type connections).
   * Used by callers to derive LayoutIntent for LIMINAL_WEB mode.
   *
   * @param nodeId - The center node ID
   * @returns Array of related node IDs (Dreams if center is Dreamer, vice versa)
   */
  getRelatedNodeIds: (nodeId: string) => string[];

  /**
   * Send all background constellation nodes home (to anchor or scaled position).
   * Used when entering a non-constellation mode (search, etc.) that needs
   * background nodes to animate away without a full layout intent.
   */
  sendConstellationNodesHome: (duration?: number) => void;

  /**
   * Temporarily hide ring nodes (for option key radial button toggle).
   * Unlike executeLayoutIntent, this does NOT despawn ephemeral nodes —
   * they animate to exit positions but stay mounted for immediate recall.
   * Persistent nodes animate to anchor with easeInQuart.
   */
  hideRingNodes: (duration?: number) => void;

  /**
   * Show ring nodes back after hideRingNodes (for option key release).
   * Recalculates ring positions from current center and relationship graph,
   * then animates all ring nodes (including preserved ephemerals) back.
   */
  showRingNodes: (duration?: number) => void;

  /**
   * Restore layout state from a saved snapshot.
   * Called on app mount to instantly restore the previous layout without animation.
   *
   * @param snapshot - The saved layout snapshot
   */
  restoreFromSnapshot: (snapshot: LayoutSnapshot) => void;

  // ════════════════════════════════════════════════════════════════════════════
  // ⛔ LEGACY API - DO NOT USE ⛔
  // ════════════════════════════════════════════════════════════════════════════
  // These methods are part of the old orchestration system with ~50 scattered
  // primitives. They are commented out in the implementation to prevent drift.
  //
  // THE NEW UNIFIED SYSTEM uses only:
  //   1. executeLayoutIntent(intent: LayoutIntent, duration?)
  //   2. getRelatedNodeIds(nodeId: string)
  //
  // The new system is based on the state machine defined in:
  //   docs/architecture/layout-state-machine.md
  //
  // Flow: Event → deriveIntent() → executeLayoutIntent() → setTargetState()
  // ════════════════════════════════════════════════════════════════════════════

  /** @deprecated Use executeLayoutIntent with deriveFocusIntent instead */
  focusOnNode: (nodeId: string) => void;

  /** @deprecated Use executeLayoutIntent with deriveFocusIntent instead */
  focusOnNodeWithFlyIn: (nodeId: string, newNodeId: string) => void;

  /** @deprecated Use executeLayoutIntent with deriveConstellationIntent instead */
  returnToConstellation: () => void;

  /** @deprecated Use executeLayoutIntent - interruption is handled automatically */
  interruptAndFocusOnNode: (nodeId: string) => void;

  /** @deprecated Use executeLayoutIntent - interruption is handled automatically */
  interruptAndReturnToConstellation: () => void;

  /** Get current focused node ID - still valid */
  getFocusedNodeId: () => string | null;

  /** Check if currently in focused mode - still valid */
  isFocusedMode: () => boolean;

  /** @deprecated Use executeLayoutIntent with deriveSearchIntent instead */
  showSearchResults: (searchResults: DreamNode[]) => void;

  /** @deprecated Use executeLayoutIntent instead */
  moveAllToSphereForSearch: () => void;

  /** @deprecated Use executeLayoutIntent instead */
  animateToLiminalWebFromEdit: (nodeId: string) => void;

  /** @deprecated Use executeLayoutIntent instead */
  showEditModeSearchResults: (centerNodeId: string, searchResults: DreamNode[]) => void;

  /** Reorder edit mode search results - still valid for edit mode */
  reorderEditModeSearchResults: () => void;

  /** Clear stale edit mode data - still valid for edit mode */
  clearEditModeData: () => void;

  /** Register a DreamNode3D ref for orchestration - still valid */
  registerNodeRef: (nodeId: string, ref: React.RefObject<DreamNode3DRef>) => void;

  /** Unregister a DreamNode3D ref - still valid */
  unregisterNodeRef: (nodeId: string) => void;

  /** Apply constellation layout based on relationship graph - still valid */
  applyConstellationLayout: () => Promise<void>;

  /** @deprecated Use executeLayoutIntent with deriveFocusIntent(center, []) instead */
  hideRelatedNodesInLiminalWeb: () => void;

  /** @deprecated Use executeLayoutIntent with deriveFocusIntent(center, relatedIds) instead */
  showRelatedNodesInLiminalWeb: () => void;

  /** Calculate forward position on sphere accounting for current rotation */
  calculateForwardPositionOnSphere: () => [number, number, number];

  /** Get a node's current rendered position (from DreamNode3D ref) */
  getNodeCurrentPosition: (nodeId: string) => [number, number, number] | null;

  /** Show supermodules in rings around the center node (holarchy navigation) */
  showSupermodulesInRings: (centerNodeId: string, supermoduleIds: string[]) => void;

  /** Restore related dreamers in rings (after exiting holarchy view) */
  showDreamersInRings: (centerNodeId: string) => void;
}

interface SpatialOrchestratorProps {
  /** All available dream nodes */
  dreamNodes: DreamNode[];
  
  /** Reference to the rotatable dream world group for position correction */
  dreamWorldRef: React.RefObject<Group | null>;
  
  /** Callback when a node is focused */
  onNodeFocused?: (nodeId: string) => void;
  
  /** Callback when returning to constellation */
  onConstellationReturn?: () => void;
  
  /** Callback when orchestrator is ready to receive refs */
  onOrchestratorReady?: () => void;
  
  /** Animation duration for transitions */
  transitionDuration?: number;
}

/**
 * SpatialOrchestrator - Central hub for spatial layout management
 * 
 * This component doesn't render anything visible itself, but manages all spatial
 * interactions and position orchestration for DreamNode3D components.
 */
const SpatialOrchestrator = forwardRef<SpatialOrchestratorRef, SpatialOrchestratorProps>(({
  dreamNodes,
  dreamWorldRef,
  onNodeFocused,
  onConstellationReturn,
  onOrchestratorReady,
  transitionDuration = 1000
}, ref) => {
  
  // Registry of all DreamNode3D refs for position orchestration
  const nodeRefs = useRef<Map<string, React.RefObject<DreamNode3DRef>>>(new Map());
  
  // Current state tracking
  const focusedNodeId = useRef<string | null>(null);
  const isTransitioning = useRef<boolean>(false);
  const lastFocusTimestamp = useRef<number>(0);
  
  // Track node roles during liminal-web mode for snapshot persistence.
  // Simplified to just center + ordered ring nodes. The ring1/2/3 distinction
  // is layout-internal detail — the orchestrator only needs to know which nodes
  // are participating in the layout, not which ring they're in.
  // NOTE: "Previous active nodes" for transitions is derived from ground truth
  // (querying each node's positionMode), NOT from this cache.
  const liminalWebRoles = useRef<{
    centerNodeId: string | null;
    ringNodeIds: Set<string>;
  }>({
    centerNodeId: null,
    ringNodeIds: new Set()
  });
  
  // Store integration
  const setSpatialLayout = useInterBrainStore(state => state.setSpatialLayout);
  
  // Track current edit mode search results for dynamic reordering
  const currentEditModeSearchResults = useRef<DreamNode[]>([]);
  const currentEditModeCenterNodeId = useRef<string | null>(null);
  
  // Track the stable lists for swapping logic
  const relatedNodesList = useRef<Array<{ id: string; name: string; type: string }>>([]);
  const unrelatedSearchResultsList = useRef<Array<{ id: string; name: string; type: string }>>([]);

  // Queue of pending movements for nodes that are being spawned as ephemeral
  // These will be executed once the node's ref becomes available
  const pendingMovements = useRef<Map<string, {
    position: [number, number, number];
    duration: number;
    easing: string;
    setActive: boolean;
    flipSide?: 'front' | 'back'; // Optional - only set for snapshot restoration
    isSnapshotRestore?: boolean; // If true, this is from snapshot restore and should override spawn animation
    generation: number; // Invalidation token — stale callbacks check this
  }>>(new Map());

  // Generation counter for invalidating stale requestAnimationFrame callbacks.
  // Incremented at the start of each executeLayoutIntent. Any pending rAF callback
  // from a previous generation is stale and should be ignored.
  const layoutGeneration = useRef(0);

  /**
   * Apply inverse world rotation to positions so they appear correct regardless of sphere rotation.
   * This is the key transform that makes layouts appear in camera-relative positions.
   */
  const applyWorldRotationCorrection = (positions: {
    centerNode?: { nodeId: string; position: [number, number, number] } | null;
    ring1Nodes: Array<{ nodeId: string; position: [number, number, number] }>;
    ring2Nodes: Array<{ nodeId: string; position: [number, number, number] }>;
    ring3Nodes: Array<{ nodeId: string; position: [number, number, number] }>;
  }) => {
    if (!dreamWorldRef.current) return;

    const sphereRotation = dreamWorldRef.current.quaternion.clone();
    const inverseRotation = sphereRotation.invert();

    // Transform center node position
    if (positions.centerNode) {
      const centerPos = new Vector3(...positions.centerNode.position);
      centerPos.applyQuaternion(inverseRotation);
      positions.centerNode.position = [centerPos.x, centerPos.y, centerPos.z];
    }

    // Transform all ring node positions
    [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].forEach(node => {
      const pos = new Vector3(...node.position);
      pos.applyQuaternion(inverseRotation);
      node.position = [pos.x, pos.y, pos.z];
    });
  };

  /**
   * Calculate spawn position for ephemeral nodes in camera-relative coordinates.
   * The spawn ring is at z=0 (camera plane), corrected for world rotation.
   */
  const calculateWorldCorrectedSpawnPosition = (
    targetPosition: [number, number, number]
  ): [number, number, number] => {
    // Mirror the exit path exactly:
    // 1. Transform target from world space to camera space (apply Q)
    // 2. Calculate spawn position in camera space (atan2 on camera-space x,y)
    // 3. Transform spawn position back to world space (apply Q^-1)
    //
    // Without step 1, the atan2 direction is computed in world space, which
    // differs from camera space when the DreamWorld group is rotated — causing
    // nodes to all fly in from a biased direction instead of radially.

    let cameraSpaceTarget = [...targetPosition] as [number, number, number];

    if (dreamWorldRef.current) {
      const worldRotation = dreamWorldRef.current.quaternion.clone();
      const targetVec = new Vector3(...targetPosition);
      targetVec.applyQuaternion(worldRotation);
      cameraSpaceTarget = [targetVec.x, targetVec.y, targetVec.z];
    }

    // Calculate spawn position in camera space (direction from camera to target)
    const spawnPos = calculateSpawnPosition(
      cameraSpaceTarget,
      DEFAULT_EPHEMERAL_SPAWN_CONFIG.spawnRadiusFactor
    );

    // If no world rotation, return as-is
    if (!dreamWorldRef.current) {
      return spawnPos;
    }

    // Transform spawn position from camera space back to world space (apply Q^-1)
    const inverseRotation = dreamWorldRef.current.quaternion.clone().invert();
    const spawnVec = new Vector3(spawnPos[0], spawnPos[1], spawnPos[2]);
    spawnVec.applyQuaternion(inverseRotation);

    return [spawnVec.x, spawnVec.y, spawnVec.z];
  };

  /**
   * Ensure a node is mounted, spawning it as ephemeral if necessary.
   * Returns true if the node is/will be mounted, false if the node doesn't exist.
   */
  const ensureNodeMounted = (
    nodeId: string,
    targetPosition: [number, number, number]
  ): boolean => {
    const store = useInterBrainStore.getState();

    // Check if node exists in vault
    if (!store.dreamNodes.has(nodeId)) {
      console.warn(`[Orchestrator] Node ${nodeId} not found in dreamNodes`);
      return false;
    }

    // Check if already mounted in constellation
    if (store.constellationFilter.mountedNodes.has(nodeId)) {
      return true;
    }

    // Check if already spawned as ephemeral — cancel any pending despawn
    // so the node isn't pulled out from under the new layout.
    if (store.ephemeralNodes.has(nodeId)) {
      cancelEphemeralDespawn(nodeId);
      return true;
    }

    // Calculate spawn position with world rotation correction
    const spawnPosition = calculateWorldCorrectedSpawnPosition(targetPosition);

    store.spawnEphemeralNode(nodeId, targetPosition, spawnPosition);
    return true;
  };

  /**
   * Move a node to a position, interrupting any current animation.
   * If the node is not mounted, it will be spawned as ephemeral first.
   * If the node was just spawned, the movement is queued until the ref is available.
   */
  const moveNode = (
    nodeId: string,
    position: [number, number, number],
    duration: number,
    easing: string,
    setActive = true
  ) => {
    // Ensure node is mounted (spawn as ephemeral if needed)
    if (!ensureNodeMounted(nodeId, position)) {
      return; // Node doesn't exist
    }

    const nodeRef = nodeRefs.current.get(nodeId);

    // If node was just spawned as ephemeral, the ref might not exist yet
    // Queue the movement to be executed once the ref becomes available
    if (!nodeRef?.current) {
      const store = useInterBrainStore.getState();
      if (store.ephemeralNodes.has(nodeId)) {
        pendingMovements.current.set(nodeId, { position, duration, easing, setActive });
        return;
      }
      return;
    }

    // Use the new unified API - setTargetState handles interruption automatically
    nodeRef.current.setTargetState(
      {
        mode: 'active',
        position,
        flipSide: 'front' // Legacy helper always uses front
      },
      duration
    );
  };

  /**
   * Return a node to constellation position, interrupting any current animation.
   * For ephemeral nodes, this triggers an exit animation with world rotation correction.
   */
  const returnNodeToConstellation = (nodeId: string, duration: number, _easing: string) => {
    const nodeRef = nodeRefs.current.get(nodeId);
    if (!nodeRef?.current) return;

    // Get world rotation for ephemeral exit animation correction
    const worldRotation = dreamWorldRef.current?.quaternion.clone();

    // Use the new unified API - setTargetState handles interruption automatically
    nodeRef.current.setTargetState({ mode: 'home' }, duration, worldRotation);
  };

  /**
   * Return a node to its scaled constellation position, interrupting any current animation.
   * Note: "scaled position" refers to dynamic view scaling - use setTargetState({ mode: 'home' })
   */
  const returnNodeToScaledPosition = (
    nodeId: string,
    duration: number,
    worldRotation: Quaternion | undefined,
    _easing: string
  ) => {
    const nodeRef = nodeRefs.current.get(nodeId);
    if (!nodeRef?.current) return;

    // Use the new unified API - setTargetState({ mode: 'home' }) handles everything
    nodeRef.current.setTargetState({ mode: 'home' }, duration, worldRotation);
  };

  /**
   * Clear liminal web role tracking.
   */
  const clearLiminalWebRoles = () => {
    liminalWebRoles.current = {
      centerNodeId: null,
      ringNodeIds: new Set()
    };
  };

  /**
   * Build relationship graph from ALL nodes in the store, not just mounted nodes.
   * This ensures liminal web can reference ephemeral nodes that aren't yet mounted.
   */
  const buildFullRelationshipGraph = () => {
    const store = useInterBrainStore.getState();
    const allNodes = Array.from(store.dreamNodes.values()).map(data => data.node);
    return buildRelationshipGraph(allNodes);
  };

  useImperativeHandle(ref, () => ({
    // === NEW UNIFIED API ===
    executeLayoutIntent: (intent: LayoutIntent, duration = 1000) => {
      try {
        const store = useInterBrainStore.getState();
        const worldRotation = dreamWorldRef.current?.quaternion.clone();

        // ══════════════════════════════════════════════════════════════════════
        // STEP 0: INVALIDATE STALE PENDING MOVEMENTS
        // Increment the generation counter so any requestAnimationFrame callbacks
        // from a previous executeLayoutIntent (e.g., startup) will see they're
        // stale and skip execution. Also clear the pending movements map.
        // ══════════════════════════════════════════════════════════════════════
        layoutGeneration.current++;
        pendingMovements.current.clear();

        // Derive previous active nodes from ground truth — ask each mounted
        // node directly: "are you currently active?"
        const previousActiveNodes = new Set<string>();
        nodeRefs.current.forEach((nodeRef, nodeId) => {
          if (nodeRef.current?.getPositionMode() === 'active') {
            previousActiveNodes.add(nodeId);
          }
        });

        console.log(`[Orchestrator] Previous active nodes (from ground truth): ${previousActiveNodes.size}`, [...previousActiveNodes]);

        // Build target state map for all nodes
        const targetStates = new Map<string, NodeTargetState>();

        // 1. Center node (if any)
        if (intent.center) {
          // Calculate center position (fixed forward position)
          const centerPos: [number, number, number] = [0, 0, -50];

          // Apply world rotation correction
          let correctedCenterPos = centerPos;
          if (worldRotation) {
            const inverseRotation = worldRotation.clone().invert();
            const centerVec = new Vector3(...centerPos);
            centerVec.applyQuaternion(inverseRotation);
            correctedCenterPos = [centerVec.x, centerVec.y, centerVec.z];
          }

          targetStates.set(intent.center.nodeId, {
            mode: 'active',
            position: correctedCenterPos,
            flipSide: intent.center.flipSide
          });

          // Update focused node tracking
          focusedNodeId.current = intent.center.nodeId;
        } else {
          focusedNodeId.current = null;
        }

        // 2. Ring nodes (all show front side)
        const ringNodeIds = new Set<string>();

        if (intent.surroundingNodes.length > 0) {
          // Use existing ring layout calculation
          const relationshipGraph = buildFullRelationshipGraph();
          const orderedNodes = intent.surroundingNodes.map(id => {
            const nodeData = store.dreamNodes.get(id);
            return {
              id,
              name: nodeData?.node?.name || id,
              type: nodeData?.node?.type || 'Dream'
            };
          });

          const positions = calculateRingLayoutPositionsForSearch(
            orderedNodes,
            relationshipGraph,
            DEFAULT_RING_CONFIG
          );

          // Apply world rotation correction to ring positions
          const allRingNodes = [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes];
          if (worldRotation) {
            const inverseRotation = worldRotation.clone().invert();
            allRingNodes.forEach(node => {
              const pos = new Vector3(...node.position);
              pos.applyQuaternion(inverseRotation);
              node.position = [pos.x, pos.y, pos.z];
            });
          }

          // Add ring nodes to target states
          allRingNodes.forEach(({ nodeId, position }) => {
            targetStates.set(nodeId, {
              mode: 'active',
              position,
              flipSide: 'front' // Ring nodes always show front
            });
            ringNodeIds.add(nodeId);
          });
        }

        // Update role tracking for snapshot persistence
        liminalWebRoles.current = {
          centerNodeId: intent.center?.nodeId || null,
          ringNodeIds
        };
        console.log(`[Orchestrator] Updated liminalWebRoles: center=${liminalWebRoles.current.centerNodeId}, ring=${ringNodeIds.size}`);

        // ══════════════════════════════════════════════════════════════════════
        // SNAPSHOT: Save layout state for instant restoration on reload
        // ══════════════════════════════════════════════════════════════════════
        const isConstellationMode = !intent.center && intent.surroundingNodes.length === 0;

        if (isConstellationMode) {
          // Returning to constellation - clear the snapshot
          // Constellation is the default state, no snapshot needed
          clearLayoutSnapshot();
          store.setSpatialLayout('constellation');
          store.setSelectedNode(null);
        } else {
          // Active layout - save snapshot for restoration
          const sphereRotation = worldRotation
            ? { x: worldRotation.x, y: worldRotation.y, z: worldRotation.z, w: worldRotation.w }
            : { x: 0, y: 0, z: 0, w: 1 };

          // Build activeNodes from targetStates (only active mode nodes)
          const activeNodes: LayoutSnapshot['activeNodes'] = {};
          targetStates.forEach((target, nodeId) => {
            if (target.mode === 'active') {
              activeNodes[nodeId] = {
                position: target.position,
                flipSide: target.flipSide
              };
            }
          });

          const snapshot: LayoutSnapshot = {
            // Note: holarchy is visually a sub-state of liminal-web (center is flipped to back)
            // The flipSide in activeNodes[centerId].flipSide captures this distinction
            layoutState: 'liminal-web',
            activeNodes,
            sphereRotation,
            centerId: intent.center?.nodeId || null,
            ringNodeIds: [...ringNodeIds],
            timestamp: Date.now(),
            version: LAYOUT_SNAPSHOT_VERSION,
          };

          // Save snapshot (fire-and-forget)
          saveLayoutSnapshot(snapshot);

          // Update store state as side effect
          // Preserve layouts that manage their own spatialLayout (search, copilot, edit modes)
          const currentLayout = store.spatialLayout;
          if (currentLayout !== 'search' && currentLayout !== 'copilot' &&
              currentLayout !== 'edit' && currentLayout !== 'relationship-edit') {
            store.setSpatialLayout('liminal-web');
          }
          if (intent.center) {
            const centerNode = store.dreamNodes.get(intent.center.nodeId)?.node;
            if (centerNode) {
              store.setSelectedNode(centerNode);
            }
          }
        }

        // 3. All other previously-active nodes go home
        // ══════════════════════════════════════════════════════════════════════
        // KEY INSIGHT: We use the snapshot taken at STEP 0, NOT liminalWebRoles.current
        // (which has now been updated to the NEW layout). This ensures we identify
        // nodes that were in the OLD layout but aren't in the NEW layout.
        // ══════════════════════════════════════════════════════════════════════
        const nodesToSendHome: string[] = [];
        previousActiveNodes.forEach(nodeId => {
          if (!targetStates.has(nodeId)) {
            targetStates.set(nodeId, { mode: 'home' });
            nodesToSendHome.push(nodeId);
          }
        });

        if (nodesToSendHome.length > 0) {
          console.log(`[Orchestrator] Sending ${nodesToSendHome.length} nodes home:`, nodesToSendHome);
        }

        // 3b. Background constellation nodes: send home too
        // When entering any non-constellation layout (liminal-web, search, etc.),
        // background persistent nodes need to animate from their scaled positions
        // to raw anchors. When returning to constellation, they animate to scaled positions.
        // The node's setTargetState({ mode: 'home' }) reads the fresh spatialLayout
        // from the store to decide which target to use.
        if (duration > 0) {
          const backgroundNodesSent: string[] = [];
          const skippedNodes: { nodeId: string; reason: string }[] = [];
          store.constellationFilter.mountedNodes.forEach(nodeId => {
            if (targetStates.has(nodeId)) {
              skippedNodes.push({ nodeId, reason: 'already in targetStates' });
              return;
            }
            const nodeRef = nodeRefs.current.get(nodeId);
            if (!nodeRef?.current) {
              skippedNodes.push({ nodeId, reason: 'no ref' });
              return;
            }
            const posMode = nodeRef.current.getPositionMode();
            if (posMode !== 'constellation') {
              skippedNodes.push({ nodeId, reason: `positionMode=${posMode}` });
              return;
            }
            targetStates.set(nodeId, { mode: 'home' });
            backgroundNodesSent.push(nodeId);
          });
          console.log(`[Orchestrator] Background nodes: ${store.constellationFilter.mountedNodes.size} mounted, ${backgroundNodesSent.length} sent home, ${skippedNodes.length} skipped`, skippedNodes);
        }

        // 4. Ensure ephemeral nodes are mounted if needed
        const EPHEMERAL_SPAWN_INTERVAL_MS = 40;
        const nodesToSpawn: Array<{ nodeId: string; targetPos: [number, number, number] }> = [];

        targetStates.forEach((target, nodeId) => {
          if (target.mode === 'active') {
            // Check if node needs to be spawned as ephemeral
            if (!store.constellationFilter.mountedNodes.has(nodeId)) {
              if (!store.ephemeralNodes.has(nodeId)) {
                nodesToSpawn.push({ nodeId, targetPos: target.position });
              } else {
                // Cancel any pending despawn
                cancelEphemeralDespawn(nodeId);
              }
            }
          }
        });

        // Spawn ephemeral nodes - stagger for animated transitions, instant for duration=0
        if (duration === 0) {
          // Instant mount: spawn all ephemeral nodes immediately, at target position (no fly-in)
          nodesToSpawn.forEach(({ nodeId, targetPos }) => {
            store.spawnEphemeralNode(nodeId, targetPos, targetPos);
          });
        } else {
          // Animated: stagger ephemeral spawns for smooth cascading
          nodesToSpawn.forEach(({ nodeId, targetPos }, index) => {
            globalThis.setTimeout(() => {
              const spawnPos = calculateWorldCorrectedSpawnPosition(targetPos);
              useInterBrainStore.getState().spawnEphemeralNode(nodeId, targetPos, spawnPos);
            }, index * EPHEMERAL_SPAWN_INTERVAL_MS);
          });
        }

        // 5. Dispatch target states to all nodes
        console.log(`[Orchestrator] Dispatching ${targetStates.size} target states:`);
        targetStates.forEach((target, nodeId) => {
          console.log(`[Orchestrator]   - ${nodeId}: mode=${target.mode}, position=${target.mode === 'active' ? JSON.stringify(target.position) : 'N/A'}`);

          // Emphasis node gets 1.2x duration + easeOutCubic for dramatic entrance
          const isEmphasis = intent.emphasisNodeId === nodeId;
          const nodeDuration = isEmphasis ? Math.round(duration * 1.2) : duration;
          const nodeEasing = isEmphasis ? 'easeOutCubic' as const : undefined;

          const nodeRef = nodeRefs.current.get(nodeId);

          // If ref not available yet, queue the movement.
          // This happens for both ephemeral nodes being spawned AND constellation-mounted
          // nodes whose useImperativeHandle hasn't populated the ref yet (e.g., at startup).
          if (!nodeRef?.current) {
            console.log(`[Orchestrator]   -> NO REF for ${nodeId}, queuing movement`);
            pendingMovements.current.set(nodeId, {
              position: target.mode === 'active' ? target.position : [0, 0, 0],
              duration: nodeDuration,
              easing: nodeEasing || 'easeOutQuart',
              setActive: true,
              flipSide: target.mode === 'active' ? target.flipSide : 'front',
              isSnapshotRestore: duration === 0, // Instant mount overrides spawn animation
              generation: layoutGeneration.current
            });
            return;
          }

          // Use the new setTargetState API
          console.log(`[Orchestrator]   -> Calling setTargetState for ${nodeId}`);
          nodeRef.current.setTargetState(target, nodeDuration, worldRotation, nodeEasing);
        });

        // Update transition state
        isTransitioning.current = true;
        globalThis.setTimeout(() => {
          isTransitioning.current = false;
        }, duration);

      } catch (error) {
        console.error('[Orchestrator] executeLayoutIntent failed:', error);
      }
    },

    sendConstellationNodesHome: (duration = 1000) => {
      const store = useInterBrainStore.getState();
      const worldRotation = dreamWorldRef.current?.quaternion.clone();
      let count = 0;
      store.constellationFilter.mountedNodes.forEach(nodeId => {
        const nodeRef = nodeRefs.current.get(nodeId);
        if (nodeRef?.current && nodeRef.current.getPositionMode() === 'constellation') {
          nodeRef.current.setTargetState({ mode: 'home' }, duration, worldRotation);
          count++;
        }
      });
      console.log(`[Orchestrator] sendConstellationNodesHome: sent ${count} nodes home`);
    },

    hideRingNodes: (duration = 500) => {
      const ringNodeIds = [...liminalWebRoles.current.ringNodeIds];
      if (ringNodeIds.length === 0) return;

      const worldRotation = dreamWorldRef.current?.quaternion.clone();

      ringNodeIds.forEach(nodeId => {
        const nodeRef = nodeRefs.current.get(nodeId);
        if (!nodeRef?.current) return;

        // Get current position in camera space for exit direction calculation
        const currentPos = nodeRef.current.getCurrentPosition();
        let cameraSpacePos = [...currentPos] as [number, number, number];
        if (worldRotation) {
          const posVec = new Vector3(...currentPos);
          posVec.applyQuaternion(worldRotation);
          cameraSpacePos = [posVec.x, posVec.y, posVec.z];
        }

        // Calculate exit position (same direction, at spawn ring radius)
        const exitPos = calculateExitPosition(
          cameraSpacePos,
          DEFAULT_EPHEMERAL_SPAWN_CONFIG.exitRadiusFactor,
          false // ring nodes are never center
        );

        // Convert back to world space
        let worldExitPos = [...exitPos] as [number, number, number];
        if (worldRotation) {
          const exitVec = new Vector3(...exitPos);
          const inverseRotation = worldRotation.clone().invert();
          exitVec.applyQuaternion(inverseRotation);
          worldExitPos = [exitVec.x, exitVec.y, exitVec.z];
        }

        // Animate to exit position — using 'active' mode so no despawn/home logic triggers
        // easeInQuart: slow start, fast end (nodes accelerate away)
        nodeRef.current.setTargetState(
          { mode: 'active', position: worldExitPos, flipSide: 'front' },
          duration,
          worldRotation,
          'easeInQuart'
        );
      });

      console.log(`[Orchestrator] hideRingNodes: animated ${ringNodeIds.length} nodes to exit positions`);
    },

    showRingNodes: (duration = 500) => {
      const centerId = liminalWebRoles.current.centerNodeId;
      if (!centerId) return;

      const worldRotation = dreamWorldRef.current?.quaternion.clone();

      // Recalculate ring positions from current relationship graph
      const relationshipGraph = buildFullRelationshipGraph();
      const positions = calculateRingLayoutPositions(
        centerId,
        relationshipGraph,
        DEFAULT_RING_CONFIG
      );

      // Apply world rotation correction
      if (worldRotation) {
        applyWorldRotationCorrection(positions);
      }

      // Animate ring nodes back to their positions
      const allRingNodes = [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes];
      allRingNodes.forEach(({ nodeId, position }) => {
        const nodeRef = nodeRefs.current.get(nodeId);
        if (!nodeRef?.current) return;

        nodeRef.current.setTargetState(
          { mode: 'active', position, flipSide: 'front' },
          duration,
          worldRotation
        );
      });

      console.log(`[Orchestrator] showRingNodes: animated ${allRingNodes.length} nodes back to ring positions`);
    },

    getRelatedNodeIds: (nodeId: string): string[] => {
      try {
        const relationshipGraph = buildFullRelationshipGraph();
        const relatedNodes = relationshipGraph.getOppositeTypeConnections(nodeId);
        return relatedNodes.map(node => node.id);
      } catch (error) {
        console.error('[Orchestrator] getRelatedNodeIds failed:', error);
        return [];
      }
    },

    restoreFromSnapshot: (snapshot: LayoutSnapshot) => {
      try {
        console.log(`[Orchestrator] Restoring from snapshot: ${snapshot.layoutState}`);

        // 1. Restore liminalWebRoles from snapshot
        liminalWebRoles.current = {
          centerNodeId: snapshot.centerId,
          ringNodeIds: new Set(snapshot.ringNodeIds)
        };

        // 2. Restore focusedNodeId
        focusedNodeId.current = snapshot.centerId;

        // 3. Spawn ephemeral nodes and set their initial positions (instant, no animation)
        const store = useInterBrainStore.getState();
        const EPHEMERAL_SPAWN_INTERVAL_MS = 40;
        const nodesToSpawn: Array<{ nodeId: string; position: [number, number, number] }> = [];

        Object.entries(snapshot.activeNodes).forEach(([nodeId, nodeState]) => {
          // Check if node needs to be spawned as ephemeral
          if (!store.constellationFilter.mountedNodes.has(nodeId)) {
            if (!store.ephemeralNodes.has(nodeId)) {
              nodesToSpawn.push({ nodeId, position: nodeState.position });
            }
          }
        });

        // Stagger ephemeral spawns
        nodesToSpawn.forEach(({ nodeId, position }, index) => {
          globalThis.setTimeout(() => {
            // Spawn at target position directly (no animation from ring)
            useInterBrainStore.getState().spawnEphemeralNode(nodeId, position, position);
          }, index * EPHEMERAL_SPAWN_INTERVAL_MS);
        });

        // 4. Set target states for all active nodes (instant, duration=0)
        Object.entries(snapshot.activeNodes).forEach(([nodeId, nodeState]) => {
          const nodeRef = nodeRefs.current.get(nodeId);

          if (!nodeRef?.current) {
            // Queue for when ref becomes available
            if (store.ephemeralNodes.has(nodeId) || nodesToSpawn.some(n => n.nodeId === nodeId)) {
              pendingMovements.current.set(nodeId, {
                position: nodeState.position,
                duration: 0, // Instant
                easing: 'easeOutQuart',
                setActive: true,
                flipSide: nodeState.flipSide,
                isSnapshotRestore: true // Override spawn animation
              });
            }
            return;
          }

          // Set target state with instant transition (duration=0)
          nodeRef.current.setTargetState(
            {
              mode: 'active',
              position: nodeState.position,
              flipSide: nodeState.flipSide
            },
            0 // Instant - no animation
          );
        });

        console.log(`[Orchestrator] Snapshot restored: ${Object.keys(snapshot.activeNodes).length} active nodes`);
      } catch (error) {
        console.error('[Orchestrator] restoreFromSnapshot failed:', error);
      }
    },

    // ════════════════════════════════════════════════════════════════════════════
    // ⛔ LEGACY API - DO NOT USE ⛔
    // ════════════════════════════════════════════════════════════════════════════
    // These methods are part of the old orchestration system with ~50 scattered
    // primitives. They should NOT be called - use the new unified system instead.
    //
    // THE NEW UNIFIED SYSTEM uses only:
    //   1. executeLayoutIntent(intent: LayoutIntent, duration?)
    //   2. getRelatedNodeIds(nodeId: string)
    //
    // The new system is based on the state machine defined in:
    //   docs/architecture/layout-state-machine.md
    //
    // Flow: Event → deriveIntent() → executeLayoutIntent() → setTargetState()
    //
    // These legacy methods are kept temporarily for backwards compatibility
    // during the migration. They will be fully removed in Phase 6.
    // ════════════════════════════════════════════════════════════════════════════

    // LEGACY - DO NOT USE - Use executeLayoutIntent with deriveFocusIntent instead
    focusOnNode: (nodeId: string) => {
      console.warn('[Orchestrator] ⚠️ LEGACY: focusOnNode called - should use executeLayoutIntent instead');
      try {
        // Deduplicate rapid calls (e.g., direct call + useEffect reaction to same state change).
        const now = globalThis.performance.now();
        if (focusedNodeId.current === nodeId && (now - lastFocusTimestamp.current) < 100) {
          return;
        }
        lastFocusTimestamp.current = now;

        const currentLayout = useInterBrainStore.getState().spatialLayout;
        const isLiminalToLiminal = currentLayout === 'liminal-web';

        // ── Step 1: Snapshot previous state BEFORE mutating anything ──
        // This is critical for liminal→liminal transitions where we need to know
        // which nodes were already on screen (move smoothly) vs new (fly in from ring).
        const previousCenterId = focusedNodeId.current;
        const previousRingNodeIds = new Set(liminalWebRoles.current?.ringNodeIds || []);
        const wasInLiminalWeb = (id: string) => id === previousCenterId || previousRingNodeIds.has(id);

        // ── Step 2: Compute new layout ──
        const relationshipGraph = buildFullRelationshipGraph();
        const positions = calculateRingLayoutPositions(nodeId, relationshipGraph, DEFAULT_RING_CONFIG);

        if (!positions?.ring1Nodes || !positions?.ring2Nodes || !positions?.ring3Nodes) {
          throw new Error('Failed to calculate ring layout positions');
        }

        const allRingNodes = [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes];
        const newLayoutNodeIds = new Set<string>();
        if (positions.centerNode) newLayoutNodeIds.add(positions.centerNode.nodeId);
        allRingNodes.forEach(n => newLayoutNodeIds.add(n.nodeId));

        // ── Step 3: Selective ephemeral cleanup ──
        // For each existing ephemeral node, decide: keep, animate exit, or immediately despawn.
        // The decision depends on whether the node was an active participant in the previous
        // liminal web layout (wasInLiminalWeb), NOT just whether the layout mode is liminal-web.
        // This handles edge cases like interrupted returnToConstellation leaving stale ephemeral
        // nodes that technically exist but weren't in the previous rings.
        const store = useInterBrainStore.getState();
        const mountedNodes = store.constellationFilter.mountedNodes;
        const exitingEphemeralIds: string[] = [];

        if (store.ephemeralNodes.size > 0) {
          const keepIds: string[] = [];
          const exitIds: string[] = [];
          const staleIds: string[] = [];

          for (const ephNodeId of store.ephemeralNodes.keys()) {
            if (newLayoutNodeIds.has(ephNodeId) && wasInLiminalWeb(ephNodeId)) {
              // Node is in BOTH old and new layout — keep it, move smoothly
              keepIds.push(ephNodeId);
            } else if (wasInLiminalWeb(ephNodeId)) {
              // Node was in old layout but NOT in new — animate exit
              exitIds.push(ephNodeId);
            } else if (newLayoutNodeIds.has(ephNodeId)) {
              // Node is in new layout but wasn't in old — it's stale, despawn and re-spawn fresh
              staleIds.push(ephNodeId);
            } else {
              // Node in neither old nor new layout — stale, despawn immediately
              staleIds.push(ephNodeId);
            }
          }


          // Animate exit for nodes that were active in the previous layout
          exitingEphemeralIds.push(...exitIds);

          // Stagger despawn of stale nodes to avoid blocking main thread
          for (const despawnId of staleIds) {
            nodeRefs.current.delete(despawnId);
            queueEphemeralDespawn(despawnId);
          }
        }

        // Clear stale pending movements from previous transitions
        pendingMovements.current.clear();

        // Clear the transitioning flag if it was left set by an interrupted return
        isTransitioning.current = false;

        // ── Step 4: Update roles and state ──
        liminalWebRoles.current = {
          centerNodeId: positions.centerNode?.nodeId || null,
          ringNodeIds: new Set([...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].map(n => n.nodeId))
        };

        applyWorldRotationCorrection(positions);

        isTransitioning.current = true;
        focusedNodeId.current = nodeId;

        // Only update to liminal-web if not in a mode that manages its own layout
        const currentLayout2 = useInterBrainStore.getState().spatialLayout;
        if (currentLayout2 !== 'edit' && currentLayout2 !== 'relationship-edit' && currentLayout2 !== 'copilot') {
          setSpatialLayout('liminal-web');
        }

        // ── Step 5: Animate nodes ──
        // Easing logic: nodes already visible in the previous liminal web get easeInOutQuart
        // (smooth acceleration + deceleration). New nodes flying in get easeOutQuart.
        const getEasing = (id: string) => {
          if (isLiminalToLiminal && wasInLiminalWeb(id)) return 'easeInOutQuart';
          return 'easeOutQuart';
        };

        // Move center node
        if (positions.centerNode) {
          moveNode(positions.centerNode.nodeId, positions.centerNode.position, transitionDuration, getEasing(positions.centerNode.nodeId));
        }

        // ── Step 6b: Stagger ephemeral node spawning for smooth cascading ──
        // Strategy: Constellation-mounted nodes (already have refs) move immediately.
        // Ephemeral nodes (need React mount) spawn one-by-one with delays, inner ring first.
        // This spreads component mount cost across frames for jank-free animation.
        const EPHEMERAL_SPAWN_INTERVAL_MS = 40; // Gap between individual ephemeral spawns

        // Separate mounted (instant) from ephemeral (staggered)
        const mountedRingMoves: typeof allRingNodes = [];
        const ephemeralRingQueue: typeof allRingNodes = [];

        // Ordered: ring1 → ring2 → ring3 (inner first)
        for (const node of allRingNodes) {
          if (mountedNodes.has(node.nodeId)) {
            mountedRingMoves.push(node);
          } else {
            ephemeralRingQueue.push(node);
          }
        }

        // Move all constellation-mounted ring nodes immediately (no spawn cost)
        for (const { nodeId: ringNodeId, position } of mountedRingMoves) {
          moveNode(ringNodeId, position, transitionDuration, getEasing(ringNodeId));
        }

        // Stagger ephemeral node spawns: one node per interval, inner ring first.
        // Each spawn is a single store update (1 node) → 1 React mount per frame window.
        ephemeralRingQueue.forEach(({ nodeId: ephNodeId, position }, index) => {
          globalThis.setTimeout(() => {
            // Spawn single ephemeral node
            ensureNodeMounted(ephNodeId, position);
            // Issue move command (will queue if ref not ready yet)
            moveNode(ephNodeId, position, transitionDuration, getEasing(ephNodeId));
          }, index * EPHEMERAL_SPAWN_INTERVAL_MS);
        });

        // Move unrelated nodes to constellation
        positions.sphereNodes.forEach(sphereNodeId => {
          returnNodeToConstellation(sphereNodeId, transitionDuration, 'easeInQuart');
        });

        // Animate exiting ephemeral nodes out to spawn ring (liminal→liminal only).
        // These nodes have refs and are still mounted — returnNodeToConstellation triggers
        // the ephemeral exit animation, which calls despawnEphemeralNode on completion.
        exitingEphemeralIds.forEach(ephNodeId => {
          returnNodeToConstellation(ephNodeId, transitionDuration, 'easeInQuart');
        });

        globalThis.setTimeout(() => {
          isTransitioning.current = false;
        }, transitionDuration);

        onNodeFocused?.(nodeId);

      } catch (error) {
        console.error('SpatialOrchestrator: Error during focus transition:', error);
        isTransitioning.current = false;
      }
    },

    // LEGACY - DO NOT USE - Use executeLayoutIntent with deriveFocusIntent instead
    focusOnNodeWithFlyIn: (nodeId: string, newNodeId: string) => {
      console.warn('[Orchestrator] ⚠️ LEGACY: focusOnNodeWithFlyIn called - should use executeLayoutIntent instead');
      try {
        const relationshipGraph = buildFullRelationshipGraph();
        const positions = calculateRingLayoutPositions(nodeId, relationshipGraph, DEFAULT_RING_CONFIG);

        liminalWebRoles.current = {
          centerNodeId: positions.centerNode?.nodeId || null,
          ringNodeIds: new Set([...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].map(n => n.nodeId))
        };

        applyWorldRotationCorrection(positions);

        isTransitioning.current = true;
        focusedNodeId.current = nodeId;

        const currentLayout = useInterBrainStore.getState().spatialLayout;
        if (currentLayout !== 'edit' && currentLayout !== 'relationship-edit' && currentLayout !== 'copilot') {
          setSpatialLayout('liminal-web');
        }

        // Move center node
        if (positions.centerNode) {
          moveNode(positions.centerNode.nodeId, positions.centerNode.position, transitionDuration, 'easeOutQuart');
        }

        // Move ring nodes - new node gets longer, more dramatic animation
        const flyInDuration = transitionDuration * 1.2;
        [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].forEach(({ nodeId: ringNodeId, position }) => {
          if (ringNodeId === newNodeId) {
            moveNode(ringNodeId, position, flyInDuration, 'easeOutCubic');
          } else {
            moveNode(ringNodeId, position, transitionDuration, 'easeOutQuart');
          }
        });

        // Move unrelated nodes to constellation
        positions.sphereNodes.forEach(sphereNodeId => {
          returnNodeToConstellation(sphereNodeId, transitionDuration, 'easeInQuart');
        });

        globalThis.setTimeout(() => {
          isTransitioning.current = false;
        }, flyInDuration);

        onNodeFocused?.(nodeId);

      } catch (error) {
        console.error('SpatialOrchestrator: Error during focus with fly-in transition:', error);
        isTransitioning.current = false;
      }
    },

    // LEGACY - DO NOT USE - Use executeLayoutIntent with deriveConstellationIntent instead
    returnToConstellation: () => {
      console.warn('[Orchestrator] ⚠️ LEGACY: returnToConstellation called - should use executeLayoutIntent instead');
      // Guard against double-calls during transition
      if (isTransitioning.current) {
        return;
      }

      isTransitioning.current = true;
      focusedNodeId.current = null;
      setSpatialLayout('constellation');

      const worldRotation = dreamWorldRef.current?.quaternion.clone();

      // Capture roles BEFORE clearing them so we can use correct easing
      const rolesSnapshot = {
        centerNodeId: liminalWebRoles.current.centerNodeId,
        ringNodeIds: new Set(liminalWebRoles.current.ringNodeIds),
      };

      // Get easing from snapshot instead of live roles
      const getEasingFromSnapshot = (nodeId: string): string => {
        if (nodeId === rolesSnapshot.centerNodeId ||
            rolesSnapshot.ringNodeIds.has(nodeId)) {
          return 'easeInQuart';
        }
        return 'easeOutCubic';
      };

      // Return all nodes with role-based easing
      nodeRefs.current.forEach((_, nodeId) => {
        returnNodeToScaledPosition(nodeId, transitionDuration, worldRotation, getEasingFromSnapshot(nodeId));
      });

      clearLiminalWebRoles();

      globalThis.setTimeout(() => {
        // In the new unified system, nodes in 'home' mode handle their own state via setTargetState
        // No need to explicitly call setActiveState - the position mode change handles everything
        isTransitioning.current = false;
      }, transitionDuration);

      onConstellationReturn?.();
    },

    // LEGACY - DO NOT USE - Interruption is handled automatically in new system
    interruptAndFocusOnNode: (nodeId: string) => {
      console.warn('[Orchestrator] ⚠️ LEGACY: interruptAndFocusOnNode called - should use executeLayoutIntent instead');
      const self = ref as React.MutableRefObject<SpatialOrchestratorRef>;
      self.current?.focusOnNode(nodeId);
    },

    // LEGACY - DO NOT USE - Interruption is handled automatically in new system
    interruptAndReturnToConstellation: () => {
      console.warn('[Orchestrator] ⚠️ LEGACY: interruptAndReturnToConstellation called - should use executeLayoutIntent instead');
      const self = ref as React.MutableRefObject<SpatialOrchestratorRef>;
      self.current?.returnToConstellation();
    },

    getFocusedNodeId: () => focusedNodeId.current,
    
    isFocusedMode: () => focusedNodeId.current !== null,

    // LEGACY - DO NOT USE - Use executeLayoutIntent with deriveSearchIntent instead
    showSearchResults: (searchResults: DreamNode[]) => {
      console.warn('[Orchestrator] ⚠️ LEGACY: showSearchResults called - should use executeLayoutIntent instead');
      try {
        const relationshipGraph = buildFullRelationshipGraph();
        const orderedNodes = searchResults.map(node => ({ id: node.id, name: node.name, type: node.type }));
        const positions = calculateRingLayoutPositionsForSearch(orderedNodes, relationshipGraph, DEFAULT_RING_CONFIG);

        const allRingNodes = [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes];

        // Diagnostic: classify search result nodes by mount status
        const storeSnapshot = useInterBrainStore.getState();
        const constellationResults = allRingNodes.filter(n => storeSnapshot.constellationFilter.mountedNodes.has(n.nodeId));
        const ephemeralResults = allRingNodes.filter(n => !storeSnapshot.constellationFilter.mountedNodes.has(n.nodeId));
        const constellationWithRefs = constellationResults.filter(n => !!nodeRefs.current.get(n.nodeId)?.current);
        const constellationWithoutRefs = constellationResults.filter(n => !nodeRefs.current.get(n.nodeId)?.current);
        console.log(`[SEARCH] showSearchResults: ${searchResults.length} results → ${allRingNodes.length} ring nodes (${constellationResults.length} constellation [${constellationWithRefs.length} w/ref, ${constellationWithoutRefs.length} no ref], ${ephemeralResults.length} ephemeral), ${positions.sphereNodes.length} sphere`);

        // Log each ring node with its name, ring assignment, and mount status
        const dreamNodesMap = storeSnapshot.dreamNodes;
        const ringLabels = new Map<string, string>();
        positions.ring1Nodes.forEach(n => ringLabels.set(n.nodeId, 'ring1'));
        positions.ring2Nodes.forEach(n => ringLabels.set(n.nodeId, 'ring2'));
        positions.ring3Nodes.forEach(n => ringLabels.set(n.nodeId, 'ring3'));
        allRingNodes.forEach(({ nodeId, position }) => {
          const nodeData = dreamNodesMap.get(nodeId);
          const name = nodeData?.node?.name || '???';
          const ring = ringLabels.get(nodeId) || '?';
          const isMounted = storeSnapshot.constellationFilter.mountedNodes.has(nodeId);
          const hasRef = !!nodeRefs.current.get(nodeId)?.current;
          const anchorPos = nodeData?.node?.position;
          console.log(`[SEARCH]   ${name} (${nodeId.slice(0,8)}): ${ring}, target=[${position.map(n=>n.toFixed(0))}], ${isMounted ? 'constellation' : 'ephemeral'}, ref=${hasRef}${isMounted && anchorPos ? `, anchor=[${anchorPos.map((n: number)=>n.toFixed(0))}]` : ''}`);
        });

        if (constellationWithoutRefs.length > 0) {
          console.log(`[SEARCH] WARNING: constellation nodes without refs:`, constellationWithoutRefs.map(n => n.nodeId.slice(0,8)));
        }

        liminalWebRoles.current = {
          centerNodeId: null,
          ringNodeIds: new Set([...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].map(n => n.nodeId))
        };

        applyWorldRotationCorrection(positions);

        isTransitioning.current = true;
        focusedNodeId.current = null;
        setSpatialLayout('search');

        // Move search results to ring positions
        allRingNodes.forEach(({ nodeId: ringNodeId, position }) => {
          moveNode(ringNodeId, position, transitionDuration, 'easeOutQuart');
        });

        // Move non-search nodes to constellation
        positions.sphereNodes.forEach(sphereNodeId => {
          returnNodeToConstellation(sphereNodeId, transitionDuration, 'easeInQuart');
        });

        globalThis.setTimeout(() => {
          isTransitioning.current = false;
        }, transitionDuration);

      } catch (error) {
        console.error('SpatialOrchestrator: Error during search results display:', error);
        isTransitioning.current = false;
      }
    },

    // LEGACY - DO NOT USE - Use executeLayoutIntent instead
    moveAllToSphereForSearch: () => {
      console.warn('[Orchestrator] ⚠️ LEGACY: moveAllToSphereForSearch called - should use executeLayoutIntent instead');
      try {
        isTransitioning.current = true;

        nodeRefs.current.forEach((_, nodeId) => {
          returnNodeToConstellation(nodeId, transitionDuration, 'easeInQuart');
        });

        focusedNodeId.current = 'search-interface';

        globalThis.setTimeout(() => {
          isTransitioning.current = false;
        }, transitionDuration);

      } catch (error) {
        console.error('SpatialOrchestrator: Error during search interface setup:', error);
        isTransitioning.current = false;
      }
    },

    // LEGACY - DO NOT USE - Use executeLayoutIntent instead
    showEditModeSearchResults: (centerNodeId: string, searchResults: DreamNode[]) => {
      console.warn('[Orchestrator] ⚠️ LEGACY: showEditModeSearchResults called - should use executeLayoutIntent instead');
      try {
        // Store current search results for dynamic reordering
        const previousCenterNodeId = currentEditModeCenterNodeId.current;
        currentEditModeSearchResults.current = searchResults;
        currentEditModeCenterNodeId.current = centerNodeId;

        // Mark as transitioning
        isTransitioning.current = true;
        
        // Build relationship graph from current nodes
        const relationshipGraph = buildFullRelationshipGraph();
        
        // Get current pending relationships from store for priority ordering
        const store = useInterBrainStore.getState();
        const pendingRelationshipIds = store.editMode.pendingRelationships || [];
        
        // Filter out already-related nodes from search results to avoid duplicates
        const filteredSearchResults = searchResults.filter(node => 
          !pendingRelationshipIds.includes(node.id)
        );
        
        // Create stable lists for swapping logic
        const relatedNodes = pendingRelationshipIds
          .map(id => dreamNodes.find(node => node.id === id))
          .filter(node => node !== undefined)
          .map(node => ({ 
            id: node.id, 
            name: node.name, 
            type: node.type 
          }));
        
        const unrelatedSearchNodes = filteredSearchResults.map(node => ({ 
          id: node.id, 
          name: node.name, 
          type: node.type 
        }));
        
        // Check if this is a new edit mode session (different center node)
        const isNewEditModeSession = previousCenterNodeId !== centerNodeId;
        
        // Update stable lists for swapping logic - handle both initial, new session, and subsequent calls
        if (relatedNodesList.current.length === 0 && unrelatedSearchResultsList.current.length === 0) {
          // Initial call - set up the lists
          relatedNodesList.current = [...relatedNodes];
          unrelatedSearchResultsList.current = [...unrelatedSearchNodes];
        } else if (isNewEditModeSession) {
          // New edit mode session for different node - reset lists to avoid stale data
          relatedNodesList.current = [...relatedNodes];
          unrelatedSearchResultsList.current = [...unrelatedSearchNodes];
        } else {
          // Subsequent search — replace with fresh results
          // Relationship toggle stability is handled by relatedNodesList, not here
          unrelatedSearchResultsList.current = [...unrelatedSearchNodes];
        }
        
        // Check if we're in copilot mode with show/hide functionality
        const isInCopilotMode = store.spatialLayout === 'copilot';
        const shouldShowResults = !isInCopilotMode || store.copilotMode.showSearchResults;

        let orderedNodes: Array<{ id: string; name: string; type: string }>;

        if (!shouldShowResults) {
          // Hide all search results in copilot mode when Option key not held
          orderedNodes = [];
        } else if (isInCopilotMode && store.copilotMode.showSearchResults) {
          // Show frozen snapshot in copilot mode when Option key is held
          // Convert full DreamNode objects to simplified format for layout calculation
          orderedNodes = store.copilotMode.frozenSearchResults.map(node => ({
            id: node.id,
            name: node.name,
            type: node.type
          }));
        } else {
          // Normal edit mode behavior: show live search results
          orderedNodes = [...relatedNodesList.current, ...unrelatedSearchResultsList.current];
        }
        
        
        // Calculate ring layout positions for search results (honeycomb pattern)
        const positions = calculateRingLayoutPositionsForSearch(orderedNodes, relationshipGraph, DEFAULT_RING_CONFIG);
        
        // Apply world-space position correction
        if (dreamWorldRef.current) {
          const sphereRotation = dreamWorldRef.current.quaternion.clone();
          const inverseRotation = sphereRotation.invert();
          
          // Transform all ring node positions to world space
          [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].forEach(node => {
            const originalPos = new Vector3(...node.position);
            originalPos.applyQuaternion(inverseRotation);
            node.position = [originalPos.x, originalPos.y, originalPos.z];
          });
        }
        
        // IMPORTANT: Keep the center node at its current position (already correctly positioned with sphere rotation)
        const centerNodeRef = nodeRefs.current.get(centerNodeId);
        if (centerNodeRef?.current) {
          console.log(`[SpatialOrchestrator] Center node ${centerNodeId} found - keeping at current position (already correctly centered)`);

          // Log current position for verification
          const currentPosition = centerNodeRef.current.getCurrentPosition?.();
          console.log(`[SpatialOrchestrator] Center node staying at position:`, currentPosition);

          // In the new unified system, the center node maintains its state via setTargetState
          // DO NOT move center node - it's already correctly positioned with sphere rotation counteracted
        } else {
          console.error(`[SpatialOrchestrator] Center node ${centerNodeId} not found in nodeRefs! Available nodes:`, Array.from(nodeRefs.current.keys()));
        }
        
        // Move search result nodes to ring positions
        const ringNodes = [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes];

        ringNodes.forEach(({ nodeId: searchNodeId, position }) => {
          if (searchNodeId === centerNodeId) {
            // Skip the center node - it stays where it is
            return;
          }

          // Use moveNode which handles ephemeral spawning for non-mounted nodes
          moveNode(searchNodeId, position, transitionDuration, 'easeOutQuart');
        });
        
        // Move sphere nodes to sphere surface
        positions.sphereNodes.forEach(sphereNodeId => {
          // Skip the center node if it's somehow in sphere nodes
          if (sphereNodeId === centerNodeId) {
            return;
          }
          
          const nodeRef = nodeRefs.current.get(sphereNodeId);
          if (nodeRef?.current) {
            // Move to sphere surface - use the new unified API
            const worldRotation = dreamWorldRef.current?.quaternion.clone();
            nodeRef.current.setTargetState({ mode: 'home' }, transitionDuration, worldRotation);
          }
        });
        
        // Set transition complete after animation
        globalThis.setTimeout(() => {
          isTransitioning.current = false;
        }, transitionDuration);
        
        console.log('SpatialOrchestrator: Edit mode search layout complete');
        
      } catch (error) {
        console.error('SpatialOrchestrator: Error during edit mode search display:', error);
        isTransitioning.current = false;
      }
    },
    
    reorderEditModeSearchResults: () => {
      try {
        // Only reorder if we're currently in edit mode with stable lists
        const centerNodeId = currentEditModeCenterNodeId.current;
        
        if (!centerNodeId || !relatedNodesList.current.length && !unrelatedSearchResultsList.current.length) {
          console.log('SpatialOrchestrator: No stable lists to reorder');
          return;
        }
        
        console.log('SpatialOrchestrator: Performing position swapping based on relationship changes');
        
        // Build relationship graph from current nodes
        const relationshipGraph = buildFullRelationshipGraph();
        
        // Get current pending relationships from store
        const store = useInterBrainStore.getState();
        const currentPendingIds = store.editMode.pendingRelationships || [];
        
        // Detect what changed: which nodes were added/removed from relationships
        const previousRelatedIds = relatedNodesList.current.map(n => n.id);
        const addedRelationshipIds = currentPendingIds.filter(id => !previousRelatedIds.includes(id));
        const removedRelationshipIds = previousRelatedIds.filter(id => !currentPendingIds.includes(id));
        
        console.log(`🔄 [Orchestrator-Reorder] Relationship changes - added: ${addedRelationshipIds.length}, removed: ${removedRelationshipIds.length}`);
        
        // Process additions: Move from unrelated list to end of related list
        addedRelationshipIds.forEach(addedId => {
          const nodeIndex = unrelatedSearchResultsList.current.findIndex(n => n.id === addedId);
          if (nodeIndex !== -1) {
            // Remove from unrelated list
            const [movedNode] = unrelatedSearchResultsList.current.splice(nodeIndex, 1);
            // Add to end of related list
            relatedNodesList.current.push(movedNode);
          }
        });
        
        // Process removals: Move from related list to beginning of unrelated list
        removedRelationshipIds.forEach(removedId => {
          const nodeIndex = relatedNodesList.current.findIndex(n => n.id === removedId);
          if (nodeIndex !== -1) {
            // Remove from related list
            const [movedNode] = relatedNodesList.current.splice(nodeIndex, 1);
            // Add to beginning of unrelated list
            unrelatedSearchResultsList.current.unshift(movedNode);
            console.log(`SpatialOrchestrator: Moved node ${movedNode.id} from related to unrelated`);
          }
        });
        
        // Rebuild the combined ordered list with updated stable lists
        const orderedNodes = [...relatedNodesList.current, ...unrelatedSearchResultsList.current];
        
        console.log(`✅ [Orchestrator-Reorder] Lists updated - related: ${relatedNodesList.current.length}, unrelated: ${unrelatedSearchResultsList.current.length}`);
        
        // Calculate new ring layout positions
        const positions = calculateRingLayoutPositionsForSearch(orderedNodes, relationshipGraph, DEFAULT_RING_CONFIG);
        
        // Apply world-space position correction
        if (dreamWorldRef.current) {
          const sphereRotation = dreamWorldRef.current.quaternion.clone();
          const inverseRotation = sphereRotation.invert();
          
          // Transform all ring node positions to world space
          [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].forEach(node => {
            const originalPos = new Vector3(...node.position);
            originalPos.applyQuaternion(inverseRotation);
            node.position = [originalPos.x, originalPos.y, originalPos.z];
          });
        }
        
        // Move nodes to their new positions (fast animation for immediate feedback)
        const fastTransitionDuration = 300; // 300ms for quick reordering
        
        // Move search result nodes to their new ring positions
        [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].forEach(({ nodeId: searchNodeId, position }) => {
          if (searchNodeId === centerNodeId) {
            // Skip the center node - it stays where it is
            return;
          }

          // Use moveNode which handles ephemeral spawning for non-mounted nodes
          moveNode(searchNodeId, position, fastTransitionDuration, 'easeOutQuart');
        });
        
        // Move sphere nodes to sphere surface
        positions.sphereNodes.forEach(sphereNodeId => {
          // Skip the center node if it's somehow in sphere nodes
          if (sphereNodeId === centerNodeId) {
            return;
          }
          
          const nodeRef = nodeRefs.current.get(sphereNodeId);
          if (nodeRef?.current) {
            // Move to sphere surface - use the new unified API
            const worldRotation = dreamWorldRef.current?.quaternion.clone();
            nodeRef.current.setTargetState({ mode: 'home' }, fastTransitionDuration, worldRotation);
          }
        });

        console.log('SpatialOrchestrator: Edit mode reordering complete');
        
      } catch (error) {
        console.error('SpatialOrchestrator: Error during edit mode reordering:', error);
      }
    },

    // LEGACY - DO NOT USE - Use executeLayoutIntent with deriveFocusIntent instead
    animateToLiminalWebFromEdit: (nodeId: string) => {
      console.warn('[Orchestrator] ⚠️ LEGACY: animateToLiminalWebFromEdit called - should use executeLayoutIntent instead');
      try {
        const relationshipGraph = buildFullRelationshipGraph();
        const positions = calculateRingLayoutPositions(nodeId, relationshipGraph, DEFAULT_RING_CONFIG);

        liminalWebRoles.current = {
          centerNodeId: positions.centerNode?.nodeId || null,
          ringNodeIds: new Set([...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].map(n => n.nodeId))
        };

        applyWorldRotationCorrection(positions);

        isTransitioning.current = true;
        focusedNodeId.current = nodeId;
        setSpatialLayout('liminal-web');

        // Move center node (may be in honeycomb position from edit mode)
        if (positions.centerNode) {
          moveNode(positions.centerNode.nodeId, positions.centerNode.position, transitionDuration, 'easeOutQuart');
        }

        // Move ring nodes
        [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].forEach(({ nodeId: ringNodeId, position }) => {
          moveNode(ringNodeId, position, transitionDuration, 'easeOutQuart');
        });

        // Move sphere nodes to constellation
        positions.sphereNodes.forEach(sphereNodeId => {
          returnNodeToConstellation(sphereNodeId, transitionDuration, 'easeInQuart');
        });

        globalThis.setTimeout(() => {
          isTransitioning.current = false;
        }, transitionDuration);

        onNodeFocused?.(nodeId);

      } catch (error) {
        console.error('SpatialOrchestrator: Error during edit mode save transition:', error);
        isTransitioning.current = false;
      }
    },
    
    registerNodeRef: (nodeId: string, nodeRef: React.RefObject<DreamNode3DRef>) => {
      nodeRefs.current.set(nodeId, nodeRef);

      // Check if there's a pending movement for this node (ephemeral spawn case)
      const pendingMovement = pendingMovements.current.get(nodeId);
      if (pendingMovement && nodeRef.current) {
        pendingMovements.current.delete(nodeId);

        // For snapshot restoration, we MUST apply setTargetState to override spawn animation
        if (pendingMovement.isSnapshotRestore) {
          const capturedGeneration = pendingMovement.generation;
          console.log(`[Orchestrator] Snapshot restore: setting instant position for ${nodeId} (gen=${capturedGeneration})`);
          // Use requestAnimationFrame to ensure DOM is ready
          requestAnimationFrame(() => {
            // Check if a new executeLayoutIntent has invalidated this callback
            if (capturedGeneration !== layoutGeneration.current) {
              console.log(`[Orchestrator] Skipping stale snapshot restore for ${nodeId} (gen=${capturedGeneration}, current=${layoutGeneration.current})`);
              return;
            }
            if (nodeRef.current) {
              nodeRef.current.setTargetState(
                {
                  mode: 'active',
                  position: pendingMovement.position,
                  flipSide: pendingMovement.flipSide || 'front'
                },
                0 // Instant
              );
            }
          });
          return;
        }

        // For normal ephemeral nodes, the spawn animation effect in DreamNode3D already handles
        // the ring→target animation using ephemeralState.spawnPosition → ephemeralState.targetPosition.
        // We don't need to issue a separate move command.
        const isEphemeral = useInterBrainStore.getState().ephemeralNodes.has(nodeId);
        if (isEphemeral) {
          // Ephemeral nodes handle their own spawn animation - no action needed here.
          // The setTargetState will be called when the node's ref becomes available
          // through the normal executeLayoutIntent flow.
          console.log(`[Orchestrator] Ephemeral node ${nodeId} registered - spawn animation handles movement`);
          return;
        }

        // For non-ephemeral nodes (shouldn't happen often), use setTargetState
        // Use a short delay to ensure the node is fully initialized
        const capturedGen = pendingMovement.generation;
        globalThis.setTimeout(() => {
          // Check if a new executeLayoutIntent has invalidated this callback
          if (capturedGen !== layoutGeneration.current) {
            console.log(`[Orchestrator] Skipping stale pending movement for ${nodeId} (gen=${capturedGen}, current=${layoutGeneration.current})`);
            return;
          }
          if (nodeRef.current) {
            console.log(`[Orchestrator] Executing pending movement for ${nodeId} via setTargetState`);
            nodeRef.current.setTargetState(
              {
                mode: 'active',
                position: pendingMovement.position,
                flipSide: pendingMovement.flipSide || 'front'
              },
              pendingMovement.duration
            );
          }
        }, 50); // Small delay for React to stabilize
      }
    },

    unregisterNodeRef: (nodeId: string) => {
      nodeRefs.current.delete(nodeId);
    },
    
    clearEditModeData: () => {
      // Clear stable edit mode lists
      relatedNodesList.current = [];
      unrelatedSearchResultsList.current = [];

      // Clear edit mode tracking
      currentEditModeSearchResults.current = [];
      currentEditModeCenterNodeId.current = null;
    },

    applyConstellationLayout: async () => {
      const store = useInterBrainStore.getState();
      const currentLayout = store.spatialLayout;
      const searchActive = store.searchInterface.isActive;
      console.log(`[LAYOUT] applyConstellationLayout called — spatialLayout=${currentLayout}, searchActive=${searchActive}`);

      // Read relationship graph from dreamweaving slice (source of truth for DreamSong relationships)
      const relationshipGraph = store.dreamSongRelationships.graph;

      if (!relationshipGraph) {
        console.warn('[LAYOUT] No relationship graph available');
        return;
      }

      // Check position cache validity - skip recomputation if positions are still valid
      const persistedPositions = store.constellationData.positions;
      const persistedGraphHash = store.constellationData.graphHashWhenPositionsComputed;
      const currentGraphHash = store.dreamSongRelationships.submoduleStructureHash;

      if (persistedPositions && persistedPositions.size > 0 &&
          persistedGraphHash === currentGraphHash && currentGraphHash !== null) {
        console.log(`[LAYOUT] Positions still valid for current graph (hash: ${currentGraphHash}), skipping recomputation`);
        // Still need to apply existing positions to node objects
        store.batchUpdateNodePositions(persistedPositions);
        return;
      }

      console.log(`[LAYOUT] Position recomputation needed (persistedHash=${persistedGraphHash}, currentHash=${currentGraphHash})`);

      try {
        const { maxNodes, prioritizeClusters } = store.constellationConfig;
        const allNodeIds = dreamNodes.map(node => node.id);

        // Step 1: Compute filter FIRST to determine which nodes should be mounted
        const constellationFilter = computeConstellationFilter(
          relationshipGraph,
          allNodeIds,
          maxNodes,
          prioritizeClusters
        );
        // Diagnostic: check if any currently active ring nodes will be affected
        const activeRingNodeIds = [...liminalWebRoles.current.ringNodeIds];
        if (activeRingNodeIds.length > 0) {
          const ringNodesDropped = activeRingNodeIds.filter(id => !constellationFilter.mountedNodes.has(id));
          const ringNodesKept = activeRingNodeIds.filter(id => constellationFilter.mountedNodes.has(id));
          console.log(`[LAYOUT] ⚠️ Ring nodes vs new filter: ${ringNodesKept.length} kept, ${ringNodesDropped.length} dropped`);
          if (ringNodesDropped.length > 0) {
            const nodesMap = store.dreamNodes;
            ringNodesDropped.forEach(id => {
              const name = nodesMap.get(id)?.node?.name || '???';
              const isEphemeral = store.ephemeralNodes.has(id);
              console.log(`[LAYOUT]   DROPPED from ring: ${name} (${id.slice(0,8)}), ephemeral=${isEphemeral}`);
            });
          }
        }

        store.setConstellationFilter(constellationFilter);

        // Step 2: Filter dreamNodes to only mounted nodes for position calculation
        const mountedDreamNodes = dreamNodes.filter(
          node => constellationFilter.mountedNodes.has(node.id)
        );

        console.log(`[LAYOUT] Filter: ${mountedDreamNodes.length} mounted, ${constellationFilter.ephemeralNodes.size} ephemeral (of ${dreamNodes.length} total)`);

        // Step 3: Create a filtered relationship graph containing ONLY mounted nodes
        // This is critical because computeConstellationLayout clusters from the graph's
        // nodes map, not from the dreamNodes array. Without filtering, the graph still
        // contains all 82 nodes and produces positions for all of them.
        const mountedNodeIds = new Set(mountedDreamNodes.map(n => n.id));
        const filteredNodes = new Map(
          Array.from(relationshipGraph.nodes.entries())
            .filter(([id]) => mountedNodeIds.has(id))
        );
        const filteredEdges = relationshipGraph.edges.filter(
          edge => mountedNodeIds.has(edge.source) && mountedNodeIds.has(edge.target)
        );
        const filteredGraph = {
          ...relationshipGraph,
          nodes: filteredNodes,
          edges: filteredEdges,
          metadata: {
            ...relationshipGraph.metadata,
            totalNodes: filteredNodes.size,
          }
        };

        // Step 4: Compute layout for ONLY mounted nodes using filtered graph
        const layoutResult = computeConstellationLayout(filteredGraph, mountedDreamNodes);

        if (layoutResult.nodePositions.size === 0) {
          console.warn('[LAYOUT] Layout returned no positions');
          return;
        }

        // Step 5: Create fallback positions for any mounted nodes missing from layout
        const mountedPositions = createFallbackLayout(mountedDreamNodes, layoutResult.nodePositions);

        // Step 6: Store positions and assign ONLY to mounted nodes
        // setConstellationPositions replaces the entire positions map (only 50 entries),
        // so future plugin loads won't have stale ephemeral positions.
        store.setConstellationPositions(mountedPositions);
        // Track which graph these positions were computed for
        if (currentGraphHash) {
          store.setGraphHashWhenPositionsComputed(currentGraphHash);
        }

        // Diagnostic: warn if batchUpdateNodePositions will overwrite active ring node positions
        if (activeRingNodeIds.length > 0) {
          const ringNodesGettingNewPositions = activeRingNodeIds.filter(id => mountedPositions.has(id));
          if (ringNodesGettingNewPositions.length > 0) {
            const nodesMap = store.dreamNodes;
            console.log(`[LAYOUT] ⚠️ batchUpdateNodePositions will overwrite ${ringNodesGettingNewPositions.length} active ring node anchor positions:`);
            ringNodesGettingNewPositions.forEach(id => {
              const name = nodesMap.get(id)?.node?.name || '???';
              const newPos = mountedPositions.get(id);
              console.log(`[LAYOUT]   ${name} (${id.slice(0,8)}): new anchor=${newPos ? `[${newPos.map((n: number)=>n.toFixed(0))}]` : 'none'}`);
            });
          }
        }

        store.batchUpdateNodePositions(mountedPositions);

        console.log(`[LAYOUT] Assigned ${mountedPositions.size} positions for ${mountedDreamNodes.length} mounted nodes`);

      } catch (error) {
        console.error('[LAYOUT] Failed:', error);
      }
    },

    // LEGACY - DO NOT USE - Use executeLayoutIntent with deriveFocusIntent(center, []) instead
    hideRelatedNodesInLiminalWeb: () => {
      console.warn('[Orchestrator] ⚠️ LEGACY: hideRelatedNodesInLiminalWeb called - should use executeLayoutIntent instead');
      try {
        const allRingNodeIds = [...liminalWebRoles.current.ringNodeIds];

        const buttonAnimationDuration = 500; // Match radial button animation

        allRingNodeIds.forEach(nodeId => {
          returnNodeToConstellation(nodeId, buttonAnimationDuration, 'easeInQuart');
        });

      } catch (error) {
        console.error('[Orchestrator-LiminalWeb] Error hiding related nodes:', error);
      }
    },

    // LEGACY - DO NOT USE - Use executeLayoutIntent with deriveFocusIntent(center, relatedIds) instead
    showRelatedNodesInLiminalWeb: () => {
      console.warn('[Orchestrator] ⚠️ LEGACY: showRelatedNodesInLiminalWeb called - should use executeLayoutIntent instead');
      try {
        if (!liminalWebRoles.current.centerNodeId) return;

        const relationshipGraph = buildFullRelationshipGraph();
        const positions = calculateRingLayoutPositions(
          liminalWebRoles.current.centerNodeId,
          relationshipGraph,
          DEFAULT_RING_CONFIG
        );

        applyWorldRotationCorrection(positions);

        const buttonAnimationDuration = 500; // Match radial button animation

        [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].forEach(({ nodeId, position }) => {
          moveNode(nodeId, position, buttonAnimationDuration, 'easeOutQuart');
        });

      } catch (error) {
        console.error('[Orchestrator-LiminalWeb] Error showing related nodes:', error);
      }
    },

    calculateForwardPositionOnSphere: (): [number, number, number] => {
      // Calculate forward position on sphere at radius 5000
      // Camera is at origin, forward is -Z direction
      const sphereRadius = 5000;
      const forwardPosition = new Vector3(0, 0, -sphereRadius);

      // Apply inverse rotation to account for sphere rotation
      if (dreamWorldRef.current) {
        const sphereRotation = dreamWorldRef.current.quaternion.clone();
        const inverseRotation = sphereRotation.invert();
        forwardPosition.applyQuaternion(inverseRotation);
      }

      return [forwardPosition.x, forwardPosition.y, forwardPosition.z];
    },

    getNodeCurrentPosition: (nodeId: string): [number, number, number] | null => {
      const nodeRef = nodeRefs.current.get(nodeId);
      if (!nodeRef?.current) {
        console.warn(`[SpatialOrchestrator] No ref found for node: ${nodeId}`);
        return null;
      }
      return nodeRef.current.getCurrentPosition();
    },

    // LEGACY - DO NOT USE - Use executeLayoutIntent with deriveHolarchyNavigationIntent instead
    showSupermodulesInRings: (centerNodeId: string, supermoduleIds: string[]) => {
      console.warn('[Orchestrator] ⚠️ LEGACY: showSupermodulesInRings called - should use executeLayoutIntent instead');
      try {
        console.log(`[SpatialOrchestrator] Showing supermodules in rings for ${centerNodeId}`, supermoduleIds);

        if (supermoduleIds.length === 0) {
          console.log('[SpatialOrchestrator] No supermodules to display');
          return;
        }

        // Find DreamNodes matching supermodule IDs
        const supermoduleNodes = supermoduleIds
          .map(id => {
            // First try exact ID match
            const byId = dreamNodes.find(n => n.id === id);
            if (byId) return byId;

            // Try radicleId match (from UDD)
            // For now, just match by name as fallback
            return dreamNodes.find(n => n.name === id);
          })
          .filter((node): node is DreamNode => node !== undefined);

        if (supermoduleNodes.length === 0) {
          console.log('[SpatialOrchestrator] No matching DreamNodes found for supermodule IDs');
          return;
        }

        // Build relationship graph and calculate positions
        const relationshipGraph = buildRelationshipGraph(dreamNodes);
        const orderedNodes = supermoduleNodes.map(node => ({
          id: node.id,
          name: node.name,
          type: node.type
        }));

        // Use search layout to position supermodules in rings
        const positions = calculateRingLayoutPositionsForSearch(
          orderedNodes,
          relationshipGraph,
          DEFAULT_RING_CONFIG
        );

        // Apply world rotation correction
        if (dreamWorldRef.current) {
          const sphereRotation = dreamWorldRef.current.quaternion.clone();
          const inverseRotation = sphereRotation.invert();

          [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].forEach(node => {
            const originalPos = new Vector3(...node.position);
            originalPos.applyQuaternion(inverseRotation);
            node.position = [originalPos.x, originalPos.y, originalPos.z];
          });
        }

        // Update liminal web roles with supermodule IDs
        liminalWebRoles.current = {
          centerNodeId: centerNodeId,
          ringNodeIds: new Set([...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].map(n => n.nodeId))
        };

        isTransitioning.current = true;

        // Move supermodule nodes to ring positions
        [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].forEach(({ nodeId, position }) => {
          moveNode(nodeId, position, transitionDuration, 'easeOutQuart');
        });

        // Move all other nodes (except center) to constellation
        positions.sphereNodes.forEach(sphereNodeId => {
          if (sphereNodeId !== centerNodeId) {
            returnNodeToConstellation(sphereNodeId, transitionDuration, 'easeInQuart');
          }
        });

        globalThis.setTimeout(() => {
          isTransitioning.current = false;
        }, transitionDuration);

        console.log(`[SpatialOrchestrator] Supermodule layout complete - showing ${supermoduleNodes.length} supermodules`);

      } catch (error) {
        console.error('[SpatialOrchestrator] Error showing supermodules:', error);
        isTransitioning.current = false;
      }
    },

    // LEGACY - DO NOT USE - Use executeLayoutIntent with deriveFocusIntent instead
    showDreamersInRings: (centerNodeId: string) => {
      console.warn('[Orchestrator] ⚠️ LEGACY: showDreamersInRings called - should use executeLayoutIntent instead');
      try {
        console.log(`[SpatialOrchestrator] Restoring dreamers in rings for ${centerNodeId}`);

        // Rebuild the normal liminal web layout with social relationships (dreamers)
        const relationshipGraph = buildRelationshipGraph(dreamNodes);
        const positions = calculateRingLayoutPositions(centerNodeId, relationshipGraph, DEFAULT_RING_CONFIG);

        if (!positions?.ring1Nodes || !positions?.ring2Nodes || !positions?.ring3Nodes) {
          throw new Error('Failed to calculate ring layout positions');
        }

        // Update liminal web roles
        liminalWebRoles.current = {
          centerNodeId: positions.centerNode?.nodeId || null,
          ringNodeIds: new Set([...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].map(n => n.nodeId))
        };

        applyWorldRotationCorrection(positions);

        isTransitioning.current = true;

        // Move ring nodes to their positions
        [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].forEach(({ nodeId, position }) => {
          moveNode(nodeId, position, transitionDuration, 'easeOutQuart');
        });

        // Move unrelated nodes to constellation
        positions.sphereNodes.forEach(sphereNodeId => {
          returnNodeToConstellation(sphereNodeId, transitionDuration, 'easeInQuart');
        });

        globalThis.setTimeout(() => {
          isTransitioning.current = false;
        }, transitionDuration);

        console.log('[SpatialOrchestrator] Dreamer layout restored');

      } catch (error) {
        console.error('[SpatialOrchestrator] Error restoring dreamers:', error);
        isTransitioning.current = false;
      }
    }
  }), [dreamNodes, onNodeFocused, onConstellationReturn, transitionDuration]);

  // Removed excessive node count logging

  // Call ready callback once on mount.
  // IMPORTANT: Empty dependency array — onOrchestratorReady is an inline arrow
  // in DreamspaceCanvas, so it changes identity every render. Depending on it
  // would re-fire initialization on every parent re-render, overwriting
  // in-progress animated transitions with instant teleports.
  useEffect(() => {
    onOrchestratorReady?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // This component renders nothing - it's purely for orchestration
  return null;
});

SpatialOrchestrator.displayName = 'SpatialOrchestrator';

export default SpatialOrchestrator;