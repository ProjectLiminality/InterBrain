import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useInterBrainStore } from '../../core/store/interbrain-store';

/**
 * Props for position-based GoldenDot (direct coordinates)
 */
interface PositionBasedProps {
  /** Starting position in 3D space */
  from: [number, number, number];
  /** Ending position in 3D space */
  to: [number, number, number];
  fromNodeId?: never;
  toNodeId?: never;
}

/**
 * Props for node-based GoldenDot (resolves positions from store)
 */
interface NodeBasedProps {
  /** Starting node ID - position resolved from store */
  fromNodeId: string;
  /** Ending node ID - position resolved from store */
  toNodeId: string;
  from?: never;
  to?: never;
}

interface CommonProps {
  /** Optional control points for Bezier curve (if omitted, creates smooth arc) */
  controlPoints?: [number, number, number][];
  /** Duration of movement in seconds */
  duration?: number;
  /** Size of the glow in pixels */
  size?: number;
  /** Callback when animation completes (dot reaches destination) */
  onComplete?: () => void;
  /** Whether the dot is visible */
  visible?: boolean;
  /** Easing function: 'linear' | 'easeInOut' | 'easeIn' | 'easeOut' */
  easing?: 'linear' | 'easeInOut' | 'easeIn' | 'easeOut';
}

type GoldenDotProps = CommonProps & (PositionBasedProps | NodeBasedProps);

/**
 * Cubic Bezier interpolation for smooth 3D movement
 */
function cubicBezier(
  t: number,
  p0: [number, number, number],
  p1: [number, number, number],
  p2: [number, number, number],
  p3: [number, number, number]
): [number, number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;

  return [
    mt3 * p0[0] + 3 * mt2 * t * p1[0] + 3 * mt * t2 * p2[0] + t3 * p3[0],
    mt3 * p0[1] + 3 * mt2 * t * p1[1] + 3 * mt * t2 * p2[1] + t3 * p3[1],
    mt3 * p0[2] + 3 * mt2 * t * p1[2] + 3 * mt * t2 * p2[2] + t3 * p3[2],
  ];
}

/**
 * Generate default control points for a smooth arc between two points
 */
function generateDefaultControlPoints(
  from: [number, number, number],
  to: [number, number, number]
): [[number, number, number], [number, number, number]] {
  // Calculate distance for arc height
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Create gentle arc by offsetting control points perpendicular to the line
  // Use a combination of up vector and perpendicular for natural arc
  const arcHeight = distance * 0.2;

  // Control point 1: 1/3 along path, lifted
  const cp1: [number, number, number] = [
    from[0] + dx * 0.33,
    from[1] + dy * 0.33 + arcHeight,
    from[2] + dz * 0.33,
  ];

  // Control point 2: 2/3 along path, lifted
  const cp2: [number, number, number] = [
    from[0] + dx * 0.66,
    from[1] + dy * 0.66 + arcHeight,
    from[2] + dz * 0.66,
  ];

  return [cp1, cp2];
}

/**
 * Easing functions for animation timing
 */
const easingFunctions = {
  linear: (t: number) => t,
  easeIn: (t: number) => t * t * t,
  easeOut: (t: number) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
};

/**
 * GoldenDot - Attention-steering glow that travels through 3D space
 *
 * Features:
 * - Smooth cubic Bezier movement
 * - Billboard-style always-facing-camera (sprite mode)
 * - Configurable easing and duration
 * - Vanishes at destination (triggers onComplete for glow handoff)
 *
 * Sovereign asset for tutorial feature - decoupled from ManimText
 */
/**
 * Hook to get node position from store by node ID
 */
function useNodePosition(nodeId: string | undefined): [number, number, number] | null {
  return useInterBrainStore((state) => {
    if (!nodeId) return null;
    const nodeData = state.dreamNodes.get(nodeId);
    return nodeData?.node.position ?? null;
  });
}

export const GoldenDot: React.FC<GoldenDotProps> = (props) => {
  const {
    controlPoints,
    duration = 2,
    size = 160,
    onComplete,
    visible = true,
    easing = 'easeInOut',
  } = props;

  // Resolve positions - either from props or from store via node IDs
  const fromNodePosition = useNodePosition('fromNodeId' in props ? props.fromNodeId : undefined);
  const toNodePosition = useNodePosition('toNodeId' in props ? props.toNodeId : undefined);

  // Determine actual from/to positions
  const from: [number, number, number] = useMemo(() => {
    if ('from' in props && props.from) return props.from;
    if (fromNodePosition) return fromNodePosition;
    return [0, 0, 0]; // Fallback
  }, [props, fromNodePosition]);

  const to: [number, number, number] = useMemo(() => {
    if ('to' in props && props.to) return props.to;
    if (toNodePosition) return toNodePosition;
    return [0, 0, 0]; // Fallback
  }, [props, toNodePosition]);

  const [position, setPosition] = useState<[number, number, number]>(from);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isVisible, setIsVisible] = useState(visible);
  const startTimeRef = useRef<number | null>(null);
  const hasCompletedRef = useRef(false);

  // Compute control points (use provided or generate defaults)
  const [cp1, cp2] = controlPoints?.length === 2
    ? [controlPoints[0], controlPoints[1]]
    : generateDefaultControlPoints(from, to);

  // Reset animation when from/to changes
  useEffect(() => {
    // Don't start animation if positions aren't resolved yet
    if (from[0] === 0 && from[1] === 0 && from[2] === 0 &&
        to[0] === 0 && to[1] === 0 && to[2] === 0) {
      return;
    }
    setPosition(from);
    setIsAnimating(true);
    setIsVisible(visible);
    startTimeRef.current = null;
    hasCompletedRef.current = false;
  }, [from, to, visible]);

  // Animation loop using R3F's useFrame
  useFrame((_, delta) => {
    if (!isAnimating || !isVisible) return;

    // Initialize start time on first frame
    if (startTimeRef.current === null) {
      startTimeRef.current = 0;
    }

    startTimeRef.current += delta;
    const elapsed = startTimeRef.current;
    const rawT = Math.min(elapsed / duration, 1);

    // Apply easing
    const easedT = easingFunctions[easing](rawT);

    // Calculate position along Bezier curve
    const newPosition = cubicBezier(easedT, from, cp1, cp2, to);
    setPosition(newPosition);

    // Check for completion
    if (rawT >= 1 && !hasCompletedRef.current) {
      hasCompletedRef.current = true;
      setIsAnimating(false);
      setIsVisible(false); // Vanish at destination
      onComplete?.();
    }
  });

  if (!isVisible) return null;

  return (
    <Html
      position={position}
      transform
      sprite // Always face camera - same as Star3D
      style={{
        pointerEvents: 'none',
        userSelect: 'none',
        overflow: 'visible',
        maxWidth: 'none',
        maxHeight: 'none',
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          // Pure CSS radial gradient glow - golden center fading to transparent
          background: `radial-gradient(circle,
            rgba(255, 255, 255, 1) 0%,
            rgba(255, 240, 180, 0.8) 5%,
            rgba(255, 215, 100, 0.5) 12%,
            rgba(255, 190, 60, 0.25) 22%,
            rgba(255, 170, 40, 0.1) 35%,
            rgba(255, 150, 20, 0.03) 55%,
            rgba(255, 140, 10, 0) 80%
          )`,
        }}
      />
    </Html>
  );
};

export default GoldenDot;
