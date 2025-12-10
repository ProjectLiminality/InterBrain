import React, { useState, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Group, Mesh } from 'three';
import { FlyControls } from '@react-three/drei';
import { DreamNode3D } from '../../features/dreamnode';
import type { DreamNode3DRef } from '../../features/dreamnode/components/DreamNode3D';
import { Star3D, SphereRotationControls, ConstellationEdges, shouldShowConstellationEdges } from '../../features/constellation-layout';
import SpatialOrchestrator, { SpatialOrchestratorRef } from './SpatialOrchestrator';
import { CreationModeOverlay } from '../../features/dreamnode-creator';
import { SearchModeOverlay } from '../../features/search';
import { EditModeOverlay } from '../../features/dreamnode-editor';
import CopilotModeOverlay from '../../features/conversational-copilot/CopilotModeOverlay';
import { RadialButtonRing3D } from '../../features/radial-buttons/RadialButtonRing3D';
import { ActiveVideoCallButton } from '../../features/radial-buttons/ActiveVideoCallButton';
import { DreamNode } from '../../features/dreamnode';
import { useInterBrainStore } from '../store/interbrain-store';
import { serviceManager } from '../services/service-manager';
import { VaultService } from '../services/vault-service';
import { CanvasParserService } from '../../features/dreamweaving/services/canvas-parser-service';
import { CAMERA_INTERSECTION_POINT } from '../../features/constellation-layout/DynamicViewScaling';
import {
  detectDropTarget,
  handleDropOnNode,
  handleNormalDrop,
  handleCommandDrop,
  handleNormalUrlDrop,
  handleCommandUrlDrop,
  handleUrlDropOnNode
} from '../../features/drag-and-drop';
import { openNodeContent } from '../../features/conversational-copilot/utils/open-node-content';
import { OrchestratorContext } from '../context/orchestrator-context';
import { useEscapeKeyHandler, useCopilotOptionKeyHandler, useLiminalWebOptionKeyHandler } from '../hooks';

export default function DreamspaceCanvas() {
  // Get services inside component so they're available after plugin initialization
  const [vaultService, setVaultService] = useState<VaultService | undefined>(undefined);
  const [canvasParserService, setCanvasParserService] = useState<CanvasParserService | undefined>(undefined);
  
  // Load services on component mount (after plugin has initialized)
  useEffect(() => {
    try {
      const vault = serviceManager.getVaultService() || undefined;
      const canvas = serviceManager.getCanvasParserService() || undefined;
      setVaultService(vault);
      setCanvasParserService(canvas);
    } catch {
      console.log('Services not available, flip functionality will be disabled');
    }
  }, []); // Run once on mount
  
  const dreamNodesMap = useInterBrainStore(state => state.dreamNodes);

  // No need to load initial nodes - they come from store.dreamNodes

  // SpatialOrchestrator reference for controlling all spatial interactions
  const spatialOrchestratorRef = useRef<SpatialOrchestratorRef>(null);

  // Unified escape key handler - extracted to core hook
  useEscapeKeyHandler(spatialOrchestratorRef);

  // Drag and drop state - tracks mouse position for 3D drop positioning
  const [dragMousePosition, setDragMousePosition] = useState<{ x: number; y: number } | null>(null);

  // Get nodes from store
  const dreamNodes: DreamNode[] = Array.from(dreamNodesMap.values()).map(data => data.node);
  
  // Reference to the group containing all DreamNodes for rotation
  const dreamWorldRef = useRef<Group>(null);

  // Track when DreamNodes are actually rendered in DOM (for debugging)
  // useEffect(() => {
  //   if (dreamNodes.length > 0) {
  //     console.log(`[DreamNodeRendering] 🎯 useEffect fired - ${dreamNodes.length} dreamNodes`);
  //   }
  // }, [dreamNodes.length]);
  
  // Hit sphere references for scene-based raycasting
  const hitSphereRefs = useRef<Map<string, React.RefObject<Mesh | null>>>(new Map());
  
  // DreamNode3D references for movement commands
  const dreamNodeRefs = useRef<Map<string, React.RefObject<DreamNode3DRef | null>>>(new Map());

  // Debug visualization states from store
  const debugWireframeSphere = useInterBrainStore(state => state.debugWireframeSphere);
  const debugIntersectionPoint = useInterBrainStore(state => state.debugIntersectionPoint);
  const debugFlyingControls = useInterBrainStore(state => state.debugFlyingControls);
  
  // Layout state for controlling dynamic view scaling
  const spatialLayout = useInterBrainStore(state => state.spatialLayout);
  
  // Search results for search mode display
  const searchResults = useInterBrainStore(state => state.searchResults);
  const selectedNode = useInterBrainStore(state => state.selectedNode);

  // Copilot mode state for transcription buffer
  const copilotMode = useInterBrainStore(state => state.copilotMode);

  // Radial button UI state
  const radialButtonUI = useInterBrainStore(state => state.radialButtonUI);

  // Track whether radial button component should be mounted (for exit animation)
  const [shouldMountRadialButtons, setShouldMountRadialButtons] = useState(false);

  // Mount/unmount radial button component based on isActive and animation completion
  useEffect(() => {
    if (radialButtonUI.isActive) {
      setShouldMountRadialButtons(true);
    }
    // Unmount happens via onExitComplete callback
  }, [radialButtonUI.isActive]);

  // Option key handlers - extracted to core hooks
  useCopilotOptionKeyHandler(spatialOrchestratorRef, spatialLayout, copilotMode.showSearchResults);
  useLiminalWebOptionKeyHandler(spatialOrchestratorRef, spatialLayout, selectedNode);

  // Helper function to get or create DreamNode3D ref
  const getDreamNodeRef = (nodeId: string): React.RefObject<DreamNode3DRef | null> => {
    let nodeRef = dreamNodeRefs.current.get(nodeId);
    if (!nodeRef) {
      nodeRef = React.createRef<DreamNode3DRef>();
      dreamNodeRefs.current.set(nodeId, nodeRef);
      
      // Register with orchestrator (need to cast to non-null type)
      if (spatialOrchestratorRef.current && nodeRef) {
        spatialOrchestratorRef.current.registerNodeRef(nodeId, nodeRef as React.RefObject<DreamNode3DRef>);
      }
    }
    return nodeRef;
  };
  
  // Register all existing refs with orchestrator when it becomes ready
  useEffect(() => {
    if (spatialOrchestratorRef.current) {
      dreamNodeRefs.current.forEach((nodeRef, nodeId) => {
        if (nodeRef) {
          spatialOrchestratorRef.current?.registerNodeRef(nodeId, nodeRef as React.RefObject<DreamNode3DRef>);
        }
      });
    }
  }, [dreamNodes.length, spatialOrchestratorRef.current]); // Re-register when nodes change OR orchestrator becomes ready
  
  // Note: Global __interbrainCanvas API has been replaced with store-based navigation.
  // Features now use store.requestNavigation() and core reacts via useEffect above.

  // React to spatial layout changes and trigger appropriate orchestrator methods
  useEffect(() => {
    if (!spatialOrchestratorRef.current) return;

    const store = useInterBrainStore.getState();

    switch (spatialLayout) {
      case 'search':
      case 'edit-search': {
        // Hide radial buttons when entering search mode (incompatible mode)
        if (store.radialButtonUI.isActive) {
          store.setRadialButtonUIActive(false);
        }

        // Both search and edit-search use the same visual architecture
        if (searchResults && searchResults.length > 0) {
          // Check if we're in edit mode - need special handling to maintain stable lists
          if (store.editMode.isActive && store.editMode.editingNode) {
            console.log(`DreamspaceCanvas: Switching to edit mode search results with ${searchResults.length} results`);
            spatialOrchestratorRef.current.showEditModeSearchResults(store.editMode.editingNode.id, searchResults);
          } else {
            console.log(`DreamspaceCanvas: Switching to search results mode with ${searchResults.length} results`);
            spatialOrchestratorRef.current.showSearchResults(searchResults);
          }
        } else if (store.searchInterface.isActive) {
          console.log('DreamspaceCanvas: Switching to search interface mode - moving all nodes to sphere surface');
          // Use liminal web architecture: move all constellation nodes to sphere surface
          // SearchNode acts like the focused node at center position [0, 0, -50]
          spatialOrchestratorRef.current.moveAllToSphereForSearch();
        }
        break;
      }

      case 'edit':
        // Hide radial buttons when entering edit mode (incompatible mode)
        if (store.radialButtonUI.isActive) {
          store.setRadialButtonUIActive(false);
        }

        // Edit mode - similar to liminal-web but in edit state
        if (selectedNode) {
          // Use the same focus logic as liminal-web for now
          spatialOrchestratorRef.current.focusOnNode(selectedNode.id);
        } else {
          console.warn('[Canvas-Layout] Edit mode triggered but no selectedNode available');
        }
        break;

      case 'liminal-web':
        // Trigger liminal web when a node is selected
        if (selectedNode) {
          spatialOrchestratorRef.current.focusOnNode(selectedNode.id);
        } else {
          console.warn('[Canvas-Layout] liminal-web layout triggered but no selectedNode available');
        }
        break;

      case 'copilot': {
        // Hide radial buttons when entering copilot mode (incompatible mode)
        if (store.radialButtonUI.isActive) {
          store.setRadialButtonUIActive(false);
        }

        // Copilot mode - conversation partner at center with search results around them
        if (store.copilotMode.isActive && store.copilotMode.conversationPartner) {
          // Position conversation partner at center (like edit mode)
          spatialOrchestratorRef.current.focusOnNode(store.copilotMode.conversationPartner.id);

          // Always call showEditModeSearchResults to trigger layout (even with empty array)
          // Empty array = all nodes fly to sphere (Option key not held behavior)
          // Non-empty array = relevant nodes in honeycomb, rest on sphere
          if (searchResults) {
            spatialOrchestratorRef.current.showEditModeSearchResults(store.copilotMode.conversationPartner.id, searchResults);
          }
        } else {
          console.warn('[Canvas-Layout] Copilot mode triggered but no active conversation partner');
        }
        break;
      }

      case 'constellation':
        // Hide radial buttons when returning to constellation (no selected node)
        if (store.radialButtonUI.isActive) {
          store.setRadialButtonUIActive(false);
        }

        // Return to constellation
        console.log('DreamspaceCanvas: Returning to constellation mode');
        spatialOrchestratorRef.current.returnToConstellation();
        break;
    }
  }, [spatialLayout, searchResults, selectedNode]); // Watch spatial layout, search results, and selected node

  // React to navigation requests from features
  // This is the universal pattern for feature → core communication
  const navigationRequest = useInterBrainStore(state => state.navigationRequest);
  const clearNavigationRequest = useInterBrainStore(state => state.clearNavigationRequest);

  useEffect(() => {
    if (!navigationRequest || !spatialOrchestratorRef.current) return;

    const orchestrator = spatialOrchestratorRef.current;

    switch (navigationRequest.type) {
      case 'focus':
        if (navigationRequest.nodeId) {
          if (navigationRequest.interrupt) {
            orchestrator.interruptAndFocusOnNode(navigationRequest.nodeId);
          } else {
            orchestrator.focusOnNode(navigationRequest.nodeId);
          }
        }
        break;

      case 'constellation':
        if (navigationRequest.interrupt) {
          orchestrator.interruptAndReturnToConstellation();
        } else {
          orchestrator.returnToConstellation();
        }
        break;

      case 'applyLayout':
        orchestrator.applyConstellationLayout();
        break;
    }

    // Clear the request after processing
    clearNavigationRequest();
  }, [navigationRequest, clearNavigationRequest]);

  // Note: Custom DOM events for edit mode have been replaced with OrchestratorContext
  // EditModeOverlay now calls orchestrator methods directly via useOrchestrator() hook
  
  // Debug logging for creation state (removed excessive logging)
  
  // Callback to collect hit sphere references from DreamNode3D components
  const handleHitSphereRef = (nodeId: string, meshRef: React.RefObject<Mesh | null>) => {
    hitSphereRefs.current.set(nodeId, meshRef);
  };

  const handleNodeHover = (_node: DreamNode, _isHovered: boolean) => {
    // Hover state handled by individual DreamNode3D components
  };

  const handleNodeClick = async (node: DreamNode) => {
    const store = useInterBrainStore.getState();

    // Handle copilot mode invoke interaction
    if (store.spatialLayout === 'copilot' && store.copilotMode.isActive) {
      // IMPORTANT: Prevent clicking the conversation partner itself
      if (store.copilotMode.conversationPartner?.id === node.id) {
        console.log(`❌ [Copilot] Cannot invoke conversation partner node: ${node.name}`);
        return; // Do nothing when clicking the conversation partner
      }

      console.log(`🤖 [Copilot] Invoking node via CLICK: ${node.name}`);

      // CRITICAL: Record invocation for conversation export
      try {
        const { getConversationRecordingService } = await import('../../features/conversational-copilot/services/conversation-recording-service');
        const recordingService = getConversationRecordingService();
        console.log(`🎙️ [Copilot-Click] About to record invocation for: ${node.name}`);
        await recordingService.recordInvocation(node);
        console.log(`✅ [Copilot-Click] Invocation recorded successfully`);
      } catch (error) {
        console.error('❌ [Copilot-Click] Failed to record invocation:', error);
        // Don't block the click flow if recording fails
      }

      // Track this node as shared
      store.addSharedNode(node.id);
      console.log(`🔗 [Copilot] Added shared node: ${node.name} (${node.id})`);

      // Get updated state to log current shared nodes
      const updatedStore = useInterBrainStore.getState();
      console.log(`🔗 [Copilot] Total shared nodes: ${updatedStore.copilotMode.sharedNodeIds.length}`);
      console.log(`🔗 [Copilot] Shared node IDs:`, updatedStore.copilotMode.sharedNodeIds);

      // Open appropriate fullscreen view
      await openNodeContent(node, vaultService, canvasParserService);

      return; // Prevent liminal-web navigation
    }

    // Handle edit mode relationship toggling
    if (store.editMode.isActive && store.editMode.editingNode) {
      // In edit mode, clicking a node toggles its relationship status
      store.togglePendingRelationship(node.id);
      console.log(`Edit mode: Toggled relationship with "${node.name}"`);

      // Trigger immediate reordering for priority-based positioning
      if (spatialOrchestratorRef.current) {
        spatialOrchestratorRef.current.reorderEditModeSearchResults();
      }

      return; // Don't do normal click handling in edit mode
    }
    
    // Normal click handling (not in edit mode)
    
    // If we're in search mode, properly exit search interface when clicking a result
    if (store.spatialLayout === 'search' && store.searchInterface.isActive) {
      console.log('Clicking search result - exiting search mode cleanly');
      store.setSearchActive(false); // This clears search query and results
    }
    
    store.setSelectedNode(node);
    // Trigger focused layout via SpatialOrchestrator
    if (spatialOrchestratorRef.current) {
      spatialOrchestratorRef.current.focusOnNode(node.id);
    }
  };

  // Creation handlers moved to CreationModeOverlay
  // Search handlers moved to SearchModeOverlay

  // Drag and drop event handlers - logic extracted to features/drag-and-drop
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Track mouse position for drop positioning
    setDragMousePosition({ x: e.clientX, y: e.clientY });
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only clear drag state if leaving the container (not just moving between children)
    if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node)) {
      setDragMousePosition(null);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Check for files first
    const files = Array.from(e.dataTransfer.files);

    // Check for text/URL data if no files
    let urlData: string | null = null;
    if (files.length === 0) {
      // Try different data formats for URLs
      urlData = e.dataTransfer.getData('text/uri-list') ||
                e.dataTransfer.getData('text/plain') ||
                e.dataTransfer.getData('text/html') ||
                null;
    }

    // Must have either files or URL data
    if (files.length === 0 && !urlData) return;

    const mousePos = dragMousePosition || { x: e.clientX, y: e.clientY };
    const dropTarget = detectDropTarget(mousePos.x, mousePos.y, hitSphereRefs, dreamWorldRef);
    const isCommandDrop = e.metaKey || e.ctrlKey; // Command on Mac, Ctrl on Windows/Linux

    // Handle URL drops
    if (urlData && files.length === 0) {
      console.log('🔗 URL drop detected:', { urlData, isCommandDrop });

      if (dropTarget.type === 'node' && dropTarget.node) {
        // Dropping URL on an existing DreamNode
        await handleUrlDropOnNode(urlData, dropTarget.node);
      } else {
        // Dropping URL on empty space
        if (isCommandDrop) {
          // Command+Drop: Open ProtoNode3D with URL pre-filled
          await handleCommandUrlDrop(urlData);
        } else {
          // Normal Drop: Create node instantly at drop position
          await handleNormalUrlDrop(urlData, dropTarget.position, spatialOrchestratorRef);
        }
      }
      setDragMousePosition(null);
      return;
    }

    // Handle file drops
    if (dropTarget.type === 'node' && dropTarget.node) {
      // Dropping on an existing DreamNode - add files to node
      await handleDropOnNode(files, dropTarget.node);
    } else {
      // Dropping on empty space
      if (isCommandDrop) {
        // Command+Drop: Open ProtoNode3D with file pre-filled
        await handleCommandDrop(files);
      } else {
        // Normal Drop: Create node instantly at drop position
        await handleNormalDrop(files, dropTarget.position, spatialOrchestratorRef);
      }
    }

    setDragMousePosition(null);
  };

  const prevRenderCountRef = useRef(0);

  return (
    <div
      className="dreamspace-canvas-container"
      data-dreamspace-canvas
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Canvas
        camera={{
          position: [0, 0, 0],  // Static camera at origin
          fov: 75,
          near: 0.1,
          far: 20000  // Increased for better visibility of intersection point
        }}
        gl={{ antialias: true }}
        style={{
          width: '100%',
          height: '100%',
          background: '#000000'
        }}
        onPointerMissed={() => {
          // Clicked on empty space - handle based on current spatial layout
          const store = useInterBrainStore.getState();
          
          // Suppress empty space clicks during edit mode
          if (store.editMode.isActive) {
            console.log('Empty space clicked during edit mode - ignoring');
            return;
          }

          // Suppress empty space clicks during copilot mode to prevent accidental navigation
          if (store.copilotMode.isActive) {
            console.log('Empty space clicked during copilot mode - ignoring to prevent accidental constellation return');
            return;
          }

          // Suppress empty space clicks when option key is held (radial button mode)
          if (store.radialButtonUI.optionKeyPressed) {
            return;
          }

          if (store.spatialLayout === 'search') {
            if (store.searchInterface.isActive) {
              // Dismiss search interface and return to constellation
              console.log('Empty space clicked in search interface - dismissing search');
              store.setSearchActive(false);
              store.setSpatialLayout('constellation');
            } else {
              // Clear search results and return to constellation
              console.log('Empty space clicked in search results mode - clearing search');
              store.setSearchResults([]);
              store.setSpatialLayout('constellation');
            }
          } else if (store.spatialLayout === 'liminal-web') {
            // Deselect and return to constellation
            console.log('Empty space clicked in liminal web - deselecting node');
            store.setSelectedNode(null);
            store.setSpatialLayout('constellation');
          } else {
            // Already in constellation mode, just log
            console.log('Empty space clicked in constellation mode');
          }
        }}
      >
        {/* Camera reset handler - listens for store changes and resets camera */}
        <CameraResetHandler />
        
        {/* Debug intersection point - STATIONARY relative to camera (outside rotatable group) */}
        {debugIntersectionPoint && (
          <mesh position={[CAMERA_INTERSECTION_POINT.x, CAMERA_INTERSECTION_POINT.y, CAMERA_INTERSECTION_POINT.z]}>
            <sphereGeometry args={[60, 16, 16]} />
            <meshBasicMaterial color="#ff0000" />
          </mesh>
        )}

        {/* Radial button UI - STATIONARY relative to camera (outside rotatable group) */}
        {shouldMountRadialButtons && selectedNode && spatialLayout === 'liminal-web' && (
          <RadialButtonRing3D
            centerNodePosition={[0, 0, -50]}
            isActive={radialButtonUI.isActive}
            onExitComplete={() => {
              setShouldMountRadialButtons(false);
            }}
          />
        )}

        {/* Active video call button - visible during copilot mode (outside rotatable group) */}
        {copilotMode.isActive && copilotMode.conversationPartner && (
          <ActiveVideoCallButton />
        )}

        {/* Rotatable group containing all DreamNodes */}
        <group ref={dreamWorldRef}>
          {/* Debug wireframe sphere - toggleable via Obsidian commands */}
          {debugWireframeSphere && (
            <mesh>
              <sphereGeometry args={[5000, 32, 32]} />
              <meshBasicMaterial color="#00ff00" wireframe={true} transparent={true} opacity={0.3} />
            </mesh>
          )}
          
          {/* OPTIMIZATION: Dynamic scaling only needed in constellation view */}
          {(() => {
            const shouldEnableDynamicScaling = spatialLayout === 'constellation';

            // DIAGNOSTIC: Only log when node count changes significantly
            if (Math.abs(dreamNodes.length - prevRenderCountRef.current) > 2) {
              console.log(`[DreamNodeRendering] 🎨 Rendering ${dreamNodes.length} nodes`);
              prevRenderCountRef.current = dreamNodes.length;
            }

            const renderedNodes = dreamNodes.map((node) => (
              <React.Fragment key={node.id}>
                {/* Star component - purely visual, positioned slightly closer than anchor */}
                <Star3D
                  position={node.position}
                  size={5000}
                />
                
                {/* DreamNode component - handles all interactions and dynamic positioning */}
                <DreamNode3D
                  ref={getDreamNodeRef(node.id)}
                  dreamNode={node}
                  onHover={handleNodeHover}
                  onClick={handleNodeClick}
                  enableDynamicScaling={shouldEnableDynamicScaling}
                  onHitSphereRef={handleHitSphereRef}
                  vaultService={vaultService}
                  canvasParserService={canvasParserService}
                />
              </React.Fragment>
            ));

            return renderedNodes;
          })()}

          {/* Constellation edges - render DreamSong relationship threads */}
          {shouldShowConstellationEdges(spatialLayout) && (
            <ConstellationEdges
              dreamNodes={dreamNodes}
              dreamWorldRef={dreamWorldRef}
              showEdges={true}
              opacity={0.6}
            />
          )}
        </group>

        {/* SpatialOrchestrator - manages all spatial interactions and layouts */}
        <SpatialOrchestrator
          ref={spatialOrchestratorRef}
          dreamNodes={dreamNodes}
          dreamWorldRef={dreamWorldRef}
          onNodeFocused={(_nodeId) => {
            // Node focused by orchestrator
          }}
          onConstellationReturn={() => {
            console.log('DreamspaceCanvas: Returned to constellation by orchestrator');
          }}
          onOrchestratorReady={() => {
            // Register all existing refs when orchestrator is ready
            dreamNodeRefs.current.forEach((nodeRef, nodeId) => {
              if (nodeRef && spatialOrchestratorRef.current) {
                spatialOrchestratorRef.current.registerNodeRef(nodeId, nodeRef as React.RefObject<DreamNode3DRef>);
              }
            });
          }}
          transitionDuration={1000}
        />

        {/* Orchestrator Context - provides orchestrator access to feature overlays */}
        <OrchestratorContext.Provider value={spatialOrchestratorRef.current}>
          {/* Creation mode overlay - self-contained creation functionality */}
          <CreationModeOverlay />

          {/* Search mode overlay - self-contained search functionality */}
          <SearchModeOverlay />

          {/* Edit mode overlay - render when edit mode is active */}
          <EditModeOverlay />

          {/* Copilot mode overlay - render when copilot mode is active */}
          <CopilotModeOverlay />
        </OrchestratorContext.Provider>

        {/* Flying camera controls for debugging - toggleable */}
        {debugFlyingControls && (
          <FlyControls
            movementSpeed={1000}
            rollSpeed={Math.PI / 6}
            autoForward={false}
            dragToLook={true}
          />
        )}
        
        {/* Mouse drag controls for rotating the sphere - only when flying controls are off */}
        {!debugFlyingControls && <SphereRotationControls groupRef={dreamWorldRef} />}
        
        {/* Ambient lighting for any 3D elements (minimal) */}
        <ambientLight intensity={0.1} />
      </Canvas>
    </div>
  );
}

/**
 * Camera reset handler component that listens for store changes and resets the Three.js camera
 */
function CameraResetHandler() {
  const { camera } = useThree();
  const cameraPosition = useInterBrainStore(state => state.camera.position);
  const cameraTarget = useInterBrainStore(state => state.camera.target);

  useEffect(() => {
    // Reset camera position when store values change
    camera.position.set(cameraPosition[0], cameraPosition[1], cameraPosition[2]);
    camera.lookAt(cameraTarget[0], cameraTarget[1], cameraTarget[2]);
    camera.updateProjectionMatrix();
  }, [camera, cameraPosition, cameraTarget]);

  return null; // This component doesn't render anything
}

