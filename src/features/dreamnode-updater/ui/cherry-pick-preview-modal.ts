/**
 * Cherry-Pick Preview Modal
 *
 * Enhanced modal for the cherry-pick collaboration workflow.
 * Features:
 * - Groups commits by peer (Dreamer)
 * - Checkboxes for individual commit selection
 * - Per-commit and per-peer accept/reject actions
 * - Preview mode with stash support
 */

/* eslint-disable no-undef */

import { App, Modal, Setting } from 'obsidian';
import {
  PeerCommitGroup,
  PendingCommit,
  getCherryPickWorkflowService
} from '../services/cherry-pick-workflow-service';
import {
  RejectedCommit,
  getCollaborationMemoryService
} from '../services/collaboration-memory-service';
import { showPreviewBanner } from './preview-banner';

export interface CherryPickPreviewConfig {
  /** Path to the DreamNode being updated */
  dreamNodePath: string;
  /** UUID of the DreamNode */
  dreamNodeUuid: string;
  /** Display name of the DreamNode */
  dreamNodeName: string;
  /** Commits grouped by peer */
  peerGroups: PeerCommitGroup[];
  /** Callback when commits are accepted */
  onAccept: (acceptedCommits: PendingCommit[], peerRepoPath: string) => Promise<void>;
  /** Callback when commits are rejected */
  onReject: (rejectedCommits: PendingCommit[], peerRepoPath: string) => Promise<void>;
  /** Callback when modal is closed without action */
  onCancel?: () => void;
}

interface CommitSelectionState {
  commit: PendingCommit;
  selected: boolean;
  peerRepoPath: string;
}

export class CherryPickPreviewModal extends Modal {
  private config: CherryPickPreviewConfig;
  private selectionState: Map<string, CommitSelectionState> = new Map();
  private isProcessing = false;
  private rejectionHistory: Map<string, RejectedCommit[]> = new Map();
  private isHistoryExpanded = false;

  constructor(app: App, config: CherryPickPreviewConfig) {
    super(app);
    this.config = config;

    // Initialize selection state - all commits selected by default
    for (const group of config.peerGroups) {
      for (const commit of group.commits) {
        this.selectionState.set(commit.originalHash, {
          commit,
          selected: true,
          peerRepoPath: group.peerRepoPath
        });
      }
    }
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('cherry-pick-preview-modal');

    // Load rejection history from all peers
    await this.loadRejectionHistory();

    this.renderContent();
    this.addStyles();
  }

  private async loadRejectionHistory() {
    const memoryService = getCollaborationMemoryService();
    this.rejectionHistory.clear();

    for (const group of this.config.peerGroups) {
      const history = await memoryService.getRejectionHistory(
        group.peerRepoPath,
        this.config.dreamNodeUuid
      );
      if (history.length > 0) {
        this.rejectionHistory.set(group.peerRepoPath, history);
      }
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    if (this.config.onCancel && !this.isProcessing) {
      this.config.onCancel();
    }
  }

  private renderContent() {
    const { contentEl } = this;
    contentEl.empty();

    // Header
    contentEl.createEl('h2', {
      text: `Updates for ${this.config.dreamNodeName}`,
      cls: 'cherry-pick-modal-title'
    });

    // Subtitle with count
    const totalCommits = this.config.peerGroups.reduce((sum, g) => sum + g.commits.length, 0);
    const selectedCount = Array.from(this.selectionState.values()).filter(s => s.selected).length;

    contentEl.createEl('p', {
      text: `${selectedCount} of ${totalCommits} commit(s) selected from ${this.config.peerGroups.length} peer(s)`,
      cls: 'cherry-pick-modal-subtitle'
    });

    // Peer groups
    const groupsContainer = contentEl.createDiv({ cls: 'cherry-pick-peer-groups' });

    for (const group of this.config.peerGroups) {
      this.renderPeerGroup(groupsContainer, group);
    }

    // Rejection history section (collapsible)
    this.renderRejectionHistory(contentEl);

    // Action buttons
    this.renderActionButtons(contentEl);
  }

  private renderPeerGroup(container: HTMLElement, group: PeerCommitGroup) {
    const groupEl = container.createDiv({ cls: 'cherry-pick-peer-group' });

    // Peer header with select all toggle
    const headerEl = groupEl.createDiv({ cls: 'cherry-pick-peer-header' });

    const peerCheckbox = headerEl.createEl('input', {
      type: 'checkbox',
      cls: 'cherry-pick-peer-checkbox'
    }) as HTMLInputElement;

    // Check if all commits from this peer are selected
    const peerCommitHashes = group.commits.map(c => c.originalHash);
    const allSelected = peerCommitHashes.every(h => this.selectionState.get(h)?.selected);
    const someSelected = peerCommitHashes.some(h => this.selectionState.get(h)?.selected);

    peerCheckbox.checked = allSelected;
    peerCheckbox.indeterminate = someSelected && !allSelected;

    peerCheckbox.addEventListener('change', () => {
      const newState = peerCheckbox.checked;
      for (const hash of peerCommitHashes) {
        const state = this.selectionState.get(hash);
        if (state) {
          state.selected = newState;
        }
      }
      this.renderContent();
    });

    headerEl.createEl('span', {
      text: `📡 ${group.peerName}`,
      cls: 'cherry-pick-peer-name'
    });

    headerEl.createEl('span', {
      text: `(${group.commits.length} commit${group.commits.length > 1 ? 's' : ''})`,
      cls: 'cherry-pick-peer-count'
    });

    // Per-peer quick actions
    const peerActionsEl = headerEl.createDiv({ cls: 'cherry-pick-peer-actions' });

    const acceptAllBtn = peerActionsEl.createEl('button', {
      text: '✓ Accept All',
      cls: 'cherry-pick-btn cherry-pick-btn-accept-small'
    });
    acceptAllBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.acceptPeerCommits(group);
    });

    const rejectAllBtn = peerActionsEl.createEl('button', {
      text: '✗ Reject All',
      cls: 'cherry-pick-btn cherry-pick-btn-reject-small'
    });
    rejectAllBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.rejectPeerCommits(group);
    });

    // Commit list
    const commitsEl = groupEl.createDiv({ cls: 'cherry-pick-commits-list' });

    for (const commit of group.commits) {
      this.renderCommit(commitsEl, commit, group.peerRepoPath);
    }
  }

  private renderCommit(container: HTMLElement, commit: PendingCommit, peerRepoPath: string) {
    const state = this.selectionState.get(commit.originalHash);
    if (!state) return;

    const isShared = commit.offeredByNames.length > 1;
    const commitEl = container.createDiv({
      cls: `cherry-pick-commit ${state.selected ? 'selected' : ''} ${isShared ? 'cherry-pick-commit-shared' : ''}`
    });

    // Checkbox
    const checkbox = commitEl.createEl('input', {
      type: 'checkbox',
      cls: 'cherry-pick-commit-checkbox'
    }) as HTMLInputElement;
    checkbox.checked = state.selected;
    checkbox.addEventListener('change', () => {
      state.selected = checkbox.checked;
      this.renderContent();
    });

    // Commit info
    const infoEl = commitEl.createDiv({ cls: 'cherry-pick-commit-info' });

    infoEl.createEl('div', {
      text: commit.subject,
      cls: 'cherry-pick-commit-subject'
    });

    const date = new Date(commit.timestamp * 1000).toLocaleDateString();
    const metaText = `${commit.author} • ${date}`;

    infoEl.createEl('div', {
      text: metaText,
      cls: 'cherry-pick-commit-meta'
    });

    if (commit.offeredByNames.length > 1) {
      const alsoFromEl = infoEl.createDiv({ cls: 'cherry-pick-commit-also-from' });
      alsoFromEl.createSpan({ text: 'Also from: ' });

      // Create clickable peer name spans
      const otherPeers = commit.offeredByNames.slice(1);
      otherPeers.forEach((peerName, index) => {
        const peerSpan = alsoFromEl.createSpan({
          text: peerName,
          cls: 'cherry-pick-also-from-peer'
        });
        // Add data attribute for peer identification
        peerSpan.setAttribute('data-peer-name', peerName);

        if (index < otherPeers.length - 1) {
          alsoFromEl.createSpan({ text: ', ' });
        }
      });
    }

    // Per-commit actions
    const actionsEl = commitEl.createDiv({ cls: 'cherry-pick-commit-actions' });

    const acceptBtn = actionsEl.createEl('button', {
      text: '✓',
      cls: 'cherry-pick-btn cherry-pick-btn-icon cherry-pick-btn-accept-icon',
      attr: { title: 'Accept this commit' }
    });
    acceptBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.acceptSingleCommit(commit, peerRepoPath);
    });

    const rejectBtn = actionsEl.createEl('button', {
      text: '✗',
      cls: 'cherry-pick-btn cherry-pick-btn-icon cherry-pick-btn-reject-icon',
      attr: { title: 'Reject this commit' }
    });
    rejectBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.rejectSingleCommit(commit, peerRepoPath);
    });
  }

  private renderRejectionHistory(container: HTMLElement) {
    // Count total rejected commits across all peers
    let totalRejected = 0;
    for (const history of this.rejectionHistory.values()) {
      totalRejected += history.length;
    }

    if (totalRejected === 0) return;

    const historySection = container.createDiv({ cls: 'cherry-pick-rejection-history' });

    // Collapsible header
    const headerEl = historySection.createDiv({ cls: 'cherry-pick-history-header' });
    headerEl.createSpan({
      text: this.isHistoryExpanded ? '▼' : '▶',
      cls: 'cherry-pick-history-toggle'
    });
    headerEl.createSpan({
      text: `Previously Rejected (${totalRejected})`,
      cls: 'cherry-pick-history-title'
    });

    headerEl.addEventListener('click', () => {
      this.isHistoryExpanded = !this.isHistoryExpanded;
      this.renderContent();
    });

    if (!this.isHistoryExpanded) return;

    // Render rejected commits by peer
    const contentEl = historySection.createDiv({ cls: 'cherry-pick-history-content' });

    for (const [peerRepoPath, history] of this.rejectionHistory.entries()) {
      // Find peer name
      const peer = this.config.peerGroups.find(g => g.peerRepoPath === peerRepoPath);
      const peerName = peer?.peerName || 'Unknown peer';

      const peerSection = contentEl.createDiv({ cls: 'cherry-pick-history-peer' });
      peerSection.createEl('div', {
        text: `From ${peerName}:`,
        cls: 'cherry-pick-history-peer-name'
      });

      for (const rejected of history) {
        const commitEl = peerSection.createDiv({ cls: 'cherry-pick-history-commit' });

        const infoEl = commitEl.createDiv({ cls: 'cherry-pick-history-commit-info' });
        infoEl.createEl('span', {
          text: rejected.subject,
          cls: 'cherry-pick-history-commit-subject'
        });

        const date = new Date(rejected.rejectedAt).toLocaleDateString();
        infoEl.createEl('span', {
          text: ` · rejected ${date}`,
          cls: 'cherry-pick-history-commit-date'
        });

        const unrejectBtn = commitEl.createEl('button', {
          text: '↩ Restore',
          cls: 'cherry-pick-btn cherry-pick-btn-unreject'
        });
        unrejectBtn.addEventListener('click', async () => {
          await this.unrejectCommit(peerRepoPath, rejected.originalHash);
        });
      }
    }
  }

  private async unrejectCommit(peerRepoPath: string, originalHash: string) {
    const memoryService = getCollaborationMemoryService();
    const success = await memoryService.unreject(
      peerRepoPath,
      this.config.dreamNodeUuid,
      originalHash
    );

    if (success) {
      // Reload history and re-render
      await this.loadRejectionHistory();
      this.renderContent();
    }
  }

  private renderActionButtons(container: HTMLElement) {
    const buttonContainer = container.createDiv({ cls: 'cherry-pick-modal-buttons' });

    // Preview button
    new Setting(buttonContainer)
      .addButton((btn) =>
        btn
          .setButtonText('Preview Selected')
          .onClick(async () => {
            await this.startPreview();
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText('Accept Selected')
          .setCta()
          .onClick(async () => {
            await this.acceptSelected();
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText('Reject Selected')
          .setWarning()
          .onClick(async () => {
            await this.rejectSelected();
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText('Later')
          .onClick(() => {
            this.close();
          })
      );
  }

  private getSelectedCommits(): { commits: PendingCommit[]; peerRepoPath: string }[] {
    // Group selected commits by peer repo path
    const byPeer = new Map<string, PendingCommit[]>();

    for (const state of this.selectionState.values()) {
      if (state.selected) {
        const existing = byPeer.get(state.peerRepoPath) || [];
        existing.push(state.commit);
        byPeer.set(state.peerRepoPath, existing);
      }
    }

    return Array.from(byPeer.entries()).map(([peerRepoPath, commits]) => ({
      peerRepoPath,
      commits
    }));
  }

  private async startPreview() {
    const selectedGroups = this.getSelectedCommits();
    if (selectedGroups.length === 0) {
      this.showMessage('No commits selected');
      return;
    }

    // Flatten all selected commits for preview
    const allSelected = selectedGroups.flatMap(g => g.commits);

    this.isProcessing = true;
    this.showProcessing('Starting preview...');

    try {
      const workflowService = getCherryPickWorkflowService();
      const result = await workflowService.startPreview(
        this.config.dreamNodePath,
        this.config.dreamNodeUuid,
        allSelected
      );

      if (result.success) {
        // Close modal and show non-blocking banner
        this.isProcessing = false;

        // Store what we need for the banner callbacks
        const selectedGroups = this.getSelectedCommits();
        const peerRepoPath = selectedGroups[0]?.peerRepoPath || '';

        // Show the thin bottom banner with callbacks
        showPreviewBanner({
          onAccept: async () => {
            const workflowService = getCherryPickWorkflowService();
            const previewState = workflowService.getPreviewState();

            if (!previewState) {
              console.error('[CherryPickModal] No preview state for accept');
              return;
            }

            const acceptResult = await workflowService.acceptPreview(peerRepoPath);
            if (acceptResult.success) {
              await this.config.onAccept(previewState.previewedCommits, peerRepoPath);
            } else {
              console.error('[CherryPickModal] Accept failed:', acceptResult.message);
            }
          },
          onReject: async () => {
            const workflowService = getCherryPickWorkflowService();
            const previewState = workflowService.getPreviewState();

            if (!previewState) {
              console.error('[CherryPickModal] No preview state for reject');
              return;
            }

            const rejectResult = await workflowService.rejectPreview(peerRepoPath);
            if (rejectResult.success) {
              await this.config.onReject(previewState.previewedCommits, peerRepoPath);
            } else {
              console.error('[CherryPickModal] Reject failed:', rejectResult.message);
            }
          },
          onCancel: async () => {
            const workflowService = getCherryPickWorkflowService();
            await workflowService.cancelPreview();
          }
        });

        // Close the modal - user can interact with dream space
        this.close();
      } else {
        this.showMessage(result.message, true);
        this.isProcessing = false;
      }
    } catch (error: any) {
      this.showMessage(`Preview failed: ${error.message}`, true);
      this.isProcessing = false;
    }
  }

  private showPreviewMode() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: 'Preview Mode Active' });

    const infoEl = contentEl.createDiv({ cls: 'cherry-pick-preview-info' });
    infoEl.createEl('p', {
      text: 'The selected commits have been applied to your DreamNode. ' +
            'Explore the changes in your vault, then decide whether to keep or revert them.'
    });

    const workflowService = getCherryPickWorkflowService();
    const previewState = workflowService.getPreviewState();

    if (previewState) {
      infoEl.createEl('p', {
        text: `📊 ${previewState.commitCount} commit(s) applied`,
        cls: 'cherry-pick-preview-stats'
      });

      if (previewState.didStash) {
        infoEl.createEl('p', {
          text: '💾 Your uncommitted changes have been stashed and will be restored after.',
          cls: 'cherry-pick-preview-stash-notice'
        });
      }
    }

    // Preview action buttons
    const buttonContainer = contentEl.createDiv({ cls: 'cherry-pick-modal-buttons' });

    new Setting(buttonContainer)
      .addButton((btn) =>
        btn
          .setButtonText('Keep Changes')
          .setCta()
          .onClick(async () => {
            await this.acceptPreview();
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText('Revert Changes')
          .setWarning()
          .onClick(async () => {
            await this.rejectPreview();
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText('Cancel Preview')
          .onClick(async () => {
            await this.cancelPreview();
          })
      );
  }

  private async acceptPreview() {
    this.showProcessing('Accepting changes...');

    try {
      const workflowService = getCherryPickWorkflowService();
      const previewState = workflowService.getPreviewState();

      if (!previewState) {
        this.showMessage('No preview active', true);
        return;
      }

      // Use the first peer's repo path for memory storage
      const selectedGroups = this.getSelectedCommits();
      const peerRepoPath = selectedGroups[0]?.peerRepoPath || '';

      const result = await workflowService.acceptPreview(peerRepoPath);

      if (result.success) {
        // Call the onAccept callback
        await this.config.onAccept(previewState.previewedCommits, peerRepoPath);
        this.isProcessing = false;
        this.close();
      } else {
        this.showMessage(result.message, true);
      }
    } catch (error: any) {
      this.showMessage(`Accept failed: ${error.message}`, true);
    }
  }

  private async rejectPreview() {
    this.showProcessing('Reverting changes...');

    try {
      const workflowService = getCherryPickWorkflowService();
      const previewState = workflowService.getPreviewState();

      if (!previewState) {
        this.showMessage('No preview active', true);
        return;
      }

      // Use the first peer's repo path for memory storage
      const selectedGroups = this.getSelectedCommits();
      const peerRepoPath = selectedGroups[0]?.peerRepoPath || '';

      const result = await workflowService.rejectPreview(peerRepoPath);

      if (result.success) {
        // Call the onReject callback
        await this.config.onReject(previewState.previewedCommits, peerRepoPath);
        this.isProcessing = false;
        this.close();
      } else {
        this.showMessage(result.message, true);
      }
    } catch (error: any) {
      this.showMessage(`Reject failed: ${error.message}`, true);
    }
  }

  private async cancelPreview() {
    this.showProcessing('Cancelling preview...');

    try {
      const workflowService = getCherryPickWorkflowService();
      const result = await workflowService.cancelPreview();

      if (result.success) {
        this.isProcessing = false;
        // Go back to selection view
        this.renderContent();
      } else {
        this.showMessage(result.message, true);
      }
    } catch (error: any) {
      this.showMessage(`Cancel failed: ${error.message}`, true);
    }
  }

  private async acceptSelected() {
    const selectedGroups = this.getSelectedCommits();
    if (selectedGroups.length === 0) {
      this.showMessage('No commits selected');
      return;
    }

    this.isProcessing = true;
    this.showProcessing('Accepting commits...');

    try {
      const workflowService = getCherryPickWorkflowService();

      for (const group of selectedGroups) {
        const result = await workflowService.acceptCommits(
          this.config.dreamNodePath,
          this.config.dreamNodeUuid,
          group.peerRepoPath,
          group.commits
        );

        if (!result.success) {
          this.showMessage(result.message, true);
          this.isProcessing = false;
          return;
        }

        await this.config.onAccept(group.commits, group.peerRepoPath);
      }

      this.isProcessing = false;
      this.close();
    } catch (error: any) {
      this.showMessage(`Accept failed: ${error.message}`, true);
      this.isProcessing = false;
    }
  }

  private async rejectSelected() {
    const selectedGroups = this.getSelectedCommits();
    if (selectedGroups.length === 0) {
      this.showMessage('No commits selected');
      return;
    }

    this.isProcessing = true;
    this.showProcessing('Rejecting commits...');

    try {
      const workflowService = getCherryPickWorkflowService();

      for (const group of selectedGroups) {
        const result = await workflowService.rejectCommits(
          this.config.dreamNodeUuid,
          group.peerRepoPath,
          group.commits
        );

        if (!result.success) {
          this.showMessage(result.message, true);
          this.isProcessing = false;
          return;
        }

        await this.config.onReject(group.commits, group.peerRepoPath);
      }

      this.isProcessing = false;
      this.close();
    } catch (error: any) {
      this.showMessage(`Reject failed: ${error.message}`, true);
      this.isProcessing = false;
    }
  }

  private async acceptPeerCommits(group: PeerCommitGroup) {
    this.isProcessing = true;
    this.showProcessing(`Accepting commits from ${group.peerName}...`);

    try {
      const workflowService = getCherryPickWorkflowService();
      const result = await workflowService.acceptCommits(
        this.config.dreamNodePath,
        this.config.dreamNodeUuid,
        group.peerRepoPath,
        group.commits
      );

      if (result.success) {
        await this.config.onAccept(group.commits, group.peerRepoPath);

        // Remove these commits from selection state and re-render
        for (const commit of group.commits) {
          this.selectionState.delete(commit.originalHash);
        }

        // Remove empty peer group from config
        const groupIndex = this.config.peerGroups.findIndex(g => g.peerUuid === group.peerUuid);
        if (groupIndex >= 0) {
          this.config.peerGroups.splice(groupIndex, 1);
        }

        this.isProcessing = false;

        // Close if no more commits
        if (this.config.peerGroups.length === 0) {
          this.close();
        } else {
          this.renderContent();
        }
      } else {
        this.showMessage(result.message, true);
        this.isProcessing = false;
      }
    } catch (error: any) {
      this.showMessage(`Accept failed: ${error.message}`, true);
      this.isProcessing = false;
    }
  }

  private async rejectPeerCommits(group: PeerCommitGroup) {
    this.isProcessing = true;
    this.showProcessing(`Rejecting commits from ${group.peerName}...`);

    try {
      const workflowService = getCherryPickWorkflowService();
      const result = await workflowService.rejectCommits(
        this.config.dreamNodeUuid,
        group.peerRepoPath,
        group.commits
      );

      if (result.success) {
        await this.config.onReject(group.commits, group.peerRepoPath);

        // Remove these commits from selection state
        for (const commit of group.commits) {
          this.selectionState.delete(commit.originalHash);
        }

        // Remove empty peer group from config
        const groupIndex = this.config.peerGroups.findIndex(g => g.peerUuid === group.peerUuid);
        if (groupIndex >= 0) {
          this.config.peerGroups.splice(groupIndex, 1);
        }

        this.isProcessing = false;

        // Close if no more commits
        if (this.config.peerGroups.length === 0) {
          this.close();
        } else {
          this.renderContent();
        }
      } else {
        this.showMessage(result.message, true);
        this.isProcessing = false;
      }
    } catch (error: any) {
      this.showMessage(`Reject failed: ${error.message}`, true);
      this.isProcessing = false;
    }
  }

  private async acceptSingleCommit(commit: PendingCommit, peerRepoPath: string) {
    this.isProcessing = true;
    this.showProcessing('Accepting commit...');

    try {
      const workflowService = getCherryPickWorkflowService();
      const result = await workflowService.acceptCommits(
        this.config.dreamNodePath,
        this.config.dreamNodeUuid,
        peerRepoPath,
        [commit]
      );

      if (result.success) {
        await this.config.onAccept([commit], peerRepoPath);

        // Remove from selection state
        this.selectionState.delete(commit.originalHash);

        // Remove from peer group
        for (const group of this.config.peerGroups) {
          const idx = group.commits.findIndex(c => c.originalHash === commit.originalHash);
          if (idx >= 0) {
            group.commits.splice(idx, 1);
            if (group.commits.length === 0) {
              const groupIdx = this.config.peerGroups.indexOf(group);
              this.config.peerGroups.splice(groupIdx, 1);
            }
            break;
          }
        }

        this.isProcessing = false;

        if (this.config.peerGroups.length === 0) {
          this.close();
        } else {
          this.renderContent();
        }
      } else {
        this.showMessage(result.message, true);
        this.isProcessing = false;
      }
    } catch (error: any) {
      this.showMessage(`Accept failed: ${error.message}`, true);
      this.isProcessing = false;
    }
  }

  private async rejectSingleCommit(commit: PendingCommit, peerRepoPath: string) {
    this.isProcessing = true;
    this.showProcessing('Rejecting commit...');

    try {
      const workflowService = getCherryPickWorkflowService();
      const result = await workflowService.rejectCommits(
        this.config.dreamNodeUuid,
        peerRepoPath,
        [commit]
      );

      if (result.success) {
        await this.config.onReject([commit], peerRepoPath);

        // Remove from selection state
        this.selectionState.delete(commit.originalHash);

        // Remove from peer group
        for (const group of this.config.peerGroups) {
          const idx = group.commits.findIndex(c => c.originalHash === commit.originalHash);
          if (idx >= 0) {
            group.commits.splice(idx, 1);
            if (group.commits.length === 0) {
              const groupIdx = this.config.peerGroups.indexOf(group);
              this.config.peerGroups.splice(groupIdx, 1);
            }
            break;
          }
        }

        this.isProcessing = false;

        if (this.config.peerGroups.length === 0) {
          this.close();
        } else {
          this.renderContent();
        }
      } else {
        this.showMessage(result.message, true);
        this.isProcessing = false;
      }
    } catch (error: any) {
      this.showMessage(`Reject failed: ${error.message}`, true);
      this.isProcessing = false;
    }
  }

  private showProcessing(message: string) {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: message });

    const spinnerEl = contentEl.createDiv({ cls: 'cherry-pick-spinner' });
    spinnerEl.createEl('div', { cls: 'cherry-pick-spinner-inner' });
  }

  private showMessage(message: string, isError = false) {
    const { contentEl } = this;

    // Find or create message container
    let messageEl = contentEl.querySelector('.cherry-pick-message') as HTMLElement;
    if (!messageEl) {
      messageEl = contentEl.createDiv({ cls: 'cherry-pick-message' });
    }

    messageEl.empty();
    messageEl.classList.toggle('cherry-pick-message-error', isError);
    messageEl.createEl('span', { text: message });

    // Auto-hide after 3 seconds
    setTimeout(() => {
      messageEl.empty();
    }, 3000);
  }

  private addStyles() {
    const styleId = 'cherry-pick-preview-modal-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .cherry-pick-preview-modal {
        max-width: 600px;
      }

      .cherry-pick-modal-title {
        margin-bottom: 0.5em;
      }

      .cherry-pick-modal-subtitle {
        color: var(--text-muted);
        margin-bottom: 1.5em;
      }

      .cherry-pick-peer-groups {
        margin-bottom: 1.5em;
      }

      .cherry-pick-peer-group {
        background: var(--background-secondary);
        border-radius: 8px;
        margin-bottom: 1em;
        overflow: hidden;
      }

      .cherry-pick-peer-header {
        display: flex;
        align-items: center;
        gap: 0.5em;
        padding: 0.75em 1em;
        background: var(--background-secondary-alt);
        border-bottom: 1px solid var(--background-modifier-border);
      }

      .cherry-pick-peer-checkbox {
        margin: 0;
      }

      .cherry-pick-peer-name {
        font-weight: bold;
        color: var(--text-accent);
        flex: 1;
      }

      .cherry-pick-peer-count {
        color: var(--text-muted);
        font-size: 0.9em;
      }

      .cherry-pick-peer-actions {
        display: flex;
        gap: 0.5em;
        margin-left: auto;
      }

      .cherry-pick-commits-list {
        padding: 0.5em;
      }

      .cherry-pick-commit {
        display: flex;
        align-items: flex-start;
        gap: 0.75em;
        padding: 0.75em;
        border-radius: 4px;
        margin-bottom: 0.5em;
        transition: background 0.15s;
      }

      .cherry-pick-commit:hover {
        background: var(--background-modifier-hover);
      }

      .cherry-pick-commit.selected {
        background: var(--background-modifier-hover);
      }

      .cherry-pick-commit-checkbox {
        margin-top: 0.25em;
      }

      .cherry-pick-commit-info {
        flex: 1;
        min-width: 0;
      }

      .cherry-pick-commit-subject {
        font-weight: 500;
        margin-bottom: 0.25em;
        word-break: break-word;
      }

      .cherry-pick-commit-meta {
        font-size: 0.85em;
        color: var(--text-muted);
      }

      .cherry-pick-commit-also-from {
        font-size: 0.8em;
        color: var(--text-faint);
        margin-top: 0.25em;
        display: flex;
        align-items: center;
        gap: 0.25em;
        flex-wrap: wrap;
      }

      .cherry-pick-also-from-peer {
        color: var(--text-accent);
        cursor: default;
        padding: 0.1em 0.3em;
        border-radius: 3px;
        background: var(--background-secondary-alt);
        transition: background 0.15s, color 0.15s;
      }

      .cherry-pick-also-from-peer:hover {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
      }

      /* Shared commit indicator - visual badge */
      .cherry-pick-commit-shared {
        position: relative;
      }

      .cherry-pick-commit-shared::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 3px;
        background: var(--interactive-accent);
        border-radius: 2px;
      }

      .cherry-pick-commit-actions {
        display: flex;
        gap: 0.25em;
        opacity: 0;
        transition: opacity 0.15s;
      }

      .cherry-pick-commit:hover .cherry-pick-commit-actions {
        opacity: 1;
      }

      .cherry-pick-btn {
        border: none;
        border-radius: 4px;
        padding: 0.25em 0.5em;
        cursor: pointer;
        font-size: 0.85em;
        transition: background 0.15s;
      }

      .cherry-pick-btn-accept-small {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
      }

      .cherry-pick-btn-accept-small:hover {
        background: var(--interactive-accent-hover);
      }

      .cherry-pick-btn-reject-small {
        background: var(--background-modifier-error);
        color: var(--text-on-accent);
      }

      .cherry-pick-btn-reject-small:hover {
        opacity: 0.9;
      }

      .cherry-pick-btn-icon {
        width: 24px;
        height: 24px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--background-modifier-border);
      }

      .cherry-pick-btn-icon:hover {
        background: var(--background-modifier-border-hover);
      }

      .cherry-pick-btn-accept-icon:hover {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
      }

      .cherry-pick-btn-reject-icon:hover {
        background: var(--background-modifier-error);
        color: var(--text-on-accent);
      }

      .cherry-pick-modal-buttons {
        margin-top: 1.5em;
        display: flex;
        justify-content: flex-end;
        gap: 0.5em;
      }

      .cherry-pick-preview-info {
        background: var(--background-secondary);
        padding: 1.5em;
        border-radius: 8px;
        margin: 1.5em 0;
      }

      .cherry-pick-preview-stats {
        font-size: 1.1em;
        font-weight: 500;
        margin-bottom: 0.5em;
      }

      .cherry-pick-preview-stash-notice {
        color: var(--text-muted);
        font-size: 0.9em;
      }

      .cherry-pick-spinner {
        display: flex;
        justify-content: center;
        padding: 2em;
      }

      .cherry-pick-spinner-inner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--background-modifier-border);
        border-top-color: var(--interactive-accent);
        border-radius: 50%;
        animation: cherry-pick-spin 1s linear infinite;
      }

      @keyframes cherry-pick-spin {
        to { transform: rotate(360deg); }
      }

      .cherry-pick-message {
        padding: 0.75em 1em;
        border-radius: 4px;
        margin-top: 1em;
        background: var(--background-secondary);
        text-align: center;
      }

      .cherry-pick-message-error {
        background: var(--background-modifier-error);
        color: var(--text-on-accent);
      }

      /* Rejection history styles */
      .cherry-pick-rejection-history {
        margin-top: 1.5em;
        padding-top: 1em;
        border-top: 1px solid var(--background-modifier-border);
      }

      .cherry-pick-history-header {
        display: flex;
        align-items: center;
        gap: 0.5em;
        cursor: pointer;
        padding: 0.5em;
        border-radius: 4px;
        color: var(--text-muted);
        transition: background 0.15s;
      }

      .cherry-pick-history-header:hover {
        background: var(--background-modifier-hover);
      }

      .cherry-pick-history-toggle {
        font-size: 0.8em;
        width: 1em;
        text-align: center;
      }

      .cherry-pick-history-title {
        font-size: 0.9em;
      }

      .cherry-pick-history-content {
        margin-top: 0.5em;
        padding-left: 1em;
      }

      .cherry-pick-history-peer {
        margin-bottom: 1em;
      }

      .cherry-pick-history-peer-name {
        font-size: 0.85em;
        color: var(--text-faint);
        margin-bottom: 0.5em;
      }

      .cherry-pick-history-commit {
        display: flex;
        align-items: center;
        gap: 0.5em;
        padding: 0.5em;
        border-radius: 4px;
        margin-bottom: 0.25em;
        background: var(--background-secondary);
      }

      .cherry-pick-history-commit-info {
        flex: 1;
        min-width: 0;
      }

      .cherry-pick-history-commit-subject {
        font-size: 0.9em;
        color: var(--text-normal);
      }

      .cherry-pick-history-commit-date {
        font-size: 0.8em;
        color: var(--text-faint);
      }

      .cherry-pick-btn-unreject {
        background: var(--background-modifier-border);
        color: var(--text-muted);
        font-size: 0.8em;
        padding: 0.2em 0.5em;
      }

      .cherry-pick-btn-unreject:hover {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
      }
    `;
    document.head.appendChild(style);
  }
}
