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
  const [flipRotation, setFlipRotation] = useState(0);
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
  
  // Add flip rotation to transition system for unified animations
  const [targetFlipRotation, setTargetFlipRotation] = useState(0);
  const [startFlipRotation, setStartFlipRotation] = useState(0);
  const [shouldAnimateFlip, setShouldAnimateFlip] = useState(false);
  const [flipAnimationStartTime, setFlipAnimationStartTime] = useState(0);
  const [flipAnimationDuration, setFlipAnimationDuration] = useState(500); // Faster than position movement
  
  // No longer need to track flip state - we access live store state directly
  
  // Check global drag state
  const isDragging = useInterBrainStore(state => state.isDragging);
  
  // Flip state management
  const flipState = useInterBrainStore(state => state.flipState);
  const setFlippedNode = useInterBrainStore(state => state.setFlippedNode);
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
  const isFlipping = nodeFlipState?.isFlipping || false;
  
  // Ensure initial state shows front side
  useEffect(() => {
    if (!nodeFlipState) {
      setFlipRotation(0);
    }
  }, [nodeFlipState]);
  
  // No longer need tracking - using live store state in imperative handles
  
  // Determine if flip button should be visible
  const shouldShowFlipButton = useMemo(() => {
    const result = spatialLayout === 'liminal-web' && 
                   selectedNode?.id === dreamNode.id && 
                   isHovered &&
                   hasDreamSong &&
                   dreamSongHasContent && // Only show if canvas has actual content
                   !isDragging;
    
    return result;
  }, [spatialLayout, selectedNode, dreamNode.id, isHovered, hasDreamSong, dreamSongHasContent, isDragging]);

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
                   hasDreamSong && // DreamSong canvas exists
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
  
  // Load DreamSong data when node is selected (preload for seamless flip UX)
  useEffect(() => {
    const loadDreamSongDataWithCache = async () => {
      const isSelected = selectedNode?.id === dreamNode.id;
      if (!isSelected || !hasDreamSong || !vaultService || !canvasParserService) {
        return;
      }
      
      setIsLoadingDreamSong(true);
      
      try {
        const dreamSongParser = new DreamSongParserService(vaultService, canvasParserService);
        const canvasPath = `${dreamNode.repoPath}/DreamSong.canvas`;
        const store = useInterBrainStore.getState();
        
        // Generate structure hash for cache invalidation
        const structureHash = await dreamSongParser.generateStructureHash(canvasPath);
        
        if (!structureHash) {
          console.warn(`Could not generate structure hash for ${canvasPath}`);
          setIsLoadingDreamSong(false);
          return;
        }
        
        // Check cache first (L2 cache in Zustand)
        const cachedEntry = store.getCachedDreamSong(dreamNode.id, structureHash);
        
        if (cachedEntry) {
          console.log(`🚀 DreamSong cache HIT for ${dreamNode.name} (${structureHash})`);
          setDreamSongData(cachedEntry.data);
          
          // Also store in selectedNodeDreamSongData for full-screen consistency
          if (store.selectedNode?.id === dreamNode.id) {
            store.setSelectedNodeDreamSongData(cachedEntry.data);
          }
          
          setIsLoadingDreamSong(false);
          return;
        }
        
        // Cache miss - need to parse
        console.log(`📝 DreamSong cache MISS for ${dreamNode.name} (${structureHash}) - parsing...`);
        const result = await dreamSongParser.parseDreamSong(canvasPath, dreamNode.repoPath);
        
        if (result.success && result.data) {
          setDreamSongData(result.data);
          
          // Store in cache for future use
          store.setCachedDreamSong(dreamNode.id, structureHash, result.data);
          
          // Store in selectedNodeDreamSongData for full-screen (only for selected node)
          if (store.selectedNode?.id === dreamNode.id) {
            store.setSelectedNodeDreamSongData(result.data);
          }
          
          console.log(`✅ DreamSong parsed and cached for ${dreamNode.name}`);
        } else {
          console.warn(`Failed to parse DreamSong: ${result.error?.message}`);
          // Create empty DreamSong data for graceful handling
          const emptyData = {
            canvasPath: `${dreamNode.repoPath}/DreamSong.canvas`,
            dreamNodePath: dreamNode.repoPath,
            hasContent: false,
            totalBlocks: 0,
            blocks: [],
            lastParsed: Date.now()
          };
          setDreamSongData(emptyData);
          
          // Cache empty data to prevent repeated parsing of broken canvas
          store.setCachedDreamSong(dreamNode.id, structureHash, emptyData);
          
          // Store empty data for full-screen (only for selected node)
          if (store.selectedNode?.id === dreamNode.id) {
            store.setSelectedNodeDreamSongData(emptyData);
          }
        }
      } catch (error) {
        console.error(`Error loading DreamSong for ${dreamNode.id}:`, error);
        // Set empty DreamSong data for graceful error handling
        const emptyData = {
          canvasPath: `${dreamNode.repoPath}/DreamSong.canvas`,
          dreamNodePath: dreamNode.repoPath,
          hasContent: false,
          totalBlocks: 0,
          blocks: [],
          lastParsed: Date.now()
        };
        setDreamSongData(emptyData);
        
        // Store empty data for selected node
        const store = useInterBrainStore.getState();
        if (store.selectedNode?.id === dreamNode.id) {
          store.setSelectedNodeDreamSongData(emptyData);
        }
      } finally {
        setIsLoadingDreamSong(false);
      }
    };
    
    loadDreamSongDataWithCache();
  }, [selectedNode?.id, hasDreamSong, dreamNode.id, dreamNode.repoPath, vaultService, canvasParserService]);
  
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
    
    console.log('🎯 Flip button clicked!', { nodeId: dreamNode.id, nodeName: dreamNode.name });
    
    try {
      const { serviceManager } = await import('../services/service-manager');
      console.log('🎯 About to execute flip-selected-dreamnode command');
      serviceManager.executeCommand('flip-selected-dreamnode');
    } catch (error) {
      console.error('Failed to execute flip command:', error);
    }
  }, [isDragging, isFlipping, dreamNode.id, dreamNode.name]);

  const handleDreamTalkFullScreen = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDragging) return;
    
    console.log('🎯 DreamTalk fullscreen button clicked!', { nodeId: dreamNode.id, nodeName: dreamNode.name });
    
    try {
      const { serviceManager } = await import('../services/service-manager');
      console.log('🎯 About to execute open-dreamtalk-fullscreen command');
      serviceManager.executeCommand('open-dreamtalk-fullscreen');
    } catch (error) {
      console.error('Failed to execute DreamTalk full-screen command:', error);
    }
  }, [isDragging, dreamNode.id, dreamNode.name]);

  const handleDreamSongFullScreen = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDragging) return;
    
    console.log('🎵 DreamSong fullscreen button clicked!', { nodeId: dreamNode.id, nodeName: dreamNode.name });
    
    try {
      const { serviceManager } = await import('../services/service-manager');
      console.log('🎵 About to execute open-dreamsong-fullscreen command');
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
      setFlipAnimationDuration(500); // 500ms - twice as fast as 1000ms position movement
    }
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
      
      // Start flip-back animation alongside position movement
      startFlipBackAnimation();
      
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
    
    // Unified flip-back animation (parallel with position movement, but faster)
    if (shouldAnimateFlip && !isFlipping) {
      const elapsed = globalThis.performance.now() - flipAnimationStartTime;
      const progress = Math.min(elapsed / flipAnimationDuration, 1);
      
      // Use easeOutCubic for smooth flip-back animation
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      
      const newFlipRotation = startFlipRotation + (targetFlipRotation - startFlipRotation) * easedProgress;
      setFlipRotation(newFlipRotation);
      
      if (progress >= 1) {
        setFlipRotation(targetFlipRotation);
        setShouldAnimateFlip(false);
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
        {/* R3F rotating group for true 3D flip animation */}
        <group rotation={[0, flipRotation, 0]}>
          {/* First Html component - original DreamTalk */}
          <Html
            position={[0, 0, 0.01]}
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
                shouldShowFlipButton={shouldShowFlipButton}
                shouldShowFullscreenButton={shouldShowDreamTalkFullscreen}
                nodeSize={nodeSize}
                borderWidth={borderWidth}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onFlipClick={handleFlipClick}
                onFullScreenClick={handleDreamTalkFullScreen}
              />
            </div>
          </Html>

          {/* Second Html component - DreamSong with 3D offset and rotation */}
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
              {/* DreamSong side */}
              <DreamSongSide
                dreamNode={dreamNode}
                isHovered={isHovered}
                isEditModeActive={isEditModeActive}
                isPendingRelationship={isPendingRelationship}
                shouldShowFlipButton={shouldShowFlipButton}
                shouldShowFullscreenButton={shouldShowDreamSongFullscreen}
                nodeSize={nodeSize}
                borderWidth={borderWidth}
                dreamSongData={dreamSongData}
                isLoadingDreamSong={isLoadingDreamSong}
                // Note: DreamSong always rendered, CSS backface-visibility handles optimization
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onFlipClick={handleFlipClick}
                onFullScreenClick={handleDreamSongFullScreen}
              />
            </div>
          </Html>
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