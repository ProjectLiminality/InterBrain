/**
 * Shared styling constants for DreamNode components
 *
 * This module provides consistent visual design across all DreamNode-related UI,
 * including the regular 3D nodes, proto-nodes during creation, and related components.
 */

export const dreamNodeStyles = {
  // Color scheme for different node types
  colors: {
    dream: {
      border: '#4FC3F7',  // Blue for Dreams
      fill: '#000000'     // Black background
    },
    dreamer: {
      border: '#FF6B6B',  // Red for Dreamers
      fill: '#000000'     // Black background
    },
    text: {
      primary: '#FFFFFF',   // White text
      secondary: '#CCCCCC'  // Light gray for secondary text
    },
    // Universal golden glow for attention/interaction
    glow: '#FFD700'
  },

  // Standard dimensions for consistent sizing
  dimensions: {
    nodeSize: 240,        // Base size in pixels for UI elements
    nodeSizeThreeD: 1000, // Base size for 3D nodes (scales with distance)
    borderWidth: 25,      // Main node border thickness
    toggleBorderWidth: 2, // Toggle button border thickness
    borderRadius: '50%'   // Perfect circle
  },

  // Typography settings
  typography: {
    fontFamily: 'TeX Gyre Termes, Georgia, serif',
    fontSize: {
      base: 16,
      small: 12,
      large: 20
    },
    fontWeight: {
      normal: 400,
      bold: 600
    },
    lineHeight: 1.4
  },

  // Interaction states
  states: {
    hover: {
      scale: 1.05,
      glowIntensity: 35  // Golden glow intensity on hover
    },
    creation: {
      opacity: 0.7       // Translucent for proto-nodes
    },
    normal: {
      opacity: 1.0       // Fully opaque for real nodes
    }
  },

  // Animation timing
  transitions: {
    default: 'all 0.2s ease',
    creation: 'opacity 0.3s ease',
    hover: 'transform 0.2s ease, box-shadow 0.2s ease'
  },

  // Media file effects
  media: {
    // Radial fade-to-black gradient for circular media display
    fadeToBlackGradient: 'radial-gradient(circle, rgba(0,0,0,0) 50%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,1) 70%)',
    containerSize: '100%', // Media container matches full node size
    borderRadius: '50%'   // Circular container
  }
} as const;

/**
 * Helper function to get node colors based on type
 */
export function getNodeColors(type: 'dream' | 'dreamer') {
  return dreamNodeStyles.colors[type];
}

/**
 * Universal golden glow effect for attention/interaction
 * Used for: hover states, edit mode, tutorial focus, relationships
 *
 * Creates a white-hot center fading to golden edges (matching GoldenDot aesthetic)
 *
 * @param intensity - Glow spread in pixels (default: 25)
 * @returns CSS box-shadow value with white core and golden outer glow
 */
export function getGoldenGlow(intensity: number = 25) {
  // White-hot inner core, golden mid-layer, warm gold outer
  return `0 0 ${intensity * 0.5}px rgba(255, 255, 255, 0.9), 0 0 ${intensity}px rgba(255, 220, 150, 0.8), 0 0 ${intensity * 2}px rgba(255, 200, 80, 0.6)`;
}

/**
 * Reference distance for distance-invariant hover effects
 * This is the center node position in liminal web layout (z = -50)
 */
const REFERENCE_DISTANCE = 50;

/**
 * Calculate distance compensation factor for distance-invariant hover effects
 *
 * This ensures that hover effects (glow radius, scale ring thickness) appear
 * the same absolute size in screen space regardless of how far the node is.
 *
 * Geometric derivation:
 * - Apparent size scales as 1/distance
 * - To maintain constant absolute effect, we scale the effect by distance/reference
 *
 * Liminal Web Layout z-distances:
 * - Center node: z = -50  → 1.0x
 * - Ring 1: z = -100      → 2.0x
 * - Ring 2: z = -200      → 4.0x
 * - Ring 3: z = -450      → 9.0x
 *
 * @param zPosition - The z-coordinate of the node (negative = further from camera)
 * @returns Distance compensation factor (1.0 at reference distance)
 */
export function getDistanceCompensationFactor(zPosition: number): number {
  const distance = Math.abs(zPosition);
  return distance / REFERENCE_DISTANCE;
}

/**
 * Calculate distance-scaled glow intensity for DreamNodes
 *
 * @param zPosition - The z-coordinate of the node (negative = further from camera)
 * @param baseIntensity - Base glow intensity at reference distance (default: 35)
 * @returns Scaled intensity value for distance-invariant glow appearance
 */
export function getDistanceScaledGlowIntensity(zPosition: number, baseIntensity: number = 35): number {
  const factor = getDistanceCompensationFactor(zPosition);
  return baseIntensity * factor;
}

/**
 * Calculate distance-scaled hover scale for DreamNodes
 *
 * Ensures the "ring thickness" (visual difference between hovered and unhovered)
 * appears constant in screen space regardless of distance.
 *
 * Math: scale = 1 + baseScaleDelta * (distance / referenceDistance)
 *
 * @param zPosition - The z-coordinate of the node (negative = further from camera)
 * @param baseScaleDelta - Scale increase at reference distance (default: 0.05 = 5%)
 * @returns Scale factor for distance-invariant hover ring appearance
 */
export function getDistanceScaledHoverScale(zPosition: number, baseScaleDelta: number = 0.05): number {
  const factor = getDistanceCompensationFactor(zPosition);
  return 1 + (baseScaleDelta * factor);
}

/**
 * Helper function to generate media container styling with fade-to-black effect
 */
export function getMediaContainerStyle() {
  return {
    width: dreamNodeStyles.media.containerSize,
    height: dreamNodeStyles.media.containerSize,
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    borderRadius: dreamNodeStyles.media.borderRadius,
    overflow: 'hidden' as const,
    background: 'rgba(0, 0, 0, 0.8)'
  };
}

/**
 * Helper function to generate media overlay with fade-to-black gradient
 */
export function getMediaOverlayStyle() {
  return {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: dreamNodeStyles.media.fadeToBlackGradient,
    pointerEvents: 'none' as const
  };
}

/**
 * Helper function to get complete node styling for a given type and state
 */
export function getNodeStyle(
  type: 'dream' | 'dreamer',
  state: 'normal' | 'hover' | 'creation' = 'normal'
) {
  const colors = getNodeColors(type);
  const { dimensions, transitions, states } = dreamNodeStyles;

  const baseStyle = {
    width: `${dimensions.nodeSize}px`,
    height: `${dimensions.nodeSize}px`,
    borderRadius: dimensions.borderRadius,
    border: `${dimensions.borderWidth}px solid ${colors.border}`,
    background: colors.fill,
    color: dreamNodeStyles.colors.text.primary,
    fontFamily: dreamNodeStyles.typography.fontFamily,
    fontSize: `${dreamNodeStyles.typography.fontSize.base}px`,
    transition: transitions.default,
    cursor: 'pointer',
    userSelect: 'none' as const,
    position: 'relative' as const,
    overflow: 'hidden' as const
  };

  switch (state) {
    case 'hover':
      return {
        ...baseStyle,
        transform: `scale(${states.hover.scale})`,
        boxShadow: getGoldenGlow(states.hover.glowIntensity)
      };
    case 'creation':
      return {
        ...baseStyle,
        opacity: states.creation.opacity,
        transition: transitions.creation
      };
    default:
      return {
        ...baseStyle,
        opacity: states.normal.opacity,
        boxShadow: 'none'
      };
  }
}
