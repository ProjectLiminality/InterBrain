import React, { useState, useRef, useMemo, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Html, Billboard } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Vector3, Group, Mesh, Quaternion } from 'three';
import { DreamNode } from '../types/dreamnode';
import { calculateDynamicScaling, DEFAULT_SCALING_CONFIG } from '../dreamspace/DynamicViewScaling';
import { useInterBrainStore } from '../store/interbrain-store';
import { dreamNodeStyles } from './dreamNodeStyles';
import { DreamSongParserService } from '../services/dreamsong-parser-service';
import { CanvasParserService } from '../services/canvas-parser-service';
import { VaultService } from '../services/vault-service';
import { DreamSongData } from '../types/dreamsong';
import { DreamTalkSide } from './DreamTalkSide';
import { DreamSongSide } from './DreamSongSide';
import './dreamNodeAnimations.css';

// Universal Movement API interface
export interface DreamNode3DRef {
  moveToPosition: (targetPosition: [number, number, number], duration?: number, easing?: string) => void;
  returnToConstellation: (duration?: number, easing?: string) => void;
  returnToScaledPosition: (duration?: number, worldRotation?: Quaternion, easing?: string) => void;
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
  vaultService?: VaultService;
  canvasParserService?: CanvasParserService;
}

/**
 * Clean 3D DreamNode component with Billboard → RotatableGroup → [DreamTalk, DreamSong] hierarchy
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
  
  // Flip animation state
  const [flipRotation, setFlipRotation] = useState(Math.PI);
  const [dreamSongData, setDreamSongData] = useState<DreamSongData | null>(null);
  const [hasDreamSong, setHasDreamSong] = useState(false);
  const [, setDreamSongHasContent] = useState(false);
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
  
  // Check global drag state
  const isDragging = useInterBrainStore(state => state.isDragging);
  
  // Flip state management
  const flipState = useInterBrainStore(state => state.flipState);
  const setFlippedNode = useInterBrainStore(state => state.setFlippedNode);
  const startFlipAnimation = useInterBrainStore(state => state.startFlipAnimation);
  const completeFlipAnimation = useInterBrainStore(state => state.completeFlipAnimation);
  const spatialLayout = useInterBrainStore(state => state.spatialLayout);
  const selectedNode = useInterBrainStore(state => state.selectedNode);
  
  // Subscribe to edit mode state
  const isEditModeActive = useInterBrainStore(state => state.editMode.isActive);
  const isPendingRelationship = useInterBrainStore(state => 
    state.editMode.pendingRelationships.includes(dreamNode.id)
  );
  
  // Get current flip state for this node
  const nodeFlipState = flipState.flipStates.get(dreamNode.id);
  const isFlipped = nodeFlipState?.isFlipped || false;
  const isFlipping = nodeFlipState?.isFlipping || false;
  
  // Ensure initial state shows front side
  useEffect(() => {
    if (!nodeFlipState) {
      setFlipRotation(Math.PI);
    }
  }, [nodeFlipState]);
  
  // Determine if flip button should be visible
  const shouldShowFlipButton = useMemo(() => {
    const result = spatialLayout === 'liminal-web' && 
                   selectedNode?.id === dreamNode.id && 
                   isHovered &&
                   hasDreamSong &&
                   !isDragging;
    
    return result;
  }, [spatialLayout, selectedNode, dreamNode.id, isHovered, hasDreamSong, isDragging]);

  // Register hit sphere reference
  useEffect(() => {
    if (onHitSphereRef && hitSphereRef) {
      onHitSphereRef(dreamNode.id, hitSphereRef);
    }
  }, [dreamNode.id, onHitSphereRef]);
  
  // Check for DreamSong canvas file
  useEffect(() => {
    const checkDreamSong = async () => {
      if (!vaultService || !canvasParserService) {
        setHasDreamSong(false);
        setDreamSongHasContent(false);
        return;
      }
      
      const canvasPath = `${dreamNode.repoPath}/DreamSong.canvas`;
      
      try {
        const exists = await vaultService.fileExists(canvasPath);
        setHasDreamSong(exists);
        
        if (exists) {
          const dreamSongParser = new DreamSongParserService(vaultService, canvasParserService);
          const parseResult = await dreamSongParser.parseDreamSong(canvasPath, dreamNode.repoPath);
          
          if (parseResult.success && parseResult.data) {
            setDreamSongHasContent(parseResult.data.hasContent);
          } else {
            setDreamSongHasContent(false);
          }
        } else {
          setDreamSongHasContent(false);
        }
      } catch (error) {
        console.error(`Error checking DreamSong for ${dreamNode.id}:`, error);
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
  
  // Reset flip state when node is no longer selected
  useEffect(() => {
    if (spatialLayout !== 'liminal-web' || selectedNode?.id !== dreamNode.id) {
      if (flipState.flippedNodeId === dreamNode.id) {
        setFlippedNode(null);
        setFlipRotation(Math.PI);
        setDreamSongData(null);
      }
    }
  }, [spatialLayout, selectedNode, dreamNode.id, flipState.flippedNodeId, setFlippedNode]);

  // Handle mouse events
  const handleMouseEnter = () => {
    if (isDragging) return;
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
  
  const handleFlipClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDragging || isFlipping) return;
    
    const direction = isFlipped ? 'back-to-front' : 'front-to-back';
    startFlipAnimation(dreamNode.id, direction);
  }, [isDragging, isFlipping, isFlipped, startFlipAnimation, dreamNode.id]);

  const handleDreamTalkFullScreen = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDragging) return;
    
    try {
      const { serviceManager } = await import('../services/service-manager');
      const leafManager = serviceManager.getService('leafManagerService');
      
      if (leafManager && dreamNode.dreamTalkMedia[0]) {
        await leafManager.openDreamTalkFullScreen(dreamNode, dreamNode.dreamTalkMedia[0]);
      } else {
        console.log('No DreamTalk media available for:', dreamNode.name);
      }
    } catch (error) {
      console.error('Failed to open DreamTalk full-screen:', error);
    }
  }, [isDragging, dreamNode]);

  const handleDreamSongFullScreen = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDragging) return;
    
    try {
      const { serviceManager } = await import('../services/service-manager');
      const leafManager = serviceManager.getService('leafManagerService');
      
      if (leafManager && dreamSongData) {
        await leafManager.openDreamSongFullScreen(dreamNode, dreamSongData);
      } else {
        console.log('No DreamSong data available for:', dreamNode.name);
      }
    } catch (error) {
      console.error('Failed to open DreamSong full-screen:', error);
    }
  }, [isDragging, dreamNode, dreamSongData]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isDragging) return;
    e.stopPropagation();
    onDoubleClick?.(dreamNode);
  };

  // Universal Movement API implementation (keeping all the complex logic)
  useImperativeHandle(ref, () => ({
    moveToPosition: (newTargetPosition, duration = 1000, easing = 'easeOutCubic') => {
      let actualCurrentPosition: [number, number, number];
      
      if (positionMode === 'constellation') {
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
      setCurrentPosition(actualCurrentPosition);
      setTargetPosition(newTargetPosition);
      setTransitionDuration(duration);
      setTransitionStartTime(globalThis.performance.now());
      setPositionMode('active');
      setIsTransitioning(true);
      setTransitionType('liminal');
      setTransitionEasing(easing as 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart');
    },
    returnToConstellation: (duration = 1000, easing = 'easeInQuart') => {
      let actualCurrentPosition: [number, number, number];
      
      if (positionMode === 'constellation') {
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
      
      const constellationPosition = dreamNode.position;
      setStartPosition(actualCurrentPosition);
      setCurrentPosition(actualCurrentPosition);
      setTargetPosition(constellationPosition);
      setTransitionDuration(duration);
      setTransitionStartTime(globalThis.performance.now());
      setPositionMode('active');
      setIsTransitioning(true);
      setTransitionType('constellation');
      setTransitionEasing(easing as 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart');
    },
    returnToScaledPosition: (duration = 1000, worldRotation, easing = 'easeOutCubic') => {
      const anchorPosition = dreamNode.position;
      
      const worldAnchorPosition = new Vector3(anchorPosition[0], anchorPosition[1], anchorPosition[2]);
      if (worldRotation) {
        worldAnchorPosition.applyQuaternion(worldRotation);
      }
      
      const { radialOffset: targetRadialOffset } = calculateDynamicScaling(
        worldAnchorPosition,
        DEFAULT_SCALING_CONFIG
      );
      
      const direction = [-anchorPosition[0], -anchorPosition[1], -anchorPosition[2]];
      const dirLength = Math.sqrt(direction[0]**2 + direction[1]**2 + direction[2]**2);
      const normalizedDir = [direction[0]/dirLength, direction[1]/dirLength, direction[2]/dirLength];
      
      const targetScaledPosition: [number, number, number] = [
        anchorPosition[0] - normalizedDir[0] * targetRadialOffset,
        anchorPosition[1] - normalizedDir[1] * targetRadialOffset,
        anchorPosition[2] - normalizedDir[2] * targetRadialOffset
      ];
      
      let actualCurrentPosition: [number, number, number];
      if (positionMode === 'constellation') {
        actualCurrentPosition = [
          anchorPosition[0] - normalizedDir[0] * radialOffset,
          anchorPosition[1] - normalizedDir[1] * radialOffset,
          anchorPosition[2] - normalizedDir[2] * radialOffset
        ];
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
      setTransitionEasing(easing as 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart');
      
      globalThis.setTimeout(() => {
        setRadialOffset(targetRadialOffset);
      }, duration - 100);
    },
    interruptAndMoveToPosition: (newTargetPosition, duration = 1000, easing = 'easeOutCubic') => {
      let actualCurrentPosition: [number, number, number];
      
      if (positionMode === 'constellation') {
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
      let actualCurrentPosition: [number, number, number];
      
      if (positionMode === 'constellation') {
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
      
      const constellationPosition = dreamNode.position;
      setStartPosition(actualCurrentPosition);
      setCurrentPosition(actualCurrentPosition);
      setTargetPosition(constellationPosition);
      setTransitionDuration(duration);
      setTransitionStartTime(globalThis.performance.now());
      setPositionMode('active');
      setIsTransitioning(true);
      setTransitionType('constellation');
      setTransitionEasing(easing as 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart');
    },
    interruptAndReturnToScaledPosition: (duration = 1000, worldRotation, easing = 'easeOutCubic') => {
      const anchorPosition = dreamNode.position;
      
      const worldAnchorPosition = new Vector3(anchorPosition[0], anchorPosition[1], anchorPosition[2]);
      if (worldRotation) {
        worldAnchorPosition.applyQuaternion(worldRotation);
      }
      
      const { radialOffset: targetRadialOffset } = calculateDynamicScaling(
        worldAnchorPosition,
        DEFAULT_SCALING_CONFIG
      );
      
      const direction = [-anchorPosition[0], -anchorPosition[1], -anchorPosition[2]];
      const dirLength = Math.sqrt(direction[0]**2 + direction[1]**2 + direction[2]**2);
      const normalizedDir = [direction[0]/dirLength, direction[1]/dirLength, direction[2]/dirLength];
      
      const targetScaledPosition: [number, number, number] = [
        anchorPosition[0] - normalizedDir[0] * targetRadialOffset,
        anchorPosition[1] - normalizedDir[1] * targetRadialOffset,
        anchorPosition[2] - normalizedDir[2] * targetRadialOffset
      ];
      
      let actualCurrentPosition: [number, number, number];
      if (positionMode === 'constellation') {
        actualCurrentPosition = [
          anchorPosition[0] - normalizedDir[0] * radialOffset,
          anchorPosition[1] - normalizedDir[1] * radialOffset,
          anchorPosition[2] - normalizedDir[2] * radialOffset
        ];
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
      setTransitionEasing(easing as 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart');
      
      globalThis.setTimeout(() => {
        setRadialOffset(targetRadialOffset);
      }, duration - 100);
    },
    setActiveState: (active: boolean) => {
      if (active) {
        setPositionMode('active');
        setCurrentPosition([...currentPosition]);
      } else {
        setPositionMode('constellation');
        setCurrentPosition(dreamNode.position);
      }
    },
    getCurrentPosition: () => currentPosition,
    isMoving: () => isTransitioning
  }), [currentPosition, isTransitioning, dreamNode.position, positionMode, radialOffset, transitionEasing]);
  
  // Position calculation and animation frame logic
  useFrame((_state, _delta) => {
    // Constellation mode dynamic scaling
    if (positionMode === 'constellation' && enableDynamicScaling && groupRef.current) {
      const worldPosition = new Vector3();
      groupRef.current.getWorldPosition(worldPosition);
      
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
    // Active mode transitions
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
      
      setCurrentPosition(newPosition);
      
      if (progress >= 1) {
        setIsTransitioning(false);
        setCurrentPosition(targetPosition);
        
        if (transitionType === 'liminal') {
          // Stay in active mode
        } else if (transitionType === 'constellation') {
          setPositionMode('constellation');
          setRadialOffset(0);
        } else if (transitionType === 'scaled') {
          setPositionMode('constellation');
        }
      }
    }
    
    // Flip animation updates
    if (isFlipping) {
      const targetRotation = nodeFlipState?.flipDirection === 'front-to-back' ? 0 : Math.PI;
      const animationDuration = 600;
      const elapsed = globalThis.performance.now() - (nodeFlipState?.animationStartTime || 0);
      const progress = Math.min(elapsed / animationDuration, 1);
      
      const easedProgress = progress < 0.5 
        ? 2 * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      
      const newRotation = nodeFlipState?.flipDirection === 'front-to-back' 
        ? Math.PI - (easedProgress * Math.PI)
        : easedProgress * Math.PI;
      
      setFlipRotation(newRotation);
      
      if (progress >= 1) {
        completeFlipAnimation(dreamNode.id);
        setFlipRotation(targetRotation);
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

  // Clean Billboard → RotatableGroup → [DreamTalk, DreamSong] hierarchy
  return (
    <group 
      ref={groupRef} 
      position={finalPosition}
    >
      {/* Billboard component - always faces camera */}
      <Billboard follow={true} lockX={false} lockY={false} lockZ={false}>
        {/* Html wrapper for UI components */}
        <Html
          center
          transform
          distanceFactor={10}
          style={{
            pointerEvents: isDragging ? 'none' : 'auto',
            userSelect: 'none'
          }}
        >
          {/* Rotatable group for flip animation - child of billboard */}
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
            {/* Front side - DreamTalk */}
            <DreamTalkSide
              dreamNode={dreamNode}
              isHovered={isHovered}
              isEditModeActive={isEditModeActive}
              isPendingRelationship={isPendingRelationship}
              shouldShowFlipButton={shouldShowFlipButton}
              nodeSize={nodeSize}
              borderWidth={borderWidth}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              onClick={handleClick}
              onDoubleClick={handleDoubleClick}
              onFlipClick={handleFlipClick}
              onFullScreenClick={handleDreamTalkFullScreen}
            />

            {/* Back side - DreamSong */}
            <DreamSongSide
              dreamNode={dreamNode}
              isHovered={isHovered}
              isEditModeActive={isEditModeActive}
              isPendingRelationship={isPendingRelationship}
              shouldShowFlipButton={shouldShowFlipButton}
              nodeSize={nodeSize}
              borderWidth={borderWidth}
              dreamSongData={dreamSongData}
              isLoadingDreamSong={isLoadingDreamSong}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              onClick={handleClick}
              onDoubleClick={handleDoubleClick}
              onFlipClick={handleFlipClick}
              onFullScreenClick={handleDreamSongFullScreen}
            />
          </div>
        </Html>
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