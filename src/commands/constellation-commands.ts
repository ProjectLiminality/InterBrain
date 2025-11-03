import { Plugin } from 'obsidian';
import { DreamSongRelationshipService } from '../services/dreamsong-relationship-service';
import { UIService } from '../services/ui-service';
import { VaultService } from '../services/vault-service';
import { useInterBrainStore } from '../store/interbrain-store';
import { DEFAULT_DREAMSONG_RELATIONSHIP_CONFIG } from '../types/constellation';

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

        // Store the relationship graph in Zustand
        store.setRelationshipGraph(result.graph);

        // Show success with detailed statistics
        const statsMessage = [
          `✅ DreamSong relationship scan complete!`,
          ``,
          `📊 Results:`,
          `• ${metadata.totalNodes} DreamNodes discovered`,
          `• ${metadata.totalDreamSongs} DreamSongs found`,
          `• ${metadata.totalEdges} relationship edges created`,
          `• ${metadata.standaloneNodes} standalone nodes (no connections)`,
          `• ${nodes.size - metadata.standaloneNodes} connected nodes`,
          ``,
          `⏱️ Scan completed in ${result.stats.scanTimeMs}ms`,
          `💾 Relationship data stored in plugin memory`
        ].join('\n');

        this.uiService.showSuccess(statsMessage, 8000);

        // Log detailed results for debugging
        console.log(`✅ [Constellation Commands] Scan successful and stored:`, {
          nodes: metadata.totalNodes,
          dreamSongs: metadata.totalDreamSongs,
          edges: metadata.totalEdges,
          standalone: metadata.standaloneNodes,
          scanTime: result.stats.scanTimeMs
        });

        // Auto-export to JSON for testing
        try {
          await this.relationshipService.exportGraphToJSON(
            result.graph,
            'dreamsong-relationships.json'
          );
          this.uiService.showInfo('📤 Relationship data exported to dreamsong-relationships.json', 3000);
        } catch (exportError) {
          console.error('Failed to auto-export JSON:', exportError);
        }

        // NOTE: Auto-apply constellation layout REMOVED
        // This was causing media to disappear during plugin reload
        // Layout should only be applied when user explicitly requests it via command
        console.log('✅ [Constellation Commands] DreamSong relationship scan complete (layout not auto-applied)');

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
   * Export current relationship data to JSON file
   */
  private async exportDreamSongRelationshipsToJSON(): Promise<void> {
    console.log('📤 [Constellation Commands] Exporting DreamSong relationships to JSON...');
    const store = useInterBrainStore.getState();

    try {
      let graphToExport = store.constellationData.relationshipGraph;

      // If no cached data or it's old, perform fresh scan
      if (!graphToExport ||
          !store.constellationData.lastScanTimestamp ||
          Date.now() - store.constellationData.lastScanTimestamp > 5 * 60 * 1000) { // 5 minutes

        console.log('📤 [Constellation Commands] No recent data, performing fresh scan...');

        const result = await this.relationshipService.scanVaultForDreamSongRelationships(
          DEFAULT_DREAMSONG_RELATIONSHIP_CONFIG
        );

        if (!result.success || !result.graph) {
          this.uiService.showError(`❌ Cannot export: ${result.error?.message || 'Scan failed'}`, 5000);
          return;
        }

        graphToExport = result.graph;
        store.setRelationshipGraph(result.graph);
      }

      // Export to JSON
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