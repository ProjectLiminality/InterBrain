/**
 * Update Preview Modal
 *
 * Shows update summary with accept/reject actions
 */

import { App, Modal, Setting } from 'obsidian';
import { FetchResult } from '../services/git-service';
import { UpdateSummary } from '../../features/updates/update-summary-service';

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

    console.log('[UpdatePreviewModal] Opening with data:', {
      nodeName: this.nodeName,
      commitCount: this.updateStatus.commits.length,
      commits: this.updateStatus.commits,
      summary: this.summary
    });

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

    // Commit list (collapsible) - group by source for clarity
    const commitsEl = contentEl.createDiv({ cls: 'update-preview-commits' });
    const detailsEl = commitsEl.createEl('details');
    detailsEl.createEl('summary', { text: `View ${this.updateStatus.commits.length} commit${this.updateStatus.commits.length > 1 ? 's' : ''}` });

    // Group commits by source (peer)
    const commitsBySource = new Map<string, typeof this.updateStatus.commits>();
    this.updateStatus.commits.forEach((commit) => {
      const source = commit.source || 'upstream';
      if (!commitsBySource.has(source)) {
        commitsBySource.set(source, []);
      }
      commitsBySource.get(source)!.push(commit);
    });

    const commitList = detailsEl.createEl('ul');

    // Display commits grouped by source
    commitsBySource.forEach((commits, source) => {
      // Extract peer name from source (e.g., "Martina/main" -> "Martina")
      const peerName = source.includes('/') ? source.split('/')[0] : source;

      if (commitsBySource.size > 1) {
        // Only show grouping header if there are multiple sources
        const groupHeader = commitList.createEl('li', { cls: 'update-preview-source-group' });
        groupHeader.createEl('strong', { text: `📡 From ${peerName}:`, cls: 'update-preview-peer-name' });
      }

      commits.forEach((commit) => {
        const date = new Date(commit.timestamp * 1000).toLocaleDateString();
        const li = commitList.createEl('li', { cls: commitsBySource.size > 1 ? 'update-preview-commit-indented' : '' });
        li.createEl('strong', { text: commit.subject });
        li.createEl('br');

        // Show author and peer if single source (no grouping)
        let metaText = `${commit.author} • ${date}`;
        if (commitsBySource.size === 1 && commit.source) {
          metaText += ` • via ${peerName}`;
        }

        li.createEl('span', {
          text: metaText,
          cls: 'update-preview-commit-meta'
        });

        if (commit.body) {
          li.createEl('br');
          // Format commit body: convert bullet points to clean list
          const formattedBody = this.formatCommitBody(commit.body);
          li.createEl('span', { text: formattedBody, cls: 'update-preview-commit-body' });
        }
      });
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

  /**
   * Format commit body text for display
   * Converts bullet points (- item) to clean comma-separated list
   */
  private formatCommitBody(body: string): string {
    // Split by newlines and filter out empty lines
    const lines = body.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Convert bullet points to clean list
    const cleaned = lines.map(line => {
      // Remove leading dash/bullet
      return line.replace(/^[-*•]\s*/, '');
    });

    // Join with commas for cleaner reading
    return cleaned.join(', ');
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

      .update-preview-source-group {
        margin: 1.5em 0 0.5em 0 !important;
        list-style: none;
      }

      .update-preview-peer-name {
        color: var(--text-accent);
        font-size: 1em;
      }

      .update-preview-commit-indented {
        margin-left: 1.5em;
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
