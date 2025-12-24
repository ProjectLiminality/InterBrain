/**
 * DemoVaultService - Manages demo DreamNodes for tutorial
 *
 * Responsibilities:
 * - Symlink bundled demo nodes into user's vault
 * - Reset demo nodes to pristine state
 * - Clean up symlinks when tutorial ends
 *
 * Architecture:
 * - Demo nodes are bundled with the plugin (git repos)
 * - Symlinked into vault during tutorial (appear as real nodes)
 * - User-created nodes during tutorial remain (not symlinked)
 * - Symlinks removed when tutorial completes (demo nodes vanish)
 *
 * STUB: This is a minimal interface for now. Full implementation
 * will handle actual symlink operations on the filesystem.
 */

import { DemoVaultConfig, DemoNodeConfig } from '../types';

/**
 * Demo vault configuration
 * These nodes will be symlinked during tutorial
 */
export const DEMO_VAULT_CONFIG: DemoVaultConfig = {
  bundlePath: 'demo-vault', // Relative to plugin directory
  nodes: [
    {
      id: 'InterBrain',
      name: 'InterBrain',
      type: 'dream',
      connections: ['Alice', 'Bob'],
      hasDreamSong: true, // Will have feature documentation
    },
    {
      id: 'Alice',
      name: 'Alice',
      type: 'dreamer',
      connections: ['InterBrain', 'Circle'],
      hasDreamSong: false,
    },
    {
      id: 'Bob',
      name: 'Bob',
      type: 'dreamer',
      connections: ['InterBrain', 'Square'],
      hasDreamSong: false,
    },
    {
      id: 'Circle',
      name: 'Circle',
      type: 'dream',
      connections: ['Alice', 'Cylinder'],
      hasDreamSong: true,
    },
    {
      id: 'Square',
      name: 'Square',
      type: 'dream',
      connections: ['Bob', 'Cylinder'],
      hasDreamSong: true,
    },
    {
      id: 'Cylinder',
      name: 'Cylinder',
      type: 'dream',
      connections: ['Circle', 'Square'],
      hasDreamSong: true, // Pre-woven with Circle + Square references
    },
  ],
};

export class DemoVaultService {
  private isSetup = false;
  private symlinkedNodeIds: string[] = [];

  /**
   * Check if demo vault is currently set up
   */
  isDemoVaultActive(): boolean {
    return this.isSetup;
  }

  /**
   * Get list of demo node IDs
   */
  getDemoNodeIds(): string[] {
    return DEMO_VAULT_CONFIG.nodes.map(n => n.id);
  }

  /**
   * Get demo node configuration by ID
   */
  getDemoNode(nodeId: string): DemoNodeConfig | undefined {
    return DEMO_VAULT_CONFIG.nodes.find(n => n.id === nodeId);
  }

  /**
   * Set up demo vault - symlink demo nodes into user's vault
   *
   * STUB: Currently just marks as setup. Full implementation will:
   * 1. Check if demo nodes already exist (skip if so)
   * 2. Create symlinks from plugin bundle to vault
   * 3. Trigger node service refresh
   */
  async setup(): Promise<void> {
    if (this.isSetup) {
      console.log('[DemoVaultService] Already set up, skipping');
      return;
    }

    console.log('[DemoVaultService] Setting up demo vault...');
    console.log('[DemoVaultService] STUB: Would symlink nodes:', this.getDemoNodeIds());

    // TODO: Actual symlink implementation
    // For now, we assume nodes exist in the vault already for testing

    this.symlinkedNodeIds = this.getDemoNodeIds();
    this.isSetup = true;

    console.log('[DemoVaultService] Demo vault ready');
  }

  /**
   * Reset demo nodes to pristine state
   *
   * STUB: Currently a no-op. Full implementation will:
   * 1. Git reset each demo node repo to initial commit
   * 2. Clear any user modifications
   */
  async reset(): Promise<void> {
    console.log('[DemoVaultService] Resetting demo nodes to pristine state...');
    console.log('[DemoVaultService] STUB: Would git reset:', this.symlinkedNodeIds);

    // TODO: Actual git reset implementation
  }

  /**
   * Tear down demo vault - remove symlinks
   *
   * STUB: Currently just marks as not setup. Full implementation will:
   * 1. Remove symlinks (not the actual demo repos)
   * 2. Trigger node service refresh
   */
  async teardown(): Promise<void> {
    if (!this.isSetup) {
      console.log('[DemoVaultService] Not set up, skipping teardown');
      return;
    }

    console.log('[DemoVaultService] Tearing down demo vault...');
    console.log('[DemoVaultService] STUB: Would remove symlinks:', this.symlinkedNodeIds);

    // TODO: Actual symlink removal

    this.symlinkedNodeIds = [];
    this.isSetup = false;

    console.log('[DemoVaultService] Demo vault removed');
  }

  /**
   * Check if a node ID is a demo node
   */
  isDemoNode(nodeId: string): boolean {
    return this.getDemoNodeIds().includes(nodeId);
  }
}

// Singleton instance
export const demoVaultService = new DemoVaultService();
