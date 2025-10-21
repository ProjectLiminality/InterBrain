import React, { useState, useRef, useEffect } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';

interface RadialButtonRing3DProps {
  /** Position of the center node around which buttons appear */
  centerNodePosition: [number, number, number];

  /** Number of buttons to display (default: 6) */
  buttonCount?: number;

  /** Callback when a button is clicked */
  onButtonClick?: (buttonIndex: number) => void;
}

/**
 * RadialButtonRing3D - Option-key triggered radial button UI
 *
 * Displays circular buttons in an elegant ring pattern around the selected DreamNode.
 * Uses the same positioning algorithm as Ring 1 in liminal-web mode, scaled down.
 *
 * Design:
 * - Button radius: ~10 units (vs DreamNode ~20 units)
 * - Ring distance: 60 units from center (Ring 1 distance 100 * 0.6)
 * - Ring positioning radius: 24 units (Ring 1 radius 40 * 0.6)
 * - Slide animation: 500ms with easeOutCubic
 */
export const RadialButtonRing3D: React.FC<RadialButtonRing3DProps> = ({
  centerNodePosition,
  buttonCount = 6,
  onButtonClick
}) => {
  // Constants for ring layout (scaled from Ring 1 values)
  const SCALE_FACTOR = 0.6;
  const RING_DISTANCE = 100 * SCALE_FACTOR; // 60 units from camera
  const RING_RADIUS = 40 * SCALE_FACTOR; // 24 units radius
  const BUTTON_RADIUS = 10; // Visual size of button

  // Animation constants
  const SLIDE_DURATION = 500; // 0.5 seconds
  const [isAnimating, setIsAnimating] = useState(true);
  const [animationStartTime, setAnimationStartTime] = useState(Date.now());

  // Button positions state
  const [buttonPositions, setButtonPositions] = useState<[number, number, number][]>([]);
  const [currentPositions, setCurrentPositions] = useState<[number, number, number][]>([]);

  // Calculate target positions using Ring 1 equidistant angle algorithm
  useEffect(() => {
    const positions: [number, number, number][] = [];

    // Start position (behind center node)
    const startZ = centerNodePosition[2]; // Same Z as center node

    // Ring 1 logic with proper rotation (from RingLayout.ts lines 137-155)
    let startAngle = -Math.PI / 2; // Default: start at top (point up)
    if (buttonCount === 6) {
      startAngle = -Math.PI / 2 + Math.PI / 6; // Rotate by 30° (flat edge at top)
    }

    for (let i = 0; i < buttonCount; i++) {
      const angle = (i / buttonCount) * 2 * Math.PI + startAngle;
      const x = centerNodePosition[0] + RING_RADIUS * Math.cos(angle);
      const y = centerNodePosition[1] - RING_RADIUS * Math.sin(angle); // Negate Y for 3D coords
      const z = centerNodePosition[2] - RING_DISTANCE;

      positions.push([x, y, z]);
    }

    setButtonPositions(positions);

    // Initialize current positions at start (behind center node)
    const startPositions: [number, number, number][] = [];
    for (let i = 0; i < buttonCount; i++) {
      startPositions.push([
        centerNodePosition[0],
        centerNodePosition[1],
        startZ
      ]);
    }
    setCurrentPositions(startPositions);

    // Start animation
    setAnimationStartTime(Date.now());
    setIsAnimating(true);
  }, [centerNodePosition, buttonCount]);

  // Easing function (easeOutCubic)
  const easeOutCubic = (t: number): number => {
    return 1 - Math.pow(1 - t, 3);
  };

  // Animation frame loop
  useFrame(() => {
    if (!isAnimating || buttonPositions.length === 0) return;

    const elapsed = Date.now() - animationStartTime;
    const progress = Math.min(elapsed / SLIDE_DURATION, 1.0);
    const easedProgress = easeOutCubic(progress);

    // Interpolate positions
    const newPositions: [number, number, number][] = [];
    for (let i = 0; i < buttonCount; i++) {
      const start = [centerNodePosition[0], centerNodePosition[1], centerNodePosition[2]];
      const target = buttonPositions[i];

      const x = start[0] + (target[0] - start[0]) * easedProgress;
      const y = start[1] + (target[1] - start[1]) * easedProgress;
      const z = start[2] + (target[2] - start[2]) * easedProgress;

      newPositions.push([x, y, z]);
    }

    setCurrentPositions(newPositions);

    if (progress >= 1.0) {
      setIsAnimating(false);
    }
  });

  // Render buttons
  return (
    <group>
      {currentPositions.map((position, index) => (
        <RadialButton
          key={index}
          position={position}
          radius={BUTTON_RADIUS}
          label={String(index + 1)}
          onClick={() => onButtonClick?.(index + 1)}
        />
      ))}
    </group>
  );
};

interface RadialButtonProps {
  position: [number, number, number];
  radius: number;
  label: string;
  onClick?: () => void;
}

/**
 * Individual radial button component
 */
const RadialButton: React.FC<RadialButtonProps> = ({
  position,
  radius,
  label,
  onClick
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const groupRef = useRef<Group>(null);

  // Hover scale effect
  const scale = isHovered ? 1.2 : 1.0;

  return (
    <group ref={groupRef} position={position}>
      <mesh
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        scale={scale}
      >
        <circleGeometry args={[radius, 32]} />
        <meshBasicMaterial
          color={isHovered ? '#ffffff' : '#4a9eff'}
          opacity={0.9}
          transparent
          depthTest={false}
        />
      </mesh>

      {/* Number label */}
      <Html
        center
        distanceFactor={10}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
          color: '#000000',
          fontSize: '14px',
          fontWeight: 'bold',
          textAlign: 'center'
        }}
      >
        {label}
      </Html>
    </group>
  );
};
