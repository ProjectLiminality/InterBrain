/**
 * Type definitions for semantic search feature
 */

// Re-export core types from embedding service
export type {
  IEmbeddingService,
  EmbeddingConfig,
  EmbeddingModelInfo,
  EmbeddingHealth,
  EmbeddingServiceError
} from '../services/embedding-service';

// Re-export indexing types
export type {
  VectorData,
  IndexingProgress,
  IIndexingService
} from '../services/indexing-service';

// Re-export search types  
export type {
  SearchResult,
  SearchOptions
} from '../services/semantic-search-service';

// Forward declaration for EmbeddingConfig - will be properly imported from services
interface EmbeddingConfig {
  chunkSize: number;
  chunkOverlap: number;
  maxRetries: number;
  retryDelay: number;
}

// Ollama specific configuration
export interface OllamaConfig {
  baseUrl: string;
  model: string;
  enabled: boolean;
  embedding: EmbeddingConfig;
}

// Default configurations
export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  baseUrl: 'http://localhost:11434',
  model: 'nomic-embed-text',
  enabled: true,
  embedding: {
    chunkSize: 500,
    chunkOverlap: 100,
    maxRetries: 3,
    retryDelay: 1000
  }
};

// Command result types for better type safety
export interface CommandResult {
  success: boolean;
  message: string;
  data?: any;
}

// Ollama setup instructions
export interface SetupInstructions {
  title: string;
  steps: string[];
  commands?: string[];
  notes?: string[];
}