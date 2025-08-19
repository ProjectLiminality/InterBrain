/**
 * Embedding service interface for generating vector embeddings
 * Used by IndexingService to create semantic search capabilities
 */

export interface EmbeddingModelInfo {
  name: string;
  dimensions: number;
  description?: string;
}

export interface EmbeddingConfig {
  chunkSize: number;
  chunkOverlap: number;
  maxRetries: number;
  retryDelay: number;
}

export interface EmbeddingHealth {
  isAvailable: boolean;
  modelLoaded: boolean;
  error?: string;
  modelInfo?: EmbeddingModelInfo;
}

/**
 * Interface for embedding generation services
 */
export interface IEmbeddingService {
  /**
   * Generate embedding for a single text
   */
  generateEmbedding(text: string): Promise<number[]>;
  
  /**
   * Generate embeddings for multiple texts (batch processing)
   */
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;
  
  /**
   * Check if the embedding service is available and ready
   */
  isAvailable(): Promise<boolean>;
  
  /**
   * Get information about the current embedding model
   */
  getModelInfo(): Promise<EmbeddingModelInfo>;
  
  /**
   * Get detailed health status including model availability
   */
  getHealth(): Promise<EmbeddingHealth>;
  
  /**
   * Process long text by chunking and averaging embeddings
   */
  processLongText(text: string, config?: Partial<EmbeddingConfig>): Promise<number[]>;
}

/**
 * Error types for embedding operations
 */
export class EmbeddingServiceError extends Error {
  constructor(
    message: string,
    public readonly code: 'SERVICE_UNAVAILABLE' | 'MODEL_NOT_FOUND' | 'NETWORK_ERROR' | 'INVALID_RESPONSE' | 'UNKNOWN_ERROR',
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'EmbeddingServiceError';
  }
}

/**
 * Utility functions for text processing
 */
export class TextProcessor {
  /**
   * Split text into chunks with overlap
   */
  static chunkText(text: string, chunkSize: number, overlap: number): string[] {
    if (text.length <= chunkSize) {
      return [text];
    }
    
    const chunks: string[] = [];
    let start = 0;
    
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end));
      
      if (end === text.length) break;
      start = end - overlap;
    }
    
    return chunks;
  }
  
  /**
   * Clean and normalize text for embedding
   */
  static cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/[^\w\s.,!?;:()[\]{}""''—-]/g, '') // Remove special chars but keep punctuation
      .trim();
  }
  
  /**
   * Extract meaningful content from DreamNode text
   */
  static extractContent(text: string): string {
    // Remove markdown headers and formatting
    const cleaned = text
      .replace(/^#{1,6}\s+/gm, '') // Remove markdown headers
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold formatting
      .replace(/\*(.*?)\*/g, '$1') // Remove italic formatting
      .replace(/`(.*?)`/g, '$1') // Remove code formatting
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove links, keep text
      .replace(/!\[.*?\]\(.*?\)/g, '') // Remove images
      .replace(/---+/g, '') // Remove horizontal rules
      .replace(/^\s*[-*+]\s+/gm, '') // Remove list bullets
      .replace(/^\s*\d+\.\s+/gm, ''); // Remove numbered lists
    
    return this.cleanText(cleaned);
  }
}

/**
 * Vector utility functions
 */
export class VectorUtils {
  /**
   * Calculate cosine similarity between two vectors
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (normA * normB);
  }
  
  /**
   * Average multiple vectors into one
   */
  static averageVectors(vectors: number[][]): number[] {
    if (vectors.length === 0) {
      throw new Error('Cannot average empty vector array');
    }
    
    const dimensions = vectors[0].length;
    const result = new Array(dimensions).fill(0);
    
    for (const vector of vectors) {
      if (vector.length !== dimensions) {
        throw new Error('All vectors must have the same dimensions');
      }
      for (let i = 0; i < dimensions; i++) {
        result[i] += vector[i];
      }
    }
    
    // Average by dividing by count
    for (let i = 0; i < dimensions; i++) {
      result[i] /= vectors.length;
    }
    
    return result;
  }
  
  /**
   * Normalize a vector to unit length
   */
  static normalizeVector(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm === 0) return vector;
    return vector.map(val => val / norm);
  }
}