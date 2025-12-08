import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { IndexingService, VectorData } from '../services/indexing-service';
import { DreamNode } from '../../dreamnode';
import { useInterBrainStore } from '../../../core/store/interbrain-store';

// Mock the store
vi.mock('../../../core/store/interbrain-store', () => ({
  useInterBrainStore: {
    getState: vi.fn()
  }
}));

describe('IndexingService', () => {
  let indexingService: IndexingService;
  let mockStore: any;
  let mockNodes: DreamNode[];

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create fresh service instance
    indexingService = new IndexingService();

    // Create mock nodes
    mockNodes = [
      {
        id: 'node-1',
        name: 'Test Dream 1',
        type: 'dream',
        position: [0, 0, -5000],
        dreamTalkMedia: [],
        dreamSongContent: [],
        liminalWebConnections: [],
        repoPath: 'test-dream-1',
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
        name: 'Test Dreamer 1',
        type: 'dreamer',
        position: [1000, 0, -4000],
        dreamTalkMedia: [
          {
            path: 'avatar.png',
            absolutePath: '/path/to/avatar.png',
            type: 'image/png',
            data: 'data:image/png;base64,test',
            size: 1024
          }
        ],
        dreamSongContent: [],
        liminalWebConnections: ['node-1'],
        repoPath: 'test-dreamer-1',
        hasUnsavedChanges: false,
        gitStatus: {
          hasUncommittedChanges: false,
          hasStashedChanges: false,
          hasUnpushedChanges: false,
          lastChecked: Date.now(),
          details: {
            commitHash: 'abc123def456'
          }
        }
      }
    ];

    // Create mock store with realNodes Map (no more mock data mode)
    mockStore = {
      realNodes: new Map([
        ['node-1', { node: mockNodes[0], lastSynced: Date.now() }],
        ['node-2', { node: mockNodes[1], lastSynced: Date.now() }]
      ]),
      vectorData: new Map<string, VectorData>(),
      updateVectorData: vi.fn(),
      deleteVectorData: vi.fn(),
      clearVectorData: vi.fn()
    };

    (useInterBrainStore.getState as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockStore);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('indexNode', () => {
    it('should create vector data for a node', async () => {
      const node = mockNodes[0];

      const result = await indexingService.indexNode(node);

      expect(result).toMatchObject({
        nodeId: 'node-1',
        embedding: expect.any(Array),
        lastIndexed: expect.any(Number),
        metadata: {
          title: 'Test Dream 1',
          type: 'dream',
          wordCount: expect.any(Number)
        }
      });

      expect(mockStore.updateVectorData).toHaveBeenCalledWith('node-1', result);
    });

    it('should include git commit hash in vector data when available', async () => {
      const node = mockNodes[1]; // Has commit hash

      const result = await indexingService.indexNode(node);

      expect(result.metadata.commitHash).toBe('abc123def456');
      expect(result.contentHash).toBe('abc123def456');
    });

    it('should create embedding with correct dimensions', async () => {
      const node = mockNodes[0];

      const result = await indexingService.indexNode(node);

      expect(result.embedding).toHaveLength(768);
      expect(result.embedding.every(val => typeof val === 'number')).toBe(true);
    });

    it('should count words correctly in extracted text', async () => {
      const nodeWithMedia = mockNodes[1];

      const result = await indexingService.indexNode(nodeWithMedia);

      // Should count words in: "Test Dreamer 1 Media: avatar.png Connections: node-1"
      expect(result.metadata.wordCount).toBe(7);
    });
  });

  describe('indexAllNodes', () => {
    it('should index all nodes and return correct stats', async () => {
      const result = await indexingService.indexAllNodes();

      expect(result).toEqual({
        indexed: 2,
        errors: 0
      });

      expect(mockStore.updateVectorData).toHaveBeenCalledTimes(2);
    });

    it('should complete indexing without throwing errors', async () => {
      const result = await indexingService.indexAllNodes();

      expect(typeof result.indexed).toBe('number');
      expect(typeof result.errors).toBe('number');
      expect(result.indexed + result.errors).toBe(2); // Total should match input
    });
  });

  describe('intelligentReindex', () => {
    it('should detect and add new nodes', async () => {
      // No existing vectors
      mockStore.vectorData = new Map();

      const result = await indexingService.intelligentReindex();

      expect(result).toEqual({
        updated: 0,
        added: 2,
        errors: 0
      });

      expect(mockStore.updateVectorData).toHaveBeenCalledTimes(2);
    });

    it('should detect and update changed nodes', async () => {
      // Add existing vectors with old commit hashes
      const oldVector: VectorData = {
        nodeId: 'node-2',
        contentHash: 'old-hash',
        embedding: new Array(128).fill(0.1),
        lastIndexed: Date.now() - 1000,
        metadata: {
          title: 'Test Dreamer 1',
          type: 'dreamer',
          wordCount: 5,
          commitHash: 'old-commit-hash'
        }
      };

      mockStore.vectorData = new Map([['node-2', oldVector]]);

      const result = await indexingService.intelligentReindex();

      expect(result).toEqual({
        updated: 1, // node-2 updated due to commit hash change
        added: 1,   // node-1 is new
        errors: 0
      });
    });

    it('should remove vectors for deleted nodes', async () => {
      // Add vector for node that no longer exists
      const deletedVector: VectorData = {
        nodeId: 'deleted-node',
        contentHash: 'hash',
        embedding: new Array(128).fill(0.1),
        lastIndexed: Date.now(),
        metadata: {
          title: 'Deleted Node',
          type: 'dream',
          wordCount: 2
        }
      };

      mockStore.vectorData = new Map([['deleted-node', deletedVector]]);

      const result = await indexingService.intelligentReindex();

      expect(result.added).toBe(2); // Both nodes are new
      expect(mockStore.deleteVectorData).toHaveBeenCalledWith('deleted-node');
    });

    it('should skip unchanged nodes', async () => {
      // Add current vectors for both nodes
      const vector1: VectorData = {
        nodeId: 'node-1',
        contentHash: 'content-hash-1',
        embedding: new Array(128).fill(0.1),
        lastIndexed: Date.now(),
        metadata: {
          title: 'Test Dream 1',
          type: 'dream',
          wordCount: 3
        }
      };

      const vector2: VectorData = {
        nodeId: 'node-2',
        contentHash: 'abc123def456', // Same as current commit hash
        embedding: new Array(128).fill(0.1),
        lastIndexed: Date.now(),
        metadata: {
          title: 'Test Dreamer 1',
          type: 'dreamer',
          wordCount: 6,
          commitHash: 'abc123def456'
        }
      };

      mockStore.vectorData = new Map([
        ['node-1', vector1],
        ['node-2', vector2]
      ]);

      const result = await indexingService.intelligentReindex();

      expect(result).toEqual({
        updated: 0,
        added: 0,
        errors: 0
      });

      // Should not call updateVectorData for unchanged nodes
      expect(mockStore.updateVectorData).not.toHaveBeenCalled();
    });
  });

  describe('getVector', () => {
    it('should return vector data for existing node', () => {
      const vectorData: VectorData = {
        nodeId: 'node-1',
        contentHash: 'hash',
        embedding: [0.1, 0.2, 0.3],
        lastIndexed: Date.now(),
        metadata: {
          title: 'Test',
          type: 'dream',
          wordCount: 1
        }
      };

      mockStore.vectorData.set('node-1', vectorData);

      const result = indexingService.getVector('node-1');

      expect(result).toEqual(vectorData);
    });

    it('should return null for non-existent node', () => {
      const result = indexingService.getVector('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getAllVectors', () => {
    it('should return all vector data', () => {
      const vector1: VectorData = {
        nodeId: 'node-1',
        contentHash: 'hash1',
        embedding: [0.1],
        lastIndexed: Date.now(),
        metadata: { title: 'Test 1', type: 'dream', wordCount: 2 }
      };

      const vector2: VectorData = {
        nodeId: 'node-2',
        contentHash: 'hash2',
        embedding: [0.2],
        lastIndexed: Date.now(),
        metadata: { title: 'Test 2', type: 'dreamer', wordCount: 2 }
      };

      mockStore.vectorData.set('node-1', vector1);
      mockStore.vectorData.set('node-2', vector2);

      const result = indexingService.getAllVectors();

      expect(result).toHaveLength(2);
      expect(result).toContain(vector1);
      expect(result).toContain(vector2);
    });
  });

  describe('needsReindex', () => {
    it('should return true for non-existent vector', () => {
      const result = indexingService.needsReindex('non-existent');

      expect(result).toBe(true);
    });

    it('should return true for changed commit hash', () => {
      const vectorData: VectorData = {
        nodeId: 'node-1',
        contentHash: 'old-hash',
        embedding: [0.1],
        lastIndexed: Date.now(),
        metadata: {
          title: 'Test',
          type: 'dream',
          wordCount: 1,
          commitHash: 'old-commit'
        }
      };

      mockStore.vectorData.set('node-1', vectorData);

      const result = indexingService.needsReindex('node-1', 'new-commit');

      expect(result).toBe(true);
    });

    it('should return false for unchanged commit hash', () => {
      const vectorData: VectorData = {
        nodeId: 'node-1',
        contentHash: 'current-hash',
        embedding: [0.1],
        lastIndexed: Date.now(),
        metadata: {
          title: 'Test',
          type: 'dream',
          wordCount: 1,
          commitHash: 'current-commit'
        }
      };

      mockStore.vectorData.set('node-1', vectorData);

      const result = indexingService.needsReindex('node-1', 'current-commit');

      expect(result).toBe(false);
    });

    it('should return true for old vectors without commit hash (fallback to time)', () => {
      const oldTime = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago

      const vectorData: VectorData = {
        nodeId: 'node-1',
        contentHash: 'hash',
        embedding: [0.1],
        lastIndexed: oldTime,
        metadata: {
          title: 'Test',
          type: 'dream',
          wordCount: 1
        }
      };

      mockStore.vectorData.set('node-1', vectorData);

      const result = indexingService.needsReindex('node-1');

      expect(result).toBe(true);
    });
  });

  describe('getProgress', () => {
    it('should return current progress state', () => {
      const progress = indexingService.getProgress();

      expect(progress).toMatchObject({
        total: 0,
        completed: 0,
        status: 'idle'
      });
    });
  });

  describe('clearIndex', () => {
    it('should clear all vector data and reset progress', () => {
      indexingService.clearIndex();

      expect(mockStore.clearVectorData).toHaveBeenCalled();

      const progress = indexingService.getProgress();
      expect(progress.status).toBe('idle');
      expect(progress.total).toBe(0);
      expect(progress.completed).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return indexing statistics', () => {
      // Add some vectors to store
      mockStore.vectorData.set('node-1', {} as VectorData);
      mockStore.vectorData.set('node-2', {} as VectorData);

      const stats = indexingService.getStats();

      expect(stats).toMatchObject({
        totalIndexed: 2,
        lastIndexTime: undefined,
        avgIndexTime: undefined
      });
    });

    it('should provide timing fields in stats format', async () => {
      const stats = indexingService.getStats();

      // Stats structure should have these fields
      expect(stats).toHaveProperty('lastIndexTime');
      expect(stats).toHaveProperty('avgIndexTime');
      expect(stats).toHaveProperty('totalIndexed');

      // Should be proper types (undefined or number)
      expect(['number', 'undefined']).toContain(typeof stats.lastIndexTime);
      expect(['number', 'undefined']).toContain(typeof stats.avgIndexTime);
      expect(typeof stats.totalIndexed).toBe('number');
    });
  });
});
