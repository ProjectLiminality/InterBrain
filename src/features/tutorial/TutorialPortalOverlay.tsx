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

import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { serviceManager } from '../../core/services/service-manager';
import { musicService } from './services/music-service';
import { useInterBrainStore } from '../../core/store/interbrain-store';

interface TutorialPortalOverlayProps {
  /** Whether the overlay is visible */
  isVisible: boolean;
  /** Callback when portal is entered (overlay should close) */
  onEnter?: () => void;
  /** Path to the logo image */
  logoPath?: string;
}

export const TutorialPortalOverlay: React.FC<TutorialPortalOverlayProps> = ({
  isVisible,
  onEnter,
  logoPath,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [tiltX, setTiltX] = useState(0);
  const [tiltY, setTiltY] = useState(0);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);

  const startTutorial = useInterBrainStore(state => state.startTutorial);

  // Load logo URL using Obsidian's resource path API
  useEffect(() => {
    const app = serviceManager.getApp();
    if (app && logoPath) {
      try {
        const url = app.vault.adapter.getResourcePath(
          `.obsidian/plugins/interbrain/${logoPath}`
        );
        setLogoUrl(url);
      } catch (error) {
        console.warn('[TutorialPortal] Failed to load logo:', error);
      }
    }
  }, [logoPath]);

  // Handle mouse move for tilt effect
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!logoRef.current || isHovered) return;

    const rect = logoRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Calculate distance from logo center
    const deltaX = e.clientX - centerX;
    const deltaY = e.clientY - centerY;

    // Max tilt angle (degrees)
    const maxTilt = 25;

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

  // Handle portal click - start the journey
  const handlePortalClick = useCallback(() => {
    if (isFadingOut) return;

    console.log('[TutorialPortal] Entering Dreamspace...');
    setIsFadingOut(true);

    // Start music
    const app = serviceManager.getApp();
    if (app) {
      musicService.initialize(app);
      musicService.play(2000);
    }

    // Start tutorial
    startTutorial();

    // Fade out animation, then notify parent
    setTimeout(() => {
      onEnter?.();
    }, 1000); // Match CSS transition duration
  }, [isFadingOut, startTutorial, onEnter]);

  if (!isVisible && !isFadingOut) {
    return null;
  }

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
        backgroundColor: 'black',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        opacity: isFadingOut ? 0 : 1,
        transition: 'opacity 1s ease-out',
        cursor: 'default',
        pointerEvents: 'auto',
      }}
    >
      {/* Logo with tilt effect */}
      <div
        ref={logoRef}
        className="tutorial-portal-logo"
        onMouseEnter={handleLogoEnter}
        onMouseLeave={handleLogoLeave}
        onClick={handlePortalClick}
        style={{
          width: '600px',
          height: '600px',
          cursor: 'pointer',
          transform: `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(${isHovered ? 1.1 : 1})`,
          transition: isHovered
            ? 'transform 0.3s ease-out'
            : 'transform 0.1s ease-out',
          transformStyle: 'preserve-3d',
        }}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Project Liminality"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              pointerEvents: 'none',
            }}
          />
        ) : (
          // Placeholder if logo not loaded
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '48px',
              color: 'white',
            }}
          >
            ✦
          </div>
        )}
      </div>

      {/* Enter Dreamspace text - appears on hover */}
      <div
        className="tutorial-portal-text"
        style={{
          marginTop: '48px',
          opacity: isHovered ? 1 : 0,
          transform: `translateY(${isHovered ? 0 : 10}px)`,
          transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
          color: 'white',
          fontSize: '36px',
          fontFamily: '"TeX Gyre Termes", "Times New Roman", serif',
          fontWeight: 400,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        Enter Dreamspace
      </div>
    </div>
  );

  // Use React Portal to render to document.body, escaping all container constraints
  return ReactDOM.createPortal(overlayContent, document.body);
};

export default TutorialPortalOverlay;
