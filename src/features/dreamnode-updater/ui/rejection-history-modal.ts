/**
 * Rejection History Modal
 *
 * Shows the history of rejected commits for a DreamNode, allowing users to:
 * - View what they've rejected and when
 * - Unreject commits (remove from rejection list so they appear again)
 * - Filter by peer
 */

/* eslint-disable no-undef */

import { App, Modal, Setting } from 'obsidian';
import {
  RejectedCommit,
  getCollaborationMemoryService
} from '../services/collaboration-memory-service';

export interface RejectionHistoryConfig {
  /** Path to the DreamNode */
  dreamNodePath: string;
  /** UUID of the DreamNode */
  dreamNodeUuid: string;
  /** Display name of the DreamNode */
  dreamNodeName: string;
  /** Dreamer nodes with their repo paths */
  peers: Array<{ name: string; repoPath: string }>;
  /** Callback when commits are unrejected */
  onUnreject?: (peerRepoPath: string, hashes: string[]) => void;
}

interface RejectionEntry {
  commit: RejectedCommit;
  peerName: string;
  peerRepoPath: string;
}

export class RejectionHistoryModal extends Modal {
  private config: RejectionHistoryConfig;
  private rejections: RejectionEntry[] = [];
  private selectedHashes: Set<string> = new Set();
  private isLoading = true;
  private filterPeer: string | null = null;

  constructor(app: App, config: RejectionHistoryConfig) {
    super(app);
    this.config = config;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('rejection-history-modal');

    await this.loadRejections();
    this.renderContent();
    this.addStyles();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  private async loadRejections() {
    this.isLoading = true;
    this.rejections = [];

    const memoryService = getCollaborationMemoryService();

    for (const peer of this.config.peers) {
      try {
        const memory = await memoryService.loadMemory(peer.repoPath);
        const dreamNodeState = memory.dreamNodes[this.config.dreamNodeUuid];

        if (dreamNodeState?.rejected) {
          for (const commit of dreamNodeState.rejected) {
            this.rejections.push({
              commit,
              peerName: peer.name,
              peerRepoPath: peer.repoPath
            });
          }
        }
      } catch (error) {
        console.warn(`[RejectionHistory] Failed to load memory for ${peer.name}:`, error);
      }
    }

    // Sort by rejection time, newest first
    this.rejections.sort((a, b) => b.commit.rejectedAt - a.commit.rejectedAt);

    this.isLoading = false;
  }

  private renderContent() {
    const { contentEl } = this;
    contentEl.empty();

    // Header
    contentEl.createEl('h2', {
      text: `Rejection History: ${this.config.dreamNodeName}`,
      cls: 'rejection-history-title'
    });

    if (this.isLoading) {
      contentEl.createDiv({
        text: 'Loading...',
        cls: 'rejection-history-loading'
      });
      return;
    }

    if (this.rejections.length === 0) {
      contentEl.createDiv({
        text: 'No rejected commits found.',
        cls: 'rejection-history-empty'
      });
      return;
    }

    // Filter controls
    this.renderFilters(contentEl);

    // Stats
    const filteredRejections = this.getFilteredRejections();
    contentEl.createDiv({
      text: `${filteredRejections.length} rejected commit(s)${this.filterPeer ? ` from ${this.filterPeer}` : ''}`,
      cls: 'rejection-history-stats'
    });

    // Rejection list
    const listEl = contentEl.createDiv({ cls: 'rejection-history-list' });

    for (const entry of filteredRejections) {
      this.renderRejectionEntry(listEl, entry);
    }

    // Action buttons
    this.renderActions(contentEl);
  }

  private renderFilters(container: HTMLElement) {
    const filterEl = container.createDiv({ cls: 'rejection-history-filters' });

    // Get unique peers
    const peers = [...new Set(this.rejections.map(r => r.peerName))];

    if (peers.length <= 1) return; // No need for filter with 0 or 1 peer

    filterEl.createEl('span', {
      text: 'Filter by peer:',
      cls: 'rejection-history-filter-label'
    });

    // "All" option
    const allBtn = filterEl.createEl('button', {
      text: 'All',
      cls: `rejection-history-filter-btn ${!this.filterPeer ? 'active' : ''}`
    });
    allBtn.addEventListener('click', () => {
      this.filterPeer = null;
      this.renderContent();
    });

    // Per-peer options
    for (const peer of peers) {
      const peerBtn = filterEl.createEl('button', {
        text: peer,
        cls: `rejection-history-filter-btn ${this.filterPeer === peer ? 'active' : ''}`
      });
      peerBtn.addEventListener('click', () => {
        this.filterPeer = peer;
        this.renderContent();
      });
    }
  }

  private getFilteredRejections(): RejectionEntry[] {
    if (!this.filterPeer) {
      return this.rejections;
    }
    return this.rejections.filter(r => r.peerName === this.filterPeer);
  }

  private renderRejectionEntry(container: HTMLElement, entry: RejectionEntry) {
    const { commit, peerName } = entry;
    const isSelected = this.selectedHashes.has(commit.originalHash);

    const entryEl = container.createDiv({
      cls: `rejection-history-entry ${isSelected ? 'selected' : ''}`
    });

    // Checkbox
    const checkbox = entryEl.createEl('input', {
      type: 'checkbox',
      cls: 'rejection-history-checkbox'
    }) as HTMLInputElement;
    checkbox.checked = isSelected;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        this.selectedHashes.add(commit.originalHash);
      } else {
        this.selectedHashes.delete(commit.originalHash);
      }
      this.renderContent();
    });

    // Content
    const contentEl = entryEl.createDiv({ cls: 'rejection-history-entry-content' });

    contentEl.createDiv({
      text: commit.subject,
      cls: 'rejection-history-entry-subject'
    });

    const date = new Date(commit.rejectedAt).toLocaleString();
    const metaText = `From ${peerName} • Rejected ${date}`;
    contentEl.createDiv({
      text: metaText,
      cls: 'rejection-history-entry-meta'
    });

    if (commit.reason) {
      contentEl.createDiv({
        text: `Reason: ${commit.reason}`,
        cls: 'rejection-history-entry-reason'
      });
    }

    // Hash (truncated)
    const shortHash = commit.originalHash.substring(0, 7);
    contentEl.createDiv({
      text: shortHash,
      cls: 'rejection-history-entry-hash'
    });

    // Quick unreject button
    const unrejectBtn = entryEl.createEl('button', {
      text: '↩ Unreject',
      cls: 'rejection-history-unreject-btn'
    });
    unrejectBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.unrejectCommits([entry]);
    });
  }

  private renderActions(container: HTMLElement) {
    const actionsEl = container.createDiv({ cls: 'rejection-history-actions' });

    // Select all toggle
    const filteredRejections = this.getFilteredRejections();
    const allSelected = filteredRejections.every(r =>
      this.selectedHashes.has(r.commit.originalHash)
    );

    new Setting(actionsEl)
      .addButton((btn) =>
        btn
          .setButtonText(allSelected ? 'Deselect All' : 'Select All')
          .onClick(() => {
            if (allSelected) {
              this.selectedHashes.clear();
            } else {
              for (const entry of filteredRejections) {
                this.selectedHashes.add(entry.commit.originalHash);
              }
            }
            this.renderContent();
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText(`Unreject Selected (${this.selectedHashes.size})`)
          .setCta()
          .setDisabled(this.selectedHashes.size === 0)
          .onClick(async () => {
            const toUnreject = filteredRejections.filter(r =>
              this.selectedHashes.has(r.commit.originalHash)
            );
            await this.unrejectCommits(toUnreject);
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText('Close')
          .onClick(() => {
            this.close();
          })
      );
  }

  private async unrejectCommits(entries: RejectionEntry[]) {
    const memoryService = getCollaborationMemoryService();

    // Group by peer
    const byPeer = new Map<string, RejectionEntry[]>();
    for (const entry of entries) {
      const existing = byPeer.get(entry.peerRepoPath) || [];
      existing.push(entry);
      byPeer.set(entry.peerRepoPath, existing);
    }

    // Process each peer
    for (const [peerRepoPath, peerEntries] of byPeer) {
      const hashes = peerEntries.map(e => e.commit.originalHash);

      for (const hash of hashes) {
        await memoryService.unreject(peerRepoPath, this.config.dreamNodeUuid, hash);
      }

      // Notify callback
      if (this.config.onUnreject) {
        this.config.onUnreject(peerRepoPath, hashes);
      }
    }

    // Remove from local state
    const unrejectHashes = new Set(entries.map(e => e.commit.originalHash));
    this.rejections = this.rejections.filter(r => !unrejectHashes.has(r.commit.originalHash));
    this.selectedHashes = new Set([...this.selectedHashes].filter(h => !unrejectHashes.has(h)));

    // Re-render
    this.renderContent();
  }

  private addStyles() {
    const styleId = 'rejection-history-modal-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .rejection-history-modal {
        max-width: 600px;
      }

      .rejection-history-title {
        margin-bottom: 1em;
      }

      .rejection-history-loading,
      .rejection-history-empty {
        text-align: center;
        color: var(--text-muted);
        padding: 2em;
      }

      .rejection-history-filters {
        display: flex;
        align-items: center;
        gap: 0.5em;
        margin-bottom: 1em;
        flex-wrap: wrap;
      }

      .rejection-history-filter-label {
        color: var(--text-muted);
        margin-right: 0.5em;
      }

      .rejection-history-filter-btn {
        border: 1px solid var(--background-modifier-border);
        border-radius: 4px;
        padding: 0.25em 0.75em;
        background: var(--background-secondary);
        cursor: pointer;
        font-size: 0.9em;
        transition: background 0.15s;
      }

      .rejection-history-filter-btn:hover {
        background: var(--background-modifier-hover);
      }

      .rejection-history-filter-btn.active {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
        border-color: var(--interactive-accent);
      }

      .rejection-history-stats {
        color: var(--text-muted);
        margin-bottom: 1em;
        font-size: 0.9em;
      }

      .rejection-history-list {
        max-height: 400px;
        overflow-y: auto;
        margin-bottom: 1.5em;
      }

      .rejection-history-entry {
        display: flex;
        align-items: flex-start;
        gap: 0.75em;
        padding: 0.75em;
        border-radius: 6px;
        margin-bottom: 0.5em;
        background: var(--background-secondary);
        transition: background 0.15s;
      }

      .rejection-history-entry:hover {
        background: var(--background-modifier-hover);
      }

      .rejection-history-entry.selected {
        background: var(--background-modifier-hover);
        border-left: 3px solid var(--interactive-accent);
      }

      .rejection-history-checkbox {
        margin-top: 0.25em;
      }

      .rejection-history-entry-content {
        flex: 1;
        min-width: 0;
      }

      .rejection-history-entry-subject {
        font-weight: 500;
        margin-bottom: 0.25em;
        word-break: break-word;
      }

      .rejection-history-entry-meta {
        font-size: 0.85em;
        color: var(--text-muted);
        margin-bottom: 0.25em;
      }

      .rejection-history-entry-reason {
        font-size: 0.85em;
        color: var(--text-faint);
        font-style: italic;
      }

      .rejection-history-entry-hash {
        font-family: var(--font-monospace);
        font-size: 0.75em;
        color: var(--text-faint);
        margin-top: 0.25em;
      }

      .rejection-history-unreject-btn {
        border: none;
        border-radius: 4px;
        padding: 0.25em 0.5em;
        background: var(--background-modifier-border);
        cursor: pointer;
        font-size: 0.8em;
        opacity: 0;
        transition: opacity 0.15s, background 0.15s;
      }

      .rejection-history-entry:hover .rejection-history-unreject-btn {
        opacity: 1;
      }

      .rejection-history-unreject-btn:hover {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
      }

      .rejection-history-actions {
        border-top: 1px solid var(--background-modifier-border);
        padding-top: 1em;
      }
    `;
    document.head.appendChild(style);
  }
}
