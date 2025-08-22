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
import { useInterBrainStore } from '../store/interbrain-store';

export interface SpatialOrchestratorRef {
  /** Focus on a specific node - trigger liminal web layout */
  focusOnNode: (nodeId: string) => void;
  
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
  
  /** Register a DreamNode3D ref for orchestration */
  registerNodeRef: (nodeId: string, ref: React.RefObject<DreamNode3DRef>) => void;
  
  /** Unregister a DreamNode3D ref */
  unregisterNodeRef: (nodeId: string) => void;
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
  
  useImperativeHandle(ref, () => ({
    focusOnNode: (nodeId: string) => {
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
        
        // Start transition
        isTransitioning.current = true;
        focusedNodeId.current = nodeId;
        
        // Update store to liminal web layout mode
        setSpatialLayout('liminal-web');
        
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
    
    returnToConstellation: () => {
      // Start transition
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
        
        // Update store to liminal web layout mode
        setSpatialLayout('liminal-web');
        
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
        console.log(`SpatialOrchestrator: Showing ${searchResults.length} related nodes for edit mode`);
        
        // Store current search results for dynamic reordering
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
        
        // Store stable lists for swapping logic
        relatedNodesList.current = [...relatedNodes];
        unrelatedSearchResultsList.current = [...unrelatedSearchNodes];
        
        // Priority ordering: related nodes first (inner rings), then search results (outer rings)
        const orderedNodes = [...relatedNodes, ...unrelatedSearchNodes];
        
        console.log(`SpatialOrchestrator: Initial setup - ${relatedNodes.length} related nodes (golden), ${unrelatedSearchNodes.length} unrelated search results`);
        
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
        
        // IMPORTANT: Move/keep the center node at the actual center position
        const centerNodeRef = nodeRefs.current.get(centerNodeId);
        if (centerNodeRef?.current) {
          centerNodeRef.current.setActiveState(true);
          // Move it to center position (where EditNode will overlay it)
          const centerPosition: [number, number, number] = [0, 0, -50];
          centerNodeRef.current.moveToPosition(centerPosition, transitionDuration, 'easeOutQuart');
          console.log('SpatialOrchestrator: Moving center node to center for edit mode overlay');
        }
        
        // Move search result nodes to ring positions
        [...positions.ring1Nodes, ...positions.ring2Nodes, ...positions.ring3Nodes].forEach(({ nodeId: searchNodeId, position }) => {
          if (searchNodeId === centerNodeId) {
            // Skip the center node - it stays where it is
            return;
          }
          
          const nodeRef = nodeRefs.current.get(searchNodeId);
          if (nodeRef?.current) {
            nodeRef.current.setActiveState(true);
            nodeRef.current.moveToPosition(position, transitionDuration, 'easeOutQuart');
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
        
        console.log(`SpatialOrchestrator: Detected changes - added: ${addedRelationshipIds.length}, removed: ${removedRelationshipIds.length}`);
        
        // Process additions: Move from unrelated list to end of related list
        addedRelationshipIds.forEach(addedId => {
          const nodeIndex = unrelatedSearchResultsList.current.findIndex(n => n.id === addedId);
          if (nodeIndex !== -1) {
            // Remove from unrelated list
            const [movedNode] = unrelatedSearchResultsList.current.splice(nodeIndex, 1);
            // Add to end of related list
            relatedNodesList.current.push(movedNode);
            console.log(`SpatialOrchestrator: Moved node ${movedNode.id} from unrelated to related`);
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
        
        console.log(`SpatialOrchestrator: Final lists - ${relatedNodesList.current.length} related nodes, ${unrelatedSearchResultsList.current.length} unrelated search results`);
        
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