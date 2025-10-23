import React, { useState, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Billboard } from '@react-three/drei';
import { Group } from 'three';
import { createIconElement } from './radial-button-config';
import { serviceManager } from '../../services/service-manager';
import { useInterBrainStore } from '../../store/interbrain-store';

/**
 * ActiveVideoCallButton - Persistent button during active video calls
 *
 * Displayed at a special "half-radius + forward Z" position during copilot mode.
 * Always visible (not dependent on Option key) and shows "End Video Call" functionality.
 *
 * Position:
 * - Ring radius: 18 units (normal radial menu)
 * - Active radius: 9 units (half of ring)
 * - Ring Z: -51
 * - Active Z: -45 (6 units closer to camera, in front of DreamNode)
 * - Final position: [0, 9, -45] (straight up from center)
 *
 * Architecture:
 * - Separate from RadialButtonRing3D lifecycle
 * - Conditionally rendered by DreamspaceCanvas when copilotMode.isActive
 * - Fades in on mount, fades out when copilot mode ends
 * - Same visual style as RadialButton for consistency
 */
export const ActiveVideoCallButton: React.FC = () => {
  const [isHovered, setIsHovered] = useState(false);
  const [opacity, setOpacity] = useState(0);
  const groupRef = useRef<Group>(null);

  // Check if copilot mode is still active (for fade out detection)
  const copilotMode = useInterBrainStore(state => state.copilotMode);
  const conversationPartner = copilotMode.conversationPartner;

  // Fade in on mount
  useEffect(() => {
    const timer = setTimeout(() => setOpacity(1), 50);
    return () => clearTimeout(timer);
  }, []);

  // Fade out when copilot mode ends
  useEffect(() => {
    if (!copilotMode.isActive || !conversationPartner) {
      setOpacity(0);
    }
  }, [copilotMode.isActive, conversationPartner]);

  // Handle button click - execute end video call command
  const handleClick = () => {
    console.log('🎯 [ActiveVideoCallButton] End Video Call clicked');
    const app = serviceManager.getApp();
    if (app) {
      (app as any).commands.executeCommandById('interbrain:end-video-call');
    } else {
      console.error('🎯 [ActiveVideoCallButton] App not available, cannot execute command');
    }
  };

  // Button configuration
  const BUTTON_POSITION: [number, number, number] = [0, 9, -45];
  const ICON_NAME = 'lucide-video';
  const LABEL = 'End Video Call';

  return (
    <group ref={groupRef} position={BUTTON_POSITION}>
      {/* Billboard - always faces camera */}
      <Billboard follow={true} lockX={false} lockY={false} lockZ={false}>
        {/* HTML button - handles all interactions */}
        <Html
          center
          transform
          distanceFactor={10}
          position={[0, 0, 0]}
          style={{
            pointerEvents: 'auto',
            userSelect: 'none',
            cursor: 'pointer'
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '270px',
              height: '270px',
              opacity,
              transition: 'opacity 0.3s ease'
            }}
          >
            {/* Circular button */}
            <div
              onMouseEnter={() => {
                console.log('🎯 [ActiveVideoCallButton] Button hovered');
                setIsHovered(true);
              }}
              onMouseLeave={() => setIsHovered(false)}
              onClick={(e) => {
                e.stopPropagation();
                handleClick();
              }}
              style={{
                width: '270px',
                height: '270px',
                borderRadius: '50%',
                border: `6px solid ${isHovered ? '#ffffff' : '#4FC3F7'}`,
                background: '#000000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                boxShadow: isHovered ? '0 0 20px rgba(79, 195, 247, 0.6)' : 'none',
                cursor: 'pointer',
                color: '#ffffff'
              }}
            >
              {/* Icon using Obsidian's setIcon API */}
              {createIconElement(ICON_NAME)}
            </div>

            {/* Label underneath - only visible on hover */}
            {isHovered && (
              <div
                style={{
                  position: 'absolute',
                  top: '300px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  color: '#ffffff',
                  fontSize: '18px',
                  fontWeight: '500',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  background: 'rgba(0, 0, 0, 0.8)',
                  padding: '6px 16px',
                  borderRadius: '4px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                  pointerEvents: 'none'
                }}
              >
                {LABEL}
              </div>
            )}
          </div>
        </Html>
      </Billboard>
    </group>
  );
};
