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
    }
  },
  
  // Standard dimensions for consistent sizing
  dimensions: {
    nodeSize: 240,        // Base size in pixels for UI elements
    nodeSizeThreeD: 1000, // Base size for 3D nodes (scales with distance)
    borderWidth: 2,       // Border thickness
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
      scale: 1.1,
      glowIntensity: 20  // for box-shadow glow effect
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
  }
} as const;

/**
 * Helper function to get node colors based on type
 */
export function getNodeColors(type: 'dream' | 'dreamer') {
  return dreamNodeStyles.colors[type];
}

/**
 * Helper function to generate box-shadow glow effect
 */
export function getNodeGlow(type: 'dream' | 'dreamer', intensity: number = 10) {
  const colors = getNodeColors(type);
  return `0 0 ${intensity}px ${colors.border}`;
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
        boxShadow: getNodeGlow(type, states.hover.glowIntensity)
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
        boxShadow: getNodeGlow(type, 10)
      };
  }
}