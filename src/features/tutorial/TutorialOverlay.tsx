import React, { useEffect, useState } from 'react';
import { Html, Billboard } from '@react-three/drei';
import { ManimText } from './ManimText';
import { GoldenDot } from './GoldenDot';
import { tutorialService, TutorialStep, GoldenDotAnimation } from './TutorialService';
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

  useEffect(() => {
    console.log('🎓 [TutorialOverlay] Mounting and subscribing to tutorial service');

    // Subscribe to tutorial step changes
    const unsubscribe = tutorialService.onStepChange((step) => {
      console.log('🎓 [TutorialOverlay] Step changed:', step);
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
      console.log('✨ [TutorialOverlay] Golden dot changed:', animation);
      setGoldenDot(animation);
    });

    // Load current step on mount
    const step = tutorialService.getCurrentStep();
    console.log('🎓 [TutorialOverlay] Initial step on mount:', step);
    if (step) {
      setCurrentStep(step);
      setShowAnimation(true);
    }

    // Load current golden dot animation on mount
    const dotAnimation = tutorialService.getGoldenDotAnimation();
    if (dotAnimation) {
      setGoldenDot(dotAnimation);
    }

    return () => {
      unsubscribe();
      unsubscribeGoldenDot();
    };
  }, []);

  // Handle golden dot completion
  const handleGoldenDotComplete = () => {
    console.log('✨ [TutorialOverlay] Golden dot reached destination');
    tutorialService.clearGoldenDot();
  };

  // Render nothing if no active tutorial elements
  if (!currentStep && !goldenDot) {
    return null;
  }

  console.log('🎓 [TutorialOverlay] Rendering - step:', currentStep?.title, 'goldenDot:', !!goldenDot);

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

      {/* Tutorial Text - sovereign animation element */}
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
    </>
  );
};
