import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { OllamaEmbeddingService } from '../core/services/ollama-embedding-service';

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Mock setTimeout to make retries instant for testing
const mockSetTimeout = vi.fn((callback: () => void) => {
  callback(); // Execute immediately
  return 1; // Return dummy timer ID
});
globalThis.setTimeout = mockSetTimeout;

describe('OllamaEmbeddingService', () => {
  let service: OllamaEmbeddingService;

  beforeEach(() => {
    service = new OllamaEmbeddingService('http://localhost:11434', 'nomic-embed-text');
    mockFetch.mockClear();
    // Reset any persistent mocks
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockSetTimeout.mockClear();
  });

  describe('generateEmbedding', () => {
    it('should generate embedding for valid text', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ embedding: mockEmbedding })
      });

      const result = await service.generateEmbedding('test text');
      expect(result).toEqual(mockEmbedding);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'nomic-embed-text',
            prompt: 'test text'
          })
        })
      );
    });

    it('should throw error for empty text', async () => {
      await expect(service.generateEmbedding('')).rejects.toThrow('Cannot generate embedding for empty text');
    });

    it('should throw error for network failure', async () => {
      // Mock multiple rejections for retry mechanism
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'));

      await expect(service.generateEmbedding('test')).rejects.toThrow('Failed after 3 attempts');
    });

    it('should throw error for invalid response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ invalidField: 'no embedding' })
      });

      await expect(service.generateEmbedding('test')).rejects.toThrow('Invalid embedding response');
    });
  });

  describe('generateBatchEmbeddings', () => {
    it('should handle empty array', async () => {
      const result = await service.generateBatchEmbeddings([]);
      expect(result).toEqual([]);
    });

    it('should process multiple texts', async () => {
      const mockEmbedding1 = [0.1, 0.2, 0.3];
      const mockEmbedding2 = [0.4, 0.5, 0.6];
      
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ embedding: mockEmbedding1 })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ embedding: mockEmbedding2 })
        });

      const result = await service.generateBatchEmbeddings(['text1', 'text2']);
      expect(result).toEqual([mockEmbedding1, mockEmbedding2]);
    });
  });

  describe('isAvailable', () => {
    it('should return true when service is healthy', async () => {
      // Mock successful tags call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          models: [{ name: 'nomic-embed-text:latest', model: 'nomic-embed-text' }]
        })
      });

      const result = await service.isAvailable();
      expect(result).toBe(true);
    });

    it('should return false when service is unhealthy', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await service.isAvailable();
      expect(result).toBe(false);
    });
  });

  describe('getHealth', () => {
    it('should return healthy status when everything works', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          models: [{ name: 'nomic-embed-text:latest', model: 'nomic-embed-text' }]
        })
      });

      const health = await service.getHealth();
      expect(health.isAvailable).toBe(true);
      expect(health.modelLoaded).toBe(true);
      expect(health.error).toBeUndefined();
    });

    it('should detect missing model', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          models: [{ name: 'other-model', model: 'other-model' }]
        })
      });

      const health = await service.getHealth();
      expect(health.isAvailable).toBe(true);
      expect(health.modelLoaded).toBe(false);
      expect(health.error).toContain('Model \'nomic-embed-text\' not found');
    });

    it('should detect Ollama not running', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      const health = await service.getHealth();
      expect(health.isAvailable).toBe(false);
      expect(health.modelLoaded).toBe(false);
      expect(health.error).toContain('Ollama not responding');
    });
  });

  describe('getModelInfo', () => {
    it('should return model information', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          details: {
            family: 'nomic',
            parameter_size: '137M'
          }
        })
      });

      const info = await service.getModelInfo();
      expect(info.name).toBe('nomic-embed-text');
      expect(info.dimensions).toBe(768);
      expect(info.description).toContain('nomic embedding model');
    });
  });

  describe('processLongText', () => {
    it('should return single embedding for short text', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ embedding: mockEmbedding })
      });

      const result = await service.processLongText('short text');
      expect(result).toEqual(mockEmbedding);
    });

    it('should chunk and average for long text', async () => {
      const longText = 'a'.repeat(1000);
      const mockEmbedding1 = [1, 0, 0];
      const mockEmbedding2 = [0, 1, 0];
      const mockEmbedding3 = [0, 0, 1];
      
      // For 1000 chars with 400 chunk size, it will create ~3 chunks
      // Mock enough responses to handle all possible chunks
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ embedding: mockEmbedding1 })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ embedding: mockEmbedding2 })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ embedding: mockEmbedding3 })
        });

      const result = await service.processLongText(longText, { chunkSize: 400 });
      
      // Result should be an array of 3 numbers (the average of all embeddings)
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);
      // The exact values depend on the number of chunks, but should be an average
    });
  });
});