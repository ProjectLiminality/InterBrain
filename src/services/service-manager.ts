import { DreamNode } from '../types/dreamnode';
import { MockDreamNodeService, mockDreamNodeService } from './mock-dreamnode-service';
import { GitDreamNodeService } from './git-dreamnode-service';
import { VaultService } from './vault-service';
import { CanvasParserService } from './canvas-parser-service';
import { LeafManagerService } from './leaf-manager-service';
import { useInterBrainStore } from '../store/interbrain-store';
import { Plugin } from 'obsidian';
import { IndexingService, indexingService } from '../features/semantic-search/services/indexing-service';
import { UrlMetadata } from '../utils/url-utils';
import { RadicleService, RadicleServiceImpl } from './radicle-service';

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
  refreshGitStatus?(): Promise<{ updated: number; errors: number }>;

  // Relationship management
  updateRelationships(nodeId: string, relationshipIds: string[]): Promise<void>;
  getRelationships(nodeId: string): Promise<string[]>;
  addRelationship(nodeId: string, relatedNodeId: string): Promise<void>;
  removeRelationship(nodeId: string, relatedNodeId: string): Promise<void>;

  // URL-based operations
  createFromUrl(
    title: string,
    type: 'dream' | 'dreamer',
    urlMetadata: UrlMetadata,
    position?: [number, number, number]
  ): Promise<DreamNode>;
  createFromWebsiteUrl?(
    title: string,
    type: 'dream' | 'dreamer',
    urlMetadata: UrlMetadata,
    position?: [number, number, number],
    apiKey?: string
  ): Promise<DreamNode>;
  addUrlToNode(nodeId: string, urlMetadata: UrlMetadata): Promise<void>;
}

/**
 * Service Manager - handles switching between mock and real implementations
 */
export class ServiceManager {
  private mockService: MockDreamNodeService;
  private realService: GitDreamNodeService | null = null;
  private indexingService: IndexingService;
  private radicleService: RadicleService;
  private plugin: Plugin | null = null;
  private vaultService: VaultService | null = null;
  private canvasParserService: CanvasParserService | null = null;
  private leafManagerService: LeafManagerService | null = null;
  private submoduleManagerService: any = null; // SubmoduleManagerService

  constructor() {
    this.mockService = mockDreamNodeService;
    this.indexingService = indexingService;
    this.radicleService = new RadicleServiceImpl();

    // Wrap mock service methods to sync with store
    this.wrapMockServiceMethods();
  }
  
  /**
   * Wrap mock service methods to automatically sync with store
   */
  private wrapMockServiceMethods(): void {
    const originalCreate = this.mockService.create.bind(this.mockService);
    const originalUpdate = this.mockService.update.bind(this.mockService);
    const originalDelete = this.mockService.delete.bind(this.mockService);
    const originalAddFiles = this.mockService.addFilesToNode.bind(this.mockService);
    const originalUpdateRelationships = this.mockService.updateRelationships.bind(this.mockService);
    const originalAddRelationship = this.mockService.addRelationship.bind(this.mockService);
    const originalRemoveRelationship = this.mockService.removeRelationship.bind(this.mockService);
    const originalCreateFromUrl = this.mockService.createFromUrl.bind(this.mockService);
    const originalAddUrlToNode = this.mockService.addUrlToNode.bind(this.mockService);

    // Wrap create method
    this.mockService.create = async (...args) => {
      const node = await originalCreate(...args);
      this.syncMockToStore();
      return node;
    };

    // Wrap update method
    this.mockService.update = async (...args) => {
      await originalUpdate(...args);
      this.syncMockToStore();
    };

    // Wrap delete method
    this.mockService.delete = async (...args) => {
      await originalDelete(...args);
      this.syncMockToStore();
    };

    // Wrap addFilesToNode method
    this.mockService.addFilesToNode = async (...args) => {
      await originalAddFiles(...args);
      this.syncMockToStore();
    };

    // Wrap relationship methods
    this.mockService.updateRelationships = async (...args) => {
      await originalUpdateRelationships(...args);
      this.syncMockToStore();
    };

    this.mockService.addRelationship = async (...args) => {
      await originalAddRelationship(...args);
      this.syncMockToStore();
    };

    this.mockService.removeRelationship = async (...args) => {
      await originalRemoveRelationship(...args);
      this.syncMockToStore();
    };

    // Wrap URL methods
    this.mockService.createFromUrl = async (...args) => {
      const node = await originalCreateFromUrl(...args);
      this.syncMockToStore();
      return node;
    };

    this.mockService.addUrlToNode = async (...args) => {
      await originalAddUrlToNode(...args);
      this.syncMockToStore();
    };
  }
  
  /**
   * Sync mock service nodes to store (for UI updates)
   */
  private async syncMockToStore(): Promise<void> {
    // For now, we'll use a simple event emission pattern
    // The DreamspaceCanvas will need to listen for these changes
    console.log('ServiceManager: Mock data changed, notifying listeners');
    
    // Emit a custom event that DreamspaceCanvas can listen to
    // Use globalThis to ensure compatibility in all environments
    if (typeof globalThis.CustomEvent !== 'undefined') {
      globalThis.dispatchEvent(new globalThis.CustomEvent('mock-nodes-changed', {
        detail: { source: 'service-manager' }
      }));
    } else {
      console.log('ServiceManager: CustomEvent not available in this environment');
    }
  }
  
  /**
   * Initialize with plugin instance (required for real service)
   */
  initialize(plugin: Plugin): void {
    this.plugin = plugin;
    this.realService = new GitDreamNodeService(plugin);
    
    // Store service references (accessing private properties from main.ts)
    // Store service references (accessing service properties from main.ts)
    const pluginWithServices = plugin as Plugin & {
      vaultService: VaultService;
      canvasParserService: CanvasParserService;
      leafManagerService: LeafManagerService;
    };
    this.vaultService = pluginWithServices.vaultService;
    this.canvasParserService = pluginWithServices.canvasParserService;
    this.leafManagerService = pluginWithServices.leafManagerService;
    this.submoduleManagerService = (pluginWithServices as any).submoduleManagerService;
    
    
    // Sync with store's data mode
    const store = useInterBrainStore.getState();
    if (store.dataMode === 'real' && this.realService) {
      // Perform batched vault scan when starting in real mode
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
   * Get VaultService instance (only available when plugin is initialized)
   */
  getVaultService() {
    return this.vaultService;
  }

  /**
   * Get CanvasParserService instance (only available when plugin is initialized)
   */
  getCanvasParserService() {
    return this.canvasParserService;
  }

  /**
   * Get LeafManagerService instance (only available when plugin is initialized)
   */
  getLeafManagerService() {
    return this.leafManagerService;
  }

  /**
   * Get SubmoduleManagerService instance (only available when plugin is initialized)
   */
  getSubmoduleManagerService() {
    return this.submoduleManagerService;
  }

  /**
   * Get Obsidian app instance (only available when plugin is initialized)
   */
  getApp() {
    return this.plugin?.app || null;
  }

  /**
   * Get the Claude API key from plugin settings
   */
  getClaudeApiKey(): string | null {
    if (!this.plugin) {
      return null;
    }
    // Access the settings property on the plugin
    const pluginWithSettings = this.plugin as Plugin & {
      settings: { claudeApiKey?: string };
    };
    return pluginWithSettings.settings?.claudeApiKey || null;
  }

  /**
   * Check if web link analyzer is enabled and ready
   */
  isWebLinkAnalyzerReady(): boolean {
    if (!this.plugin) {
      return false;
    }
    const pluginWithSettings = this.plugin as Plugin & {
      settings: {
        webLinkAnalyzerEnabled?: boolean;
        webLinkAnalyzerSetupComplete?: boolean;
        claudeApiKey?: string;
      };
    };
    const settings = pluginWithSettings.settings;
    // Analyzer is ready if enabled, setup complete, and API key configured
    return !!(
      settings?.webLinkAnalyzerEnabled &&
      settings?.webLinkAnalyzerSetupComplete &&
      settings?.claudeApiKey
    );
  }

  /**
   * Generic service getter (for backwards compatibility and simpler access)
   */
  getService(serviceName: string) {
    switch (serviceName) {
      case 'leafManagerService':
        return this.getLeafManagerService();
      case 'vaultService':
        return this.getVaultService();
      case 'canvasParserService':
        return this.getCanvasParserService();
      default:
        return null;
    }
  }

  /**
   * Execute a command by ID using the plugin's app instance
   */
  executeCommand(commandId: string): void {
    if (!this.plugin) {
      return;
    }
    
    try {
      const fullCommandId = `interbrain:${commandId}`;
      this.plugin.app.commands.executeCommandById(fullCommandId);
    } catch {
      // Command execution errors are handled by Obsidian
    }
  }

  /**
   * Switch between mock and real modes
   */
  async setMode(mode: 'mock' | 'real'): Promise<void> {
    const store = useInterBrainStore.getState();
    const previousMode = store.dataMode;
    
    // Store current UI state before switching
    const currentUIState = {
      selectedNode: store.selectedNode,
      spatialLayout: store.spatialLayout,
      cameraPosition: store.camera.position,
      cameraTarget: store.camera.target
    };
    
    // Update store
    store.setDataMode(mode);
    
    console.log(`ServiceManager: Switched from ${previousMode} to ${mode} mode`);
    console.log('ServiceManager: Preserved UI state:', currentUIState);
    
    if (mode === 'real' && this.realService) {
      // Scan vault when switching to real mode
      console.log('ServiceManager: Scanning vault for DreamNodes...');
      const stats = await this.realService.scanVault();
      console.log('ServiceManager: Vault scan complete:', stats);
      
      // Try to restore selected node if it exists in real mode
      if (currentUIState.selectedNode) {
        const realNodes = await this.realService.list();
        const matchingNode = realNodes.find(n => n.name === currentUIState.selectedNode?.name);
        if (matchingNode) {
          store.setSelectedNode(matchingNode);
          console.log('ServiceManager: Restored selected node in real mode');
        }
      }
    } else if (mode === 'mock') {
      console.log('MockDreamNodeService stats:', this.mockService.getStats());
      
      // Sync current mock data to ensure UI is updated
      this.syncMockToStore();
    }
    
    // Restore UI state elements that should persist
    // Camera and rotation state are preserved automatically by not resetting them
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
   * Get the indexing service
   */
  getIndexingService(): IndexingService {
    return this.indexingService;
  }

  /**
   * Get the Radicle service
   */
  getRadicleService(): RadicleService {
    return this.radicleService;
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