/**
 * Mock Qwen3 Embedding Service for testing semantic search architecture
 * This provides fake but realistic embeddings until the bundling issue is resolved
 */

import { EmbeddingService, ModelInfo } from './embedding-service'

/**
 * Mock implementation that generates realistic embeddings for testing
 * Uses deterministic pseudo-embeddings based on text content
 */
export class MockQwen3EmbeddingService implements EmbeddingService {
  private static instance: MockQwen3EmbeddingService
  private initialized = false

  private constructor() {}

  /**
   * Singleton access
   */
  static getInstance(): MockQwen3EmbeddingService {
    if (!MockQwen3EmbeddingService.instance) {
      MockQwen3EmbeddingService.instance = new MockQwen3EmbeddingService()
    }
    return MockQwen3EmbeddingService.instance
  }

  /**
   * Mock initialization (instant)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    console.log('🤖 [MOCK] Initializing Mock Qwen3 embedding model...')
    
    // Simulate brief initialization delay
    await new Promise(resolve => globalThis.setTimeout(resolve, 100))
    
    console.log('✅ [MOCK] Mock Qwen3 model initialized (using deterministic embeddings)')
    this.initialized = true
  }

  /**
   * Generate deterministic pseudo-embedding based on text content
   * Creates realistic 1024-dimensional vectors with semantic-ish clustering
   */
  async generateEmbedding(text: string): Promise<number[]> {
    await this.initialize()

    const embedding = new Array(1024)
    
    // Create deterministic but varied embeddings based on text content
    const textHash = this.simpleHash(text.toLowerCase())
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0)
    
    // Generate base embedding from text hash
    for (let i = 0; i < 1024; i++) {
      const seedA = (textHash + i) * 0.618033988749895 // Golden ratio
      const seedB = (textHash * i) * 0.314159265358979 // Pi/10
      embedding[i] = Math.sin(seedA) * Math.cos(seedB) * 0.1
    }
    
    // Add semantic clustering based on keywords
    this.addSemanticClustering(embedding, words)
    
    // Normalize the vector
    this.normalizeVector(embedding)
    
    return embedding
  }

  /**
   * Generate embeddings for multiple texts
   */
  async batchEmbedding(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = []
    
    for (const text of texts) {
      embeddings.push(await this.generateEmbedding(text))
    }
    
    return embeddings
  }

  /**
   * Get mock model information
   */
  getModelInfo(): ModelInfo {
    return {
      id: 'mock-qwen3-embedding',
      name: 'Mock Qwen3-Embedding-0.6B',
      description: '[MOCK] Deterministic pseudo-embeddings for testing (1024 dimensions)',
      size: '0MB (mock)',
      dimensions: 1024,
      contextLength: 32768,
      languages: ['en', 'zh', 'multilingual', 'code']
    }
  }

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Simple hash function for deterministic seed generation
   */
  private simpleHash(text: string): number {
    let hash = 0
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash)
  }

  /**
   * Add semantic clustering to make similar concepts closer
   */
  private addSemanticClustering(embedding: number[], words: string[]): void {
    // Define semantic clusters with their boost patterns
    const clusters = {
      ai: ['artificial', 'intelligence', 'machine', 'learning', 'neural', 'model', 'algorithm'],
      creative: ['creative', 'writing', 'art', 'design', 'story', 'narrative', 'imagination'],
      philosophy: ['philosophy', 'consciousness', 'mind', 'thought', 'metaphysics', 'wisdom'],
      technology: ['technology', 'software', 'code', 'programming', 'development', 'system']
    }
    
    // Apply clustering boosts
    for (const [clusterName, keywords] of Object.entries(clusters)) {
      const matchCount = words.filter(word => 
        keywords.some(keyword => word.includes(keyword) || keyword.includes(word))
      ).length
      
      if (matchCount > 0) {
        const clusterHash = this.simpleHash(clusterName)
        const boost = matchCount * 0.05 // Boost strength
        
        // Apply boost to specific dimensions associated with this cluster
        for (let i = 0; i < 50; i++) {
          const idx = (clusterHash + i * 17) % 1024
          embedding[idx] += boost * Math.sin(i * 0.1)
        }
      }
    }
  }

  /**
   * Normalize vector to unit length
   */
  private normalizeVector(vector: number[]): void {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0))
    
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude
      }
    }
  }
}