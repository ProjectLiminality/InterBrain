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
    // Main vault scanning command
    plugin.addCommand({
      id: 'scan-vault-dreamsong-relationships',
      name: 'Scan Vault for DreamSong Relationships',
      callback: () => this.scanVaultForDreamSongRelationships()
    });

    // Export relationships to JSON (for testing)
    plugin.addCommand({
      id: 'export-dreamsong-relationships-json',
      name: 'Export DreamSong Relationships to JSON',
      callback: () => this.exportDreamSongRelationshipsToJSON()
    });

    // Quick relationship statistics
    plugin.addCommand({
      id: 'show-dreamsong-relationship-stats',
      name: 'Show DreamSong Relationship Statistics',
      callback: () => this.showRelationshipStatistics()
    });

    // Apply constellation layout positioning
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
    console.log('🚀 [Constellation Commands] Starting DreamSong relationship scan...');
    const store = useInterBrainStore.getState();

    // Set scanning state
    store.setConstellationScanning(true);

    // Show progress notice
    const scanNotice = this.uiService.showInfo('🔍 Scanning vault for DreamSong relationships...', 0);

    try {
      // Perform the scan
      const result = await this.relationshipService.scanVaultForDreamSongRelationships(
        DEFAULT_DREAMSONG_RELATIONSHIP_CONFIG
      );

      // Hide progress notice
      scanNotice.hide();

      if (result.success && result.graph) {
        const { metadata, nodes } = result.graph;

        // Check if relationships have changed (intelligent diff)
        const existingGraph = store.constellationData.relationshipGraph;
        const relationshipsChanged = this.hasRelationshipGraphChanged(existingGraph, result.graph);

        // Store the relationship graph in Zustand (persisted to localStorage automatically)
        store.setRelationshipGraph(result.graph);

        // Show success with detailed statistics
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

        // Log detailed results for debugging
        console.log(`✅ [Constellation Commands] Scan successful and stored:`, {
          nodes: metadata.totalNodes,
          dreamSongs: metadata.totalDreamSongs,
          edges: metadata.totalEdges,
          standalone: metadata.standaloneNodes,
          scanTime: result.stats.scanTimeMs,
          relationshipsChanged
        });

        // Only apply layout if relationships actually changed
        if (relationshipsChanged) {
          console.log('🔄 [Constellation Commands] Relationships changed - applying constellation layout...');

          // Auto-apply constellation layout positioning via store
          try {
            await this.applyConstellationLayout();
            // Request the visual layout update via store
            store.requestNavigation({ type: 'applyLayout' });
            console.log('✅ [Constellation Commands] Constellation layout applied automatically after scan');
          } catch (layoutError) {
            console.error('Failed to auto-apply constellation layout:', layoutError);
            // Non-fatal - data is saved, layout can be applied later
          }
        } else {
          console.log('✓ [Constellation Commands] No relationship changes detected - keeping existing layout');
        }

      } else {
        // Clear scanning state and show error
        store.setConstellationScanning(false);

        const errorMessage = result.error
          ? `❌ Scan failed: ${result.error.message}\n\nType: ${result.error.type}`
          : '❌ Scan failed with unknown error';

        this.uiService.showError(errorMessage, 8000);
        console.error('❌ [Constellation Commands] Scan failed:', result.error);
      }

    } catch (error) {
      // Hide progress notice and clear scanning state
      scanNotice.hide();
      store.setConstellationScanning(false);

      const errorMessage = `❌ Unexpected error during scan: ${error instanceof Error ? error.message : error}`;
      this.uiService.showError(errorMessage, 8000);
      console.error('❌ [Constellation Commands] Unexpected scan error:', error);
    }
  }

  /**
   * Export current relationship data to JSON file (MANUAL COMMAND ONLY)
   * NOTE: Automatic export removed - data is persisted to localStorage automatically
   */
  private async exportDreamSongRelationshipsToJSON(): Promise<void> {
    console.log('📤 [Constellation Commands] Exporting DreamSong relationships to JSON...');
    const store = useInterBrainStore.getState();

    try {
      const graphToExport = store.constellationData.relationshipGraph;

      if (!graphToExport) {
        this.uiService.showError('❌ No relationship data available. Run "Scan Vault for DreamSong Relationships" first.', 5000);
        return;
      }

      // Export current graph to timestamped JSON file (for debugging/sharing)
      const filename = `dreamsong-relationships-${Date.now()}.json`;
      await this.relationshipService.exportGraphToJSON(graphToExport, filename);

      this.uiService.showSuccess(`✅ Exported DreamSong relationships to: ${filename}`, 5000);
      console.log('✅ [Constellation Commands] JSON export successful:', filename);

    } catch (error) {
      const errorMessage = `❌ Export failed: ${error instanceof Error ? error.message : error}`;
      this.uiService.showError(errorMessage, 5000);
      console.error('❌ [Constellation Commands] Export error:', error);
    }
  }

  /**
   * Show quick relationship statistics without full scan
   */
  private async showRelationshipStatistics(): Promise<void> {
    console.log('📈 [Constellation Commands] Showing relationship statistics...');

    try {
      // Perform a quick scan to get current stats
      const result = await this.relationshipService.scanVaultForDreamSongRelationships({
        ...DEFAULT_DREAMSONG_RELATIONSHIP_CONFIG,
        maxEdgesPerDreamSong: 10 // Limit for quick stats
      });

      if (result.success && result.graph) {
        const { metadata, nodes } = result.graph;

        // Calculate additional statistics
        const connectedNodes = nodes.size - metadata.standaloneNodes;
        const avgConnectionsPerNode = connectedNodes > 0 ? metadata.totalEdges / connectedNodes : 0;

        // Find most connected nodes
        const nodeArray = Array.from(nodes.values());
        const topNodes = nodeArray
          .filter((node: any) => !node.isStandalone)
          .sort((a: any, b: any) => (b.incomingReferences + b.outgoingDreamSongs) - (a.incomingReferences + a.outgoingDreamSongs))
          .slice(0, 5);

        const statsMessage = [
          `📊 DreamSong Relationship Statistics`,
          ``,
          `🌐 Network Overview:`,
          `• ${metadata.totalNodes} total DreamNodes`,
          `• ${connectedNodes} connected nodes (${Math.round(connectedNodes / metadata.totalNodes * 100)}%)`,
          `• ${metadata.standaloneNodes} standalone nodes`,
          `• ${metadata.totalEdges} relationship edges`,
          `• ${avgConnectionsPerNode.toFixed(1)} avg connections per connected node`,
          ``,
          `🎵 DreamSong Content:`,
          `• ${metadata.totalDreamSongs} DreamSongs with relationships`,
          `• ${result.stats.dreamSongsFound} total DreamSongs found`,
          `• ${Math.round(result.stats.dreamSongsParsed / result.stats.dreamSongsFound * 100)}% successfully parsed`,
          ``,
          topNodes.length > 0 ? `🔗 Most Connected Nodes:` : '',
          ...topNodes.map((node: any) =>
            `• ${node.title}: ${node.incomingReferences} incoming, ${node.outgoingDreamSongs} outgoing`
          )
        ].filter(line => line !== '').join('\n');

        this.uiService.showInfo(statsMessage, 10000);
        console.log('📈 [Constellation Commands] Statistics displayed successfully');

      } else {
        this.uiService.showError(`❌ Statistics failed: ${result.error?.message || 'Unknown error'}`, 5000);
      }

    } catch (error) {
      const errorMessage = `❌ Statistics error: ${error instanceof Error ? error.message : error}`;
      this.uiService.showError(errorMessage, 5000);
      console.error('❌ [Constellation Commands] Statistics error:', error);
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
    // If no existing graph, this is the first scan - relationships "changed"
    if (!oldGraph) {
      console.log('🔍 [Relationship Diff] No existing graph - first scan');
      return true;
    }

    // Compare edge counts
    const oldEdgeCount = oldGraph.edges.length;
    const newEdgeCount = newGraph.edges.length;

    if (oldEdgeCount !== newEdgeCount) {
      console.log(`🔍 [Relationship Diff] Edge count changed: ${oldEdgeCount} → ${newEdgeCount}`);
      return true;
    }

    // Compare node counts
    const oldNodeCount = oldGraph.metadata.totalNodes;
    const newNodeCount = newGraph.metadata.totalNodes;

    if (oldNodeCount !== newNodeCount) {
      console.log(`🔍 [Relationship Diff] Node count changed: ${oldNodeCount} → ${newNodeCount}`);
      return true;
    }

    // Compare edge signatures (source → target pairs)
    const oldEdgeSignatures = new Set(
      oldGraph.edges.map(e => `${e.source}→${e.target}`)
    );
    const newEdgeSignatures = new Set(
      newGraph.edges.map(e => `${e.source}→${e.target}`)
    );

    // Check if any edges were added or removed
    for (const sig of newEdgeSignatures) {
      if (!oldEdgeSignatures.has(sig)) {
        console.log(`🔍 [Relationship Diff] New edge detected: ${sig}`);
        return true;
      }
    }

    for (const sig of oldEdgeSignatures) {
      if (!newEdgeSignatures.has(sig)) {
        console.log(`🔍 [Relationship Diff] Edge removed: ${sig}`);
        return true;
      }
    }

    console.log('✓ [Relationship Diff] No changes detected');
    return false;
  }

  /**
   * Apply constellation layout positioning to DreamNodes
   */
  private async applyConstellationLayout(): Promise<void> {
    console.log('🌌 [Constellation Commands] Applying constellation layout positioning...');
    const store = useInterBrainStore.getState();

    try {
      // Check if we have relationship data
      const relationshipGraph = store.constellationData.relationshipGraph;
      if (!relationshipGraph) {
        this.uiService.showError('❌ No relationship data available. Run "Scan Vault for DreamSong Relationships" first.', 5000);
        return;
      }

      // Show progress notice
      const layoutNotice = this.uiService.showInfo('🌌 Computing constellation layout...', 0);

      // Request layout application via store-based navigation
      // The DreamspaceCanvas reacts to this and invokes SpatialOrchestrator
      store.requestNavigation({ type: 'applyLayout' });

      // Brief delay to allow the layout to be applied
      await new Promise(resolve => setTimeout(resolve, 100));

      // Hide progress notice
      layoutNotice.hide();

      // Get layout statistics for user feedback
      const positions = store.constellationData.positions;
      const positionCount = positions?.size || 0;

      this.uiService.showSuccess(
        `✅ Constellation layout applied!\n\n📍 ${positionCount} DreamNodes positioned using force-directed algorithm`,
        5000
      );

      console.log('✅ [Constellation Commands] Constellation layout applied successfully:', {
        nodesPositioned: positionCount,
        hasPositions: !!positions
      });

    } catch (error) {
      const errorMessage = `❌ Layout application failed: ${error instanceof Error ? error.message : error}`;
      this.uiService.showError(errorMessage, 5000);
      console.error('❌ [Constellation Commands] Layout error:', error);
    }
  }
}