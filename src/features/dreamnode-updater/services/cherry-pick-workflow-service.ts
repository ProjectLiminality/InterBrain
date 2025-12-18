/**
 * Cherry-Pick Workflow Service
 *
 * Orchestrates the cherry-pick collaboration workflow:
 * - Fetching and filtering pending commits from peers
 * - Preview mode (stash, cherry-pick, explore, decide)
 * - Accept/reject actions with memory persistence
 *
 * This service implements the "social resonance filter" pattern where
 * users selectively accept commits that resonate and reject those that don't.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execAsync = promisify(exec);

import { App } from 'obsidian';
import { CommitInfo } from '../../social-resonance-filter/services/git-sync-service';
import {
  CollaborationMemoryService,
  getCollaborationMemoryService
} from './collaboration-memory-service';

/**
 * Extended commit info with deduplication metadata
 */
export interface PendingCommit extends CommitInfo {
  /** Original hash (from cherry-pick -x or self if original) */
  originalHash: string;
  /** Peer UUIDs who are offering this commit */
  offeredBy: string[];
  /** Peer display names */
  offeredByNames: string[];
  /** The remote/ref to cherry-pick from */
  cherryPickRef: string;
}

/**
 * Commits grouped by peer for UI display
 */
export interface PeerCommitGroup {
  peerUuid: string;
  peerName: string;
  peerRepoPath: string;
  commits: PendingCommit[];
}

/**
 * Preview state tracking
 */
export interface PreviewState {
  /** Whether preview mode is active */
  isActive: boolean;
  /** DreamNode being previewed */
  dreamNodePath: string;
  dreamNodeUuid: string;
  /** Commits currently applied in preview */
  previewedCommits: PendingCommit[];
  /** Number of commits applied (for reset) */
  commitCount: number;
  /** Whether we stashed user's work */
  didStash: boolean;
  /** Stash ref if we stashed */
  stashRef?: string;
}

/**
 * Result of accepting/rejecting preview
 */
export interface WorkflowResult {
  success: boolean;
  message: string;
  acceptedCount?: number;
  rejectedCount?: number;
  error?: string;
}

export class CherryPickWorkflowService {
  private app: App;
  private vaultPath: string;
  private previewState: PreviewState | null = null;

  constructor(app: App) {
    this.app = app;
    const adapter = app.vault.adapter as any;
    this.vaultPath = adapter.basePath || adapter.path || '';
  }

  /**
   * Get full filesystem path for a repo path
   */
  private getFullPath(repoPath: string): string {
    return path.join(this.vaultPath, repoPath);
  }

  /**
   * Fetch pending commits from all peers for a DreamNode
   * Filters out rejected commits and deduplicates by original hash
   */
  async getPendingCommits(
    dreamNodePath: string,
    dreamNodeUuid: string,
    peers: Array<{ uuid: string; name: string; repoPath: string }>
  ): Promise<PeerCommitGroup[]> {
    const fullPath = this.getFullPath(dreamNodePath);
    const memoryService = getCollaborationMemoryService();

    // Collect all rejected AND accepted hashes across all peers for this DreamNode
    const allFilteredHashes = new Set<string>();
    for (const peer of peers) {
      const rejected = await memoryService.getRejectedHashes(peer.repoPath, dreamNodeUuid);
      rejected.forEach(h => allFilteredHashes.add(h));

      const accepted = await memoryService.getAcceptedHashes(peer.repoPath, dreamNodeUuid);
      accepted.forEach(h => allFilteredHashes.add(h));
    }

    // Map to deduplicate commits by original hash
    const commitsByOriginalHash = new Map<string, PendingCommit>();

    // Fetch from each peer
    for (const peer of peers) {
      try {
        // Get current branch
        const { stdout: branchOutput } = await execAsync('git branch --show-current', { cwd: fullPath });
        const currentBranch = branchOutput.trim() || 'main';

        // Check for commits from this peer's remote
        const peerRef = `${peer.name}/${currentBranch}`;

        try {
          // Get commits that are in peer's branch but not in ours
          const { stdout } = await execAsync(
            `git log HEAD..${peerRef} --format="%H%x00%an%x00%ae%x00%at%x00%s%x00%b%x1E"`,
            { cwd: fullPath }
          );

          if (!stdout.trim()) continue;

          // Parse commits
          const commitStrings = stdout.split('\x1E').filter((s: string) => s.trim());

          for (const commitStr of commitStrings) {
            const parts = commitStr.split('\x00');
            if (parts.length < 6) continue;

            const [hash, author, email, timestamp, subject, body] = parts;

            // Get original hash (for deduplication)
            const originalHash = CollaborationMemoryService.getEffectiveOriginalHash(
              hash.trim(),
              body || ''
            );

            // Skip if already accepted or rejected
            if (allFilteredHashes.has(originalHash)) {
              continue;
            }

            // Check if we already have this commit (deduplication)
            const existing = commitsByOriginalHash.get(originalHash);
            if (existing) {
              // Add this peer as another source
              if (!existing.offeredBy.includes(peer.uuid)) {
                existing.offeredBy.push(peer.uuid);
                existing.offeredByNames.push(peer.name);
              }
              continue;
            }

            // New commit
            const commit: PendingCommit = {
              hash: hash.trim(),
              author,
              email,
              timestamp: parseInt(timestamp, 10),
              subject,
              body: body || '',
              source: peerRef,
              originalHash,
              offeredBy: [peer.uuid],
              offeredByNames: [peer.name],
              cherryPickRef: hash.trim()
            };

            commitsByOriginalHash.set(originalHash, commit);
          }
        } catch (gitError: any) {
          // Peer ref might not exist, skip
          console.log(`[CherryPickWorkflow] No commits from ${peer.name}: ${gitError.message}`);
        }
      } catch (error: any) {
        console.error(`[CherryPickWorkflow] Error fetching from ${peer.name}:`, error);
      }
    }

    // Group commits by primary peer (first in offeredBy list)
    const groupsByPeer = new Map<string, PeerCommitGroup>();

    for (const commit of commitsByOriginalHash.values()) {
      const primaryPeerUuid = commit.offeredBy[0];
      const peer = peers.find(p => p.uuid === primaryPeerUuid);
      if (!peer) continue;

      let group = groupsByPeer.get(primaryPeerUuid);
      if (!group) {
        group = {
          peerUuid: peer.uuid,
          peerName: peer.name,
          peerRepoPath: peer.repoPath,
          commits: []
        };
        groupsByPeer.set(primaryPeerUuid, group);
      }

      group.commits.push(commit);
    }

    // Sort commits within each group by timestamp (oldest first for correct cherry-pick order)
    for (const group of groupsByPeer.values()) {
      group.commits.sort((a, b) => a.timestamp - b.timestamp);
    }

    return Array.from(groupsByPeer.values());
  }

  /**
   * Check if preview mode is active
   */
  isPreviewActive(): boolean {
    return this.previewState?.isActive ?? false;
  }

  /**
   * Get current preview state
   */
  getPreviewState(): PreviewState | null {
    return this.previewState;
  }

  /**
   * Start preview mode - stash work and apply commits
   */
  async startPreview(
    dreamNodePath: string,
    dreamNodeUuid: string,
    commits: PendingCommit[]
  ): Promise<WorkflowResult> {
    if (this.previewState?.isActive) {
      return {
        success: false,
        message: 'Preview already active. Accept, reject, or cancel first.'
      };
    }

    const fullPath = this.getFullPath(dreamNodePath);

    try {
      // Step 1: Check for uncommitted changes and stash if needed
      let didStash = false;
      let stashRef: string | undefined;

      const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: fullPath });
      if (statusOutput.trim()) {
        // Has uncommitted changes, stash them
        console.log('[CherryPickWorkflow] Stashing uncommitted changes...');
        await execAsync('git stash push -m "InterBrain preview stash"', { cwd: fullPath });
        didStash = true;

        // Get stash ref for later
        const { stdout: stashList } = await execAsync('git stash list -1', { cwd: fullPath });
        stashRef = stashList.trim().split(':')[0]; // e.g., "stash@{0}"
      }

      // Step 2: Cherry-pick commits in order (oldest first)
      const sortedCommits = [...commits].sort((a, b) => a.timestamp - b.timestamp);
      let appliedCount = 0;

      for (const commit of sortedCommits) {
        try {
          // Use -x to preserve original hash in commit message
          await execAsync(`git cherry-pick -x ${commit.cherryPickRef}`, { cwd: fullPath });
          appliedCount++;
          console.log(`[CherryPickWorkflow] Applied commit: ${commit.subject}`);
        } catch (cherryPickError: any) {
          // Check if it's an empty cherry-pick (changes already exist)
          const errorMessage = cherryPickError.message || cherryPickError.stderr || '';
          if (errorMessage.includes('cherry-pick is now empty') ||
              errorMessage.includes('nothing to commit')) {
            // Skip this commit - changes already exist
            console.log(`[CherryPickWorkflow] Skipping empty cherry-pick in preview: ${commit.subject}`);
            try {
              await execAsync('git cherry-pick --skip', { cwd: fullPath });
            } catch {
              try {
                await execAsync('git cherry-pick --abort', { cwd: fullPath });
              } catch {
                // Ignore
              }
            }
            continue;
          }

          // Cherry-pick failed (likely conflict)
          console.error(`[CherryPickWorkflow] Cherry-pick failed for ${commit.hash}:`, cherryPickError);

          // Abort the cherry-pick
          try {
            await execAsync('git cherry-pick --abort', { cwd: fullPath });
          } catch {
            // Ignore abort errors
          }

          // Reset any commits we already applied
          if (appliedCount > 0) {
            await execAsync(`git reset --hard HEAD~${appliedCount}`, { cwd: fullPath });
          }

          // Restore stash if we stashed
          if (didStash) {
            await execAsync('git stash pop', { cwd: fullPath });
          }

          return {
            success: false,
            message: `Cherry-pick failed for "${commit.subject}". This commit may conflict with your changes.`,
            error: cherryPickError.message
          };
        }
      }

      // Step 3: Store preview state
      this.previewState = {
        isActive: true,
        dreamNodePath,
        dreamNodeUuid,
        previewedCommits: sortedCommits,
        commitCount: appliedCount,
        didStash,
        stashRef
      };

      return {
        success: true,
        message: `Previewing ${appliedCount} commit(s). Explore the changes, then accept or reject.`
      };

    } catch (error: any) {
      console.error('[CherryPickWorkflow] Preview start failed:', error);
      return {
        success: false,
        message: 'Failed to start preview',
        error: error.message
      };
    }
  }

  /**
   * Accept the current preview - keep commits and record in memory
   */
  async acceptPreview(
    dreamerRepoPath: string
  ): Promise<WorkflowResult> {
    if (!this.previewState?.isActive) {
      return {
        success: false,
        message: 'No preview active'
      };
    }

    const { dreamNodePath, dreamNodeUuid, previewedCommits, didStash } = this.previewState;
    const fullPath = this.getFullPath(dreamNodePath);

    try {
      // Commits are already applied, just need to:
      // 1. Record acceptance in collaboration memory
      const memoryService = getCollaborationMemoryService();

      // Get the new commit hashes (they changed after cherry-pick)
      const { stdout: logOutput } = await execAsync(
        `git log -${previewedCommits.length} --format="%H"`,
        { cwd: fullPath }
      );
      const newHashes = logOutput.trim().split('\n').reverse(); // Oldest first

      const acceptanceRecords = previewedCommits.map((commit, index) => ({
        originalHash: commit.originalHash,
        appliedHash: newHashes[index] || commit.hash,
        subject: commit.subject,
        relayedBy: commit.offeredBy
      }));

      await memoryService.recordAcceptance(dreamerRepoPath, dreamNodeUuid, acceptanceRecords);

      // 2. Restore stash if we stashed
      if (didStash) {
        try {
          await execAsync('git stash pop', { cwd: fullPath });
        } catch (stashError: any) {
          console.warn('[CherryPickWorkflow] Stash pop had conflicts:', stashError.message);
          // User will need to resolve manually
        }
      }

      const acceptedCount = previewedCommits.length;

      // Clear preview state
      this.previewState = null;

      return {
        success: true,
        message: `Accepted ${acceptedCount} commit(s)`,
        acceptedCount
      };

    } catch (error: any) {
      console.error('[CherryPickWorkflow] Accept failed:', error);
      return {
        success: false,
        message: 'Failed to accept preview',
        error: error.message
      };
    }
  }

  /**
   * Reject the current preview - reset commits and record rejections
   */
  async rejectPreview(
    dreamerRepoPath: string
  ): Promise<WorkflowResult> {
    if (!this.previewState?.isActive) {
      return {
        success: false,
        message: 'No preview active'
      };
    }

    const { dreamNodePath, dreamNodeUuid, previewedCommits, commitCount, didStash } = this.previewState;
    const fullPath = this.getFullPath(dreamNodePath);

    try {
      // 1. Reset the commits
      if (commitCount > 0) {
        await execAsync(`git reset --hard HEAD~${commitCount}`, { cwd: fullPath });
      }

      // 2. Record rejections in collaboration memory
      const memoryService = getCollaborationMemoryService();

      const rejectionRecords = previewedCommits.map(commit => ({
        originalHash: commit.originalHash,
        subject: commit.subject
      }));

      await memoryService.recordRejection(dreamerRepoPath, dreamNodeUuid, rejectionRecords);

      // 3. Restore stash if we stashed
      if (didStash) {
        try {
          await execAsync('git stash pop', { cwd: fullPath });
        } catch (stashError: any) {
          console.warn('[CherryPickWorkflow] Stash pop had issues:', stashError.message);
        }
      }

      const rejectedCount = previewedCommits.length;

      // Clear preview state
      this.previewState = null;

      return {
        success: true,
        message: `Rejected ${rejectedCount} commit(s). They won't appear again.`,
        rejectedCount
      };

    } catch (error: any) {
      console.error('[CherryPickWorkflow] Reject failed:', error);
      return {
        success: false,
        message: 'Failed to reject preview',
        error: error.message
      };
    }
  }

  /**
   * Cancel the current preview - reset commits but don't record anything
   */
  async cancelPreview(): Promise<WorkflowResult> {
    if (!this.previewState?.isActive) {
      return {
        success: false,
        message: 'No preview active'
      };
    }

    const { dreamNodePath, commitCount, didStash } = this.previewState;
    const fullPath = this.getFullPath(dreamNodePath);

    try {
      // 1. Reset the commits
      if (commitCount > 0) {
        await execAsync(`git reset --hard HEAD~${commitCount}`, { cwd: fullPath });
      }

      // 2. Restore stash if we stashed
      if (didStash) {
        try {
          await execAsync('git stash pop', { cwd: fullPath });
        } catch (stashError: any) {
          console.warn('[CherryPickWorkflow] Stash pop had issues:', stashError.message);
        }
      }

      // Clear preview state
      this.previewState = null;

      return {
        success: true,
        message: 'Preview cancelled. Commits remain pending for later.'
      };

    } catch (error: any) {
      console.error('[CherryPickWorkflow] Cancel failed:', error);
      return {
        success: false,
        message: 'Failed to cancel preview',
        error: error.message
      };
    }
  }

  /**
   * Accept specific commits immediately (without preview)
   */
  async acceptCommits(
    dreamNodePath: string,
    dreamNodeUuid: string,
    dreamerRepoPath: string,
    commits: PendingCommit[]
  ): Promise<WorkflowResult> {
    const fullPath = this.getFullPath(dreamNodePath);
    const memoryService = getCollaborationMemoryService();

    try {
      // Sort by timestamp for correct order
      const sortedCommits = [...commits].sort((a, b) => a.timestamp - b.timestamp);
      const appliedHashes: string[] = [];

      for (const commit of sortedCommits) {
        try {
          await execAsync(`git cherry-pick -x ${commit.cherryPickRef}`, { cwd: fullPath });

          // Get the new hash
          const { stdout } = await execAsync('git rev-parse HEAD', { cwd: fullPath });
          appliedHashes.push(stdout.trim());

          console.log(`[CherryPickWorkflow] Accepted: ${commit.subject}`);
        } catch (cherryPickError: any) {
          // Check if it's an empty cherry-pick (changes already exist)
          const errorMessage = cherryPickError.message || cherryPickError.stderr || '';
          if (errorMessage.includes('cherry-pick is now empty') ||
              errorMessage.includes('nothing to commit')) {
            // Skip this commit - changes already exist
            console.log(`[CherryPickWorkflow] Skipping empty cherry-pick: ${commit.subject}`);
            try {
              await execAsync('git cherry-pick --skip', { cwd: fullPath });
            } catch {
              // Try abort if skip fails
              try {
                await execAsync('git cherry-pick --abort', { cwd: fullPath });
              } catch {
                // Ignore
              }
            }
            // Record the original hash as "applied" even though we skipped
            appliedHashes.push(commit.cherryPickRef);
            continue;
          }

          // Abort and report for other errors
          try {
            await execAsync('git cherry-pick --abort', { cwd: fullPath });
          } catch {
            // Ignore
          }

          return {
            success: false,
            message: `Failed to accept "${commit.subject}": ${cherryPickError.message}`
          };
        }
      }

      // Record acceptances
      const acceptanceRecords = sortedCommits.map((commit, index) => ({
        originalHash: commit.originalHash,
        appliedHash: appliedHashes[index],
        subject: commit.subject,
        relayedBy: commit.offeredBy
      }));

      await memoryService.recordAcceptance(dreamerRepoPath, dreamNodeUuid, acceptanceRecords);

      return {
        success: true,
        message: `Accepted ${sortedCommits.length} commit(s)`,
        acceptedCount: sortedCommits.length
      };

    } catch (error: any) {
      console.error('[CherryPickWorkflow] Accept commits failed:', error);
      return {
        success: false,
        message: 'Failed to accept commits',
        error: error.message
      };
    }
  }

  /**
   * Reject specific commits immediately (without preview)
   */
  async rejectCommits(
    dreamNodeUuid: string,
    dreamerRepoPath: string,
    commits: PendingCommit[]
  ): Promise<WorkflowResult> {
    const memoryService = getCollaborationMemoryService();

    try {
      const rejectionRecords = commits.map(commit => ({
        originalHash: commit.originalHash,
        subject: commit.subject
      }));

      await memoryService.recordRejection(dreamerRepoPath, dreamNodeUuid, rejectionRecords);

      return {
        success: true,
        message: `Rejected ${commits.length} commit(s). They won't appear again.`,
        rejectedCount: commits.length
      };

    } catch (error: any) {
      console.error('[CherryPickWorkflow] Reject commits failed:', error);
      return {
        success: false,
        message: 'Failed to reject commits',
        error: error.message
      };
    }
  }

  /**
   * Force cleanup preview state (emergency recovery)
   */
  forceCleanupPreview(): void {
    console.warn('[CherryPickWorkflow] Force cleanup of preview state');
    this.previewState = null;
  }
}

// Singleton instance
let cherryPickWorkflowService: CherryPickWorkflowService | null = null;

export function initializeCherryPickWorkflowService(app: App): CherryPickWorkflowService {
  cherryPickWorkflowService = new CherryPickWorkflowService(app);
  return cherryPickWorkflowService;
}

export function getCherryPickWorkflowService(): CherryPickWorkflowService {
  if (!cherryPickWorkflowService) {
    throw new Error('CherryPickWorkflowService not initialized');
  }
  return cherryPickWorkflowService;
}
