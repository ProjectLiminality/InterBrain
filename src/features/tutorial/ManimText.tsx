import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import * as opentype from 'opentype.js';

// Vite handles ?url imports for asset URLs
// @ts-expect-error - Vite asset import with ?url suffix
import TexGyreTermesFont from './fonts/texgyretermes-regular.otf?url';

interface ManimTextProps {
  text: string;
  strokeDuration?: number;
  fillDelay?: number;
  fadeStroke?: boolean;
  fontSize?: number;
  onComplete?: () => void;
}

interface CharPath {
  pathData: string;
  length: number;
  x: number;
}

/**
 * ManimText - 3Blue1Brown style text animation
 *
 * Three-phase animation:
 * 1. Stroke drawing (cascading per character)
 * 2. Fill reveal (after stroke completes)
 * 3. Stroke fade (creates crisp final text)
 *
 * Uses SVG stroke-dasharray/dashoffset technique from Manim
 */
export const ManimText: React.FC<ManimTextProps> = ({
  text,
  strokeDuration = 2,
  fillDelay = 0.3,
  fadeStroke = true,
  fontSize = 48,
  onComplete
}) => {
  const [charPaths, setCharPaths] = useState<CharPath[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Reset state when text changes
    setCharPaths([]);
    setIsLoaded(false);

    // Load bundled font and convert text to SVG paths
    const loadFont = async () => {
      try {
        console.log('🎨 Loading bundled TeX Gyre Termes font for Manim animation...');
        const font = await opentype.load(TexGyreTermesFont);

        if (!font) {
          console.error('Font loading returned null');
          const paths = createFallbackPaths(text, fontSize);
          setCharPaths(paths);
          setIsLoaded(true);
          return;
        }

        console.log('✓ Font loaded successfully:', font.names.fontFamily.en);

        // Convert each character to SVG path
        const paths: CharPath[] = [];
        let xOffset = 0;

        for (const char of text) {
          const glyph = font.charToGlyph(char);
          const path = glyph.getPath(xOffset, fontSize, fontSize);
          const pathData = path.toSVG(2); // Get SVG path data

          // Extract just the 'd' attribute from the path
          const dMatch = pathData.match(/d="([^"]+)"/);
          if (dMatch) {
            // Create temporary path to measure length
            const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            tempPath.setAttribute('d', dMatch[1]);
            tempSvg.appendChild(tempPath);
            document.body.appendChild(tempSvg);

            const length = tempPath.getTotalLength();

            document.body.removeChild(tempSvg);

            paths.push({
              pathData: dMatch[1],
              length,
              x: xOffset
            });
          }

          xOffset += (glyph.advanceWidth ?? fontSize * 0.6) * fontSize / font.unitsPerEm;
        }

        setCharPaths(paths);
        setIsLoaded(true);
      } catch (error) {
        console.error('Font loading error:', error);
        // Use fallback
        const paths = createFallbackPaths(text, fontSize);
        setCharPaths(paths);
        setIsLoaded(true);
      }
    };

    loadFont();
  }, [text, fontSize]);

  // Fallback: create simple rectangular paths for each character
  const createFallbackPaths = (text: string, size: number): CharPath[] => {
    // Estimate character width (rough approximation)
    const charWidth = size * 0.6;

    return text.split('').map((char, i) => ({
      // Create a simple rectangular path as placeholder
      pathData: `M ${i * charWidth} 0 L ${i * charWidth} ${size} L ${(i + 1) * charWidth} ${size} L ${(i + 1) * charWidth} 0 Z`,
      length: size * 2 + charWidth * 2,
      x: i * charWidth
    }));
  };

  const totalDuration = strokeDuration + fillDelay + (fadeStroke ? 0.5 : 0);
  const cascadeDelay = 0.1; // Delay between each character starting

  useEffect(() => {
    if (isLoaded && onComplete) {
      const timer = setTimeout(() => {
        onComplete();
      }, (totalDuration + text.length * cascadeDelay) * 1000);

      return () => globalThis.clearTimeout(timer);
    }
    return undefined;
  }, [isLoaded, onComplete, totalDuration, text.length]);

  if (!isLoaded || charPaths.length === 0) {
    return null; // Loading state
  }

  // Calculate viewBox to fit all characters
  const viewBoxWidth = charPaths[charPaths.length - 1]?.x + fontSize || fontSize;
  const viewBoxHeight = fontSize * 1.2;

  return (
    <div className="manim-text-container" style={{ width: '100%', height: '100%' }}>
      <svg
        viewBox={`0 ${-viewBoxHeight * 0.8} ${viewBoxWidth} ${viewBoxHeight}`}
        style={{ width: '100%', height: '100%', overflow: 'visible' }}
      >
        {charPaths.map((charPath, i) => {
          const charDelay = i * cascadeDelay;

          return (
            <g key={i}>
              {/* Stroke layer - draws the outline */}
              <motion.path
                d={charPath.pathData}
                stroke="white"
                strokeWidth={2}
                fill="transparent"
                initial={{
                  strokeDasharray: charPath.length,
                  strokeDashoffset: charPath.length,
                  opacity: 1
                }}
                animate={{
                  strokeDashoffset: 0,
                  opacity: fadeStroke ? 0 : 1
                }}
                transition={{
                  strokeDashoffset: {
                    duration: strokeDuration,
                    delay: charDelay,
                    ease: "easeInOut"
                  },
                  opacity: {
                    duration: 0.5,
                    delay: charDelay + strokeDuration + fillDelay,
                    ease: "easeOut"
                  }
                }}
              />

              {/* Fill layer - reveals after stroke */}
              <motion.path
                d={charPath.pathData}
                fill="white"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  duration: 0.5,
                  delay: charDelay + strokeDuration,
                  ease: "easeIn"
                }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};

/**
 * Helper component for positioning ManimText in 3D space
 */
export const ManimText3D: React.FC<ManimTextProps & { position?: [number, number, number] }> = ({
  position = [0, 0, 0],
  ..._props
}) => {
  return (
    <mesh position={position}>
      <planeGeometry args={[4, 1]} />
      <meshBasicMaterial transparent opacity={0} />
      {/* Html component will be added by parent */}
    </mesh>
  );
};
