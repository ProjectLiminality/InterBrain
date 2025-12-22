/**
 * Preview Banner
 *
 * A floating banner that appears when preview mode is active.
 * Shows the user they're previewing commits and provides quick actions.
 *
 * The banner is non-modal and stays visible while the user explores
 * the changes in their vault.
 */

/* eslint-disable no-undef */

import { App } from 'obsidian';
import {
  getCherryPickWorkflowService,
  PreviewState
} from '../services/cherry-pick-workflow-service';

export interface PreviewBannerCallbacks {
  /** Called when user accepts the preview */
  onAccept: () => Promise<void>;
  /** Called when user rejects the preview */
  onReject: () => Promise<void>;
  /** Called when user cancels (decides later) */
  onCancel: () => Promise<void>;
}

export class PreviewBanner {
  private app: App;
  private bannerEl: HTMLElement | null = null;
  private callbacks: PreviewBannerCallbacks | null = null;
  private isProcessing = false;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Show the preview banner
   */
  show(callbacks: PreviewBannerCallbacks) {
    // Remove existing banner if present
    this.hide();

    this.callbacks = callbacks;

    const workflowService = getCherryPickWorkflowService();
    const previewState = workflowService.getPreviewState();

    if (!previewState || !previewState.isActive) {
      console.warn('[PreviewBanner] No active preview to show banner for');
      return;
    }

    this.bannerEl = this.createBanner(previewState);
    document.body.appendChild(this.bannerEl);

    // Add entry animation
    requestAnimationFrame(() => {
      this.bannerEl?.classList.add('preview-banner-visible');
    });
  }

  /**
   * Hide and remove the banner
   */
  hide() {
    if (this.bannerEl) {
      this.bannerEl.classList.remove('preview-banner-visible');
      // Wait for exit animation
      setTimeout(() => {
        this.bannerEl?.remove();
        this.bannerEl = null;
      }, 200);
    }
    this.callbacks = null;
    this.isProcessing = false;
  }

  /**
   * Check if banner is currently visible
   */
  isVisible(): boolean {
    return this.bannerEl !== null;
  }

  /**
   * Update banner state (e.g., after processing)
   */
  update() {
    if (!this.bannerEl || !this.callbacks) return;

    const workflowService = getCherryPickWorkflowService();
    const previewState = workflowService.getPreviewState();

    if (!previewState || !previewState.isActive) {
      this.hide();
      return;
    }

    // Re-render content
    this.bannerEl.innerHTML = '';
    this.renderContent(this.bannerEl, previewState);
  }

  private createBanner(previewState: PreviewState): HTMLElement {
    const banner = document.createElement('div');
    banner.className = 'preview-banner';

    this.renderContent(banner, previewState);
    this.addStyles();

    return banner;
  }

  private renderContent(container: HTMLElement, previewState: PreviewState) {
    // Compact inline layout: icon + text + buttons
    // All in a single thin row

    // Preview indicator
    const labelEl = container.createSpan({ cls: 'preview-banner-label' });
    labelEl.innerHTML = `👀 <strong>Preview</strong> · ${previewState.commitCount} commit${previewState.commitCount !== 1 ? 's' : ''}`;

    if (previewState.didStash) {
      container.createSpan({
        text: ' · 💾 stashed',
        cls: 'preview-banner-stash'
      });
    }

    // Spacer
    container.createDiv({ cls: 'preview-banner-spacer' });

    // Actions - inline buttons
    if (this.isProcessing) {
      container.createSpan({
        text: 'Processing...',
        cls: 'preview-banner-processing'
      });
    } else {
      const acceptBtn = container.createEl('button', {
        text: '✓ Accept',
        cls: 'preview-banner-btn preview-banner-btn-accept'
      });
      acceptBtn.addEventListener('click', () => this.handleAccept());

      const rejectBtn = container.createEl('button', {
        text: '✗ Reject',
        cls: 'preview-banner-btn preview-banner-btn-reject'
      });
      rejectBtn.addEventListener('click', () => this.handleReject());

      const cancelBtn = container.createEl('button', {
        text: 'Later',
        cls: 'preview-banner-btn preview-banner-btn-cancel'
      });
      cancelBtn.addEventListener('click', () => this.handleCancel());
    }
  }

  private async handleAccept() {
    if (this.isProcessing || !this.callbacks) return;

    this.isProcessing = true;
    this.update();

    try {
      await this.callbacks.onAccept();
      this.hide();
    } catch (error) {
      console.error('[PreviewBanner] Accept failed:', error);
      this.isProcessing = false;
      this.update();
    }
  }

  private async handleReject() {
    if (this.isProcessing || !this.callbacks) return;

    this.isProcessing = true;
    this.update();

    try {
      await this.callbacks.onReject();
      this.hide();
    } catch (error) {
      console.error('[PreviewBanner] Reject failed:', error);
      this.isProcessing = false;
      this.update();
    }
  }

  private async handleCancel() {
    if (this.isProcessing || !this.callbacks) return;

    this.isProcessing = true;
    this.update();

    try {
      await this.callbacks.onCancel();
      this.hide();
    } catch (error) {
      console.error('[PreviewBanner] Cancel failed:', error);
      this.isProcessing = false;
      this.update();
    }
  }

  private addStyles() {
    const styleId = 'preview-banner-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .preview-banner {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 10000;

        display: flex;
        align-items: center;
        gap: 0.75em;

        background: var(--background-primary);
        border-top: 2px solid var(--interactive-accent);
        padding: 0.5em 1em;
        box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.15);

        /* Non-blocking: allow clicks to pass through gaps */
        pointer-events: auto;

        opacity: 0;
        transform: translateY(100%);
        transition: transform 0.2s ease-out, opacity 0.2s ease-out;
      }

      .preview-banner-visible {
        transform: translateY(0);
        opacity: 1;
      }

      .preview-banner-label {
        color: var(--text-normal);
        font-size: 0.9em;
        white-space: nowrap;
      }

      .preview-banner-label strong {
        color: var(--interactive-accent);
      }

      .preview-banner-stash {
        font-size: 0.85em;
        color: var(--text-faint);
        white-space: nowrap;
      }

      .preview-banner-spacer {
        flex: 1;
      }

      .preview-banner-btn {
        border: none;
        border-radius: 4px;
        padding: 0.4em 0.8em;
        cursor: pointer;
        font-size: 0.85em;
        font-weight: 500;
        transition: background 0.15s, transform 0.1s;
        white-space: nowrap;
      }

      .preview-banner-btn:hover {
        transform: translateY(-1px);
      }

      .preview-banner-btn:active {
        transform: translateY(0);
      }

      .preview-banner-btn-accept {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
      }

      .preview-banner-btn-accept:hover {
        background: var(--interactive-accent-hover);
      }

      .preview-banner-btn-reject {
        background: var(--background-modifier-error);
        color: var(--text-on-accent);
      }

      .preview-banner-btn-reject:hover {
        opacity: 0.9;
      }

      .preview-banner-btn-cancel {
        background: var(--background-modifier-border);
        color: var(--text-normal);
      }

      .preview-banner-btn-cancel:hover {
        background: var(--background-modifier-border-hover);
      }

      .preview-banner-processing {
        color: var(--text-muted);
        font-style: italic;
        font-size: 0.85em;
      }

      /* Responsive adjustments */
      @media (max-width: 500px) {
        .preview-banner {
          padding: 0.4em 0.6em;
          gap: 0.5em;
        }

        .preview-banner-stash {
          display: none;
        }

        .preview-banner-btn {
          padding: 0.35em 0.6em;
          font-size: 0.8em;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

// Singleton instance
let previewBannerInstance: PreviewBanner | null = null;

export function initializePreviewBanner(app: App): PreviewBanner {
  previewBannerInstance = new PreviewBanner(app);
  return previewBannerInstance;
}

export function getPreviewBanner(): PreviewBanner {
  if (!previewBannerInstance) {
    throw new Error('PreviewBanner not initialized');
  }
  return previewBannerInstance;
}

export function showPreviewBanner(callbacks: PreviewBannerCallbacks): void {
  if (!previewBannerInstance) {
    console.warn('[PreviewBanner] Not initialized, cannot show banner');
    return;
  }
  previewBannerInstance.show(callbacks);
}

export function hidePreviewBanner(): void {
  if (previewBannerInstance) {
    previewBannerInstance.hide();
  }
}
