import React, { useState, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Billboard } from '@react-three/drei';
import { Group } from 'three';
import { RADIAL_BUTTON_CONFIGS, RadialButtonConfig } from './radial-button-config';
import { serviceManager } from '../../services/service-manager';

interface RadialButtonRing3DProps {
  /** Position of the center node around which buttons appear */
  centerNodePosition: [number, number, number];

  /** Whether the radial UI should be active (visible at ring) or hidden (at center) */
  isActive: boolean;

  /** Callback when exit animation completes (so parent can unmount) */
  onExitComplete?: () => void;
}

/**
 * RadialButtonRing3D - Option-key triggered radial button UI
 *
 * Displays circular buttons in an elegant ring pattern around the selected DreamNode.
 * Uses simple equidistant spacing on a ring in the XY plane.
 *
 * Design:
 * - Button radius: 3 units
 * - Ring radius: 18 units from center
 * - Positioned at Z = -50 (between camera and selected node)
 * - Slide animation: 500ms with easeOutCubic
 */

/**
 * Calculate button positions using equidistant spacing on a ring
 */
function calculateButtonPositions(count: number, radius: number, centerZ: number): [number, number, number][] {
  const positions: [number, number, number][] = [];

  // Equidistant angle calculation (works for any count)
  let startAngle = -Math.PI / 2; // Start at top
  if (count === 6) {
    startAngle = -Math.PI / 2 + Math.PI / 6; // Rotate by 30° for flat edge at top
  }

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 2 * Math.PI + startAngle;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    positions.push([x, y, centerZ]);
  }

  return positions;
}

export const RadialButtonRing3D: React.FC<RadialButtonRing3DProps> = ({
  centerNodePosition: _centerNodePosition,
  isActive,
  onExitComplete
}) => {
  // Simple absolute coordinates - outside rotatable group!
  const CENTER_Z = -51; // Moved 1 unit back to prevent Z-fighting with DreamNode at -50
  const RING_RADIUS = 18;
  const BUTTON_RADIUS = 3;

  // Get button configurations dynamically
  const buttonConfigs = RADIAL_BUTTON_CONFIGS;
  const buttonCount = buttonConfigs.length;

  // Calculate button positions using equidistant spacing
  const buttonPositions = calculateButtonPositions(buttonCount, RING_RADIUS, CENTER_Z);

  // Center position for animation start point
  const centerPosition: [number, number, number] = [0, 0, CENTER_Z];

  // Track how many buttons have completed exit animation
  const [exitedCount, setExitedCount] = useState(0);

  // Reset exit count when re-entering (interruption case)
  useEffect(() => {
    if (isActive) {
      setExitedCount(0);
    }
  }, [isActive]);

  // When all buttons have exited, notify parent
  useEffect(() => {
    if (!isActive && exitedCount === buttonCount) {
      console.log(`🎯 [RadialButtonRing3D] All ${buttonCount} buttons exited - notifying parent`);
      onExitComplete?.();
    }
  }, [exitedCount, buttonCount, isActive, onExitComplete]);

  // Render buttons in a ring
  return (
    <group>
      {buttonPositions.map((position, index) => {
        const config = buttonConfigs[index];
        return (
          <RadialButton
            key={config.id}
            centerPosition={centerPosition}
            ringPosition={position}
            radius={BUTTON_RADIUS}
            config={config}
            isActive={isActive}
            onExitComplete={() => {
              setExitedCount(prev => prev + 1);
            }}
          />
        );
      })}
    </group>
  );
};

interface RadialButtonProps {
  centerPosition: [number, number, number];
  ringPosition: [number, number, number];
  radius: number;
  config: RadialButtonConfig;
  isActive: boolean;
  onExitComplete?: () => void;
}

/**
 * Individual radial button component with bidirectional slide animation
 *
 * Architecture:
 * - Pure HTML element with circular blue border, black fill, white SVG icon
 * - HTML handles all hover/click detection (no THREE.js sphere needed)
 * - Enter animation: centerPosition → ringPosition (500ms, easeOutCubic)
 * - Exit animation: ringPosition → centerPosition (500ms, easeOutCubic)
 */
const RadialButton: React.FC<RadialButtonProps> = ({
  centerPosition,
  ringPosition,
  radius: _radius,
  config,
  isActive,
  onExitComplete
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const groupRef = useRef<Group>(null);

  // Handle button click - execute the mapped command
  const handleClick = () => {
    console.log(`🎯 [RadialButton] Button "${config.label}" clicked - executing command: ${config.commandId}`);
    const app = serviceManager.getApp();
    if (app) {
      (app as any).commands.executeCommandById(config.commandId);
    } else {
      console.error('🎯 [RadialButton] App not available, cannot execute command');
    }
  };

  // Animation state (pattern from DreamNode3D.tsx)
  const [animatedPosition, setAnimatedPosition] = useState<[number, number, number]>(centerPosition);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionStartTime = useRef<number | null>(null);
  const animationStartPos = useRef<[number, number, number]>(centerPosition);
  const animationTargetPos = useRef<[number, number, number]>(ringPosition);
  const ANIMATION_DURATION = 500; // 0.5 seconds
  const hasInitialized = useRef(false);

  // Start enter animation when component mounts
  useEffect(() => {
    animationStartPos.current = centerPosition;
    animationTargetPos.current = ringPosition;
    transitionStartTime.current = globalThis.performance.now();
    setIsTransitioning(true);
    hasInitialized.current = true;
  }, []);

  // Handle isActive changes - supports mid-flight interruption (after mount)
  useEffect(() => {
    if (!hasInitialized.current) return;

    if (!isActive) {
      // Exit animation: interrupt current animation and move to center
      console.log(`🎯 [RadialButton ${label}] Interrupting - moving to center from:`, animatedPosition);
      animationStartPos.current = animatedPosition;
      animationTargetPos.current = centerPosition;
      transitionStartTime.current = globalThis.performance.now();
      setIsTransitioning(true);
    } else {
      // Enter animation: interrupt current animation and move to ring
      console.log(`🎯 [RadialButton ${label}] Interrupting - moving to ring from:`, animatedPosition);
      animationStartPos.current = animatedPosition;
      animationTargetPos.current = ringPosition;
      transitionStartTime.current = globalThis.performance.now();
      setIsTransitioning(true);
    }
  }, [isActive]);

  // Animation frame update (pattern from DreamNode3D.tsx lines 502-563)
  useFrame(() => {
    if (!isTransitioning || transitionStartTime.current === null) return;

    const elapsed = globalThis.performance.now() - transitionStartTime.current;
    const progress = Math.min(elapsed / ANIMATION_DURATION, 1);

    if (progress >= 1) {
      // Animation complete
      setAnimatedPosition(animationTargetPos.current);
      setIsTransitioning(false);

      // If this was an exit animation, notify parent
      if (!isActive) {
        onExitComplete?.();
      }
      return;
    }

    // easeOutCubic: 1 - (1-x)^3 (smooth deceleration)
    const easedProgress = 1 - Math.pow(1 - progress, 3);

    // Linear interpolation from start to target position
    const startPos = animationStartPos.current;
    const targetPos = animationTargetPos.current;
    const newPosition: [number, number, number] = [
      startPos[0] + (targetPos[0] - startPos[0]) * easedProgress,
      startPos[1] + (targetPos[1] - startPos[1]) * easedProgress,
      startPos[2] + (targetPos[2] - startPos[2]) * easedProgress
    ];

    setAnimatedPosition(newPosition);
  });

  return (
    <group ref={groupRef} position={animatedPosition}>
      {/* Billboard - always faces camera (DreamNode pattern) */}
      <Billboard follow={true} lockX={false} lockY={false} lockZ={false}>
        {/* HTML button - handles all interactions */}
        <Html
          center
          transform
          distanceFactor={10}
          position={[0, 0, 0]}
          style={{
            pointerEvents: 'auto',  // Enable HTML interactions
            userSelect: 'none',
            cursor: 'pointer'
          }}
        >
          <div
            onMouseEnter={() => {
              console.log(`🎯 [RadialButton] Button "${config.label}" hovered`);
              setIsHovered(true);
            }}
            onMouseLeave={() => setIsHovered(false)}
            onClick={(e) => {
              e.stopPropagation();
              handleClick();
            }}
            style={{
              width: '270px',  // 50% increase (180px * 1.5)
              height: '270px',
              borderRadius: '50%',
              border: `6px solid ${isHovered ? '#ffffff' : '#4FC3F7'}`,
              background: '#000000',  // Black fill
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              transform: isHovered ? 'scale(1.1)' : 'scale(1)',
              boxShadow: isHovered ? '0 0 20px rgba(79, 195, 247, 0.6)' : 'none',  // Hover glow
              cursor: 'pointer',
              color: '#ffffff'  // Icon color
            }}
          >
            {/* Icon from configuration */}
            <div style={{ width: '162px', height: '162px' }}>
              {config.icon}
            </div>
          </div>
        </Html>
      </Billboard>
    </group>
  );
};
