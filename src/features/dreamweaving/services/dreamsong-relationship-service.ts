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

  // Cache for submodule lookups within a single scan
  private submoduleCache: Map<string, Set<string>> = new Map();

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
   * Compute a hash of the submodule structure across all DreamNodes.
   * This hash changes when submodules are added or removed.
   */
  async computeSubmoduleStructureHash(dreamNodes: DreamNode[]): Promise<string> {
    const submoduleLists: string[] = [];

    for (const node of dreamNodes) {
      try {
        const entries = await this.vaultService.readdir(node.repoPath);
        const submodules: string[] = [];

        for (const entry of entries) {
          // Skip hidden directories and files
          if (entry.name.startsWith('.')) continue;
          if (!entry.isDirectory()) continue;

          // Check if this folder contains .udd (proving it's a DreamNode submodule)
          const uddPath = `${node.repoPath}/${entry.name}/.udd`;
          const exists = await this.vaultService.fileExists(uddPath);
          if (exists) {
            submodules.push(entry.name);
          }
        }

        if (submodules.length > 0) {
          submoduleLists.push(`${node.id}:${submodules.sort().join(',')}`);
        }
      } catch (error) {
        // Node folder might not exist, skip
        continue;
      }
    }

    return this.hashString(submoduleLists.sort().join('|'));
  }

  /**
   * Simple string hash (djb2 algorithm)
   */
  private hashString(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Get the submodules of a DreamNode (cached per scan)
   */
  private async getSubmodules(dreamNodePath: string): Promise<Set<string>> {
    if (this.submoduleCache.has(dreamNodePath)) {
      return this.submoduleCache.get(dreamNodePath)!;
    }

    const submodules = new Set<string>();
    try {
      const entries = await this.vaultService.readdir(dreamNodePath);
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (!entry.isDirectory()) continue;

        const uddPath = `${dreamNodePath}/${entry.name}/.udd`;
        const exists = await this.vaultService.fileExists(uddPath);
        if (exists) {
          submodules.add(entry.name);
        }
      }
    } catch (error) {
      // Folder might not exist
    }

    this.submoduleCache.set(dreamNodePath, submodules);
    return submodules;
  }

  /**
   * Check if a file path references a submodule and return the submodule folder name.
   *
   * Canvas file paths can be in two formats:
   * 1. Relative from parent: "SubmoduleFolder/file.png" (first segment is submodule)
   * 2. Absolute from vault root: "ParentNode/SubmoduleFolder/file.png" (second segment is submodule)
   *
   * We check both the first segment AND any segment that matches a known submodule.
   */
  private async isSubmoduleReference(
    parentDreamNodePath: string,
    filePath: string
  ): Promise<{ isSubmodule: boolean; submoduleFolderName: string | null }> {
    const parts = filePath.split('/');
    if (parts.length === 0) return { isSubmodule: false, submoduleFolderName: null };

    // Get submodules for this DreamNode
    const submodules = await this.getSubmodules(parentDreamNodePath);

    if (submodules.size === 0) {
      return { isSubmodule: false, submoduleFolderName: null };
    }

    // Check each path segment to see if it matches a submodule
    // This handles both relative paths (Submodule/file) and absolute paths (Parent/Submodule/file)
    for (const segment of parts) {
      if (submodules.has(segment)) {
        return { isSubmodule: true, submoduleFolderName: segment };
      }
    }

    return { isSubmodule: false, submoduleFolderName: null };
  }

  /**
   * Find all canvas files at the root of a DreamNode
   */
  private async findCanvasFilesAtRoot(dreamNodePath: string): Promise<string[]> {
    try {
      const entries = await this.vaultService.readdir(dreamNodePath);
      return entries
        .filter(e => e.isFile() && e.name.endsWith('.canvas'))
        .map(e => `${dreamNodePath}/${e.name}`);
    } catch (error) {
      return [];
    }
  }

  /**
   * Main entry point: Scan entire vault for DreamSong relationships
   */
  async scanVaultForDreamSongRelationships(
    config: DreamSongRelationshipConfig = DEFAULT_DREAMSONG_RELATIONSHIP_CONFIG
  ): Promise<DreamSongScanResult> {
    const startTime = Date.now();
    console.log('[DreamSong] ▶ SCAN START');

    // Clear submodule cache at start of scan
    this.submoduleCache.clear();

    try {
      // Phase 1: Discover all DreamNodes and build UUID mapping
      console.log('[DreamSong] Phase 1: Discovering DreamNodes...');
      const { dreamNodes, uuidToPathMap, pathToUuidMap } = await this.discoverAllDreamNodes();
      console.log(`[DreamSong] Phase 1 complete: ${dreamNodes.length} nodes`);

      // Phase 2: Scan ALL canvas files (not just DreamSong.canvas) and extract submodule-based relationships
      console.log('[DreamSong] Phase 2: Extracting submodule relationships from all canvases...');
      const { edges, canvasesFound, canvasesParsed } = await this.extractAllSubmoduleRelationships(
        dreamNodes,
        pathToUuidMap,
        config
      );
      console.log(`[DreamSong] Phase 2 complete: ${edges.length} edges from ${canvasesParsed}/${canvasesFound} canvases`);

      // Phase 3: Build final graph structure
      console.log('[DreamSong] Phase 3: Building graph...');
      const graph = this.buildRelationshipGraph(dreamNodes, edges);
      console.log(`[DreamSong] Phase 3 complete: graph built`);

      const scanTimeMs = Date.now() - startTime;

      // Clear cache after scan
      this.submoduleCache.clear();

      return {
        success: true,
        graph,
        stats: {
          nodesScanned: dreamNodes.length,
          dreamSongsFound: canvasesFound, // Using canvas count since we scan all canvases now
          dreamSongsParsed: canvasesParsed,
          edgesCreated: edges.length,
          scanTimeMs
        }
      };

    } catch (error) {
      console.error('[DreamSong] Scan failed:', error instanceof Error ? error.message : error);
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

    } catch (error) {
      console.error('[DreamSong] Export failed:', error instanceof Error ? error.message : error);
      throw error;
    }
  }

  /**
   * Phase 1: Discover all DreamNodes and create UUID mapping
   */
  private async discoverAllDreamNodes(): Promise<{
    dreamNodes: DreamNode[];
    uuidToPathMap: Map<string, string>;
    pathToUuidMap: Map<string, string>;
  }> {
    // NOTE: Vault scan removed - already done during plugin initialization
    // Calling scanVault() here was causing media to disappear because it replaced
    // the entire dreamNodes Map, losing any media that was already loaded
    // The vault scan during plugin init is sufficient - we just use that data

    // Get all DreamNodes from the service (uses existing store data)
    const dreamNodes = await this.dreamNodeService.list();

    // Build UUID to path mapping for media resolution
    const uuidToPathMap = new Map<string, string>();
    const pathToUuidMap = new Map<string, string>();
    for (const node of dreamNodes) {
      uuidToPathMap.set(node.id, node.repoPath);
      // Map both full path and folder name for flexible lookup
      pathToUuidMap.set(node.repoPath, node.id);
      const folderName = node.repoPath.split('/').pop();
      if (folderName) {
        pathToUuidMap.set(folderName, node.id);
      }
    }

    return { dreamNodes, uuidToPathMap, pathToUuidMap };
  }

  /**
   * Helper: Process items in batches to avoid overwhelming the system
   * Yields to main thread between batches to prevent UI freezing
   */
  private async processBatched<T, R>(
    items: T[],
    batchSize: number,
    processor: (item: T) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(item => processor(item).catch(() => null as unknown as R))
      );
      results.push(...batchResults);

      // Yield to main thread between batches to keep UI responsive
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    return results;
  }

  /**
   * Phase 2: Extract submodule-based relationships from ALL canvas files
   * An edge is created when a canvas references media from a submodule folder
   */
  private async extractAllSubmoduleRelationships(
    dreamNodes: DreamNode[],
    pathToUuidMap: Map<string, string>,
    config: DreamSongRelationshipConfig
  ): Promise<{
    edges: DreamSongEdge[];
    canvasesFound: number;
    canvasesParsed: number;
  }> {
    const BATCH_SIZE = 5;
    let processedCount = 0;

    console.log(`[DreamSong] Phase 2a: Finding all canvas files in ${dreamNodes.length} nodes...`);

    // Discover all canvas files at root of each DreamNode
    const canvasDiscoveries = await this.processBatched(
      dreamNodes,
      BATCH_SIZE,
      async (node) => {
        processedCount++;
        if (processedCount % 20 === 0) {
          console.log(`[DreamSong] Phase 2a progress: ${processedCount}/${dreamNodes.length}`);
        }
        const canvasPaths = await this.findCanvasFilesAtRoot(node.repoPath);
        return { node, canvasPaths };
      }
    );

    // Flatten to list of {node, canvasPath}
    const canvasesToParse: Array<{ node: DreamNode; canvasPath: string }> = [];
    for (const discovery of canvasDiscoveries) {
      if (discovery !== null) {
        for (const canvasPath of discovery.canvasPaths) {
          canvasesToParse.push({ node: discovery.node, canvasPath });
        }
      }
    }

    const canvasesFound = canvasesToParse.length;
    console.log(`[DreamSong] Phase 2a complete: Found ${canvasesFound} canvas files`);

    // Parse all canvas files and extract submodule-based edges
    processedCount = 0;
    console.log(`[DreamSong] Phase 2b: Parsing ${canvasesFound} canvas files...`);

    const parseResults = await this.processBatched(
      canvasesToParse,
      BATCH_SIZE,
      async ({ node, canvasPath }) => {
        processedCount++;
        if (processedCount % 10 === 0) {
          console.log(`[DreamSong] Phase 2b: Parsing ${processedCount}/${canvasesFound}`);
        }

        try {
          const edges = await this.extractSubmoduleEdgesFromCanvas(
            node,
            canvasPath,
            pathToUuidMap,
            config
          );
          return { success: true, edges };
        } catch (err) {
          console.warn(`[DreamSong] Failed to parse ${canvasPath}:`, err);
          return { success: false, edges: [] as DreamSongEdge[] };
        }
      }
    );

    // Aggregate results
    const allEdges: DreamSongEdge[] = [];
    let canvasesParsed = 0;

    for (const result of parseResults) {
      if (result !== null && result.success) {
        canvasesParsed++;
        allEdges.push(...result.edges);
      }
    }

    return { edges: allEdges, canvasesFound, canvasesParsed };
  }

  /**
   * Extract edges from a canvas file based on submodule references.
   * An edge connects the referenced submodule DreamNodes (siblings), not the parent.
   */
  private async extractSubmoduleEdgesFromCanvas(
    parentNode: DreamNode,
    canvasPath: string,
    pathToUuidMap: Map<string, string>,
    config: DreamSongRelationshipConfig
  ): Promise<DreamSongEdge[]> {
    const edges: DreamSongEdge[] = [];

    // Read canvas JSON directly - no media loading
    const canvasContent = await this.vaultService.readFile(canvasPath);
    const canvas = JSON.parse(canvasContent);

    if (!canvas.nodes || canvas.nodes.length === 0) {
      return edges;
    }

    // Extract file nodes and check which reference submodules
    const fileNodes = canvas.nodes
      .filter((node: { type: string; file?: string }) => node.type === 'file' && node.file)
      .map((node: { id: string; file: string; y: number }) => ({
        id: node.id,
        file: node.file,
        y: node.y // Use y-position for ordering (top to bottom)
      }))
      .sort((a: { y: number }, b: { y: number }) => a.y - b.y);

    if (fileNodes.length === 0) {
      return edges;
    }

    // Resolve file paths to submodule DreamNode UUIDs
    const resolvedNodes: { uuid: string; path: string }[] = [];

    for (const fileNode of fileNodes) {
      const { isSubmodule, submoduleFolderName } = await this.isSubmoduleReference(
        parentNode.repoPath,
        fileNode.file
      );

      if (isSubmodule && submoduleFolderName) {
        // Look up the UUID of the submodule DreamNode
        const submodulePath = `${parentNode.repoPath}/${submoduleFolderName}`;
        let uuid = pathToUuidMap.get(submodulePath);

        // Also try just the folder name
        if (!uuid) {
          uuid = pathToUuidMap.get(submoduleFolderName);
        }

        if (uuid) {
          resolvedNodes.push({ uuid, path: fileNode.file });
        }
      }
    }

    if (resolvedNodes.length < config.minSequenceLength) {
      if (resolvedNodes.length > 0) {
        console.log(`[DreamSong] Canvas ${canvasPath}: ${resolvedNodes.length} submodule refs (< minSeq ${config.minSequenceLength})`);
      }
      return edges;
    }

    console.log(`[DreamSong] Canvas ${canvasPath}: found ${resolvedNodes.length} submodule references`);

    // Create edges from sequential pairs of submodule references
    for (let i = 0; i < resolvedNodes.length - 1 && edges.length < config.maxEdgesPerDreamSong; i++) {
      const source = resolvedNodes[i].uuid;
      const target = resolvedNodes[i + 1].uuid;

      // Skip self-loops
      if (source === target) continue;

      edges.push({
        source,
        target,
        dreamSongId: parentNode.id,
        dreamSongPath: canvasPath,
        sequenceIndex: i
      });
    }

    if (edges.length > 0) {
      console.log(`[DreamSong] Canvas ${canvasPath}: created ${edges.length} edges`);
    }

    return edges;
  }

  /**
   * Phase 2 (LEGACY): Extract relationships from all DreamSongs
   * OPTIMIZED: Uses batched parallel I/O to avoid overwhelming the system
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
    // Very small batch size to minimize memory pressure
    const BATCH_SIZE = 5;
    let processedCount = 0;

    console.log(`[DreamSong] Phase 2a: Checking ${dreamNodes.length} nodes for DreamSongs...`);

    // Check all DreamSongs in batches
    const dreamSongChecks = await this.processBatched(
      dreamNodes,
      BATCH_SIZE,
      async (node) => {
        processedCount++;
        if (processedCount % 20 === 0) {
          console.log(`[DreamSong] Phase 2a progress: ${processedCount}/${dreamNodes.length}`);
        }
        return {
          node,
          hasDreamSong: await this.dreamSongParser.hasDreamSong(node.repoPath)
        };
      }
    );

    // Filter to only nodes with DreamSongs (filter out null from error catches)
    const nodesWithDreamSongs = dreamSongChecks
      .filter((check): check is { node: DreamNode; hasDreamSong: boolean } =>
        check !== null && check.hasDreamSong
      )
      .map(check => check.node);

    const dreamSongsFound = nodesWithDreamSongs.length;
    console.log(`[DreamSong] Phase 2a complete: Found ${dreamSongsFound} DreamSongs`);

    // Parse all DreamSongs in batches
    processedCount = 0;
    console.log(`[DreamSong] Phase 2b: Parsing ${dreamSongsFound} DreamSongs...`);

    const parseResults = await this.processBatched(
      nodesWithDreamSongs,
      BATCH_SIZE,
      async (dreamNode) => {
        processedCount++;
        console.log(`[DreamSong] Phase 2b: Parsing ${processedCount}/${dreamSongsFound}: ${dreamNode.name}`);

        const dreamSongPath = `${dreamNode.repoPath}/DreamSong.canvas`;

        try {
          // LIGHTWEIGHT: Extract relationships directly from canvas JSON
          // without loading media into memory (which was causing crashes)
          const edges = await this.extractRelationshipsFromCanvasLightweight(
            dreamNode.id,
            dreamSongPath,
            uuidToPathMap,
            config
          );

          return { success: true, edges };

        } catch (err) {
          console.warn(`[DreamSong] Failed to parse ${dreamNode.name}:`, err);
          return { success: false, edges: [] as DreamSongEdge[] };
        }
      }
    );

    // Aggregate results (filter out null from error catches)
    const allEdges: DreamSongEdge[] = [];
    let dreamSongsParsed = 0;

    for (const result of parseResults) {
      if (result !== null && result.success) {
        dreamSongsParsed++;
        allEdges.push(...result.edges);
      }
    }

    return { edges: allEdges, dreamSongsFound, dreamSongsParsed };
  }

  /**
   * Extract relationships from a single DreamSong's media sequence
   */
  /**
   * LIGHTWEIGHT: Extract relationships directly from canvas JSON without loading media
   * This avoids the memory-heavy parseDreamSong which converts media to data URLs
   */
  private async extractRelationshipsFromCanvasLightweight(
    sourceDreamNodeId: string,
    dreamSongPath: string,
    uuidToPathMap: Map<string, string>,
    config: DreamSongRelationshipConfig
  ): Promise<DreamSongEdge[]> {
    const edges: DreamSongEdge[] = [];

    // Read canvas JSON directly - no media loading
    const canvasContent = await this.vaultService.readFile(dreamSongPath);
    const canvas = JSON.parse(canvasContent);

    if (!canvas.nodes || canvas.nodes.length === 0) {
      return edges;
    }

    // Extract file nodes that reference media in other DreamNodes
    const fileNodes = canvas.nodes
      .filter((node: { type: string; file?: string }) => node.type === 'file' && node.file)
      .map((node: { id: string; file: string; y: number }) => ({
        id: node.id,
        file: node.file,
        y: node.y // Use y-position for ordering (top to bottom)
      }))
      .sort((a: { y: number }, b: { y: number }) => a.y - b.y); // Sort by vertical position

    if (fileNodes.length < config.minSequenceLength) {
      return edges;
    }

    // Resolve file paths to DreamNode UUIDs and create edges
    const resolvedNodes: { uuid: string; path: string }[] = [];

    for (const fileNode of fileNodes) {
      const uuid = this.resolveFilePathToUUID(fileNode.file, uuidToPathMap);
      if (uuid) {
        resolvedNodes.push({ uuid, path: fileNode.file });
      }
    }

    // Create edges from sequential pairs
    for (let i = 0; i < resolvedNodes.length - 1 && edges.length < config.maxEdgesPerDreamSong; i++) {
      const source = resolvedNodes[i].uuid;
      const target = resolvedNodes[i + 1].uuid;

      // Skip self-loops
      if (source === target) continue;

      edges.push({
        source,
        target,
        dreamSongId: sourceDreamNodeId,
        dreamSongPath: dreamSongPath,
        sequenceIndex: i
      });
    }

    return edges;
  }

  /**
   * Resolve a canvas file path to a DreamNode UUID
   */
  private resolveFilePathToUUID(
    filePath: string,
    uuidToPathMap: Map<string, string>
  ): string | null {
    // File paths in canvas are like "NodeName/DreamTalk.png" or "../NodeName/media/file.mp4"
    // Extract the DreamNode folder name
    const parts = filePath.split('/');

    // Find the DreamNode by matching path segments
    for (const [uuid, repoPath] of uuidToPathMap) {
      const repoName = repoPath.split('/').pop();
      if (repoName && parts.includes(repoName)) {
        return uuid;
      }
    }

    return null;
  }

  // Keep original method for reference but it's no longer used
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
      return edges;
    }

    // Create edges from sequential pairs
    for (let i = 0; i < mediaBlocks.length - 1; i++) {
      if (edges.length >= config.maxEdgesPerDreamSong) {
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

      // Skip self-loops
      if (sourceUUID === targetUUID) {
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
      // Could not resolve - will fallback to current DreamNode ID
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