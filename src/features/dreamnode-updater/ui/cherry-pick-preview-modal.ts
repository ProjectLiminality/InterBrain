/**
 * Cherry-Pick Preview Modal
 *
 * Enhanced modal for the cherry-pick collaboration workflow.
 * Features:
 * - Groups commits by peer (Dreamer)
 * - Checkboxes for individual commit selection
 * - Per-commit and per-peer accept/reject/preview actions
 * - Preview mode with stash support
 * - Rejection history with restore capability
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
import { showConflictResolutionModal } from './conflict-resolution-modal';

export interface CherryPickPreviewConfig {
  /** Path to the DreamNode being updated */
  dreamNodePath: string;
  /** UUID of the DreamNode */
  dreamNodeUuid: string;
  /** Display name of the DreamNode */
  dreamNodeName: string;
  /** Commits grouped by peer */
  peerGroups: PeerCommitGroup[];
  /** All known peers (for rejection history even when no pending commits) */
  allPeers?: Array<{ uuid: string; name: string; repoPath: string }>;
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
  private isHistoryExpanded = true; // Start expanded so users see it

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

    // Use allPeers if available (covers case when no pending commits)
    // Otherwise fall back to peerGroups
    const peersToCheck = this.config.allPeers
      ? this.config.allPeers.map(p => ({ peerRepoPath: p.repoPath, peerName: p.name }))
      : this.config.peerGroups.map(g => ({ peerRepoPath: g.peerRepoPath, peerName: g.peerName }));

    for (const peer of peersToCheck) {
      const history = await memoryService.getRejectionHistory(
        peer.peerRepoPath,
        this.config.dreamNodeUuid
      );
      if (history.length > 0) {
        this.rejectionHistory.set(peer.peerRepoPath, history);
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

    // Calculate totals
    const totalCommits = this.config.peerGroups.reduce((sum, g) => sum + g.commits.length, 0);
    const selectedCount = Array.from(this.selectionState.values()).filter(s => s.selected).length;
    const totalRejected = Array.from(this.rejectionHistory.values()).reduce((sum, h) => sum + h.length, 0);

    // Subtitle with counts
    if (totalCommits > 0) {
      contentEl.createEl('p', {
        text: `${selectedCount} of ${totalCommits} pending commit(s) selected`,
        cls: 'cherry-pick-modal-subtitle'
      });
    }

    // === PENDING COMMITS SECTION ===
    const pendingSection = contentEl.createDiv({ cls: 'cherry-pick-section' });

    const pendingHeader = pendingSection.createDiv({ cls: 'cherry-pick-section-header' });
    pendingHeader.createEl('h3', {
      text: `📥 Pending Updates`,
      cls: 'cherry-pick-section-title'
    });
    if (totalCommits > 0) {
      pendingHeader.createEl('span', {
        text: `${totalCommits}`,
        cls: 'cherry-pick-section-badge'
      });
    }

    if (totalCommits === 0) {
      // Empty state for pending
      const emptyEl = pendingSection.createDiv({ cls: 'cherry-pick-empty-inline' });
      emptyEl.createEl('span', {
        text: '✓ All caught up! No pending updates from peers.',
        cls: 'cherry-pick-empty-text'
      });
    } else {
      // Peer groups
      const groupsContainer = pendingSection.createDiv({ cls: 'cherry-pick-peer-groups' });
      for (const group of this.config.peerGroups) {
        if (group.commits.length > 0) {
          this.renderPeerGroup(groupsContainer, group, 'pending');
        }
      }

      // Action buttons for pending commits
      this.renderActionButtons(pendingSection);
    }

    // === REJECTION HISTORY SECTION ===
    const historySection = contentEl.createDiv({ cls: 'cherry-pick-section cherry-pick-history-section' });

    const historyHeader = historySection.createDiv({
      cls: 'cherry-pick-section-header cherry-pick-section-header-collapsible'
    });
    historyHeader.createEl('span', {
      text: this.isHistoryExpanded ? '▼' : '▶',
      cls: 'cherry-pick-section-toggle'
    });
    historyHeader.createEl('h3', {
      text: `🚫 Previously Rejected`,
      cls: 'cherry-pick-section-title'
    });
    if (totalRejected > 0) {
      historyHeader.createEl('span', {
        text: `${totalRejected}`,
        cls: 'cherry-pick-section-badge cherry-pick-section-badge-muted'
      });
    }

    historyHeader.addEventListener('click', () => {
      this.isHistoryExpanded = !this.isHistoryExpanded;
      this.renderContent();
    });

    if (this.isHistoryExpanded) {
      if (totalRejected === 0) {
        const emptyEl = historySection.createDiv({ cls: 'cherry-pick-empty-inline' });
        emptyEl.createEl('span', {
          text: 'No rejected commits.',
          cls: 'cherry-pick-empty-text'
        });
      } else {
        // Group rejected commits by peer - same UI as pending
        const historyContainer = historySection.createDiv({ cls: 'cherry-pick-peer-groups' });
        this.renderRejectionGroups(historyContainer);
      }
    }
  }

  private renderPeerGroup(container: HTMLElement, group: PeerCommitGroup, mode: 'pending' | 'rejected') {
    const groupEl = container.createDiv({ cls: 'cherry-pick-peer-group' });

    // Peer header with select all toggle
    const headerEl = groupEl.createDiv({ cls: 'cherry-pick-peer-header' });

    if (mode === 'pending') {
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
    }

    headerEl.createEl('span', {
      text: `📡 ${group.peerName}`,
      cls: 'cherry-pick-peer-name'
    });

    headerEl.createEl('span', {
      text: `(${group.commits.length} commit${group.commits.length > 1 ? 's' : ''})`,
      cls: 'cherry-pick-peer-count'
    });

    // Per-peer quick actions
    if (mode === 'pending') {
      const peerActionsEl = headerEl.createDiv({ cls: 'cherry-pick-peer-actions' });

      const previewAllBtn = peerActionsEl.createEl('button', {
        text: '👁',
        cls: 'cherry-pick-btn cherry-pick-btn-icon cherry-pick-btn-preview-icon',
        attr: { title: 'Preview all from this peer' }
      });
      previewAllBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.previewPeerCommits(group);
      });

      const acceptAllBtn = peerActionsEl.createEl('button', {
        text: '✓',
        cls: 'cherry-pick-btn cherry-pick-btn-icon cherry-pick-btn-accept-icon',
        attr: { title: 'Accept all from this peer' }
      });
      acceptAllBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.acceptPeerCommits(group);
      });

      const rejectAllBtn = peerActionsEl.createEl('button', {
        text: '✗',
        cls: 'cherry-pick-btn cherry-pick-btn-icon cherry-pick-btn-reject-icon',
        attr: { title: 'Reject all from this peer' }
      });
      rejectAllBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.rejectPeerCommits(group);
      });
    }

    // Commit list
    const commitsEl = groupEl.createDiv({ cls: 'cherry-pick-commits-list' });

    for (const commit of group.commits) {
      this.renderCommit(commitsEl, commit, group.peerRepoPath, mode);
    }
  }

  private renderRejectionGroups(container: HTMLElement) {
    // Group by peer, similar to pending commits
    for (const [peerRepoPath, history] of this.rejectionHistory.entries()) {
      // Find peer name
      let peerName = 'Unknown peer';
      if (this.config.allPeers) {
        const allPeer = this.config.allPeers.find(p => p.repoPath === peerRepoPath);
        if (allPeer) peerName = allPeer.name;
      }
      if (peerName === 'Unknown peer') {
        const groupPeer = this.config.peerGroups.find(g => g.peerRepoPath === peerRepoPath);
        if (groupPeer) peerName = groupPeer.peerName;
      }

      const groupEl = container.createDiv({ cls: 'cherry-pick-peer-group cherry-pick-peer-group-rejected' });

      // Header
      const headerEl = groupEl.createDiv({ cls: 'cherry-pick-peer-header' });
      headerEl.createEl('span', {
        text: `📡 ${peerName}`,
        cls: 'cherry-pick-peer-name'
      });
      headerEl.createEl('span', {
        text: `(${history.length} rejected)`,
        cls: 'cherry-pick-peer-count'
      });

      // Restore all button
      const peerActionsEl = headerEl.createDiv({ cls: 'cherry-pick-peer-actions' });
      const restoreAllBtn = peerActionsEl.createEl('button', {
        text: '↩ Restore All',
        cls: 'cherry-pick-btn cherry-pick-btn-restore-small'
      });
      restoreAllBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.restoreAllFromPeer(peerRepoPath, history);
      });

      // Commit list
      const commitsEl = groupEl.createDiv({ cls: 'cherry-pick-commits-list' });

      for (const rejected of history) {
        this.renderRejectedCommit(commitsEl, rejected, peerRepoPath);
      }
    }
  }

  private renderCommit(container: HTMLElement, commit: PendingCommit, peerRepoPath: string, mode: 'pending' | 'rejected') {
    const state = this.selectionState.get(commit.originalHash);
    if (!state && mode === 'pending') return;

    const isShared = commit.offeredByNames.length > 1;
    const commitEl = container.createDiv({
      cls: `cherry-pick-commit ${mode === 'pending' && state?.selected ? 'selected' : ''} ${isShared ? 'cherry-pick-commit-shared' : ''}`
    });

    // Checkbox (only for pending)
    if (mode === 'pending' && state) {
      const checkbox = commitEl.createEl('input', {
        type: 'checkbox',
        cls: 'cherry-pick-commit-checkbox'
      }) as HTMLInputElement;
      checkbox.checked = state.selected;
      checkbox.addEventListener('change', () => {
        state.selected = checkbox.checked;
        this.renderContent();
      });
    }

    // Commit info
    const infoEl = commitEl.createDiv({ cls: 'cherry-pick-commit-info' });

    // Subject line with expand toggle if body exists
    const hasBody = commit.body && commit.body.trim().length > 0;
    // Filter out cherry-pick provenance from body for display
    const displayBody = hasBody
      ? commit.body.replace(/\n*\(cherry picked from commit [a-f0-9]+\)\s*$/i, '').trim()
      : '';
    const showExpandable = displayBody.length > 0;

    const subjectRow = infoEl.createDiv({ cls: 'cherry-pick-commit-subject-row' });

    if (showExpandable) {
      const expandToggle = subjectRow.createSpan({
        text: '▶',
        cls: 'cherry-pick-commit-expand-toggle'
      });
      expandToggle.setAttribute('data-expanded', 'false');
    }

    subjectRow.createSpan({
      text: commit.subject,
      cls: 'cherry-pick-commit-subject'
    });

    const date = new Date(commit.timestamp * 1000).toLocaleDateString();
    const metaText = `${commit.author} • ${date}`;

    infoEl.createEl('div', {
      text: metaText,
      cls: 'cherry-pick-commit-meta'
    });

    // Expandable body - only render if expandable, start hidden
    if (showExpandable) {
      const bodyEl = infoEl.createDiv({
        cls: 'cherry-pick-commit-body'
      });
      // Start collapsed - hide by default
      bodyEl.style.display = 'none';

      bodyEl.createEl('pre', {
        text: displayBody,
        cls: 'cherry-pick-commit-body-text'
      });

      // Toggle expand/collapse on subject row click
      subjectRow.classList.add('cherry-pick-commit-subject-expandable');
      subjectRow.addEventListener('click', (e) => {
        e.stopPropagation();
        const toggle = subjectRow.querySelector('.cherry-pick-commit-expand-toggle');
        const isExpanded = toggle?.getAttribute('data-expanded') === 'true';

        if (toggle) {
          toggle.textContent = isExpanded ? '▶' : '▼';
          toggle.setAttribute('data-expanded', isExpanded ? 'false' : 'true');
        }

        // Toggle visibility
        bodyEl.style.display = isExpanded ? 'none' : 'block';
      });
    }

    if (commit.offeredByNames.length > 1) {
      const alsoFromEl = infoEl.createDiv({ cls: 'cherry-pick-commit-also-from' });
      alsoFromEl.createSpan({ text: 'Also from: ' });

      const otherPeers = commit.offeredByNames.slice(1);
      otherPeers.forEach((peerName, index) => {
        const peerSpan = alsoFromEl.createSpan({
          text: peerName,
          cls: 'cherry-pick-also-from-peer'
        });
        peerSpan.setAttribute('data-peer-name', peerName);

        if (index < otherPeers.length - 1) {
          alsoFromEl.createSpan({ text: ', ' });
        }
      });
    }

    // Per-commit actions
    if (mode === 'pending') {
      const actionsEl = commitEl.createDiv({ cls: 'cherry-pick-commit-actions' });

      const previewBtn = actionsEl.createEl('button', {
        text: '👁',
        cls: 'cherry-pick-btn cherry-pick-btn-icon cherry-pick-btn-preview-icon',
        attr: { title: 'Preview this commit' }
      });
      previewBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.previewSingleCommit(commit);
      });

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
  }

  private renderRejectedCommit(container: HTMLElement, rejected: RejectedCommit, peerRepoPath: string) {
    const commitEl = container.createDiv({ cls: 'cherry-pick-commit cherry-pick-commit-rejected' });

    // Commit info
    const infoEl = commitEl.createDiv({ cls: 'cherry-pick-commit-info' });

    infoEl.createEl('div', {
      text: rejected.subject,
      cls: 'cherry-pick-commit-subject'
    });

    const date = new Date(rejected.rejectedAt).toLocaleDateString();
    infoEl.createEl('div', {
      text: `Rejected ${date}`,
      cls: 'cherry-pick-commit-meta'
    });

    // Restore action
    const actionsEl = commitEl.createDiv({ cls: 'cherry-pick-commit-actions cherry-pick-commit-actions-visible' });

    const restoreBtn = actionsEl.createEl('button', {
      text: '↩',
      cls: 'cherry-pick-btn cherry-pick-btn-icon cherry-pick-btn-restore-icon',
      attr: { title: 'Restore this commit to pending' }
    });
    restoreBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.restoreCommit(peerRepoPath, rejected.originalHash);
    });
  }

  private renderActionButtons(container: HTMLElement) {
    const buttonContainer = container.createDiv({ cls: 'cherry-pick-modal-buttons' });

    new Setting(buttonContainer)
      .addButton((btn) =>
        btn
          .setButtonText('👁 Preview Selected')
          .onClick(async () => {
            await this.startPreview();
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText('✓ Accept Selected')
          .setCta()
          .onClick(async () => {
            await this.acceptSelected();
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText('✗ Reject Selected')
          .setWarning()
          .onClick(async () => {
            await this.rejectSelected();
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

  private async previewSingleCommit(commit: PendingCommit) {
    this.isProcessing = true;
    this.showProcessing('Starting preview...');

    try {
      const workflowService = getCherryPickWorkflowService();
      const result = await workflowService.startPreview(
        this.config.dreamNodePath,
        this.config.dreamNodeUuid,
        [commit]
      );

      if (result.success) {
        this.showPreviewBannerAndClose([commit]);
      } else if (result.conflict && result.conflictingCommit) {
        // Show conflict resolution modal
        this.isProcessing = false;
        this.close();
        this.showConflictModal(result.conflict, result.conflictingCommit);
      } else {
        this.showMessage(result.message, true);
        this.isProcessing = false;
      }
    } catch (error: any) {
      this.showMessage(`Preview failed: ${error.message}`, true);
      this.isProcessing = false;
    }
  }

  private async previewPeerCommits(group: PeerCommitGroup) {
    this.isProcessing = true;
    this.showProcessing('Starting preview...');

    try {
      const workflowService = getCherryPickWorkflowService();
      const result = await workflowService.startPreview(
        this.config.dreamNodePath,
        this.config.dreamNodeUuid,
        group.commits
      );

      if (result.success) {
        this.showPreviewBannerAndClose(group.commits);
      } else if (result.conflict && result.conflictingCommit) {
        // Show conflict resolution modal
        this.isProcessing = false;
        this.close();
        this.showConflictModal(result.conflict, result.conflictingCommit);
      } else {
        this.showMessage(result.message, true);
        this.isProcessing = false;
      }
    } catch (error: any) {
      this.showMessage(`Preview failed: ${error.message}`, true);
      this.isProcessing = false;
    }
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
        this.showPreviewBannerAndClose(allSelected);
      } else if (result.conflict && result.conflictingCommit) {
        // Show conflict resolution modal
        this.isProcessing = false;
        this.close();
        this.showConflictModal(result.conflict, result.conflictingCommit);
      } else {
        this.showMessage(result.message, true);
        this.isProcessing = false;
      }
    } catch (error: any) {
      this.showMessage(`Preview failed: ${error.message}`, true);
      this.isProcessing = false;
    }
  }

  private showPreviewBannerAndClose(commits: PendingCommit[]) {
    // Close modal and show non-blocking banner
    this.isProcessing = false;

    // Store what we need for the banner callbacks
    const selectedGroups = this.getSelectedCommits();
    const peerRepoPath = selectedGroups[0]?.peerRepoPath || '';

    // Store config for reopening modal
    const configForReopen = { ...this.config };

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

        // Reopen modal with refreshed state
        await this.reopenModalWithRefreshedState(configForReopen);
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

        // Reopen modal with refreshed state
        await this.reopenModalWithRefreshedState(configForReopen);
      },
      onCancel: async () => {
        const workflowService = getCherryPickWorkflowService();
        await workflowService.cancelPreview();

        // Reopen modal with refreshed state
        await this.reopenModalWithRefreshedState(configForReopen);
      }
    });

    // Close the modal - user can interact with dream space
    this.close();
  }

  private async reopenModalWithRefreshedState(originalConfig: CherryPickPreviewConfig) {
    // Re-fetch pending commits
    const workflowService = getCherryPickWorkflowService();

    const peers = originalConfig.allPeers || originalConfig.peerGroups.map(g => ({
      uuid: g.peerUuid,
      name: g.peerName,
      repoPath: g.peerRepoPath
    }));

    const newPeerGroups = await workflowService.getPendingCommits(
      originalConfig.dreamNodePath,
      originalConfig.dreamNodeUuid,
      peers
    );

    // Create new modal with updated peer groups
    const newConfig: CherryPickPreviewConfig = {
      ...originalConfig,
      peerGroups: newPeerGroups
    };

    const newModal = new CherryPickPreviewModal(this.app, newConfig);
    newModal.open();
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

        // Remove these commits from selection state and config
        for (const commit of group.commits) {
          this.selectionState.delete(commit.originalHash);
        }

        const groupIndex = this.config.peerGroups.findIndex(g => g.peerUuid === group.peerUuid);
        if (groupIndex >= 0) {
          this.config.peerGroups.splice(groupIndex, 1);
        }

        this.isProcessing = false;

        if (this.config.peerGroups.length === 0 && this.rejectionHistory.size === 0) {
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

        // Remove from selection state
        for (const commit of group.commits) {
          this.selectionState.delete(commit.originalHash);
        }

        // Remove peer group from config
        const groupIndex = this.config.peerGroups.findIndex(g => g.peerUuid === group.peerUuid);
        if (groupIndex >= 0) {
          this.config.peerGroups.splice(groupIndex, 1);
        }

        this.isProcessing = false;

        // Reload rejection history and re-render
        await this.loadRejectionHistory();
        this.renderContent();
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

        if (this.config.peerGroups.length === 0 && this.rejectionHistory.size === 0) {
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

        // Reload rejection history and re-render
        await this.loadRejectionHistory();
        this.renderContent();
      } else {
        this.showMessage(result.message, true);
        this.isProcessing = false;
      }
    } catch (error: any) {
      this.showMessage(`Reject failed: ${error.message}`, true);
      this.isProcessing = false;
    }
  }

  private async restoreCommit(peerRepoPath: string, originalHash: string) {
    const memoryService = getCollaborationMemoryService();
    const success = await memoryService.unreject(
      peerRepoPath,
      this.config.dreamNodeUuid,
      originalHash
    );

    if (success) {
      // Reload rejection history
      await this.loadRejectionHistory();

      // Re-fetch pending commits to include the restored one
      await this.refreshPendingCommits();

      this.renderContent();
    }
  }

  private async restoreAllFromPeer(peerRepoPath: string, history: RejectedCommit[]) {
    const memoryService = getCollaborationMemoryService();

    for (const rejected of history) {
      await memoryService.unreject(
        peerRepoPath,
        this.config.dreamNodeUuid,
        rejected.originalHash
      );
    }

    // Reload rejection history
    await this.loadRejectionHistory();

    // Re-fetch pending commits to include restored ones
    await this.refreshPendingCommits();

    this.renderContent();
  }

  private showConflictModal(
    conflict: import('../services/smart-merge-service').ConflictInfo,
    commit: PendingCommit
  ) {
    const configForReopen = { ...this.config };

    showConflictResolutionModal(this.app, {
      repoPath: this.config.dreamNodePath,
      conflict,
      commitSubject: commit.subject,
      onResolved: async (resolution) => {
        // Apply the resolution
        const workflowService = getCherryPickWorkflowService();
        const result = await workflowService.applyConflictResolution(
          this.config.dreamNodePath,
          resolution,
          commit
        );

        if (result.success) {
          // Reopen the cherry-pick modal with refreshed state
          await this.reopenModalWithRefreshedState(configForReopen);
        } else {
          // Show error and reopen
          console.error('[CherryPickModal] Conflict resolution apply failed:', result.message);
          await this.reopenModalWithRefreshedState(configForReopen);
        }
      },
      onCancel: async () => {
        // Abort the conflict and reopen modal
        const workflowService = getCherryPickWorkflowService();
        await workflowService.abortConflictResolution(this.config.dreamNodePath);
        await this.reopenModalWithRefreshedState(configForReopen);
      }
    });
  }

  private async refreshPendingCommits() {
    // Re-fetch pending commits from workflow service
    const workflowService = getCherryPickWorkflowService();

    const peers = this.config.allPeers || this.config.peerGroups.map(g => ({
      uuid: g.peerUuid,
      name: g.peerName,
      repoPath: g.peerRepoPath
    }));

    const newPeerGroups = await workflowService.getPendingCommits(
      this.config.dreamNodePath,
      this.config.dreamNodeUuid,
      peers
    );

    // Update config with new peer groups
    this.config.peerGroups = newPeerGroups;

    // Rebuild selection state
    this.selectionState.clear();
    for (const group of newPeerGroups) {
      for (const commit of group.commits) {
        this.selectionState.set(commit.originalHash, {
          commit,
          selected: true,
          peerRepoPath: group.peerRepoPath
        });
      }
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
        margin-bottom: 1em;
        font-size: 0.9em;
      }

      /* Section styling */
      .cherry-pick-section {
        margin-bottom: 1.5em;
      }

      .cherry-pick-section-header {
        display: flex;
        align-items: center;
        gap: 0.5em;
        margin-bottom: 0.75em;
      }

      .cherry-pick-section-header-collapsible {
        cursor: pointer;
        padding: 0.5em;
        margin: -0.5em;
        border-radius: 4px;
        transition: background 0.15s;
      }

      .cherry-pick-section-header-collapsible:hover {
        background: var(--background-modifier-hover);
      }

      .cherry-pick-section-toggle {
        font-size: 0.8em;
        width: 1em;
        color: var(--text-muted);
      }

      .cherry-pick-section-title {
        margin: 0;
        font-size: 1em;
        font-weight: 600;
        color: var(--text-normal);
      }

      .cherry-pick-section-badge {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
        font-size: 0.75em;
        padding: 0.15em 0.5em;
        border-radius: 10px;
        font-weight: 600;
      }

      .cherry-pick-section-badge-muted {
        background: var(--background-modifier-border);
        color: var(--text-muted);
      }

      /* Empty state */
      .cherry-pick-empty-inline {
        padding: 1em;
        background: var(--background-secondary);
        border-radius: 8px;
        text-align: center;
      }

      .cherry-pick-empty-text {
        color: var(--text-muted);
        font-size: 0.9em;
      }

      /* History section */
      .cherry-pick-history-section {
        border-top: 1px solid var(--background-modifier-border);
        padding-top: 1em;
      }

      .cherry-pick-peer-groups {
        display: flex;
        flex-direction: column;
        gap: 0.75em;
      }

      .cherry-pick-peer-group {
        background: var(--background-secondary);
        border-radius: 8px;
        overflow: hidden;
      }

      .cherry-pick-peer-group-rejected {
        opacity: 0.85;
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
        gap: 0.25em;
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

      .cherry-pick-commit:last-child {
        margin-bottom: 0;
      }

      .cherry-pick-commit:hover {
        background: var(--background-modifier-hover);
      }

      .cherry-pick-commit.selected {
        background: var(--background-modifier-hover);
      }

      .cherry-pick-commit-rejected {
        opacity: 0.9;
      }

      .cherry-pick-commit-checkbox {
        margin-top: 0.25em;
      }

      .cherry-pick-commit-info {
        flex: 1;
        min-width: 0;
      }

      .cherry-pick-commit-subject-row {
        display: flex;
        align-items: flex-start;
        gap: 0.35em;
        margin-bottom: 0.25em;
      }

      .cherry-pick-commit-subject-expandable {
        cursor: pointer;
      }

      .cherry-pick-commit-subject-expandable:hover .cherry-pick-commit-subject {
        color: var(--text-accent);
      }

      .cherry-pick-commit-expand-toggle {
        font-size: 0.7em;
        color: var(--text-muted);
        user-select: none;
        margin-top: 0.2em;
        transition: color 0.15s;
      }

      .cherry-pick-commit-subject-expandable:hover .cherry-pick-commit-expand-toggle {
        color: var(--text-accent);
      }

      .cherry-pick-commit-subject {
        font-weight: 500;
        word-break: break-word;
      }

      .cherry-pick-commit-body {
        overflow: hidden;
        transition: max-height 0.2s ease-out, opacity 0.2s ease-out;
      }

      .cherry-pick-commit-body-collapsed {
        max-height: 0;
        opacity: 0;
      }

      .cherry-pick-commit-body-expanded {
        max-height: 500px;
        opacity: 1;
      }

      .cherry-pick-commit-body-text {
        font-size: 0.8em;
        color: var(--text-muted);
        background: var(--background-primary);
        padding: 0.75em;
        border-radius: 4px;
        margin: 0.5em 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: inherit;
        line-height: 1.5;
        border-left: 2px solid var(--background-modifier-border);
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

      /* Shared commit indicator */
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

      .cherry-pick-commit-actions-visible {
        opacity: 1;
      }

      .cherry-pick-btn {
        border: none;
        border-radius: 4px;
        padding: 0.25em 0.5em;
        cursor: pointer;
        font-size: 0.85em;
        transition: background 0.15s, transform 0.1s;
      }

      .cherry-pick-btn:hover {
        transform: translateY(-1px);
      }

      .cherry-pick-btn:active {
        transform: translateY(0);
      }

      .cherry-pick-btn-icon {
        width: 28px;
        height: 28px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--background-modifier-border);
        font-size: 0.9em;
      }

      .cherry-pick-btn-icon:hover {
        background: var(--background-modifier-border-hover);
      }

      .cherry-pick-btn-preview-icon:hover {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
      }

      .cherry-pick-btn-accept-icon:hover {
        background: var(--interactive-success);
        color: var(--text-on-accent);
      }

      .cherry-pick-btn-reject-icon:hover {
        background: var(--background-modifier-error);
        color: var(--text-on-accent);
      }

      .cherry-pick-btn-restore-icon {
        background: var(--background-modifier-border);
      }

      .cherry-pick-btn-restore-icon:hover {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
      }

      .cherry-pick-btn-restore-small {
        background: var(--background-modifier-border);
        color: var(--text-muted);
        font-size: 0.8em;
      }

      .cherry-pick-btn-restore-small:hover {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
      }

      .cherry-pick-modal-buttons {
        margin-top: 1em;
        display: flex;
        justify-content: flex-end;
        gap: 0.5em;
      }

      .cherry-pick-modal-buttons .setting-item {
        border: none;
        padding: 0;
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
    `;
    document.head.appendChild(style);
  }
}
