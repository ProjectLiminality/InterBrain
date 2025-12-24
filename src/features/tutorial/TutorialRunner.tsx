/**
 * TutorialRunner - Orchestrates tutorial step playback
 *
 * Responsibilities:
 * - Sequences through tutorial steps
 * - Coordinates ManimText, GoldenDot, and GoldenGlow
 * - Executes actions (focus node, flip, etc.)
 * - Handles auto-advance timing
 *
 * Renders inside DreamspaceCanvas (3D context)
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Html } from '@react-three/drei';
import { ManimText } from './ManimText';
import { GoldenDot } from './GoldenDot';
import { TutorialAction } from './types';
import { MVP_TUTORIAL_STEPS } from './steps/mvp-steps';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { serviceManager } from '../../core/services/service-manager';
import { musicService } from './services/music-service';

interface TutorialRunnerProps {
  /** Whether tutorial is active */
  isActive: boolean;
  /** Callback when tutorial completes */
  onComplete?: () => void;
  /** Callback when tutorial is skipped */
  onSkip?: () => void;
}

export const TutorialRunner: React.FC<TutorialRunnerProps> = ({
  isActive,
  onComplete,
  onSkip,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [showText, setShowText] = useState(false);
  const [showGoldenDot, setShowGoldenDot] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store actions
  const setSelectedNode = useInterBrainStore(state => state.setSelectedNode);
  const setSpatialLayout = useInterBrainStore(state => state.setSpatialLayout);
  const setHighlightedNodeId = useInterBrainStore(state => state.setHighlightedNodeId);

  const currentStep = MVP_TUTORIAL_STEPS[currentStepIndex];

  /**
   * Execute a tutorial action
   */
  const executeAction = useCallback(async (action: TutorialAction) => {
    console.log('[TutorialRunner] Executing action:', action.type);

    switch (action.type) {
      case 'select-node': {
        const dreamNodeService = serviceManager.getActive();
        const node = await dreamNodeService.get(action.nodeId);
        if (node) {
          setSelectedNode(node);
        }
        break;
      }

      case 'focus-node': {
        const dreamNodeService = serviceManager.getActive();
        const node = await dreamNodeService.get(action.nodeId);
        if (node) {
          setSelectedNode(node);
          setSpatialLayout('liminal-web');
        }
        break;
      }

      case 'flip-node': {
        const commandId = action.direction === 'back'
          ? 'interbrain:flip-dreamnode-to-back'
          : 'interbrain:flip-dreamnode-to-front';
        const app = serviceManager.getApp();
        if (app) {
          (app as any).commands.executeCommandById(commandId);
        }
        break;
      }

      case 'set-layout': {
        setSpatialLayout(action.layout);
        break;
      }

      case 'execute-command': {
        const app = serviceManager.getApp();
        if (app) {
          (app as any).commands.executeCommandById(action.commandId);
        }
        break;
      }

      case 'highlight-glow': {
        setHighlightedNodeId(action.nodeId);
        setTimeout(() => {
          setHighlightedNodeId(null);
        }, action.duration);
        break;
      }

      case 'wait': {
        await new Promise(resolve => setTimeout(resolve, action.duration));
        break;
      }
    }
  }, [setSelectedNode, setSpatialLayout, setHighlightedNodeId]);

  /**
   * Advance to next step
   */
  const advanceStep = useCallback(() => {
    if (currentStepIndex < MVP_TUTORIAL_STEPS.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      // Tutorial complete
      onComplete?.();
    }
  }, [currentStepIndex, onComplete]);

  /**
   * Handle step entry
   */
  useEffect(() => {
    if (!isActive || !currentStep) return;

    console.log('[TutorialRunner] Entering step:', currentStep.id);

    // Clear any existing timer
    if (timerRef.current) {
      globalThis.clearTimeout(timerRef.current);
    }

    // Execute onEnter action
    if (currentStep.onEnter) {
      executeAction(currentStep.onEnter);
    }

    // Show text if present
    if (currentStep.text) {
      setShowText(true);
    }

    // Show golden dot if present
    if (currentStep.goldenDot) {
      setShowGoldenDot(true);
    }

    // Handle highlight
    if (currentStep.highlightNode) {
      setHighlightedNodeId(currentStep.highlightNode.nodeId);
    }

    // Set up auto-advance timer
    if (currentStep.advance.type === 'auto') {
      const textDuration = currentStep.text?.duration || 0;
      const dotDuration = (currentStep.goldenDot?.duration || 0) * 1000;
      const advanceDelay = currentStep.advance.delay || 0;

      const totalDelay = Math.max(textDuration, dotDuration) + advanceDelay;

      timerRef.current = setTimeout(() => {
        // Execute onExit action
        if (currentStep.onExit) {
          executeAction(currentStep.onExit);
        }

        // Clear highlight
        if (currentStep.highlightNode) {
          setHighlightedNodeId(null);
        }

        // Reset visual state
        setShowText(false);
        setShowGoldenDot(false);

        // Small delay before next step
        setTimeout(advanceStep, 200);
      }, totalDelay);
    }

    return () => {
      if (timerRef.current) {
        globalThis.clearTimeout(timerRef.current);
      }
    };
  }, [isActive, currentStepIndex, currentStep, executeAction, advanceStep, setHighlightedNodeId]);

  // Handle music playback based on tutorial active state
  useEffect(() => {
    if (isActive) {
      // Initialize and start music when tutorial becomes active
      const app = serviceManager.getApp();
      if (app) {
        musicService.initialize(app);
        musicService.play(2000); // 2 second fade-in
      }
    } else {
      // Stop music when tutorial ends
      musicService.stop(1500); // 1.5 second fade-out
    }

    // Cleanup on unmount
    return () => {
      if (!isActive) {
        musicService.cleanup();
      }
    };
  }, [isActive]);

  // Reset when becoming inactive
  useEffect(() => {
    if (!isActive) {
      setCurrentStepIndex(0);
      setShowText(false);
      setShowGoldenDot(false);
      setHighlightedNodeId(null);
    }
  }, [isActive, setHighlightedNodeId]);

  if (!isActive || !currentStep) {
    return null;
  }

  return (
    <group>
      {/* ManimText display */}
      {showText && currentStep.text && (
        <Html
          position={currentStep.text.position}
          center
          transform
          sprite
          distanceFactor={10}
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
            width: '800px',
            height: '200px',
          }}
        >
          <ManimText
            text={currentStep.text.content}
            fontSize={currentStep.text.fontSize || 48}
            strokeDuration={1.5}
            fillDelay={0.2}
            fadeStroke={true}
          />
        </Html>
      )}

      {/* GoldenDot animation */}
      {showGoldenDot && currentStep.goldenDot && (
        <GoldenDot
          from={currentStep.goldenDot.from}
          to={currentStep.goldenDot.to}
          controlPoints={currentStep.goldenDot.controlPoints}
          duration={currentStep.goldenDot.duration || 2}
          easing={currentStep.goldenDot.easing || 'easeInOut'}
          hitDetectionNodeIds={currentStep.goldenDot.hitDetectionNodeIds}
          onComplete={() => setShowGoldenDot(false)}
        />
      )}

      {/* Skip button - positioned in corner */}
      <Html
        position={[20, 15, -50]}
        center
        transform
        sprite
        distanceFactor={10}
        style={{
          pointerEvents: 'auto',
          userSelect: 'none',
        }}
      >
        <button
          onClick={() => onSkip?.()}
          style={{
            padding: '8px 16px',
            background: 'rgba(0, 0, 0, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '4px',
            color: 'rgba(255, 255, 255, 0.7)',
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.8)';
            e.currentTarget.style.color = 'white';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
          }}
        >
          Skip Tutorial
        </button>
      </Html>

      {/* Progress indicator */}
      <Html
        position={[0, -18, -50]}
        center
        transform
        sprite
        distanceFactor={10}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <div style={{
          display: 'flex',
          gap: '6px',
          alignItems: 'center',
        }}>
          {MVP_TUTORIAL_STEPS.map((_, index) => (
            <div
              key={index}
              style={{
                width: index === currentStepIndex ? '24px' : '8px',
                height: '8px',
                borderRadius: '4px',
                background: index <= currentStepIndex
                  ? 'rgba(255, 215, 0, 0.8)'
                  : 'rgba(255, 255, 255, 0.3)',
                transition: 'all 0.3s ease',
              }}
            />
          ))}
        </div>
      </Html>
    </group>
  );
};

export default TutorialRunner;
