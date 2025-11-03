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
import { DreamNode } from '../types/dreamnode';
import { DreamNode3DRef } from './DreamNode3D';
import { buildRelationshipGraph } from '../utils/relationship-graph';
import { calculateRingLayoutPositions, calculateRingLayoutPositionsForSearch, DEFAULT_RING_CONFIG } from './layouts/RingLayout';
import { computeConstellationLayout, createFallbackLayout } from './constellation/ConstellationLayout';
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
  // const resetAllFlips = useInterBrainStore(state => state.resetAllFlips); // Removed - flip reset now handled by nodes
  
  // Track current edit mode search results for dynamic reordering
  const currentEditModeSearchResults = useRef<DreamNode[]>([]);
  const currentEditModeCenterNodeId = useRef<string | null>(null);
  
  // Track the stable lists for swapping logic
  const relatedNodesList = useRef<Array<{ id: string; name: string; type: string }>>([]);
  const unrelatedSearchResultsList = useRef<Array<{ id: string; name: string; type: string }>>([]);
  
  useImperativeHandle(ref, () => ({
    focusOnNode: (nodeId: string) => {
      try {
        // Build relationship graph from current nodes
        const relationshipGraph = buildRelationshipGraph(dreamNodes);

        // Calculate ring layout positions (in local sphere space)
        const positions = calculateRingLayoutPositions(nodeId, relationshipGraph, DEFAULT_RING_CONFIG);

        // Defensive check - ensure all arrays exist
        if (!positions || !positions.ring1Nodes || !positions.ring2Nodes || !positions.ring3Nodes) {
          console.error('SpatialOrchestrator: Invalid positions returned from calculateRingLayoutPositions', positions);
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

        // Apply world-space position correction based on current sphere rotation
        if (dreamWorldRef.current) {
          const sphereRotation = dreamWorldRef.current.quaternion.clone();

          // We need to apply the INVERSE rotation to counteract the sphere's rotation
          // This makes the liminal web appear in camera-relative positions regardless of sphere rotation
          const inverseRotation = sphereRotation.invert();

          // Transform center node position to world space (if exists)
          if (positions.centerNode) {
            const centerPos = new Vector3(...positions.centerNode.position);
            centerPos.applyQuaternion(inverseRotation);
            positions.centerNode.position = [centerPos.x, centerPos.y, centerPos.z];
          }

          // Transform all ring node positions to world space
          [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].forEach(node => {
            const originalPos = new Vector3(...node.position);
            originalPos.applyQuaternion(inverseRotation);
            node.position = [originalPos.x, originalPos.y, originalPos.z];
          });
        }
        
        // Start transition
        isTransitioning.current = true;
        focusedNodeId.current = nodeId;
        
        // Only update to liminal-web if not already in edit mode or copilot mode
        // Edit mode and copilot mode manage their own layout state
        const currentLayout = useInterBrainStore.getState().spatialLayout;
        if (currentLayout !== 'edit' && currentLayout !== 'edit-search' && currentLayout !== 'copilot') {
          setSpatialLayout('liminal-web');
        }
        
        // Move center node to focus position (if exists)
        if (positions.centerNode) {
          const centerNodeRef = nodeRefs.current.get(positions.centerNode.nodeId);
          if (centerNodeRef?.current) {
            centerNodeRef.current.setActiveState(true);
            // Center node uses ease-out for smooth arrival
            centerNodeRef.current.moveToPosition(positions.centerNode.position, transitionDuration, 'easeOutQuart');
          }
        }
        
        // Move all ring nodes to their positions (hexagonal rings "break free")
        [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].forEach(({ nodeId: ringNodeId, position }) => {
          const nodeRef = nodeRefs.current.get(ringNodeId);
          if (nodeRef?.current) {
            nodeRef.current.setActiveState(true);
            // Ring nodes use ease-out for smooth arrival into view
            nodeRef.current.moveToPosition(position, transitionDuration, 'easeOutQuart');
          }
        });
        
        // Move sphere nodes to sphere surface (out of the way for clean liminal web view)
        positions.sphereNodes.forEach(sphereNodeId => {
          const nodeRef = nodeRefs.current.get(sphereNodeId);
          if (nodeRef?.current) {
            // Sphere nodes use ease-in for quick departure from view
            nodeRef.current.returnToConstellation(transitionDuration, 'easeInQuart');
          }
        });
        
        // Set transition complete after animation duration
        globalThis.setTimeout(() => {
          isTransitioning.current = false;
        }, transitionDuration);
        
        // Notify callback
        onNodeFocused?.(nodeId);
        
      } catch (error) {
        console.error('SpatialOrchestrator: Error during focus transition:', error);
        isTransitioning.current = false;
      }
    },
    
    focusOnNodeWithFlyIn: (nodeId: string, newNodeId: string) => {
      try {
        console.log(`SpatialOrchestrator: Focus on ${nodeId} with fly-in animation for new node ${newNodeId}`);
        
        // Build relationship graph from current nodes
        const relationshipGraph = buildRelationshipGraph(dreamNodes);
        
        // Calculate ring layout positions (in local sphere space)
        const positions = calculateRingLayoutPositions(nodeId, relationshipGraph, DEFAULT_RING_CONFIG);
        
        // Track node roles for proper constellation return
        liminalWebRoles.current = {
          centerNodeId: positions.centerNode?.nodeId || null,
          ring1NodeIds: new Set(positions.ring1Nodes.map(n => n.nodeId)),
          ring2NodeIds: new Set(positions.ring2Nodes.map(n => n.nodeId)),
          ring3NodeIds: new Set(positions.ring3Nodes.map(n => n.nodeId)),
          sphereNodeIds: new Set(positions.sphereNodes)
        };
        
        // Apply world-space position correction based on current sphere rotation
        if (dreamWorldRef.current) {
          const sphereRotation = dreamWorldRef.current.quaternion.clone();
          const inverseRotation = sphereRotation.invert();
          
          // Transform center node position to world space (if exists)
          if (positions.centerNode) {
            const centerPos = new Vector3(...positions.centerNode.position);
            centerPos.applyQuaternion(inverseRotation);
            positions.centerNode.position = [centerPos.x, centerPos.y, centerPos.z];
          }
          
          // Transform all ring node positions to world space
          [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].forEach(node => {
            const originalPos = new Vector3(...node.position);
            originalPos.applyQuaternion(inverseRotation);
            node.position = [originalPos.x, originalPos.y, originalPos.z];
          });
        }
        
        // Start transition
        isTransitioning.current = true;
        focusedNodeId.current = nodeId;
        
        // Only update to liminal-web if not already in edit mode or copilot mode
        // Edit mode and copilot mode manage their own layout state
        const currentLayout = useInterBrainStore.getState().spatialLayout;
        if (currentLayout !== 'edit' && currentLayout !== 'edit-search' && currentLayout !== 'copilot') {
          setSpatialLayout('liminal-web');
        }
        
        // Move center node to focus position (if exists)
        if (positions.centerNode) {
          const centerNodeRef = nodeRefs.current.get(positions.centerNode.nodeId);
          if (centerNodeRef?.current) {
            centerNodeRef.current.setActiveState(true);
            // Center node uses ease-out for smooth arrival
            centerNodeRef.current.moveToPosition(positions.centerNode.position, transitionDuration, 'easeOutQuart');
          }
        }
        
        // Move ring nodes with special handling for the newly created node
        [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].forEach(({ nodeId: ringNodeId, position }) => {
          const nodeRef = nodeRefs.current.get(ringNodeId);
          if (nodeRef?.current) {
            nodeRef.current.setActiveState(true);
            
            if (ringNodeId === newNodeId) {
              // NEW NODE: Let it spawn at drop position first, then fly to ring position
              console.log(`SpatialOrchestrator: New node ${newNodeId} will fly from spawn position to ring position`);
              // Use a slightly longer duration for the fly-in effect to make it more dramatic
              nodeRef.current.moveToPosition(position, transitionDuration * 1.2, 'easeOutCubic');
            } else {
              // EXISTING NODES: Move normally to their ring positions
              nodeRef.current.moveToPosition(position, transitionDuration, 'easeOutQuart');
            }
          }
        });
        
        // Move sphere nodes to sphere surface (out of the way for clean liminal web view)
        positions.sphereNodes.forEach(sphereNodeId => {
          const nodeRef = nodeRefs.current.get(sphereNodeId);
          if (nodeRef?.current) {
            // Sphere nodes use ease-in for quick departure from view
            nodeRef.current.returnToConstellation(transitionDuration, 'easeInQuart');
          }
        });
        
        // Set transition complete after animation duration (use longer duration for fly-in)
        globalThis.setTimeout(() => {
          isTransitioning.current = false;
        }, transitionDuration * 1.2);
        
        // Notify callback
        onNodeFocused?.(nodeId);
        
      } catch (error) {
        console.error('SpatialOrchestrator: Error during focus with fly-in transition:', error);
        isTransitioning.current = false;
      }
    },
    
    returnToConstellation: () => {
      // Start transition
      isTransitioning.current = true;
      focusedNodeId.current = null;
      
      // Note: Flip states now reset smoothly via Universal Movement API flip-back animation
      // resetAllFlips(); // Removed - handled by individual nodes during movement
      
      // Update store to constellation layout mode
      setSpatialLayout('constellation');
      
      // Get current sphere rotation for accurate scaled position calculation
      let worldRotation = undefined;
      if (dreamWorldRef.current) {
        worldRotation = dreamWorldRef.current.quaternion.clone();
      }
      
      // Return ALL nodes to their dynamically scaled constellation positions
      // This handles both active (center+rings) and inactive (sphere) nodes correctly
      const { centerNodeId, ring1NodeIds, ring2NodeIds, ring3NodeIds, sphereNodeIds } = liminalWebRoles.current;
      
      // Return ALL nodes to scaled positions with role-based easing
      nodeRefs.current.forEach((nodeRef, nodeId) => {
        if (nodeRef.current) {
          // Determine appropriate easing based on node's role in liminal web
          let easing = 'easeOutCubic'; // Default fallback
          if (nodeId === centerNodeId || ring1NodeIds.has(nodeId) || ring2NodeIds.has(nodeId) || ring3NodeIds.has(nodeId)) {
            // Active nodes moving OUT from liminal positions - accelerate as they leave
            easing = 'easeInQuart';
          } else if (sphereNodeIds.has(nodeId)) {
            // Inactive nodes moving IN from sphere surface - decelerate as they arrive
            easing = 'easeOutQuart';
          }
          
          // Pass world rotation for accurate scaling + role-based easing
          nodeRef.current.returnToScaledPosition(transitionDuration, worldRotation, easing);
        }
      });
      
      // Clear role tracking after initiating return
      liminalWebRoles.current = {
        centerNodeId: null,
        ring1NodeIds: new Set(),
        ring2NodeIds: new Set(),
        ring3NodeIds: new Set(),
        sphereNodeIds: new Set()
      };
      
      // Set transition complete after animation duration
      globalThis.setTimeout(() => {
        // Ensure all nodes are back in constellation mode
        nodeRefs.current.forEach((nodeRef, _nodeId) => {
          if (nodeRef.current) {
            nodeRef.current.setActiveState(false);
          }
        });
        
        isTransitioning.current = false;
      }, transitionDuration);
      
      // Notify callback
      onConstellationReturn?.();
    },
    
    interruptAndFocusOnNode: (nodeId: string) => {
      try {
        // Build relationship graph from current nodes
        const relationshipGraph = buildRelationshipGraph(dreamNodes);
        
        // Calculate ring layout positions (in local sphere space)
        const positions = calculateRingLayoutPositions(nodeId, relationshipGraph, DEFAULT_RING_CONFIG);
        
        // Track node roles for proper constellation return
        liminalWebRoles.current = {
          centerNodeId: positions.centerNode?.nodeId || null,
          ring1NodeIds: new Set(positions.ring1Nodes.map(n => n.nodeId)),
          ring2NodeIds: new Set(positions.ring2Nodes.map(n => n.nodeId)),
          ring3NodeIds: new Set(positions.ring3Nodes.map(n => n.nodeId)),
          sphereNodeIds: new Set(positions.sphereNodes)
        };
        
        // Apply world-space position correction based on current sphere rotation
        if (dreamWorldRef.current) {
          const sphereRotation = dreamWorldRef.current.quaternion.clone();
          
          // We need to apply the INVERSE rotation to counteract the sphere's rotation
          // This makes the liminal web appear in camera-relative positions regardless of sphere rotation
          const inverseRotation = sphereRotation.invert();
          
          // Transform center node position to world space (if exists)
          if (positions.centerNode) {
            const centerPos = new Vector3(...positions.centerNode.position);
            centerPos.applyQuaternion(inverseRotation);
            positions.centerNode.position = [centerPos.x, centerPos.y, centerPos.z];
          }
          
          // Transform all ring node positions to world space
          [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].forEach(node => {
            const originalPos = new Vector3(...node.position);
            originalPos.applyQuaternion(inverseRotation);
            node.position = [originalPos.x, originalPos.y, originalPos.z];
          });
        }
        
        // Start transition (allow interruption of existing transitions)
        isTransitioning.current = true;
        focusedNodeId.current = nodeId;
        
        // Only update to liminal-web if not already in edit mode
        const currentLayout = useInterBrainStore.getState().spatialLayout;
        if (currentLayout !== 'edit' && currentLayout !== 'edit-search' && currentLayout !== 'copilot') {
          setSpatialLayout('liminal-web');
        }
        
        // Move center node to focus position (with interruption support)
        if (positions.centerNode) {
          const centerNodeRef = nodeRefs.current.get(positions.centerNode.nodeId);
          if (centerNodeRef?.current) {
            centerNodeRef.current.setActiveState(true);
            
            // Use interruption-capable method if the node is currently moving
            if (centerNodeRef.current.isMoving()) {
              centerNodeRef.current.interruptAndMoveToPosition(positions.centerNode.position, transitionDuration, 'easeOutQuart');
            } else {
              // Center node uses ease-out for smooth arrival
              centerNodeRef.current.moveToPosition(positions.centerNode.position, transitionDuration, 'easeOutQuart');
            }
          }
        }
        
        // Move all ring nodes to their positions (with interruption support)
        [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].forEach(({ nodeId: ringNodeId, position }) => {
          const nodeRef = nodeRefs.current.get(ringNodeId);
          if (nodeRef?.current) {
            nodeRef.current.setActiveState(true);
            
            // Use interruption-capable method if the node is currently moving
            if (nodeRef.current.isMoving()) {
              nodeRef.current.interruptAndMoveToPosition(position, transitionDuration, 'easeOutQuart');
            } else {
              // Inner circle nodes use ease-out for smooth arrival into view
              nodeRef.current.moveToPosition(position, transitionDuration, 'easeOutQuart');
            }
          }
        });
        
        // Move sphere nodes to sphere surface (with interruption support)
        positions.sphereNodes.forEach(sphereNodeId => {
          const nodeRef = nodeRefs.current.get(sphereNodeId);
          if (nodeRef?.current) {
            // Use interruption-capable method if the node is currently moving
            if (nodeRef.current.isMoving()) {
              nodeRef.current.interruptAndReturnToConstellation(transitionDuration, 'easeInQuart');
            } else {
              // Sphere nodes use ease-in for quick departure from view
              nodeRef.current.returnToConstellation(transitionDuration, 'easeInQuart');
            }
          }
        });
        
        // Set transition complete after animation duration
        globalThis.setTimeout(() => {
          isTransitioning.current = false;
        }, transitionDuration);
        
        // Notify callback
        onNodeFocused?.(nodeId);
        
      } catch (error) {
        console.error('SpatialOrchestrator: Error during interrupt focus transition:', error);
        isTransitioning.current = false;
      }
    },
    
    interruptAndReturnToConstellation: () => {
      // Start transition (allow interruption of existing transitions)
      isTransitioning.current = true;
      focusedNodeId.current = null;
      
      // Update store to constellation layout mode
      setSpatialLayout('constellation');
      
      // Get current sphere rotation for accurate scaled position calculation
      let worldRotation = undefined;
      if (dreamWorldRef.current) {
        worldRotation = dreamWorldRef.current.quaternion.clone();
      }
      
      // Return ALL nodes to their dynamically scaled constellation positions
      // This handles both active (center+rings) and inactive (sphere) nodes correctly
      const { centerNodeId, ring1NodeIds, ring2NodeIds, ring3NodeIds, sphereNodeIds } = liminalWebRoles.current;
      
      // Return ALL nodes to scaled positions with role-based easing (with interruption support)
      nodeRefs.current.forEach((nodeRef, nodeId) => {
        if (nodeRef.current) {
          // Determine appropriate easing based on node's role in liminal web
          let easing = 'easeOutCubic'; // Default fallback
          if (nodeId === centerNodeId || ring1NodeIds.has(nodeId) || ring2NodeIds.has(nodeId) || ring3NodeIds.has(nodeId)) {
            // Active nodes moving OUT from liminal positions - accelerate as they leave
            easing = 'easeInQuart';
          } else if (sphereNodeIds.has(nodeId)) {
            // Inactive nodes moving IN from sphere surface - decelerate as they arrive
            easing = 'easeOutQuart';
          }
          
          // Use interruption-capable method if the node is currently moving
          if (nodeRef.current.isMoving()) {
            nodeRef.current.interruptAndReturnToScaledPosition(transitionDuration, worldRotation, easing);
          } else {
            // Pass world rotation for accurate scaling + role-based easing
            nodeRef.current.returnToScaledPosition(transitionDuration, worldRotation, easing);
          }
        }
      });
      
      // Clear role tracking after initiating return
      liminalWebRoles.current = {
        centerNodeId: null,
        ring1NodeIds: new Set(),
        ring2NodeIds: new Set(),
        ring3NodeIds: new Set(),
        sphereNodeIds: new Set()
      };
      
      // Set transition complete after animation duration
      globalThis.setTimeout(() => {
        // Ensure all nodes are back in constellation mode
        nodeRefs.current.forEach((nodeRef, _nodeId) => {
          if (nodeRef.current) {
            nodeRef.current.setActiveState(false);
          }
        });
        
        isTransitioning.current = false;
      }, transitionDuration);
      
      // Notify callback
      onConstellationReturn?.();
    },
    
    getFocusedNodeId: () => focusedNodeId.current,
    
    isFocusedMode: () => focusedNodeId.current !== null,
    
    showSearchResults: (searchResults: DreamNode[]) => {
      try {
        // Build relationship graph from current nodes for search context
        const relationshipGraph = buildRelationshipGraph(dreamNodes);
        
        // Create ordered nodes from search results (already ordered by relevance)
        const orderedNodes = searchResults.map(node => ({ 
          id: node.id, 
          name: node.name, 
          type: node.type 
        }));
        
        // Calculate ring layout positions for search results (no center node)
        const positions = calculateRingLayoutPositionsForSearch(orderedNodes, relationshipGraph, DEFAULT_RING_CONFIG);
        
        // Track node roles for proper constellation return
        liminalWebRoles.current = {
          centerNodeId: null, // No center in search mode
          ring1NodeIds: new Set(positions.ring1Nodes.map(n => n.nodeId)),
          ring2NodeIds: new Set(positions.ring2Nodes.map(n => n.nodeId)),
          ring3NodeIds: new Set(positions.ring3Nodes.map(n => n.nodeId)),
          sphereNodeIds: new Set(positions.sphereNodes)
        };
        
        // Apply world-space position correction based on current sphere rotation
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
        
        // Start transition
        isTransitioning.current = true;
        focusedNodeId.current = null; // No focused node in search mode
        
        // Update store to search layout mode (already done by search command)
        setSpatialLayout('search');
        
        // Move all ring nodes to their positions (search results in honeycomb)
        [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].forEach(({ nodeId: ringNodeId, position }) => {
          const nodeRef = nodeRefs.current.get(ringNodeId);
          if (nodeRef?.current) {
            nodeRef.current.setActiveState(true);
            // Ring nodes use ease-out for smooth arrival into view
            nodeRef.current.moveToPosition(position, transitionDuration, 'easeOutQuart');
          }
        });
        
        // Move non-search nodes to sphere surface (out of the way)
        positions.sphereNodes.forEach(sphereNodeId => {
          const nodeRef = nodeRefs.current.get(sphereNodeId);
          if (nodeRef?.current) {
            // Sphere nodes use ease-in for quick departure from view
            nodeRef.current.returnToConstellation(transitionDuration, 'easeInQuart');
          }
        });
        
        // Set transition complete after animation duration
        globalThis.setTimeout(() => {
          isTransitioning.current = false;
        }, transitionDuration);
        
        console.log(`SpatialOrchestrator: Showing ${searchResults.length} search results in honeycomb layout`);
        
      } catch (error) {
        console.error('SpatialOrchestrator: Error during search results display:', error);
        isTransitioning.current = false;
      }
    },
    
    moveAllToSphereForSearch: () => {
      try {
        console.log('SpatialOrchestrator: Moving all nodes to sphere surface for search interface');
        
        // Mark as transitioning to prevent interference
        isTransitioning.current = true;
        
        // Move all nodes to sphere surface using sphere node easing (like liminal web mode)
        nodeRefs.current.forEach((nodeRef) => {
          if (nodeRef?.current) {
            // Use same easing as liminal web: sphere nodes use ease-in for departure
            nodeRef.current.returnToConstellation(transitionDuration, 'easeInQuart');
          }
        });
        
        // Track this as a search focused state (SearchNode acts as focused node)
        focusedNodeId.current = 'search-interface';
        
        // Set transition complete after animation duration
        globalThis.setTimeout(() => {
          isTransitioning.current = false;
        }, transitionDuration);
        
        console.log('SpatialOrchestrator: All nodes moved to sphere surface for search interface');
        
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
        console.log('SpatialOrchestrator: Special edit mode save transition for node:', nodeId);
        
        // Build relationship graph from current nodes
        const relationshipGraph = buildRelationshipGraph(dreamNodes);
        
        // Calculate ring layout positions (in local sphere space)
        const positions = calculateRingLayoutPositions(nodeId, relationshipGraph, DEFAULT_RING_CONFIG);
        
        // Track node roles for proper constellation return
        liminalWebRoles.current = {
          centerNodeId: positions.centerNode?.nodeId || null,
          ring1NodeIds: new Set(positions.ring1Nodes.map(n => n.nodeId)),
          ring2NodeIds: new Set(positions.ring2Nodes.map(n => n.nodeId)),
          ring3NodeIds: new Set(positions.ring3Nodes.map(n => n.nodeId)),
          sphereNodeIds: new Set(positions.sphereNodes)
        };
        
        // Apply world-space position correction based on current sphere rotation
        if (dreamWorldRef.current) {
          const sphereRotation = dreamWorldRef.current.quaternion.clone();
          const inverseRotation = sphereRotation.invert();
          
          // Transform center node position to world space (if exists)
          if (positions.centerNode) {
            const centerPos = new Vector3(...positions.centerNode.position);
            centerPos.applyQuaternion(inverseRotation);
            positions.centerNode.position = [centerPos.x, centerPos.y, centerPos.z];
          }
          
          // Transform all ring node positions to world space
          [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].forEach(node => {
            const originalPos = new Vector3(...node.position);
            originalPos.applyQuaternion(inverseRotation);
            node.position = [originalPos.x, originalPos.y, originalPos.z];
          });
        }
        
        // Start transition
        isTransitioning.current = true;
        focusedNodeId.current = nodeId;
        
        // Update store to liminal-web layout mode
        setSpatialLayout('liminal-web');
        
        // IMPORTANT: Move center node TO center position (it might be in honeycomb layout)
        // The EditNode is fading out, so we need the actual DreamNode at center
        if (positions.centerNode) {
          const centerNodeRef = nodeRefs.current.get(positions.centerNode.nodeId);
          if (centerNodeRef?.current) {
            centerNodeRef.current.setActiveState(true);
            // Move the center node to the center position
            // It might currently be in a honeycomb position from edit mode search layout
            centerNodeRef.current.moveToPosition(positions.centerNode.position, transitionDuration, 'easeOutQuart');
            console.log('SpatialOrchestrator: Moving center node to center for liminal web transition');
          }
        }
        
        // Move all ring nodes to their positions (these DO animate)
        [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].forEach(({ nodeId: ringNodeId, position }) => {
          const nodeRef = nodeRefs.current.get(ringNodeId);
          if (nodeRef?.current) {
            nodeRef.current.setActiveState(true);
            // Ring nodes use ease-out for smooth arrival into view
            nodeRef.current.moveToPosition(position, transitionDuration, 'easeOutQuart');
          }
        });
        
        // Move sphere nodes to sphere surface (out of the way)
        positions.sphereNodes.forEach(sphereNodeId => {
          const nodeRef = nodeRefs.current.get(sphereNodeId);
          if (nodeRef?.current) {
            // Sphere nodes use ease-in for quick departure from view
            nodeRef.current.returnToConstellation(transitionDuration, 'easeInQuart');
          }
        });
        
        // Set transition complete after animation duration
        globalThis.setTimeout(() => {
          isTransitioning.current = false;
        }, transitionDuration);
        
        // Notify callback
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
      const relationshipGraph = store.constellationData.relationshipGraph;

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
        // Get all ring nodes from stored roles
        const allRingNodeIds = [
          ...liminalWebRoles.current.ring1NodeIds,
          ...liminalWebRoles.current.ring2NodeIds,
          ...liminalWebRoles.current.ring3NodeIds
        ];

        // Match button animation duration (500ms) for parallel motion
        const buttonAnimationDuration = 500;

        // Move all ring nodes to constellation surface
        allRingNodeIds.forEach(nodeId => {
          const nodeRef = nodeRefs.current.get(nodeId);
          if (nodeRef?.current) {
            // Use easeInQuart for quick departure, but match button timing
            nodeRef.current.returnToConstellation(buttonAnimationDuration, 'easeInQuart');
          }
        });

      } catch (error) {
        console.error('[Orchestrator-LiminalWeb] Error hiding related nodes:', error);
      }
    },

    showRelatedNodesInLiminalWeb: () => {
      try {

        // Need to recalculate positions to get them back to their ring spots
        if (!liminalWebRoles.current.centerNodeId) {
          console.warn('[Orchestrator-LiminalWeb] No center node found in roles');
          return;
        }

        const relationshipGraph = buildRelationshipGraph(dreamNodes);
        const positions = calculateRingLayoutPositions(
          liminalWebRoles.current.centerNodeId,
          relationshipGraph,
          DEFAULT_RING_CONFIG
        );

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

        // Match button animation duration (500ms) for parallel motion
        const buttonAnimationDuration = 500;

        // Move ring nodes back to their positions
        const allRingNodes = [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes];

        allRingNodes.forEach(({ nodeId, position }) => {
          const nodeRef = nodeRefs.current.get(nodeId);
          if (nodeRef?.current) {
            nodeRef.current.setActiveState(true);
            // Use easeOutQuart for smooth arrival, but match button timing
            nodeRef.current.moveToPosition(position, buttonAnimationDuration, 'easeOutQuart');
          }
        });

      } catch (error) {
        console.error('[Orchestrator-LiminalWeb] Error showing related nodes:', error);
      }
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