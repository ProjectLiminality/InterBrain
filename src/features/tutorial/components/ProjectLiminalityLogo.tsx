/**
 * ProjectLiminalityLogo - Scalable vector logo component
 *
 * Built from SVG primitives for animation control:
 * - Blue outer circle (can be used as mask)
 * - Red/coral inner circle (offset upward)
 *
 * All dimensions are relative to the viewBox for perfect scaling.
 */

import React from 'react';

// Color constants
export const LOGO_BLUE = '#0099ff';
export const LOGO_RED = '#f06850'; // coral/salmon red

// Proportions (relative to viewBox of 100x100)
const VIEWBOX_SIZE = 100;
const BLUE_RADIUS = 49;
const BLUE_CENTER = { x: 50, y: 50 };
const BLUE_STROKE_WIDTH = 1.5; // Halved

const RED_RADIUS = 32;
const RED_CENTER = { x: 50, y: 34 };
const RED_STROKE_WIDTH = 1.5;

// White lines forming the "A" shape
const LINE_COLOR = '#ffffff';
const LINE_STROKE_WIDTH = 1.5; // Same as circles
// Lines meet at top point and extend downward
const LINE_TOP = { x: 50, y: 23 };
const LINE_BOTTOM_LEFT = { x: 21, y: 89.5 };
const LINE_BOTTOM_RIGHT = { x: 79, y: 89.5 };

interface ProjectLiminalityLogoProps {
  /** Size of the logo (width and height) */
  size?: string | number;
  /** Additional className for styling */
  className?: string;
  /** Opacity of the blue circle (for animations) */
  blueOpacity?: number;
  /** Opacity of the red circle (for animations) */
  redOpacity?: number;
  /** Opacity of the white lines (for animations) */
  linesOpacity?: number;
  /** Scale transform for the entire logo */
  scale?: number;
  /** Transition duration in ms for opacity changes */
  transitionDuration?: number;
  /** Optional inline styles */
  style?: React.CSSProperties;
  /** Ref for the SVG element */
  svgRef?: React.Ref<SVGSVGElement>;
}

/**
 * Scalable Project Liminality logo built from SVG primitives
 */
export const ProjectLiminalityLogo: React.FC<ProjectLiminalityLogoProps> = ({
  size = '100%',
  className,
  blueOpacity = 1,
  redOpacity = 1,
  linesOpacity = 1,
  scale = 1,
  transitionDuration = 0,
  style,
  svgRef,
}) => {
  const transitionStyle = transitionDuration > 0
    ? { transition: `opacity ${transitionDuration}ms ease-in-out` }
    : {};
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
      width={size}
      height={size}
      className={className}
      style={{
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        ...style,
      }}
    >
      {/* White lines forming "A" shape - rendered first so circles overlay */}
      <line
        x1={LINE_TOP.x}
        y1={LINE_TOP.y}
        x2={LINE_BOTTOM_LEFT.x}
        y2={LINE_BOTTOM_LEFT.y}
        stroke={LINE_COLOR}
        strokeWidth={LINE_STROKE_WIDTH}
        strokeLinecap="round"
        opacity={linesOpacity}
        style={transitionStyle}
      />
      <line
        x1={LINE_TOP.x}
        y1={LINE_TOP.y}
        x2={LINE_BOTTOM_RIGHT.x}
        y2={LINE_BOTTOM_RIGHT.y}
        stroke={LINE_COLOR}
        strokeWidth={LINE_STROKE_WIDTH}
        strokeLinecap="round"
        opacity={linesOpacity}
        style={transitionStyle}
      />

      {/* Blue outer circle */}
      <circle
        cx={BLUE_CENTER.x}
        cy={BLUE_CENTER.y}
        r={BLUE_RADIUS}
        fill="none"
        stroke={LOGO_BLUE}
        strokeWidth={BLUE_STROKE_WIDTH}
        opacity={blueOpacity}
        style={transitionStyle}
      />

      {/* Red inner circle (offset upward) */}
      <circle
        cx={RED_CENTER.x}
        cy={RED_CENTER.y}
        r={RED_RADIUS}
        fill="none"
        stroke={LOGO_RED}
        strokeWidth={RED_STROKE_WIDTH}
        opacity={redOpacity}
        style={transitionStyle}
      />
    </svg>
  );
};

/**
 * Blue circle only - useful for masking
 */
export const LogoBlueCircle: React.FC<{
  size?: string | number;
  fill?: boolean;
  opacity?: number;
  style?: React.CSSProperties;
}> = ({ size = '100%', fill = false, opacity = 1, style }) => {
  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
      width={size}
      height={size}
      style={style}
    >
      <circle
        cx={BLUE_CENTER.x}
        cy={BLUE_CENTER.y}
        r={fill ? BLUE_RADIUS + BLUE_STROKE_WIDTH / 2 : BLUE_RADIUS}
        fill={fill ? LOGO_BLUE : 'none'}
        stroke={fill ? 'none' : LOGO_BLUE}
        strokeWidth={fill ? 0 : BLUE_STROKE_WIDTH}
        opacity={opacity}
      />
    </svg>
  );
};

/**
 * Export constants for external use (e.g., creating masks)
 */
export const LOGO_DIMENSIONS = {
  viewBoxSize: VIEWBOX_SIZE,
  blueRadius: BLUE_RADIUS,
  blueCenter: BLUE_CENTER,
  blueStrokeWidth: BLUE_STROKE_WIDTH,
  redRadius: RED_RADIUS,
  redCenter: RED_CENTER,
  redStrokeWidth: RED_STROKE_WIDTH,
};

export default ProjectLiminalityLogo;
