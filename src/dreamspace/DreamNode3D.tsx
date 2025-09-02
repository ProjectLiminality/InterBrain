import React, { useState, useRef, useMemo, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Group, Mesh, Quaternion } from 'three';
import { setIcon } from 'obsidian';
import { DreamNode, MediaFile } from '../types/dreamnode';
import { calculateDynamicScaling, DEFAULT_SCALING_CONFIG } from '../dreamspace/DynamicViewScaling';
import { useInterBrainStore } from '../store/interbrain-store';
import { dreamNodeStyles, getNodeColors, getNodeGlow, getEditModeGlow, getMediaContainerStyle, getMediaOverlayStyle, getGitVisualState, getGitStateStyle, getGitGlow } from './dreamNodeStyles';
import { DreamSong } from '../features/dreamweaving/DreamSong';
import { DreamSongParserService } from '../services/dreamsong-parser-service';
import { CanvasParserService } from '../services/canvas-parser-service';
import { VaultService } from '../services/vault-service';
import { DreamSongData } from '../types/dreamsong';
import './dreamNodeAnimations.css';

// Universal Movement API interface
export interface DreamNode3DRef {
  moveToPosition: (targetPosition: [number, number, number], duration?: number, easing?: string) => void;
  returnToConstellation: (duration?: number, easing?: string) => void;
  returnToScaledPosition: (duration?: number, worldRotation?: Quaternion, easing?: string) => void; // New method for full constellation return with rotation and easing support
  interruptAndMoveToPosition: (targetPosition: [number, number, number], duration?: number, easing?: string) => void;
  interruptAndReturnToConstellation: (duration?: number, easing?: string) => void;
  interruptAndReturnToScaledPosition: (duration?: number, worldRotation?: Quaternion, easing?: string) => void;
  setActiveState: (active: boolean) => void;
  getCurrentPosition: () => [number, number, number];
  isMoving: () => boolean;
}

interface DreamNode3DProps {
  dreamNode: DreamNode;
  onHover?: (node: DreamNode, isHovered: boolean) => void;
  onClick?: (node: DreamNode) => void;
  onDoubleClick?: (node: DreamNode) => void;
  enableDynamicScaling?: boolean;
  onHitSphereRef?: (nodeId: string, meshRef: React.RefObject<Mesh | null>) => void;
  // Services for DreamSong parsing
  vaultService?: VaultService;
  canvasParserService?: CanvasParserService;
}

/**
 * 3D DreamNode component with dual-mode positioning system
 * 
 * Features:
 * - Dual-mode: constellation (continuous radial offset) vs active (discrete interpolation)
 * - Universal movement API for liminal web transitions
 * - Position sovereignty - component owns its position state
 * - Counter-rotation support for world-space positioning
 * - Color coding: blue for Dreams, red for Dreamers
 */
const DreamNode3D = forwardRef<DreamNode3DRef, DreamNode3DProps>(({ 
  dreamNode, 
  onHover, 
  onClick, 
  onDoubleClick,
  enableDynamicScaling = false,
  onHitSphereRef,
  vaultService,
  canvasParserService
}, ref) => {
  const [isHovered, setIsHovered] = useState(false);
  const [radialOffset, setRadialOffset] = useState(0);
  const groupRef = useRef<Group>(null);
  const hitSphereRef = useRef<Mesh>(null);
  
  // Flip animation state - default to Math.PI for front side (corrected orientation)
  const [flipRotation, setFlipRotation] = useState(Math.PI);
  const [dreamSongData, setDreamSongData] = useState<DreamSongData | null>(null);
  const [hasDreamSong, setHasDreamSong] = useState(false);
  const [dreamSongHasContent, setDreamSongHasContent] = useState(false);
  const [isLoadingDreamSong, setIsLoadingDreamSong] = useState(false);
  
  // Dual-mode position state
  const [positionMode, setPositionMode] = useState<'constellation' | 'active'>('constellation');
  const [targetPosition, setTargetPosition] = useState<[number, number, number]>(dreamNode.position);
  const [currentPosition, setCurrentPosition] = useState<[number, number, number]>(dreamNode.position);
  const [startPosition, setStartPosition] = useState<[number, number, number]>(dreamNode.position);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionStartTime, setTransitionStartTime] = useState(0);
  const [transitionDuration, setTransitionDuration] = useState(1000);
  const [transitionType, setTransitionType] = useState<'liminal' | 'constellation' | 'scaled'>('liminal');
  const [transitionEasing, setTransitionEasing] = useState<'easeOutCubic' | 'easeInQuart' | 'easeOutQuart'>('easeOutCubic');
  
  // Check global drag state to prevent hover interference during sphere rotation
  const isDragging = useInterBrainStore(state => state.isDragging);
  
  // Flip state management
  const flipState = useInterBrainStore(state => state.flipState);
  const setFlippedNode = useInterBrainStore(state => state.setFlippedNode);
  const startFlipAnimation = useInterBrainStore(state => state.startFlipAnimation);
  const completeFlipAnimation = useInterBrainStore(state => state.completeFlipAnimation);
  const spatialLayout = useInterBrainStore(state => state.spatialLayout);
  const selectedNode = useInterBrainStore(state => state.selectedNode);
  
  // Subscribe to edit mode state for relationship glow
  const isEditModeActive = useInterBrainStore(state => state.editMode.isActive);
  const isPendingRelationship = useInterBrainStore(state => 
    state.editMode.pendingRelationships.includes(dreamNode.id)
  );
  
  // Get current flip state for this node
  const nodeFlipState = flipState.flipStates.get(dreamNode.id);
  const isFlipped = nodeFlipState?.isFlipped || false;
  const isFlipping = nodeFlipState?.isFlipping || false;
  
  // Ensure initial state shows front side (flipRotation = Math.PI = front)
  useEffect(() => {
    if (!nodeFlipState) {
      setFlipRotation(Math.PI); // Front side by default
    }
  }, [nodeFlipState]);
  
  // Determine if flip button should be visible (only in liminal web mode for selected node)
  const shouldShowFlipButton = useMemo(() => {
    const result = spatialLayout === 'liminal-web' && 
                   selectedNode?.id === dreamNode.id && 
                   isHovered &&
                   hasDreamSong &&  // Show button if DreamSong file exists (even if empty)
                   !isDragging;
    
    // Debug logging for flip button visibility (only when conditions are close)
    if (spatialLayout === 'liminal-web' && selectedNode?.id === dreamNode.id) {
      console.log(`🔄 [DreamNode3D] Flip button logic for "${dreamNode.name}":`);  
      console.log(`  - spatialLayout === 'liminal-web': ${spatialLayout === 'liminal-web'}`);
      console.log(`  - selectedNode?.id === dreamNode.id: ${selectedNode?.id === dreamNode.id}`);
      console.log(`  - isHovered: ${isHovered}`);
      console.log(`  - hasDreamSong: ${hasDreamSong}`);
      console.log(`  - dreamSongHasContent: ${dreamSongHasContent}`);
      console.log(`  - isDragging: ${isDragging}`);
      console.log(`  - shouldShowFlipButton: ${result}`);
    }
    
    return result;
  }, [spatialLayout, selectedNode, dreamNode.id, isHovered, hasDreamSong, isDragging]);

  // Register hit sphere reference with parent component
  useEffect(() => {
    if (onHitSphereRef && hitSphereRef) {
      onHitSphereRef(dreamNode.id, hitSphereRef);
    }
  }, [dreamNode.id, onHitSphereRef]);
  
  // Check for DreamSong canvas file on component mount, when selected, or when services become available
  useEffect(() => {
    const checkDreamSong = async () => {
      console.log(`🎭 [DreamNode3D] Checking DreamSong for node: "${dreamNode.name}" (${dreamNode.id})`);
      console.log(`🎭 [DreamNode3D] Services available - vault: ${!!vaultService}, canvas: ${!!canvasParserService}`);
      console.log(`🎭 [DreamNode3D] Node selected: ${selectedNode?.id === dreamNode.id}, spatialLayout: ${spatialLayout}`);
      
      if (!vaultService || !canvasParserService) {
        console.log(`⚠️ [DreamNode3D] Cannot check DreamSong: missing services - will retry when services become available`);
        // Reset states when services unavailable
        setHasDreamSong(false);
        setDreamSongHasContent(false);
        return;
      }
      
      const canvasPath = `${dreamNode.repoPath}/DreamSong.canvas`;
      console.log(`🎭 [DreamNode3D] Checking canvas at: "${canvasPath}"`);
      
      try {
        const exists = await vaultService.fileExists(canvasPath);
        console.log(`${exists ? '✅' : '❌'} [DreamNode3D] DreamSong canvas ${exists ? 'EXISTS' : 'NOT FOUND'} for "${dreamNode.name}"`);
        setHasDreamSong(exists);
        
        // If DreamSong exists, try to parse it to check if it has content
        if (exists) {
          console.log(`🎭 [DreamNode3D] DreamSong exists, creating parser to check content...`);
          const dreamSongParser = new DreamSongParserService(vaultService, canvasParserService);
          const parseResult = await dreamSongParser.parseDreamSong(canvasPath, dreamNode.repoPath);
          
          if (parseResult.success && parseResult.data) {
            console.log(`✅ [DreamNode3D] DreamSong parsed successfully:`);
            console.log(`  - Blocks: ${parseResult.data.blocks.length}`);
            console.log(`  - Has content: ${parseResult.data.hasContent}`);
            console.log(`  - Total blocks: ${parseResult.data.totalBlocks}`);
            
            // Set content availability based on actual parsed content
            setDreamSongHasContent(parseResult.data.hasContent);
          } else {
            console.log(`❌ [DreamNode3D] DreamSong parse failed:`, parseResult.error?.message);
            setDreamSongHasContent(false);
          }
        } else {
          setDreamSongHasContent(false);
        }
      } catch (error) {
        console.error(`❌ [DreamNode3D] Error checking DreamSong for ${dreamNode.id}:`, error);
        setHasDreamSong(false);
        setDreamSongHasContent(false);
      }
    };
    
    checkDreamSong();
  }, [dreamNode.id, dreamNode.repoPath, vaultService, canvasParserService, selectedNode?.id, spatialLayout]);
  
  // Load DreamSong data when flipped to back side
  useEffect(() => {
    const loadDreamSongData = async () => {
      if (!isFlipped || !hasDreamSong || !vaultService || !canvasParserService || dreamSongData) {
        return;
      }
      
      setIsLoadingDreamSong(true);
      
      try {
        const dreamSongParser = new DreamSongParserService(vaultService, canvasParserService);
        const canvasPath = `${dreamNode.repoPath}/DreamSong.canvas`;
        const result = await dreamSongParser.parseDreamSong(canvasPath, dreamNode.repoPath);
        
        if (result.success && result.data) {
          setDreamSongData(result.data);
        } else {
          console.error(`Failed to parse DreamSong: ${result.error?.message}`);
        }
      } catch (error) {
        console.error(`Error loading DreamSong for ${dreamNode.id}:`, error);
      } finally {
        setIsLoadingDreamSong(false);
      }
    };
    
    loadDreamSongData();
  }, [isFlipped, hasDreamSong, dreamNode.id, dreamNode.repoPath, vaultService, canvasParserService, dreamSongData]);
  
  // Reset flip state when node is no longer selected in liminal web mode
  useEffect(() => {
    if (spatialLayout !== 'liminal-web' || selectedNode?.id !== dreamNode.id) {
      if (flipState.flippedNodeId === dreamNode.id) {
        setFlippedNode(null);
        setFlipRotation(0);
        setDreamSongData(null);
      }
    }
  }, [spatialLayout, selectedNode, dreamNode.id, flipState.flippedNodeId, setFlippedNode]);

  // Handle mouse events (suppress during sphere rotation to prevent interference)
  const handleMouseEnter = () => {
    if (isDragging) {
      return; // Suppress hover during drag operations
    }
    setIsHovered(true);
    onHover?.(dreamNode, true);
  };

  const handleMouseLeave = () => {
    if (isDragging) {
      return; // Suppress hover during drag operations
    }
    setIsHovered(false);
    onHover?.(dreamNode, false);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) return; // Suppress click during drag operations
    e.stopPropagation();
    onClick?.(dreamNode);
  };
  
  // Handle flip button click
  const handleFlipClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDragging || isFlipping) return;
    
    const direction = isFlipped ? 'back-to-front' : 'front-to-back';
    startFlipAnimation(dreamNode.id, direction);
  }, [isDragging, isFlipping, isFlipped, startFlipAnimation, dreamNode.id]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isDragging) return; // Suppress double-click during drag operations
    e.stopPropagation();
    onDoubleClick?.(dreamNode);
  };

  // Universal Movement API
  useImperativeHandle(ref, () => ({
    moveToPosition: (newTargetPosition, duration = 1000, easing = 'easeOutCubic') => {
      // Switch to active mode and start transition
      // CRITICAL FIX: Calculate actual current visual position
      let actualCurrentPosition: [number, number, number];
      
      if (positionMode === 'constellation') {
        // Calculate constellation position with radial offset
        const anchorPos = dreamNode.position;
        const direction = [-anchorPos[0], -anchorPos[1], -anchorPos[2]];
        const dirLength = Math.sqrt(direction[0]**2 + direction[1]**2 + direction[2]**2);
        const normalizedDir = [direction[0]/dirLength, direction[1]/dirLength, direction[2]/dirLength];
        
        actualCurrentPosition = [
          anchorPos[0] - normalizedDir[0] * radialOffset,
          anchorPos[1] - normalizedDir[1] * radialOffset,
          anchorPos[2] - normalizedDir[2] * radialOffset
        ];
      } else {
        actualCurrentPosition = [...currentPosition];
      }
      
      setStartPosition(actualCurrentPosition);
      setCurrentPosition(actualCurrentPosition); // Initialize currentPosition for active mode
      setTargetPosition(newTargetPosition);
      setTransitionDuration(duration);
      setTransitionStartTime(globalThis.performance.now());
      setPositionMode('active');
      setIsTransitioning(true);
      setTransitionType('liminal'); // This is a liminal web transition
      setTransitionEasing(easing as 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart');
      
    },
    returnToConstellation: (duration = 1000, easing = 'easeInQuart') => {
      // Enhanced method: returns to proper constellation position (with scaling if enabled)
      let actualCurrentPosition: [number, number, number];
      
      if (positionMode === 'constellation') {
        // Calculate current visual position with radial offset
        const anchorPos = dreamNode.position;
        const direction = [-anchorPos[0], -anchorPos[1], -anchorPos[2]];
        const dirLength = Math.sqrt(direction[0]**2 + direction[1]**2 + direction[2]**2);
        const normalizedDir = [direction[0]/dirLength, direction[1]/dirLength, direction[2]/dirLength];
        
        actualCurrentPosition = [
          anchorPos[0] - normalizedDir[0] * radialOffset,
          anchorPos[1] - normalizedDir[1] * radialOffset,
          anchorPos[2] - normalizedDir[2] * radialOffset
        ];
      } else {
        actualCurrentPosition = [...currentPosition];
      }
      
      // Target position should be sphere surface - constellation mode will handle scaling
      const constellationPosition = dreamNode.position;
      setStartPosition(actualCurrentPosition);
      setCurrentPosition(actualCurrentPosition);
      setTargetPosition(constellationPosition);
      setTransitionDuration(duration);
      setTransitionStartTime(globalThis.performance.now());
      setPositionMode('active'); // Use active mode for the transition
      setIsTransitioning(true);
      setTransitionType('constellation'); // This is a constellation return transition
      setTransitionEasing(easing as 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart');
    },
    returnToScaledPosition: (duration = 1000, worldRotation, easing = 'easeOutCubic') => {
      // ROBUST METHOD: Returns ANY node to its proper scaled constellation position
      // Handles both active nodes (from liminal positions) and inactive nodes (from sphere surface)
      
      // Calculate target dynamically scaled position for this node
      const anchorPosition = dreamNode.position;
      
      // Transform anchor position to world space using provided rotation (similar to useFrame logic)
      const worldAnchorPosition = new Vector3(anchorPosition[0], anchorPosition[1], anchorPosition[2]);
      if (worldRotation) {
        // Apply the sphere's world rotation to get the actual world position
        worldAnchorPosition.applyQuaternion(worldRotation);
      }
      
      // Calculate what the radial offset should be using dynamic scaling
      const { radialOffset: targetRadialOffset } = calculateDynamicScaling(
        worldAnchorPosition,
        DEFAULT_SCALING_CONFIG
      );
      
      // Calculate target scaled position
      const direction = [-anchorPosition[0], -anchorPosition[1], -anchorPosition[2]];
      const dirLength = Math.sqrt(direction[0]**2 + direction[1]**2 + direction[2]**2);
      const normalizedDir = [direction[0]/dirLength, direction[1]/dirLength, direction[2]/dirLength];
      
      const targetScaledPosition: [number, number, number] = [
        anchorPosition[0] - normalizedDir[0] * targetRadialOffset,
        anchorPosition[1] - normalizedDir[1] * targetRadialOffset,
        anchorPosition[2] - normalizedDir[2] * targetRadialOffset
      ];
      
      // Get actual current position
      let actualCurrentPosition: [number, number, number];
      if (positionMode === 'constellation') {
        // Calculate current visual position with radial offset
        actualCurrentPosition = [
          anchorPosition[0] - normalizedDir[0] * radialOffset,
          anchorPosition[1] - normalizedDir[1] * radialOffset,
          anchorPosition[2] - normalizedDir[2] * radialOffset
        ];
      } else {
        actualCurrentPosition = [...currentPosition];
      }
      
      // Animate to target scaled position
      setStartPosition(actualCurrentPosition);
      setCurrentPosition(actualCurrentPosition);
      setTargetPosition(targetScaledPosition);
      setTransitionDuration(duration);
      setTransitionStartTime(globalThis.performance.now());
      setPositionMode('active'); // Use active mode for the transition
      setIsTransitioning(true);
      setTransitionType('scaled'); // This is a scaled position return transition
      setTransitionEasing(easing as 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart');
      
      // Determine node's current state for logging (removed unused variables for cleaner build)
      
      // Set the target radial offset for when we switch back to constellation mode
      globalThis.setTimeout(() => {
        setRadialOffset(targetRadialOffset);
      }, duration - 100); // Set slightly before transition completes
    },
    interruptAndMoveToPosition: (newTargetPosition, duration = 1000, easing = 'easeOutCubic') => {
      // Enhanced method: Can interrupt existing animation using current position as new start point
      
      // CRITICAL: Calculate actual current visual position (including mid-flight positions)
      let actualCurrentPosition: [number, number, number];
      
      if (positionMode === 'constellation') {
        // Calculate constellation position with radial offset
        const anchorPos = dreamNode.position;
        const direction = [-anchorPos[0], -anchorPos[1], -anchorPos[2]];
        const dirLength = Math.sqrt(direction[0]**2 + direction[1]**2 + direction[2]**2);
        const normalizedDir = [direction[0]/dirLength, direction[1]/dirLength, direction[2]/dirLength];
        
        actualCurrentPosition = [
          anchorPos[0] - normalizedDir[0] * radialOffset,
          anchorPos[1] - normalizedDir[1] * radialOffset,
          anchorPos[2] - normalizedDir[2] * radialOffset
        ];
      } else {
        // Node is in active mode - use the current interpolated position
        actualCurrentPosition = [...currentPosition];
      }
      
      // Start new animation from current position (interrupts existing animation smoothly)
      setStartPosition(actualCurrentPosition);
      setCurrentPosition(actualCurrentPosition);
      setTargetPosition(newTargetPosition);
      setTransitionDuration(duration);
      setTransitionStartTime(globalThis.performance.now());
      setPositionMode('active');
      setIsTransitioning(true);
      setTransitionType('liminal');
      setTransitionEasing(easing as 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart');
    },
    interruptAndReturnToConstellation: (duration = 1000, easing = 'easeInQuart') => {
      // Enhanced method: Can interrupt existing animation to return to constellation
      
      let actualCurrentPosition: [number, number, number];
      
      if (positionMode === 'constellation') {
        // Calculate current visual position with radial offset
        const anchorPos = dreamNode.position;
        const direction = [-anchorPos[0], -anchorPos[1], -anchorPos[2]];
        const dirLength = Math.sqrt(direction[0]**2 + direction[1]**2 + direction[2]**2);
        const normalizedDir = [direction[0]/dirLength, direction[1]/dirLength, direction[2]/dirLength];
        
        actualCurrentPosition = [
          anchorPos[0] - normalizedDir[0] * radialOffset,
          anchorPos[1] - normalizedDir[1] * radialOffset,
          anchorPos[2] - normalizedDir[2] * radialOffset
        ];
      } else {
        // Node is in active mode - use the current interpolated position
        actualCurrentPosition = [...currentPosition];
      }
      
      // Target position should be sphere surface - constellation mode will handle scaling
      const constellationPosition = dreamNode.position;
      setStartPosition(actualCurrentPosition);
      setCurrentPosition(actualCurrentPosition);
      setTargetPosition(constellationPosition);
      setTransitionDuration(duration);
      setTransitionStartTime(globalThis.performance.now());
      setPositionMode('active'); // Use active mode for the transition
      setIsTransitioning(true);
      setTransitionType('constellation');
      setTransitionEasing(easing as 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart');
    },
    interruptAndReturnToScaledPosition: (duration = 1000, worldRotation, easing = 'easeOutCubic') => {
      // Enhanced method: Can interrupt existing animation to return to scaled constellation position
      
      // Calculate target dynamically scaled position for this node
      const anchorPosition = dreamNode.position;
      
      // Transform anchor position to world space using provided rotation (similar to useFrame logic)
      const worldAnchorPosition = new Vector3(anchorPosition[0], anchorPosition[1], anchorPosition[2]);
      if (worldRotation) {
        // Apply the sphere's world rotation to get the actual world position
        worldAnchorPosition.applyQuaternion(worldRotation);
      }
      
      // Calculate what the radial offset should be using dynamic scaling
      const { radialOffset: targetRadialOffset } = calculateDynamicScaling(
        worldAnchorPosition,
        DEFAULT_SCALING_CONFIG
      );
      
      // Calculate target scaled position
      const direction = [-anchorPosition[0], -anchorPosition[1], -anchorPosition[2]];
      const dirLength = Math.sqrt(direction[0]**2 + direction[1]**2 + direction[2]**2);
      const normalizedDir = [direction[0]/dirLength, direction[1]/dirLength, direction[2]/dirLength];
      
      const targetScaledPosition: [number, number, number] = [
        anchorPosition[0] - normalizedDir[0] * targetRadialOffset,
        anchorPosition[1] - normalizedDir[1] * targetRadialOffset,
        anchorPosition[2] - normalizedDir[2] * targetRadialOffset
      ];
      
      // Get actual current position (including mid-flight positions)
      let actualCurrentPosition: [number, number, number];
      if (positionMode === 'constellation') {
        // Calculate current visual position with radial offset
        actualCurrentPosition = [
          anchorPosition[0] - normalizedDir[0] * radialOffset,
          anchorPosition[1] - normalizedDir[1] * radialOffset,
          anchorPosition[2] - normalizedDir[2] * radialOffset
        ];
      } else {
        // Node is in active mode - use the current interpolated position
        actualCurrentPosition = [...currentPosition];
      }
      
      // Animate to target scaled position (interrupts existing animation smoothly)
      setStartPosition(actualCurrentPosition);
      setCurrentPosition(actualCurrentPosition);
      setTargetPosition(targetScaledPosition);
      setTransitionDuration(duration);
      setTransitionStartTime(globalThis.performance.now());
      setPositionMode('active'); // Use active mode for the transition
      setIsTransitioning(true);
      setTransitionType('scaled');
      setTransitionEasing(easing as 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart');
      
      // Set the target radial offset for when we switch back to constellation mode
      globalThis.setTimeout(() => {
        setRadialOffset(targetRadialOffset);
      }, duration - 100); // Set slightly before transition completes
    },
    setActiveState: (active: boolean) => {
      if (active) {
        setPositionMode('active');
        setCurrentPosition([...currentPosition]); // Preserve current position
      } else {
        setPositionMode('constellation');
        // Reset to original position state
        setCurrentPosition(dreamNode.position);
      }
    },
    getCurrentPosition: () => currentPosition,
    isMoving: () => isTransitioning
  }), [currentPosition, isTransitioning, dreamNode.position, positionMode, radialOffset, transitionEasing]);
  
  // Dual-mode position calculation with counter-rotation
  useFrame((_state, _delta) => {
    if (positionMode === 'constellation' && enableDynamicScaling && groupRef.current) {
      // CONSTELLATION MODE: Continuous radial offset calculation (existing behavior)
      // Get world position of the anchor (includes rotation from parent group)
      const worldPosition = new Vector3();
      groupRef.current.getWorldPosition(worldPosition);
      
      // But we need to get the world position of the ANCHOR, not the current final position
      // So we need to calculate where the anchor would be in world space
      const anchorGroup = groupRef.current.parent; // Get the rotatable group
      const anchorVector = new Vector3(anchorPosition[0], anchorPosition[1], anchorPosition[2]);
      if (anchorGroup) {
        anchorGroup.localToWorld(anchorVector);
      }
      
      // Calculate dynamic scaling based on anchor's world position
      const { radialOffset: newRadialOffset } = calculateDynamicScaling(
        anchorVector,
        DEFAULT_SCALING_CONFIG
      );
      
      // Update state if changed
      if (radialOffset !== newRadialOffset) {
        setRadialOffset(newRadialOffset);
      }
    } else if (positionMode === 'active' && isTransitioning) {
      // ACTIVE MODE: Discrete position interpolation
      const elapsed = globalThis.performance.now() - transitionStartTime;
      const progress = Math.min(elapsed / transitionDuration, 1);
      
      // Apply selected easing function
      let easedProgress: number;
      switch (transitionEasing) {
        case 'easeInQuart':
          // Strong ease-in for nodes flying OUT to sphere
          easedProgress = Math.pow(progress, 4);
          break;
        case 'easeOutQuart':
          // Strong ease-out for nodes flying IN from sphere
          easedProgress = 1 - Math.pow(1 - progress, 4);
          break;
        case 'easeOutCubic':
        default:
          // Default easing for other transitions
          easedProgress = 1 - Math.pow(1 - progress, 3);
          break;
      }
      
      // Linear interpolation from start to target position
      const newPosition: [number, number, number] = [
        startPosition[0] + (targetPosition[0] - startPosition[0]) * easedProgress,
        startPosition[1] + (targetPosition[1] - startPosition[1]) * easedProgress,
        startPosition[2] + (targetPosition[2] - startPosition[2]) * easedProgress
      ];
      
      setCurrentPosition(newPosition);
      
      // Check if transition is complete
      if (progress >= 1) {
        setIsTransitioning(false);
        setCurrentPosition(targetPosition); // Ensure exact target position
        
        // Handle transition completion based on type
        if (transitionType === 'liminal') {
          // Liminal web transitions: STAY in active mode at target position
          // Don't change positionMode - stay active!
        } else if (transitionType === 'constellation') {
          // Constellation return: Switch back to constellation mode
          setPositionMode('constellation');
          setRadialOffset(0); // Reset radial offset for clean sphere positioning
        } else if (transitionType === 'scaled') {
          // Scaled position return: Switch back to constellation mode
          setPositionMode('constellation');
          // radialOffset was already set during the animation
        }
      }
    }
  });

  // Get consistent colors from shared styles
  const nodeColors = getNodeColors(dreamNode.type);
  
  // Get git visual state and styling
  const gitState = getGitVisualState(dreamNode.gitStatus);
  const gitStyle = getGitStateStyle(gitState);
  
  // Base size for 3D scaling - will scale with distance due to distanceFactor
  const nodeSize = dreamNodeStyles.dimensions.nodeSizeThreeD;
  const borderWidth = dreamNodeStyles.dimensions.borderWidth; // Use shared border width
  
  // Calculate visual component position with radial offset
  // Anchor point stays at dreamNode.position, visual component moves radially toward camera
  const anchorPosition = dreamNode.position;
  
  // Calculate normalized direction toward origin (radially inward)
  const normalizedDirection = useMemo(() => {
    const direction = [
      -anchorPosition[0], // Direction toward origin (radially inward)
      -anchorPosition[1],
      -anchorPosition[2]
    ];
    const directionLength = Math.sqrt(direction[0]**2 + direction[1]**2 + direction[2]**2);
    return [
      direction[0] / directionLength,
      direction[1] / directionLength,
      direction[2] / directionLength
    ];
  }, [anchorPosition]);
  
  // Calculate final position based on mode
  // CRITICAL: Don't memoize this - we need it to update every render when currentPosition changes
  const finalPosition: [number, number, number] = positionMode === 'constellation'
    ? [
        anchorPosition[0] - normalizedDirection[0] * radialOffset,
        anchorPosition[1] - normalizedDirection[1] * radialOffset,
        anchorPosition[2] - normalizedDirection[2] * radialOffset
      ]
    : currentPosition;
    
  // Removed excessive dynamic scaling logging for performance
  
  // Access camera for billboard rotation
  const { camera } = useThree();
  
  // Handle billboard rotation and flip animation updates
  useFrame(() => {
    // Make the group face the camera (billboard behavior)
    if (groupRef.current && camera) {
      groupRef.current.lookAt(camera.position);
    }
    
    // Handle flip animation  
    if (!isFlipping) return;
    
    const targetRotation = nodeFlipState?.flipDirection === 'front-to-back' ? 0 : Math.PI;
    const animationDuration = 600; // ms
    const elapsed = globalThis.performance.now() - (nodeFlipState?.animationStartTime || 0);
    const progress = Math.min(elapsed / animationDuration, 1);
    
    // Ease-in-out timing function
    const easedProgress = progress < 0.5 
      ? 2 * progress * progress 
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    
    const newRotation = nodeFlipState?.flipDirection === 'front-to-back' 
      ? Math.PI - (easedProgress * Math.PI)  // From Math.PI (front) to 0 (back)
      : easedProgress * Math.PI;             // From 0 (back) to Math.PI (front)
    
    setFlipRotation(newRotation);
    
    // Debug logging for flip animation
    console.log(`🔄 [Flip Animation] Node: ${dreamNode.name}, Progress: ${progress.toFixed(2)}, Rotation: ${(newRotation * 180 / Math.PI).toFixed(1)}°`);
    
    if (progress >= 1) {
      console.log(`✅ [Flip Animation] Completed for ${dreamNode.name} at ${(targetRotation * 180 / Math.PI).toFixed(1)}°`);
      completeFlipAnimation(dreamNode.id);
      setFlipRotation(targetRotation);
    }
  });
  
  // Using sprite mode for automatic billboarding - no manual rotation needed
  
  // Debug logging removed for cleaner console
  
  // Wrap in group at final position for world position calculations
  // Apply hover scaling to the entire group so both visual and hit detection scale together
  return (
    <group 
      ref={groupRef} 
      position={finalPosition}
    >
      {/* Html wrapper for 3D flip animation - no sprite to allow 3D transforms */}
      <Html
        center
        transform
        distanceFactor={10}
        style={{
          pointerEvents: isDragging ? 'none' : 'auto',
          userSelect: 'none'
        }}
      >
        {/* Rotatable container for flip animation with 3D transforms */}
        <div
          style={{
            transform: `rotateY(${flipRotation}rad) scaleX(-1)`,
            transformStyle: 'preserve-3d',
            transition: 'transform 0.6s ease-in-out',
            width: `${nodeSize}px`,
            height: `${nodeSize}px`,
            position: 'relative'
          }}
        >
          {/* Front side (DreamTalk) */}
          <div
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              borderRadius: dreamNodeStyles.dimensions.borderRadius,
              border: `${borderWidth}px ${gitStyle.borderStyle} ${nodeColors.border}`,
              background: nodeColors.fill,
              overflow: 'hidden',
              cursor: 'pointer !important',
              transition: `${dreamNodeStyles.transitions.default}, ${dreamNodeStyles.transitions.gitState}`,
              transform: isHovered ? `scale(${dreamNodeStyles.states.hover.scale}) translateZ(1px)` : 'scale(1) translateZ(1px)',
              animation: gitStyle.animation,
              backfaceVisibility: 'hidden',
              boxShadow: (() => {
                // Priority 1: Git status glow (always highest priority)
                if (gitStyle.glowIntensity > 0) {
                  return getGitGlow(gitState, gitStyle.glowIntensity);
                }
                
                // Priority 2: Edit mode relationship glow
                if (isEditModeActive && isPendingRelationship) {
                  return getEditModeGlow(25); // Strong gold glow for relationships
                }
                
                // Priority 3: Hover glow (fallback)
                return isHovered ? getNodeGlow(dreamNode.type, dreamNodeStyles.states.hover.glowIntensity) : 'none';
              })()
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
          >
        {/* DreamTalk Media Container */}
        {dreamNode.dreamTalkMedia[0] && (
          <div style={getMediaContainerStyle()}>
            <MediaRenderer media={dreamNode.dreamTalkMedia[0]} />
            {/* Fade-to-black overlay */}
            <div style={getMediaOverlayStyle()} />
            
            {/* Hover overlay with name */}
            {isHovered && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  background: 'rgba(0, 0, 0, 0.7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: isHovered ? 1 : 0,
                  transition: 'opacity 0.2s ease-in-out',
                  pointerEvents: 'none',
                  zIndex: 10
                }}
              >
                <div
                  style={{
                    color: dreamNodeStyles.colors.text.primary,
                    fontFamily: dreamNodeStyles.typography.fontFamily,
                    fontSize: `${Math.max(12, nodeSize * 0.08)}px`,
                    textAlign: 'center',
                    padding: '8px'
                  }}
                >
                  {dreamNode.name}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state text - when no media */}
        {!dreamNode.dreamTalkMedia[0] && (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: dreamNodeStyles.colors.text.primary,
              fontFamily: dreamNodeStyles.typography.fontFamily,
              fontSize: `${Math.max(12, nodeSize * 0.08)}px`,
              textAlign: 'center',
              padding: '8px'
            }}
          >
            {dreamNode.name}
          </div>
        )}


        {/* Node label */}
        <div
          style={{
            position: 'absolute',
            bottom: `-${nodeSize * 0.25}px`,
            left: '50%',
            transform: 'translateX(-50%)',
            color: dreamNodeStyles.colors.text.primary,
            fontFamily: dreamNodeStyles.typography.fontFamily,
            fontSize: `${Math.max(12, nodeSize * 0.1)}px`,
            textAlign: 'center',
            background: 'rgba(0, 0, 0, 0.8)',
            padding: '4px 8px',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none'
          }}
        >
          {dreamNode.name}
        </div>
        
        {/* Flip button (bottom-center, only when hovering and has DreamSong) */}
        {shouldShowFlipButton && (
          <div
            style={{
              position: 'absolute',
              bottom: '8px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '84px',
              height: '84px',
              borderRadius: '12px',
              background: 'rgba(0, 0, 0, 0.1)',
              border: 'none',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer !important',
              fontSize: '12px',
              color: '#fff',
              boxShadow: '0 2px 12px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
              filter: 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.3))',
              transition: 'all 0.2s ease',
              zIndex: 20,
              pointerEvents: 'auto'
            }}
            onClick={(e) => {
              e.stopPropagation(); // Prevent event from bubbling to node
              handleFlipClick(e);
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.transform = 'translateX(-50%) scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0, 0, 0, 0.1)';
              e.currentTarget.style.transform = 'translateX(-50%) scale(1)';
            }}
            ref={(el) => {
              if (el) {
                // Clear existing content and add Obsidian icon
                el.innerHTML = '';
                setIcon(el, 'lucide-flip-horizontal');
                // Scale icon for larger button
                const iconElement = el.querySelector('.lucide-flip-horizontal');
                if (iconElement) {
                  (iconElement as HTMLElement).style.width = '36px';
                  (iconElement as HTMLElement).style.height = '36px';
                }
              }
            }}
          >
          </div>
        )}
          </div>

          {/* Back side (DreamSong) - rotated 180 degrees with Z offset */}
          <div
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              borderRadius: dreamNodeStyles.dimensions.borderRadius,
              border: `${borderWidth}px ${gitStyle.borderStyle} ${nodeColors.border}`,
              background: nodeColors.fill,
              overflow: 'hidden',
              cursor: 'pointer !important',
              transition: `${dreamNodeStyles.transitions.default}, ${dreamNodeStyles.transitions.gitState}`,
              transform: `rotateY(180deg) translateZ(-2px) ${isHovered ? `scale(${dreamNodeStyles.states.hover.scale})` : 'scale(1)'}`,
              animation: gitStyle.animation,
              backfaceVisibility: 'hidden',
              boxShadow: (() => {
                // Priority 1: Git status glow (always highest priority)
                if (gitStyle.glowIntensity > 0) {
                  return getGitGlow(gitState, gitStyle.glowIntensity);
                }
                
                // Priority 2: Edit mode relationship glow
                if (isEditModeActive && isPendingRelationship) {
                  return getEditModeGlow(25); // Strong gold glow for relationships
                }
                
                // Priority 3: Hover glow (fallback)
                return isHovered ? getNodeGlow(dreamNode.type, dreamNodeStyles.states.hover.glowIntensity) : 'none';
              })()
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
          >
            {/* DreamSong content */}
            {dreamSongData ? (
              <DreamSong 
                dreamSongData={dreamSongData}
                className="flip-enter"
                maxHeight={`${nodeSize}px`}
              />
            ) : isLoadingDreamSong ? (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: dreamNodeStyles.colors.text.primary
                }}
              >
                Loading DreamSong...
              </div>
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: dreamNodeStyles.colors.text.primary
                }}
              >
                No DreamSong available
              </div>
            )}

            {/* Flip button (bottom-center, on back side) */}
            {shouldShowFlipButton && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '8px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '84px',
                  height: '84px',
                  borderRadius: '12px',
                  background: 'rgba(0, 0, 0, 0.1)',
                  border: 'none',
                  backdropFilter: 'blur(4px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer !important',
                  fontSize: '12px',
                  color: '#fff',
                  boxShadow: '0 2px 12px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                  filter: 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.3))',
                  transition: 'all 0.2s ease',
                  zIndex: 20,
              pointerEvents: 'auto'
                }}
                onClick={(e) => {
                  e.stopPropagation(); // Prevent event from bubbling to node
                  handleFlipClick(e);
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                  e.currentTarget.style.transform = 'translateX(-50%) scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 0, 0, 0.1)';
                  e.currentTarget.style.transform = 'translateX(-50%) scale(1)';
                }}
                ref={(el) => {
                  if (el) {
                    // Clear existing content and add Obsidian icon
                    el.innerHTML = '';
                    setIcon(el, 'lucide-flip-horizontal');
                    // Scale icon for larger button
                    const iconElement = el.querySelector('.lucide-flip-horizontal');
                    if (iconElement) {
                      (iconElement as HTMLElement).style.width = '36px';
                      (iconElement as HTMLElement).style.height = '36px';
                    }
                  }
                }}
              >
              </div>
            )}
          </div>
        </div>
      </Html>
    
    {/* Invisible hit detection sphere - travels with visual node as unified object */}
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

/**
 * Renders different types of media in the DreamTalk circle
 */
function MediaRenderer({ media }: { media: MediaFile }) {
  const mediaStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    borderRadius: '50%'
  };

  if (media.type.startsWith('image/')) {
    return (
      <img 
        src={media.data} 
        alt="DreamTalk symbol"
        style={mediaStyle}
        draggable={false}
      />
    );
  }

  if (media.type.startsWith('video/')) {
    return (
      <video 
        src={media.data}
        style={mediaStyle}
        muted
        loop
        autoPlay
        playsInline
      />
    );
  }

  if (media.type.startsWith('audio/')) {
    return (
      <div
        style={{
          ...mediaStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.8)'
        }}
      >
        <audio 
          controls 
          src={media.data}
          style={{ 
            width: '90%', 
            maxWidth: '80px',
            filter: 'invert(1)'
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        ...mediaStyle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#FFFFFF',
        fontSize: '10px',
        background: 'rgba(0, 0, 0, 0.8)'
      }}
    >
      {media.type}
    </div>
  );
}
