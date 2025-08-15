/**
 * Semantic Search Feature - Public API
 * 
 * This module provides semantic search capabilities for the InterBrain plugin
 * using Ollama's local embedding API for private, sovereign AI operations.
 */

// Core services
export { OllamaEmbeddingService, createOllamaEmbeddingService } from './services/ollama-embedding-service';
export { OllamaHealthService, createOllamaHealthService } from './services/ollama-health-service';
export { indexingService } from './services/indexing-service';
export { semanticSearchService } from './services/semantic-search-service';

// Store slice
export { createOllamaConfigSlice } from './store/ollama-config-slice';

// Types and configurations
export type {
  OllamaConfig,
  IEmbeddingService,
  EmbeddingConfig,
  VectorData,
  SearchResult,
  SearchOptions,
  CommandResult,
  SetupInstructions
} from './types';

export { DEFAULT_OLLAMA_CONFIG } from './types';

// Command registration
export { registerSemanticSearchCommands } from './commands';

// Version info
export const SEMANTIC_SEARCH_VERSION = '1.0.0';