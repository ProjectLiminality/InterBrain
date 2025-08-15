# Semantic Search Feature

A comprehensive semantic search system for the InterBrain plugin using Ollama's local embedding API. This feature provides private, sovereign AI-powered semantic search capabilities without relying on cloud services.

## Overview

The semantic search feature enables users to:
- Generate vector embeddings for DreamNodes using local Ollama API
- Perform semantic similarity searches across all indexed content
- Find related nodes based on meaning rather than keyword matching
- Maintain complete data privacy with local AI processing

## Architecture

This feature is designed as a modular, self-contained system that could potentially be extracted as a separate npm package in the future.

### Directory Structure

```
src/features/semantic-search/
├── README.md                        # This documentation
├── index.ts                         # Public API exports
├── commands/                        # Command palette commands
│   ├── index.ts                    # Main command registration
│   ├── ollama-commands.ts          # Ollama diagnostic commands
│   ├── indexing-commands.ts        # Content indexing commands
│   └── search-commands.ts          # Search and similarity commands
├── services/                        # Core business logic
│   ├── embedding-service.ts        # Abstract embedding interface
│   ├── ollama-embedding-service.ts # Ollama implementation
│   ├── ollama-health-service.ts    # Setup and diagnostics
│   ├── indexing-service.ts         # Content indexing and storage
│   └── semantic-search-service.ts  # Search operations
├── store/                           # State management
│   └── ollama-config-slice.ts      # Zustand store slice
├── types/                           # TypeScript definitions
│   └── index.ts                     # All feature types
├── tests/                           # Unit tests
└── models/                          # Fallback AI models
    └── Xenova_all-MiniLM-L6-v2/    # Browser-based fallback
```

## Setup Instructions

### Prerequisites

1. **Install Ollama**:
   - macOS: `curl -fsSL https://ollama.ai/install.sh | sh`
   - Linux: `curl -fsSL https://ollama.ai/install.sh | sh`
   - Windows: Download from https://ollama.ai

2. **Pull Embedding Model**:
   ```bash
   ollama pull nomic-embed-text
   ```

3. **Verify Installation**:
   ```bash
   ollama list
   # Should show nomic-embed-text model
   ```

### Configuration

The feature uses the following default configuration:
- **Ollama Base URL**: `http://localhost:11434`
- **Model**: `nomic-embed-text` (768-dimensional embeddings)
- **Chunk Size**: 500 characters
- **Chunk Overlap**: 100 characters

Configuration can be modified through the Zustand store or command palette.

## Command Reference

### Ollama Setup & Diagnostics

| Command | Description |
|---------|-------------|
| `Ollama: Check Status` | Quick health check of Ollama service |
| `Ollama: Run Diagnostics` | Comprehensive setup report with troubleshooting |
| `Ollama: Test Embedding Generation` | Verify embedding generation works |
| `Check Embedding Service Status` | Detailed service status and statistics |

### Content Indexing

| Command | Description |
|---------|-------------|
| `Index Selected DreamNode` | Index the currently selected node |
| `Index All DreamNodes (Full Reindex)` | Index all nodes in the system |
| `Intelligent Reindex - Update changed DreamNodes` | Only index nodes that have changed |

### Semantic Search

| Command | Description |
|---------|-------------|
| `Semantic Search` | Search all nodes by text query |
| `Find Similar to Selected Node` | Find nodes similar to the selected one |

## API Reference

### Core Services

#### OllamaEmbeddingService

```typescript
const service = createOllamaEmbeddingService('http://localhost:11434', 'nomic-embed-text');

// Generate single embedding
const embedding = await service.generateEmbedding('Some text to embed');

// Check service health
const health = await service.getHealth();
```

#### SemanticSearchService

```typescript
// Search by text
const results = await semanticSearchService.searchByText('machine learning', {
  maxResults: 10,
  includeSnippets: true
});

// Find similar nodes
const similarNodes = await semanticSearchService.findSimilarNodes(selectedNode, {
  maxResults: 5
});
```

#### IndexingService

```typescript
// Index a single node
const vectorData = await indexingService.indexNode(dreamNode);

// Full reindex
const result = await indexingService.indexAllNodes();

// Smart reindex (only changed nodes)
const result = await indexingService.intelligentReindex();
```

### Types

```typescript
// Main configuration
interface OllamaConfig {
  baseUrl: string;
  model: string;
  enabled: boolean;
  embedding: EmbeddingConfig;
}

// Search results
interface SearchResult {
  node: DreamNode;
  score: number;
  snippet?: string;
  vectorData: VectorData;
}

// Vector storage
interface VectorData {
  nodeId: string;
  contentHash: string;
  embedding: number[];
  lastIndexed: number;
  metadata: IndexingMetadata;
}
```

## Integration with Main Plugin

The feature integrates with the main InterBrain plugin through:

1. **Command Registration**: `registerSemanticSearchCommands(plugin, uiService)`
2. **Store Integration**: Extends main store with `OllamaConfigSlice`
3. **Service Layer**: Uses existing service manager patterns
4. **UI Integration**: Leverages existing `UIService` for notifications

## Performance Considerations

- **Embedding Dimensions**: nomic-embed-text uses 768-dimensional vectors
- **Indexing Speed**: ~1-2 seconds per typical DreamNode
- **Search Speed**: <100ms for similarity calculations
- **Storage**: ~3KB per indexed node (compressed)
- **Memory Usage**: Minimal - vectors stored in Zustand with persistence

## Troubleshooting

### Common Issues

1. **"Ollama not found"**:
   - Verify Ollama is installed and running
   - Check if service is running on localhost:11434

2. **"Model needed"**:
   - Run `ollama pull nomic-embed-text`
   - Verify model appears in `ollama list`

3. **"Embedding generation failed"**:
   - Check Ollama logs: `ollama logs`
   - Verify model is fully downloaded
   - Restart Ollama service

### Diagnostic Commands

Use the built-in diagnostic commands to troubleshoot issues:
- `Ollama: Run Diagnostics` - Creates detailed report
- `Ollama: Check Status` - Quick status check
- `Check Embedding Service Status` - Service statistics

## Future Enhancements

- [ ] Support for additional embedding models
- [ ] Advanced search filters and options
- [ ] Embedding model fine-tuning
- [ ] Distributed indexing for large vaults
- [ ] Real-time incremental indexing
- [ ] Export/import of vector databases

## Development

### Testing

```bash
npm run test -- features/semantic-search
```

### Building

The feature is automatically included in the main plugin build:

```bash
npm run plugin-build
```

### Contributing

When modifying this feature:

1. Maintain the modular architecture
2. Keep services stateless where possible
3. Use proper TypeScript types
4. Add comprehensive tests
5. Update this documentation

## License

Part of the InterBrain project - GNU AFFERO GENERAL PUBLIC LICENSE