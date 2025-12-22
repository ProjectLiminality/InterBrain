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

import { App, Modal, Setting, Notice } from 'obsidian';
import {
  PeerCommitGroup,
  PendingCommit,
  getCherryPickWorkflowService
} from '../services/cherry-pick-workflow-service';
import {
  RejectedCommit,
  getCollaborationMemoryService
} from '../services/collaboration-memory-service';
import {
  getUpdateSummaryService,
  initializeUpdateSummaryService,
  UpdateSummary
} from '../services/update-summary-service';
import { FetchResult } from '../../social-resonance-filter/services/git-sync-service';
import { showPreviewBanner } from './preview-banner';
import { showConflictResolutionModal } from './conflict-resolution-modal';
import { getURIHandlerService } from '../../uri-handler';
import { useInterBrainStore } from '../../../core/store/interbrain-store';

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

/** State for beacon preview cleanup */
interface BeaconPreviewState {
  commit: PendingCommit;
  clonedRepos: string[]; // Repo names that were newly cloned (not pre-existing)
  peerRepoPath: string;
  originalNodeId: string; // Original node to return to after preview
}

export class CherryPickPreviewModal extends Modal {
  private config: CherryPickPreviewConfig;
  private selectionState: Map<string, CommitSelectionState> = new Map();
  private isProcessing = false;
  private rejectionHistory: Map<string, RejectedCommit[]> = new Map();
  private adaptedCommits: Set<string> = new Set(); // Track commits with stored adaptations
  private isHistoryExpanded = false; // Start collapsed by default
  private beaconPreviewState: BeaconPreviewState | null = null; // Track beacon preview for cleanup

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
    const { contentEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass('cherry-pick-preview-modal');
    // Set width on the modal container itself
    modalEl.addClass('cherry-pick-preview-modal-container');
    // Also set inline style as fallback for CSS specificity issues
    modalEl.style.width = '650px';
    modalEl.style.maxWidth = '90vw';

    // Load rejection history and adaptations from all peers
    await this.loadRejectionHistory();
    await this.loadAdaptations();

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

  private async loadAdaptations() {
    const memoryService = getCollaborationMemoryService();
    this.adaptedCommits.clear();

    // Check all commits in all peer groups for stored adaptations
    for (const group of this.config.peerGroups) {
      for (const commit of group.commits) {
        const adaptation = await memoryService.getAdaptation(
          group.peerRepoPath,
          this.config.dreamNodeUuid,
          commit.originalHash
        );
        if (adaptation) {
          this.adaptedCommits.add(commit.originalHash);
        }
      }
    }

    if (this.adaptedCommits.size > 0) {
      console.log(`[CherryPickModal] Found ${this.adaptedCommits.size} adapted commit(s)`);
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

    // Header (fixed at top)
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

    // === SCROLLABLE CONTENT AREA ===
    const scrollableContent = contentEl.createDiv({ cls: 'cherry-pick-scrollable-content' });

    // === PENDING COMMITS SECTION ===
    const pendingSection = scrollableContent.createDiv({ cls: 'cherry-pick-section' });

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
    }

    // === REJECTION HISTORY SECTION ===
    const historySection = scrollableContent.createDiv({ cls: 'cherry-pick-section cherry-pick-history-section' });

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

    // === FIXED FOOTER WITH ACTION BUTTONS ===
    if (totalCommits > 0) {
      this.renderActionButtons(contentEl);
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
    const isBeacon = !!commit.beaconData;
    const commitEl = container.createDiv({
      cls: `cherry-pick-commit ${mode === 'pending' && state?.selected ? 'selected' : ''} ${isShared ? 'cherry-pick-commit-shared' : ''} ${isBeacon ? 'cherry-pick-commit-beacon' : ''}`
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

    // Show beacon indicator if this is a coherence beacon
    if (commit.beaconData) {
      subjectRow.createSpan({
        text: '🔗',
        cls: 'cherry-pick-commit-beacon-indicator',
        attr: { title: `Coherence Beacon: ${commit.beaconData.title} wants to include you` }
      });
    }

    // Show sparkle if commit has stored adaptation
    const hasAdaptation = this.adaptedCommits.has(commit.originalHash);
    if (hasAdaptation) {
      subjectRow.createSpan({
        text: '✨',
        cls: 'cherry-pick-commit-adapted-indicator',
        attr: { title: 'AI-adapted to work with your changes' }
      });
    }

    // For beacons, show a more descriptive subject
    const displaySubject = commit.beaconData
      ? `${commit.beaconData.title} wants to include you as a submodule`
      : commit.subject;

    subjectRow.createSpan({
      text: displaySubject,
      cls: `cherry-pick-commit-subject ${commit.beaconData ? 'cherry-pick-commit-subject-beacon' : ''}`
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

    // Count selected commits to determine if summarize should be enabled
    const selectedCount = Array.from(this.selectionState.values()).filter(s => s.selected).length;
    const canSummarize = selectedCount >= 2;

    new Setting(buttonContainer)
      .addButton((btn) => {
        btn
          .setButtonText('📝 Summarize Selected')
          .onClick(async () => {
            await this.showSummaryForSelection();
          });
        // Disable if less than 2 commits selected
        if (!canSummarize) {
          btn.setDisabled(true);
          btn.buttonEl.setAttribute('title', 'Select at least 2 commits to summarize');
        }
      })
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
    // If this is a beacon commit, use special beacon preview
    if (commit.beaconData) {
      await this.previewBeaconCommit(commit);
      return;
    }

    this.isProcessing = true;
    this.showProcessing('Starting preview...');

    // Find the peer repo path for this commit
    const peerGroup = this.config.peerGroups.find(g =>
      g.commits.some(c => c.originalHash === commit.originalHash)
    );
    const peerRepoPath = peerGroup?.peerRepoPath;

    try {
      const workflowService = getCherryPickWorkflowService();
      const result = await workflowService.startPreview(
        this.config.dreamNodePath,
        this.config.dreamNodeUuid,
        [commit],
        peerRepoPath
      );

      if (result.success) {
        this.showPreviewBannerAndClose([commit]);
      } else if (result.conflict && result.conflictingCommit) {
        // Show conflict resolution modal in preview mode
        this.isProcessing = false;
        this.close();
        this.showConflictModal(result.conflict, result.conflictingCommit, 'preview');
      } else {
        this.showMessage(result.message, true);
        this.isProcessing = false;
      }
    } catch (error: any) {
      this.showMessage(`Preview failed: ${error.message}`, true);
      this.isProcessing = false;
    }
  }

  /**
   * Preview a coherence beacon commit by opening the supermodule's DreamSong
   * (clones first if needed)
   */
  private async previewBeaconCommit(commit: PendingCommit) {
    if (!commit.beaconData) return;

    // Find the peer repo path for this commit
    const peerGroup = this.config.peerGroups.find(g =>
      g.commits.some(c => c.originalHash === commit.originalHash)
    );
    const peerRepoPath = peerGroup?.peerRepoPath || '';

    // Store the original node to return to after preview
    const store = useInterBrainStore.getState();
    const originalNodeId = store.selectedNode?.id || this.config.dreamNodeUuid;

    this.isProcessing = true;
    this.showProcessing(`Loading ${commit.beaconData.title} for preview...`);

    const clonedRepos: string[] = []; // Track newly cloned repos for cleanup

    try {
      // Clone the supermodule repository (will skip if already exists)
      const uriHandler = getURIHandlerService();
      const cloneResult = await uriHandler.cloneFromRadicle(commit.beaconData.radicleId, false);

      if (cloneResult.status === 'error') {
        console.error(`[BeaconPreview] Failed to clone/find ${commit.beaconData.radicleId}`);
        this.showMessage(`Failed to access repository. It may still be propagating on the network.`, true);
        this.isProcessing = false;
        return;
      }

      // Use the actual repo name from clone result (Radicle ID is source of truth)
      const actualRepoName = cloneResult.repoName || commit.beaconData.title;
      console.log(`[BeaconPreview] Repository resolved: ${commit.beaconData.radicleId} → "${actualRepoName}"`);

      // Track if this was a new clone (not skipped = already existed)
      if (cloneResult.status === 'success') {
        clonedRepos.push(actualRepoName);
      }

      // Save beacon preview state for cleanup and return
      this.beaconPreviewState = {
        commit,
        clonedRepos,
        peerRepoPath,
        originalNodeId
      };

      // Wait briefly for any vault updates
      await new Promise(resolve => setTimeout(resolve, 200));

      // Trigger vault rescan to ensure node is loaded
      const { serviceManager } = await import('../../../core/services/service-manager');
      await serviceManager.scanVault();

      // Find and select the target node using actual repo name
      const updatedStore = useInterBrainStore.getState();
      const targetNode = Array.from(updatedStore.dreamNodes.values())
        .map(data => data.node)
        .find(n => n.name === actualRepoName);

      if (!targetNode) {
        console.error(`[BeaconPreview] Node "${actualRepoName}" not found in vault after clone/skip`);
        this.showMessage(`Could not find "${actualRepoName}" in vault`, true);
        this.isProcessing = false;
        this.beaconPreviewState = null;
        return;
      }

      // Select the target node
      updatedStore.setSelectedNode(targetNode);

      // Wait for selection to take effect
      await new Promise(resolve => setTimeout(resolve, 100));

      // Open DreamSong fullscreen
      (this.app as any).commands.executeCommandById('interbrain:open-dreamsong-fullscreen');

      this.isProcessing = false;

      // Hide the modal (don't close - we'll reopen it)
      this.modalEl.style.display = 'none';

      // Show beacon preview banner
      this.showBeaconPreviewBanner(commit);

    } catch (error: any) {
      console.error('[CherryPickModal] Beacon preview failed:', error);
      this.showMessage(`Preview failed: ${error.message}`, true);
      this.isProcessing = false;
      this.beaconPreviewState = null;
    }
  }

  /**
   * Show a custom beacon preview banner (doesn't depend on workflow service state)
   */
  private showBeaconPreviewBanner(commit: PendingCommit) {
    // Remove any existing beacon banner
    const existingBanner = document.querySelector('.beacon-preview-banner');
    if (existingBanner) existingBanner.remove();

    const banner = document.createElement('div');
    banner.className = 'beacon-preview-banner preview-banner';

    // Add styles if not already present
    this.addBeaconBannerStyles();

    // Content
    const label = banner.createSpan({ cls: 'preview-banner-label' });
    label.innerHTML = `🔗 <strong>Beacon Preview</strong> · ${commit.beaconData?.title || 'Supermodule'}`;

    // Spacer
    banner.createDiv({ cls: 'preview-banner-spacer' });

    // Buttons
    const acceptBtn = banner.createEl('button', {
      text: '✓ Accept',
      cls: 'preview-banner-btn preview-banner-btn-accept'
    });
    acceptBtn.addEventListener('click', () => this.handleBeaconAccept());

    const rejectBtn = banner.createEl('button', {
      text: '✗ Reject',
      cls: 'preview-banner-btn preview-banner-btn-reject'
    });
    rejectBtn.addEventListener('click', () => this.handleBeaconReject());

    const laterBtn = banner.createEl('button', {
      text: 'Later',
      cls: 'preview-banner-btn preview-banner-btn-cancel'
    });
    laterBtn.addEventListener('click', () => this.handleBeaconLater());

    document.body.appendChild(banner);

    // Animate in
    requestAnimationFrame(() => {
      banner.classList.add('preview-banner-visible');
    });
  }

  private addBeaconBannerStyles() {
    const styleId = 'beacon-preview-banner-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .beacon-preview-banner {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 0.75em;
        background: var(--background-primary);
        border-top: 2px solid #e07a5f;
        padding: 0.5em 1em;
        box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.15);
        opacity: 0;
        transform: translateY(100%);
        transition: transform 0.2s ease-out, opacity 0.2s ease-out;
      }

      .beacon-preview-banner.preview-banner-visible {
        transform: translateY(0);
        opacity: 1;
      }

      .beacon-preview-banner .preview-banner-label {
        color: var(--text-normal);
        font-size: 0.9em;
        white-space: nowrap;
      }

      .beacon-preview-banner .preview-banner-label strong {
        color: #e07a5f;
      }

      .beacon-preview-banner .preview-banner-spacer {
        flex: 1;
      }

      .beacon-preview-banner .preview-banner-btn {
        border: none;
        border-radius: 4px;
        padding: 0.4em 0.8em;
        cursor: pointer;
        font-size: 0.85em;
        font-weight: 500;
        transition: background 0.15s, transform 0.1s;
        white-space: nowrap;
      }

      .beacon-preview-banner .preview-banner-btn:hover {
        transform: translateY(-1px);
      }

      .beacon-preview-banner .preview-banner-btn-accept {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
      }

      .beacon-preview-banner .preview-banner-btn-reject {
        background: var(--background-modifier-error);
        color: var(--text-on-accent);
      }

      .beacon-preview-banner .preview-banner-btn-cancel {
        background: var(--background-modifier-border);
        color: var(--text-normal);
      }
    `;
    document.head.appendChild(style);
  }

  private hideBeaconPreviewBanner() {
    const banner = document.querySelector('.beacon-preview-banner');
    if (banner) {
      banner.classList.remove('preview-banner-visible');
      setTimeout(() => banner.remove(), 200);
    }
  }

  private async handleBeaconAccept() {
    await this.acceptBeaconFromPreview();
    await this.returnToOriginalNodeAndReopenModal();
  }

  private async handleBeaconReject() {
    await this.rejectBeaconFromPreview();
    await this.returnToOriginalNodeAndReopenModal();
  }

  private async handleBeaconLater() {
    await this.cancelBeaconPreview();
    await this.returnToOriginalNodeAndReopenModal();
  }

  /**
   * Return to the original node and re-open the modal
   */
  private async returnToOriginalNodeAndReopenModal() {
    const originalNodeId = this.beaconPreviewState?.originalNodeId;
    this.beaconPreviewState = null;

    if (originalNodeId) {
      const store = useInterBrainStore.getState();
      const nodeData = store.dreamNodes.get(originalNodeId);
      if (nodeData) {
        store.setSelectedNode(nodeData.node);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Re-show the modal
    this.modalEl.style.display = '';

    // Refresh the content to reflect any changes
    await this.onOpen();
  }

  /**
   * Accept beacon from preview banner - cherry-pick the commit
   */
  private async acceptBeaconFromPreview() {
    if (!this.beaconPreviewState) return;

    const { commit, peerRepoPath } = this.beaconPreviewState;

    this.hideBeaconPreviewBanner();

    try {
      const workflowService = getCherryPickWorkflowService();
      const result = await workflowService.acceptCommits(
        this.config.dreamNodePath,
        this.config.dreamNodeUuid,
        peerRepoPath,
        [commit]
      );

      if (result.success) {
        new Notice(`Accepted coherence beacon from ${commit.beaconData?.title}`);

        // Remove from selection state
        this.selectionState.delete(commit.originalHash);

        // Remove from peer group
        for (const group of this.config.peerGroups) {
          const idx = group.commits.findIndex(c => c.originalHash === commit.originalHash);
          if (idx >= 0) {
            group.commits.splice(idx, 1);
            break;
          }
        }
      } else {
        new Notice(`Accept failed: ${result.message}`);
      }
    } catch (error: any) {
      new Notice(`Accept failed: ${error.message}`);
    }
    // Note: beaconPreviewState is cleared in returnToOriginalNodeAndReopenModal
  }

  /**
   * Reject beacon from preview banner - record rejection and clean up cloned repos
   */
  private async rejectBeaconFromPreview() {
    if (!this.beaconPreviewState) return;

    const { commit, clonedRepos, peerRepoPath } = this.beaconPreviewState;

    this.hideBeaconPreviewBanner();

    try {
      // Record rejection
      const workflowService = getCherryPickWorkflowService();
      await workflowService.rejectCommits(
        this.config.dreamNodeUuid,
        peerRepoPath,
        [commit]
      );

      // Clean up newly cloned repos (not pre-existing ones)
      if (clonedRepos.length > 0) {
        const fs = require('fs').promises;
        const path = require('path');
        const adapter = this.app.vault.adapter as any;
        const vaultPath = adapter.basePath || '';

        for (const repoName of clonedRepos) {
          const repoPath = path.join(vaultPath, repoName);
          try {
            await fs.rm(repoPath, { recursive: true, force: true });
            console.log(`[CherryPickModal] Cleaned up preview clone: ${repoName}`);
          } catch (cleanupError) {
            console.warn(`[CherryPickModal] Failed to clean up ${repoName}:`, cleanupError);
          }
        }

        // Rescan vault
        const { serviceManager } = await import('../../../core/services/service-manager');
        await serviceManager.scanVault();
      }

      new Notice(`Rejected coherence beacon from ${commit.beaconData?.title}`);

      // Remove from selection state
      this.selectionState.delete(commit.originalHash);

    } catch (error: any) {
      new Notice(`Reject failed: ${error.message}`);
    }
    // Note: beaconPreviewState is cleared in returnToOriginalNodeAndReopenModal
  }

  /**
   * Cancel beacon preview (Later) - clean up cloned repos without recording rejection
   */
  private async cancelBeaconPreview() {
    if (!this.beaconPreviewState) return;

    const { clonedRepos } = this.beaconPreviewState;

    this.hideBeaconPreviewBanner();

    // Clean up newly cloned repos (not pre-existing ones)
    if (clonedRepos.length > 0) {
      const fs = require('fs').promises;
      const path = require('path');
      const adapter = this.app.vault.adapter as any;
      const vaultPath = adapter.basePath || '';

      for (const repoName of clonedRepos) {
        const repoPath = path.join(vaultPath, repoName);
        try {
          await fs.rm(repoPath, { recursive: true, force: true });
          console.log(`[CherryPickModal] Cleaned up preview clone: ${repoName}`);
        } catch (cleanupError) {
          console.warn(`[CherryPickModal] Failed to clean up ${repoName}:`, cleanupError);
        }
      }

      // Rescan vault
      const { serviceManager } = await import('../../../core/services/service-manager');
      await serviceManager.scanVault();
    }

    // Note: beaconPreviewState is cleared in returnToOriginalNodeAndReopenModal
  }

  private async previewPeerCommits(group: PeerCommitGroup) {
    this.isProcessing = true;
    this.showProcessing('Starting preview...');

    try {
      const workflowService = getCherryPickWorkflowService();
      const result = await workflowService.startPreview(
        this.config.dreamNodePath,
        this.config.dreamNodeUuid,
        group.commits,
        group.peerRepoPath
      );

      if (result.success) {
        this.showPreviewBannerAndClose(group.commits);
      } else if (result.conflict && result.conflictingCommit) {
        // Show conflict resolution modal in preview mode
        this.isProcessing = false;
        this.close();
        this.showConflictModal(result.conflict, result.conflictingCommit, 'preview');
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
    // Use the first peer's repo path for adaptation lookups
    const peerRepoPath = selectedGroups[0]?.peerRepoPath;

    this.isProcessing = true;
    this.showProcessing('Starting preview...');

    try {
      const workflowService = getCherryPickWorkflowService();
      const result = await workflowService.startPreview(
        this.config.dreamNodePath,
        this.config.dreamNodeUuid,
        allSelected,
        peerRepoPath
      );

      if (result.success) {
        this.showPreviewBannerAndClose(allSelected);
      } else if (result.conflict && result.conflictingCommit) {
        // Show conflict resolution modal in preview mode
        this.isProcessing = false;
        this.close();
        this.showConflictModal(result.conflict, result.conflictingCommit, 'preview');
      } else {
        this.showMessage(result.message, true);
        this.isProcessing = false;
      }
    } catch (error: any) {
      this.showMessage(`Preview failed: ${error.message}`, true);
      this.isProcessing = false;
    }
  }

  private showPreviewBannerAndClose(_commits: PendingCommit[]) {
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
          if (result.conflict && result.conflictingCommit) {
            // Show conflict resolution modal
            this.isProcessing = false;
            this.close();
            this.showConflictModal(result.conflict, result.conflictingCommit);
            return;
          }
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

    // For beacon commits, clone the supermodule first if needed
    if (commit.beaconData) {
      this.showProcessing(`Loading ${commit.beaconData.title}...`);

      try {
        const uriHandler = getURIHandlerService();
        const cloneResult = await uriHandler.cloneFromRadicle(commit.beaconData.radicleId, false);

        if (cloneResult.status === 'error') {
          this.showMessage(`Failed to access repository. It may still be propagating.`, true);
          this.isProcessing = false;
          return;
        }
        console.log(`[AcceptBeacon] Repository resolved: ${commit.beaconData.radicleId} → "${cloneResult.repoName}"`);
      } catch (cloneError: any) {
        this.showMessage(`Clone failed: ${cloneError.message}`, true);
        this.isProcessing = false;
        return;
      }
    }

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
    commit: PendingCommit,
    mode: 'accept' | 'preview' = 'accept'
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
          commit,
          conflict.filePath // Pass the conflict file path so it can write the resolved content
        );

        if (result.success) {
          const memoryService = getCollaborationMemoryService();

          // Find peer repo path for this commit
          const peerGroup = this.config.peerGroups.find(g =>
            g.commits.some(c => c.originalHash === commit.originalHash)
          );
          const peerRepoPath = peerGroup?.peerRepoPath || '';

          // Store the adaptation for future use
          if (resolution.mergedContent && peerGroup) {
            await memoryService.storeAdaptation(
              peerRepoPath,
              this.config.dreamNodeUuid,
              commit.originalHash,
              {
                files: { [conflict.filePath]: resolution.mergedContent },
                createdAt: Date.now(),
                method: resolution.method === 'ai-magic' ? 'ai-magic' : 'manual'
              }
            );
          }

          if (mode === 'preview') {
            // Preview mode: Set up preview state and show banner
            // This is needed because the normal startPreview flow was interrupted by conflict
            workflowService.setPreviewState(
              this.config.dreamNodePath,
              this.config.dreamNodeUuid,
              [commit]
            );
            this.showPreviewBannerAndClose([commit]);
          } else {
            // Accept mode: Record the acceptance immediately
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            const adapter = this.app.vault.adapter as any;
            const fullPath = require('path').join(adapter.basePath || '', this.config.dreamNodePath);
            let appliedHash = commit.originalHash;
            try {
              const { stdout } = await execAsync('git rev-parse HEAD', { cwd: fullPath });
              appliedHash = stdout.trim();
            } catch {
              // Use original hash if we can't get new one
            }

            await memoryService.recordAcceptance(
              peerRepoPath,
              this.config.dreamNodeUuid,
              [{
                originalHash: commit.originalHash,
                appliedHash: appliedHash,
                subject: commit.subject,
                relayedBy: commit.offeredBy
              }]
            );

            // Notify via callback
            await this.config.onAccept([commit], peerRepoPath);

            // Reopen the cherry-pick modal with refreshed state
            await this.reopenModalWithRefreshedState(configForReopen);
          }

          return { success: true };
        } else {
          // Return failure so conflict modal can show retry/report options
          console.log('[CherryPickModal] Conflict resolution apply failed:', result.message);
          return { success: false, error: result.message || result.error };
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

  /**
   * Show AI-generated summary for selected commits
   * Requires at least 2 commits - single commits are self-descriptive
   */
  private async showSummaryForSelection(): Promise<void> {
    const selectedGroups = this.getSelectedCommits();
    const allSelected = selectedGroups.flatMap(g => g.commits);

    if (allSelected.length < 2) {
      new Notice('Select at least 2 commits to summarize');
      return;
    }

    // Show loading overlay
    const overlayEl = this.contentEl.createDiv({ cls: 'cherry-pick-summary-overlay' });
    overlayEl.createDiv({ cls: 'cherry-pick-summary-loading', text: 'Generating summary...' });

    try {
      // Get stats for selected commits
      const workflowService = getCherryPickWorkflowService();
      const hashes = allSelected.map(c => c.cherryPickRef);
      const stats = await workflowService.getStatsForCommits(
        this.config.dreamNodePath,
        hashes
      );

      // Build a FetchResult-like object for the summary service
      const partialResult: FetchResult = {
        hasUpdates: true,
        commits: allSelected.map(c => ({
          hash: c.hash,
          author: c.author,
          email: c.email,
          timestamp: c.timestamp,
          subject: c.subject,
          body: c.body,
          source: c.source
        })),
        filesChanged: stats.filesChanged,
        insertions: stats.insertions,
        deletions: stats.deletions
      };

      // Generate AI summary
      initializeUpdateSummaryService();
      const summaryService = getUpdateSummaryService();
      const summary = await summaryService.generateUpdateSummary(partialResult);

      // Remove loading and show summary
      overlayEl.empty();
      this.displaySummary(overlayEl, summary, stats);
    } catch (error: any) {
      overlayEl.empty();
      overlayEl.createDiv({
        cls: 'cherry-pick-summary-error',
        text: 'Failed to generate summary'
      });
      console.error('[CherryPickModal] Summary failed:', error);

      // Add close button
      const closeBtn = overlayEl.createEl('button', {
        text: 'Close',
        cls: 'cherry-pick-summary-close'
      });
      closeBtn.onclick = () => overlayEl.remove();
    }
  }

  /**
   * Display the briefing in an overlay
   */
  private displaySummary(
    overlayEl: HTMLElement,
    summary: UpdateSummary,
    stats: { filesChanged: number; insertions: number; deletions: number }
  ): void {
    // Header
    overlayEl.createEl('h3', { text: "What's been happening", cls: 'cherry-pick-summary-header' });

    // The briefing - just natural prose
    const contentEl = overlayEl.createDiv({ cls: 'cherry-pick-summary-content' });
    // Use briefing if available, otherwise fall back to userFacingChanges
    const briefingText = summary.briefing || summary.userFacingChanges;
    contentEl.createEl('p', { text: briefingText });

    // Stats at bottom
    const statsEl = overlayEl.createDiv({ cls: 'cherry-pick-summary-stats' });
    statsEl.setText(`${stats.filesChanged} files · +${stats.insertions} -${stats.deletions}`);

    // Close button
    const closeBtn = overlayEl.createEl('button', {
      text: 'Close',
      cls: 'cherry-pick-summary-close'
    });
    closeBtn.onclick = () => overlayEl.remove();
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
      .cherry-pick-preview-modal-container.modal {
        width: 650px !important;
        max-width: 90vw !important;
      }

      /* Layout: header, scrollable content, fixed footer */
      .cherry-pick-preview-modal {
        display: flex;
        flex-direction: column;
        max-height: 70vh;
      }

      .cherry-pick-modal-title {
        margin-bottom: 0.5em;
        flex-shrink: 0;
      }

      .cherry-pick-modal-subtitle {
        color: var(--text-muted);
        margin-bottom: 1em;
        font-size: 0.9em;
        flex-shrink: 0;
      }

      /* Scrollable content area */
      .cherry-pick-scrollable-content {
        flex: 1;
        overflow-y: auto;
        padding-right: 0.5em;
        margin-bottom: 1em;
      }

      /* Fixed footer for action buttons */
      .cherry-pick-modal-buttons {
        flex-shrink: 0;
        border-top: 1px solid var(--background-modifier-border);
        padding-top: 1em;
        margin-top: 0;
        background: var(--background-primary);
      }

      /* Section styling */
      .cherry-pick-section {
        margin-bottom: 1.5em;
      }

      .cherry-pick-section:last-child {
        margin-bottom: 0;
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

      .cherry-pick-commit-adapted-indicator {
        font-size: 0.85em;
        cursor: help;
        animation: cherry-pick-sparkle 2s ease-in-out infinite;
      }

      @keyframes cherry-pick-sparkle {
        0%, 100% { opacity: 0.7; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.15); }
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

      /* Coherence beacon commit styling */
      .cherry-pick-commit-beacon {
        position: relative;
        border: 1px solid var(--background-modifier-error);
        border-radius: 6px;
      }

      .cherry-pick-commit-beacon::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 3px;
        background: var(--background-modifier-error);
        border-radius: 2px 0 0 2px;
      }

      .cherry-pick-commit-beacon:hover {
        background: rgba(var(--color-red-rgb), 0.1) !important;
        border-color: var(--text-error);
      }

      .cherry-pick-commit-beacon-indicator {
        font-size: 0.9em;
        margin-right: 0.25em;
      }

      .cherry-pick-commit-subject-beacon {
        color: var(--text-error);
        font-weight: 600;
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

      /* Summary overlay */
      .cherry-pick-summary-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--background-primary);
        padding: 1.5em;
        z-index: 10;
        display: flex;
        flex-direction: column;
        border-radius: 8px;
      }

      .cherry-pick-summary-header {
        margin: 0 0 1em 0;
        font-size: 1.1em;
      }

      .cherry-pick-summary-loading {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-muted);
      }

      .cherry-pick-summary-error {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-error);
      }

      .cherry-pick-summary-impact {
        background: var(--background-secondary);
        padding: 0.75em 1em;
        border-radius: 6px;
        margin-bottom: 1em;
        font-weight: 500;
      }

      .cherry-pick-summary-content {
        flex: 1;
        line-height: 1.6;
        overflow-y: auto;
      }

      .cherry-pick-summary-content p {
        margin: 0 0 0.75em 0;
      }

      .cherry-pick-summary-technical {
        color: var(--text-muted);
        font-size: 0.95em;
      }

      .cherry-pick-summary-stats {
        color: var(--text-muted);
        font-size: 0.85em;
        margin-top: 1em;
        padding-top: 0.75em;
        border-top: 1px solid var(--background-modifier-border);
      }

      .cherry-pick-summary-close {
        align-self: flex-end;
        margin-top: 1em;
        padding: 0.5em 1em;
        border: none;
        border-radius: 4px;
        background: var(--interactive-accent);
        color: var(--text-on-accent);
        cursor: pointer;
        transition: background 0.15s;
      }

      .cherry-pick-summary-close:hover {
        background: var(--interactive-accent-hover);
      }
    `;
    document.head.appendChild(style);
  }
}
