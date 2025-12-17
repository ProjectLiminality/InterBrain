/**
 * TutorialPortalOverlay - Full-screen portal entry experience
 *
 * Displays a Project Liminality logo on a black background that:
 * - Tilts towards the mouse cursor (like DreamNodes do)
 * - Straightens and scales up on hover
 * - Shows "Enter Dreamspace" text on hover
 * - On click: fades out, starts music, begins tutorial
 *
 * Shown on first startup or when tutorial is triggered.
 */

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { serviceManager } from '../../core/services/service-manager';
import { musicService } from './services/music-service';
// TODO: Re-enable when tutorial flow is connected
// import { useInterBrainStore } from '../../core/store/interbrain-store';
import { STAR_GRADIENT } from '../constellation-layout';
import { ProjectLiminalityLogo, LOGO_DIMENSIONS } from './components/ProjectLiminalityLogo';

/**
 * Generate a deterministic but organic-looking star field
 * Uses rectangular grid with jitter for full coverage including corners
 * Size is in viewport units (vh) for responsive scaling
 */
function generateStarField(count: number, seed: number = 42): Array<{
  x: number;
  y: number;
  sizeVh: number; // viewport-relative size
  opacity: number;
}> {
  const stars: Array<{ x: number; y: number; sizeVh: number; opacity: number }> = [];

  // Pseudo-random number generator with seed
  const seededRandom = (i: number, offset: number = 0) => {
    const x = Math.sin(i * 12.9898 + offset * 78.233 + seed) * 43758.5453;
    return x - Math.floor(x);
  };

  for (let i = 0; i < count; i++) {
    // Distribute across full rectangle with pseudo-random positions
    const x = seededRandom(i, 1) * 100; // 0-100%
    const y = seededRandom(i, 2) * 100; // 0-100%

    // Size distribution: viewport-relative
    const sizeRandom = seededRandom(i, 3);
    const sizeVh = 1.2 + sizeRandom * 2.0; // 1.2-3.2vh range

    // Opacity: slight variation
    const opacity = 0.4 + seededRandom(i, 4) * 0.5;

    stars.push({ x, y, sizeVh, opacity });
  }

  return stars;
}

interface TutorialPortalOverlayProps {
  /** Whether the overlay is visible */
  isVisible: boolean;
  /** Callback when portal is entered (overlay should close) */
  onEnter?: () => void;
}

// Animation duration for portal transition (ms)
const PORTAL_TRANSITION_DURATION = 1500;

// Staggered animation timing (as fractions of total duration)
// Fade-out: 0% → 75% (first 3/4)
// Scale-up: 25% → 100% (last 3/4)
const FADE_START = 0;
const FADE_END = 0.75;
const SCALE_START = 0.25;
const SCALE_END = 1.0;

export const TutorialPortalOverlay: React.FC<TutorialPortalOverlayProps> = ({
  isVisible,
  onEnter,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isEntering, setIsEntering] = useState(false); // Portal entry animation
  const [animatedScale, setAnimatedScale] = useState(1); // Animated scale for star masking and logo
  const [animatedFade, setAnimatedFade] = useState(1); // Animated opacity for fade elements (1 = visible, 0 = hidden)
  const [tiltX, setTiltX] = useState(0);
  const [tiltY, setTiltY] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);

  // Generate star field once (memoized)
  const stars = useMemo(() => generateStarField(80, 42), []);

  // Animate scale and fade with staggered timing when entering portal
  useEffect(() => {
    if (!isEntering) {
      // Reset when not entering (no mask effect before click)
      setAnimatedScale(isHovered ? 1.02 : 1);
      setAnimatedFade(1);
      return;
    }

    // Animation parameters
    const startScale = isHovered ? 1.02 : 1;
    const endScale = 6; // portalExitScale
    const startTime = performance.now();
    const duration = PORTAL_TRANSITION_DURATION;

    // Ease-in-out timing function
    const easeInOut = (t: number) => {
      return t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;
    };

    // Map progress to a sub-range and apply easing
    const mapToRange = (progress: number, rangeStart: number, rangeEnd: number) => {
      if (progress <= rangeStart) return 0;
      if (progress >= rangeEnd) return 1;
      const rangeProgress = (progress - rangeStart) / (rangeEnd - rangeStart);
      return easeInOut(rangeProgress);
    };

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Fade: 0% → 75% of total duration (opacity goes 1 → 0)
      const fadeProgress = mapToRange(progress, FADE_START, FADE_END);
      setAnimatedFade(1 - fadeProgress);

      // Scale: 25% → 100% of total duration
      const scaleProgress = mapToRange(progress, SCALE_START, SCALE_END);
      const newScale = startScale + (endScale - startScale) * scaleProgress;
      setAnimatedScale(newScale);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isEntering, isHovered]);

  // Handle mouse move for tilt effect
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!logoRef.current || isHovered) return;

    const rect = logoRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Calculate distance from logo center
    const deltaX = e.clientX - centerX;
    const deltaY = e.clientY - centerY;

    // Max tilt angle (degrees) - reduced for subtler effect
    const maxTilt = 12.5;

    // Calculate tilt based on mouse position relative to logo
    // Normalize by screen dimensions for consistent feel
    const normalizedX = deltaX / (window.innerWidth / 2);
    const normalizedY = deltaY / (window.innerHeight / 2);

    // Tilt towards the mouse (inverted for natural feel)
    setTiltY(normalizedX * maxTilt);
    setTiltX(-normalizedY * maxTilt);
  }, [isHovered]);

  // Handle logo hover
  const handleLogoEnter = useCallback(() => {
    setIsHovered(true);
    // Reset tilt when hovered (logo faces forward)
    setTiltX(0);
    setTiltY(0);
  }, []);

  const handleLogoLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  // Handle portal click - start the journey through the portal
  const handlePortalClick = useCallback(() => {
    if (isEntering) return;

    console.log('[TutorialPortal] Entering Dreamspace...');
    setIsEntering(true);
    setIsHovered(false); // Reset hover state

    // Start music
    const app = serviceManager.getApp();
    if (app) {
      musicService.initialize(app);
      musicService.play(2000);
    }

    // TODO: Re-enable tutorial start after portal animation is finalized
    // startTutorial();

    // Portal animation, then notify parent and unmount
    setTimeout(() => {
      setIsEntering(false); // Reset so component unmounts
      onEnter?.();
    }, PORTAL_TRANSITION_DURATION);
  }, [isEntering, onEnter]);

  if (!isVisible && !isEntering) {
    return null;
  }

  // Logo size and hole calculations
  const logoSizeVh = 50;

  // The hole radius should match the blue circle's inner edge at scale 1
  // Blue circle stroke is 1.5 units in a 100-unit viewbox, so inner radius is (49 - 0.75) = 48.25
  // As a percentage of the viewbox: 48.25%
  // Logo is logoSizeVh tall, so the base hole radius in vh is: logoSizeVh * 0.4825
  const baseHoleRadiusVh = logoSizeVh * 0.4825;

  // For star filtering, use the OUTER edge of the blue circle (49 + 0.75 = 49.75)
  // This ensures stars disappear right at the visible edge of the blue circle
  const blueCircleOuterRadiusVh = logoSizeVh * 0.4975;

  const overlayContent = (
    <div
      ref={containerRef}
      className="tutorial-portal-overlay"
      onMouseMove={handleMouseMove}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        cursor: 'default',
        pointerEvents: 'auto',
        overflow: 'hidden',
      }}
    >
      {/*
        Layer structure (bottom to top):
        1. Black background with hole punch (covers DreamSpace outside circle)
        2. Stars with same hole punch (visible outside circle only)
        3. Logo (on top of everything)

        The "hole" is where both layers are transparent, revealing DreamSpace.
        As the hole scales up, more DreamSpace is revealed and stars disappear.
      */}

      {/* Layer 1a: Black background with hole - covers DreamSpace outside the circle */}
      {/* Uses JS-animated scale for the portal opening animation */}
      <div
        style={{
          position: 'absolute',
          width: `${baseHoleRadiusVh * 2}vh`,
          height: `${baseHoleRadiusVh * 2}vh`,
          borderRadius: '50%',
          backgroundColor: 'transparent',
          boxShadow: '0 0 0 200vmax black',
          transform: `scale(${animatedScale})`,
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* Layer 1b: Solid black circle that covers the hole BEFORE click */}
      {/* This prevents DreamSpace from peeking through when logo tilts */}
      {/* Disappears immediately on click (no animation needed) */}
      {!isEntering && (
        <div
          style={{
            position: 'absolute',
            width: `${baseHoleRadiusVh * 2.1}vh`, // Slightly larger to cover any gaps
            height: `${baseHoleRadiusVh * 2.1}vh`,
            borderRadius: '50%',
            backgroundColor: 'black',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}

      {/* Layer 2: Stars container */}
      {/* Stars are filtered by distance from center based on animatedScale */}
      {/* Before click, animatedScale=1 so stars inside the base hole are hidden */}
      {/* As portal opens, more stars get hidden as the hole grows */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        {stars.map((star, i) => {
          // Only filter stars when entering portal (animation in progress)
          // Before click, show all stars - the black hole cover hides them anyway
          if (isEntering) {
            // Calculate if star is outside the current hole
            // Star position is in % (0-100), center is at 50%, 50%
            //
            // Filter radius tuned to match the visible blue circle edge
            // Use constant offset (not scaling factor) so it scales proportionally with blue circle
            const holeRadiusAsPercentOfHeight = (blueCircleOuterRadiusVh * animatedScale) - 10;

            // Star distance from center (50%, 50%) in percentage units
            // Note: This treats x and y equally, which works for square viewports
            // For non-square, the circle appears elliptical in star-space, but
            // since the logo is centered and vh-based, we compare against height
            const dx = star.x - 50;
            const dy = star.y - 50;
            const distancePercent = Math.sqrt(dx * dx + dy * dy);

            // Only render stars outside the hole
            const isOutsideHole = distancePercent > holeRadiusAsPercentOfHeight;

            if (!isOutsideHole) return null;
          }

          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${star.x}%`,
                top: `${star.y}%`,
                width: `${star.sizeVh}vh`,
                height: `${star.sizeVh}vh`,
                borderRadius: '50%',
                background: STAR_GRADIENT,
                opacity: star.opacity,
                pointerEvents: 'none',
                transform: 'translate(-50%, -50%)',
              }}
            />
          );
        })}
      </div>

      {/* Logo with tilt effect - z-index above stars */}
      {/* Uses JS-animated scale for staggered timing with fade */}
      <div
        ref={logoRef}
        className="tutorial-portal-logo"
        onMouseEnter={handleLogoEnter}
        onMouseLeave={handleLogoLeave}
        onClick={handlePortalClick}
        style={{
          height: `${logoSizeVh}vh`,
          aspectRatio: '1 / 1',
          cursor: isEntering ? 'default' : 'pointer',
          // During portal entry: JS-animated scale, no tilt
          // Otherwise: normal tilt and hover behavior with CSS transition
          transform: isEntering
            ? `scale(${animatedScale})`
            : `perspective(2000px) rotateX(${isHovered ? 0 : tiltX}deg) rotateY(${isHovered ? 0 : tiltY}deg) scale(${isHovered ? 1.02 : 1})`,
          transition: isEntering
            ? 'none' // JS handles animation
            : (isHovered ? 'transform 0.3s ease-out' : 'transform 0.1s ease-out'),
          transformStyle: 'preserve-3d',
          zIndex: 10,
          position: 'relative',
        }}
      >
        {/* Black circle behind logo to occlude stars - fades using JS-animated opacity */}
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            backgroundColor: 'black',
            opacity: animatedFade,
          }}
        />
        {/* SVG Logo - red circle and lines fade out using JS-animated opacity */}
        <ProjectLiminalityLogo
          size="100%"
          redOpacity={animatedFade}
          linesOpacity={animatedFade}
          blueOpacity={1} // Blue stays visible
          transitionDuration={0} // JS handles animation
          style={{
            position: 'absolute',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Enter DreamSpace text - absolutely positioned below logo center */}
      <div
        className="tutorial-portal-text"
        style={{
          position: 'absolute',
          top: `calc(50% + ${logoSizeVh / 2}vh + 4vh)`, // Below logo with 4vh gap
          left: '50%',
          transform: 'translateX(-50%)',
          opacity: isHovered && !isEntering ? 1 : 0,
          transition: 'opacity 0.3s ease-out',
          color: 'white',
          fontSize: '4vh',
          fontFamily: '"TeX Gyre Termes", "Times New Roman", serif',
          fontWeight: 400,
          letterSpacing: '0.1em',
          pointerEvents: 'none',
          userSelect: 'none',
          zIndex: 10,
        }}
      >
        Enter DreamSpace
      </div>
    </div>
  );

  // Use React Portal to render to document.body, escaping all container constraints
  return ReactDOM.createPortal(overlayContent, document.body);
};

export default TutorialPortalOverlay;
