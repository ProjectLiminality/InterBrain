/**
 * Conflict Resolution Modal
 *
 * Displays merge conflicts to users and offers resolution options:
 * 1. Keep ours (reject incoming change)
 * 2. Keep theirs (accept incoming, discard local)
 * 3. Resolve with AI Magic (semantic merge)
 *
 * Shows the conflict details and resolution explanation.
 */


import { App, Modal } from 'obsidian';
import {
  ConflictInfo,
  ConflictRegion,
  MergeResolution,
  getSmartMergeService
} from '../services/smart-merge-service';

export interface ConflictResolutionConfig {
  /** Path to the repository */
  repoPath: string;
  /** Conflict information */
  conflict: ConflictInfo;
  /** Commit being cherry-picked */
  commitSubject: string;
  /** Callback when conflict is resolved - returns success/failure */
  onResolved: (resolution: MergeResolution) => Promise<{ success: boolean; error?: string }>;
  /** Callback when user cancels */
  onCancel: () => void;
  /** Callback to report a failed resolution for feedback/analytics */
  onReportFailure?: (conflict: ConflictInfo, resolution: MergeResolution, error: string) => Promise<void>;
}

export class ConflictResolutionModal extends Modal {
  private config: ConflictResolutionConfig;
  private isProcessing = false;
  private resolution: MergeResolution | null = null;
  private lastRefinement: string | null = null; // Only keep the last refinement
  private wasAccepted = false; // Track if user accepted the resolution
  private retryCount = 0; // Track how many times AI has retried
  private lastApplyError: string | null = null; // Track the last error when applying resolution

  constructor(app: App, config: ConflictResolutionConfig) {
    super(app);
    this.config = config;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('conflict-resolution-modal');

    this.renderContent();
    this.addStyles();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    // Always abort conflict state if user didn't explicitly accept
    // This handles: X button, Escape key, clicking outside modal
    if (!this.wasAccepted) {
      this.config.onCancel();
    }
  }

  private renderContent() {
    const { contentEl } = this;
    contentEl.empty();

    if (this.resolution?.success) {
      this.renderResolutionSuccess();
      return;
    }

    if (this.isProcessing) {
      this.renderProcessing();
      return;
    }

    this.renderConflictDetails();
  }

  private renderConflictDetails() {
    const { contentEl } = this;
    const { conflict, commitSubject } = this.config;
    const region = conflict.conflictRegions[0];

    // Header
    contentEl.createEl('h2', {
      text: 'Merge Conflict Detected',
      cls: 'conflict-modal-title'
    });

    // Explanation
    const explainEl = contentEl.createDiv({ cls: 'conflict-explanation' });
    explainEl.createEl('p', {
      text: `While applying: "${commitSubject}"`,
      cls: 'conflict-commit-info'
    });
    explainEl.createEl('p', {
      text: `Conflict in: ${conflict.filePath}`,
      cls: 'conflict-file-info'
    });

    // Conflict visualization
    const conflictBox = contentEl.createDiv({ cls: 'conflict-visualization' });

    // Context before
    if (region.contextBefore) {
      const ctxBefore = conflictBox.createDiv({ cls: 'conflict-context' });
      ctxBefore.createEl('pre', { text: truncateLines(region.contextBefore, 3) });
    }

    // Our version
    const oursSection = conflictBox.createDiv({ cls: 'conflict-section conflict-ours' });
    oursSection.createEl('div', {
      text: 'Your current version:',
      cls: 'conflict-section-label'
    });
    oursSection.createEl('pre', {
      text: region.ours || '(empty)',
      cls: 'conflict-section-content'
    });

    // Separator
    conflictBox.createDiv({ cls: 'conflict-separator' }).createEl('span', { text: 'vs' });

    // Their version
    const theirsSection = conflictBox.createDiv({ cls: 'conflict-section conflict-theirs' });
    theirsSection.createEl('div', {
      text: 'Incoming change:',
      cls: 'conflict-section-label'
    });
    theirsSection.createEl('pre', {
      text: region.theirs || '(empty)',
      cls: 'conflict-section-content'
    });

    // Context after
    if (region.contextAfter) {
      const ctxAfter = conflictBox.createDiv({ cls: 'conflict-context' });
      ctxAfter.createEl('pre', { text: truncateLines(region.contextAfter, 3) });
    }

    // Resolution options
    const optionsEl = contentEl.createDiv({ cls: 'conflict-options' });
    optionsEl.createEl('h3', { text: 'How would you like to resolve this?' });

    // Option 1: AI Magic (recommended)
    const aiOption = optionsEl.createDiv({ cls: 'conflict-option conflict-option-recommended' });
    const aiBtn = aiOption.createEl('button', {
      text: 'Resolve with AI Magic',
      cls: 'conflict-btn conflict-btn-ai'
    });
    aiBtn.addEventListener('click', () => this.resolveWithAI());
    aiOption.createEl('p', {
      text: 'AI will intelligently merge both changes, preserving content from both versions.',
      cls: 'conflict-option-desc'
    });

    // Option 2: Override (take incoming, discard local)
    const theirsOption = optionsEl.createDiv({ cls: 'conflict-option' });
    const theirsBtn = theirsOption.createEl('button', {
      text: 'Override',
      cls: 'conflict-btn conflict-btn-theirs'
    });
    theirsBtn.addEventListener('click', () => this.resolveKeepTheirs());
    theirsOption.createEl('p', {
      text: 'Discard your local changes and use the incoming version as-is.',
      cls: 'conflict-option-desc'
    });

    // Option 3: Reject (full rejection of this commit)
    const oursOption = optionsEl.createDiv({ cls: 'conflict-option' });
    const oursBtn = oursOption.createEl('button', {
      text: 'Reject',
      cls: 'conflict-btn conflict-btn-ours'
    });
    oursBtn.addEventListener('click', () => this.handleReject());
    oursOption.createEl('p', {
      text: 'Reject this commit entirely and keep your current version.',
      cls: 'conflict-option-desc'
    });

    // Option 4: Decide Later
    const cancelOption = optionsEl.createDiv({ cls: 'conflict-option' });
    const cancelBtn = cancelOption.createEl('button', {
      text: 'Decide Later',
      cls: 'conflict-btn conflict-btn-cancel'
    });
    cancelBtn.addEventListener('click', () => this.close());
    cancelOption.createEl('p', {
      text: 'Skip for now and come back to this commit later.',
      cls: 'conflict-option-desc'
    });
  }

  private renderProcessing() {
    const { contentEl } = this;

    contentEl.createEl('h2', { text: 'Resolving Conflict...' });

    const spinnerEl = contentEl.createDiv({ cls: 'conflict-spinner' });
    spinnerEl.createEl('div', { cls: 'conflict-spinner-inner' });

    contentEl.createEl('p', {
      text: 'AI is analyzing both changes and merging them semantically...',
      cls: 'conflict-processing-text'
    });
  }

  private renderResolutionSuccess() {
    const { contentEl } = this;
    const resolution = this.resolution!;

    contentEl.createEl('h2', {
      text: 'Conflict Resolved',
      cls: 'conflict-modal-title conflict-success'
    });

    // Method badge
    const methodBadge = contentEl.createDiv({ cls: 'conflict-method-badge' });
    if (resolution.method === 'ai-magic') {
      methodBadge.setText('Resolved via AI Magic');
      methodBadge.addClass('method-ai');
    } else if (resolution.method === 'search-replace') {
      methodBadge.setText('Resolved automatically');
      methodBadge.addClass('method-auto');
    } else {
      methodBadge.setText('Resolved manually');
      methodBadge.addClass('method-manual');
    }

    // Explanation
    if (resolution.explanation) {
      contentEl.createEl('p', {
        text: resolution.explanation,
        cls: 'conflict-resolution-explanation'
      });
    }

    // Preview of merged content
    if (resolution.mergedContent) {
      const previewEl = contentEl.createDiv({ cls: 'conflict-preview' });
      previewEl.createEl('h3', { text: 'Merged Result:' });

      // Find just the relevant section (around where conflict was)
      const preview = extractRelevantSection(
        resolution.mergedContent,
        this.config.conflict.conflictRegions[0]
      );

      previewEl.createEl('pre', {
        text: preview,
        cls: 'conflict-preview-content'
      });

      // Inline refinement input (always visible, below preview)
      const refineContainer = previewEl.createDiv({ cls: 'conflict-refine-inline' });
      const refineInput = refineContainer.createEl('input', {
        type: 'text',
        placeholder: 'e.g., "put entries in alphabetical order"',
        cls: 'conflict-refine-input'
      });
      const refineSubmit = refineContainer.createEl('button', {
        text: 'Refine',
        cls: 'conflict-btn conflict-btn-ai'
      });
      refineSubmit.addEventListener('click', async () => {
        const instruction = refineInput.value.trim();
        if (instruction) {
          await this.refineWithAI(instruction);
        }
      });
      refineInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          const instruction = refineInput.value.trim();
          if (instruction) {
            await this.refineWithAI(instruction);
          }
        }
      });
    }

    // Action buttons (just Accept and Back)
    const actionsEl = contentEl.createDiv({ cls: 'conflict-actions' });

    const acceptBtn = actionsEl.createEl('button', {
      text: 'Accept',
      cls: 'conflict-btn conflict-btn-accept'
    });
    acceptBtn.addEventListener('click', async () => {
      // Try to apply the resolution
      const result = await this.config.onResolved(resolution);

      if (result.success) {
        this.wasAccepted = true;
        this.close();
      } else {
        // Resolution failed to apply - show failure state with retry/report options
        this.lastApplyError = result.error || 'Unknown error';
        this.retryCount++;
        this.renderResolutionFailed();
      }
    });

    const backBtn = actionsEl.createEl('button', {
      text: 'Back',
      cls: 'conflict-btn conflict-btn-retry'
    });
    backBtn.addEventListener('click', () => {
      this.resolution = null;
      this.lastRefinement = null;
      this.lastApplyError = null;
      this.renderContent();
    });
  }

  private renderResolutionFailed() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', {
      text: 'Resolution Failed',
      cls: 'conflict-modal-title conflict-error-title'
    });

    contentEl.createEl('p', {
      text: `The AI-generated resolution couldn't be applied. This can happen when the merge is particularly complex.`,
      cls: 'conflict-error-explanation'
    });

    if (this.lastApplyError) {
      const errorBox = contentEl.createDiv({ cls: 'conflict-error-box' });
      errorBox.createEl('strong', { text: 'Error: ' });
      errorBox.createSpan({ text: this.lastApplyError });
    }

    contentEl.createEl('p', {
      text: `Attempts: ${this.retryCount}`,
      cls: 'conflict-attempts-count'
    });

    // Action buttons
    const actionsEl = contentEl.createDiv({ cls: 'conflict-actions conflict-actions-column' });

    const retryBtn = actionsEl.createEl('button', {
      text: 'Retry with AI',
      cls: 'conflict-btn conflict-btn-ai'
    });
    retryBtn.addEventListener('click', async () => {
      this.resolution = null;
      this.lastApplyError = null;
      await this.resolveWithAI();
    });

    const backBtn = actionsEl.createEl('button', {
      text: 'Try Different Option',
      cls: 'conflict-btn conflict-btn-retry'
    });
    backBtn.addEventListener('click', () => {
      this.resolution = null;
      this.lastApplyError = null;
      this.renderContent();
    });

    // After multiple failures, show report option
    if (this.retryCount >= 2) {
      const reportSection = contentEl.createDiv({ cls: 'conflict-report-section' });
      reportSection.createEl('p', {
        text: 'This conflict seems difficult to resolve automatically. Help us improve by reporting it.',
        cls: 'conflict-report-text'
      });

      const reportBtn = reportSection.createEl('button', {
        text: 'Abort & Report Issue',
        cls: 'conflict-btn conflict-btn-report'
      });
      reportBtn.addEventListener('click', async () => {
        if (this.config.onReportFailure && this.resolution) {
          await this.config.onReportFailure(
            this.config.conflict,
            this.resolution,
            this.lastApplyError || 'Unknown error'
          );
        }
        this.config.onCancel();
        this.close();
      });
    }
  }

  private async resolveWithAI() {
    this.isProcessing = true;
    this.renderContent();

    try {
      const smartMerge = getSmartMergeService();

      // Go straight to AI - let it handle the semantic merge
      const resolution = await smartMerge.resolveWithAI(this.config.conflict);

      this.resolution = resolution;
      this.isProcessing = false;
      this.renderContent();
    } catch (error: any) {
      this.isProcessing = false;
      this.showError(`Resolution failed: ${error.message}`);
    }
  }

  private async refineWithAI(instruction: string) {
    this.isProcessing = true;
    this.lastRefinement = instruction; // Replace, don't accumulate
    this.renderContent();

    try {
      const smartMerge = getSmartMergeService();

      // Refine with just the current instruction
      const resolution = await smartMerge.resolveWithAI(
        this.config.conflict,
        [instruction]
      );

      this.resolution = resolution;
      this.isProcessing = false;
      this.renderContent();
    } catch (error: any) {
      this.isProcessing = false;
      this.showError(`Refinement failed: ${error.message}`);
    }
  }

  private handleReject() {
    // Full rejection - close modal and signal rejection to parent
    this.resolution = {
      success: false,
      method: 'manual',
      error: 'User rejected this commit'
    };
    this.config.onCancel(); // This will trigger the rejection flow
    this.close();
  }

  private async resolveKeepTheirs() {
    const { conflict } = this.config;
    const region = conflict.conflictRegions[0];

    // Reconstruct file keeping theirs
    const mergedContent = this.reconstructWithChoice(conflict.conflictContent, region.theirs);

    this.resolution = {
      success: true,
      mergedContent,
      method: 'manual',
      explanation: 'Accepted incoming change, replaced local version.'
    };

    this.renderContent();
  }

  private async resolveKeepOurs() {
    const { conflict } = this.config;
    const region = conflict.conflictRegions[0];

    // Reconstruct file keeping ours
    const mergedContent = this.reconstructWithChoice(conflict.conflictContent, region.ours);

    this.resolution = {
      success: true,
      mergedContent,
      method: 'manual',
      explanation: 'Kept local version, discarded incoming change.'
    };

    this.renderContent();
  }

  private reconstructWithChoice(conflictContent: string, choice: string): string {
    const lines = conflictContent.split('\n');
    const result: string[] = [];

    let i = 0;
    while (i < lines.length) {
      if (lines[i].startsWith('<<<<<<<')) {
        // Skip conflict markers, insert choice
        while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
          i++;
        }
        i++; // Skip >>>>>>> line
        result.push(choice);
      } else {
        result.push(lines[i]);
        i++;
      }
    }

    return result.join('\n');
  }

  private showError(message: string) {
    const { contentEl } = this;

    let errorEl = contentEl.querySelector('.conflict-error') as HTMLElement;
    if (!errorEl) {
      errorEl = contentEl.createDiv({ cls: 'conflict-error' });
    }

    errorEl.setText(message);

    setTimeout(() => {
      errorEl.remove();
    }, 5000);
  }

  private addStyles() {
    const styleId = 'conflict-resolution-modal-styles';
    // Remove existing style to ensure updates take effect
    const existing = document.getElementById(styleId);
    if (existing) existing.remove();

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .conflict-resolution-modal {
        max-width: 700px;
      }

      .conflict-modal-title {
        margin-bottom: 0.5em;
      }

      .conflict-modal-title.conflict-success {
        color: var(--interactive-success);
      }

      .conflict-explanation {
        margin-bottom: 1em;
      }

      .conflict-commit-info {
        font-weight: 500;
        color: var(--text-normal);
      }

      .conflict-file-info {
        font-family: monospace;
        color: var(--text-muted);
        font-size: 0.9em;
      }

      .conflict-visualization {
        background: var(--background-secondary);
        border-radius: 8px;
        padding: 1em;
        margin-bottom: 1.5em;
      }

      .conflict-context {
        margin-bottom: 0.5em;
      }

      .conflict-context pre {
        font-size: 0.8em;
        color: var(--text-faint);
        margin: 0;
        padding: 0.5em;
        background: transparent;
        white-space: pre-wrap;
      }

      .conflict-section {
        border-radius: 6px;
        padding: 0.75em;
        margin: 0.5em 0;
      }

      .conflict-section-label {
        font-size: 0.85em;
        font-weight: 600;
        margin-bottom: 0.5em;
      }

      .conflict-ours {
        background: rgba(var(--color-blue-rgb), 0.1);
        border-left: 3px solid var(--color-blue);
      }

      .conflict-ours .conflict-section-label {
        color: var(--color-blue);
      }

      .conflict-theirs {
        background: rgba(var(--color-green-rgb), 0.1);
        border-left: 3px solid var(--color-green);
      }

      .conflict-theirs .conflict-section-label {
        color: var(--color-green);
      }

      .conflict-section-content {
        font-size: 0.85em;
        margin: 0;
        padding: 0.5em;
        background: var(--background-primary);
        border-radius: 4px;
        white-space: pre-wrap;
        max-height: 200px;
        overflow-y: auto;
      }

      .conflict-separator {
        text-align: center;
        padding: 0.5em;
      }

      .conflict-separator span {
        background: var(--background-modifier-border);
        padding: 0.25em 0.75em;
        border-radius: 4px;
        font-size: 0.8em;
        color: var(--text-muted);
      }

      .conflict-options {
        margin-top: 1.5em;
      }

      .conflict-options h3 {
        font-size: 1em;
        margin-bottom: 1em;
      }

      .conflict-option {
        display: flex;
        align-items: flex-start;
        gap: 1em;
        margin-bottom: 1em;
        padding: 0.75em;
        border-radius: 6px;
        background: var(--background-secondary);
      }

      .conflict-option-recommended {
        background: rgba(var(--color-accent-rgb), 0.1);
        border: 1px solid var(--interactive-accent);
      }

      .conflict-option-desc {
        font-size: 0.85em;
        color: var(--text-muted);
        margin: 0;
        flex: 1;
      }

      .conflict-btn {
        border: none;
        border-radius: 4px;
        padding: 0.5em 1em;
        cursor: pointer;
        font-weight: 500;
        min-width: 140px;
        transition: background 0.15s, transform 0.1s;
      }

      .conflict-btn:hover {
        transform: translateY(-1px);
      }

      .conflict-btn-ai {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
      }

      .conflict-btn-theirs {
        background: var(--color-green);
        color: white;
      }

      .conflict-btn-ours {
        background: var(--color-blue);
        color: white;
      }

      .conflict-btn-cancel {
        background: var(--background-modifier-border);
        color: var(--text-muted);
      }

      .conflict-btn-accept {
        background: var(--interactive-success);
        color: white;
      }

      .conflict-btn-retry {
        background: var(--background-modifier-border);
        color: var(--text-normal);
      }

      .conflict-spinner {
        display: flex;
        justify-content: center;
        padding: 2em;
      }

      .conflict-spinner-inner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--background-modifier-border);
        border-top-color: var(--interactive-accent);
        border-radius: 50%;
        animation: conflict-spin 1s linear infinite;
      }

      @keyframes conflict-spin {
        to { transform: rotate(360deg); }
      }

      .conflict-processing-text {
        text-align: center;
        color: var(--text-muted);
      }

      .conflict-method-badge {
        display: inline-block;
        padding: 0.25em 0.75em;
        border-radius: 4px;
        font-size: 0.85em;
        margin-bottom: 1em;
      }

      .method-ai {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
      }

      .method-auto {
        background: var(--interactive-success);
        color: white;
      }

      .method-manual {
        background: var(--background-modifier-border);
        color: var(--text-normal);
      }

      .conflict-resolution-explanation {
        color: var(--text-muted);
        font-style: italic;
        margin-bottom: 1em;
      }

      .conflict-preview {
        margin: 1em 0;
      }

      .conflict-preview h3 {
        font-size: 0.9em;
        margin-bottom: 0.5em;
      }

      .conflict-preview {
        background: var(--background-secondary);
        border-radius: 8px;
        padding: 1em;
        margin: 1em 0;
      }

      .conflict-preview h3 {
        margin: 0 0 0.75em 0;
        font-size: 0.9em;
      }

      .conflict-preview-content {
        background: var(--background-primary);
        padding: 1em;
        border-radius: 6px;
        font-size: 0.85em;
        max-height: 300px;
        overflow-y: scroll;
        white-space: pre-wrap;
        border: 1px solid var(--background-modifier-border);
      }

      /* Ensure scrollbar is always visible */
      .conflict-preview-content::-webkit-scrollbar {
        width: 8px;
      }

      .conflict-preview-content::-webkit-scrollbar-track {
        background: var(--background-secondary);
        border-radius: 4px;
      }

      .conflict-preview-content::-webkit-scrollbar-thumb {
        background: var(--background-modifier-border);
        border-radius: 4px;
      }

      .conflict-preview-content::-webkit-scrollbar-thumb:hover {
        background: var(--text-muted);
      }

      .conflict-refine-inline {
        display: flex;
        gap: 1em;
        margin-top: 1em;
        padding-top: 1em;
        border-top: 1px solid var(--background-modifier-border);
        align-items: center;
      }

      .conflict-refine-inline .conflict-refine-input {
        flex: 1;
        min-width: 0;
      }

      .conflict-refine-inline .conflict-btn {
        flex-shrink: 0;
      }

      .conflict-actions {
        display: flex;
        gap: 1em;
        justify-content: flex-end;
        margin-top: 1.5em;
        padding-top: 1em;
        border-top: 1px solid var(--background-modifier-border);
      }

      .conflict-error {
        background: var(--background-modifier-error);
        color: var(--text-on-accent);
        padding: 0.75em 1em;
        border-radius: 4px;
        margin-top: 1em;
      }

      .conflict-refine-input {
        padding: 0.5em 0.75em;
        border: 1px solid var(--background-modifier-border);
        border-radius: 4px;
        background: var(--background-primary);
        color: var(--text-normal);
        font-size: 0.9em;
      }

      .conflict-refine-input:focus {
        outline: none;
        border-color: var(--interactive-accent);
      }

      /* Failed resolution state */
      .conflict-error-title {
        color: var(--text-error);
      }

      .conflict-error-explanation {
        color: var(--text-muted);
        margin-bottom: 1em;
      }

      .conflict-error-box {
        background: var(--background-secondary);
        border-left: 3px solid var(--text-error);
        padding: 0.75em 1em;
        border-radius: 4px;
        font-family: monospace;
        font-size: 0.85em;
        margin-bottom: 1em;
        word-break: break-word;
      }

      .conflict-attempts-count {
        font-size: 0.85em;
        color: var(--text-muted);
      }

      .conflict-actions-column {
        flex-direction: column;
        align-items: stretch;
      }

      .conflict-actions-column .conflict-btn {
        width: 100%;
        justify-content: center;
      }

      .conflict-report-section {
        margin-top: 1.5em;
        padding-top: 1em;
        border-top: 1px solid var(--background-modifier-border);
      }

      .conflict-report-text {
        font-size: 0.9em;
        color: var(--text-muted);
        margin-bottom: 0.75em;
      }

      .conflict-btn-report {
        background: var(--text-error);
        color: white;
      }
    `;
    document.head.appendChild(style);
  }
}

// ============================================
// HELPERS
// ============================================

function truncateLines(text: string, maxLines: number): string {
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join('\n') + '\n...';
}

function extractRelevantSection(content: string, region: ConflictRegion): string {
  // Try to find the area around where the conflict was
  const lines = content.split('\n');

  // Look for context lines to find our location
  const contextLine = region.contextBefore.split('\n').pop() || '';
  let startIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(contextLine.trim()) && contextLine.trim()) {
      startIdx = Math.max(0, i - 1);
      break;
    }
  }

  // Show ~15 lines around that point
  const endIdx = Math.min(lines.length, startIdx + 15);
  return lines.slice(startIdx, endIdx).join('\n');
}

// ============================================
// EXPORT HELPER
// ============================================

export function showConflictResolutionModal(
  app: App,
  config: ConflictResolutionConfig
): ConflictResolutionModal {
  const modal = new ConflictResolutionModal(app, config);
  modal.open();
  return modal;
}
