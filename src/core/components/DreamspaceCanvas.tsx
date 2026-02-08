import React, { useState, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Group, Mesh } from 'three';
import { FlyControls } from '@react-three/drei';
import { DreamNode3D } from '../../features/dreamnode';
import type { DreamNode3DRef } from '../../features/dreamnode/components/DreamNode3D';
import { Star3D, SphereRotationControls, ConstellationEdges, shouldShowConstellationEdges } from '../../features/constellation-layout';
import { EPHEMERAL_SPAWN_RADIUS } from '../../features/constellation-layout/utils/EphemeralSpawning';
import { StarMesh } from '../../features/constellation-layout/components/StarMesh';

// Feature flag for WebGL-native star rendering
const USE_WEBGL_STARS = true;
import SpatialOrchestrator, { SpatialOrchestratorRef } from './SpatialOrchestrator';
import { DreamNodeCreator3D } from '../../features/dreamnode-creator';
import { SearchModeOverlay } from '../../features/search';
import { DreamNodeEditor3D, RelationshipEditor3D } from '../../features/dreamnode-editor';
import { RadialButtonRing3D } from '../../features/action-buttons/RadialButtonRing3D';
import { ActiveVideoCallButton } from '../../features/action-buttons/ActiveVideoCallButton';
import { DreamNode } from '../../features/dreamnode';
import { useInterBrainStore } from '../store/interbrain-store';
import { serviceManager } from '../services/service-manager';
import { VaultService } from '../services/vault-service';
import { CanvasParserService } from '../../features/dreamweaving/services/canvas-parser-service';
import { CAMERA_INTERSECTION_POINT } from '../../features/constellation-layout/utils/DynamicViewScaling';
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
import { getCherryPickWorkflowService } from '../../features/dreamnode-updater/services/cherry-pick-workflow-service';
// Tutorial system disabled for current version
// import { TutorialOverlay, TutorialRunner, TutorialPortalOverlay } from '../../features/tutorial';
import { TutorialPortalOverlay } from '../../features/tutorial';
import { EphemeralNodeManager } from './EphemeralNodeManager';
import {
  deriveHolarchyNavigationIntent,
  deriveFocusIntent,
  deriveConstellationIntent,
  deriveSearchIntent,
  deriveCopilotEnterIntent,
  buildLayoutContext,
  isHolarchyNavigation
} from '../orchestration/intent-helpers';
import { loadLayoutSnapshot } from '../orchestration/snapshot-storage';
import { UDDService } from '../../features/dreamnode/services/udd-service';

export default function DreamspaceCanvas() {
  // NOTE: Lifecycle gate is now handled by DreamspaceView with lazy loading
  // This component is only mounted AFTER lifecycleReady is true

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
  const constellationFilter = useInterBrainStore(state => state.constellationFilter);
  const ephemeralNodesMap = useInterBrainStore(state => state.ephemeralNodes);

  // No need to load initial nodes - they come from store.dreamNodes

  // SpatialOrchestrator reference for controlling all spatial interactions
  const spatialOrchestratorRef = useRef<SpatialOrchestratorRef>(null);

  // Track when orchestrator is ready so layout effects can re-run
  const [orchestratorReady, setOrchestratorReady] = useState(false);
  // Guard to ensure onOrchestratorReady logic runs exactly once
  const hasInitializedLayout = useRef(false);

  // Unified escape key handler - extracted to core hook
  useEscapeKeyHandler(spatialOrchestratorRef);

  // Drag and drop state - tracks mouse position for 3D drop positioning
  const [dragMousePosition, setDragMousePosition] = useState<{ x: number; y: number } | null>(null);

  // Get nodes from store - filter based on constellation filter and ephemeral nodes
  // CRITICAL: If filter is empty, show NOTHING to prevent 167-node crash
  const prevMountedCountRef = React.useRef(0);
  const dreamNodes: DreamNode[] = React.useMemo(() => {
    const allNodes = Array.from(dreamNodesMap.values());

    // If constellation filter is not initialized (empty mountedNodes), show NO nodes
    // This prevents WebGL crash from mounting all 167 nodes at once
    // The filter will be computed in the lifecycle READY phase, then nodes will appear
    if (constellationFilter.mountedNodes.size === 0) {
      prevMountedCountRef.current = 0;
      return [];
    }

    // Filter to only mounted nodes (constellation) + ephemeral nodes
    const result = allNodes
      .filter(data =>
        constellationFilter.mountedNodes.has(data.node.id) ||
        ephemeralNodesMap.has(data.node.id)
      )
      .map(data => data.node);

    prevMountedCountRef.current = result.length;

    return result;
  }, [dreamNodesMap, constellationFilter.mountedNodes, ephemeralNodesMap]);

  // Track which nodes are ephemeral for rendering differences
  // IMPORTANT: When filter is not initialized (mountedNodes empty), treat ALL nodes as constellation
  // (they have home positions). Ephemeral behavior only applies after filter is computed.
  const ephemeralNodeIds = React.useMemo(() => {
    // If filter not initialized, no nodes are ephemeral
    if (constellationFilter.mountedNodes.size === 0) {
      return new Set<string>();
    }
    return new Set(ephemeralNodesMap.keys());
  }, [ephemeralNodesMap, constellationFilter.mountedNodes.size]);
  
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
  const debugEphemeralRing = useInterBrainStore(state => state.debugEphemeralRing);
  
  // Layout state for controlling dynamic view scaling
  const spatialLayout = useInterBrainStore(state => state.spatialLayout);
  
  // Search results for search mode display
  const searchResults = useInterBrainStore(state => state.searchResults);
  const selectedNode = useInterBrainStore(state => state.selectedNode);

  // Tutorial state (tutorial system disabled for current version)
  // const tutorialIsActive = useInterBrainStore(state => state.tutorial.isActive);
  const showPortal = useInterBrainStore(state => state.tutorial.showPortal);
  // const endTutorial = useInterBrainStore(state => state.endTutorial);
  // const skipTutorial = useInterBrainStore(state => state.skipTutorial);
  // const markTutorialComplete = useInterBrainStore(state => state.markTutorialComplete);
  const hideTutorialPortal = useInterBrainStore(state => state.hideTutorialPortal);

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
      // Also register orchestrator with service manager for global access (e.g., tutorial commands)
      serviceManager.setSpatialOrchestratorRef(spatialOrchestratorRef.current);
      // Register hit sphere refs for tutorial hit detection
      serviceManager.setHitSphereRefs(hitSphereRefs);
    }
    // Cleanup on unmount
    return () => {
      serviceManager.setSpatialOrchestratorRef(null);
    };
  }, [dreamNodes.length, spatialOrchestratorRef.current]); // Re-register when nodes change OR orchestrator becomes ready
  
  // ════════════════════════════════════════════════════════════════════════════
  // ARCHITECTURAL NOTE: State Machine as Single Source of Truth
  // ════════════════════════════════════════════════════════════════════════════
  //
  // Layout transitions are driven by EXPLICIT ORCHESTRATION, not React's useEffect.
  //
  // The correct flow is:
  //   Event (click, escape, etc.)
  //     → Event handler calls deriveIntent() + executeLayoutIntent()
  //     → Store state (spatialLayout, selectedNode) updated as SIDE EFFECT
  //
  // We REMOVED the useEffect that watched spatialLayout because it created:
  //   1. Circular dependencies (event → store → effect → orchestration → store → effect...)
  //   2. Race conditions between event handlers and effects
  //   3. Ambiguous ownership of transitions
  //
  // All layout orchestration now happens in:
  //   - handleNodeClick (constellation → liminal-web, liminal-web → liminal-web)
  //   - onPointerMissed (liminal-web → constellation)
  //   - useEscapeKeyHandler (any → constellation)
  //   - useOptionKeyHandlers (copilot ring show/hide)
  //   - navigationRequest useEffect (feature → core communication)
  //
  // See docs/architecture/layout-state-machine.md for the complete specification.
  // ════════════════════════════════════════════════════════════════════════════

  // React to navigation requests from features
  // This is the universal pattern for feature → core communication
  const navigationRequest = useInterBrainStore(state => state.navigationRequest);
  const clearNavigationRequest = useInterBrainStore(state => state.clearNavigationRequest);

  useEffect(() => {
    if (!navigationRequest || !spatialOrchestratorRef.current) return;

    const orchestrator = spatialOrchestratorRef.current;
    const store = useInterBrainStore.getState();

    switch (navigationRequest.type) {
      case 'focus':
        if (navigationRequest.nodeId) {
          console.log(`[Canvas-NavRequest] FOCUS: ${navigationRequest.nodeId} via unified orchestration`);
          const relatedIds = orchestrator.getRelatedNodeIds(navigationRequest.nodeId);
          const context = buildLayoutContext(
            store.selectedNode?.id || null,
            store.flipState.flipStates,
            store.spatialLayout
          );
          const { intent } = deriveFocusIntent(navigationRequest.nodeId, relatedIds, context);
          orchestrator.executeLayoutIntent(intent);
        }
        break;

      case 'constellation': {
        console.log('[Canvas-NavRequest] CONSTELLATION via unified orchestration');
        const { intent: constellationIntent } = deriveConstellationIntent();
        orchestrator.executeLayoutIntent(constellationIntent);
        break;
      }

      case 'applyLayout':
        orchestrator.applyConstellationLayout();
        break;
    }

    // Clear the request after processing
    clearNavigationRequest();
  }, [navigationRequest, clearNavigationRequest]);

  // Note: Custom DOM events for edit mode have been replaced with OrchestratorContext
  // DreamNodeEditor3D now calls orchestrator methods directly via useOrchestrator() hook
  
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

    // Block node selection during collaboration preview mode
    if (getCherryPickWorkflowService()?.isPreviewActive()) {
      console.log('[DreamSpace] Node selection blocked - collaboration preview active');
      return;
    }

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

    // Handle relationship edit mode toggling
    // Only toggle relationships in 'relationship-edit' mode, not regular 'edit' mode
    if (store.spatialLayout === 'relationship-edit' && store.editMode.isActive && store.editMode.editingNode) {
      // IMPORTANT: Prevent clicking the center editing node itself
      if (store.editMode.editingNode.id === node.id) {
        console.log(`Relationship edit: Cannot toggle relationship with self (center node: ${node.name})`);
        return;
      }

      // In relationship-edit mode, clicking a node toggles its relationship status
      store.togglePendingRelationship(node.id);
      console.log(`Relationship edit: Toggled relationship with "${node.name}"`);

      // Trigger immediate reordering for priority-based positioning
      if (spatialOrchestratorRef.current) {
        spatialOrchestratorRef.current.reorderEditModeSearchResults();
      }

      return; // Don't do normal click handling in relationship-edit mode
    }

    // Suppress click in regular edit mode (metadata editing)
    if (store.spatialLayout === 'edit' && store.editMode.isActive) {
      console.log(`Edit mode: Ignoring click on ${node.name} (metadata editing doesn't affect other nodes)`);
      return;
    }
    
    // Normal click handling (not in edit mode)
    
    // If we're in search mode, properly exit search interface when clicking a result
    if (store.spatialLayout === 'search' && store.searchInterface.isActive) {
      console.log('Clicking search result - exiting search mode cleanly');
      store.setSearchActive(false); // This clears search query and results
    }

    // Build context for intent derivation
    const context = buildLayoutContext(
      store.selectedNode?.id || null,
      store.flipState.flipStates,
      store.spatialLayout
    );

    // Check if this is holarchy navigation (clicking in holarchy mode)
    const isHolarchyNav = isHolarchyNavigation(context, node.id);

    store.setSelectedNode(node);

    if (isHolarchyNav && spatialOrchestratorRef.current) {
      // === HOLARCHY NAVIGATION ===
      // Clicking a supermodule while in holarchy mode
      // Use the new unified orchestration system
      console.log('[DreamSpace] Holarchy navigation: using unified orchestration');

      // Load supermodules from UDD file (async)
      const orchestrator = spatialOrchestratorRef.current;
      (async () => {
        try {
          // Read supermodules from node's UDD file
          let supermoduleIds: string[] = [];
          if (vaultService) {
            const fullPath = vaultService.getFullPath(node.repoPath);
            const udd = await UDDService.readUDD(fullPath);
            // Normalize supermodules (can be string[] or SupermoduleEntry[])
            supermoduleIds = (udd.supermodules || []).map((s: string | { radicleId?: string; uuid?: string }) =>
              typeof s === 'string' ? s : (s.radicleId || s.uuid || '')
            ).filter(Boolean);
          }

          // Derive the holarchy intent
          const { intent } = deriveHolarchyNavigationIntent(
            node.id,
            supermoduleIds,
            context
          );

          // Execute the layout intent (handles position + flip together)
          orchestrator.executeLayoutIntent(intent);
        } catch (error) {
          console.error('[DreamSpace] Failed to load supermodules:', error);
          // Fallback: just navigate without supermodules
          const { intent } = deriveHolarchyNavigationIntent(node.id, [], context);
          orchestrator.executeLayoutIntent(intent);
        }
      })();

    } else if (spatialOrchestratorRef.current) {
      // === LIMINAL WEB NAVIGATION ===
      // Normal click: focus on node with related nodes in ring
      // Use the unified orchestration system
      console.log(`[DreamSpace] Liminal web navigation: ${node.name} via unified orchestration`);
      const orchestrator = spatialOrchestratorRef.current;
      const relatedIds = orchestrator.getRelatedNodeIds(node.id);
      const { intent } = deriveFocusIntent(node.id, relatedIds, context);
      orchestrator.executeLayoutIntent(intent);
    }
  };

  // Creation handlers moved to DreamNodeCreator3D
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

          // Suppress empty space clicks during collaboration preview mode
          if (getCherryPickWorkflowService()?.isPreviewActive()) {
            return;
          }

          // Suppress empty space clicks during edit mode
          if (store.editMode.isActive) {
            return;
          }

          // Suppress empty space clicks during copilot mode to prevent accidental navigation
          if (store.copilotMode.isActive) {
            return;
          }

          // Suppress empty space clicks when option key is held (radial button mode)
          if (store.radialButtonUI.optionKeyPressed) {
            return;
          }

          if (store.spatialLayout === 'search') {
            // Dismiss search and return to constellation
            // Set spatialLayout BEFORE executeLayoutIntent so nodes animate to scaled positions
            store.setSearchActive(false);
            store.setSearchResults([]);
            store.setSpatialLayout('constellation');
            if (spatialOrchestratorRef.current) {
              console.log('[DreamSpace] Search dismiss: returning to constellation via unified orchestration');
              const { intent } = deriveConstellationIntent();
              spatialOrchestratorRef.current.executeLayoutIntent(intent);
            }
          } else if (store.spatialLayout === 'liminal-web') {
            // Deselect and return to constellation
            // Record this transition in history so Cmd+Z can return to the previous liminal-web state
            store.addHistoryEntry(null, 'constellation');
            store.setSelectedNode(null);
            // Use unified orchestration system to animate back to constellation
            if (spatialOrchestratorRef.current) {
              console.log('[DreamSpace] Liminal-web dismiss: returning to constellation via unified orchestration');
              const { intent } = deriveConstellationIntent();
              spatialOrchestratorRef.current.executeLayoutIntent(intent);
            } else {
              store.setSpatialLayout('constellation');
            }
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

        {/* Debug ephemeral spawn/exit ring - shows where ephemeral nodes spawn from/exit to
            This ring is in CAMERA SPACE (not world space), so it stays fixed at z=0
            The ring should be perpendicular to the camera view axis */}
        {debugEphemeralRing && (
          <mesh rotation={[0, 0, 0]} position={[0, 0, 0]}>
            <ringGeometry args={[EPHEMERAL_SPAWN_RADIUS - 50, EPHEMERAL_SPAWN_RADIUS + 50, 64]} />
            <meshBasicMaterial color="#ff00ff" transparent={true} opacity={0.5} side={2} />
          </mesh>
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

            // Track render count (without logging)
            prevRenderCountRef.current = dreamNodes.length;

            const renderedNodes = dreamNodes.map((node) => {
              const isEphemeral = ephemeralNodeIds.has(node.id);
              const ephemeralState = isEphemeral ? ephemeralNodesMap.get(node.id) : undefined;

              return (
                <React.Fragment key={node.id}>
                  {/* Star component - only for constellation nodes (not ephemeral) */}
                  {!isEphemeral && (
                    USE_WEBGL_STARS ? (
                      <StarMesh position={node.position} size={5000} />
                    ) : (
                      <Star3D position={node.position} size={5000} />
                    )
                  )}

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
                    ephemeral={isEphemeral}
                    ephemeralState={ephemeralState}
                  />
                </React.Fragment>
              );
            });

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
            // Constellation return complete
          }}
          onOrchestratorReady={() => {
            // Guard: this must only run once. The callback is an inline arrow
            // so its identity changes every render, but the useEffect in
            // SpatialOrchestrator uses [] deps to only fire on mount.
            // This ref guard is belt-and-suspenders safety.
            if (hasInitializedLayout.current) return;
            hasInitializedLayout.current = true;

            // Register all existing refs when orchestrator is ready
            dreamNodeRefs.current.forEach((nodeRef, nodeId) => {
              if (nodeRef && spatialOrchestratorRef.current) {
                spatialOrchestratorRef.current.registerNodeRef(nodeId, nodeRef as React.RefObject<DreamNode3DRef>);
              }
            });

            // Compute and apply initial layout (instant mount, no animation)
            // Instead of restoring stale cached positions, we derive fresh positions
            // from the intent seed (centerId). This ensures the layout is always
            // consistent with the current relationship graph.
            (async () => {
              const orchestrator = spatialOrchestratorRef.current;
              if (!orchestrator) return;

              const store = useInterBrainStore.getState();

              // Determine which node to center on startup:
              // 1. Check saved snapshot for last-selected centerId
              // 2. Fall back to InterBrain UUID as the default home view
              const INTERBRAIN_UUID = '550e8400-e29b-41d4-a716-446655440000';
              let centerId: string | null = null;

              const snapshot = await loadLayoutSnapshot();
              if (snapshot?.centerId && store.dreamNodes.has(snapshot.centerId)) {
                centerId = snapshot.centerId;
                console.log(`[DreamSpace] Restoring last-selected node: ${centerId}`);
              } else if (store.dreamNodes.has(INTERBRAIN_UUID)) {
                centerId = INTERBRAIN_UUID;
                console.log(`[DreamSpace] No saved state, defaulting to InterBrain node`);
              }

              if (centerId) {
                // Derive fresh layout intent from current relationship graph
                const relatedIds = orchestrator.getRelatedNodeIds(centerId);
                const context = buildLayoutContext(null, store.flipState.flipStates, 'constellation');
                const { intent } = deriveFocusIntent(centerId, relatedIds, context);

                // Execute with duration=0 for instant mount (no animation)
                orchestrator.executeLayoutIntent(intent, 0);

                console.log(`[DreamSpace] Computed initial layout: center=${centerId}, ring=${relatedIds.length} nodes`);
              } else {
                console.log('[DreamSpace] No center node available, starting in constellation mode');
              }
            })();

            // Mark orchestrator as ready so layout effects can re-run
            setOrchestratorReady(true);
          }}
          transitionDuration={1000}
        />

        {/* Orchestrator Context - provides orchestrator access to feature overlays */}
        <OrchestratorContext.Provider value={spatialOrchestratorRef.current}>
          {/* DreamNode creator - self-contained creation UI */}
          <DreamNodeCreator3D />

          {/* Search mode overlay - self-contained search functionality */}
          <SearchModeOverlay />

          {/* DreamNode editor - render when in 'edit' layout (metadata editing) */}
          <DreamNodeEditor3D />

          {/* Relationship editor - render when in 'relationship-edit' layout */}
          <RelationshipEditor3D />

          {/* Tutorial system disabled for current version
          <TutorialOverlay />
          <TutorialRunner
            isActive={tutorialIsActive}
            onComplete={() => {
              markTutorialComplete();
              endTutorial();
            }}
            onSkip={() => {
              skipTutorial();
            }}
          />
          */}

          {/* Ephemeral node manager - handles dynamic node spawning/despawning lifecycle */}
          <EphemeralNodeManager />
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

      {/* Tutorial Portal Overlay - full-screen entry experience */}
      <TutorialPortalOverlay
        isVisible={showPortal}
        onEnter={() => {
          hideTutorialPortal();
        }}
      />
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

