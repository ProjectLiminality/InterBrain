import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SemanticSearchService } from '../services/semantic-search-service';
import { DreamNode } from '../../../types/dreamnode';
import { VectorData } from '../services/indexing-service';
import { useInterBrainStore } from '../../../store/interbrain-store';
import { ollamaEmbeddingService } from '../services/ollama-embedding-service';

// Mock dependencies
vi.mock('../../../store/interbrain-store', () => ({
  useInterBrainStore: {
    getState: vi.fn(),
    setState: vi.fn()
  }
}));
vi.mock('../services/ollama-embedding-service', () => ({
  ollamaEmbeddingService: {
    generateEmbedding: vi.fn(),
    processLongText: vi.fn(),
    isAvailable: vi.fn(),
    getHealth: vi.fn(),
    getModelInfo: vi.fn()
  }
}));

describe('SemanticSearchService', () => {
  let searchService: SemanticSearchService;
  let mockDreamNodes: DreamNode[];
  let mockVectorData: Map<string, VectorData>;

  beforeEach(() => {
    // Create mock DreamNodes
    mockDreamNodes = [
      {
        id: 'node-1',
        name: 'Machine Learning Basics',
        type: 'dream',
        position: [0, 0, 0],
        repoPath: '/path/to/ml',
        dreamTalkMedia: [],
        dreamSongContent: [],
        liminalWebConnections: [],
        hasUnsavedChanges: false,
        gitStatus: {
          hasUncommittedChanges: false,
          hasStashedChanges: false,
          hasUnpushedChanges: false,
          lastChecked: Date.now()
        }
      },
      {
        id: 'node-2',
        name: 'Deep Learning Advanced',
        type: 'dream',
        position: [0, 0, 0],
        repoPath: '/path/to/dl',
        dreamTalkMedia: [],
        dreamSongContent: [],
        liminalWebConnections: [],
        hasUnsavedChanges: false,
        gitStatus: {
          hasUncommittedChanges: false,
          hasStashedChanges: false,
          hasUnpushedChanges: false,
          lastChecked: Date.now()
        }
      },
      {
        id: 'node-3',
        name: 'Cooking Recipes',
        type: 'dream',
        position: [0, 0, 0],
        repoPath: '/path/to/cooking',
        dreamTalkMedia: [],
        dreamSongContent: [],
        liminalWebConnections: [],
        hasUnsavedChanges: false,
        gitStatus: {
          hasUncommittedChanges: false,
          hasStashedChanges: false,
          hasUnpushedChanges: false,
          lastChecked: Date.now()
        }
      }
    ];

    // Create mock vector data
    mockVectorData = new Map([
      ['node-1', {
        nodeId: 'node-1',
        contentHash: 'hash1',
        embedding: [1.0, 0.0, 0.0], // Similar to ML query
        lastIndexed: Date.now(),
        metadata: {
          title: 'Machine Learning Basics',
          type: 'dream',
          wordCount: 500
        }
      }],
      ['node-2', {
        nodeId: 'node-2',
        contentHash: 'hash2',
        embedding: [0.8, 0.6, 0.0], // Somewhat similar to ML
        lastIndexed: Date.now(),
        metadata: {
          title: 'Deep Learning Advanced',
          type: 'dream',
          wordCount: 750
        }
      }],
      ['node-3', {
        nodeId: 'node-3',
        contentHash: 'hash3',
        embedding: [0.0, 0.0, 1.0], // Different topic
        lastIndexed: Date.now(),
        metadata: {
          title: 'Cooking Recipes',
          type: 'dream',
          wordCount: 300
        }
      }]
    ]);

    // Setup mock store
    const mockGetState = vi.mocked(useInterBrainStore.getState);
    mockGetState.mockReturnValue({
      vectorData: mockVectorData,
      dataMode: 'mock'
    } as unknown);

    searchService = new SemanticSearchService();

    // Setup mock embedding service
    const mockEmbeddingService = vi.mocked(ollamaEmbeddingService);
    mockEmbeddingService.generateEmbedding.mockResolvedValue([1.0, 0.0, 0.0]); // ML-like query
    mockEmbeddingService.isAvailable.mockResolvedValue(true);
    mockEmbeddingService.processLongText.mockResolvedValue([1.0, 0.0, 0.0]);
    mockEmbeddingService.getHealth.mockResolvedValue({
      isHealthy: true,
      message: 'Ollama service is available'
    });
    mockEmbeddingService.getModelInfo.mockResolvedValue({
      name: 'nomic-embed-text',
      dimensions: 768
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('searchByText', () => {
    it('should return relevant results sorted by similarity', async () => {
      // Mock getAllAvailableNodes to return our mock nodes
      vi.spyOn(searchService as unknown, 'getAllAvailableNodes')
        .mockResolvedValue(mockDreamNodes);

      const results = await searchService.searchByText('machine learning', {
        maxResults: 5,
        includeSnippets: false
      });

      expect(results).toHaveLength(2); // Only indexed nodes should be returned
      expect(results[0].node.id).toBe('node-1'); // Highest similarity
      expect(results[0].score).toBeGreaterThan(results[1].score);
      expect(results[1].node.id).toBe('node-2');
    });

    it('should respect maxResults limit', async () => {
      vi.spyOn(searchService as unknown, 'getAllAvailableNodes')
        .mockResolvedValue(mockDreamNodes);

      const results = await searchService.searchByText('machine learning', {
        maxResults: 1,
        includeSnippets: false
      });

      expect(results).toHaveLength(1);
      expect(results[0].node.id).toBe('node-1');
    });

    it('should filter by minimum similarity threshold', async () => {
      vi.spyOn(searchService as unknown, 'getAllAvailableNodes')
        .mockResolvedValue(mockDreamNodes);

      const results = await searchService.searchByText('machine learning', {
        maxResults: 5,
        similarityThreshold: 0.9, // High threshold
        includeSnippets: false
      });

      expect(results).toHaveLength(1); // Only exact match
      expect(results[0].node.id).toBe('node-1');
    });

    it('should return empty array when no similar nodes found', async () => {
      // Different query embedding that doesn't match any nodes well
      const mockEmbeddingService = vi.mocked(ollamaEmbeddingService);
      mockEmbeddingService.generateEmbedding.mockResolvedValue([0.0, 1.0, 0.0]);
      mockEmbeddingService.processLongText.mockResolvedValue([0.0, 1.0, 0.0]);

      vi.spyOn(searchService as unknown, 'getAllAvailableNodes')
        .mockResolvedValue(mockDreamNodes);

      const results = await searchService.searchByText('completely different topic', {
        maxResults: 5,
        similarityThreshold: 0.8,
        includeSnippets: false
      });

      expect(results).toHaveLength(0);
    });

    it('should handle embedding service errors by falling back to keyword search', async () => {
      const mockEmbeddingService = vi.mocked(ollamaEmbeddingService);
      mockEmbeddingService.processLongText.mockRejectedValue(new Error('Embedding failed'));

      vi.spyOn(searchService as unknown, 'getAllAvailableNodes')
        .mockResolvedValue(mockDreamNodes);

      // Should not throw, but return fallback keyword search results
      const results = await searchService.searchByText('machine learning');
      expect(Array.isArray(results)).toBe(true);
      // Keyword fallback should find nodes containing "machine" or "learning"
    });
  });

  describe('findSimilarNodes', () => {
    it('should find nodes similar to the given node', async () => {
      vi.spyOn(searchService as unknown, 'getAllAvailableNodes')
        .mockResolvedValue(mockDreamNodes);

      const targetNode = mockDreamNodes[0]; // Machine Learning node
      const results = await searchService.findSimilarNodes(targetNode, {
        maxResults: 5,
        includeSnippets: false
      });

      expect(results).toHaveLength(1); // Should find the Deep Learning node
      expect(results[0].node.id).toBe('node-2');
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('should exclude the target node from results', async () => {
      vi.spyOn(searchService as unknown, 'getAllAvailableNodes')
        .mockResolvedValue(mockDreamNodes);

      const targetNode = mockDreamNodes[0];
      const results = await searchService.findSimilarNodes(targetNode);

      // Should not include the target node itself
      expect(results.every(result => result.node.id !== targetNode.id)).toBe(true);
    });

    it('should handle unindexed target node by generating embedding', async () => {
      vi.spyOn(searchService as unknown, 'getAllAvailableNodes')
        .mockResolvedValue(mockDreamNodes);

      const unindexedNode: DreamNode = {
        id: 'unindexed-node',
        name: 'Unindexed Node',
        type: 'dream',
        position: [0, 0, 0],
        repoPath: '/path/to/unindexed',
        dreamTalkMedia: [],
        dreamSongContent: [],
        liminalWebConnections: [],
        hasUnsavedChanges: false,
        gitStatus: {
          hasUncommittedChanges: false,
          hasStashedChanges: false,
          hasUnpushedChanges: false,
          lastChecked: Date.now()
        }
      };

      // Should not throw but try to generate embedding for the unindexed node
      const results = await searchService.findSimilarNodes(unindexedNode);
      expect(Array.isArray(results)).toBe(true);
      // Should exclude the unindexed node itself from results
      expect(results.every(result => result.node.id !== unindexedNode.id)).toBe(true);
    });
  });

  describe('isSemanticSearchAvailable', () => {
    it('should return true when embedding service is available', async () => {
      const mockEmbeddingService = vi.mocked(ollamaEmbeddingService);
      mockEmbeddingService.isAvailable.mockResolvedValue(true);

      const result = await searchService.isSemanticSearchAvailable();
      expect(result).toBe(true);
    });

    it('should return false when embedding service is unavailable', async () => {
      const mockEmbeddingService = vi.mocked(ollamaEmbeddingService);
      mockEmbeddingService.isAvailable.mockResolvedValue(false);

      const result = await searchService.isSemanticSearchAvailable();
      expect(result).toBe(false);
    });
  });

  describe('getSearchStats', () => {
    it('should return accurate search statistics', async () => {
      vi.spyOn(searchService as unknown, 'getAllAvailableNodes')
        .mockResolvedValue(mockDreamNodes);

      const stats = await searchService.getSearchStats();

      expect(stats.totalNodes).toBe(3);
      expect(stats.indexedNodes).toBe(3); // All have vector data
      expect(stats.indexingCoverage).toBeCloseTo(1.0);
      expect(stats.embeddingDimensions).toBe(3); // Our mock embeddings are 3D
    });

    it('should handle partial indexing', async () => {
      // Remove one node's vector data
      const partialVectorData = new Map(mockVectorData);
      partialVectorData.delete('node-3');

      const mockGetState = vi.mocked(useInterBrainStore.getState);
      mockGetState.mockReturnValue({
        vectorData: partialVectorData,
        dataMode: 'mock'
      } as unknown);

      vi.spyOn(searchService as unknown, 'getAllAvailableNodes')
        .mockResolvedValue(mockDreamNodes);

      const stats = await searchService.getSearchStats();

      expect(stats.totalNodes).toBe(3);
      expect(stats.indexedNodes).toBe(2);
      expect(stats.indexingCoverage).toBeCloseTo(2/3);
    });
  });
});