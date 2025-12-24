import React, { useEffect, useState } from 'react';
import { Html, Billboard } from '@react-three/drei';
import { ManimText } from './ManimText';
import { GoldenDot } from './GoldenDot';
import { tutorialService, TutorialStep, GoldenDotAnimation, TextAnimation } from './TutorialService';
import './tutorial-styles.css';

/**
 * TutorialOverlay - Renders tutorial steps in 3D space
 *
 * Uses Billboard → Html structure (like DreamNode3D but without rotation)
 * Displays ManimText animations for each step
 */
export const TutorialOverlay: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<TutorialStep | null>(null);
  const [showAnimation, setShowAnimation] = useState(false);
  const [goldenDot, setGoldenDot] = useState<GoldenDotAnimation | null>(null);
  const [textAnimation, setTextAnimation] = useState<TextAnimation | null>(null);

  useEffect(() => {
    // Subscribe to tutorial step changes
    const unsubscribe = tutorialService.onStepChange((step) => {
      if (step) {
        setShowAnimation(false); // Reset animation
        setCurrentStep(step);

        // Trigger animation after brief delay
        setTimeout(() => setShowAnimation(true), 100);

        // Auto-advance if step has duration
        if (step.duration) {
          setTimeout(() => {
            tutorialService.next();
          }, step.duration);
        }
      } else {
        // Tutorial completed or skipped
        setCurrentStep(null);
      }
    });

    // Subscribe to golden dot changes
    const unsubscribeGoldenDot = tutorialService.onGoldenDotChange((animation) => {
      setGoldenDot(animation);
    });

    // Load current step on mount
    const step = tutorialService.getCurrentStep();
    if (step) {
      setCurrentStep(step);
      setShowAnimation(true);
    }

    // Load current golden dot animation on mount
    const dotAnimation = tutorialService.getGoldenDotAnimation();
    if (dotAnimation) {
      setGoldenDot(dotAnimation);
    }

    // Subscribe to text animation changes
    const unsubscribeText = tutorialService.onTextAnimationChange((animation) => {
      setTextAnimation(animation);
    });

    // Load current text animation on mount
    const currentTextAnimation = tutorialService.getTextAnimation();
    if (currentTextAnimation) {
      setTextAnimation(currentTextAnimation);
    }

    return () => {
      unsubscribe();
      unsubscribeGoldenDot();
      unsubscribeText();
    };
  }, []);

  // Handle golden dot completion
  const handleGoldenDotComplete = () => {
    tutorialService.clearGoldenDot();
  };

  // Render nothing if no active tutorial elements
  if (!currentStep && !goldenDot && !textAnimation) {
    return null;
  }

  return (
    <>
      {/* Golden Dot - sovereign animation element */}
      {goldenDot && (
        'fromNodeId' in goldenDot && goldenDot.fromNodeId ? (
          // Node-based animation
          <GoldenDot
            fromNodeId={goldenDot.fromNodeId}
            toNodeId={goldenDot.toNodeId}
            controlPoints={goldenDot.controlPoints}
            duration={goldenDot.duration}
            size={goldenDot.size}
            easing={goldenDot.easing}
            hitDetectionNodeIds={goldenDot.hitDetectionNodeIds}
            onComplete={handleGoldenDotComplete}
            visible={true}
          />
        ) : (
          // Position-based animation
          <GoldenDot
            from={(goldenDot as any).from}
            to={(goldenDot as any).to}
            controlPoints={goldenDot.controlPoints}
            duration={goldenDot.duration}
            size={goldenDot.size}
            easing={goldenDot.easing}
            hitDetectionNodeIds={goldenDot.hitDetectionNodeIds}
            onComplete={handleGoldenDotComplete}
            visible={true}
          />
        )
      )}

      {/* Tutorial Text - sovereign animation element (from steps) */}
      {currentStep && (
        <group position={currentStep.position || [0, 0, -25]}>
          <Billboard follow={true} lockX={false} lockY={false} lockZ={false}>
            <Html
              position={[0, 0, 0]}
              center
              transform
              distanceFactor={10}
              style={{
                pointerEvents: 'none'
              }}
            >
              <div style={{
                background: 'transparent',
                width: '600px',
                textAlign: 'center'
              }}>
                {showAnimation && (
                  <ManimText
                    key={currentStep.title}
                    text={currentStep.title}
                    strokeDuration={2}
                    fillDelay={0.3}
                    fadeStroke={true}
                    fontSize={48}
                  />
                )}
              </div>
            </Html>
          </Billboard>
        </group>
      )}

      {/* Standalone Text Animation - decoupled from tutorial steps */}
      {textAnimation && (
        <Html
          position={textAnimation.position}
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
            background: 'transparent',
            whiteSpace: 'nowrap',
          }}>
            <ManimText
              key={`${textAnimation.text}-${textAnimation.position.join(',')}`}
              text={textAnimation.text}
              strokeDuration={1.5}
              fillDelay={0.2}
              fadeStroke={true}
              fontSize={textAnimation.fontSize || 48}
            />
          </div>
        </Html>
      )}
    </>
  );
};
