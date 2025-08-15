import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SemanticSearchService } from '../services/semantic-search-service';
import { DreamNode } from '../../../types/dreamnode';
import { VectorData } from '../services/indexing-service';

// Mock dependencies
vi.mock('../../../store/interbrain-store');
vi.mock('../services/ollama-embedding-service');

const mockStore = {
  getState: vi.fn()
};

const mockEmbeddingService = {
  generateEmbedding: vi.fn(),
  isAvailable: vi.fn()
};

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
        repoPath: '/path/to/ml',
        lastModified: Date.now(),
        gitStatus: 'clean',
        liminalWebConnections: []
      },
      {
        id: 'node-2',
        name: 'Deep Learning Advanced',
        type: 'dream',
        repoPath: '/path/to/dl',
        lastModified: Date.now(),
        gitStatus: 'clean',
        liminalWebConnections: []
      },
      {
        id: 'node-3',
        name: 'Cooking Recipes',
        type: 'dream',
        repoPath: '/path/to/cooking',
        lastModified: Date.now(),
        gitStatus: 'clean',
        liminalWebConnections: []
      }
    ] as DreamNode[];

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
    mockStore.getState.mockReturnValue({
      vectorData: mockVectorData,
      dataMode: 'mock'
    });

    searchService = new SemanticSearchService();

    // Setup mock embedding service
    mockEmbeddingService.generateEmbedding.mockResolvedValue([1.0, 0.0, 0.0]); // ML-like query
    mockEmbeddingService.isAvailable.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('searchByText', () => {
    it('should return relevant results sorted by similarity', async () => {
      // Mock getAllAvailableNodes to return our mock nodes
      vi.spyOn(searchService as any, 'getAllAvailableNodes')
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
      vi.spyOn(searchService as any, 'getAllAvailableNodes')
        .mockResolvedValue(mockDreamNodes);

      const results = await searchService.searchByText('machine learning', {
        maxResults: 1,
        includeSnippets: false
      });

      expect(results).toHaveLength(1);
      expect(results[0].node.id).toBe('node-1');
    });

    it('should filter by minimum similarity threshold', async () => {
      vi.spyOn(searchService as any, 'getAllAvailableNodes')
        .mockResolvedValue(mockDreamNodes);

      const results = await searchService.searchByText('machine learning', {
        maxResults: 5,
        minSimilarity: 0.9, // High threshold
        includeSnippets: false
      });

      expect(results).toHaveLength(1); // Only exact match
      expect(results[0].node.id).toBe('node-1');
    });

    it('should return empty array when no similar nodes found', async () => {
      // Different query embedding that doesn't match any nodes well
      mockEmbeddingService.generateEmbedding.mockResolvedValue([0.0, 1.0, 0.0]);

      vi.spyOn(searchService as any, 'getAllAvailableNodes')
        .mockResolvedValue(mockDreamNodes);

      const results = await searchService.searchByText('completely different topic', {
        maxResults: 5,
        minSimilarity: 0.8,
        includeSnippets: false
      });

      expect(results).toHaveLength(0);
    });

    it('should handle embedding service errors', async () => {
      mockEmbeddingService.generateEmbedding.mockRejectedValue(new Error('Embedding failed'));

      await expect(
        searchService.searchByText('test query')
      ).rejects.toThrow('Embedding failed');
    });
  });

  describe('findSimilarNodes', () => {
    it('should find nodes similar to the given node', async () => {
      vi.spyOn(searchService as any, 'getAllAvailableNodes')
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
      vi.spyOn(searchService as any, 'getAllAvailableNodes')
        .mockResolvedValue(mockDreamNodes);

      const targetNode = mockDreamNodes[0];
      const results = await searchService.findSimilarNodes(targetNode);

      // Should not include the target node itself
      expect(results.every(result => result.node.id !== targetNode.id)).toBe(true);
    });

    it('should throw error if target node is not indexed', async () => {
      vi.spyOn(searchService as any, 'getAllAvailableNodes')
        .mockResolvedValue(mockDreamNodes);

      const unindexedNode: DreamNode = {
        id: 'unindexed-node',
        name: 'Unindexed Node',
        type: 'dream',
        repoPath: '/path/to/unindexed',
        lastModified: Date.now(),
        gitStatus: 'clean',
        liminalWebConnections: []
      } as DreamNode;

      await expect(
        searchService.findSimilarNodes(unindexedNode)
      ).rejects.toThrow('not indexed');
    });
  });

  describe('isSemanticSearchAvailable', () => {
    it('should return true when embedding service is available', async () => {
      mockEmbeddingService.isAvailable.mockResolvedValue(true);

      const result = await searchService.isSemanticSearchAvailable();
      expect(result).toBe(true);
    });

    it('should return false when embedding service is unavailable', async () => {
      mockEmbeddingService.isAvailable.mockResolvedValue(false);

      const result = await searchService.isSemanticSearchAvailable();
      expect(result).toBe(false);
    });
  });

  describe('getSearchStats', () => {
    it('should return accurate search statistics', async () => {
      vi.spyOn(searchService as any, 'getAllAvailableNodes')
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

      mockStore.getState.mockReturnValue({
        vectorData: partialVectorData,
        dataMode: 'mock'
      });

      vi.spyOn(searchService as any, 'getAllAvailableNodes')
        .mockResolvedValue(mockDreamNodes);

      const stats = await searchService.getSearchStats();

      expect(stats.totalNodes).toBe(3);
      expect(stats.indexedNodes).toBe(2);
      expect(stats.indexingCoverage).toBeCloseTo(2/3);
    });
  });
});