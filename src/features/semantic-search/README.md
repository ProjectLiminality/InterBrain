# Semantic Search Feature

**Purpose**: AI-powered semantic search for DreamNodes using local Ollama embeddings for sovereign, privacy-first search.

## Architecture

**Service Layer Pattern**: Interface-based services (`IEmbeddingService`, `IIndexingService`) with production implementations using Ollama API.

**Store Integration**: Dedicated `SearchSlice` in Zustand store for vector data, search results, search UI state, and Ollama configuration.

**Command-Driven**: All functionality exposed via Obsidian command palette (no direct UI components in this slice).

### Key Files

**Core Services**:
- `services/embedding-service.ts` - Abstract interface + utilities (TextProcessor, VectorUtils)
- `services/ollama-embedding-service.ts` - Production Ollama API client, generates 768D embeddings
- `services/ollama-health-service.ts` - Diagnostics and setup validation for Ollama
- `services/indexing-service.ts` - Manages vector index, git-aware change detection, progress tracking
- `services/semantic-search-service.ts` - Cosine similarity search with keyword fallback

**State Management**:
- `search-slice.ts` - Zustand slice with:
  - `vectorData: Map<string, VectorData>` - Persistent embedding cache
  - `searchResults: DreamNode[]` - Current search results
  - `searchInterface: SearchInterfaceState` - Search UI state (isActive, currentQuery, isSaving)
  - `ollamaConfig: OllamaConfig` - Embedding service configuration

**Commands** (Obsidian Command Palette):
- `commands/ollama-commands.ts` - Diagnostics, status checks, embedding tests (4 commands)
- `commands/indexing-commands.ts` - Index management: intelligent reindex, full reindex, single node (3 commands)
- `commands/search-commands.ts` - Search operations: semantic search, find similar, clear results (3 commands)
- `commands/index.ts` - Command registration orchestrator

**Types & Exports**:
- `types/index.ts` - Type definitions and constants (re-exports from services)
- `index.ts` - Public API with exports for all services, types, and commands

## Main Exports

```typescript
// Services
export { OllamaEmbeddingService, createOllamaEmbeddingService } from './services/ollama-embedding-service';
export { OllamaHealthService, createOllamaHealthService } from './services/ollama-health-service';
export { indexingService } from './services/indexing-service';
export { semanticSearchService } from './services/semantic-search-service';

// Store slice
export { createSearchSlice, SearchSlice, extractSearchPersistenceData, restoreSearchPersistenceData } from './search-slice';

// Types
export type { OllamaConfig, IEmbeddingService, VectorData, SearchResult, SearchOptions, CommandResult, SetupInstructions };
export { DEFAULT_OLLAMA_CONFIG } from './types';

// Commands
export { registerSemanticSearchCommands } from './commands';
```

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

---

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

- `tests/embedding-service.test.ts` - TextProcessor and VectorUtils unit tests
- `tests/ollama-embedding.test.ts` - OllamaEmbeddingService integration tests
- `tests/indexing-service.test.ts` - IndexingService with mocked embedding service
- `tests/semantic-search.test.ts` - SemanticSearchService with mocked dependencies

## Flags

**Status**: Production-ready, well-structured feature slice with comprehensive test coverage and clear separation of concerns. No issues detected.