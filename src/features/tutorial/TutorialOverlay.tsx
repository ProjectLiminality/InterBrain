import React, { useEffect, useState } from 'react';
import { Html, Billboard } from '@react-three/drei';
import { ManimText } from './ManimText';
import { tutorialService, TutorialStep } from './TutorialService';
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

    // Load current step on mount
    const step = tutorialService.getCurrentStep();
    console.log('🎓 [TutorialOverlay] Initial step on mount:', step);
    if (step) {
      setCurrentStep(step);
      setShowAnimation(true);
    }

    return unsubscribe;
  }, []);

  if (!currentStep) {
    console.log('🎓 [TutorialOverlay] No current step, rendering nothing');
    return null;
  }

  console.log('🎓 [TutorialOverlay] Rendering step:', currentStep.title);

  return (
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
  );
};
