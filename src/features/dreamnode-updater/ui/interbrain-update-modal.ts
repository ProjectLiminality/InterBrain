/**
 * InterBrain Update Modal
 *
 * Simple all-or-nothing update for the InterBrain plugin itself.
 * Unlike DreamNode cherry-picking, InterBrain updates must be accepted in full
 * (pull from main, build, reload). Users can request an AI summary before deciding.
 */

import { App, Modal, Setting } from 'obsidian';
import { FetchResult, CommitInfo } from '../../social-resonance-filter/services/git-sync-service';
import {
  getUpdateSummaryService,
  initializeUpdateSummaryService,
  UpdateSummary
} from '../services/update-summary-service';

export class InterBrainUpdateModal extends Modal {
  private fetchResult: FetchResult;
  private onAccept: () => Promise<void>;
  private onReject: () => void;
  private summaryEl: HTMLElement | null = null;
  private isSummaryLoading = false;

  constructor(
    app: App,
    fetchResult: FetchResult,
    onAccept: () => Promise<void>,
    onReject: () => void
  ) {
    super(app);
    this.fetchResult = fetchResult;
    this.onAccept = onAccept;
    this.onReject = onReject;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('interbrain-update-modal');

    // Header
    contentEl.createEl('h2', { text: '🧠 InterBrain Update' });

    // Commit count info
    const infoEl = contentEl.createDiv({ cls: 'interbrain-update-info' });
    infoEl.setText(
      `${this.fetchResult.commits.length} new commit${this.fetchResult.commits.length > 1 ? 's' : ''} available`
    );

    // Commit list (expandable)
    this.renderCommitList(contentEl);

    // Summary container (populated on demand)
    this.summaryEl = contentEl.createDiv({ cls: 'interbrain-summary-container' });

    // Action buttons
    this.renderActions(contentEl);
    this.addStyles();
  }

  private renderCommitList(containerEl: HTMLElement): void {
    const detailsEl = containerEl.createEl('details', { cls: 'interbrain-commits' });
    detailsEl.createEl('summary', { text: 'View commits' });

    const listEl = detailsEl.createEl('ul');
    this.fetchResult.commits.forEach((commit: CommitInfo) => {
      const li = listEl.createEl('li');
      li.createEl('strong', { text: commit.subject });
      const date = new Date(commit.timestamp * 1000).toLocaleDateString();
      li.createEl('span', {
        text: ` · ${commit.author} · ${date}`,
        cls: 'interbrain-commit-meta'
      });
    });
  }

  private renderActions(containerEl: HTMLElement): void {
    const buttonContainer = containerEl.createDiv({ cls: 'modal-button-container' });

    // Only show summarize if there are 2+ commits
    const canSummarize = this.fetchResult.commits.length >= 2;

    new Setting(buttonContainer)
      .addButton(btn => {
        btn
          .setButtonText('📝 Summarize')
          .onClick(async () => {
            await this.showSummary();
          });
        if (!canSummarize) {
          btn.setDisabled(true);
          btn.buttonEl.setAttribute('title', 'Need at least 2 commits to summarize');
        }
      })
      .addButton(btn => btn
        .setButtonText('Update & Reload')
        .setCta()
        .onClick(async () => {
          this.close();
          await this.onAccept();
        }))
      .addButton(btn => btn
        .setButtonText('Not Now')
        .onClick(() => {
          this.close();
          this.onReject();
        }));
  }

  private async showSummary(): Promise<void> {
    if (!this.summaryEl || this.isSummaryLoading) return;

    this.isSummaryLoading = true;
    this.summaryEl.empty();
    this.summaryEl.createDiv({
      cls: 'interbrain-summary-loading',
      text: 'Generating summary...'
    });

    try {
      initializeUpdateSummaryService();
      const summaryService = getUpdateSummaryService();
      const summary = await summaryService.generateUpdateSummary(this.fetchResult);

      this.summaryEl.empty();
      this.displaySummary(summary);
    } catch (error) {
      this.summaryEl.empty();
      this.summaryEl.createDiv({
        cls: 'interbrain-summary-error',
        text: 'Failed to generate summary'
      });
      console.error('[InterBrainUpdate] Summary failed:', error);
    } finally {
      this.isSummaryLoading = false;
    }
  }

  private displaySummary(summary: UpdateSummary): void {
    if (!this.summaryEl) return;

    // Header
    this.summaryEl.createEl('strong', { text: "What's been happening:" });

    // The briefing - just natural prose
    const contentEl = this.summaryEl.createDiv({ cls: 'interbrain-summary-content' });
    const briefingText = summary.briefing || summary.userFacingChanges;
    contentEl.createEl('p', { text: briefingText });

    // Stats
    const statsEl = this.summaryEl.createDiv({ cls: 'interbrain-summary-stats' });
    statsEl.setText(
      `${this.fetchResult.filesChanged} files · ` +
      `+${this.fetchResult.insertions} -${this.fetchResult.deletions}`
    );
  }

  private addStyles(): void {
    const styleId = 'interbrain-update-modal-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .interbrain-update-modal {
        max-width: 500px;
      }

      .interbrain-update-info {
        color: var(--text-muted);
        margin-bottom: 1em;
      }

      .interbrain-commits {
        background: var(--background-secondary);
        padding: 1em;
        border-radius: 8px;
        margin: 1em 0;
      }

      .interbrain-commits summary {
        cursor: pointer;
        font-weight: 500;
      }

      .interbrain-commits ul {
        margin-top: 0.75em;
        padding-left: 1.25em;
      }

      .interbrain-commits li {
        margin: 0.5em 0;
        line-height: 1.4;
      }

      .interbrain-commit-meta {
        color: var(--text-muted);
        font-size: 0.85em;
      }

      .interbrain-summary-container {
        margin: 1em 0;
      }

      .interbrain-summary-loading {
        padding: 1em;
        text-align: center;
        color: var(--text-muted);
      }

      .interbrain-summary-error {
        padding: 1em;
        text-align: center;
        color: var(--text-error);
      }

      .interbrain-summary-impact {
        background: var(--background-secondary);
        padding: 0.75em 1em;
        border-radius: 6px;
        margin-bottom: 0.75em;
        font-weight: 500;
      }

      .interbrain-summary-content {
        line-height: 1.6;
      }

      .interbrain-summary-content p {
        margin: 0 0 0.5em 0;
      }

      .interbrain-summary-technical {
        color: var(--text-muted);
        font-size: 0.95em;
      }

      .interbrain-summary-stats {
        color: var(--text-muted);
        font-size: 0.85em;
        margin-top: 0.75em;
        padding-top: 0.75em;
        border-top: 1px solid var(--background-modifier-border);
      }
    `;
    document.head.appendChild(style);
  }

  onClose() {
    this.contentEl.empty();
  }
}
