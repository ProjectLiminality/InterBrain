import { DreamNode } from '../types/dreamnode';
import { MockDreamNodeService, mockDreamNodeService } from './mock-dreamnode-service';
import { GitDreamNodeService } from './git-dreamnode-service';
import { useInterBrainStore } from '../store/interbrain-store';
import { Plugin } from 'obsidian';

/**
 * Service interface that both mock and real implementations will follow
 */
export interface IDreamNodeService {
  create(
    title: string, 
    type: 'dream' | 'dreamer', 
    dreamTalk?: globalThis.File, 
    position?: [number, number, number],
    additionalFiles?: globalThis.File[]
  ): Promise<DreamNode>;
  update(id: string, changes: Partial<DreamNode>): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<DreamNode[]>;
  get(id: string): Promise<DreamNode | null>;
  addFilesToNode(nodeId: string, files: globalThis.File[]): Promise<void>;
  reset(): void;
  getStats(): {
    totalNodes: number;
    dreamNodes: number;
    dreamerNodes: number;
    nodesWithMedia: number;
  };
}

/**
 * Service Manager - handles switching between mock and real implementations
 */
export class ServiceManager {
  private mockService: MockDreamNodeService;
  private realService: GitDreamNodeService | null = null;
  private plugin: Plugin | null = null;

  constructor() {
    this.mockService = mockDreamNodeService;
  }
  
  /**
   * Initialize with plugin instance (required for real service)
   */
  initialize(plugin: Plugin): void {
    this.plugin = plugin;
    this.realService = new GitDreamNodeService(plugin);
    
    // Sync with store's data mode
    const store = useInterBrainStore.getState();
    if (store.dataMode === 'real' && this.realService) {
      // Perform initial vault scan when starting in real mode
      this.realService.scanVault().catch(error => {
        console.error('Initial vault scan failed:', error);
      });
    }
  }

  /**
   * Get the currently active service
   */
  getActive(): IDreamNodeService {
    const store = useInterBrainStore.getState();
    
    if (store.dataMode === 'real') {
      if (!this.realService) {
        throw new Error('Real service not initialized. Call initialize() with plugin first.');
      }
      return this.realService;
    }
    
    return this.mockService;
  }

  /**
   * Switch between mock and real modes
   */
  async setMode(mode: 'mock' | 'real'): Promise<void> {
    const store = useInterBrainStore.getState();
    const previousMode = store.dataMode;
    
    // Update store
    store.setDataMode(mode);
    
    console.log(`ServiceManager: Switched from ${previousMode} to ${mode} mode`);
    
    if (mode === 'real' && this.realService) {
      // Scan vault when switching to real mode
      console.log('ServiceManager: Scanning vault for DreamNodes...');
      const stats = await this.realService.scanVault();
      console.log('ServiceManager: Vault scan complete:', stats);
    } else if (mode === 'mock') {
      console.log('MockDreamNodeService stats:', this.mockService.getStats());
    }
  }

  /**
   * Get current mode
   */
  getMode(): 'mock' | 'real' {
    const store = useInterBrainStore.getState();
    return store.dataMode;
  }

  /**
   * Reset data (mock mode resets in-memory, real mode clears store)
   */
  resetData(): void {
    const store = useInterBrainStore.getState();
    
    if (store.dataMode === 'mock') {
      this.mockService.reset();
      console.log('ServiceManager: Reset mock data');
    } else if (this.realService) {
      this.realService.reset();
      console.log('ServiceManager: Reset real data store (vault unchanged)');
    }
  }

  /**
   * Get service statistics
   */
  getStats() {
    const store = useInterBrainStore.getState();
    
    if (store.dataMode === 'mock') {
      return {
        mode: store.dataMode,
        ...this.mockService.getStats()
      };
    } else if (this.realService) {
      return {
        mode: store.dataMode,
        ...this.realService.getStats()
      };
    } else {
      return {
        mode: store.dataMode,
        message: 'Real service not initialized'
      };
    }
  }
  
  /**
   * Perform vault scan (real mode only)
   */
  async scanVault(): Promise<{ added: number; updated: number; removed: number } | null> {
    if (this.realService) {
      return await this.realService.scanVault();
    }
    console.warn('ServiceManager: Vault scan only available in real mode');
    return null;
  }
}

// Export singleton instance
export const serviceManager = new ServiceManager();