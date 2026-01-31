/**
 * VaultStateService - Tracks vault state for incremental scanning
 *
 * Maintains a persistent record of:
 * - When the vault was last scanned
 * - How many nodes were found
 * - A quick-check mechanism to detect changes
 *
 * This enables skipping full vault scans when data is fresh.
 */

const fs = require('fs');
const path = require('path');
const fsPromises = fs.promises;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Persisted vault state
 */
export interface VaultState {
  /** Hash of vault path (for validation) */
  vaultId: string;
  /** Timestamp of last successful vault scan */
  lastScanTimestamp: number;
  /** Number of nodes found in last scan */
  nodeCount: number;
  /** Schema version for migrations */
  schemaVersion: number;
  /** Quick-check: modification time of .obsidian folder */
  obsidianMtime: number;
}

/**
 * Change detection result
 */
export interface VaultChangeResult {
  /** Whether the vault has changed since last scan */
  hasChanges: boolean;
  /** Reason for the change (for debugging) */
  reason: 'no_state' | 'vault_mismatch' | 'schema_upgrade' | 'mtime_changed' | 'node_count_mismatch' | 'no_changes';
  /** Cached state if available */
  cachedState?: VaultState;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CURRENT_SCHEMA_VERSION = 1;
const STATE_FILENAME = 'vault-state.json';

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

class VaultStateServiceImpl {
  private vaultPath: string = '';
  private currentVaultId: string = '';
  private cachedState: VaultState | null = null;

  /**
   * Initialize with vault path
   */
  initialize(vaultPath: string): void {
    this.vaultPath = vaultPath;
    this.currentVaultId = this.hashVaultPath(vaultPath);
    this.cachedState = null;
    console.log(`[VaultState] Initialized for vault: ${vaultPath} (id: ${this.currentVaultId})`);
  }

  /**
   * Get path to state file
   */
  private getStatePath(): string {
    return path.join(this.vaultPath, '.obsidian', 'plugins', 'interbrain', STATE_FILENAME);
  }

  /**
   * Load persisted vault state
   */
  async loadState(): Promise<VaultState | null> {
    try {
      const statePath = this.getStatePath();
      const content = await fsPromises.readFile(statePath, 'utf-8');
      const state = JSON.parse(content) as VaultState;
      this.cachedState = state;
      console.log(`[VaultState] Loaded state: ${state.nodeCount} nodes, last scan ${new Date(state.lastScanTimestamp).toISOString()}`);
      return state;
    } catch (error) {
      // File doesn't exist or is corrupted - this is normal on first run
      console.log('[VaultState] No existing state found (fresh vault or first run)');
      return null;
    }
  }

  /**
   * Save vault state after successful scan
   */
  async saveState(nodeCount: number): Promise<void> {
    try {
      const obsidianMtime = await this.getObsidianMtime();

      const state: VaultState = {
        vaultId: this.currentVaultId,
        lastScanTimestamp: Date.now(),
        nodeCount,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        obsidianMtime,
      };

      const statePath = this.getStatePath();

      // Ensure directory exists
      const stateDir = path.dirname(statePath);
      await fsPromises.mkdir(stateDir, { recursive: true });

      await fsPromises.writeFile(statePath, JSON.stringify(state, null, 2));
      this.cachedState = state;

      console.log(`[VaultState] Saved state: ${nodeCount} nodes at ${new Date().toISOString()}`);
    } catch (error) {
      console.error('[VaultState] Failed to save state:', error);
      // Non-fatal - vault will just rescan next time
    }
  }

  /**
   * Check if vault has changed since last scan
   */
  async hasVaultChanged(expectedNodeCount?: number): Promise<VaultChangeResult> {
    // Load state if not cached
    const state = this.cachedState || await this.loadState();

    if (!state) {
      return { hasChanges: true, reason: 'no_state' };
    }

    // Check vault ID matches
    if (state.vaultId !== this.currentVaultId) {
      console.log(`[VaultState] Vault ID mismatch: ${state.vaultId} !== ${this.currentVaultId}`);
      return { hasChanges: true, reason: 'vault_mismatch', cachedState: state };
    }

    // Check schema version
    if (state.schemaVersion !== CURRENT_SCHEMA_VERSION) {
      console.log(`[VaultState] Schema upgrade needed: ${state.schemaVersion} → ${CURRENT_SCHEMA_VERSION}`);
      return { hasChanges: true, reason: 'schema_upgrade', cachedState: state };
    }

    // Quick check: .obsidian folder mtime
    const currentMtime = await this.getObsidianMtime();
    if (currentMtime !== state.obsidianMtime) {
      console.log(`[VaultState] .obsidian mtime changed: ${state.obsidianMtime} → ${currentMtime}`);
      return { hasChanges: true, reason: 'mtime_changed', cachedState: state };
    }

    // Node count sanity check if provided
    if (expectedNodeCount !== undefined && expectedNodeCount !== state.nodeCount) {
      console.log(`[VaultState] Node count mismatch: expected ${expectedNodeCount}, cached ${state.nodeCount}`);
      return { hasChanges: true, reason: 'node_count_mismatch', cachedState: state };
    }

    console.log(`[VaultState] No changes detected (${state.nodeCount} nodes, last scan ${this.formatAge(state.lastScanTimestamp)} ago)`);
    return { hasChanges: false, reason: 'no_changes', cachedState: state };
  }

  /**
   * Get cached node count (for quick startup)
   */
  getCachedNodeCount(): number | null {
    return this.cachedState?.nodeCount ?? null;
  }

  /**
   * Get last scan timestamp
   */
  getLastScanTimestamp(): number | null {
    return this.cachedState?.lastScanTimestamp ?? null;
  }

  /**
   * Clear cached state (force rescan on next startup)
   */
  async clearState(): Promise<void> {
    try {
      const statePath = this.getStatePath();
      await fsPromises.unlink(statePath);
      this.cachedState = null;
      console.log('[VaultState] State cleared');
    } catch {
      // File might not exist, that's fine
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Hash vault path for consistent identification
   */
  private hashVaultPath(vaultPath: string): string {
    let hash = 5381;
    for (let i = 0; i < vaultPath.length; i++) {
      hash = ((hash << 5) + hash) + vaultPath.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Get .obsidian folder modification time
   */
  private async getObsidianMtime(): Promise<number> {
    try {
      const obsidianPath = path.join(this.vaultPath, '.obsidian');
      const stats = await fsPromises.stat(obsidianPath);
      return Math.floor(stats.mtimeMs);
    } catch {
      return 0;
    }
  }

  /**
   * Format age as human-readable string
   */
  private formatAge(timestamp: number): string {
    const ageMs = Date.now() - timestamp;
    const seconds = Math.floor(ageMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const vaultStateService = new VaultStateServiceImpl();
