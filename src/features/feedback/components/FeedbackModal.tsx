/**
 * FeedbackModal - Obsidian Modal for bug report submission
 *
 * Features:
 * - Error display
 * - User description textarea
 * - Checkbox toggles for data inclusion
 * - Submit buttons (raw / AI-refined)
 * - Loading state during submission
 */

import { Modal, App, Setting, Notice } from 'obsidian';
import { useInterBrainStore } from '../../../core/store/interbrain-store';
import { feedbackService } from '../services/feedback-service';
import { settingsStatusService } from '../../settings/settings-status-service';

export class FeedbackModal extends Modal {
  private userDescription: string = '';
  private reproductionSteps: string = '';
  private includeLogs: boolean;
  private includeState: boolean;
  private isSubmitting: boolean = false;

  constructor(app: App) {
    super(app);

    // Initialize from store preferences
    const state = useInterBrainStore.getState();
    this.includeLogs = state.feedback.includeLogs;
    this.includeState = state.feedback.includeState;
  }

  onOpen() {
    const { contentEl } = this;
    const state = useInterBrainStore.getState();
    const currentError = state.feedback.currentError;
    const hasApiKey = !!settingsStatusService.getSettings()?.claudeApiKey;

    contentEl.empty();
    contentEl.addClass('interbrain-feedback-modal');

    // Title
    contentEl.createEl('h2', { text: 'Report an Issue' });

    // Error display (if there's an error)
    if (currentError) {
      const errorContainer = contentEl.createDiv({
        cls: 'interbrain-feedback-error',
      });
      errorContainer.createEl('div', {
        text: 'Error:',
        cls: 'interbrain-feedback-error-label',
      });
      errorContainer.createEl('code', {
        text: currentError.message,
        cls: 'interbrain-feedback-error-message',
      });
    }

    // Description input
    contentEl.createEl('p', {
      text: 'What were you doing when this happened?',
    });

    new Setting(contentEl)
      .setClass('interbrain-feedback-description')
      .addTextArea((ta) => {
        ta.setPlaceholder(
          'Describe what you were trying to do and what went wrong...'
        );
        ta.inputEl.rows = 4;
        ta.inputEl.style.width = '100%';
        ta.onChange((value) => {
          this.userDescription = value;
        });
      });

    // Reproduction steps (optional)
    contentEl.createEl('p', {
      text: 'Steps to reproduce (optional)',
      cls: 'interbrain-feedback-optional-label',
    });

    new Setting(contentEl)
      .setClass('interbrain-feedback-description')
      .addTextArea((ta) => {
        ta.setPlaceholder(
          '1. Open...\n2. Click...\n3. Observe...'
        );
        ta.inputEl.rows = 3;
        ta.inputEl.style.width = '100%';
        ta.onChange((value) => {
          this.reproductionSteps = value;
        });
      });

    // Data inclusion toggles
    contentEl.createEl('h3', { text: 'Data to include' });

    new Setting(contentEl)
      .setName('Console logs')
      .setDesc('Include recent console output (helps debug)')
      .addToggle((toggle) => {
        toggle.setValue(this.includeLogs);
        toggle.onChange((value) => {
          this.includeLogs = value;
          useInterBrainStore.getState().setIncludeLogs(value);
        });
      });

    new Setting(contentEl)
      .setName('App state')
      .setDesc('Include current app state (sanitized)')
      .addToggle((toggle) => {
        toggle.setValue(this.includeState);
        toggle.onChange((value) => {
          this.includeState = value;
          useInterBrainStore.getState().setIncludeState(value);
        });
      });

    // Submit buttons
    const buttonContainer = contentEl.createDiv({
      cls: 'interbrain-feedback-buttons',
    });

    // Cancel button
    const cancelButton = buttonContainer.createEl('button', {
      text: 'Cancel',
      cls: 'mod-cancel',
    });
    cancelButton.addEventListener('click', () => {
      this.close();
    });

    // Send Raw button
    const sendRawButton = buttonContainer.createEl('button', {
      text: 'Send Report',
    });
    sendRawButton.addEventListener('click', async () => {
      await this.submitReport(false);
    });

    // Send with AI button (only if API key available)
    if (hasApiKey) {
      const sendAiButton = buttonContainer.createEl('button', {
        text: 'Send + AI Refine',
        cls: 'mod-cta',
      });
      sendAiButton.addEventListener('click', async () => {
        await this.submitReport(true);
      });
    } else {
      // Show hint about AI refinement
      const hint = buttonContainer.createEl('span', {
        text: 'AI refinement requires Claude API key',
        cls: 'interbrain-feedback-hint',
      });
      hint.style.fontSize = '0.8em';
      hint.style.opacity = '0.7';
      hint.style.marginLeft = '8px';
    }

    // Add styles
    this.addStyles();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();

    // Clear the current error from store
    useInterBrainStore.getState().closeFeedbackModal();
  }

  private async submitReport(useAi: boolean): Promise<void> {
    if (this.isSubmitting) return;
    this.isSubmitting = true;

    const state = useInterBrainStore.getState();
    const currentError = state.feedback.currentError;

    // Show loading state
    const { contentEl } = this;
    const buttons = contentEl.querySelectorAll('button');
    buttons.forEach((btn) => {
      btn.disabled = true;
      btn.style.opacity = '0.5';
    });

    try {
      const result = await feedbackService.submitReport(
        currentError,
        this.userDescription,
        {
          includeLogs: this.includeLogs,
          includeState: this.includeState,
          useAiRefinement: useAi,
          reproductionSteps: this.reproductionSteps || undefined,
        }
      );

      if (result.success) {
        const message = result.wasDuplicate
          ? `Your report was added to an existing issue.\n${result.issueUrl || ''}`
          : `Issue submitted successfully!\n${result.issueUrl || ''}`;
        new Notice(message, 5000);
        this.close();
      } else {
        console.error('[FeedbackModal] Submit failed:', result.error);
        new Notice(`Failed to submit: ${result.error}`, 5000);
        // Re-enable buttons
        buttons.forEach((btn) => {
          btn.disabled = false;
          btn.style.opacity = '1';
        });
        this.isSubmitting = false;
      }
    } catch (err) {
      console.error('[FeedbackModal] Submit error:', err);
      new Notice(
        `Error submitting report: ${err instanceof Error ? err.message : String(err)}`,
        5000
      );
      // Re-enable buttons
      buttons.forEach((btn) => {
        btn.disabled = false;
        btn.style.opacity = '1';
      });
      this.isSubmitting = false;
    }
  }

  private addStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .interbrain-feedback-modal {
        max-width: 500px;
      }

      .interbrain-feedback-error {
        background: var(--background-modifier-error);
        padding: 12px;
        border-radius: 6px;
        margin-bottom: 16px;
      }

      .interbrain-feedback-error-label {
        font-weight: 600;
        margin-bottom: 4px;
      }

      .interbrain-feedback-error-message {
        word-break: break-word;
        display: block;
        padding: 8px;
        background: var(--background-primary);
        border-radius: 4px;
      }

      .interbrain-feedback-description .setting-item-control {
        width: 100%;
      }

      .interbrain-feedback-buttons {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        margin-top: 16px;
        align-items: center;
      }

      .interbrain-feedback-hint {
        margin-right: auto;
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Helper function to show the feedback modal
 */
export function showFeedbackModal(app: App): void {
  new FeedbackModal(app).open();
}
