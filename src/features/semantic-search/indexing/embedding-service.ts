import { pipeline } from '@xenova/transformers'

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
    modelId: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
    dtype: 'fp32' as const,
    pooling: 'last_token' as const,
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
   * Initialize the embedding pipeline
   */
  async initialize(): Promise<void> {
    if (this.initialized && this.pipeline) {
      return
    }

    console.log(`🤖 Initializing Qwen3 embedding model...`)
    
    try {
      const startTime = globalThis.performance.now()
      
      this.pipeline = await pipeline(
        'feature-extraction',
        Qwen3EmbeddingService.MODEL_CONFIG.modelId,
        {
          progress_callback: (progress: unknown) => {
            const progressData = progress as { status?: string; name?: string; progress?: number }
            if (progressData.status === 'downloading') {
              console.log(`📥 Downloading: ${progressData.name} (${Math.round(progressData.progress || 0)}%)`)
            }
          }
        }
      )

      const initTime = globalThis.performance.now() - startTime
      console.log(`✅ Qwen3 model initialized in ${initTime.toFixed(2)}ms`)
      
      this.initialized = true
    } catch (error) {
      console.error('❌ Failed to initialize Qwen3 embedding model:', error)
      throw new Error(`Qwen3 embedding model initialization failed: ${error}`)
    }
  }

  /**
   * Generate embedding for a single text with instruction formatting
   */
  async generateEmbedding(text: string): Promise<number[]> {
    await this.initialize()

    if (!this.pipeline) {
      throw new Error('Qwen3 embedding pipeline not initialized')
    }

    try {
      // Format text with instruction for better semantic understanding
      const instructedText = this.formatWithInstruction(text)
      
      const output = await (this.pipeline as any)(instructedText, {
        pooling: Qwen3EmbeddingService.MODEL_CONFIG.pooling,
        normalize: Qwen3EmbeddingService.MODEL_CONFIG.normalize
      })

      // Extract the embedding array
      const embedding = Array.from(output.data) as number[]
      
      return embedding
    } catch (error) {
      console.error('❌ Qwen3 embedding generation failed:', error)
      throw new Error(`Qwen3 embedding generation failed: ${error}`)
    }
  }

  /**
   * Generate embeddings for multiple texts efficiently
   */
  async batchEmbedding(texts: string[]): Promise<number[][]> {
    await this.initialize()

    if (!this.pipeline) {
      throw new Error('Qwen3 embedding pipeline not initialized')
    }

    try {
      // Format all texts with instructions
      const instructedTexts = texts.map(text => this.formatWithInstruction(text))
      
      const output = await (this.pipeline as any)(instructedTexts, {
        pooling: Qwen3EmbeddingService.MODEL_CONFIG.pooling,
        normalize: Qwen3EmbeddingService.MODEL_CONFIG.normalize
      })

      // Extract embeddings array
      const embeddings: number[][] = []
      
      if (Array.isArray(output)) {
        // Multiple outputs
        for (const item of output) {
          embeddings.push(Array.from(item.data) as number[])
        }
      } else if (output.data) {
        // Single output with multiple dimensions
        const flatData = Array.from(output.data) as number[]
        const dimensions = flatData.length / texts.length
        
        for (let i = 0; i < texts.length; i++) {
          const start = i * dimensions
          const end = start + dimensions
          embeddings.push(flatData.slice(start, end))
        }
      }

      return embeddings
    } catch (error) {
      console.error('❌ Qwen3 batch embedding failed:', error)
      throw new Error(`Qwen3 batch embedding failed: ${error}`)
    }
  }

  /**
   * Get information about the current model
   */
  getModelInfo(): ModelInfo {
    return {
      id: Qwen3EmbeddingService.MODEL_CONFIG.modelId,
      name: 'Qwen3-Embedding-0.6B',
      description: 'Multilingual embedding model with 1024 dimensions',
      size: '639MB',
      dimensions: 1024,
      contextLength: 32768,
      languages: ['en', 'zh', 'multilingual', 'code']
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