import { pipeline } from '@xenova/transformers'
import { modelManagerService } from '../services/model-manager-service'

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
      // Check if model is available through ModelManagerService
      const isModelAvailable = await modelManagerService.isModelAvailable()
      
      if (!isModelAvailable) {
        const error = new Error('Qwen3 model not available. Please download it first using "Download Qwen3 Embedding Model" command.')
        console.error('❌', error.message)
        throw error
      }

      console.log('📁 Model found in cache, initializing pipeline...')
      
      const startTime = globalThis.performance.now()
      
      // Initialize pipeline with model from our model manager
      this.pipeline = await pipeline(
        'feature-extraction',
        Qwen3EmbeddingService.MODEL_CONFIG.modelId,
        {
          // Let Transformers.js handle caching, but our ModelManagerService
          // ensures the model files are available
          progress_callback: (progress: unknown) => {
            const progressData = progress as { status?: string; name?: string; progress?: number }
            if (progressData.status === 'loading') {
              console.log(`⚡ Loading model component: ${progressData.name}`)
            }
          }
        }
      )

      const initTime = globalThis.performance.now() - startTime
      console.log(`✅ Qwen3 model initialized in ${initTime.toFixed(2)}ms`)
      
      this.initialized = true
    } catch (error) {
      console.error('❌ Failed to initialize Qwen3 embedding model:', error)
      
      // Provide helpful error messages
      if (error instanceof Error && error.message.includes('not available')) {
        throw error // Re-throw our custom error message
      } else {
        throw new Error(`Qwen3 embedding model initialization failed: ${error}. Try downloading the model first.`)
      }
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