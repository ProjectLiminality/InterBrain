/**
 * Collaboration Memory Service
 *
 * Manages collaboration-memory.json files stored in Dreamer nodes.
 * Tracks accepted and rejected commits per peer, per DreamNode.
 *
 * This enables the "cherry-pick only" collaboration model where:
 * - Users selectively accept or reject commits from peers
 * - Rejected commits are remembered and filtered from future updates
 * - Acceptance/rejection decisions are stored per-peer (in the Dreamer node)
 *
 * Storage location: `<DreamerNode>/collaboration-memory.json`
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Record of an accepted commit
 */
export interface AcceptedCommit {
  /** Original commit hash (from cherry-pick -x message, for deduplication) */
  originalHash: string;
  /** Hash of the commit as applied in our repo */
  appliedHash: string;
  /** UUIDs of peers who relayed this commit to us */
  relayedBy: string[];
  /** Commit subject for display */
  subject: string;
  /** Timestamp when we accepted */
  acceptedAt: number;
}

/**
 * Record of a rejected commit
 */
export interface RejectedCommit {
  /** Original commit hash (for filtering) */
  originalHash: string;
  /** Commit subject for display in rejection history */
  subject: string;
  /** Timestamp when we rejected */
  rejectedAt: number;
  /** Optional reason for rejection */
  reason?: string;
}

/**
 * Collaboration state for a single DreamNode
 */
export interface DreamNodeCollaborationState {
  accepted: AcceptedCommit[];
  rejected: RejectedCommit[];
}

/**
 * Structure of collaboration-memory.json file
 * Stored in each Dreamer node, tracking decisions about that peer's contributions
 */
export interface CollaborationMemoryFile {
  /** Schema version for future migrations */
  version: 1;
  /** Map of DreamNode UUID -> collaboration state */
  dreamNodes: Record<string, DreamNodeCollaborationState>;
}

/**
 * Empty collaboration memory file
 */
const EMPTY_COLLABORATION_MEMORY: CollaborationMemoryFile = {
  version: 1,
  dreamNodes: {}
};

export class CollaborationMemoryService {
  private vaultPath: string;

  // In-memory cache to avoid repeated disk reads
  private cache: Map<string, CollaborationMemoryFile> = new Map();

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
  }

  /**
   * Get the file path for a Dreamer's collaboration memory
   */
  private getMemoryFilePath(dreamerRepoPath: string): string {
    return path.join(this.vaultPath, dreamerRepoPath, 'collaboration-memory.json');
  }

  /**
   * Load collaboration memory for a Dreamer node
   * Returns empty structure if file doesn't exist
   */
  async loadMemory(dreamerRepoPath: string): Promise<CollaborationMemoryFile> {
    // Check cache first
    const cached = this.cache.get(dreamerRepoPath);
    if (cached) {
      return cached;
    }

    const filePath = this.getMemoryFilePath(dreamerRepoPath);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const memory = JSON.parse(content) as CollaborationMemoryFile;

      // Validate version
      if (memory.version !== 1) {
        console.warn(`[CollaborationMemory] Unknown version ${memory.version}, using as-is`);
      }

      this.cache.set(dreamerRepoPath, memory);
      return memory;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return empty structure
        const empty = { ...EMPTY_COLLABORATION_MEMORY, dreamNodes: {} };
        this.cache.set(dreamerRepoPath, empty);
        return empty;
      }
      console.error(`[CollaborationMemory] Failed to load ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Save collaboration memory for a Dreamer node
   */
  async saveMemory(dreamerRepoPath: string, memory: CollaborationMemoryFile): Promise<void> {
    const filePath = this.getMemoryFilePath(dreamerRepoPath);

    try {
      const content = JSON.stringify(memory, null, 2);
      await fs.writeFile(filePath, content, 'utf-8');

      // Update cache
      this.cache.set(dreamerRepoPath, memory);

      console.log(`[CollaborationMemory] Saved to ${filePath}`);
    } catch (error) {
      console.error(`[CollaborationMemory] Failed to save ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Clear cache for a specific Dreamer or all
   */
  clearCache(dreamerRepoPath?: string): void {
    if (dreamerRepoPath) {
      this.cache.delete(dreamerRepoPath);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get all rejected commit hashes for a specific DreamNode from a specific peer
   * Used for filtering out rejected commits when displaying pending updates
   */
  async getRejectedHashes(
    dreamerRepoPath: string,
    dreamNodeUuid: string
  ): Promise<Set<string>> {
    const memory = await this.loadMemory(dreamerRepoPath);
    const nodeState = memory.dreamNodes[dreamNodeUuid];

    if (!nodeState) {
      return new Set();
    }

    return new Set(nodeState.rejected.map(r => r.originalHash));
  }

  /**
   * Get all accepted commit hashes for a specific DreamNode from a specific peer
   */
  async getAcceptedHashes(
    dreamerRepoPath: string,
    dreamNodeUuid: string
  ): Promise<Set<string>> {
    const memory = await this.loadMemory(dreamerRepoPath);
    const nodeState = memory.dreamNodes[dreamNodeUuid];

    if (!nodeState) {
      return new Set();
    }

    return new Set(nodeState.accepted.map(a => a.originalHash));
  }

  /**
   * Record acceptance of commits
   */
  async recordAcceptance(
    dreamerRepoPath: string,
    dreamNodeUuid: string,
    commits: Array<{
      originalHash: string;
      appliedHash: string;
      subject: string;
      relayedBy: string[];
    }>
  ): Promise<void> {
    const memory = await this.loadMemory(dreamerRepoPath);

    // Ensure node state exists
    if (!memory.dreamNodes[dreamNodeUuid]) {
      memory.dreamNodes[dreamNodeUuid] = { accepted: [], rejected: [] };
    }

    const nodeState = memory.dreamNodes[dreamNodeUuid];
    const now = Date.now();

    for (const commit of commits) {
      // Check if already accepted (by original hash)
      const existing = nodeState.accepted.find(a => a.originalHash === commit.originalHash);
      if (existing) {
        // Update relayedBy if new peer
        for (const peer of commit.relayedBy) {
          if (!existing.relayedBy.includes(peer)) {
            existing.relayedBy.push(peer);
          }
        }
        continue;
      }

      // Add new acceptance
      nodeState.accepted.push({
        originalHash: commit.originalHash,
        appliedHash: commit.appliedHash,
        relayedBy: commit.relayedBy,
        subject: commit.subject,
        acceptedAt: now
      });
    }

    await this.saveMemory(dreamerRepoPath, memory);
  }

  /**
   * Record rejection of commits
   */
  async recordRejection(
    dreamerRepoPath: string,
    dreamNodeUuid: string,
    commits: Array<{
      originalHash: string;
      subject: string;
      reason?: string;
    }>
  ): Promise<void> {
    const memory = await this.loadMemory(dreamerRepoPath);

    // Ensure node state exists
    if (!memory.dreamNodes[dreamNodeUuid]) {
      memory.dreamNodes[dreamNodeUuid] = { accepted: [], rejected: [] };
    }

    const nodeState = memory.dreamNodes[dreamNodeUuid];
    const now = Date.now();

    for (const commit of commits) {
      // Check if already rejected
      const existing = nodeState.rejected.find(r => r.originalHash === commit.originalHash);
      if (existing) {
        continue;
      }

      // Add new rejection
      nodeState.rejected.push({
        originalHash: commit.originalHash,
        subject: commit.subject,
        rejectedAt: now,
        reason: commit.reason
      });
    }

    await this.saveMemory(dreamerRepoPath, memory);
  }

  /**
   * Unreject a previously rejected commit (move back to pending state)
   */
  async unreject(
    dreamerRepoPath: string,
    dreamNodeUuid: string,
    originalHash: string
  ): Promise<boolean> {
    const memory = await this.loadMemory(dreamerRepoPath);
    const nodeState = memory.dreamNodes[dreamNodeUuid];

    if (!nodeState) {
      return false;
    }

    const index = nodeState.rejected.findIndex(r => r.originalHash === originalHash);
    if (index === -1) {
      return false;
    }

    // Remove from rejected list
    nodeState.rejected.splice(index, 1);

    await this.saveMemory(dreamerRepoPath, memory);
    return true;
  }

  /**
   * Get rejection history for display in UI
   */
  async getRejectionHistory(
    dreamerRepoPath: string,
    dreamNodeUuid: string
  ): Promise<RejectedCommit[]> {
    const memory = await this.loadMemory(dreamerRepoPath);
    const nodeState = memory.dreamNodes[dreamNodeUuid];

    if (!nodeState) {
      return [];
    }

    // Return sorted by rejection time (newest first)
    return [...nodeState.rejected].sort((a, b) => b.rejectedAt - a.rejectedAt);
  }

  /**
   * Check if a commit hash is rejected
   */
  async isRejected(
    dreamerRepoPath: string,
    dreamNodeUuid: string,
    originalHash: string
  ): Promise<boolean> {
    const rejected = await this.getRejectedHashes(dreamerRepoPath, dreamNodeUuid);
    return rejected.has(originalHash);
  }

  /**
   * Check if a commit hash is accepted
   */
  async isAccepted(
    dreamerRepoPath: string,
    dreamNodeUuid: string,
    originalHash: string
  ): Promise<boolean> {
    const accepted = await this.getAcceptedHashes(dreamerRepoPath, dreamNodeUuid);
    return accepted.has(originalHash);
  }

  /**
   * Get full collaboration state for a DreamNode
   */
  async getNodeState(
    dreamerRepoPath: string,
    dreamNodeUuid: string
  ): Promise<DreamNodeCollaborationState> {
    const memory = await this.loadMemory(dreamerRepoPath);
    return memory.dreamNodes[dreamNodeUuid] || { accepted: [], rejected: [] };
  }

  /**
   * Parse the original commit hash from a cherry-pick -x commit message
   * Looks for: "(cherry picked from commit <hash>)"
   */
  static parseOriginalHash(commitBody: string): string | null {
    const match = commitBody.match(/\(cherry picked from commit ([a-f0-9]+)\)/i);
    return match ? match[1] : null;
  }

  /**
   * Get the effective original hash for a commit
   * Returns the cherry-picked-from hash if present, otherwise the commit's own hash
   */
  static getEffectiveOriginalHash(hash: string, body: string): string {
    const cherryPickedFrom = CollaborationMemoryService.parseOriginalHash(body);
    return cherryPickedFrom || hash;
  }
}

// Singleton instance
let collaborationMemoryService: CollaborationMemoryService | null = null;

export function initializeCollaborationMemoryService(vaultPath: string): CollaborationMemoryService {
  collaborationMemoryService = new CollaborationMemoryService(vaultPath);
  return collaborationMemoryService;
}

export function getCollaborationMemoryService(): CollaborationMemoryService {
  if (!collaborationMemoryService) {
    throw new Error('CollaborationMemoryService not initialized. Call initializeCollaborationMemoryService first.');
  }
  return collaborationMemoryService;
}
