/**
 * Update Preview Modal
 *
 * Shows update summary with accept/reject actions
 */

import { App, Modal, Setting } from 'obsidian';
import { FetchResult } from '../services/git-service';
import { UpdateSummary } from '../services/update-summary-service';

export class UpdatePreviewModal extends Modal {
  private nodeName: string;
  private updateStatus: FetchResult;
  private summary: UpdateSummary;
  private onAccept: () => void;
  private onReject: () => void;

  constructor(
    app: App,
    nodeName: string,
    updateStatus: FetchResult,
    summary: UpdateSummary,
    onAccept: () => void,
    onReject: () => void
  ) {
    super(app);
    this.nodeName = nodeName;
    this.updateStatus = updateStatus;
    this.summary = summary;
    this.onAccept = onAccept;
    this.onReject = onReject;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // Title
    contentEl.createEl('h2', { text: `Updates Available for ${this.nodeName}` });

    // Overall impact (highlighted)
    const impactEl = contentEl.createDiv({ cls: 'update-preview-impact' });
    impactEl.createEl('strong', { text: this.summary.overallImpact });

    // Summary section
    contentEl.createEl('h3', { text: "What's New" });
    const userFacingEl = contentEl.createDiv({ cls: 'update-preview-section' });
    userFacingEl.createEl('p', { text: this.summary.userFacingChanges });

    // Technical improvements
    contentEl.createEl('h3', { text: 'Technical Improvements' });
    const technicalEl = contentEl.createDiv({ cls: 'update-preview-section' });
    technicalEl.createEl('p', { text: this.summary.technicalImprovements });

    // Stats
    contentEl.createEl('h3', { text: 'Update Details' });
    const statsEl = contentEl.createDiv({ cls: 'update-preview-stats' });
    statsEl.createEl('p', { text: `📊 ${this.updateStatus.commits.length} commits` });
    statsEl.createEl('p', { text: `📁 ${this.updateStatus.filesChanged} files changed` });
    statsEl.createEl('p', { text: `➕ ${this.updateStatus.insertions} lines added` });
    statsEl.createEl('p', { text: `➖ ${this.updateStatus.deletions} lines removed` });

    // Commit list (collapsible)
    const commitsEl = contentEl.createDiv({ cls: 'update-preview-commits' });
    const detailsEl = commitsEl.createEl('details');
    detailsEl.createEl('summary', { text: `View ${this.updateStatus.commits.length} commit${this.updateStatus.commits.length > 1 ? 's' : ''}` });

    const commitList = detailsEl.createEl('ul');
    this.updateStatus.commits.forEach((commit) => {
      const date = new Date(commit.timestamp * 1000).toLocaleDateString();
      const li = commitList.createEl('li');
      li.createEl('strong', { text: commit.subject });
      li.createEl('br');
      li.createEl('span', {
        text: `${commit.author} • ${date}`,
        cls: 'update-preview-commit-meta'
      });
      if (commit.body) {
        li.createEl('br');
        li.createEl('span', { text: commit.body, cls: 'update-preview-commit-body' });
      }
    });

    // Action buttons
    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

    new Setting(buttonContainer)
      .addButton((btn) =>
        btn
          .setButtonText('Apply Update')
          .setCta()
          .onClick(() => {
            console.log('[UpdatePreviewModal] User clicked Apply');
            this.close();
            this.onAccept();
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText('Not Now')
          .onClick(() => {
            console.log('[UpdatePreviewModal] User clicked Not Now');
            this.close();
            this.onReject();
          })
      );

    // Add custom styles
    this.addStyles();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  private addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .update-preview-impact {
        background: var(--background-secondary);
        padding: 1em;
        border-radius: 8px;
        margin: 1em 0;
        font-size: 1.1em;
        text-align: center;
      }

      .update-preview-section {
        margin: 0.5em 0 1.5em 0;
        line-height: 1.6;
      }

      .update-preview-stats {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5em;
        margin: 1em 0;
      }

      .update-preview-stats p {
        margin: 0;
        padding: 0.5em;
        background: var(--background-secondary);
        border-radius: 4px;
      }

      .update-preview-commits {
        margin: 1em 0 2em 0;
      }

      .update-preview-commits details {
        background: var(--background-secondary);
        padding: 1em;
        border-radius: 8px;
      }

      .update-preview-commits summary {
        cursor: pointer;
        font-weight: bold;
        margin-bottom: 0.5em;
      }

      .update-preview-commits ul {
        margin-top: 1em;
        padding-left: 1.5em;
      }

      .update-preview-commits li {
        margin: 1em 0;
        line-height: 1.6;
      }

      .update-preview-commit-meta {
        color: var(--text-muted);
        font-size: 0.9em;
      }

      .update-preview-commit-body {
        color: var(--text-muted);
        font-size: 0.9em;
        font-style: italic;
      }

      .modal-button-container {
        margin-top: 2em;
        display: flex;
        justify-content: flex-end;
        gap: 0.5em;
      }
    `;
    document.head.appendChild(style);
  }
}
