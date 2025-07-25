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
      scale: 1.1,
      glowIntensity: 20  // for box-shadow glow effect
    },
    creation: {
      opacity: 0.7       // Translucent for proto-nodes
    },
    normal: {
      opacity: 1.0       // Fully opaque for real nodes
    },
    // Git state visual indicators
    git: {
      clean: {
        glowIntensity: 10        // Normal glow
      },
      uncommitted: {
        glowIntensity: 25,       // Enhanced glow
        pulseAnimation: 'dreamnode-pulse 2s ease-in-out infinite'
      },
      stashed: {
        glowIntensity: 15,       // Slightly enhanced glow
        borderStyle: 'dashed'   // Dashed border for stashed state
      },
      dirtyAndStashed: {
        glowIntensity: 30,       // Maximum glow
        pulseAnimation: 'dreamnode-pulse 2s ease-in-out infinite',
        borderStyle: 'dashed'
      }
    }
  },
  
  // Animation timing
  transitions: {
    default: 'all 0.2s ease',
    creation: 'opacity 0.3s ease',
    hover: 'transform 0.2s ease, box-shadow 0.2s ease',
    gitState: 'border-style 0.3s ease, box-shadow 0.3s ease'
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
 * Helper function to generate box-shadow glow effect
 */
export function getNodeGlow(type: 'dream' | 'dreamer', intensity: number = 10) {
  const colors = getNodeColors(type);
  return `0 0 ${intensity}px ${colors.border}`;
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
 * Git state type for visual indicators
 */
export type GitStateType = 'clean' | 'uncommitted' | 'stashed' | 'dirtyAndStashed';

/**
 * Helper function to determine git visual state from git status
 */
export function getGitVisualState(gitStatus?: { hasUncommittedChanges: boolean; hasStashedChanges: boolean }): GitStateType {
  if (!gitStatus) return 'clean';
  
  const { hasUncommittedChanges, hasStashedChanges } = gitStatus;
  
  if (hasUncommittedChanges && hasStashedChanges) {
    return 'dirtyAndStashed';
  } else if (hasUncommittedChanges) {
    return 'uncommitted';
  } else if (hasStashedChanges) {
    return 'stashed';
  } else {
    return 'clean';
  }
}

/**
 * Helper function to get git state styling properties
 */
export function getGitStateStyle(gitState: GitStateType) {
  const gitStyles = dreamNodeStyles.states.git[gitState];
  
  return {
    borderStyle: ('borderStyle' in gitStyles) ? gitStyles.borderStyle : 'solid',
    animation: ('pulseAnimation' in gitStyles) ? gitStyles.pulseAnimation : 'none',
    glowIntensity: gitStyles.glowIntensity
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