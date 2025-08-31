import { VaultService } from './vault-service';
import { CanvasParserService, CanvasData, CanvasNode, CanvasEdge } from './canvas-parser-service';
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
   * Parse a DreamSong canvas file and return structured story flow
   */
  async parseDreamSong(canvasPath: string, dreamNodePath: string): Promise<DreamSongParseResult> {
    try {
      console.log(`📖 [DreamSong Parser] Parsing canvas: ${canvasPath}`);
      
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
      
      // Cache the result
      this.parseCache.set(canvasPath, dreamSongData);
      
      console.log(`✅ [DreamSong Parser] Successfully parsed ${dreamSongData.blocks.length} blocks`);
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
    console.log(`🔍 [DreamSong Parser] Checking for DreamSong at: "${canvasPath}"`);
    const exists = await this.vaultService.fileExists(canvasPath);
    console.log(`${exists ? '✅' : '❌'} [DreamSong Parser] DreamSong ${exists ? 'EXISTS' : 'NOT FOUND'} at: "${canvasPath}"`);
    return exists;
  }

  /**
   * Get cached DreamSong data or parse if not cached
   */
  async getDreamSong(canvasPath: string, dreamNodePath: string): Promise<DreamSongData | null> {
    console.log(`📖 [DreamSong Parser] Getting DreamSong for: "${canvasPath}"`);
    
    // Check cache first
    if (this.parseCache.has(canvasPath)) {
      console.log(`⚡ [DreamSong Parser] Using cached DreamSong data`);
      return this.parseCache.get(canvasPath)!;
    }

    // Parse if not cached
    console.log(`🔄 [DreamSong Parser] Parsing DreamSong (not cached)`);
    const result = await this.parseDreamSong(canvasPath, dreamNodePath);
    const success = result.success && result.data;
    console.log(`${success ? '✅' : '❌'} [DreamSong Parser] Parse result: ${success ? 'SUCCESS' : 'FAILED'}`);
    if (success) {
      console.log(`📊 [DreamSong Parser] DreamSong has ${result.data!.blocks.length} blocks, hasContent: ${result.data!.hasContent}`);
    }
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
    console.log(`🔄 [DreamSong Parser] Processing ${canvasData.nodes.length} nodes, ${canvasData.edges.length} edges`);

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
      mediaTextPairs
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

    // Start with nodes that have no incoming edges
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(nodeId);
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
    mediaTextPairs: MediaTextPair[]
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

      // Check if this node is part of a pair
      const mediaTextPair = pairsByMediaId.get(nodeId) || pairsByTextId.get(nodeId);
      
      if (mediaTextPair && !processedNodes.has(mediaTextPair.mediaNodeId) && !processedNodes.has(mediaTextPair.textNodeId)) {
        // Create media-text block
        const mediaNode = nodesMap.get(mediaTextPair.mediaNodeId);
        const textNode = nodesMap.get(mediaTextPair.textNodeId);

        if (mediaNode && textNode) {
          const mediaInfo = this.createMediaInfo(mediaNode);
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
          const mediaInfo = this.createMediaInfo(node);
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
   * Create media info from file node
   */
  private createMediaInfo(fileNode: CanvasNode): MediaInfo | null {
    if (!fileNode.file) return null;

    const filename = fileNode.file;
    const extension = filename.split('.').pop()?.toLowerCase() || '';

    let mediaType: 'video' | 'image' | 'audio';
    if (['mp4', 'webm', 'ogg', 'mov'].includes(extension)) {
      mediaType = 'video';
    } else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(extension)) {
      mediaType = 'image';
    } else if (['mp3', 'wav', 'ogg', 'm4a'].includes(extension)) {
      mediaType = 'audio';
    } else {
      return null; // Unsupported media type
    }

    return {
      type: mediaType,
      src: `${this.config.mediaPathPrefix}${filename.split('/').pop()}`,
      alt: this.createAltText(filename)
    };
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