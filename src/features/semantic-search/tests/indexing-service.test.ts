import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { IndexingService, VectorData } from '../services/indexing-service';
import { DreamNode } from '../../../types/dreamnode';
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

describe('IndexingService', () => {
  let indexingService: IndexingService;
  let mockDreamNode: DreamNode;

  beforeEach(() => {
    // Create mock DreamNode
    mockDreamNode = {
      id: 'test-node-1',
      name: 'Test Node',
      type: 'dream',
      position: [0, 0, 0],
      repoPath: '/path/to/repo',
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

    // Setup mock store
    const mockUpdateVectorData = vi.fn();
    const mockGetState = vi.mocked(useInterBrainStore.getState);
    mockGetState.mockReturnValue({
      vectorData: new Map(),
      updateVectorData: mockUpdateVectorData,
      dataMode: 'mock'
    } as any);

    indexingService = new IndexingService();
    
    // Setup mock embedding service
    const mockEmbeddingService = vi.mocked(ollamaEmbeddingService);
    mockEmbeddingService.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]);
    mockEmbeddingService.processLongText.mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]);
    mockEmbeddingService.isAvailable.mockResolvedValue(true);
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

  describe('indexNode', () => {
    it('should successfully index a node', async () => {
      const result = await indexingService.indexNode(mockDreamNode);

      expect(result).toMatchObject({
        nodeId: 'test-node-1',
        metadata: {
          title: 'Test Node',
          type: 'dream'
        }
      });
      expect(result.embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
      expect(result.lastIndexed).toBeGreaterThan(0);
    });

    it('should generate content hash', async () => {
      const result = await indexingService.indexNode(mockDreamNode);
      expect(result.contentHash).toBeDefined();
      expect(typeof result.contentHash).toBe('string');
      expect(result.contentHash.length).toBeGreaterThan(0);
    });

    it('should handle embedding service failures', async () => {
      const mockEmbeddingService = vi.mocked(ollamaEmbeddingService);
      mockEmbeddingService.processLongText.mockRejectedValue(new Error('Embedding failed'));

      const result = await indexingService.indexNode(mockDreamNode);
      
      // Should complete successfully but use fallback embedding (768 dimensions)
      expect(result).toMatchObject({
        nodeId: 'test-node-1',
        metadata: {
          title: 'Test Node',
          type: 'dream'
        }
      });
      expect(result.embedding).toHaveLength(768); // Fallback embedding dimensions
      expect(result.lastIndexed).toBeGreaterThan(0);
    });
  });

  describe('getVector', () => {
    it('should return null for non-existent node', () => {
      const result = indexingService.getVector('non-existent');
      expect(result).toBeNull();
    });

    it('should return vector data for existing node', () => {
      const vectorData: VectorData = {
        nodeId: 'test-node-1',
        contentHash: 'abc123',
        embedding: [0.1, 0.2, 0.3],
        lastIndexed: Date.now(),
        metadata: {
          title: 'Test',
          type: 'dream',
          wordCount: 100
        }
      };

      // Mock store with existing data
      const mockGetStateWithData = vi.mocked(useInterBrainStore.getState);
      mockGetStateWithData.mockReturnValue({
        vectorData: new Map([['test-node-1', vectorData]]),
        updateVectorData: vi.fn(),
        dataMode: 'mock'
      } as any);

      const result = indexingService.getVector('test-node-1');
      expect(result).toEqual(vectorData);
    });
  });

  describe('needsReindex', () => {
    it('should return true for non-indexed node', () => {
      const result = indexingService.needsReindex('new-node');
      expect(result).toBe(true);
    });

    it('should return false for up-to-date node', () => {
      const vectorData: VectorData = {
        nodeId: 'test-node-1',
        contentHash: 'abc123',
        embedding: [0.1, 0.2, 0.3],
        lastIndexed: Date.now(),
        metadata: {
          title: 'Test',
          type: 'dream',
          wordCount: 100,
          commitHash: 'abc123'
        }
      };

      vi.mocked(useInterBrainStore.getState).mockReturnValue({
        vectorData: new Map([['test-node-1', vectorData]]),
        updateVectorData: vi.fn(),
        dataMode: 'mock'
      } as any);

      const result = indexingService.needsReindex('test-node-1', 'abc123');
      expect(result).toBe(false);
    });

    it('should return true for changed node', () => {
      const vectorData: VectorData = {
        nodeId: 'test-node-1',
        contentHash: 'old-hash',
        embedding: [0.1, 0.2, 0.3],
        lastIndexed: Date.now() - 1000,
        metadata: {
          title: 'Test',
          type: 'dream',
          wordCount: 100,
          commitHash: 'old-hash'
        }
      };

      vi.mocked(useInterBrainStore.getState).mockReturnValue({
        vectorData: new Map([['test-node-1', vectorData]]),
        updateVectorData: vi.fn(),
        dataMode: 'mock'
      } as any);

      const result = indexingService.needsReindex('test-node-1', 'new-hash');
      expect(result).toBe(true);
    });
  });

  describe('getProgress', () => {
    it('should return idle progress by default', () => {
      const progress = indexingService.getProgress();
      expect(progress.status).toBe('idle');
      expect(progress.total).toBe(0);
      expect(progress.completed).toBe(0);
    });
  });

  describe('getAllVectors', () => {
    it('should return all vector data', () => {
      const vectorData1: VectorData = {
        nodeId: 'node-1',
        contentHash: 'hash1',
        embedding: [0.1, 0.2],
        lastIndexed: Date.now(),
        metadata: { title: 'Node 1', type: 'dream', wordCount: 50 }
      };

      const vectorData2: VectorData = {
        nodeId: 'node-2', 
        contentHash: 'hash2',
        embedding: [0.3, 0.4],
        lastIndexed: Date.now(),
        metadata: { title: 'Node 2', type: 'dreamer', wordCount: 75 }
      };

      vi.mocked(useInterBrainStore.getState).mockReturnValue({
        vectorData: new Map([
          ['node-1', vectorData1],
          ['node-2', vectorData2]
        ]),
        updateVectorData: vi.fn(),
        dataMode: 'mock'
      } as any);

      const result = indexingService.getAllVectors();
      expect(result).toHaveLength(2);
      expect(result).toContain(vectorData1);
      expect(result).toContain(vectorData2);
    });
  });

  describe('getEmbeddingStatus', () => {
    it('should return available status when service is healthy', async () => {
      const mockEmbeddingService = vi.mocked(ollamaEmbeddingService);
      mockEmbeddingService.isAvailable.mockResolvedValue(true);

      const status = await indexingService.getEmbeddingStatus();
      expect(status.available).toBe(true);
      expect(status.message).toContain('ready');
    });

    it('should return unavailable status when service is down', async () => {
      const mockEmbeddingService = vi.mocked(ollamaEmbeddingService);
      mockEmbeddingService.isAvailable.mockResolvedValue(false);

      const status = await indexingService.getEmbeddingStatus();
      expect(status.available).toBe(false);
      expect(status.message).toContain('unavailable');
    });
  });
});