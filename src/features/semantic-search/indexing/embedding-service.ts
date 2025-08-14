// TEMPORARY: Disable Transformers.js import while ONNX runtime issues are resolved
// import { pipeline, env } from '@xenova/transformers'
import { modelManagerService } from '../services/model-manager-service'

// TODO: Re-enable when ONNX runtime works in Obsidian
// Configure Transformers.js for Obsidian environment
// env.allowRemoteModels = true
// env.allowLocalModels = false
// env.useBrowserCache = true

/**
 * Model information interface
 */
export interface ModelInfo {
  id: string
  name: string
  description: string
  size: string
  dimensions: number
  contextLength: number
  languages: string[]
}

/**
 * Embedding service interface
 */
export interface EmbeddingService {
  initialize(): Promise<void>
  generateEmbedding(text: string): Promise<number[]>
  batchEmbedding(texts: string[]): Promise<number[][]>
  getModelInfo(): ModelInfo
  isInitialized(): boolean
}

/**
 * Qwen3 Embedding Service using Hugging Face Transformers.js
 * Integrates with the existing IndexingService architecture
 */
export class Qwen3EmbeddingService implements EmbeddingService {
  private static instance: Qwen3EmbeddingService
  private pipeline: unknown = null
  private initialized = false

  // Model configuration
  private static readonly MODEL_CONFIG = {
    modelId: 'Xenova/all-MiniLM-L6-v2',
    pooling: 'mean' as const,
    normalize: true
  }

  private constructor() {}

  /**
   * Singleton access
   */
  static getInstance(): Qwen3EmbeddingService {
    if (!Qwen3EmbeddingService.instance) {
      Qwen3EmbeddingService.instance = new Qwen3EmbeddingService()
    }
    return Qwen3EmbeddingService.instance
  }

  /**
   * TEMPORARY: Initialize fallback embedding system while ONNX runtime issues are resolved
   * TODO: Replace with real Transformers.js pipeline when ONNX runtime is working
   */
  async initialize(): Promise<void> {
    if (this.initialized && this.pipeline) {
      return
    }

    console.log(`🤖 Initializing fallback embedding system...`)
    
    try {
      // Check if model is available through ModelManagerService
      const isModelAvailable = await modelManagerService.isModelAvailable()
      
      if (!isModelAvailable) {
        const error = new Error('Embedding system not available. Please run "Download Embedding Model" command first.')
        console.error('❌', error.message)
        throw error
      }

      console.log('📦 Fallback embedding system found, initializing...')
      
      const startTime = globalThis.performance.now()
      
      // Create a mock pipeline object for character frequency embeddings
      this.pipeline = {
        initialized: true,
        type: 'character-frequency-fallback'
      }

      const initTime = globalThis.performance.now() - startTime
      console.log(`✅ Fallback embedding system initialized in ${initTime.toFixed(2)}ms`)
      console.log(`⚠️ Using character frequency embeddings (basic semantic search)`)
      
      this.initialized = true
    } catch (error) {
      console.error('❌ Failed to initialize fallback embedding system:', error)
      
      // Provide helpful error messages
      if (error instanceof Error && error.message.includes('not available')) {
        throw error // Re-throw our custom error message
      } else {
        throw new Error(`Fallback embedding system initialization failed: ${error}. Try running the download command first.`)
      }
    }
  }

  /**
   * TEMPORARY: Generate character frequency embedding while ONNX runtime issues are resolved
   * TODO: Replace with real neural embeddings when Transformers.js is working
   */
  async generateEmbedding(text: string): Promise<number[]> {
    await this.initialize()

    if (!this.pipeline) {
      throw new Error('Embedding system not initialized')
    }

    try {
      // Generate character frequency embedding (384 dimensions to match all-MiniLM-L6-v2)
      const embedding = this.generateCharacterFrequencyEmbedding(text)
      
      return embedding
    } catch (error) {
      console.error('❌ Embedding generation failed:', error)
      throw new Error(`Embedding generation failed: ${error}`)
    }
  }

  /**
   * Generate character frequency based embedding
   * This provides basic semantic similarity based on character patterns
   */
  private generateCharacterFrequencyEmbedding(text: string): number[] {
    const dimensions = 384 // Match all-MiniLM-L6-v2 dimensions
    const embedding = new Array(dimensions).fill(0)
    
    // Normalize text to lowercase for consistent embeddings
    const normalizedText = text.toLowerCase()
    
    // Character frequency mapping
    const charFreq = new Map<string, number>()
    for (const char of normalizedText) {
      if (char.match(/[a-z\s]/)) { // Only count letters and spaces
        charFreq.set(char, (charFreq.get(char) || 0) + 1)
      }
    }
    
    // Fill embedding dimensions based on character frequencies
    let index = 0
    for (const [char, freq] of charFreq.entries()) {
      if (index >= dimensions) break
      
      // Use character code and frequency to create features
      const charCode = char.charCodeAt(0)
      const normalizedFreq = freq / normalizedText.length
      
      // Spread the influence across multiple dimensions
      for (let i = 0; i < 3 && index < dimensions; i++, index++) {
        embedding[index] = Math.sin((charCode + i) * normalizedFreq * 0.1)
      }
    }
    
    // Fill remaining dimensions with text length and word count features
    if (index < dimensions - 2) {
      embedding[index++] = Math.log(normalizedText.length + 1) * 0.01
      embedding[index++] = Math.log(normalizedText.split(/\s+/).length + 1) * 0.01
    }
    
    // Normalize the embedding vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
    if (magnitude > 0) {
      return embedding.map(val => val / magnitude)
    }
    
    return embedding
  }

  /**
   * TEMPORARY: Generate batch character frequency embeddings while ONNX runtime issues are resolved
   * TODO: Replace with real batch neural embeddings when Transformers.js is working
   */
  async batchEmbedding(texts: string[]): Promise<number[][]> {
    await this.initialize()

    if (!this.pipeline) {
      throw new Error('Embedding system not initialized')
    }

    try {
      // Generate embeddings for all texts
      const embeddings: number[][] = []
      
      for (const text of texts) {
        const embedding = this.generateCharacterFrequencyEmbedding(text)
        embeddings.push(embedding)
      }

      return embeddings
    } catch (error) {
      console.error('❌ Batch embedding failed:', error)
      throw new Error(`Batch embedding failed: ${error}`)
    }
  }

  /**
   * Get information about the current model
   */
  getModelInfo(): ModelInfo {
    // Get consistent model info from ModelManagerService
    const managerInfo = modelManagerService.getModelInfo()
    return {
      id: managerInfo.id,
      name: managerInfo.name,
      description: managerInfo.description,
      size: managerInfo.size,
      dimensions: managerInfo.dimensions,
      contextLength: managerInfo.contextLength,
      languages: managerInfo.languages
    }
  }

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.pipeline !== null
  }

  /**
   * Format text with instruction for better semantic understanding
   * Following Qwen3-Embedding best practices
   */
  private formatWithInstruction(text: string): string {
    // Use a general instruction that works well for semantic search
    const instruction = "Given a DreamNode title or content, generate an embedding for semantic similarity search"
    return `Instruct: ${instruction}\nQuery: ${text}`
  }
}