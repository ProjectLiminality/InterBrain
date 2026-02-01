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
import { Vector3, Group } from 'three';
import { DreamNode } from '../../features/dreamnode';
import type { DreamNode3DRef } from '../../features/dreamnode/components/DreamNode3D';
import { buildRelationshipGraph, calculateRingLayoutPositions, calculateRingLayoutPositionsForSearch, DEFAULT_RING_CONFIG } from '../../features/liminal-web-layout';
import { computeConstellationLayout, createFallbackLayout } from '../../features/constellation-layout/ConstellationLayout';
import { computeConstellationFilter } from '../../features/constellation-layout/services/constellation-filter-service';
import { calculateSpawnPosition, DEFAULT_EPHEMERAL_SPAWN_CONFIG } from '../../features/constellation-layout/utils/EphemeralSpawning';
import { useInterBrainStore } from '../store/interbrain-store';
import { queueEphemeralDespawn, cancelEphemeralDespawn } from '../services/ephemeral-despawn-queue';

export interface SpatialOrchestratorRef {
  /** Focus on a specific node - trigger liminal web layout */
  focusOnNode: (nodeId: string) => void;
  
  /** Focus on a specific node with smooth fly-in animation for newly created node */
  focusOnNodeWithFlyIn: (nodeId: string, newNodeId: string) => void;
  
  /** Return all nodes to constellation layout */
  returnToConstellation: () => void;
  
  /** Focus on a specific node with mid-flight interruption support */
  interruptAndFocusOnNode: (nodeId: string) => void;
  
  /** Return all nodes to constellation with mid-flight interruption support */
  interruptAndReturnToConstellation: () => void;
  
  /** Get current focused node ID */
  getFocusedNodeId: () => string | null;
  
  /** Check if currently in focused mode (any node is focused) */
  isFocusedMode: () => boolean;
  
  /** Show search results in honeycomb layout */
  showSearchResults: (searchResults: DreamNode[]) => void;
  
  /** Move all nodes to sphere surface for search interface mode (like liminal web) */
  moveAllToSphereForSearch: () => void;
  
  /** Special transition for edit mode save - center node doesn't move */
  animateToLiminalWebFromEdit: (nodeId: string) => void;
  
  /** Show search results for edit mode - keep center node in place */
  showEditModeSearchResults: (centerNodeId: string, searchResults: DreamNode[]) => void;
  
  /** Reorder edit mode search results based on current pending relationships */
  reorderEditModeSearchResults: () => void;
  
  /** Clear stale edit mode data when exiting edit mode */
  clearEditModeData: () => void;
  
  /** Register a DreamNode3D ref for orchestration */
  registerNodeRef: (nodeId: string, ref: React.RefObject<DreamNode3DRef>) => void;

  /** Unregister a DreamNode3D ref */
  unregisterNodeRef: (nodeId: string) => void;

  /** Apply constellation layout based on relationship graph */
  applyConstellationLayout: () => Promise<void>;

  /** Hide related nodes in liminal-web mode (move to constellation) */
  hideRelatedNodesInLiminalWeb: () => void;

  /** Show related nodes in liminal-web mode (move back to ring positions) */
  showRelatedNodesInLiminalWeb: () => void;

  /** Calculate forward position on sphere accounting for current rotation */
  calculateForwardPositionOnSphere: () => [number, number, number];

  /** Get a node's current rendered position (from DreamNode3D ref) */
  getNodeCurrentPosition: (nodeId: string) => [number, number, number] | null;
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
  
  // Track node roles during liminal-web mode for proper constellation return
  const liminalWebRoles = useRef<{
    centerNodeId: string | null;
    ring1NodeIds: Set<string>;
    ring2NodeIds: Set<string>;
    ring3NodeIds: Set<string>;
    sphereNodeIds: Set<string>;
  }>({
    centerNodeId: null,
    ring1NodeIds: new Set(),
    ring2NodeIds: new Set(),
    ring3NodeIds: new Set(),
    sphereNodeIds: new Set()
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
  }>>(new Map());

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
    const isMounted = useInterBrainStore.getState().constellationFilter.mountedNodes.has(nodeId);
    const isEphemeral = useInterBrainStore.getState().ephemeralNodes.has(nodeId);

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
        console.log(`[MOVE] ${nodeId.slice(0,8)}: ephemeral, ref not ready, queuing`);
        pendingMovements.current.set(nodeId, { position, duration, easing, setActive });
        return;
      }
      console.warn(`[MOVE] ${nodeId.slice(0,8)}: constellation node has NO REF, skipping move (isMounted=${isMounted}, isEphemeral=${isEphemeral})`);
      return;
    }

    if (setActive) {
      nodeRef.current.setActiveState(true);
    }

    // Log constellation node movements (ephemeral nodes log via [MOVE-TO-POS] in DreamNode3D)
    if (isMounted && !isEphemeral) {
      const resolvedPos = nodeRef.current.getCurrentPosition();
      console.log(`[MOVE] ${nodeId.slice(0,8)}: constellation, resolvedPos=[${resolvedPos.map(n=>n.toFixed(0))}], target=[${position.map(n=>n.toFixed(0))}], isMoving=${nodeRef.current.isMoving()}`);
    }

    // Always use interrupt-capable movement for smooth transitions
    if (nodeRef.current.isMoving()) {
      nodeRef.current.interruptAndMoveToPosition(position, duration, easing);
    } else {
      nodeRef.current.moveToPosition(position, duration, easing);
    }
  };

  /**
   * Return a node to constellation position, interrupting any current animation.
   * For ephemeral nodes, this triggers an exit animation with world rotation correction.
   */
  const returnNodeToConstellation = (nodeId: string, duration: number, easing: string) => {
    const nodeRef = nodeRefs.current.get(nodeId);
    if (!nodeRef?.current) return;

    // Get world rotation for ephemeral exit animation correction
    const worldRotation = dreamWorldRef.current?.quaternion.clone();

    if (nodeRef.current.isMoving()) {
      nodeRef.current.interruptAndReturnToConstellation(duration, easing, worldRotation);
    } else {
      nodeRef.current.returnToConstellation(duration, easing, worldRotation);
    }
  };

  /**
   * Return a node to its scaled constellation position, interrupting any current animation.
   */
  const returnNodeToScaledPosition = (
    nodeId: string,
    duration: number,
    worldRotation: any,
    easing: string
  ) => {
    const nodeRef = nodeRefs.current.get(nodeId);
    if (!nodeRef?.current) return;

    if (nodeRef.current.isMoving()) {
      nodeRef.current.interruptAndReturnToScaledPosition(duration, worldRotation, easing);
    } else {
      nodeRef.current.returnToScaledPosition(duration, worldRotation, easing);
    }
  };

  /**
   * Clear liminal web role tracking.
   */
  const clearLiminalWebRoles = () => {
    liminalWebRoles.current = {
      centerNodeId: null,
      ring1NodeIds: new Set(),
      ring2NodeIds: new Set(),
      ring3NodeIds: new Set(),
      sphereNodeIds: new Set()
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
    focusOnNode: (nodeId: string) => {
      try {
        // Deduplicate rapid calls (e.g., direct call + useEffect reaction to same state change).
        const now = globalThis.performance.now();
        if (focusedNodeId.current === nodeId && (now - lastFocusTimestamp.current) < 100) {
          console.log(`[FOCUS] focusOnNode SKIPPED for ${nodeId.slice(0,8)} (duplicate within 100ms)`);
          return;
        }
        lastFocusTimestamp.current = now;

        const currentLayout = useInterBrainStore.getState().spatialLayout;
        const isLiminalToLiminal = currentLayout === 'liminal-web';
        console.log(`[FOCUS] focusOnNode called for ${nodeId.slice(0,8)}, currentLayout=${currentLayout}, isLiminalToLiminal=${isLiminalToLiminal}`);

        // ── Step 1: Snapshot previous state BEFORE mutating anything ──
        // This is critical for liminal→liminal transitions where we need to know
        // which nodes were already on screen (move smoothly) vs new (fly in from ring).
        const previousCenterId = focusedNodeId.current;
        const previousRingNodeIds = new Set([
          ...(liminalWebRoles.current?.ring1NodeIds || []),
          ...(liminalWebRoles.current?.ring2NodeIds || []),
          ...(liminalWebRoles.current?.ring3NodeIds || []),
        ]);
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

          console.log(`[FOCUS] Ephemeral: ${keepIds.length} kept, ${exitIds.length} exiting, ${staleIds.length} stale`);

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
          ring1NodeIds: new Set(positions.ring1Nodes.map(n => n.nodeId)),
          ring2NodeIds: new Set(positions.ring2Nodes.map(n => n.nodeId)),
          ring3NodeIds: new Set(positions.ring3Nodes.map(n => n.nodeId)),
          sphereNodeIds: new Set(positions.sphereNodes || [])
        };

        applyWorldRotationCorrection(positions);

        isTransitioning.current = true;
        focusedNodeId.current = nodeId;

        // Only update to liminal-web if not in a mode that manages its own layout
        const currentLayout2 = useInterBrainStore.getState().spatialLayout;
        if (currentLayout2 !== 'edit' && currentLayout2 !== 'relationship-edit' && currentLayout2 !== 'copilot') {
          setSpatialLayout('liminal-web');
        }

        // ── Step 5: Categorize and log ──
        const ephemeralRingNodes = allRingNodes.filter(n => !mountedNodes.has(n.nodeId));
        const mountedRingNodes = allRingNodes.filter(n => mountedNodes.has(n.nodeId));
        console.log(`[FOCUS] Ring nodes: ${allRingNodes.length} total, ${mountedRingNodes.length} mounted, ${ephemeralRingNodes.length} ephemeral, sphere=${positions.sphereNodes?.length || 0}`);

        // ── Step 6: Animate nodes ──
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
    
    focusOnNodeWithFlyIn: (nodeId: string, newNodeId: string) => {
      try {
        const relationshipGraph = buildFullRelationshipGraph();
        const positions = calculateRingLayoutPositions(nodeId, relationshipGraph, DEFAULT_RING_CONFIG);

        liminalWebRoles.current = {
          centerNodeId: positions.centerNode?.nodeId || null,
          ring1NodeIds: new Set(positions.ring1Nodes.map(n => n.nodeId)),
          ring2NodeIds: new Set(positions.ring2Nodes.map(n => n.nodeId)),
          ring3NodeIds: new Set(positions.ring3Nodes.map(n => n.nodeId)),
          sphereNodeIds: new Set(positions.sphereNodes)
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
    
    returnToConstellation: () => {
      // Guard against double-calls during transition
      if (isTransitioning.current) {
        console.log(`[LIFECYCLE] returnToConstellation: BLOCKED by isTransitioning guard`);
        return;
      }

      const ephemeralCount = useInterBrainStore.getState().ephemeralNodes.size;
      const totalRefs = nodeRefs.current.size;
      console.log(`[LIFECYCLE] returnToConstellation: starting, ${totalRefs} refs, ${ephemeralCount} ephemeral nodes`);

      isTransitioning.current = true;
      focusedNodeId.current = null;
      setSpatialLayout('constellation');

      const worldRotation = dreamWorldRef.current?.quaternion.clone();

      // Capture roles BEFORE clearing them so we can use correct easing
      const rolesSnapshot = {
        centerNodeId: liminalWebRoles.current.centerNodeId,
        ring1NodeIds: new Set(liminalWebRoles.current.ring1NodeIds),
        ring2NodeIds: new Set(liminalWebRoles.current.ring2NodeIds),
        ring3NodeIds: new Set(liminalWebRoles.current.ring3NodeIds),
        sphereNodeIds: new Set(liminalWebRoles.current.sphereNodeIds),
      };

      // Get easing from snapshot instead of live roles
      const getEasingFromSnapshot = (nodeId: string): string => {
        if (nodeId === rolesSnapshot.centerNodeId ||
            rolesSnapshot.ring1NodeIds.has(nodeId) ||
            rolesSnapshot.ring2NodeIds.has(nodeId) ||
            rolesSnapshot.ring3NodeIds.has(nodeId)) {
          return 'easeInQuart';
        } else if (rolesSnapshot.sphereNodeIds.has(nodeId)) {
          return 'easeOutQuart';
        }
        return 'easeOutCubic';
      };

      // Return all nodes with role-based easing
      nodeRefs.current.forEach((_, nodeId) => {
        returnNodeToScaledPosition(nodeId, transitionDuration, worldRotation, getEasingFromSnapshot(nodeId));
      });

      clearLiminalWebRoles();

      globalThis.setTimeout(() => {
        // Only deactivate nodes if we're still in constellation mode.
        // If a new layout transition started (e.g., search), don't override it.
        const currentLayout = useInterBrainStore.getState().spatialLayout;
        if (currentLayout === 'constellation') {
          nodeRefs.current.forEach((nodeRef) => {
            nodeRef.current?.setActiveState(false);
          });
        }
        isTransitioning.current = false;
      }, transitionDuration);

      onConstellationReturn?.();
    },

    // Legacy aliases - these now just call the base methods which handle interruption
    interruptAndFocusOnNode: (nodeId: string) => {
      // All movement now handles interruption automatically
      const self = ref as React.MutableRefObject<SpatialOrchestratorRef>;
      self.current?.focusOnNode(nodeId);
    },

    interruptAndReturnToConstellation: () => {
      // All movement now handles interruption automatically
      const self = ref as React.MutableRefObject<SpatialOrchestratorRef>;
      self.current?.returnToConstellation();
    },

    getFocusedNodeId: () => focusedNodeId.current,
    
    isFocusedMode: () => focusedNodeId.current !== null,
    
    showSearchResults: (searchResults: DreamNode[]) => {
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
          ring1NodeIds: new Set(positions.ring1Nodes.map(n => n.nodeId)),
          ring2NodeIds: new Set(positions.ring2Nodes.map(n => n.nodeId)),
          ring3NodeIds: new Set(positions.ring3Nodes.map(n => n.nodeId)),
          sphereNodeIds: new Set(positions.sphereNodes)
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

    moveAllToSphereForSearch: () => {
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
    
    showEditModeSearchResults: (centerNodeId: string, searchResults: DreamNode[]) => {
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
          
          centerNodeRef.current.setActiveState(true);
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
            // Move to sphere surface
            nodeRef.current.returnToConstellation(transitionDuration, 'easeInQuart');
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
            // Move to sphere surface
            nodeRef.current.returnToConstellation(fastTransitionDuration, 'easeInQuart');
          }
        });
        
        console.log('SpatialOrchestrator: Edit mode reordering complete');
        
      } catch (error) {
        console.error('SpatialOrchestrator: Error during edit mode reordering:', error);
      }
    },
    
    animateToLiminalWebFromEdit: (nodeId: string) => {
      try {
        const relationshipGraph = buildFullRelationshipGraph();
        const positions = calculateRingLayoutPositions(nodeId, relationshipGraph, DEFAULT_RING_CONFIG);

        liminalWebRoles.current = {
          centerNodeId: positions.centerNode?.nodeId || null,
          ring1NodeIds: new Set(positions.ring1Nodes.map(n => n.nodeId)),
          ring2NodeIds: new Set(positions.ring2Nodes.map(n => n.nodeId)),
          ring3NodeIds: new Set(positions.ring3Nodes.map(n => n.nodeId)),
          sphereNodeIds: new Set(positions.sphereNodes)
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

        // For ephemeral nodes, the spawn animation effect in DreamNode3D already handles
        // the ring→target animation using ephemeralState.spawnPosition → ephemeralState.targetPosition.
        // Executing the pending moveToPosition would override the spawn animation with a
        // movement starting from [0,0,0] (constellation positionMode), causing spawn-in-place.
        const isEphemeral = useInterBrainStore.getState().ephemeralNodes.has(nodeId);
        if (isEphemeral) {
          console.log(`[REGISTER] ${nodeId.slice(0,8)}: ephemeral, skipping pending movement`);
          // Still set active state so the node participates in the layout
          if (pendingMovement.setActive && nodeRef.current) {
            nodeRef.current.setActiveState(true);
          }
          return;
        }

        // Use a short delay to ensure the node is fully initialized
        globalThis.setTimeout(() => {
          if (nodeRef.current) {
            if (pendingMovement.setActive) {
              nodeRef.current.setActiveState(true);
            }
            nodeRef.current.moveToPosition(
              pendingMovement.position,
              pendingMovement.duration,
              pendingMovement.easing
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
        const activeRingNodeIds = [
          ...liminalWebRoles.current.ring1NodeIds,
          ...liminalWebRoles.current.ring2NodeIds,
          ...liminalWebRoles.current.ring3NodeIds,
        ];
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

    hideRelatedNodesInLiminalWeb: () => {
      try {
        const allRingNodeIds = [
          ...liminalWebRoles.current.ring1NodeIds,
          ...liminalWebRoles.current.ring2NodeIds,
          ...liminalWebRoles.current.ring3NodeIds
        ];

        const buttonAnimationDuration = 500; // Match radial button animation

        allRingNodeIds.forEach(nodeId => {
          returnNodeToConstellation(nodeId, buttonAnimationDuration, 'easeInQuart');
        });

      } catch (error) {
        console.error('[Orchestrator-LiminalWeb] Error hiding related nodes:', error);
      }
    },

    showRelatedNodesInLiminalWeb: () => {
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
    }
  }), [dreamNodes, onNodeFocused, onConstellationReturn, transitionDuration]);

  // Removed excessive node count logging

  // Call ready callback on mount
  useEffect(() => {
    onOrchestratorReady?.();
  }, [onOrchestratorReady]);
  
  // This component renders nothing - it's purely for orchestration
  return null;
});

SpatialOrchestrator.displayName = 'SpatialOrchestrator';

export default SpatialOrchestrator;