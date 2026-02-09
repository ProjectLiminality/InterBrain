import React, { useState, useRef, useMemo, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Html, Billboard } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Vector3, Group, Mesh, Quaternion } from 'three';
import { DreamNode } from '../types/dreamnode';
import { calculateDynamicScaling, DEFAULT_SCALING_CONFIG } from '../../constellation-layout/utils/DynamicViewScaling';
import { calculateExitPosition, DEFAULT_EPHEMERAL_SPAWN_CONFIG } from '../../constellation-layout/utils/EphemeralSpawning';
import type { NodeTargetState } from '../../../core/orchestration/types';
import { useInterBrainStore, EphemeralNodeState } from '../../../core/store/interbrain-store';
import { queueEphemeralDespawn } from '../../../core/services/ephemeral-despawn-queue';
import { dreamNodeStyles, getDistanceScaledGlowIntensity, getDistanceScaledHoverScale } from '../styles/dreamNodeStyles';
import { CanvasParserService } from '../../dreamweaving/services/canvas-parser-service';
import { VaultService } from '../../../core/services/vault-service';
import { DreamTalkSide } from './DreamTalkSide';
import { DreamSongSide } from './DreamSongSide';
import { DreamTalkSprite } from './DreamTalkSprite';
import '../styles/dreamNodeAnimations.css';

// Feature flags for WebGL-native DreamTalk rendering
// USE_WEBGL_DREAMTALK: Enable WebGL rendering (vs DOM-based Html+DreamTalkSide)
// USE_SPRITE_RENDERING: Use new sprite-based approach with circular-clip shader
const USE_WEBGL_DREAMTALK = true;
const USE_SPRITE_RENDERING = true;

// Universal Movement API interface
export interface DreamNode3DRef {
  // === UNIFIED API ===
  /**
   * Set the target state for this node to animate toward.
   * Unifies position + flip animation into a single command.
   *
   * - mode: 'active' → animate to position, animate flip to flipSide
   * - mode: 'home' → persistent nodes return to constellation, ephemeral nodes exit + despawn
   *
   * @param target - The target state (active with position/flip, or home)
   * @param duration - Animation duration in ms (default: 1000, use 0 for instant)
   * @param worldRotation - Current world rotation for ephemeral exit calculation
   * @param easing - Optional easing override for active mode (default: easeOutQuart)
   */
  setTargetState: (target: NodeTargetState, duration?: number, worldRotation?: Quaternion, easing?: 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart') => void;

  /** Get the current visual position of this node */
  getCurrentPosition: () => [number, number, number];

  /** Check if this node is currently animating */
  isMoving: () => boolean;

  /** Get the current position mode (ground truth for whether this node is active or at home) */
  getPositionMode: () => 'constellation' | 'active';
}

interface DreamNode3DProps {
  dreamNode: DreamNode;
  onHover?: (node: DreamNode, isHovered: boolean) => void;
  onClick?: (node: DreamNode) => void;
  onDoubleClick?: (node: DreamNode) => void;
  enableDynamicScaling?: boolean;
  onHitSphereRef?: (nodeId: string, meshRef: React.RefObject<Mesh | null>) => void;
  vaultService?: VaultService;
  canvasParserService?: CanvasParserService;
  /** Whether this node is ephemeral (spawned on-demand, not part of constellation) */
  ephemeral?: boolean;
  /** Ephemeral node state with spawn/target positions */
  ephemeralState?: EphemeralNodeState;
}

/**
 * Clean 3D DreamNode component with Billboard → RotatableGroup → [DreamTalk, DreamSong] hierarchy
 */
/**
 * Compute the actual world position of a constellation-mode node,
 * accounting for radial offset along the inward direction.
 * Guards against zero-length positions (nodes at origin) that would produce NaN.
 */
function getConstellationPosition(anchorPos: [number, number, number], radialOffset: number): [number, number, number] {
  if (radialOffset === 0) return [...anchorPos];
  const dirLength = Math.sqrt(anchorPos[0]**2 + anchorPos[1]**2 + anchorPos[2]**2);
  if (dirLength === 0) return [...anchorPos]; // Node at origin — no direction to offset
  const nx = -anchorPos[0] / dirLength;
  const ny = -anchorPos[1] / dirLength;
  const nz = -anchorPos[2] / dirLength;
  return [
    anchorPos[0] - nx * radialOffset,
    anchorPos[1] - ny * radialOffset,
    anchorPos[2] - nz * radialOffset
  ];
}

const DreamNode3D = forwardRef<DreamNode3DRef, DreamNode3DProps>(({
  dreamNode,
  onHover,
  onClick,
  onDoubleClick,
  enableDynamicScaling = false,
  onHitSphereRef,
  vaultService: _vaultService,
  canvasParserService: _canvasParserService,
  ephemeral = false,
  ephemeralState
}, ref) => {
  const [isHovered, setIsHovered] = useState(false);
  const [radialOffset, setRadialOffset] = useState(0);
  const groupRef = useRef<Group>(null);
  const hitSphereRef = useRef<Mesh>(null);
  const hoverGroupRef = useRef<Group>(null); // Ref for animated hover group

  // Flip animation state
  const [flipRotation, setFlipRotation] = useState(0);
  // DreamSong state now managed by DreamSongSide component via hook

  // Back-side lazy loading optimization - only mount DreamSongSide when needed
  const [hasLoadedBackSide, setHasLoadedBackSide] = useState(false);

  // Media is now loaded directly from dreamNode.dreamTalkMedia[].absolutePath
  // via useContentTexture hook - no MediaLoadingService needed

  // Dual-mode position state
  const [positionMode, setPositionMode] = useState<'constellation' | 'active'>('constellation');
  const [targetPosition, setTargetPosition] = useState<[number, number, number]>(dreamNode.position);
  const [currentPosition, setCurrentPosition] = useState<[number, number, number]>(dreamNode.position);
  const [startPosition, setStartPosition] = useState<[number, number, number]>(dreamNode.position);
  // Ref mirror of currentPosition — updated every frame in useFrame, read by setTargetState
  // and getCurrentPosition to avoid stale React state when interrupting mid-animation.
  //
  // Part of option key race condition mitigation (partial fix).
  // React state (currentPosition) lags by 1-2 frames during animation because setState
  // is batched. When showRingNodes interrupts hideRingNodes mid-flight, reading from
  // React state could return a stale position, causing startPosition ≈ targetPosition
  // and zero apparent movement (node appears stuck).
  //
  // This ref is the other half of the fix — see useOptionKeyHandlers.ts for the full
  // race condition analysis and notes on what a complete fix would require.
  const currentPositionRef = useRef<[number, number, number]>(dreamNode.position);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionStartTime, setTransitionStartTime] = useState(0);
  const [transitionDuration, setTransitionDuration] = useState(1000);
  const [transitionType, setTransitionType] = useState<'liminal' | 'constellation' | 'scaled' | 'ephemeral-exit'>('liminal');
  const [transitionEasing, setTransitionEasing] = useState<'easeOutCubic' | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart'>('easeOutCubic');
  const [targetRadialOffset, setTargetRadialOffset] = useState(0); // For 'scaled' transitions: the radialOffset to apply on completion
  
  // Add flip rotation to transition system for unified animations
  const [targetFlipRotation, setTargetFlipRotation] = useState(0);
  const [startFlipRotation, setStartFlipRotation] = useState(0);
  const [shouldAnimateFlip, setShouldAnimateFlip] = useState(false);
  const [flipAnimationStartTime, setFlipAnimationStartTime] = useState(0);
  const [flipAnimationDuration, setFlipAnimationDuration] = useState(1000); // Same duration as position movement
  
  // No longer need to track flip state - we access live store state directly
  
  // Check global drag state
  const isDragging = useInterBrainStore(state => state.isDragging);

  // Tutorial highlight state - allows programmatic hover effect
  const isTutorialHighlighted = useInterBrainStore(state =>
    state.tutorial.highlightedNodeId === dreamNode.id
  );

  // Flip state management
  const flipState = useInterBrainStore(state => state.flipState);
  const setFlippedNode = useInterBrainStore(state => state.setFlippedNode);
  const completeFlipAnimation = useInterBrainStore(state => state.completeFlipAnimation);
  const spatialLayout = useInterBrainStore(state => state.spatialLayout);
  const selectedNode = useInterBrainStore(state => state.selectedNode);
  
  // Subscribe to edit mode state
  const isEditModeActive = useInterBrainStore(state => state.editMode.isActive);
  const isPendingRelationship: boolean = useInterBrainStore(state => {
    const nodeId = dreamNode.id;

    // Relationship-edit mode only: show glow for pending relationships
    // Regular 'edit' mode is for metadata only - no relationship interaction
    if (state.spatialLayout === 'relationship-edit' &&
        state.editMode?.pendingRelationships?.includes(nodeId)) {
      return true;
    }

    // Copilot mode shared/related nodes
    if (state.spatialLayout === 'copilot' && state.copilotMode?.isActive) {
      const partner = state.copilotMode.conversationPartner;
      const isShared = state.copilotMode.sharedNodeIds?.includes(nodeId) ?? false;
      const isRelated = partner?.liminalWebConnections?.includes(nodeId) ?? false;
      return isShared || isRelated;
    }

    return false;
  });
  
  // Get current flip state for this node
  const nodeFlipState = flipState.flipStates.get(dreamNode.id);
  const isFlipping = nodeFlipState?.isFlipping || false;
  
  // Ensure initial state shows front side
  useEffect(() => {
    if (!nodeFlipState) {
      setFlipRotation(0);
    }
  }, [nodeFlipState]);
  
  // No longer need tracking - using live store state in imperative handles
  
  // Determine if flip button should be visible
  // Dreamers cannot flip - they don't participate in holarchy (no sub/supermodules)
  const shouldShowFlipButton = useMemo(() => {
    const result = spatialLayout === 'liminal-web' &&
                   selectedNode?.id === dreamNode.id &&
                   isHovered &&
                   !isDragging &&
                   dreamNode.type !== 'dreamer'; // Dreamers cannot flip

    return result;
  }, [spatialLayout, selectedNode, dreamNode.id, isHovered, isDragging, dreamNode.type]);

  // Determine if DreamTalk fullscreen button should be visible (stable version)
  const shouldShowDreamTalkFullscreen = useMemo(() => {
    const result = spatialLayout === 'liminal-web' &&
                   selectedNode?.id === dreamNode.id &&
                   isHovered &&
                   dreamNode.dreamTalkMedia &&
                   dreamNode.dreamTalkMedia[0] &&
                   !isDragging;

    return result;
  }, [spatialLayout, selectedNode, dreamNode.id, isHovered, dreamNode.dreamTalkMedia, isDragging]);

  // Determine if DreamSong fullscreen button should be visible (stable version)
  const shouldShowDreamSongFullscreen = useMemo(() => {
    const result = spatialLayout === 'liminal-web' &&
                   selectedNode?.id === dreamNode.id &&
                   isHovered &&
                   !isDragging;

    return result;
  }, [spatialLayout, selectedNode, dreamNode.id, isHovered, isDragging]);

  // Determine when to load back-side component (after animation completes)
  const shouldLoadBackSide = useMemo(() => {
    return spatialLayout === 'liminal-web' &&
           selectedNode?.id === dreamNode.id &&
           !isTransitioning; // Wait for animation to complete
  }, [spatialLayout, selectedNode?.id, dreamNode.id, isTransitioning]);

  // Register hit sphere reference
  useEffect(() => {
    if (onHitSphereRef && hitSphereRef) {
      onHitSphereRef(dreamNode.id, hitSphereRef);
    }
  }, [dreamNode.id, onHitSphereRef]);

  // Trigger back-side loading when animation completes
  // Also reset when node is no longer selected (prevents heavy DreamSong rendering for ring nodes)
  useEffect(() => {
    if (shouldLoadBackSide && !hasLoadedBackSide) {
      // Small delay to ensure animation is fully complete and avoid any frame drops
      globalThis.setTimeout(() => {
        setHasLoadedBackSide(true);
      }, 100);
    } else if (!shouldLoadBackSide && hasLoadedBackSide) {
      // Reset when no longer selected - unmounts DreamSongSide for performance
      setHasLoadedBackSide(false);
    }
  }, [shouldLoadBackSide, hasLoadedBackSide, dreamNode.name, spatialLayout, selectedNode?.id, isTransitioning]);
  
  // DreamSong logic now handled by DreamSongSide component via hook

  // Ephemeral spawn animation - triggers when ephemeral node first mounts or re-spawns.
  // Uses ephemeralState.mountedAt as a stable identity for detecting re-spawns:
  // when clearEphemeralNodes + spawnEphemeralNode happens synchronously, React reconciles
  // (same key={node.id}), so the component isn't unmounted — but mountedAt changes,
  // allowing the spawn animation to re-trigger.
  const hasTriggeredSpawnRef = useRef(false);
  const lastSpawnTimestampRef = useRef<number>(0);
  useEffect(() => {
    // Reset the guard if ephemeralState changed (re-spawn with new mountedAt)
    if (ephemeralState && ephemeralState.mountedAt !== lastSpawnTimestampRef.current) {
      hasTriggeredSpawnRef.current = false;
      lastSpawnTimestampRef.current = ephemeralState.mountedAt;
    }
  }, [ephemeralState]);
  useEffect(() => {
    if (ephemeral && ephemeralState && !hasTriggeredSpawnRef.current) {
      hasTriggeredSpawnRef.current = true;


      // Start from spawn position
      currentPositionRef.current = ephemeralState.spawnPosition;
      setCurrentPosition(ephemeralState.spawnPosition);
      setStartPosition(ephemeralState.spawnPosition);

      // Immediately trigger animation to target position
      setTargetPosition(ephemeralState.targetPosition);
      setTransitionDuration(DEFAULT_EPHEMERAL_SPAWN_CONFIG.spawnAnimationDuration);
      setTransitionStartTime(globalThis.performance.now());
      setPositionMode('active');
      setIsTransitioning(true);
      setTransitionType('liminal'); // Use liminal type to stay in active mode
      setTransitionEasing(DEFAULT_EPHEMERAL_SPAWN_CONFIG.spawnEasing as 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart');
    }
  }, [ephemeral, ephemeralState, dreamNode.id]);

  // Reset flip state when node is no longer selected
  useEffect(() => {
    if (spatialLayout !== 'liminal-web' || selectedNode?.id !== dreamNode.id) {
      if (flipState.flippedNodeId === dreamNode.id) {
        setFlippedNode(null);
        // Note: Flip rotation now animates smoothly via Universal Movement API
        // setFlipRotation(0); // Removed - handled by flip-back animation
        // Note: Keep dreamSongData in memory for performance - cache handles invalidation
      }
    }
  }, [spatialLayout, selectedNode, dreamNode.id, flipState.flippedNodeId, setFlippedNode]);

  // Handle mouse events
  const handleMouseEnter = () => {
    if (isDragging) return;
    // Suppress hover for center node in relationship-edit mode (search bar covers it)
    if (spatialLayout === 'relationship-edit' && selectedNode?.id === dreamNode.id) {
      return;
    }
    setIsHovered(true);
    onHover?.(dreamNode, true);
  };

  const handleMouseLeave = () => {
    if (isDragging) return;
    setIsHovered(false);
    onHover?.(dreamNode, false);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) return;
    e.stopPropagation();
    onClick?.(dreamNode);
  };
  
  const handleFlipClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDragging || isFlipping) return;

    try {
      const { serviceManager } = await import('../../../core/services/service-manager');
      serviceManager.executeCommand('flip-selected-dreamnode');
    } catch (error) {
      console.error('Failed to execute flip command:', error);
    }
  }, [isDragging, isFlipping, dreamNode.id, dreamNode.name]);

  const handleDreamTalkFullScreen = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDragging) return;

    try {
      const { serviceManager } = await import('../../../core/services/service-manager');
      serviceManager.executeCommand('open-dreamtalk-fullscreen');
    } catch (error) {
      console.error('Failed to execute DreamTalk full-screen command:', error);
    }
  }, [isDragging, dreamNode.id, dreamNode.name]);

  const handleDreamSongFullScreen = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDragging) return;
    
    try {
      const { serviceManager } = await import('../../../core/services/service-manager');
      serviceManager.executeCommand('open-dreamsong-fullscreen');
    } catch (error) {
      console.error('Failed to execute DreamSong full-screen command:', error);
    }
  }, [isDragging, dreamNode.id, dreamNode.name]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isDragging) return;
    e.stopPropagation();
    onDoubleClick?.(dreamNode);
  };

  // Helper to start flip-back animation alongside movement
  const startFlipBackAnimation = () => {
    // Get LIVE store state (not stale component state)
    const liveStoreState = useInterBrainStore.getState();
    const currentFlipRotation = flipRotation;
    const storeFlippedNodeId = liveStoreState.flipState.flippedNodeId;
    const wasFlipped = storeFlippedNodeId === dreamNode.id;
    
    // Check if this node was recently flipped (check live store state)
    if (currentFlipRotation !== 0 || wasFlipped) {
      // Use current rotation if available, otherwise assume it was Math.PI (fully flipped)
      const startRotation = currentFlipRotation !== 0 ? currentFlipRotation : Math.PI;
      setStartFlipRotation(startRotation);
      setTargetFlipRotation(0);
      setShouldAnimateFlip(true);
      setFlipAnimationStartTime(globalThis.performance.now());
      setFlipAnimationDuration(1000); // 1000ms - same duration as position movement
    }
  };

  // Helper to start flip animation to a specific side
  const startFlipToSide = (targetSide: 'front' | 'back', animDuration: number) => {
    const currentFlipRotationVal = flipRotation;
    const targetRotation = targetSide === 'back' ? Math.PI : 0;

    // Only animate if we need to change
    if (Math.abs(currentFlipRotationVal - targetRotation) > 0.01) {
      setStartFlipRotation(currentFlipRotationVal);
      setTargetFlipRotation(targetRotation);
      setShouldAnimateFlip(true);
      setFlipAnimationStartTime(globalThis.performance.now());
      setFlipAnimationDuration(animDuration);
    }
  };

  // Universal Movement API implementation (keeping all the complex logic)
  useImperativeHandle(ref, () => ({
    // === NEW UNIFIED API ===
    setTargetState: (target: NodeTargetState, duration = 1000, worldRotation?, easing?) => {
      console.log(`[DreamNode3D:${dreamNode.name}] setTargetState called:`, {
        mode: target.mode,
        position: target.mode === 'active' ? target.position : 'N/A',
        flipSide: target.mode === 'active' ? target.flipSide : 'N/A',
        currentPositionMode: positionMode,
        duration
      });

      // Read from ref (updated every frame in useFrame) to avoid stale React state
      // when interrupting mid-animation. This is critical for option key toggle
      // where hideRingNodes → showRingNodes can fire in quick succession.
      const actualCurrentPosition: [number, number, number] = positionMode === 'constellation'
        ? getConstellationPosition(dreamNode.position, radialOffset)
        : [...currentPositionRef.current];

      console.log(`[DreamNode3D:${dreamNode.name}] Starting from position:`, actualCurrentPosition);

      if (target.mode === 'active') {
        // Active mode: animate to position + flip to target side
        // Position animation
        setStartPosition(actualCurrentPosition);
        currentPositionRef.current = actualCurrentPosition;
        setCurrentPosition(actualCurrentPosition);
        setTargetPosition(target.position);
        setTransitionDuration(duration);
        setTransitionStartTime(globalThis.performance.now());
        setPositionMode('active');
        setIsTransitioning(true);
        setTransitionType('liminal');
        setTransitionEasing(easing || 'easeOutQuart');

        console.log(`[DreamNode3D:${dreamNode.name}] Set to ACTIVE mode, transitioning to:`, target.position);

        // Flip animation (unified with position)
        startFlipToSide(target.flipSide, duration);

      } else {
        // Home mode: ephemeral nodes exit, persistent nodes return to constellation
        if (ephemeral) {
          // Ephemeral: animate to exit ring, then despawn
          let cameraSpacePosition = [...actualCurrentPosition] as [number, number, number];
          if (worldRotation) {
            const posVec = new Vector3(...actualCurrentPosition);
            posVec.applyQuaternion(worldRotation);
            cameraSpacePosition = [posVec.x, posVec.y, posVec.z];
          }

          const selectedNodeId = useInterBrainStore.getState().selectedNode?.id;
          const isCenterNode = dreamNode.id === selectedNodeId;

          const exitPosition = calculateExitPosition(
            cameraSpacePosition,
            DEFAULT_EPHEMERAL_SPAWN_CONFIG.exitRadiusFactor,
            isCenterNode
          );

          let worldExitPosition = [...exitPosition] as [number, number, number];
          if (worldRotation) {
            const exitVec = new Vector3(...exitPosition);
            const inverseRotation = worldRotation.clone().invert();
            exitVec.applyQuaternion(inverseRotation);
            worldExitPosition = [exitVec.x, exitVec.y, exitVec.z];
          }

          setStartPosition(actualCurrentPosition);
          currentPositionRef.current = actualCurrentPosition;
          setCurrentPosition(actualCurrentPosition);
          setTargetPosition(worldExitPosition);
          setTransitionDuration(DEFAULT_EPHEMERAL_SPAWN_CONFIG.exitAnimationDuration);
          setTransitionStartTime(globalThis.performance.now());
          setPositionMode('active');
          setIsTransitioning(true);
          setTransitionType('ephemeral-exit');
          setTransitionEasing(DEFAULT_EPHEMERAL_SPAWN_CONFIG.exitEasing as 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart');

          // Flip back to front during exit
          startFlipToSide('front', DEFAULT_EPHEMERAL_SPAWN_CONFIG.exitAnimationDuration);

        } else {
          // Persistent: return to constellation position
          // Check fresh store state to decide: scaled position (constellation mode)
          // or raw anchor (liminal-web mode where dynamic scaling is off)
          const currentLayout = useInterBrainStore.getState().spatialLayout;
          const goingToConstellation = currentLayout === 'constellation';

          const anchorPos = dreamNode.position;

          if (goingToConstellation) {
            // Returning to constellation: animate to dynamically-scaled position
            // so node arrives where dynamic scaling will place it
            const worldAnchorPosition = new Vector3(anchorPos[0], anchorPos[1], anchorPos[2]);
            if (worldRotation) {
              worldAnchorPosition.applyQuaternion(worldRotation);
            }

            const { radialOffset: computedRadialOffset } = calculateDynamicScaling(
              worldAnchorPosition,
              DEFAULT_SCALING_CONFIG
            );

            const scaledPosition = getConstellationPosition(anchorPos, computedRadialOffset);

            setStartPosition(actualCurrentPosition);
            currentPositionRef.current = actualCurrentPosition;
            setCurrentPosition(actualCurrentPosition);
            setTargetPosition(scaledPosition);
            setTransitionDuration(duration);
            setTransitionStartTime(globalThis.performance.now());
            setPositionMode('active');
            setIsTransitioning(true);
            setTransitionType('scaled');
            setTransitionEasing('easeInOutQuart');
            setTargetRadialOffset(computedRadialOffset);
          } else {
            // Entering liminal-web: animate to raw anchor position
            // (dynamic scaling will be off, so anchor is where node should be)
            setStartPosition(actualCurrentPosition);
            currentPositionRef.current = actualCurrentPosition;
            setCurrentPosition(actualCurrentPosition);
            setTargetPosition(anchorPos);
            setTransitionDuration(duration);
            setTransitionStartTime(globalThis.performance.now());
            setPositionMode('active');
            setIsTransitioning(true);
            setTransitionType('constellation');
            setTransitionEasing('easeInQuart');
          }

          // Flip back to front when returning home
          startFlipToSide('front', duration);
        }
      }
    },

    // ════════════════════════════════════════════════════════════════════════════
    // ⛔ LEGACY API - DO NOT USE ⛔
    // ════════════════════════════════════════════════════════════════════════════
    // These methods are part of the old orchestration system with ~50 scattered
    // primitives. They are commented out to prevent drift back to the old system.
    //
    // THE NEW UNIFIED SYSTEM uses only:
    //   1. setTargetState(target: NodeTargetState, duration?, worldRotation?)
    //
    // The new system is based on the state machine defined in:
    //   docs/architecture/layout-state-machine.md
    //
    // Flow: Event → deriveIntent() → executeLayoutIntent() → setTargetState()
    //
    // If you need to move a node, use setTargetState with either:
    //   - { mode: 'active', position: [...], flipSide: 'front' | 'back' }
    //   - { mode: 'home' }  // Returns to constellation (persistent) or exits (ephemeral)
    // ════════════════════════════════════════════════════════════════════════════

    /* LEGACY - DO NOT USE - Use setTargetState instead
    moveToPosition: (newTargetPosition, duration = 1000, easing = 'easeOutCubic') => {
      const actualCurrentPosition: [number, number, number] = positionMode === 'constellation'
        ? getConstellationPosition(dreamNode.position, radialOffset)
        : [...currentPosition];

      // Start flip-back animation alongside position movement
      startFlipBackAnimation();

      setStartPosition(actualCurrentPosition);
      setCurrentPosition(actualCurrentPosition);
      setTargetPosition(newTargetPosition);
      setTransitionDuration(duration);
      setTransitionStartTime(globalThis.performance.now());
      setPositionMode('active');
      setIsTransitioning(true);
      setTransitionType('liminal');
      setTransitionEasing(easing as 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart');
    },
    */

    /* LEGACY - DO NOT USE - Use setTargetState({ mode: 'home' }) instead
    returnToConstellation: (duration = 1000, easing = 'easeInQuart', worldRotation?) => {
      const actualCurrentPosition: [number, number, number] = positionMode === 'constellation'
        ? getConstellationPosition(dreamNode.position, radialOffset)
        : [...currentPosition];

      // Start flip-back animation alongside position movement
      startFlipBackAnimation();

      // For ephemeral nodes, animate to exit position instead of constellation
      if (ephemeral) {
        // Transform current position from local (DreamWorld) space to camera space.
        // DreamWorld group has rotation Q, so visual position = Q * local position.
        // To get camera space: apply Q (worldRotation) to local position.
        let cameraSpacePosition = [...actualCurrentPosition] as [number, number, number];
        if (worldRotation) {
          const posVec = new Vector3(...actualCurrentPosition);
          posVec.applyQuaternion(worldRotation);
          cameraSpacePosition = [posVec.x, posVec.y, posVec.z];
        }

        const selectedNodeId = useInterBrainStore.getState().selectedNode?.id;
        const isCenterNode = dreamNode.id === selectedNodeId;

        // Calculate exit position in camera space (ring at z=0)
        const exitPosition = calculateExitPosition(
          cameraSpacePosition,
          DEFAULT_EPHEMERAL_SPAWN_CONFIG.exitRadiusFactor,
          isCenterNode
        );

        // Transform exit position from camera space back to local (DreamWorld) space.
        // To get local space from camera: apply Q^-1 (inverse rotation).
        let worldExitPosition = [...exitPosition] as [number, number, number];
        if (worldRotation) {
          const exitVec = new Vector3(...exitPosition);
          const inverseRotation = worldRotation.clone().invert();
          exitVec.applyQuaternion(inverseRotation);
          worldExitPosition = [exitVec.x, exitVec.y, exitVec.z];
        }

        const exitDuration = DEFAULT_EPHEMERAL_SPAWN_CONFIG.exitAnimationDuration;

        setStartPosition(actualCurrentPosition);
        setCurrentPosition(actualCurrentPosition);
        setTargetPosition(worldExitPosition);
        setTransitionDuration(exitDuration);
        setTransitionStartTime(globalThis.performance.now());
        setPositionMode('active');
        setIsTransitioning(true);
        setTransitionType('ephemeral-exit');
        setTransitionEasing(DEFAULT_EPHEMERAL_SPAWN_CONFIG.exitEasing as 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart');
        return;
      }

      const constellationPosition = dreamNode.position;
      setStartPosition(actualCurrentPosition);
      setCurrentPosition(actualCurrentPosition);
      setTargetPosition(constellationPosition);
      setTransitionDuration(duration);
      setTransitionStartTime(globalThis.performance.now());
      setPositionMode('active');
      setIsTransitioning(true);
      setTransitionType('constellation');
      setTransitionEasing(easing as 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart');
    },
    */

    /* LEGACY - DO NOT USE - Use setTargetState({ mode: 'home' }) instead
    returnToScaledPosition: (duration = 1000, worldRotation, easing = 'easeOutCubic') => {
      // For ephemeral nodes, animate to exit position with world rotation correction
      if (ephemeral) {
        const actualCurrentPosition: [number, number, number] = positionMode === 'constellation'
          ? getConstellationPosition(dreamNode.position, radialOffset)
          : [...currentPosition];

        // Calculate exit position - need to work in camera space
        // The problem: actualCurrentPosition is in WORLD space (rotated with sphere)
        // The ring is at z=0 in CAMERA space
        // We need to: 1) un-rotate current position to camera space
        //             2) calculate exit direction in camera space
        //             3) keep the exit position in camera space (no re-rotation needed)

        let cameraSpacePosition = [...actualCurrentPosition] as [number, number, number];
        if (worldRotation) {
          // Transform current position from local (DreamWorld) space to camera space
          // DreamWorld has rotation Q, so camera position = Q * local position
          const posVec = new Vector3(actualCurrentPosition[0], actualCurrentPosition[1], actualCurrentPosition[2]);
          posVec.applyQuaternion(worldRotation);
          cameraSpacePosition = [posVec.x, posVec.y, posVec.z];
        }

        // Check if this is the center node (selected node in liminal web)
        const selectedNodeId = useInterBrainStore.getState().selectedNode?.id;
        const isCenterNode = dreamNode.id === selectedNodeId;

        // Calculate exit position in camera space (ring at z=0)
        const exitPosition = calculateExitPosition(
          cameraSpacePosition,
          DEFAULT_EPHEMERAL_SPAWN_CONFIG.exitRadiusFactor,
          isCenterNode
        );

        // Transform exit position from camera space back to local (DreamWorld) space.
        // To get local space from camera: apply Q^-1 (inverse rotation).
        let worldExitPosition = [...exitPosition] as [number, number, number];
        if (worldRotation) {
          const exitVec = new Vector3(exitPosition[0], exitPosition[1], exitPosition[2]);
          const inverseRotation = worldRotation.clone().invert();
          exitVec.applyQuaternion(inverseRotation);
          worldExitPosition = [exitVec.x, exitVec.y, exitVec.z];
        }

        const exitDuration = DEFAULT_EPHEMERAL_SPAWN_CONFIG.exitAnimationDuration;
        const exitEasing = DEFAULT_EPHEMERAL_SPAWN_CONFIG.exitEasing;

        startFlipBackAnimation();

        setStartPosition(actualCurrentPosition);
        setCurrentPosition(actualCurrentPosition);
        setTargetPosition(worldExitPosition);
        setTransitionDuration(exitDuration);
        setTransitionStartTime(globalThis.performance.now());
        setPositionMode('active');
        setIsTransitioning(true);
        setTransitionType('ephemeral-exit');
        setTransitionEasing(exitEasing as 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart');
        return;
      }

      const anchorPosition = dreamNode.position;

      const worldAnchorPosition = new Vector3(anchorPosition[0], anchorPosition[1], anchorPosition[2]);
      if (worldRotation) {
        worldAnchorPosition.applyQuaternion(worldRotation);
      }

      const { radialOffset: targetRadialOffset } = calculateDynamicScaling(
        worldAnchorPosition,
        DEFAULT_SCALING_CONFIG
      );

      const targetScaledPosition = getConstellationPosition(anchorPosition, targetRadialOffset);

      let actualCurrentPosition: [number, number, number];
      if (positionMode === 'constellation') {
        actualCurrentPosition = getConstellationPosition(anchorPosition, radialOffset);
      } else {
        actualCurrentPosition = [...currentPosition];
      }

      // Start flip-back animation alongside position movement
      startFlipBackAnimation();

      setStartPosition(actualCurrentPosition);
      setCurrentPosition(actualCurrentPosition);
      setTargetPosition(targetScaledPosition);
      setTransitionDuration(duration);
      setTransitionStartTime(globalThis.performance.now());
      setPositionMode('active');
      setIsTransitioning(true);
      setTransitionType('scaled');
      setTransitionEasing(easing as 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart');

      globalThis.setTimeout(() => {
        setRadialOffset(targetRadialOffset);
      }, duration - 100);
    },
    */

    /* LEGACY - DO NOT USE - Use setTargetState instead
    interruptAndMoveToPosition: (newTargetPosition, duration = 1000, easing = 'easeOutCubic') => {
      let actualCurrentPosition: [number, number, number];

      if (positionMode === 'constellation') {
        actualCurrentPosition = getConstellationPosition(dreamNode.position, radialOffset);
      } else {
        actualCurrentPosition = [...currentPosition];
      }

      setStartPosition(actualCurrentPosition);
      setCurrentPosition(actualCurrentPosition);
      setTargetPosition(newTargetPosition);
      setTransitionDuration(duration);
      setTransitionStartTime(globalThis.performance.now());
      setPositionMode('active');
      setIsTransitioning(true);
      setTransitionType('liminal');
      setTransitionEasing(easing as 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart');
    },
    */

    /* LEGACY - DO NOT USE - Use setTargetState({ mode: 'home' }) instead
    interruptAndReturnToConstellation: (duration = 1000, easing = 'easeInQuart', worldRotation?) => {
      let actualCurrentPosition: [number, number, number];

      if (positionMode === 'constellation') {
        actualCurrentPosition = getConstellationPosition(dreamNode.position, radialOffset);
      } else {
        actualCurrentPosition = [...currentPosition];
      }

      // For ephemeral nodes, animate to exit position instead of constellation
      if (ephemeral) {
        // Transform current position from local (DreamWorld) space to camera space.
        // DreamWorld group has rotation Q, so visual position = Q * local position.
        // To get camera space: apply Q (worldRotation) to local position.
        let cameraSpacePosition = [...actualCurrentPosition] as [number, number, number];
        if (worldRotation) {
          const posVec = new Vector3(...actualCurrentPosition);
          posVec.applyQuaternion(worldRotation);
          cameraSpacePosition = [posVec.x, posVec.y, posVec.z];
        }

        const selectedNodeId = useInterBrainStore.getState().selectedNode?.id;
        const isCenterNode = dreamNode.id === selectedNodeId;

        // Calculate exit position in camera space (ring at z=0)
        const exitPosition = calculateExitPosition(
          cameraSpacePosition,
          DEFAULT_EPHEMERAL_SPAWN_CONFIG.exitRadiusFactor,
          isCenterNode
        );

        // Transform exit position from camera space back to local (DreamWorld) space.
        // To get local space from camera: apply Q^-1 (inverse rotation).
        let worldExitPosition = [...exitPosition] as [number, number, number];
        if (worldRotation) {
          const exitVec = new Vector3(...exitPosition);
          const inverseRotation = worldRotation.clone().invert();
          exitVec.applyQuaternion(inverseRotation);
          worldExitPosition = [exitVec.x, exitVec.y, exitVec.z];
        }

        const exitDuration = DEFAULT_EPHEMERAL_SPAWN_CONFIG.exitAnimationDuration;

        setStartPosition(actualCurrentPosition);
        setCurrentPosition(actualCurrentPosition);
        setTargetPosition(worldExitPosition);
        setTransitionDuration(exitDuration);
        setTransitionStartTime(globalThis.performance.now());
        setPositionMode('active');
        setIsTransitioning(true);
        setTransitionType('ephemeral-exit');
        setTransitionEasing(DEFAULT_EPHEMERAL_SPAWN_CONFIG.exitEasing as 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart');
        return;
      }

      const constellationPosition = dreamNode.position;
      setStartPosition(actualCurrentPosition);
      setCurrentPosition(actualCurrentPosition);
      setTargetPosition(constellationPosition);
      setTransitionDuration(duration);
      setTransitionStartTime(globalThis.performance.now());
      setPositionMode('active');
      setIsTransitioning(true);
      setTransitionType('constellation');
      setTransitionEasing(easing as 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart');
    },
    */

    /* LEGACY - DO NOT USE - Use setTargetState({ mode: 'home' }) instead
    interruptAndReturnToScaledPosition: (duration = 1000, worldRotation, easing = 'easeOutCubic') => {
      // For ephemeral nodes, animate to exit position with world rotation correction
      if (ephemeral) {
        let actualCurrentPosition: [number, number, number];
        if (positionMode === 'constellation') {
          actualCurrentPosition = getConstellationPosition(dreamNode.position, radialOffset);
        } else {
          actualCurrentPosition = [...currentPosition];
        }

        // Transform current position from local (DreamWorld) space to camera space.
        // DreamWorld group has rotation Q, so visual position = Q * local position.
        // To get camera space: apply Q (worldRotation) to local position.
        let cameraSpacePosition = [...actualCurrentPosition] as [number, number, number];
        if (worldRotation) {
          const posVec = new Vector3(...actualCurrentPosition);
          posVec.applyQuaternion(worldRotation);
          cameraSpacePosition = [posVec.x, posVec.y, posVec.z];
        }

        const selectedNodeId = useInterBrainStore.getState().selectedNode?.id;
        const isCenterNode = dreamNode.id === selectedNodeId;

        // Calculate exit position in camera space (ring at z=0)
        const exitPosition = calculateExitPosition(
          cameraSpacePosition,
          DEFAULT_EPHEMERAL_SPAWN_CONFIG.exitRadiusFactor,
          isCenterNode
        );

        // Transform exit position from camera space back to local (DreamWorld) space.
        // To get local space from camera: apply Q^-1 (inverse rotation).
        let worldExitPosition = [...exitPosition] as [number, number, number];
        if (worldRotation) {
          const exitVec = new Vector3(...exitPosition);
          const inverseRotation = worldRotation.clone().invert();
          exitVec.applyQuaternion(inverseRotation);
          worldExitPosition = [exitVec.x, exitVec.y, exitVec.z];
        }

        const exitDuration = DEFAULT_EPHEMERAL_SPAWN_CONFIG.exitAnimationDuration;

        setStartPosition(actualCurrentPosition);
        setCurrentPosition(actualCurrentPosition);
        setTargetPosition(worldExitPosition);
        setTransitionDuration(exitDuration);
        setTransitionStartTime(globalThis.performance.now());
        setPositionMode('active');
        setIsTransitioning(true);
        setTransitionType('ephemeral-exit');
        setTransitionEasing(DEFAULT_EPHEMERAL_SPAWN_CONFIG.exitEasing as 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart');
        return;
      }

      const anchorPosition = dreamNode.position;

      const worldAnchorPosition = new Vector3(anchorPosition[0], anchorPosition[1], anchorPosition[2]);
      if (worldRotation) {
        worldAnchorPosition.applyQuaternion(worldRotation);
      }

      const { radialOffset: targetRadialOffset } = calculateDynamicScaling(
        worldAnchorPosition,
        DEFAULT_SCALING_CONFIG
      );

      const targetScaledPosition = getConstellationPosition(anchorPosition, targetRadialOffset);

      let actualCurrentPosition: [number, number, number];
      if (positionMode === 'constellation') {
        actualCurrentPosition = getConstellationPosition(anchorPosition, radialOffset);
      } else {
        actualCurrentPosition = [...currentPosition];
      }

      setStartPosition(actualCurrentPosition);
      setCurrentPosition(actualCurrentPosition);
      setTargetPosition(targetScaledPosition);
      setTransitionDuration(duration);
      setTransitionStartTime(globalThis.performance.now());
      setPositionMode('active');
      setIsTransitioning(true);
      setTransitionType('scaled');
      setTransitionEasing(easing as 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart');

      globalThis.setTimeout(() => {
        setRadialOffset(targetRadialOffset);
      }, duration - 100);
    },
    */

    /* LEGACY - DO NOT USE - setTargetState handles mode transitions automatically
    setActiveState: (active: boolean) => {
      if (active) {
        // When switching from constellation to active mode, compute the actual
        // world position (with radial offset) so the node starts from its
        // visual position, not the raw anchor.
        const resolvedPosition: [number, number, number] = positionMode === 'constellation'
          ? getConstellationPosition(dreamNode.position, radialOffset)
          : [...currentPosition] as [number, number, number];
        setPositionMode('active');
        setCurrentPosition(resolvedPosition);
      } else {
        setPositionMode('constellation');
        setCurrentPosition(dreamNode.position);
      }
    },
    */

    // ════════════════════════════════════════════════════════════════════════════
    // END OF LEGACY API
    // ════════════════════════════════════════════════════════════════════════════

    // These utility methods are still valid and used by the new system
    getCurrentPosition: () => currentPositionRef.current,
    isMoving: () => isTransitioning,
    getPositionMode: () => positionMode
  }), [currentPosition, isTransitioning, dreamNode.position, positionMode, radialOffset, transitionEasing, flipRotation, ephemeral]);
  
  // Position calculation and animation frame logic
  useFrame((_state, delta) => {
    // Hover scale animation
    const effectiveHover = isHovered || isPendingRelationship || isTutorialHighlighted;
    if (hoverGroupRef.current) {
      const currentZ = positionMode === 'constellation'
        ? anchorPosition[2] - normalizedDirection[2] * radialOffset
        : currentPosition[2];

      const targetScale = effectiveHover ? getDistanceScaledHoverScale(currentZ) : 1;
      const currentScale = hoverGroupRef.current.scale.x;
      const lerpFactor = 1 - Math.pow(0.00001, delta);
      const newScale = currentScale + (targetScale - currentScale) * lerpFactor;
      hoverGroupRef.current.scale.set(newScale, newScale, newScale);
    }

    // Constellation mode dynamic scaling
    if (positionMode === 'constellation' && enableDynamicScaling && groupRef.current) {
      const anchorGroup = groupRef.current.parent;
      const anchorVector = new Vector3(anchorPosition[0], anchorPosition[1], anchorPosition[2]);
      if (anchorGroup) {
        anchorGroup.localToWorld(anchorVector);
      }

      const { radialOffset: newRadialOffset } = calculateDynamicScaling(
        anchorVector,
        DEFAULT_SCALING_CONFIG
      );

      if (radialOffset !== newRadialOffset) {
        setRadialOffset(newRadialOffset);
      }
    }
    // Active mode transitions - needs per-frame updates
    else if (positionMode === 'active' && isTransitioning) {
      const elapsed = globalThis.performance.now() - transitionStartTime;
      const progress = Math.min(elapsed / transitionDuration, 1);

      let easedProgress: number;
      switch (transitionEasing) {
        case 'easeInQuart':
          easedProgress = Math.pow(progress, 4);
          break;
        case 'easeOutQuart':
          easedProgress = 1 - Math.pow(1 - progress, 4);
          break;
        case 'easeInOutQuart':
          easedProgress = progress < 0.5
            ? 8 * Math.pow(progress, 4)
            : 1 - Math.pow(-2 * progress + 2, 4) / 2;
          break;
        case 'easeOutCubic':
        default:
          easedProgress = 1 - Math.pow(1 - progress, 3);
          break;
      }

      const newPosition: [number, number, number] = [
        startPosition[0] + (targetPosition[0] - startPosition[0]) * easedProgress,
        startPosition[1] + (targetPosition[1] - startPosition[1]) * easedProgress,
        startPosition[2] + (targetPosition[2] - startPosition[2]) * easedProgress
      ];

      currentPositionRef.current = newPosition;
      setCurrentPosition(newPosition);

      if (progress >= 1) {
        setIsTransitioning(false);
        currentPositionRef.current = targetPosition;
        setCurrentPosition(targetPosition);

        if (transitionType === 'liminal') {
          // Stay in active mode
        } else if (transitionType === 'constellation') {
          setPositionMode('constellation');
          setRadialOffset(0);
        } else if (transitionType === 'scaled') {
          setPositionMode('constellation');
          setRadialOffset(targetRadialOffset);
        } else if (transitionType === 'ephemeral-exit') {
          // Ephemeral node finished exit animation — queue for staggered despawn
          // so multiple nodes completing in the same frame don't all unmount at once.
          queueEphemeralDespawn(dreamNode.id);
        }
      }
    }

    // Flip animation updates - needs per-frame updates
    if (isFlipping) {
      const targetRotation = nodeFlipState?.flipDirection === 'front-to-back' ? Math.PI : 0;
      const animationDuration = 600;
      const elapsed = globalThis.performance.now() - (nodeFlipState?.animationStartTime || 0);
      const progress = Math.min(elapsed / animationDuration, 1);

      const easedProgress = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      const newRotation = nodeFlipState?.flipDirection === 'front-to-back'
        ? easedProgress * Math.PI
        : Math.PI - (easedProgress * Math.PI);

      setFlipRotation(newRotation);

      if (progress >= 1) {
        completeFlipAnimation(dreamNode.id);
        setFlipRotation(targetRotation);
      }
    }

    // Unified flip-back animation - needs per-frame updates
    if (shouldAnimateFlip && !isFlipping) {
      const elapsed = globalThis.performance.now() - flipAnimationStartTime;
      const progress = Math.min(elapsed / flipAnimationDuration, 1);

      const easedProgress = 1 - Math.pow(1 - progress, 3);

      const newFlipRotation = startFlipRotation + (targetFlipRotation - startFlipRotation) * easedProgress;
      setFlipRotation(newFlipRotation);

      if (progress >= 1) {
        setFlipRotation(targetFlipRotation);
        setShouldAnimateFlip(false);

        // Sync store flipState to match orchestration-driven flip result
        const targetSide = targetFlipRotation > Math.PI / 2 ? 'back' : 'front';
        const storeState = useInterBrainStore.getState();
        const currentStoreFlip = storeState.flipState.flipStates.get(dreamNode.id);
        const storeThinks = currentStoreFlip?.isFlipped || false;
        const actuallyFlipped = targetSide === 'back';

        if (storeThinks !== actuallyFlipped) {
          storeState.syncFlipState(dreamNode.id, actuallyFlipped);
        }
      }
    }
  });

  // Calculate final position
  const anchorPosition = dreamNode.position;
  const normalizedDirection = useMemo(() => {
    const direction = [-anchorPosition[0], -anchorPosition[1], -anchorPosition[2]];
    const directionLength = Math.sqrt(direction[0]**2 + direction[1]**2 + direction[2]**2);
    return [
      direction[0] / directionLength,
      direction[1] / directionLength,
      direction[2] / directionLength
    ];
  }, [anchorPosition]);
  
  const finalPosition: [number, number, number] = positionMode === 'constellation'
    ? [
        anchorPosition[0] - normalizedDirection[0] * radialOffset,
        anchorPosition[1] - normalizedDirection[1] * radialOffset,
        anchorPosition[2] - normalizedDirection[2] * radialOffset
      ]
    : currentPosition;

  // Base size and styling
  const nodeSize = dreamNodeStyles.dimensions.nodeSizeThreeD;
  const borderWidth = dreamNodeStyles.dimensions.borderWidth;

  // Calculate distance-scaled glow intensity based on z-position
  const glowIntensity = getDistanceScaledGlowIntensity(finalPosition[2]);


  // Clean Billboard → RotatableGroup → [DreamTalk, DreamSong] hierarchy
  return (
    <group
      ref={groupRef}
      position={finalPosition}
    >
      {/* Billboard component - always faces camera */}
      <Billboard follow={true} lockX={false} lockY={false} lockZ={false}>
        {/* R3F rotating group for true 3D flip animation with smooth hover scaling */}
        <group
          ref={hoverGroupRef}
          rotation={[0, flipRotation, 0]}
        >
          {/* Front side - DreamTalk */}
          {/* WebGL sprite: renders for all nodes EXCEPT the selected node when HTML is active */}
          {/* This prevents visual artifacts from sprite/HTML overlay mismatch on high-DPI displays */}
          {USE_WEBGL_DREAMTALK && USE_SPRITE_RENDERING &&
           !(spatialLayout === 'liminal-web' && selectedNode?.id === dreamNode.id && !isTransitioning) && (
            <DreamTalkSprite
              dreamNode={dreamNode}
              isHovered={isHovered}
              isPendingRelationship={isPendingRelationship}
              isTutorialHighlighted={isTutorialHighlighted}
              glowIntensity={glowIntensity}
              nodeSize={nodeSize}
              borderWidth={borderWidth}
              onPointerEnter={handleMouseEnter}
              onPointerLeave={handleMouseLeave}
              onClick={handleClick as unknown as (e: THREE.Event) => void}
              onDoubleClick={handleDoubleClick as unknown as (e: THREE.Event) => void}
            />
          )}

          {/* Layer 2: HTML overlay (only for selected node after animation completes - has flip/fullscreen buttons) */}
          {/* Renders on top of WebGL sprite to prevent black flash during media load */}
          {(!USE_WEBGL_DREAMTALK || !USE_SPRITE_RENDERING || (spatialLayout === 'liminal-web' && selectedNode?.id === dreamNode.id && !isTransitioning)) && (
            <Html
              position={[0, -0.1125, 0.02]}
              center
              transform
              distanceFactor={10}
              style={{
                pointerEvents: isDragging ? 'none' : 'auto',
                userSelect: isHovered ? 'auto' : 'none'
              }}
            >
              {/* Container div */}
              <div
                style={{
                  transformStyle: 'preserve-3d',
                  width: `${nodeSize}px`,
                  height: `${nodeSize}px`,
                  position: 'relative'
                }}
              >
                {/* Front side - DreamTalk */}
                <DreamTalkSide
                  dreamNode={dreamNode}
                  isHovered={isHovered}
                  isEditModeActive={isEditModeActive}
                  isPendingRelationship={isPendingRelationship}
                  isRelationshipEditMode={spatialLayout === 'relationship-edit'}
                  isTutorialHighlighted={isTutorialHighlighted}
                  shouldShowFlipButton={shouldShowFlipButton}
                  shouldShowFullscreenButton={shouldShowDreamTalkFullscreen}
                  nodeSize={nodeSize}
                  borderWidth={borderWidth}
                  glowIntensity={glowIntensity}
                  onMouseEnter={handleMouseEnter}
                  onMouseLeave={handleMouseLeave}
                  onClick={handleClick}
                  onDoubleClick={handleDoubleClick}
                  onFlipClick={handleFlipClick}
                  onFullScreenClick={handleDreamTalkFullScreen}
                />
              </div>
            </Html>
          )}

          {/* Second Html component - DreamSong with 3D offset and rotation */}
          {/* OPTIMIZATION: Only mount DreamSongSide when node is selected in liminal-web mode */}
          {/* Only show DreamSong when flipped past 90 degrees (back side visible) */}
          {hasLoadedBackSide && flipRotation > Math.PI / 2 && (
            <Html
              position={[0, 0, -0.01]}
              rotation={[0, Math.PI, 0]}
              center
              transform
              distanceFactor={10}
              style={{
                pointerEvents: isDragging ? 'none' : 'auto',
                userSelect: isHovered ? 'auto' : 'none'
              }}
            >
              {/* Container div */}
              <div
                style={{
                  transformStyle: 'preserve-3d',
                  width: `${nodeSize}px`,
                  height: `${nodeSize}px`,
                  position: 'relative'
                }}
              >
                {/* DreamSong side - lazy loaded after animation completes */}
                <DreamSongSide
                  dreamNode={dreamNode}
                  isHovered={isHovered}
                  isEditModeActive={isEditModeActive}
                  isPendingRelationship={isPendingRelationship}
                  isRelationshipEditMode={spatialLayout === 'relationship-edit'}
                  isTutorialHighlighted={isTutorialHighlighted}
                  shouldShowFlipButton={shouldShowFlipButton}
                  shouldShowFullscreenButton={shouldShowDreamSongFullscreen}
                  nodeSize={nodeSize}
                  borderWidth={borderWidth}
                  glowIntensity={glowIntensity}
                  onMouseEnter={handleMouseEnter}
                  onMouseLeave={handleMouseLeave}
                  onClick={handleClick}
                  onDoubleClick={handleDoubleClick}
                  onFlipClick={handleFlipClick}
                  onFullScreenClick={handleDreamSongFullScreen}
                />
              </div>
            </Html>
          )}
        </group>
      </Billboard>
    
      {/* Invisible hit detection sphere */}
      <mesh 
        ref={hitSphereRef}
        position={[0, 0, 0]}
        userData={{ dreamNodeId: dreamNode.id, dreamNode: dreamNode }}
      >
        <sphereGeometry args={[12, 8, 8]} />
        <meshBasicMaterial 
          transparent={true} 
          opacity={0}
        />
      </mesh>
    </group>
  );
});

DreamNode3D.displayName = 'DreamNode3D';

export default DreamNode3D;