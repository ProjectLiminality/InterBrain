import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { IndexingService, VectorData } from '../services/indexing-service';
import { DreamNode } from '../../../types/dreamnode';

// Mock dependencies
vi.mock('../../../store/interbrain-store');
vi.mock('../services/ollama-embedding-service');

const mockStore = {
  getState: vi.fn(),
  setState: vi.fn()
};

const mockEmbeddingService = {
  generateEmbedding: vi.fn(),
  isAvailable: vi.fn(),
  getHealth: vi.fn()
};

describe('IndexingService', () => {
  let indexingService: IndexingService;
  let mockDreamNode: DreamNode;

  beforeEach(() => {
    // Create mock DreamNode
    mockDreamNode = {
      id: 'test-node-1',
      name: 'Test Node',
      type: 'dream',
      repoPath: '/path/to/repo',
      lastModified: Date.now(),
      gitStatus: 'clean',
      liminalWebConnections: []
    } as DreamNode;

    // Setup mock store
    mockStore.getState.mockReturnValue({
      vectorData: new Map(),
      updateVectorData: vi.fn(),
      dataMode: 'mock'
    });

    indexingService = new IndexingService();
    
    // Setup mock embedding service
    mockEmbeddingService.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]);
    mockEmbeddingService.isAvailable.mockResolvedValue(true);
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
      mockEmbeddingService.generateEmbedding.mockRejectedValue(new Error('Embedding failed'));

      await expect(indexingService.indexNode(mockDreamNode)).rejects.toThrow('Embedding failed');
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
      mockStore.getState.mockReturnValue({
        vectorData: new Map([['test-node-1', vectorData]]),
        updateVectorData: vi.fn(),
        dataMode: 'mock'
      });

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

      mockStore.getState.mockReturnValue({
        vectorData: new Map([['test-node-1', vectorData]]),
        updateVectorData: vi.fn(),
        dataMode: 'mock'
      });

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

      mockStore.getState.mockReturnValue({
        vectorData: new Map([['test-node-1', vectorData]]),
        updateVectorData: vi.fn(),
        dataMode: 'mock'
      });

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

      mockStore.getState.mockReturnValue({
        vectorData: new Map([
          ['node-1', vectorData1],
          ['node-2', vectorData2]
        ]),
        updateVectorData: vi.fn(),
        dataMode: 'mock'
      });

      const result = indexingService.getAllVectors();
      expect(result).toHaveLength(2);
      expect(result).toContain(vectorData1);
      expect(result).toContain(vectorData2);
    });
  });

  describe('getEmbeddingStatus', () => {
    it('should return available status when service is healthy', async () => {
      mockEmbeddingService.isAvailable.mockResolvedValue(true);

      const status = await indexingService.getEmbeddingStatus();
      expect(status.isAvailable).toBe(true);
      expect(status.message).toContain('available');
    });

    it('should return unavailable status when service is down', async () => {
      mockEmbeddingService.isAvailable.mockResolvedValue(false);

      const status = await indexingService.getEmbeddingStatus();
      expect(status.isAvailable).toBe(false);
      expect(status.message).toContain('unavailable');
    });
  });
});