import { Plugin } from 'obsidian';
import { DreamSongRelationshipService } from '../dreamweaving/dreamsong-relationship-service';
import { UIService } from '../../core/services/ui-service';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { DEFAULT_DREAMSONG_RELATIONSHIP_CONFIG, DreamSongRelationshipGraph } from './types';

/**
 * Register debug commands for constellation layout visualization
 * These commands toggle debug overlays for Dynamic View Scaling geometry
 */
export function registerConstellationDebugCommands(plugin: Plugin, uiService: UIService): void {
  // Debug: Toggle wireframe sphere
  plugin.addCommand({
    id: 'toggle-debug-wireframe-sphere',
    name: '[Dev] Toggle Debug Wireframe Sphere',
    callback: () => {
      const store = useInterBrainStore.getState();
      const newState = !store.debugWireframeSphere;
      store.setDebugWireframeSphere(newState);
      uiService.showSuccess(`Debug wireframe sphere ${newState ? 'enabled' : 'disabled'}`);
    }
  });

  // Debug: Toggle intersection point
  plugin.addCommand({
    id: 'toggle-debug-intersection-point',
    name: '[Dev] Toggle Debug Intersection Point',
    callback: () => {
      const store = useInterBrainStore.getState();
      const newState = !store.debugIntersectionPoint;
      store.setDebugIntersectionPoint(newState);
      uiService.showSuccess(`Debug intersection point ${newState ? 'enabled' : 'disabled'}`);
    }
  });
}

/**
 * Constellation Commands - Obsidian commands for DreamSong relationship analysis
 */
export class ConstellationCommands {
  private relationshipService: DreamSongRelationshipService;
  private uiService: UIService;

  constructor(plugin: Plugin) {
    this.relationshipService = new DreamSongRelationshipService(plugin);
    this.uiService = new UIService(plugin.app);
  }

  /**
   * Register all constellation-related commands
   */
  registerCommands(plugin: Plugin): void {
    // Main vault scanning command - core user workflow
    plugin.addCommand({
      id: 'scan-vault-dreamsong-relationships',
      name: 'Scan Vault for DreamSong Relationships',
      callback: () => this.scanVaultForDreamSongRelationships()
    });

    // Apply constellation layout positioning - core user workflow
    plugin.addCommand({
      id: 'apply-constellation-layout',
      name: 'Apply Constellation Layout',
      callback: () => this.applyConstellationLayout()
    });
  }

  /**
   * Scan vault for DreamSong relationships and display results
   */
  private async scanVaultForDreamSongRelationships(): Promise<void> {
    const store = useInterBrainStore.getState();
    store.setConstellationScanning(true);

    const scanNotice = this.uiService.showInfo('🔍 Scanning vault for DreamSong relationships...', 0);

    try {
      const result = await this.relationshipService.scanVaultForDreamSongRelationships(
        DEFAULT_DREAMSONG_RELATIONSHIP_CONFIG
      );

      scanNotice.hide();

      if (result.success && result.graph) {
        const { metadata, nodes } = result.graph;
        const existingGraph = store.constellationData.relationshipGraph;
        const relationshipsChanged = this.hasRelationshipGraphChanged(existingGraph, result.graph);

        store.setRelationshipGraph(result.graph);

        const changeIndicator = relationshipsChanged ? '🔄 UPDATED' : '✅ NO CHANGES';
        const statsMessage = [
          `✅ DreamSong relationship scan complete! ${changeIndicator}`,
          ``,
          `📊 Results:`,
          `• ${metadata.totalNodes} DreamNodes discovered`,
          `• ${metadata.totalDreamSongs} DreamSongs found`,
          `• ${metadata.totalEdges} relationship edges created`,
          `• ${metadata.standaloneNodes} standalone nodes (no connections)`,
          `• ${nodes.size - metadata.standaloneNodes} connected nodes`,
          ``,
          `⏱️ Scan completed in ${result.stats.scanTimeMs}ms`,
          relationshipsChanged
            ? `🔄 Relationships changed - applying new layout...`
            : `✓ No changes detected - keeping existing layout`
        ].join('\n');

        this.uiService.showSuccess(statsMessage, 8000);

        if (relationshipsChanged) {
          try {
            await this.applyConstellationLayout();
            store.requestNavigation({ type: 'applyLayout' });
          } catch (layoutError) {
            console.error('Failed to auto-apply constellation layout:', layoutError);
          }
        }

      } else {
        store.setConstellationScanning(false);
        const errorMessage = result.error
          ? `❌ Scan failed: ${result.error.message}\n\nType: ${result.error.type}`
          : '❌ Scan failed with unknown error';
        this.uiService.showError(errorMessage, 8000);
        console.error('[Constellation] Scan failed:', result.error);
      }

    } catch (error) {
      scanNotice.hide();
      store.setConstellationScanning(false);
      const errorMessage = `❌ Unexpected error during scan: ${error instanceof Error ? error.message : error}`;
      this.uiService.showError(errorMessage, 8000);
      console.error('[Constellation] Unexpected scan error:', error);
    }
  }

  /**
   * Check if relationship graph has changed (intelligent diff)
   * Returns true if edges or node count changed
   */
  private hasRelationshipGraphChanged(
    oldGraph: DreamSongRelationshipGraph | null,
    newGraph: DreamSongRelationshipGraph
  ): boolean {
    if (!oldGraph) return true;

    // Compare counts first (fast)
    if (oldGraph.edges.length !== newGraph.edges.length) return true;
    if (oldGraph.metadata.totalNodes !== newGraph.metadata.totalNodes) return true;

    // Compare edge signatures (source → target pairs)
    const oldEdgeSignatures = new Set(oldGraph.edges.map(e => `${e.source}→${e.target}`));
    const newEdgeSignatures = new Set(newGraph.edges.map(e => `${e.source}→${e.target}`));

    for (const sig of newEdgeSignatures) {
      if (!oldEdgeSignatures.has(sig)) return true;
    }
    for (const sig of oldEdgeSignatures) {
      if (!newEdgeSignatures.has(sig)) return true;
    }

    return false;
  }

  /**
   * Apply constellation layout positioning to DreamNodes
   */
  private async applyConstellationLayout(): Promise<void> {
    const store = useInterBrainStore.getState();

    try {
      const relationshipGraph = store.constellationData.relationshipGraph;
      if (!relationshipGraph) {
        this.uiService.showError('❌ No relationship data available. Run "Scan Vault for DreamSong Relationships" first.', 5000);
        return;
      }

      const layoutNotice = this.uiService.showInfo('🌌 Computing constellation layout...', 0);

      // Request layout application via store-based navigation
      store.requestNavigation({ type: 'applyLayout' });

      await new Promise(resolve => setTimeout(resolve, 100));
      layoutNotice.hide();

      const positions = store.constellationData.positions;
      const positionCount = positions?.size || 0;

      this.uiService.showSuccess(
        `✅ Constellation layout applied!\n\n📍 ${positionCount} DreamNodes positioned using force-directed algorithm`,
        5000
      );

    } catch (error) {
      const errorMessage = `❌ Layout application failed: ${error instanceof Error ? error.message : error}`;
      this.uiService.showError(errorMessage, 5000);
      console.error('[Constellation] Layout error:', error);
    }
  }
}