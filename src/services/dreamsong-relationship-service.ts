import { Plugin } from 'obsidian';
import { GitDreamNodeService } from './git-dreamnode-service';
import { DreamSongParserService } from './dreamsong-parser-service';
import { VaultService } from './vault-service';
import { CanvasParserService } from './canvas-parser-service';
import { DreamNode } from '../types/dreamnode';
import { DreamSongData, DreamSongBlock } from '../types/dreamsong';
import {
  DreamSongRelationshipGraph,
  DreamSongNode,
  DreamSongEdge,
  DreamSongScanResult,
  DreamSongRelationshipConfig,
  DEFAULT_DREAMSONG_RELATIONSHIP_CONFIG,
  serializeRelationshipGraph
} from '../types/constellation';

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
      // Phase 0: Clean up dangling relationship references FIRST
      console.log('🧹 [DreamSong Relationships] Cleaning dangling relationship references...');
      await this.cleanDanglingRelationshipsInternal();

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
    // the entire realNodes Map, losing any media that was already loaded
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

    // Filter to only media blocks that have sourceDreamNodeId
    const mediaBlocks = dreamSongData.blocks
      .filter((block: DreamSongBlock) =>
        block.media && block.media.sourceDreamNodeId
      )
      .map((block: DreamSongBlock) => ({
        sourceDreamNodeId: block.media!.sourceDreamNodeId,
        mediaPath: block.media!.src
      }));

    if (mediaBlocks.length < config.minSequenceLength) {
      console.log(`📏 [DreamSong Relationships] Skipping ${dreamSongPath}: sequence too short (${mediaBlocks.length})`);
      return edges;
    }

    console.log(`🔗 [DreamSong Relationships] Processing sequence of ${mediaBlocks.length} media blocks`);
    console.log(`🔍 [DreamSong Relationships] Media blocks:`, mediaBlocks.map(b => ({
      sourceDreamNodeId: b.sourceDreamNodeId,
      mediaPath: b.mediaPath
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

      console.log(`🔗 [Edge ${i}] source: ${sourceUUID} (from ${currentMedia.sourceDreamNodeId}/${currentMedia.mediaPath})`);
      console.log(`🔗 [Edge ${i}] target: ${targetUUID} (from ${nextMedia.sourceDreamNodeId}/${nextMedia.mediaPath})`);

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
  private async cleanDanglingRelationshipsInternal(): Promise<void> {
    try {
      const vaultPath = this.vaultService.getVaultPath();
      const fsPromises = fs.promises;

      // Get all DreamNode directories
      const entries = await fsPromises.readdir(vaultPath, { withFileTypes: true });
      const dreamNodeDirs = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const dirPath = path.join(vaultPath, entry.name);
        const uddPath = path.join(dirPath, '.udd');
        const gitPath = path.join(dirPath, '.git');

        try {
          await fsPromises.access(uddPath);
          await fsPromises.access(gitPath);
          dreamNodeDirs.push({ name: entry.name, path: dirPath });
        } catch {
          continue;
        }
      }

      // Load all UDD files in parallel
      const uddDataMap = new Map<string, { uuid: string; relationships: string[]; path: string; dirName: string }>();

      await Promise.all(
        dreamNodeDirs.map(async ({ name, path: dirPath }) => {
          try {
            const uddPath = path.join(dirPath, '.udd');
            const uddContent = await fsPromises.readFile(uddPath, 'utf-8');
            const udd = JSON.parse(uddContent);

            uddDataMap.set(udd.uuid, {
              uuid: udd.uuid,
              relationships: udd.liminalWebRelationships || [],
              path: uddPath,
              dirName: name
            });
          } catch (error) {
            // Skip invalid UDD files
          }
        })
      );

      // Build set of valid UUIDs
      const validUuids = new Set(uddDataMap.keys());

      // Find and clean dangling references
      const nodesToClean = new Map<string, Set<string>>();

      for (const [uuid, data] of uddDataMap) {
        const danglingRefs = new Set<string>();

        for (const relatedUuid of data.relationships) {
          if (!validUuids.has(relatedUuid)) {
            danglingRefs.add(relatedUuid);
          }
        }

        if (danglingRefs.size > 0) {
          nodesToClean.set(uuid, danglingRefs);
        }
      }

      if (nodesToClean.size === 0) {
        console.log('✓ [DreamSong Relationships] No dangling references found');
        return;
      }

      let totalRemoved = 0;

      // Clean up in parallel
      await Promise.all(
        Array.from(nodesToClean.entries()).map(async ([uuid, danglingRefs]) => {
          try {
            const data = uddDataMap.get(uuid);
            if (!data) return;

            const uddContent = await fsPromises.readFile(data.path, 'utf-8');
            const udd = JSON.parse(uddContent);

            const cleanedRelationships = (udd.liminalWebRelationships || []).filter(
              (refUuid: string) => !danglingRefs.has(refUuid)
            );

            const removedCount = (udd.liminalWebRelationships || []).length - cleanedRelationships.length;
            totalRemoved += removedCount;

            udd.liminalWebRelationships = cleanedRelationships;

            await fsPromises.writeFile(data.path, JSON.stringify(udd, null, 2));

            console.log(`🧹 [DreamSong Relationships] Cleaned ${data.dirName} - removed ${removedCount} dangling references`);
          } catch (error) {
            console.error(`❌ [DreamSong Relationships] Error cleaning ${uuid}:`, error);
          }
        })
      );

      console.log(`✅ [DreamSong Relationships] Removed ${totalRemoved} dangling references from ${nodesToClean.size} nodes`);

    } catch (error) {
      console.error('❌ [DreamSong Relationships] Cleanup failed:', error);
      // Don't throw - this is a cleanup step that shouldn't fail the main scan
    }
  }
}