import { describe, it, expect } from 'vitest';
import { TextProcessor, VectorUtils } from '../core/services/embedding-service';

describe('TextProcessor', () => {
  describe('cleanText', () => {
    it('should remove extra whitespace', () => {
      const result = TextProcessor.cleanText('  hello   world  ');
      expect(result).toBe('hello world');
    });

    it('should handle empty strings', () => {
      const result = TextProcessor.cleanText('');
      expect(result).toBe('');
    });

    it('should preserve single spaces', () => {
      const result = TextProcessor.cleanText('hello world');
      expect(result).toBe('hello world');
    });
  });

  describe('extractContent', () => {
    it('should remove markdown formatting', () => {
      const markdown = '# Title\n\n**Bold text** and *italic*\n\n- List item\n- Another item';
      const result = TextProcessor.extractContent(markdown);
      expect(result).toContain('Title');
      expect(result).toContain('Bold text');
      expect(result).not.toContain('#');
      expect(result).not.toContain('**');
    });

    it('should handle empty content', () => {
      const result = TextProcessor.extractContent('');
      expect(result).toBe('');
    });
  });

  describe('chunkText', () => {
    it('should split text into chunks', () => {
      const text = 'a'.repeat(1000);
      const chunks = TextProcessor.chunkText(text, 300, 50);
      
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0]).toHaveLength(300);
    });

    it('should handle overlap correctly', () => {
      const text = 'abcdefghijklmnopqrstuvwxyz'.repeat(20);
      const chunks = TextProcessor.chunkText(text, 100, 20);
      
      expect(chunks.length).toBeGreaterThan(1);
      // Should have overlap between chunks
      expect(chunks[1].substring(0, 20)).toBe(chunks[0].substring(80, 100));
    });

    it('should return single chunk for short text', () => {
      const text = 'short text';
      const chunks = TextProcessor.chunkText(text, 100, 20);
      
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(text);
    });
  });
});

describe('VectorUtils', () => {
  describe('cosineSimilarity', () => {
    it('should calculate similarity between identical vectors', () => {
      const vector = [1, 2, 3, 4, 5];
      const similarity = VectorUtils.cosineSimilarity(vector, vector);
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('should calculate similarity between orthogonal vectors', () => {
      const vector1 = [1, 0, 0];
      const vector2 = [0, 1, 0];
      const similarity = VectorUtils.cosineSimilarity(vector1, vector2);
      expect(similarity).toBeCloseTo(0.0, 5);
    });

    it('should handle opposite vectors', () => {
      const vector1 = [1, 2, 3];
      const vector2 = [-1, -2, -3];
      const similarity = VectorUtils.cosineSimilarity(vector1, vector2);
      expect(similarity).toBeCloseTo(-1.0, 5);
    });

    it('should throw error for mismatched dimensions', () => {
      const vector1 = [1, 2, 3];
      const vector2 = [1, 2];
      expect(() => VectorUtils.cosineSimilarity(vector1, vector2)).toThrow();
    });
  });

  describe('averageVectors', () => {
    it('should average multiple vectors', () => {
      const vectors = [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9]
      ];
      const average = VectorUtils.averageVectors(vectors);
      expect(average).toEqual([4, 5, 6]);
    });

    it('should handle single vector', () => {
      const vectors = [[1, 2, 3]];
      const average = VectorUtils.averageVectors(vectors);
      expect(average).toEqual([1, 2, 3]);
    });

    it('should throw error for empty array', () => {
      expect(() => VectorUtils.averageVectors([])).toThrow();
    });

    it('should throw error for mismatched dimensions', () => {
      const vectors = [
        [1, 2, 3],
        [4, 5]
      ];
      expect(() => VectorUtils.averageVectors(vectors)).toThrow();
    });
  });

  describe('normalizeVector', () => {
    it('should normalize vector to unit length', () => {
      const vector = [3, 4, 0];
      const normalized = VectorUtils.normalizeVector(vector);
      const magnitude = Math.sqrt(normalized.reduce((sum, val) => sum + val * val, 0));
      expect(magnitude).toBeCloseTo(1.0, 5);
    });

    it('should handle zero vector', () => {
      const vector = [0, 0, 0];
      const normalized = VectorUtils.normalizeVector(vector);
      expect(normalized).toEqual([0, 0, 0]);
    });
  });
});