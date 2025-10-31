import { VaultService } from './vault-service';
import { CanvasParserService, CanvasData, CanvasNode, CanvasEdge } from './canvas-parser-service';

// Access Node.js modules directly in Electron context (following VaultService pattern)
 
const fs = require('fs');
const path = require('path');
 
import { 
  DreamSongData, 
  DreamSongBlock, 
  DreamSongParseResult, 
  DreamSongParseError,
  DreamSongParserConfig,
  DEFAULT_DREAMSONG_PARSER_CONFIG,
  TopologicalSortResult,
  ProcessedCanvasEdge,
  MediaTextPair,
  MediaInfo
} from '../types/dreamsong';
import { InterBrainState } from '../store/interbrain-store';

/**
 * DreamSong Parser Service
 * 
 * Parses Obsidian canvas files to generate linear story flows for DreamNode flip interfaces.
 * Uses Kahn's algorithm for topological sorting of canvas dependency graphs.
 * Creates flip-flop layout with alternating media-text positioning.
 */
export class DreamSongParserService {
  private parseCache = new Map<string, DreamSongData>();

  constructor(
    private vaultService: VaultService,
    private canvasParser: CanvasParserService,
    private config: DreamSongParserConfig = DEFAULT_DREAMSONG_PARSER_CONFIG
  ) {}

  /**
   * Generate structure hash for smart cache invalidation
   * Ignores cosmetic changes (XY coordinates) but captures structural changes
   */
  async generateStructureHash(canvasPath: string): Promise<string | null> {
    try {
      // Check if canvas file exists
      const canvasExists = await this.vaultService.fileExists(canvasPath);
      if (!canvasExists) {
        return null;
      }

      // Parse canvas data
      const canvasData = await this.canvasParser.parseCanvas(canvasPath);
      
      if (!canvasData.nodes || canvasData.nodes.length === 0) {
        return 'empty-canvas'; // Special hash for empty canvas
      }

      // Create structure fingerprint - only the parts that affect DreamSong output
      const structureData = {
        // Node content (excluding position)
        nodes: canvasData.nodes.map(node => ({
          id: node.id,
          text: node.text || '',
          file: node.file || '',
          type: node.type,
          width: node.width, // Size matters for layout
          height: node.height
          // Deliberately exclude x, y coordinates
        })).sort((a, b) => a.id.localeCompare(b.id)), // Sort for consistency
        
        // Edge relationships (structure)
        edges: canvasData.edges.map(edge => ({
          id: edge.id,
          fromNode: edge.fromNode,
          toNode: edge.toNode,
          toEnd: edge.toEnd
        })).sort((a, b) => a.id.localeCompare(b.id)) // Sort for consistency
      };

      // Generate hash from structure data
      const structureString = JSON.stringify(structureData);
      
      // Simple hash function (could use crypto.createHash for more robust hashing)
      let hash = 0;
      for (let i = 0; i < structureString.length; i++) {
        const char = structureString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      
      return hash.toString(36); // Base36 for shorter string
      
    } catch (error) {
      console.error('Failed to generate structure hash:', error);
      return null;
    }
  }

  /**
   * Parse a DreamSong canvas file with intelligent L1/L2 caching
   * L1: In-memory parseCache (fast, per-service instance)
   * L2: Zustand persistent cache (persistent across sessions)
   */
  async parseDreamSongWithCache(
    canvasPath: string, 
    dreamNodePath: string, 
    nodeId: string,
    zustandStore?: InterBrainState
  ): Promise<DreamSongParseResult> {
    try {
      // Generate structure hash for cache invalidation
      const structureHash = await this.generateStructureHash(canvasPath);
      
      if (!structureHash) {
        return this.createErrorResult('parsing_error', 'Could not generate structure hash', canvasPath);
      }
      
      const cacheKey = `${nodeId}_${structureHash}`;
      
      // L1 Cache check (in-memory, fastest)
      if (this.parseCache.has(cacheKey)) {
        console.log(`⚡ DreamSong L1 cache HIT: ${cacheKey}`);
        return {
          success: true,
          data: this.parseCache.get(cacheKey)!
        };
      }
      
      // L2 Cache check (Zustand persistent store)
      if (zustandStore) {
        const cachedEntry = zustandStore.getCachedDreamSong(nodeId, structureHash);
        if (cachedEntry) {
          console.log(`🚀 DreamSong L2 cache HIT: ${cacheKey}`);
          // Populate L1 cache for next time
          this.parseCache.set(cacheKey, cachedEntry.data);
          return {
            success: true,
            data: cachedEntry.data
          };
        }
      }
      
      // Cache miss - parse from scratch
      console.log(`📝 DreamSong cache MISS: ${cacheKey} - parsing...`);
      const result = await this.parseDreamSong(canvasPath, dreamNodePath);
      
      if (result.success && result.data) {
        // Store in L1 cache
        this.parseCache.set(cacheKey, result.data);
        
        // Store in L2 cache (Zustand)
        if (zustandStore) {
          zustandStore.setCachedDreamSong(nodeId, structureHash, result.data);
        }
        
        console.log(`✅ DreamSong parsed and cached: ${cacheKey}`);
      }
      
      return result;
      
    } catch (error) {
      console.error('Error in parseDreamSongWithCache:', error);
      return this.createErrorResult('parsing_error', `Parse error: ${error}`, canvasPath);
    }
  }
  
  /**
   * Parse a DreamSong canvas file and return structured story flow
   * (Original method - kept for direct usage without caching)
   */
  async parseDreamSong(canvasPath: string, dreamNodePath: string): Promise<DreamSongParseResult> {
    try {
      // Check if canvas file exists
      const canvasExists = await this.vaultService.fileExists(canvasPath);
      if (!canvasExists) {
        return this.createErrorResult('missing_canvas', `Canvas file not found: ${canvasPath}`, canvasPath);
      }

      // Parse canvas data
      const canvasData = await this.canvasParser.parseCanvas(canvasPath);

      // Validate canvas has content
      if (!canvasData.nodes || canvasData.nodes.length === 0) {
        return this.createErrorResult('empty_content', 'Canvas contains no nodes', canvasPath);
      }

      // Process canvas into story blocks
      const dreamSongData = await this.processCanvasIntoStory(canvasData, canvasPath, dreamNodePath);
      
      return {
        success: true,
        data: dreamSongData
      };

    } catch (error) {
      console.error(`❌ [DreamSong Parser] Error parsing ${canvasPath}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
      return this.createErrorResult('parsing_error', errorMessage, canvasPath);
    }
  }

  /**
   * Check if a DreamNode has a DreamSong canvas file
   */
  async hasDreamSong(dreamNodePath: string): Promise<boolean> {
    const canvasPath = `${dreamNodePath}/DreamSong.canvas`;
    const exists = await this.vaultService.fileExists(canvasPath);
    return exists;
  }

  /**
   * Get cached DreamSong data or parse if not cached
   */
  async getDreamSong(canvasPath: string, dreamNodePath: string): Promise<DreamSongData | null> {
    // Check cache first
    if (this.parseCache.has(canvasPath)) {
      return this.parseCache.get(canvasPath)!;
    }

    // Parse if not cached
    const result = await this.parseDreamSong(canvasPath, dreamNodePath);
    const success = result.success && result.data;
    return success ? result.data! : null;
  }

  /**
   * Clear parsing cache
   */
  clearCache(): void {
    this.parseCache.clear();
  }

  /**
   * Process canvas data into DreamSong story blocks
   */
  private async processCanvasIntoStory(
    canvasData: CanvasData, 
    canvasPath: string, 
    dreamNodePath: string
  ): Promise<DreamSongData> {

    // Process edges into directed and undirected categories
    const processedEdges = this.processCanvasEdges(canvasData.edges);
    
    // Find media-text pairs from undirected edges
    const mediaTextPairs = this.findMediaTextPairs(canvasData.nodes, processedEdges.undirected);
    
    // Perform topological sort on directed edges only
    const sortResult = this.topologicalSort(canvasData.nodes, processedEdges.directed);
    
    if (sortResult.hasCycle) {
      throw new Error(`Canvas contains circular dependencies: ${sortResult.nodesInCycle?.join(', ')}`);
    }


    // Create content blocks from sorted nodes
    const blocks = await this.createContentBlocks(
      canvasData.nodes,
      sortResult.sortedNodeIds,
      mediaTextPairs,
      dreamNodePath
    );

    return {
      canvasPath,
      dreamNodePath,
      blocks,
      totalBlocks: blocks.length,
      hasContent: blocks.length > 0,
      lastParsed: Date.now()
    };
  }

  /**
   * Process canvas edges into directed and undirected categories
   */
  private processCanvasEdges(edges: CanvasEdge[]): { directed: ProcessedCanvasEdge[], undirected: ProcessedCanvasEdge[] } {
    const directed: ProcessedCanvasEdge[] = [];
    const undirected: ProcessedCanvasEdge[] = [];

    for (const edge of edges) {
      const processedEdge: ProcessedCanvasEdge = {
        fromNodeId: edge.fromNode,
        toNodeId: edge.toNode,
        isDirected: edge.toEnd !== 'none', // Undirected edges have toEnd: 'none'
        edgeId: edge.id
      };

      if (processedEdge.isDirected) {
        directed.push(processedEdge);
      } else {
        undirected.push(processedEdge);
      }
    }

    console.log(`📊 [DreamSong Parser] Found ${directed.length} directed edges, ${undirected.length} undirected edges`);
    return { directed, undirected };
  }

  /**
   * Find media-text pairs connected by undirected edges
   */
  private findMediaTextPairs(nodes: CanvasNode[], undirectedEdges: ProcessedCanvasEdge[]): MediaTextPair[] {
    const pairs: MediaTextPair[] = [];
    const nodesMap = new Map(nodes.map(n => [n.id, n]));

    for (const edge of undirectedEdges) {
      const fromNode = nodesMap.get(edge.fromNodeId);
      const toNode = nodesMap.get(edge.toNodeId);

      if (!fromNode || !toNode) continue;

      // Check if one is file (media) and other is text
      let mediaNode: CanvasNode | null = null;
      let textNode: CanvasNode | null = null;

      if (fromNode.type === 'file' && toNode.type === 'text') {
        mediaNode = fromNode;
        textNode = toNode;
      } else if (fromNode.type === 'text' && toNode.type === 'file') {
        mediaNode = toNode;
        textNode = fromNode;
      }

      if (mediaNode && textNode) {
        pairs.push({
          mediaNodeId: mediaNode.id,
          textNodeId: textNode.id,
          edgeId: edge.edgeId
        });
      }
    }

    console.log(`🔗 [DreamSong Parser] Found ${pairs.length} media-text pairs`);
    return pairs;
  }

  /**
   * Kahn's algorithm for topological sorting
   */
  private topologicalSort(nodes: CanvasNode[], directedEdges: ProcessedCanvasEdge[]): TopologicalSortResult {
    console.log(`🔢 [DreamSong Parser] Starting topological sort with ${nodes.length} nodes`);

    // Build adjacency list and in-degree map
    const adjList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    const nodeIds = new Set(nodes.map(n => n.id));

    // Initialize
    for (const nodeId of nodeIds) {
      adjList.set(nodeId, []);
      inDegree.set(nodeId, 0);
    }

    // Process directed edges
    for (const edge of directedEdges) {
      if (nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId)) {
        adjList.get(edge.fromNodeId)!.push(edge.toNodeId);
        inDegree.set(edge.toNodeId, inDegree.get(edge.toNodeId)! + 1);
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    const sortedList: string[] = [];

    // Start with nodes that have no incoming edges, preserving original canvas order
    for (const node of nodes) {
      if (nodeIds.has(node.id) && inDegree.get(node.id) === 0) {
        queue.push(node.id);
      }
    }

    while (queue.length > 0) {
      const currentNode = queue.shift()!;
      sortedList.push(currentNode);

      // Process neighbors
      const neighbors = adjList.get(currentNode) || [];
      for (const neighbor of neighbors) {
        inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
        if (inDegree.get(neighbor) === 0) {
          queue.push(neighbor);
        }
      }
    }

    // Check for cycles
    const hasCycle = sortedList.length !== Array.from(nodeIds).length;
    const nodesInCycle = hasCycle ? 
      Array.from(nodeIds).filter(id => !sortedList.includes(id)) : 
      undefined;

    console.log(`🎯 [DreamSong Parser] Topological sort result: ${sortedList.length} nodes sorted, cycle: ${hasCycle}`);

    return {
      sortedNodeIds: sortedList,
      hasCycle,
      nodesInCycle
    };
  }

  /**
   * Create content blocks from sorted nodes and pairs
   */
  private async createContentBlocks(
    nodes: CanvasNode[],
    sortedNodeIds: string[],
    mediaTextPairs: MediaTextPair[],
    dreamNodePath: string
  ): Promise<DreamSongBlock[]> {
    const blocks: DreamSongBlock[] = [];
    const nodesMap = new Map(nodes.map(n => [n.id, n]));
    const processedNodes = new Set<string>();

    // Create pair lookup maps
    const pairsByMediaId = new Map<string, MediaTextPair>();
    const pairsByTextId = new Map<string, MediaTextPair>();
    
    for (const pair of mediaTextPairs) {
      pairsByMediaId.set(pair.mediaNodeId, pair);
      pairsByTextId.set(pair.textNodeId, pair);
    }

    let isLeftAligned = true; // Start with left alignment, then alternate

    for (const nodeId of sortedNodeIds) {
      if (processedNodes.has(nodeId)) continue;

      const node = nodesMap.get(nodeId);
      if (!node) continue;

      // Only process pairs when we hit the media node, not the text node
      // This ensures media-text blocks appear at the media node's position in topological order
      const mediaTextPair = node.type === 'file' ? pairsByMediaId.get(nodeId) : null;
      
      if (mediaTextPair && !processedNodes.has(mediaTextPair.mediaNodeId) && !processedNodes.has(mediaTextPair.textNodeId)) {
        // Create media-text block
        const mediaNode = nodesMap.get(mediaTextPair.mediaNodeId);
        const textNode = nodesMap.get(mediaTextPair.textNodeId);

        if (mediaNode && textNode) {
          const mediaInfo = await this.createMediaInfo(mediaNode, dreamNodePath);
          const textContent = this.processTextContent(textNode.text || '');

          if (mediaInfo) {
            blocks.push({
              id: `${mediaTextPair.mediaNodeId}-${mediaTextPair.textNodeId}`,
              type: 'media-text',
              media: mediaInfo,
              text: textContent,
              isLeftAligned: isLeftAligned
            });
          }

          processedNodes.add(mediaTextPair.mediaNodeId);
          processedNodes.add(mediaTextPair.textNodeId);
          isLeftAligned = !isLeftAligned; // Alternate for next media-text block
        }
      } else {
        // Create standalone block
        if (node.type === 'file') {
          const mediaInfo = await this.createMediaInfo(node, dreamNodePath);
          if (mediaInfo) {
            blocks.push({
              id: nodeId,
              type: 'media',
              media: mediaInfo
            });
          }
        } else if (node.type === 'text' && node.text) {
          const textContent = this.processTextContent(node.text);
          if (textContent.trim()) {
            blocks.push({
              id: nodeId,
              type: 'text',
              text: textContent
            });
          }
        }

        processedNodes.add(nodeId);
      }
    }

    // Respect max blocks limit
    const finalBlocks = blocks.slice(0, this.config.maxBlocksToRender);
    console.log(`📝 [DreamSong Parser] Created ${finalBlocks.length} content blocks`);
    
    return finalBlocks;
  }

  /**
   * Create media info from file node with proper path resolution
   */
  private async createMediaInfo(fileNode: CanvasNode, dreamNodePath: string): Promise<MediaInfo | null> {
    if (!fileNode.file) return null;

    const filename = fileNode.file;
    const extension = filename.split('.').pop()?.toLowerCase() || '';

    let mediaType: 'video' | 'image' | 'audio' | 'pdf';
    if (['mp4', 'webm', 'ogg', 'mov'].includes(extension)) {
      mediaType = 'video';
    } else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(extension)) {
      mediaType = 'image';
    } else if (['mp3', 'wav', 'ogg', 'm4a'].includes(extension)) {
      mediaType = 'audio';
    } else if (extension === 'pdf') {
      mediaType = 'pdf';
    } else if (extension === 'link') {
      // .link files default to video type (YouTube links are primary use case)
      mediaType = 'video';
    } else {
      return null; // Unsupported media type
    }

    // Resolve file path to data URL (following DreamTalk pattern)
    const resolvedSrc = await this.resolveMediaPath(filename, dreamNodePath);
    if (!resolvedSrc) {
      console.warn(`🚫 [DreamSong Parser] Could not resolve media path: ${filename}`);
      return null;
    }

    // Extract source DreamNode ID from file path
    const sourceDreamNodeId = this.extractSourceDreamNodeId(filename, dreamNodePath);

    const mediaInfo = {
      type: mediaType,
      src: resolvedSrc,
      alt: this.createAltText(filename),
      sourceDreamNodeId
    };

    // Mark .link files for special handling by media resolver
    if (extension === 'link') {
      (mediaInfo as MediaInfo & { isLinkFile?: boolean }).isLinkFile = true;
    }

    return mediaInfo;
  }

  /**
   * Resolve media file path to data URL, following DreamTalk media pattern
   */
  private async resolveMediaPath(filename: string, _dreamNodePath: string): Promise<string | null> {
    // Canvas paths are already relative to the DreamNode, so just use them directly
    const filePath = filename;

    try {
      // Check if file exists in vault
      const exists = await this.vaultService.fileExists(filePath);
      if (!exists) {
        console.warn(`🚫 [DreamSong Parser] Media file not found: ${filePath}`);
        return null;
      }

      // Convert to data URL using same approach as DreamTalk media
      return await this.filePathToDataUrl(filePath);
      
    } catch (error) {
      console.error(`❌ [DreamSong Parser] Error resolving media path ${filename}:`, error);
      return null;
    }
  }

  /**
   * Convert file path to data URL using Node.js fs (following VaultService pattern)
   */
  private async filePathToDataUrl(filePath: string): Promise<string> {
    // Get full path using VaultService helper
    const fullPath = this.getFullPath(filePath);
    
    // Read file as binary using Node.js fs
    const buffer = fs.readFileSync(fullPath);
    
    // Convert to base64
    const base64 = buffer.toString('base64');
    
    // Get MIME type from file extension  
    const mimeType = this.getMimeType(filePath);
    
    // Create base64 data URL
    return `data:${mimeType};base64,${base64}`;
  }

  /**
   * Get full file system path (helper method following VaultService pattern)
   */
  private getFullPath(filePath: string): string {
    // Use VaultService to get vault path and construct full path
    const vaultPath = this.getVaultPath();
    if (!vaultPath) {
      console.warn('DreamSongParserService: Vault path not initialized, using relative path');
      return filePath;
    }
    return path.join(vaultPath, filePath);
  }

  /**
   * Get vault path from VaultService (helper method)
   */
  private getVaultPath(): string {
    // Use VaultService's public getVaultPath method
    return this.vaultService.getVaultPath();
  }

  /**
   * Get MIME type from file extension (same as GitDreamNodeService)
   */
  private getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.ogg': 'video/ogg',
      '.mov': 'video/quicktime',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4',
      '.pdf': 'application/pdf'
    };
    return mimeTypes[`.${ext}`] || 'application/octet-stream';
  }

  /**
   * Extract source DreamNode ID from media file path
   * Handles paths like "PlayPad/OtherDreamNode/media/file.mp4" for submodule references
   */
  private extractSourceDreamNodeId(filename: string, _currentDreamNodePath: string): string | undefined {
    // If path contains submodule reference (e.g., "PlayPad/OtherDreamNode/...")
    const submoduleMatch = filename.match(/^([^/]+)\/([^/]+)\//);
    if (submoduleMatch) {
      const submoduleName = submoduleMatch[2]; // "OtherDreamNode"
      return submoduleName; // Use submodule name as DreamNode ID
    }
    
    // If it's a local file (no submodule path), return undefined (not clickable)
    return undefined;
  }

  /**
   * Create alt text from filename
   */
  private createAltText(filename: string): string {
    const nameWithoutPath = filename.split('/').pop() || filename;
    const nameWithoutExtension = nameWithoutPath.split('.').slice(0, -1).join('.');
    
    return nameWithoutExtension
      .replace(/([A-Z])/g, ' $1')
      .replace(/[-_]/g, ' ')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  /**
   * Process text content (apply markdown parsing if enabled)
   */
  private processTextContent(text: string): string {
    if (!this.config.enableMarkdownParsing) {
      return text;
    }

    // For now, return as-is. In the future, we could integrate a markdown parser here
    // like marked.js, but keeping it simple for initial implementation
    return text;
  }

  /**
   * Create error result
   */
  private createErrorResult(
    type: DreamSongParseError['type'],
    message: string,
    canvasPath: string,
    nodeId?: string
  ): DreamSongParseResult {
    return {
      success: false,
      error: {
        type,
        message,
        canvasPath,
        nodeId
      }
    };
  }
}