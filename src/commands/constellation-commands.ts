import { Plugin } from 'obsidian';
import { DreamSongRelationshipService } from '../core/services/dreamsong-relationship-service';
import { UIService } from '../core/services/ui-service';
import { VaultService } from '../core/services/vault-service';
import { useInterBrainStore } from '../core/store/interbrain-store';
import { DEFAULT_DREAMSONG_RELATIONSHIP_CONFIG, DreamSongRelationshipGraph } from '../core/types/constellation';

/**
 * Constellation Commands - Obsidian commands for DreamSong relationship analysis
 */
export class ConstellationCommands {
  private relationshipService: DreamSongRelationshipService;
  private uiService: UIService;
  private vaultService: VaultService;

  constructor(plugin: Plugin) {
    this.relationshipService = new DreamSongRelationshipService(plugin);
    this.uiService = new UIService(plugin.app);
    this.vaultService = new VaultService(plugin.app.vault, plugin.app);
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

          // Auto-apply constellation layout positioning (if DreamSpace is open)
          try {
            // Check if SpatialOrchestrator is available before attempting layout
            const canvasAPI = (globalThis as unknown as { __interbrainCanvas?: { applyConstellationLayout?(): Promise<void> } }).__interbrainCanvas;

            if (canvasAPI && canvasAPI.applyConstellationLayout) {
              await this.applyConstellationLayout();
              console.log('✅ [Constellation Commands] Constellation layout applied automatically after scan');
            } else {
              console.log('ℹ️ [Constellation Commands] SpatialOrchestrator not available (DreamSpace not open) - skipping layout application');
              console.log('   Layout will be applied automatically when DreamSpace opens');
            }
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
          .filter(node => !node.isStandalone)
          .sort((a, b) => (b.incomingReferences + b.outgoingDreamSongs) - (a.incomingReferences + a.outgoingDreamSongs))
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
          ...topNodes.map(node =>
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

      // Check if DreamSpace canvas API is available
      const canvasAPI = (globalThis as unknown as { __interbrainCanvas?: { applyConstellationLayout?(): Promise<void> } }).__interbrainCanvas;
      if (!canvasAPI || !canvasAPI.applyConstellationLayout) {
        this.uiService.showError('❌ 3D space not available. Please open DreamSpace view first.', 5000);
        return;
      }

      // Show progress notice
      const layoutNotice = this.uiService.showInfo('🌌 Computing constellation layout...', 0);

      // Apply the constellation layout via global canvas API
      await canvasAPI.applyConstellationLayout();
      const success = true; // If we get here without throwing, it succeeded

      // Hide progress notice
      layoutNotice.hide();

      if (success) {
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
      } else {
        this.uiService.showError('❌ Failed to apply constellation layout - SpatialOrchestrator not ready', 5000);
      }

    } catch (error) {
      const errorMessage = `❌ Layout application failed: ${error instanceof Error ? error.message : error}`;
      this.uiService.showError(errorMessage, 5000);
      console.error('❌ [Constellation Commands] Layout error:', error);
    }
  }
}