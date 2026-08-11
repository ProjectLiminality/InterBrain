/**
 * Share Changes Modal (#393 — outbox symmetry)
 *
 * The outbound mirror of the Check-for-Updates modal: before sharing, review
 * the committed-but-unpushed work that a Share will publish to your GitHub
 * outbox. No preview pane — these changes are already applied locally — just
 * the commit list (message, age, hash), then Share or Cancel.
 *
 * Share delegates to the existing `interbrain:push-to-network` flow, which
 * owns outbox creation (gh repo create when origin doesn't exist yet),
 * pushing, coherence-beacon ignition, and error surfacing.
 */

import { App, Modal, Notice } from 'obsidian';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ShareChangesConfig {
  /** Absolute path to the DreamNode repo */
  fullRepoPath: string;
  /** Display name of the DreamNode */
  dreamNodeName: string;
}

interface UnpushedCommit {
  hash: string;
  age: string;
  message: string;
}

export class ShareChangesModal extends Modal {
  private config: ShareChangesConfig;
  private commits: UnpushedCommit[] = [];
  private loadFailed = false;

  constructor(app: App, config: ShareChangesConfig) {
    super(app);
    this.config = config;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('share-changes-modal');

    await this.loadCommits();
    this.renderContent();
    this.addStyles();
  }

  onClose() {
    this.contentEl.empty();
  }

  /** Commits on local HEAD that origin/main doesn't have. */
  private async loadCommits(): Promise<void> {
    try {
      const { stdout } = await execAsync(
        'git log origin/main..HEAD --pretty=format:"%h%x09%ad%x09%s" --date=relative',
        { cwd: this.config.fullRepoPath }
      );
      this.commits = stdout
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .map(line => {
          const [hash, age, ...rest] = line.split('\t');
          return { hash, age, message: rest.join('\t') };
        });
    } catch (_error) {
      // origin/main may not exist yet (outbox not created). Sharing still
      // works — push-to-network creates the outbox — so list ALL local
      // commits as what would be published.
      try {
        const { stdout } = await execAsync(
          'git log --pretty=format:"%h%x09%ad%x09%s" --date=relative',
          { cwd: this.config.fullRepoPath }
        );
        this.commits = stdout
          .split('\n')
          .map(l => l.trim())
          .filter(Boolean)
          .map(line => {
            const [hash, age, ...rest] = line.split('\t');
            return { hash, age, message: rest.join('\t') };
          });
      } catch (inner) {
        console.error('[ShareChanges] Failed to list commits:', inner);
        this.loadFailed = true;
      }
    }
  }

  private renderContent(): void {
    const { contentEl } = this;

    contentEl.createEl('h2', { text: `Share Changes — ${this.config.dreamNodeName}` });

    if (this.loadFailed) {
      contentEl.createEl('p', {
        text: 'Could not read this DreamNode’s git history.',
        cls: 'share-changes-empty',
      });
      return;
    }

    if (this.commits.length === 0) {
      contentEl.createEl('p', {
        text: 'Everything you’ve committed is already shared.',
        cls: 'share-changes-empty',
      });
      const btnRow = contentEl.createDiv({ cls: 'share-changes-buttons' });
      const closeBtn = btnRow.createEl('button', { text: 'Close' });
      closeBtn.addEventListener('click', () => this.close());
      return;
    }

    contentEl.createEl('p', {
      text: `These ${this.commits.length === 1 ? 'is 1 commit' : `are ${this.commits.length} commits`} your outbox doesn’t have yet:`,
      cls: 'share-changes-intro',
    });

    const list = contentEl.createDiv({ cls: 'share-changes-list' });
    for (const c of this.commits) {
      const row = list.createDiv({ cls: 'share-changes-row' });
      row.createSpan({ text: c.message, cls: 'share-changes-message' });
      const meta = row.createDiv({ cls: 'share-changes-meta' });
      meta.createSpan({ text: c.age });
      meta.createSpan({ text: c.hash, cls: 'share-changes-hash' });
    }

    const btnRow = contentEl.createDiv({ cls: 'share-changes-buttons' });
    const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    const shareBtn = btnRow.createEl('button', {
      text: `Share ${this.commits.length === 1 ? '1 commit' : `${this.commits.length} commits`}`,
      cls: 'mod-cta',
    });
    shareBtn.addEventListener('click', () => {
      this.close();
      // The full share flow: auto-outbox creation, push, beacons, notices.
      const executed = (this.app as unknown as { commands: { executeCommandById(id: string): boolean } })
        .commands.executeCommandById('interbrain:push-to-network');
      if (!executed) {
        new Notice('Share command unavailable');
      }
    });
  }

  private addStyles(): void {
    const style = this.contentEl.createEl('style');
    style.textContent = `
      .share-changes-modal .share-changes-intro { color: var(--text-muted); }
      .share-changes-modal .share-changes-empty { color: var(--text-muted); }
      .share-changes-modal .share-changes-list {
        max-height: 320px;
        overflow-y: auto;
        margin: 12px 0;
        border: 1px solid var(--background-modifier-border);
        border-radius: 6px;
      }
      .share-changes-modal .share-changes-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 12px;
        border-bottom: 1px solid var(--background-modifier-border);
      }
      .share-changes-modal .share-changes-row:last-child { border-bottom: none; }
      .share-changes-modal .share-changes-message {
        flex: 1;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .share-changes-modal .share-changes-meta {
        display: flex;
        gap: 10px;
        color: var(--text-muted);
        font-size: 12px;
        white-space: nowrap;
      }
      .share-changes-modal .share-changes-hash { font-family: var(--font-monospace); }
      .share-changes-modal .share-changes-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 12px;
      }
    `;
  }
}
