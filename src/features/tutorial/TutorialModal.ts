import { Modal, App } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import React from 'react';
import { ManimText } from './ManimText';
import { tutorialService, TutorialStep } from './TutorialService';

/**
 * TutorialModal - Native Obsidian modal for tutorial steps
 *
 * Uses Obsidian's Modal API with React rendering for ManimText animation
 */
export class TutorialModal extends Modal {
  private root: Root | null = null;
  private currentStep: TutorialStep | null = null;
  private autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;

    // Style the modal
    this.modalEl.addClass('tutorial-modal');
    contentEl.empty();

    // Create container for React
    const container = contentEl.createDiv({ cls: 'tutorial-modal-content' });

    // Get current step
    this.currentStep = tutorialService.getCurrentStep();

    if (!this.currentStep) {
      console.warn('🎓 [TutorialModal] No current step available');
      this.close();
      return;
    }

    console.log('🎓 [TutorialModal] Opening with step:', this.currentStep.title);

    // Render React component
    this.root = createRoot(container);
    this.renderStep();

    // Set up auto-advance
    if (this.currentStep.duration) {
      this.autoAdvanceTimer = setTimeout(() => {
        this.nextStep();
      }, this.currentStep.duration);
    }
  }

  private renderStep() {
    if (!this.root || !this.currentStep) return;

    const step = this.currentStep;

    this.root.render(
      React.createElement('div', { className: 'tutorial-step' },
        // ManimText animation - key forces remount on text change
        React.createElement(ManimText, {
          key: step.title, // Force remount when title changes
          text: step.title,
          strokeDuration: 2,
          fillDelay: 0.3,
          fadeStroke: true,
          fontSize: 48
        }),

        // Description
        React.createElement('div', {
          className: 'tutorial-description',
          style: {
            marginTop: '2rem',
            fontSize: '1.2rem',
            textAlign: 'center',
            opacity: 0,
            animation: 'fadeIn 0.5s ease-in 2.5s forwards'
          }
        }, step.description),

        // Button container
        React.createElement('div', {
          className: 'tutorial-buttons',
          style: {
            marginTop: '2rem',
            display: 'flex',
            gap: '1rem',
            justifyContent: 'center'
          }
        },
          // Skip button
          React.createElement('button', {
            className: 'mod-cta',
            onClick: () => this.skipTutorial()
          }, 'Skip Tutorial'),

          // Next button (if not auto-advancing)
          !step.duration && React.createElement('button', {
            className: 'mod-cta',
            onClick: () => this.nextStep()
          }, 'Next')
        )
      )
    );
  }

  private nextStep() {
    if (this.autoAdvanceTimer) {
      globalThis.clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }

    tutorialService.next();
    this.currentStep = tutorialService.getCurrentStep();

    if (this.currentStep) {
      // Re-render with new step
      this.renderStep();

      // Set up auto-advance for new step
      if (this.currentStep.duration) {
        this.autoAdvanceTimer = setTimeout(() => {
          this.nextStep();
        }, this.currentStep.duration);
      }
    } else {
      // Tutorial complete
      this.close();
    }
  }

  private skipTutorial() {
    if (this.autoAdvanceTimer) {
      globalThis.clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }

    tutorialService.skip();
    this.close();
  }

  onClose() {
    const { contentEl } = this;

    // Clean up auto-advance timer
    if (this.autoAdvanceTimer) {
      globalThis.clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }

    // Clean up React
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }

    contentEl.empty();
  }
}
