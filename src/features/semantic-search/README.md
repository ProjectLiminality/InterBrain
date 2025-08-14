# Semantic Search Feature

This feature implements local semantic search capabilities for InterBrain using state-of-the-art embedding models and vector databases.

## Overview

The Semantic Search system enables natural language discovery of DreamNodes through semantic similarity rather than keyword matching. Users can search for concepts like "artificial intelligence" and find related nodes even if they don't contain those exact words.

## Architecture

### Technology Stack
- **Embedding Model**: Qwen3-Embedding-0.6B via Hugging Face Transformers.js
- **Vector Database**: Vectra (TypeScript-native, file-based storage)
- **Storage**: Plugin directory with git-friendly structure

### Services

#### EmbeddingService
- **TransformersEmbeddingService**: Manages Qwen3-Embedding-0.6B model
- **Future-Proof Design**: Easy model swapping via configuration
- **Performance**: 1024-dimensional embeddings with instruction formatting

#### SemanticSearchService  
- **VectraSemanticSearchService**: Vector search and indexing
- **Features**: Similarity search, distance calculation, incremental updates
- **Storage**: Git-friendly index files in plugin directory

#### ModelDownloadService
- **ObsidianModelDownloadService**: Model download and management
- **Features**: Progress tracking, storage estimation, model validation

### Commands

#### Model Management
- `interbrain-download-embedding-model`: Download Qwen3-0.6B model
- `interbrain-model-status`: Check model download status

#### Testing & Development
- `interbrain-embedding-test`: Test embedding generation
- `interbrain-index-sample-nodes`: Create sample nodes for testing
- `interbrain-semantic-search-test`: Perform semantic search with console output
- `interbrain-clear-search-index`: Clear vector index
- `interbrain-show-index-stats`: Display index statistics

## Usage

### Initial Setup
1. Run "Download Embedding Model" command (downloads ~639MB)
2. Run "Index Sample DreamNodes" to create test data
3. Run "Semantic Search Test" to verify functionality

### Development Workflow
1. Use embedding test to verify model functionality
2. Index sample nodes or real DreamNodes
3. Test semantic search with various queries
4. Monitor performance via console output

## Performance

### Current Targets
- **Embedding Generation**: ~2-10ms per text
- **Vector Search**: ~1-2ms for small indexes
- **Total Search**: Target <50ms (initial), <10ms (optimized)

### Monitoring
- All operations include timing measurements
- Console output shows performance metrics
- Automatic warnings for operations exceeding targets

## Future Expansion

### Phase 2: UI Integration
- Real-time search-as-you-type interface
- Honeycomb spatial layout with semantic positioning
- Visual similarity indicators

### Phase 3: Content Expansion
- README content indexing
- Full DreamNode content search
- Incremental update system

### Phase 4: Multimodal
- Image embedding support
- Cross-modal search capabilities
- Advanced model integration

## File Structure

```
src/features/semantic-search/
├── README.md                    # This file
├── types/
│   └── SemanticSearch.ts        # TypeScript interfaces
├── services/
│   ├── EmbeddingService.ts      # Qwen3 model integration
│   ├── SemanticSearchService.ts # Vectra vector search
│   ├── ModelDownloadService.ts  # Model management
│   └── index.ts                 # Service exports
├── commands/
│   ├── DownloadModelCommand.ts  # Model download commands
│   ├── SemanticSearchCommand.ts # Search test commands
│   ├── IndexingCommand.ts       # Indexing commands
│   └── index.ts                 # Command exports
└── utils/
    ├── ModelPaths.ts            # Plugin directory utilities
    └── PerformanceMonitor.ts    # Timing and benchmarking
```

## Integration Points

### With Existing Architecture
- Follows service layer pattern from Epic 3
- Uses command palette integration
- Respects vertical slice architecture
- Compatible with mock/real data switching

### With Future Features
- Designed for spatial orchestration integration (Epic 4)
- Ready for honeycomb layout system (Epic 5)
- Extensible for DreamNode service integration
- Prepared for real-time UI components

## Testing

### Unit Tests
- Embedding service functionality
- Vector search accuracy
- Model download simulation
- Performance benchmarking

### Integration Tests
- End-to-end search workflow
- Plugin directory management
- Cross-platform compatibility
- Error handling and recovery

## Troubleshooting

### Common Issues
- **Model not downloaded**: Run download command first
- **No search results**: Index some nodes first
- **Slow performance**: Check console for timing details
- **Memory issues**: Monitor plugin directory size

### Debug Commands
- Use "Check Embedding Model Status" for model issues
- Use "Show Index Statistics" for indexing problems
- Console output provides detailed timing and error information