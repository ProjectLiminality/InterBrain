import React, { useState, useRef, useMemo, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Vector3, Group, Mesh, Quaternion } from 'three';
import { DreamNode, MediaFile } from '../types/dreamnode';
import { calculateDynamicScaling, DEFAULT_SCALING_CONFIG } from '../dreamspace/DynamicViewScaling';
import { useInterBrainStore } from '../store/interbrain-store';
import { dreamNodeStyles, getNodeColors, getNodeGlow, getEditModeGlow, getMediaContainerStyle, getMediaOverlayStyle, getGitVisualState, getGitStateStyle, getGitGlow } from './dreamNodeStyles';
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
  onHitSphereRef
}, ref) => {
  const [isHovered, setIsHovered] = useState(false);
  const [radialOffset, setRadialOffset] = useState(0);
  const groupRef = useRef<Group>(null);
  const hitSphereRef = useRef<Mesh>(null);
  
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
  
  // Subscribe to edit mode state for relationship glow
  const isEditModeActive = useInterBrainStore(state => state.editMode.isActive);
  const isPendingRelationship = useInterBrainStore(state => 
    state.editMode.pendingRelationships.includes(dreamNode.id)
  );

  // Register hit sphere reference with parent component
  useEffect(() => {
    if (onHitSphereRef && hitSphereRef) {
      onHitSphereRef(dreamNode.id, hitSphereRef);
    }
  }, [dreamNode.id, onHitSphereRef]);

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
  
  // Using sprite mode for automatic billboarding - no manual rotation needed
  
  // Debug logging removed for cleaner console
  
  // Wrap in group at final position for world position calculations
  // Apply hover scaling to the entire group so both visual and hit detection scale together
  return (
    <group 
      ref={groupRef} 
      position={finalPosition}
    >
      {/* DreamNode rendering - always visible */}
        <Html
          position={[0, 0, 0]}
          center
          transform  // Enable 3D transformations
          sprite     // Always face camera (billboarding)
          distanceFactor={10}  // Scale based on distance from camera
          style={{
            pointerEvents: isDragging ? 'none' : 'auto', // Disable all mouse events during drag
            userSelect: 'none'
          }}
        >
      <div
        style={{
          width: `${nodeSize}px`,
          height: `${nodeSize}px`,
          borderRadius: dreamNodeStyles.dimensions.borderRadius,
          border: `${borderWidth}px ${gitStyle.borderStyle} ${nodeColors.border}`,
          background: nodeColors.fill,
          overflow: 'hidden',
          position: 'relative',
          cursor: 'pointer',
          transition: `${dreamNodeStyles.transitions.default}, ${dreamNodeStyles.transitions.gitState}`,
          transform: isHovered ? `scale(${dreamNodeStyles.states.hover.scale})` : 'scale(1)',
          animation: gitStyle.animation,
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