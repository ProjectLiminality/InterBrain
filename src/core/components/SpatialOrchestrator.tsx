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
import { useInterBrainStore } from '../store/interbrain-store';

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
   * Move a node to a position, interrupting any current animation.
   */
  const moveNode = (
    nodeId: string,
    position: [number, number, number],
    duration: number,
    easing: string,
    setActive = true
  ) => {
    const nodeRef = nodeRefs.current.get(nodeId);
    if (!nodeRef?.current) return;

    if (setActive) {
      nodeRef.current.setActiveState(true);
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
   */
  const returnNodeToConstellation = (nodeId: string, duration: number, easing: string) => {
    const nodeRef = nodeRefs.current.get(nodeId);
    if (!nodeRef?.current) return;

    if (nodeRef.current.isMoving()) {
      nodeRef.current.interruptAndReturnToConstellation(duration, easing);
    } else {
      nodeRef.current.returnToConstellation(duration, easing);
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
   * Get the appropriate easing for a node based on its role in liminal web.
   * Active nodes (center/rings) use ease-in (accelerate out),
   * inactive nodes (sphere) use ease-out (decelerate in).
   */
  const getEasingForRole = (nodeId: string): string => {
    const { centerNodeId, ring1NodeIds, ring2NodeIds, ring3NodeIds, sphereNodeIds } = liminalWebRoles.current;

    if (nodeId === centerNodeId || ring1NodeIds.has(nodeId) || ring2NodeIds.has(nodeId) || ring3NodeIds.has(nodeId)) {
      return 'easeInQuart';
    } else if (sphereNodeIds.has(nodeId)) {
      return 'easeOutQuart';
    }
    return 'easeOutCubic';
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

  useImperativeHandle(ref, () => ({
    focusOnNode: (nodeId: string) => {
      try {
        const relationshipGraph = buildRelationshipGraph(dreamNodes);
        const positions = calculateRingLayoutPositions(nodeId, relationshipGraph, DEFAULT_RING_CONFIG);

        if (!positions?.ring1Nodes || !positions?.ring2Nodes || !positions?.ring3Nodes) {
          throw new Error('Failed to calculate ring layout positions');
        }

        // Track node roles for proper constellation return
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
        const currentLayout = useInterBrainStore.getState().spatialLayout;
        if (currentLayout !== 'edit' && currentLayout !== 'relationship-edit' && currentLayout !== 'copilot') {
          setSpatialLayout('liminal-web');
        }

        // Move center node
        if (positions.centerNode) {
          moveNode(positions.centerNode.nodeId, positions.centerNode.position, transitionDuration, 'easeOutQuart');
        }

        // Move ring nodes
        [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].forEach(({ nodeId: ringNodeId, position }) => {
          moveNode(ringNodeId, position, transitionDuration, 'easeOutQuart');
        });

        // Move unrelated nodes to constellation
        positions.sphereNodes.forEach(sphereNodeId => {
          returnNodeToConstellation(sphereNodeId, transitionDuration, 'easeInQuart');
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
        const relationshipGraph = buildRelationshipGraph(dreamNodes);
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
      isTransitioning.current = true;
      focusedNodeId.current = null;
      setSpatialLayout('constellation');

      const worldRotation = dreamWorldRef.current?.quaternion.clone();

      // Return all nodes with role-based easing
      nodeRefs.current.forEach((_, nodeId) => {
        returnNodeToScaledPosition(nodeId, transitionDuration, worldRotation, getEasingForRole(nodeId));
      });

      clearLiminalWebRoles();

      globalThis.setTimeout(() => {
        nodeRefs.current.forEach((nodeRef) => {
          nodeRef.current?.setActiveState(false);
        });
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
        const relationshipGraph = buildRelationshipGraph(dreamNodes);
        const orderedNodes = searchResults.map(node => ({ id: node.id, name: node.name, type: node.type }));
        const positions = calculateRingLayoutPositionsForSearch(orderedNodes, relationshipGraph, DEFAULT_RING_CONFIG);

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
        [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].forEach(({ nodeId, position }) => {
          moveNode(nodeId, position, transitionDuration, 'easeOutQuart');
        });

        // Move non-search nodes to constellation
        positions.sphereNodes.forEach(nodeId => {
          returnNodeToConstellation(nodeId, transitionDuration, 'easeInQuart');
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
        const relationshipGraph = buildRelationshipGraph(dreamNodes);
        
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
          // Check if we're in copilot mode vs edit mode
          const store = useInterBrainStore.getState();
          const isInCopilotMode = store.spatialLayout === 'copilot';

          if (isInCopilotMode) {
            // COPILOT MODE: Replace entire list with new search results
            // Copilot needs complete replacement on each search, not accumulation
            unrelatedSearchResultsList.current = [...unrelatedSearchNodes];
          } else {
            // EDIT MODE: Keep existing stable list management for relationship editing
            // Subsequent call (new search results) - merge new unrelated nodes with existing lists
            // Keep existing related nodes, but update unrelated list with new search results
            const existingUnrelatedIds = new Set(unrelatedSearchResultsList.current.map(n => n.id));
            const newUnrelatedNodes = unrelatedSearchNodes.filter(node => !existingUnrelatedIds.has(node.id));

            // Add new unrelated nodes to the list
            unrelatedSearchResultsList.current.push(...newUnrelatedNodes);
          }
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
          
          const nodeRef = nodeRefs.current.get(searchNodeId);
          if (nodeRef?.current) {
            nodeRef.current.setActiveState(true);
            nodeRef.current.moveToPosition(position, transitionDuration, 'easeOutQuart');
          } else {
            console.warn(`⚠️ [Orchestrator-EditMode] Node ref not found for ring node ${searchNodeId}`);
          }
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
        const relationshipGraph = buildRelationshipGraph(dreamNodes);
        
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
          
          const nodeRef = nodeRefs.current.get(searchNodeId);
          if (nodeRef?.current) {
            nodeRef.current.setActiveState(true);
            nodeRef.current.moveToPosition(position, fastTransitionDuration, 'easeOutQuart');
          }
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
        const relationshipGraph = buildRelationshipGraph(dreamNodes);
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
      console.log('🌌 [SpatialOrchestrator] Applying constellation layout...');

      const store = useInterBrainStore.getState();
      // Read relationship graph from dreamweaving slice (source of truth for DreamSong relationships)
      const relationshipGraph = store.dreamSongRelationships.graph;

      if (!relationshipGraph) {
        console.warn('⚠️ [SpatialOrchestrator] No relationship graph available for constellation layout');
        return;
      }

      try {
        // Compute constellation layout
        const layoutResult = computeConstellationLayout(relationshipGraph, dreamNodes);

        if (layoutResult.nodePositions.size === 0) {
          console.warn('⚠️ [SpatialOrchestrator] Constellation layout returned no positions');
          return;
        }

        // Create fallback positions for any missing nodes
        const completePositions = createFallbackLayout(dreamNodes, layoutResult.nodePositions);

        // Store the positions in the store for persistence
        store.setConstellationPositions(completePositions);

        // Update node positions in single batch transaction (100x faster than sequential updates)
        store.batchUpdateNodePositions(completePositions);

        console.log(`✅ [SpatialOrchestrator] Constellation layout applied to ${completePositions.size} nodes via batch update`);
        console.log(`📊 [SpatialOrchestrator] Layout stats:`, {
          clusters: layoutResult.stats.totalClusters,
          nodes: layoutResult.stats.totalNodes,
          edges: layoutResult.stats.totalEdges,
          computationTime: `${layoutResult.stats.computationTimeMs.toFixed(1)}ms`
        });

      } catch (error) {
        console.error('❌ [SpatialOrchestrator] Failed to apply constellation layout:', error);
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

        const relationshipGraph = buildRelationshipGraph(dreamNodes);
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