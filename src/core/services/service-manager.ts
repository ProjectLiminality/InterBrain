import { DreamNode } from '../../features/dreamnode/types/dreamnode';
import { GitDreamNodeService } from '../../features/dreamnode/services/git-dreamnode-service';
import { VaultService } from './vault-service';
import { CanvasParserService } from '../../features/dreamweaving/services/canvas-parser-service';
import { LeafManagerService } from './leaf-manager-service';
import { SubmoduleManagerService } from '../../features/dreamweaving/services/submodule-manager-service';
import { Plugin } from 'obsidian';
import { IndexingService, indexingService } from '../../features/semantic-search/services/indexing-service';
import { UrlMetadata } from '../../features/drag-and-drop';
import { RadicleService, RadicleServiceImpl } from '../../features/social-resonance-filter/radicle-service';

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
  addFilesToNodeWithoutDreamTalkUpdate?(nodeId: string, files: globalThis.File[]): Promise<void>;
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
 * Service Manager - manages service instances and plugin integration
 */
export class ServiceManager {
  private dreamNodeService: GitDreamNodeService | null = null;
  private indexingService: IndexingService;
  private radicleService: RadicleService;
  private plugin: Plugin | null = null;
  private vaultService: VaultService | null = null;
  private canvasParserService: CanvasParserService | null = null;
  private leafManagerService: LeafManagerService | null = null;
  private submoduleManagerService: SubmoduleManagerService | null = null;

  constructor() {
    this.indexingService = indexingService;
    this.radicleService = new RadicleServiceImpl();
  }

  /**
   * Initialize with plugin instance (required for services)
   */
  initialize(plugin: Plugin): void {
    this.plugin = plugin;
    this.dreamNodeService = new GitDreamNodeService(plugin);

    // Store service references (accessing service properties from main.ts)
    const pluginWithServices = plugin as Plugin & {
      vaultService: VaultService;
      canvasParserService: CanvasParserService;
      leafManagerService: LeafManagerService;
      submoduleManagerService: SubmoduleManagerService;
    };
    this.vaultService = pluginWithServices.vaultService;
    this.canvasParserService = pluginWithServices.canvasParserService;
    this.leafManagerService = pluginWithServices.leafManagerService;
    this.submoduleManagerService = pluginWithServices.submoduleManagerService;

    // Perform initial vault scan
    if (this.dreamNodeService) {
      this.dreamNodeService.scanVault().catch(error => {
        console.error('Initial vault scan failed:', error);
      });
    }
  }

  /**
   * Get the DreamNode service
   */
  getActive(): IDreamNodeService {
    if (!this.dreamNodeService) {
      throw new Error('DreamNode service not initialized. Call initialize() with plugin first.');
    }
    return this.dreamNodeService;
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
  getSubmoduleManagerService(): SubmoduleManagerService | null {
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
   * Reset data (clears store cache, vault unchanged)
   */
  resetData(): void {
    if (this.dreamNodeService) {
      this.dreamNodeService.reset();
      console.log('ServiceManager: Reset data store (vault unchanged)');
    }
  }

  /**
   * Get service statistics
   */
  getStats() {
    if (this.dreamNodeService) {
      return this.dreamNodeService.getStats();
    } else {
      return {
        message: 'DreamNode service not initialized'
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
   * Perform vault scan
   */
  async scanVault(): Promise<{ added: number; updated: number; removed: number } | null> {
    if (this.dreamNodeService) {
      return await this.dreamNodeService.scanVault();
    }
    console.warn('ServiceManager: DreamNode service not initialized');
    return null;
  }
}

// Export singleton instance
export const serviceManager = new ServiceManager();