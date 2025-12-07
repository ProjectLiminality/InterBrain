import { DreamNode } from '../../../core/types/dreamnode';
import { VectorData } from './indexing-service';
import { useInterBrainStore } from '../../../core/store/interbrain-store';
import { IEmbeddingService, VectorUtils, TextProcessor } from './embedding-service';
import { ollamaEmbeddingService } from './ollama-embedding-service';

/**
 * Search result with similarity score
 */
export interface SearchResult {
  node: DreamNode;
  score: number;
  snippet?: string;
  vectorData: VectorData;
}

/**
 * Search options and filters
 */
export interface SearchOptions {
  similarityThreshold?: number;
  maxResults?: number;
  nodeTypes?: ('dream' | 'dreamer')[];
  includeSnippets?: boolean;
  excludeNodeId?: string; // Exclude this node from results (e.g., when finding similar to selected)
}

/**
 * Default search configuration
 */
export const DEFAULT_SEARCH_OPTIONS: Required<SearchOptions> = {
  similarityThreshold: 0.1, // Relatively low threshold for broader results
  maxResults: 20,
  nodeTypes: ['dream', 'dreamer'],
  includeSnippets: true,
  excludeNodeId: ''
};

/**
 * Semantic search service using vector embeddings
 * Provides similarity search capabilities for DreamNodes
 */
export class SemanticSearchService {
  private embeddingService: IEmbeddingService;
  
  constructor(embeddingService?: IEmbeddingService) {
    this.embeddingService = embeddingService || ollamaEmbeddingService;
  }

  /**
   * Search for nodes semantically similar to the given query text
   */
  async searchByText(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const searchOptions = { ...DEFAULT_SEARCH_OPTIONS, ...options };
    
    if (!query.trim()) {
      return [];
    }
    
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateQueryEmbedding(query);
      
      // Search using the query embedding
      return await this.searchByEmbedding(queryEmbedding, searchOptions);
      
    } catch {
      console.error('SemanticSearchService: Text search failed');
      
      // Fallback to keyword search if embedding fails
      return await this.keywordFallbackSearch(query, searchOptions);
    }
  }
  
  /**
   * Search for nodes of opposite type to the given node (for relationship editing)
   * Dreams return Dreamers, Dreamers return Dreams
   */
  async searchOppositeTypeNodes(query: string, referenceNode: DreamNode, options: SearchOptions = {}): Promise<SearchResult[]> {
    // Determine opposite type
    const oppositeType = referenceNode.type === 'dream' ? 'dreamer' : 'dream';
    
    const searchOptions: SearchOptions = {
      ...DEFAULT_SEARCH_OPTIONS,
      ...options,
      nodeTypes: [oppositeType], // Only search opposite type
      excludeNodeId: referenceNode.id, // Don't include the reference node
      maxResults: options.maxResults || 35 // Default to 35 for honeycomb layout (36 - 1 center)
    };
    
    return await this.searchByText(query, searchOptions);
  }

  /**
   * Find nodes of opposite type that are similar to the given node (for relationship suggestions)
   */
  async findSimilarOppositeTypeNodes(node: DreamNode, options: SearchOptions = {}): Promise<SearchResult[]> {
    // Determine opposite type
    const oppositeType = node.type === 'dream' ? 'dreamer' : 'dream';
    
    const searchOptions: SearchOptions = { 
      ...DEFAULT_SEARCH_OPTIONS, 
      ...options,
      nodeTypes: [oppositeType], // Only search opposite type
      excludeNodeId: node.id, // Don't include the source node in results
      maxResults: options.maxResults || 35 // Default to 35 for honeycomb layout
    };
    
    const store = useInterBrainStore.getState();
    const vectorData = store.vectorData.get(node.id);
    
    if (!vectorData) {
      console.warn('SemanticSearchService: No vector data found for node, generating embedding');
      
      try {
        // Generate embedding for this node if not found
        const nodeText = this.extractNodeText(node);
        const embedding = await this.generateQueryEmbedding(nodeText);
        return await this.searchByEmbedding(embedding, searchOptions);
      } catch {
        console.error('SemanticSearchService: Failed to generate embedding for node');
        return [];
      }
    }
    
    return await this.searchByEmbedding(vectorData.embedding, searchOptions);
  }

  /**
   * Find nodes similar to a given DreamNode
   */
  async findSimilarNodes(node: DreamNode, options: SearchOptions = {}): Promise<SearchResult[]> {
    const searchOptions = { 
      ...DEFAULT_SEARCH_OPTIONS, 
      ...options,
      excludeNodeId: node.id // Don't include the source node in results
    };
    
    const store = useInterBrainStore.getState();
    const vectorData = store.vectorData.get(node.id);
    
    if (!vectorData) {
      console.warn('SemanticSearchService: No vector data found for node, generating embedding');
      
      try {
        // Generate embedding for this node if not found
        const nodeText = this.extractNodeText(node);
        const embedding = await this.generateQueryEmbedding(nodeText);
        return await this.searchByEmbedding(embedding, searchOptions);
      } catch {
        console.error('SemanticSearchService: Failed to generate embedding for node');
        return [];
      }
    }
    
    return await this.searchByEmbedding(vectorData.embedding, searchOptions);
  }
  
  /**
   * Search using a pre-computed embedding vector
   */
  async searchByEmbedding(queryEmbedding: number[], options: SearchOptions = {}): Promise<SearchResult[]> {
    const searchOptions = { ...DEFAULT_SEARCH_OPTIONS, ...options };
    const store = useInterBrainStore.getState();
    
    // Get all available nodes and their vector data
    const nodes = await this.getAllAvailableNodes();
    const results: SearchResult[] = [];
    
    for (const node of nodes) {
      // Apply node type filter
      if (!searchOptions.nodeTypes.includes(node.type)) {
        continue;
      }
      
      // Exclude specified node
      if (searchOptions.excludeNodeId && node.id === searchOptions.excludeNodeId) {
        continue;
      }
      
      // Get vector data for this node
      const vectorData = store.vectorData.get(node.id);
      if (!vectorData) {
        continue; // Skip nodes without embeddings
      }
      
      // Calculate similarity
      try {
        const similarity = VectorUtils.cosineSimilarity(queryEmbedding, vectorData.embedding);
        
        // Apply similarity threshold
        if (similarity < searchOptions.similarityThreshold) {
          continue;
        }
        
        // Create search result
        const result: SearchResult = {
          node,
          score: similarity,
          vectorData
        };
        
        // Add snippet if requested
        if (searchOptions.includeSnippets) {
          result.snippet = this.generateSnippet(node);
        }
        
        results.push(result);
        
      } catch {
        console.warn(`SemanticSearchService: Failed to calculate similarity for node ${node.id}`);
        continue;
      }
    }
    
    // Sort by similarity score (highest first) and limit results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, searchOptions.maxResults);
  }
  
  /**
   * Get search statistics
   */
  async getSearchStats(): Promise<{
    totalNodes: number;
    indexedNodes: number;
    embeddingDimensions: number | null;
    indexingCoverage: number;
  }> {
    const store = useInterBrainStore.getState();
    const nodes = await this.getAllAvailableNodes();
    const indexedNodes = store.vectorData.size;
    
    // Get embedding dimensions from first indexed node
    let embeddingDimensions: number | null = null;
    for (const vectorData of store.vectorData.values()) {
      embeddingDimensions = vectorData.embedding.length;
      break;
    }
    
    return {
      totalNodes: nodes.length,
      indexedNodes,
      embeddingDimensions,
      indexingCoverage: nodes.length > 0 ? indexedNodes / nodes.length : 0
    };
  }
  
  /**
   * Check if semantic search is available
   */
  async isSemanticSearchAvailable(): Promise<boolean> {
    try {
      return await this.embeddingService.isAvailable();
    } catch {
      return false;
    }
  }
  
  /**
   * Generate embedding for query text
   */
  private async generateQueryEmbedding(text: string): Promise<number[]> {
    const processedText = TextProcessor.extractContent(text);
    
    if (!processedText.trim()) {
      throw new Error('Cannot generate embedding for empty query');
    }
    
    return await this.embeddingService.processLongText(processedText);
  }
  
  /**
   * Extract text content from a DreamNode
   */
  private extractNodeText(node: DreamNode): string {
    const parts: string[] = [node.name];
    
    // Add DreamTalk filename if present
    if (node.dreamTalkMedia.length > 0) {
      parts.push(`Media: ${node.dreamTalkMedia[0].path}`);
    }
    
    // Add DreamSong content if present
    if (node.dreamSongContent.length > 0) {
      parts.push(...node.dreamSongContent.map(canvas => `Canvas: ${canvas.path}`));
    }
    
    // Add connection information
    if (node.liminalWebConnections.length > 0) {
      parts.push(`Connections: ${node.liminalWebConnections.join(', ')}`);
    }
    
    return parts.join(' ');
  }
  
  /**
   * Generate a short snippet for display in search results
   */
  private generateSnippet(node: DreamNode, maxLength: number = 150): string {
    const text = this.extractNodeText(node);
    const processed = TextProcessor.cleanText(text);
    
    if (processed.length <= maxLength) {
      return processed;
    }
    
    // Truncate at word boundary
    const truncated = processed.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > maxLength * 0.8) { // If last space is reasonably close to end
      return truncated.substring(0, lastSpace) + '...';
    }
    
    return truncated + '...';
  }
  
  /**
   * Get all available nodes based on current data mode
   */
  private async getAllAvailableNodes(): Promise<DreamNode[]> {
    const store = useInterBrainStore.getState();
    
    if (store.dataMode === 'real') {
      return Array.from(store.realNodes.values()).map(data => data.node);
    } else {
      // Get from mock data configuration (import dynamically to avoid circular deps)
      try {
        // Dynamic import to avoid circular dependencies
        const { getMockDataForConfig } = await import('../../../mock/dreamnode-mock-data');
        return getMockDataForConfig(store.mockDataConfig);
      } catch {
        console.error('SemanticSearchService: Failed to get mock data');
        return [];
      }
    }
  }
  
  /**
   * Fallback keyword search when semantic search is unavailable
   */
  private async keywordFallbackSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const nodes = await this.getAllAvailableNodes();
    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(/\s+/).filter(word => word.length > 2);
    
    if (keywords.length === 0) {
      return [];
    }
    
    const results: SearchResult[] = [];
    
    for (const node of nodes) {
      // Apply filters
      if (!options.nodeTypes!.includes(node.type)) {
        continue;
      }
      
      if (options.excludeNodeId && node.id === options.excludeNodeId) {
        continue;
      }
      
      // Calculate keyword match score
      const nodeText = this.extractNodeText(node).toLowerCase();
      let matchCount = 0;
      
      for (const keyword of keywords) {
        if (nodeText.includes(keyword)) {
          matchCount++;
        }
      }
      
      const score = matchCount / keywords.length;
      
      if (score < 0.1) { // Require at least 10% keyword match
        continue;
      }
      
      // Create a mock vector data for consistency
      const vectorData: VectorData = {
        nodeId: node.id,
        contentHash: 'fallback',
        embedding: [],
        lastIndexed: Date.now(),
        metadata: {
          title: node.name,
          type: node.type,
          wordCount: nodeText.split(/\s+/).length
        }
      };
      
      const result: SearchResult = {
        node,
        score,
        vectorData
      };
      
      if (options.includeSnippets) {
        result.snippet = this.generateSnippet(node);
      }
      
      results.push(result);
    }
    
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, options.maxResults!);
  }
}

/**
 * Singleton instance for convenient access
 */
export const semanticSearchService = new SemanticSearchService();