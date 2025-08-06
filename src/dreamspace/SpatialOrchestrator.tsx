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
import { DreamNode } from '../types/dreamnode';
import { DreamNode3DRef } from './DreamNode3D';
import { buildRelationshipGraph } from '../utils/relationship-graph';
import { calculateFocusedLayoutPositions, DEFAULT_FOCUSED_CONFIG } from './layouts/FocusedLayout';

export interface SpatialOrchestratorRef {
  /** Focus on a specific node - trigger liminal web layout */
  focusOnNode: (nodeId: string) => void;
  
  /** Return all nodes to constellation layout */
  returnToConstellation: () => void;
  
  /** Get current focused node ID */
  getFocusedNodeId: () => string | null;
  
  /** Register a DreamNode3D ref for orchestration */
  registerNodeRef: (nodeId: string, ref: React.RefObject<DreamNode3DRef>) => void;
  
  /** Unregister a DreamNode3D ref */
  unregisterNodeRef: (nodeId: string) => void;
}

interface SpatialOrchestratorProps {
  /** All available dream nodes */
  dreamNodes: DreamNode[];
  
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
  
  useImperativeHandle(ref, () => ({
    focusOnNode: (nodeId: string) => {
      if (isTransitioning.current) {
        console.log('SpatialOrchestrator: Ignoring focus request during transition');
        return;
      }
      
      console.log(`SpatialOrchestrator: Focusing on node ${nodeId}`);
      
      try {
        // Build relationship graph from current nodes
        const relationshipGraph = buildRelationshipGraph(dreamNodes);
        
        // Calculate focused layout positions
        const positions = calculateFocusedLayoutPositions(nodeId, relationshipGraph, DEFAULT_FOCUSED_CONFIG);
        
        // Start transition
        isTransitioning.current = true;
        focusedNodeId.current = nodeId;
        
        // Move center node to focus position
        const centerNodeRef = nodeRefs.current.get(positions.centerNode.nodeId);
        console.log(`SpatialOrchestrator: Looking for center node ref ${positions.centerNode.nodeId}, found:`, !!centerNodeRef?.current);
        if (centerNodeRef?.current) {
          console.log(`SpatialOrchestrator: Moving center node to:`, positions.centerNode.position);
          centerNodeRef.current.setActiveState(true);
          centerNodeRef.current.moveToPosition(positions.centerNode.position, transitionDuration);
        } else {
          console.error(`SpatialOrchestrator: Center node ref not found for ${positions.centerNode.nodeId}`);
        }
        
        // Move inner circle nodes to their positions
        positions.innerCircleNodes.forEach(({ nodeId: innerNodeId, position }) => {
          const nodeRef = nodeRefs.current.get(innerNodeId);
          if (nodeRef?.current) {
            nodeRef.current.setActiveState(true);
            nodeRef.current.moveToPosition(position, transitionDuration);
          }
        });
        
        // Move outer circle nodes to buffer positions (far from camera, hidden)
        positions.outerCircleNodes.forEach(({ nodeId: outerNodeId, position }) => {
          const nodeRef = nodeRefs.current.get(outerNodeId);
          if (nodeRef?.current) {
            nodeRef.current.setActiveState(true);
            nodeRef.current.moveToPosition(position, transitionDuration);
          }
        });
        
        // Keep hidden nodes in constellation mode (they stay on sphere)
        positions.hiddenNodes.forEach(hiddenNodeId => {
          const nodeRef = nodeRefs.current.get(hiddenNodeId);
          if (nodeRef?.current) {
            nodeRef.current.setActiveState(false); // Constellation mode
          }
        });
        
        // Set transition complete after animation duration
        globalThis.setTimeout(() => {
          isTransitioning.current = false;
          console.log(`SpatialOrchestrator: Focus transition complete for ${nodeId}`);
        }, transitionDuration);
        
        // Notify callback
        onNodeFocused?.(nodeId);
        
      } catch (error) {
        console.error('SpatialOrchestrator: Error during focus transition:', error);
        isTransitioning.current = false;
      }
    },
    
    returnToConstellation: () => {
      if (isTransitioning.current) {
        console.log('SpatialOrchestrator: Ignoring constellation request during transition');
        return;
      }
      
      console.log('SpatialOrchestrator: Returning to constellation');
      
      // Start transition
      isTransitioning.current = true;
      focusedNodeId.current = null;
      
      // Return all nodes to constellation mode
      nodeRefs.current.forEach((nodeRef, _nodeId) => {
        if (nodeRef.current) {
          nodeRef.current.returnToConstellation(transitionDuration);
        }
      });
      
      // Set transition complete after animation duration
      globalThis.setTimeout(() => {
        // Ensure all nodes are back in constellation mode
        nodeRefs.current.forEach((nodeRef, _nodeId) => {
          if (nodeRef.current) {
            nodeRef.current.setActiveState(false);
          }
        });
        
        isTransitioning.current = false;
        console.log('SpatialOrchestrator: Constellation transition complete');
      }, transitionDuration);
      
      // Notify callback
      onConstellationReturn?.();
    },
    
    getFocusedNodeId: () => focusedNodeId.current,
    
    registerNodeRef: (nodeId: string, nodeRef: React.RefObject<DreamNode3DRef>) => {
      nodeRefs.current.set(nodeId, nodeRef);
      console.log(`SpatialOrchestrator: Registered ref for node ${nodeId}. Total refs: ${nodeRefs.current.size}`);
    },
    
    unregisterNodeRef: (nodeId: string) => {
      nodeRefs.current.delete(nodeId);
      console.log(`SpatialOrchestrator: Unregistered ref for node ${nodeId}`);
    }
  }), [dreamNodes, onNodeFocused, onConstellationReturn, transitionDuration]);
  
  // Log node count changes for debugging
  useEffect(() => {
    console.log(`SpatialOrchestrator: Managing ${dreamNodes.length} nodes`);
  }, [dreamNodes.length]);
  
  // Call ready callback on mount
  useEffect(() => {
    console.log('SpatialOrchestrator: Component mounted, calling onOrchestratorReady');
    onOrchestratorReady?.();
  }, [onOrchestratorReady]);
  
  // This component renders nothing - it's purely for orchestration
  return null;
});

SpatialOrchestrator.displayName = 'SpatialOrchestrator';

export default SpatialOrchestrator;