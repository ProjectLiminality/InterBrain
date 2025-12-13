# Semantic Search Feature

**Purpose**: AI-powered semantic search for DreamNodes using local Ollama embeddings for sovereign, privacy-first search.

## Directory Structure

```
semantic-search/
├── store/
│   └── slice.ts                    # Zustand slice (vectorData, searchResults, ollamaConfig)
├── services/
│   ├── embedding-service.ts        # Interface + utilities (TextProcessor, VectorUtils)
│   ├── ollama-embedding-service.ts # Production Ollama API client (768D embeddings)
│   ├── ollama-health-service.ts    # Diagnostics and setup validation
│   ├── indexing-service.ts         # Vector index with git-aware change detection
│   └── semantic-search-service.ts  # Cosine similarity search with fallback
├── commands/
│   ├── index.ts                    # Command registration orchestrator
│   ├── ollama-commands.ts          # Diagnostics, status checks (4 commands)
│   ├── indexing-commands.ts        # Index management (3 commands)
│   └── search-commands.ts          # Search operations (3 commands)
├── types/
│   └── index.ts                    # Type definitions and constants
├── tests/
│   ├── embedding-service.test.ts
│   ├── ollama-embedding.test.ts
│   ├── indexing-service.test.ts
│   └── semantic-search.test.ts
├── index.ts                        # Barrel export
└── README.md
```

## Main Exports

```typescript
// Services
export { OllamaEmbeddingService, createOllamaEmbeddingService } from './services/ollama-embedding-service';
export { OllamaHealthService, createOllamaHealthService } from './services/ollama-health-service';
export { indexingService } from './services/indexing-service';
export { semanticSearchService } from './services/semantic-search-service';

// Store slice
export { createSearchSlice, SearchSlice, extractSearchPersistenceData, restoreSearchPersistenceData } from './store/slice';

// Types
export type { OllamaConfig, IEmbeddingService, VectorData, SearchResult, SearchOptions, CommandResult, SetupInstructions };
export { DEFAULT_OLLAMA_CONFIG } from './types';

// Commands
export { registerSemanticSearchCommands } from './commands';
```

## Ownership

**Semantic-search owns** the vector index (`SearchSlice.vectorData`), embedding generation, and search result ranking. It provides the search infrastructure that the `search` feature slice uses for UI.

## Architecture

**Service Layer Pattern**: Interface-based services (`IEmbeddingService`, `IIndexingService`) with production implementations using Ollama API.

**Store Integration**: Dedicated `SearchSlice` in Zustand store for vector data, search results, search UI state, and Ollama configuration.

**Command-Driven**: All functionality exposed via Obsidian command palette (no direct UI components in this slice).

## Data Flow

1. **Indexing**: `IndexingService` → extracts text from DreamNodes → `OllamaEmbeddingService` → generates embeddings → stores in `SearchSlice.vectorData`
2. **Searching**: User query → `SemanticSearchService` → generates query embedding → cosine similarity vs indexed vectors → sorted results → `SearchSlice.searchResults`
3. **Layout Integration**: Search results trigger `spatialLayout: 'search'` → honeycomb ring layout in dreamspace

## Git Integration

- **Change Detection**: Uses git commit hashes to detect when DreamNodes need re-indexing
- **Intelligent Reindex**: Only updates changed nodes, adds new nodes, removes deleted nodes
- **Fallback**: Time-based reindex if commit hash unavailable (24h threshold)

## Ollama Dependency

- **Required**: Local Ollama server at `http://localhost:11434`
- **Default Model**: `nomic-embed-text` (768 dimensions)
- **Setup**: `ollama pull nomic-embed-text`
- **Fallback**: Character frequency embeddings when Ollama unavailable
- **Health Caching**: 30-second cache for availability checks

## Known Patterns

- **Singleton Services**: `indexingService`, `semanticSearchService`, `ollamaEmbeddingService` - exported as singletons for convenience
- **Factory Functions**: `createOllamaEmbeddingService()`, `createOllamaHealthService()` - for custom instances
- **Async Command Pattern**: Commands use `setTimeout(..., 0)` to close command palette before executing long operations
- **Progress Notifications**: IndexingService emits progress at 20% intervals during batch operations

## Command Reference (10 Total)

**Ollama Setup & Diagnostics** (4):
- `Ollama: Check Status` - Quick health check
- `Ollama: Run Diagnostics` - Comprehensive setup report
- `Ollama: Test Embedding Generation` - Verify embedding generation
- `Check Embedding Service Status` - Service status and statistics

**Content Indexing** (3):
- `Index Selected DreamNode` - Index currently selected node
- `Index All DreamNodes (Full Reindex)` - Index all nodes
- `Intelligent Reindex - Update changed DreamNodes` - Only index changed nodes

**Semantic Search** (3):
- `Semantic Search` - Search all nodes by text query
- `Find Similar to Selected Node` - Find nodes similar to selected one
- `Clear Search Results` - Return to constellation layout

## Tests

All services have comprehensive unit tests with mocked dependencies:
- `tests/embedding-service.test.ts` - TextProcessor and VectorUtils
- `tests/ollama-embedding.test.ts` - OllamaEmbeddingService integration
- `tests/indexing-service.test.ts` - IndexingService with mocked embedding
- `tests/semantic-search.test.ts` - SemanticSearchService
