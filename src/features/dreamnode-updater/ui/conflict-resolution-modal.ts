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

/* eslint-disable no-undef */

import { App, Modal } from 'obsidian';
import {
  ConflictInfo,
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
  /** Callback when conflict is resolved */
  onResolved: (resolution: MergeResolution) => Promise<void>;
  /** Callback when user cancels */
  onCancel: () => void;
}

export class ConflictResolutionModal extends Modal {
  private config: ConflictResolutionConfig;
  private isProcessing = false;
  private resolution: MergeResolution | null = null;

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
    if (!this.resolution && !this.isProcessing) {
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

    // Option 2: Keep theirs
    const theirsOption = optionsEl.createDiv({ cls: 'conflict-option' });
    const theirsBtn = theirsOption.createEl('button', {
      text: 'Accept Incoming',
      cls: 'conflict-btn conflict-btn-theirs'
    });
    theirsBtn.addEventListener('click', () => this.resolveKeepTheirs());
    theirsOption.createEl('p', {
      text: 'Replace your version with the incoming change.',
      cls: 'conflict-option-desc'
    });

    // Option 3: Keep ours
    const oursOption = optionsEl.createDiv({ cls: 'conflict-option' });
    const oursBtn = oursOption.createEl('button', {
      text: 'Keep Current',
      cls: 'conflict-btn conflict-btn-ours'
    });
    oursBtn.addEventListener('click', () => this.resolveKeepOurs());
    oursOption.createEl('p', {
      text: 'Keep your version and discard the incoming change.',
      cls: 'conflict-option-desc'
    });

    // Option 4: Skip/Cancel
    const cancelOption = optionsEl.createDiv({ cls: 'conflict-option' });
    const cancelBtn = cancelOption.createEl('button', {
      text: 'Skip This Commit',
      cls: 'conflict-btn conflict-btn-cancel'
    });
    cancelBtn.addEventListener('click', () => this.close());
    cancelOption.createEl('p', {
      text: 'Abort this cherry-pick and leave your files unchanged.',
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
    }

    // Action buttons
    const actionsEl = contentEl.createDiv({ cls: 'conflict-actions' });

    const acceptBtn = actionsEl.createEl('button', {
      text: 'Accept Resolution',
      cls: 'conflict-btn conflict-btn-accept'
    });
    acceptBtn.addEventListener('click', async () => {
      await this.config.onResolved(resolution);
      this.close();
    });

    const rejectBtn = actionsEl.createEl('button', {
      text: 'Try Different Option',
      cls: 'conflict-btn conflict-btn-retry'
    });
    rejectBtn.addEventListener('click', () => {
      this.resolution = null;
      this.renderContent();
    });
  }

  private async resolveWithAI() {
    this.isProcessing = true;
    this.renderContent();

    try {
      const smartMerge = getSmartMergeService();

      // First try search-replace
      let resolution = smartMerge.trySearchReplaceResolution(this.config.conflict);

      if (!resolution.success) {
        // Fall back to AI
        resolution = await smartMerge.resolveWithAI(this.config.conflict);
      }

      this.resolution = resolution;
      this.isProcessing = false;
      this.renderContent();
    } catch (error: any) {
      this.isProcessing = false;
      this.showError(`Resolution failed: ${error.message}`);
    }
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
    if (document.getElementById(styleId)) return;

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

      .conflict-preview-content {
        background: var(--background-secondary);
        padding: 1em;
        border-radius: 6px;
        font-size: 0.85em;
        max-height: 300px;
        overflow-y: auto;
        white-space: pre-wrap;
      }

      .conflict-actions {
        display: flex;
        gap: 1em;
        justify-content: flex-end;
        margin-top: 1.5em;
      }

      .conflict-error {
        background: var(--background-modifier-error);
        color: var(--text-on-accent);
        padding: 0.75em 1em;
        border-radius: 4px;
        margin-top: 1em;
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
