import { Plugin } from 'obsidian';
import { GitDreamNodeService } from '../../dreamnode/services/git-dreamnode-service';
import { DreamSongParserService } from './dreamsong-parser-service';
import { VaultService } from '../../../core/services/vault-service';
import { CanvasParserService } from './canvas-parser-service';
import { DreamNode } from '../../dreamnode';
import { DreamSongData, DreamSongBlock } from '../types/dreamsong';
import {
  DreamSongRelationshipGraph,
  DreamSongNode,
  DreamSongEdge,
  DreamSongScanResult,
  DreamSongRelationshipConfig,
  DEFAULT_DREAMSONG_RELATIONSHIP_CONFIG,
  serializeRelationshipGraph
} from '../types/relationship';

// Access Node.js modules directly in Electron context
 
const fs = require('fs');
const path = require('path');
 

/**
 * DreamSong Relationship Service
 *
 * Extracts relationship graphs from DreamSong canvas sequences for constellation layout.
 * Maps media file paths to parent DreamNode UUIDs and creates sequential edges.
 */
export class DreamSongRelationshipService {
  private dreamNodeService: GitDreamNodeService;
  private dreamSongParser: DreamSongParserService;
  private vaultService: VaultService;
  private canvasParser: CanvasParserService;

  constructor(plugin: Plugin) {
    this.dreamNodeService = new GitDreamNodeService(plugin);
    this.vaultService = new VaultService(plugin.app.vault, plugin.app);
    this.canvasParser = new CanvasParserService(this.vaultService);
    this.dreamSongParser = new DreamSongParserService(
      this.vaultService,
      this.canvasParser
    );
  }

  /**
   * Main entry point: Scan entire vault for DreamSong relationships
   */
  async scanVaultForDreamSongRelationships(
    config: DreamSongRelationshipConfig = DEFAULT_DREAMSONG_RELATIONSHIP_CONFIG
  ): Promise<DreamSongScanResult> {
    const startTime = Date.now();
    console.log('🔍 [DreamSong Relationships] Starting vault scan...');

    try {
      // Phase 0: Removed - dangling ref cleanup no longer needed with liminal-web.json approach

      // Phase 1: Discover all DreamNodes and build UUID mapping
      const { dreamNodes, uuidToPathMap } = await this.discoverAllDreamNodes();
      console.log(`📊 [DreamSong Relationships] Found ${dreamNodes.length} DreamNodes`);

      // Phase 2: Scan for DreamSongs and extract relationships
      const { edges, dreamSongsFound, dreamSongsParsed } = await this.extractAllRelationships(
        dreamNodes,
        uuidToPathMap,
        config
      );

      // Phase 3: Build final graph structure
      const graph = this.buildRelationshipGraph(dreamNodes, edges);

      const scanTimeMs = Date.now() - startTime;
      console.log(`✅ [DreamSong Relationships] Scan complete in ${scanTimeMs}ms`);
      console.log(`📈 [DreamSong Relationships] Created ${edges.length} edges from ${dreamSongsParsed} DreamSongs`);

      return {
        success: true,
        graph,
        stats: {
          nodesScanned: dreamNodes.length,
          dreamSongsFound,
          dreamSongsParsed,
          edgesCreated: edges.length,
          scanTimeMs
        }
      };

    } catch (error) {
      console.error('❌ [DreamSong Relationships] Vault scan failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        error: {
          message: errorMessage,
          type: 'vault_access',
          details: String(error)
        },
        stats: {
          nodesScanned: 0,
          dreamSongsFound: 0,
          dreamSongsParsed: 0,
          edgesCreated: 0,
          scanTimeMs: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Export relationship graph to JSON file for testing
   */
  async exportGraphToJSON(
    graph: DreamSongRelationshipGraph,
    outputPath: string
  ): Promise<void> {
    try {
      const serializable = serializeRelationshipGraph(graph);
      const jsonString = JSON.stringify(serializable, null, 2);

      // Get full file system path
      const vaultPath = this.vaultService.getVaultPath();
      const fullPath = path.join(vaultPath, outputPath);

      // Write to file
      fs.writeFileSync(fullPath, jsonString, 'utf-8');
      console.log(`📤 [DreamSong Relationships] Exported graph to: ${fullPath}`);

    } catch (error) {
      console.error('❌ [DreamSong Relationships] Export failed:', error);
      throw error;
    }
  }

  /**
   * Phase 1: Discover all DreamNodes and create UUID mapping
   */
  private async discoverAllDreamNodes(): Promise<{
    dreamNodes: DreamNode[];
    uuidToPathMap: Map<string, string>;
  }> {
    // NOTE: Vault scan removed - already done during plugin initialization
    // Calling scanVault() here was causing media to disappear because it replaced
    // the entire dreamNodes Map, losing any media that was already loaded
    // The vault scan during plugin init is sufficient - we just use that data

    // Get all DreamNodes from the service (uses existing store data)
    const dreamNodes = await this.dreamNodeService.list();

    // Build UUID to path mapping for media resolution
    const uuidToPathMap = new Map<string, string>();
    for (const node of dreamNodes) {
      uuidToPathMap.set(node.id, node.repoPath);
    }

    return { dreamNodes, uuidToPathMap };
  }

  /**
   * Phase 2: Extract relationships from all DreamSongs
   * OPTIMIZED: Uses parallel I/O operations for maximum performance
   */
  private async extractAllRelationships(
    dreamNodes: DreamNode[],
    uuidToPathMap: Map<string, string>,
    config: DreamSongRelationshipConfig
  ): Promise<{
    edges: DreamSongEdge[];
    dreamSongsFound: number;
    dreamSongsParsed: number;
  }> {
    console.log(`⚡ [DreamSong Relationships] Using parallel I/O for ${dreamNodes.length} nodes...`);

    // OPTIMIZATION: Check all DreamSongs in parallel instead of sequentially
    const dreamSongChecks = await Promise.all(
      dreamNodes.map(async (node) => ({
        node,
        hasDreamSong: await this.dreamSongParser.hasDreamSong(node.repoPath)
      }))
    );

    // Filter to only nodes with DreamSongs
    const nodesWithDreamSongs = dreamSongChecks
      .filter(check => check.hasDreamSong)
      .map(check => check.node);

    const dreamSongsFound = nodesWithDreamSongs.length;
    console.log(`🎵 [DreamSong Relationships] Found ${dreamSongsFound} DreamSongs to process`);

    // OPTIMIZATION: Parse all DreamSongs in parallel instead of sequentially
    const parseResults = await Promise.all(
      nodesWithDreamSongs.map(async (dreamNode) => {
        const dreamSongPath = `${dreamNode.repoPath}/DreamSong.canvas`;

        try {
          console.log(`🎵 [DreamSong Relationships] Processing: ${dreamNode.name} -> ${dreamSongPath}`);

          const dreamSongResult = await this.dreamSongParser.parseDreamSong(
            dreamSongPath,
            dreamNode.repoPath
          );

          if (!dreamSongResult.success || !dreamSongResult.data) {
            console.warn(`⚠️ [DreamSong Relationships] Failed to parse: ${dreamSongPath}`);
            return { success: false, edges: [] };
          }

          // Extract relationships from this DreamSong
          const edges = await this.extractRelationshipsFromDreamSong(
            dreamSongResult.data,
            dreamNode.id,
            dreamSongPath,
            uuidToPathMap,
            config
          );

          return { success: true, edges };

        } catch (error) {
          console.error(`❌ [DreamSong Relationships] Error processing ${dreamSongPath}:`, error);
          return { success: false, edges: [] };
        }
      })
    );

    // Aggregate results
    const allEdges: DreamSongEdge[] = [];
    let dreamSongsParsed = 0;

    for (const result of parseResults) {
      if (result.success) {
        dreamSongsParsed++;
        allEdges.push(...result.edges);
      }
    }

    console.log(`⚡ [DreamSong Relationships] Parallel processing complete: ${dreamSongsParsed}/${dreamSongsFound} parsed successfully`);

    return { edges: allEdges, dreamSongsFound, dreamSongsParsed };
  }

  /**
   * Extract relationships from a single DreamSong's media sequence
   */
  private async extractRelationshipsFromDreamSong(
    dreamSongData: DreamSongData,
    sourceDreamNodeId: string,
    dreamSongPath: string,
    uuidToPathMap: Map<string, string>,
    config: DreamSongRelationshipConfig
  ): Promise<DreamSongEdge[]> {
    const edges: DreamSongEdge[] = [];

    // Re-read the canvas to get ORIGINAL file paths (not resolved data URLs)
    // The DreamSongData has media.src as data URLs for display,
    // but we need the actual canvas file paths for relationship extraction
    const canvasContent = await this.vaultService.readFile(dreamSongPath);
    const canvas = JSON.parse(canvasContent);

    // Build a map from node IDs to original file paths
    const nodeIdToFilePath = new Map<string, string>();
    for (const node of canvas.nodes) {
      if (node.type === 'file' && node.file) {
        nodeIdToFilePath.set(node.id, node.file);
      }
    }

    // Filter to only media blocks that have sourceDreamNodeId AND original file paths
    const mediaBlocks = dreamSongData.blocks
      .filter((block: DreamSongBlock) => {
        if (!block.media || !block.media.sourceDreamNodeId) return false;

        // Get the original file path from canvas
        const originalPath = nodeIdToFilePath.get(block.id.split('-')[0]); // Extract node ID from block ID
        return originalPath !== undefined;
      })
      .map((block: DreamSongBlock) => {
        const nodeId = block.id.split('-')[0]; // Extract node ID from block ID (handles media-text pairs)
        const originalPath = nodeIdToFilePath.get(nodeId) || block.media!.src;

        return {
          sourceDreamNodeId: block.media!.sourceDreamNodeId,
          mediaPath: originalPath // Use ORIGINAL canvas path, not data URL
        };
      });

    if (mediaBlocks.length < config.minSequenceLength) {
      console.log(`📏 [DreamSong Relationships] Skipping ${dreamSongPath}: sequence too short (${mediaBlocks.length})`);
      return edges;
    }

    console.log(`🔗 [DreamSong Relationships] Processing sequence of ${mediaBlocks.length} media blocks`);
    console.log(`🔍 [DreamSong Relationships] Media blocks:`, mediaBlocks.map((b: { sourceDreamNodeId: string | undefined; mediaPath: string }) => ({
      sourceDreamNodeId: b.sourceDreamNodeId,
      mediaPath: b.mediaPath.startsWith('data:') ? `[data URL: ${b.mediaPath.substring(0, 30)}...]` : b.mediaPath
    })));

    // Create edges from sequential pairs
    for (let i = 0; i < mediaBlocks.length - 1; i++) {
      if (edges.length >= config.maxEdgesPerDreamSong) {
        console.warn(`⚠️ [DreamSong Relationships] Hit max edges limit (${config.maxEdgesPerDreamSong}) for ${dreamSongPath}`);
        break;
      }

      const currentMedia = mediaBlocks[i];
      const nextMedia = mediaBlocks[i + 1];

      // Resolve media paths to UUIDs
      const sourceUUID = this.resolveMediaPathToUUID(
        currentMedia.sourceDreamNodeId,
        currentMedia.mediaPath,
        sourceDreamNodeId,
        uuidToPathMap
      );

      const targetUUID = this.resolveMediaPathToUUID(
        nextMedia.sourceDreamNodeId,
        nextMedia.mediaPath,
        sourceDreamNodeId,
        uuidToPathMap
      );

      const truncatedCurrentPath = currentMedia.mediaPath.startsWith('data:')
        ? `[data URL: ${currentMedia.mediaPath.substring(0, 30)}...]`
        : currentMedia.mediaPath;
      const truncatedNextPath = nextMedia.mediaPath.startsWith('data:')
        ? `[data URL: ${nextMedia.mediaPath.substring(0, 30)}...]`
        : nextMedia.mediaPath;

      console.log(`🔗 [Edge ${i}] source: ${sourceUUID} (from ${currentMedia.sourceDreamNodeId}/${truncatedCurrentPath})`);
      console.log(`🔗 [Edge ${i}] target: ${targetUUID} (from ${nextMedia.sourceDreamNodeId}/${truncatedNextPath})`);

      // Skip self-loops
      if (sourceUUID === targetUUID) {
        console.log(`⚠️ [Edge ${i}] SKIPPED (self-loop): ${sourceUUID} === ${targetUUID}`);
        continue;
      }

      // Create forward edge
      edges.push({
        source: sourceUUID,
        target: targetUUID,
        dreamSongId: `${sourceDreamNodeId}:${path.basename(dreamSongPath)}`,
        dreamSongPath,
        sequenceIndex: i,
        weight: 1.0
      });

      // Create backward edge if configured
      if (config.createBidirectionalEdges) {
        edges.push({
          source: targetUUID,
          target: sourceUUID,
          dreamSongId: `${sourceDreamNodeId}:${path.basename(dreamSongPath)}`,
          dreamSongPath,
          sequenceIndex: i,
          weight: 1.0
        });
      }
    }

    console.log(`✨ [DreamSong Relationships] Created ${edges.length} edges from ${dreamSongPath}`);
    return edges;
  }

  /**
   * Resolve a media file path to its parent DreamNode UUID
   */
  private resolveMediaPathToUUID(
    extractedSourceId: string | undefined,
    mediaPath: string,
    currentDreamNodeId: string,
    uuidToPathMap: Map<string, string>
  ): string {
    // Skip data URLs entirely - they're embedded media, not node references
    if (mediaPath.startsWith('data:')) {
      return currentDreamNodeId;
    }

    // If we have an extracted source ID (e.g., from submodule path), try to find it
    if (extractedSourceId) {
      // First, try exact UUID match
      if (uuidToPathMap.has(extractedSourceId)) {
        return extractedSourceId;
      }

      // Then try to find by repo name (submodule name)
      for (const [uuid, repoPath] of uuidToPathMap) {
        if (path.basename(repoPath) === extractedSourceId) {
          return uuid;
        }
      }

      // Only warn for real file paths, not data URLs
      console.warn(`⚠️ [DreamSong Relationships] Could not resolve extracted source ID: ${extractedSourceId} for path: ${mediaPath}`);
    }

    // Fallback to current DreamNode ID for local files
    return currentDreamNodeId;
  }

  /**
   * Phase 3: Build final relationship graph structure
   */
  private buildRelationshipGraph(
    dreamNodes: DreamNode[],
    edges: DreamSongEdge[]
  ): DreamSongRelationshipGraph {
    // Create nodes map
    const nodesMap = new Map<string, DreamSongNode>();

    // Count references for each node
    const incomingCounts = new Map<string, number>();
    const outgoingCounts = new Map<string, number>();
    const dreamSongSources = new Set<string>();

    for (const edge of edges) {
      incomingCounts.set(edge.target, (incomingCounts.get(edge.target) || 0) + 1);
      outgoingCounts.set(edge.source, (outgoingCounts.get(edge.source) || 0) + 1);
      dreamSongSources.add(edge.dreamSongId.split(':')[0]); // Extract DreamNode ID from dreamSongId
    }

    // Convert DreamNodes to DreamSongNodes
    let standaloneNodes = 0;
    for (const dreamNode of dreamNodes) {
      const hasIncoming = incomingCounts.has(dreamNode.id);
      const hasOutgoing = outgoingCounts.has(dreamNode.id);
      const isStandalone = !hasIncoming && !hasOutgoing;

      if (isStandalone) {
        standaloneNodes++;
      }

      nodesMap.set(dreamNode.id, {
        id: dreamNode.id,
        dreamNodePath: dreamNode.repoPath,
        title: dreamNode.name,
        type: dreamNode.type,
        isStandalone,
        incomingReferences: incomingCounts.get(dreamNode.id) || 0,
        outgoingDreamSongs: dreamSongSources.has(dreamNode.id) ? 1 : 0
      });
    }

    return {
      nodes: nodesMap,
      edges,
      metadata: {
        totalNodes: dreamNodes.length,
        totalDreamSongs: dreamSongSources.size,
        totalEdges: edges.length,
        standaloneNodes,
        lastScanned: Date.now()
      }
    };
  }

  /**
   * Clean up dangling relationship references (internal method, no UI notifications)
   * Called automatically during vault scan
   */
  // Removed cleanDanglingRelationshipsInternal() - no longer needed with liminal-web.json approach
  // Relationships are now stored in liminal-web.json (Dreamer nodes only), not in .udd files
}