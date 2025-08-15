import { DreamNode } from '../types/dreamnode';
import { useInterBrainStore } from '../store/interbrain-store';
import { IEmbeddingService, TextProcessor } from './embedding-service';
import { ollamaEmbeddingService } from './ollama-embedding-service';

/**
 * Vector data structure for storing indexed content
 */
export interface VectorData {
  nodeId: string;
  contentHash: string;  // Git commit hash for change detection
  embedding: number[];  // Vector embedding (simplified for now)
  lastIndexed: number;  // Timestamp
  metadata: {
    title: string;
    type: 'dream' | 'dreamer';
    wordCount: number;
    commitHash?: string;  // Latest git commit hash
  };
}

/**
 * Indexing progress information
 */
export interface IndexingProgress {
  total: number;
  completed: number;
  currentNode?: string;
  status: 'idle' | 'indexing' | 'complete' | 'error';
  message?: string;
}

/**
 * Interface for indexing service
 */
export interface IIndexingService {
  // Core indexing operations
  indexNode(node: DreamNode): Promise<VectorData>;
  indexAllNodes(): Promise<{ indexed: number; errors: number }>;
  intelligentReindex(): Promise<{ updated: number; added: number; errors: number }>;
  
  // Query operations
  getVector(nodeId: string): VectorData | null;
  getAllVectors(): VectorData[];
  needsReindex(nodeId: string, commitHash?: string): boolean;
  
  // Progress tracking
  getProgress(): IndexingProgress;
  
  // Management
  clearIndex(): void;
  getStats(): {
    totalIndexed: number;
    lastIndexTime?: number;
    avgIndexTime?: number;
  };
}

/**
 * IndexingService - Manages vector embeddings for DreamNodes
 * 
 * Provides intelligent indexing with git integration for change detection.
 * Uses Ollama embedding service for semantic search capabilities.
 */
export class IndexingService implements IIndexingService {
  private progress: IndexingProgress = {
    total: 0,
    completed: 0,
    status: 'idle'
  };
  
  private indexTimes: number[] = [];
  private embeddingService: IEmbeddingService;
  
  constructor(embeddingService?: IEmbeddingService) {
    this.embeddingService = embeddingService || ollamaEmbeddingService;
    console.log('IndexingService: Initialized with embedding service');
  }
  
  /**
   * Index a single DreamNode
   */
  async indexNode(node: DreamNode): Promise<VectorData> {
    const startTime = Date.now();
    
    try {
      // Simple text extraction for now
      const textContent = this.extractTextContent(node);
      const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;
      
      // Generate semantic embedding using Ollama
      const embedding = await this.generateEmbedding(textContent);
      
      // Get current git commit hash if available
      const commitHash = await this.getNodeCommitHash(node);
      
      // Create vector data
      const vectorData: VectorData = {
        nodeId: node.id,
        contentHash: commitHash || this.hashContent(textContent),
        embedding,
        lastIndexed: Date.now(),
        metadata: {
          title: node.name,
          type: node.type,
          wordCount,
          commitHash
        }
      };
      
      // Store in the InterBrain store
      const store = useInterBrainStore.getState();
      store.updateVectorData(node.id, vectorData);
      
      // Track timing
      const indexTime = Date.now() - startTime;
      this.indexTimes.push(indexTime);
      if (this.indexTimes.length > 100) {
        this.indexTimes.shift();
      }
      
      console.log(`IndexingService: Indexed "${node.name}" in ${indexTime}ms (${wordCount} words)`);
      return vectorData;
      
    } catch (error) {
      console.error(`IndexingService: Failed to index node ${node.id}:`, error);
      throw error;
    }
  }
  
  /**
   * Index all DreamNodes
   */
  async indexAllNodes(): Promise<{ indexed: number; errors: number }> {
    console.log('IndexingService: Starting full indexing...');
    
    const nodes = await this.getAllNodes();
    
    this.progress = {
      total: nodes.length,
      completed: 0,
      status: 'indexing',
      message: 'Starting full index...'
    };
    
    let indexed = 0;
    let errors = 0;
    
    for (const node of nodes) {
      try {
        this.progress.currentNode = node.name;
        this.progress.message = `Indexing: ${node.name}`;
        
        await this.indexNode(node);
        indexed++;
        
        this.progress.completed++;
        
        // Report progress at 20% intervals
        const percentComplete = Math.floor((this.progress.completed / this.progress.total) * 100);
        if (percentComplete > 0 && percentComplete % 20 === 0) {
          const notification = `Indexing progress: ${percentComplete}% (${this.progress.completed}/${this.progress.total})`;
          console.log(`IndexingService: ${notification}`);
          // TODO: Send notification to UI
        }
        
      } catch (error) {
        console.error(`Failed to index node ${node.id}:`, error);
        errors++;
        this.progress.completed++;
      }
    }
    
    this.progress.status = 'complete';
    this.progress.message = `Indexed ${indexed} nodes with ${errors} errors`;
    
    console.log(`IndexingService: Full indexing complete. Indexed: ${indexed}, Errors: ${errors}`);
    return { indexed, errors };
  }
  
  /**
   * Intelligent reindex - only update changed nodes
   */
  async intelligentReindex(): Promise<{ updated: number; added: number; errors: number }> {
    console.log('IndexingService: Starting intelligent reindex...');
    
    const store = useInterBrainStore.getState();
    const nodes = await this.getAllNodes();
    const existingVectors = store.vectorData;
    
    console.log(`IndexingService: Found ${nodes.length} nodes, ${existingVectors.size} existing vectors`);
    
    this.progress = {
      total: nodes.length,
      completed: 0,
      status: 'indexing',
      message: 'Analyzing changes...'
    };
    
    let updated = 0;
    let added = 0;
    let errors = 0;
    
    for (const node of nodes) {
      try {
        const existingVector = existingVectors.get(node.id);
        const currentCommitHash = await this.getNodeCommitHash(node);
        
        console.log(`IndexingService: Checking node ${node.name} (${node.id}): existingVector=${!!existingVector}, commitHash=${currentCommitHash}`);
        
        // Check if needs indexing
        if (!existingVector) {
          // New node - add to index
          console.log(`IndexingService: New node detected: ${node.name}`);
          this.progress.message = `Adding new node: ${node.name}`;
          await this.indexNode(node);
          added++;
        } else if (this.needsReindex(node.id, currentCommitHash)) {
          // Changed node - update index
          console.log(`IndexingService: Changed node detected: ${node.name}`);
          this.progress.message = `Updating: ${node.name}`;
          await this.indexNode(node);
          updated++;
        } else {
          console.log(`IndexingService: Node unchanged: ${node.name}`);
        }
        
        this.progress.completed++;
        
        // Report progress at 20% intervals
        const percentComplete = Math.floor((this.progress.completed / this.progress.total) * 100);
        if (percentComplete > 0 && percentComplete % 20 === 0) {
          const notification = `Reindex progress: ${percentComplete}% (${this.progress.completed}/${this.progress.total})`;
          console.log(`IndexingService: ${notification}`);
        }
        
      } catch (error) {
        console.error(`Failed to reindex node ${node.id}:`, error);
        errors++;
        this.progress.completed++;
      }
    }
    
    // Remove vectors for deleted nodes
    const nodeIds = new Set(nodes.map(n => n.id));
    const vectorsToRemove: string[] = [];
    for (const [vectorId] of existingVectors) {
      if (!nodeIds.has(vectorId)) {
        vectorsToRemove.push(vectorId);
      }
    }
    
    for (const vectorId of vectorsToRemove) {
      store.deleteVectorData(vectorId);
      console.log(`IndexingService: Removed vector for deleted node ${vectorId}`);
    }
    
    this.progress.status = 'complete';
    this.progress.message = `Reindex complete: ${added} added, ${updated} updated, ${errors} errors`;
    
    console.log(`IndexingService: Intelligent reindex complete. Added: ${added}, Updated: ${updated}, Errors: ${errors}`);
    return { updated, added, errors };
  }
  
  /**
   * Get vector for a specific node
   */
  getVector(nodeId: string): VectorData | null {
    const store = useInterBrainStore.getState();
    return store.vectorData.get(nodeId) || null;
  }
  
  /**
   * Get all vectors
   */
  getAllVectors(): VectorData[] {
    const store = useInterBrainStore.getState();
    return Array.from(store.vectorData.values());
  }
  
  /**
   * Check if a node needs reindexing
   */
  needsReindex(nodeId: string, commitHash?: string): boolean {
    const store = useInterBrainStore.getState();
    const existingVector = store.vectorData.get(nodeId);
    
    if (!existingVector) {
      return true;
    }
    
    // If we have commit hashes, compare them
    if (commitHash && existingVector.metadata.commitHash) {
      return commitHash !== existingVector.metadata.commitHash;
    }
    
    // Otherwise, check if it's been more than 24 hours (fallback)
    const dayInMs = 24 * 60 * 60 * 1000;
    return Date.now() - existingVector.lastIndexed > dayInMs;
  }
  
  /**
   * Get current indexing progress
   */
  getProgress(): IndexingProgress {
    return { ...this.progress };
  }
  
  /**
   * Clear all indexed data
   */
  clearIndex(): void {
    const store = useInterBrainStore.getState();
    store.clearVectorData();
    
    this.progress = {
      total: 0,
      completed: 0,
      status: 'idle'
    };
    
    console.log('IndexingService: Index cleared');
  }
  
  /**
   * Get indexing statistics
   */
  getStats() {
    const store = useInterBrainStore.getState();
    const totalIndexed = store.vectorData.size;
    
    const avgIndexTime = this.indexTimes.length > 0
      ? this.indexTimes.reduce((a, b) => a + b, 0) / this.indexTimes.length
      : undefined;
    
    const lastIndexTime = this.indexTimes.length > 0
      ? this.indexTimes[this.indexTimes.length - 1]
      : undefined;
    
    return {
      totalIndexed,
      lastIndexTime,
      avgIndexTime
    };
  }
  
  /**
   * Helper: Extract text content from a DreamNode
   */
  private extractTextContent(node: DreamNode): string {
    const parts: string[] = [node.name];
    
    // Add DreamTalk filename if present
    if (node.dreamTalkMedia.length > 0) {
      parts.push(`Media: ${node.dreamTalkMedia[0].path}`);
    }
    
    // Add DreamSong content if present
    if (node.dreamSongContent.length > 0) {
      // Convert canvas files to text representation
      parts.push(...node.dreamSongContent.map(canvas => `Canvas: ${canvas.path}`));
    }
    
    // Add connection information
    if (node.liminalWebConnections.length > 0) {
      parts.push(`Connections: ${node.liminalWebConnections.join(', ')}`);
    }
    
    return parts.join(' ');
  }
  
  /**
   * Helper: Generate embedding using the configured embedding service
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Check if embedding service is available
      const isAvailable = await this.embeddingService.isAvailable();
      if (!isAvailable) {
        console.warn('IndexingService: Embedding service unavailable, using fallback');
        return this.createFallbackEmbedding(text);
      }
      
      // Process the text and generate embedding
      const processedText = TextProcessor.extractContent(text);
      if (!processedText.trim()) {
        console.warn('IndexingService: Empty text content, using fallback');
        return this.createFallbackEmbedding(text);
      }
      
      return await this.embeddingService.processLongText(processedText);
      
    } catch (error) {
      console.error('IndexingService: Embedding generation failed, using fallback:', error);
      return this.createFallbackEmbedding(text);
    }
  }
  
  /**
   * Helper: Create fallback embedding when Ollama is unavailable
   */
  private createFallbackEmbedding(text: string): number[] {
    // Simple character frequency based embedding (fallback)
    const embedding = new Array(768).fill(0); // Match Ollama dimensions
    const normalizedText = text.toLowerCase();
    
    // Use hash-based distribution for better fallback
    let hash = 0;
    for (let i = 0; i < normalizedText.length; i++) {
      const char = normalizedText.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
      
      // Distribute hash values across embedding dimensions
      const index = Math.abs(hash) % embedding.length;
      embedding[index] += 1;
    }
    
    // Normalize
    const sum = embedding.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] = embedding[i] / sum;
      }
    }
    
    return embedding;
  }
  
  /**
   * Get embedding service health status
   */
  async getEmbeddingStatus(): Promise<{ available: boolean; message: string }> {
    try {
      const isAvailable = await this.embeddingService.isAvailable();
      if (isAvailable) {
        const modelInfo = await this.embeddingService.getModelInfo();
        return {
          available: true,
          message: `✅ ${modelInfo.name} ready (${modelInfo.dimensions}D)`
        };
      } else {
        return {
          available: false,
          message: '🔴 Embedding service unavailable - using fallback'
        };
      }
    } catch (error) {
      return {
        available: false,
        message: `🔴 Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
  
  /**
   * Get the embedding service instance
   */
  getEmbeddingService(): IEmbeddingService {
    return this.embeddingService;
  }
  
  /**
   * Helper: Get git commit hash for a node
   */
  private async getNodeCommitHash(node: DreamNode): Promise<string | undefined> {
    // Check if node has git status with commit info
    if (node.gitStatus?.details?.commitHash) {
      return node.gitStatus.details.commitHash;
    }
    
    // If no git status, try to get it fresh (for nodes that haven't been refreshed)
    // This ensures we have the latest commit hash for delta detection
    return undefined;
  }
  
  /**
   * Helper: Create content hash for change detection
   */
  private hashContent(content: string): string {
    // Simple hash function (will be replaced with crypto hash)
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
  
  /**
   * Helper: Get all nodes based on current data mode
   */
  private async getAllNodes(): Promise<DreamNode[]> {
    const store = useInterBrainStore.getState();
    
    console.log(`IndexingService: Getting nodes in ${store.dataMode} mode`);
    
    if (store.dataMode === 'real') {
      // Get from real nodes
      const nodes = Array.from(store.realNodes.values()).map(data => data.node);
      console.log(`IndexingService: Found ${nodes.length} nodes in real store:`, nodes.map(n => n.name).join(', '));
      return nodes;
    } else {
      // Get from mock data configuration (same source as DreamspaceCanvas)
      const { getMockDataForConfig } = await import('../mock/dreamnode-mock-data');
      const nodes = getMockDataForConfig(store.mockDataConfig);
      console.log(`IndexingService: Found ${nodes.length} mock nodes:`, nodes.map(n => n.name).join(', '));
      return nodes;
    }
  }
}

// Export singleton instance with default Ollama embedding service
export const indexingService = new IndexingService();