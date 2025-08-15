import { pipeline, env } from '@xenova/transformers'
import { App } from 'obsidian'
import { EmbeddingService, ModelInfo } from '../indexing/embedding-service'

/**
 * Native HuggingFace Embedding Service with optimized Electron renderer support
 * 
 * Leverages transformers.js with optimal ONNX backend configuration for:
 * - WebGPU acceleration when available (fastest)
 * - Optimized WASM fallback with proper threading
 * - Persistent filesystem storage
 * - Electron renderer process compatibility
 */
export class NativeHuggingFaceService implements EmbeddingService {
  private static instance: NativeHuggingFaceService
  private pipeline: unknown = null
  private initialized = false
  private app: App

  // Model configuration - Using well-supported all-MiniLM-L6-v2
  private static readonly MODEL_CONFIG = {
    modelId: 'Xenova/all-MiniLM-L6-v2',
    dimensions: 384,
    pooling: 'mean' as const,
    normalize: true
  }

  private constructor(app: App) {
    this.app = app
    this.configureTransformersJS()
  }

  /**
   * Get singleton instance with Obsidian app context
   */
  static getInstance(app: App): NativeHuggingFaceService {
    if (!NativeHuggingFaceService.instance) {
      NativeHuggingFaceService.instance = new NativeHuggingFaceService(app)
    }
    return NativeHuggingFaceService.instance
  }

  /**
   * Configure transformers.js for optimal Electron renderer performance
   */
  private configureTransformersJS(): void {
    try {
      // Get base path from Obsidian vault adapter
      const basePath = (this.app.vault.adapter as any).basePath || ''
      
      // Configure transformers.js for filesystem storage
      env.localModelPath = `${basePath}/.obsidian/plugins/interbrain/.models/`
      env.cacheDir = `${basePath}/.obsidian/plugins/interbrain/.cache/`
      env.allowRemoteModels = true // Allow initial downloads
      env.allowLocalModels = true  // Use local cache when available
      
      // Critical: Force web backend for Electron renderer
      // Transformers.js incorrectly detects Electron as Node.js
      // We must override to use onnxruntime-web, not onnxruntime-node
      
      // Configure ONNX backend for web/renderer context
      if (env.backends?.onnx) {
        // Configure WASM backend settings
        if (env.backends.onnx.wasm) {
          // Critical: Must disable multithreading due to onnxruntime-web bug
          env.backends.onnx.wasm.numThreads = 1
          
          // Use SIMD if available for better performance
          env.backends.onnx.wasm.simd = true
          
          // Use CDN for WASM files (works in Electron renderer)
          env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/'
          
          // Explicitly set to use WASM proxy (web version)
          env.backends.onnx.wasm.proxy = true
        }
        
        // Try to enable WebGPU for best performance (if available)
        if (env.backends.onnx.webgpu) {
          env.backends.onnx.webgpu.preferredLayout = 'NHWC'
        }
      }
      
      console.log(`🔧 Transformers.js configured for Electron renderer:`)
      console.log(`   Backend: Optimized WASM/WebGPU`)
      console.log(`   Models: ${env.localModelPath}`)
      console.log(`   Cache: ${env.cacheDir}`)
      console.log(`   Threading: Single (stable for onnxruntime-web)`)
      
    } catch (error) {
      console.warn('⚠️ Could not configure transformers.js optimally:', error)
      env.localModelPath = './.models/'
      env.cacheDir = './.cache/'
    }
  }

  /**
   * Initialize the embedding pipeline with optimal renderer performance
   */
  async initialize(): Promise<void> {
    if (this.initialized && this.pipeline) {
      return
    }

    console.log(`🚀 Initializing HuggingFace embedding model with WebGPU/WASM optimization...`)
    
    try {
      const startTime = globalThis.performance.now()
      
      // Check for WebGPU availability
      const hasWebGPU = 'gpu' in navigator && navigator.gpu
      
      // Explicitly set execution providers for web environment
      const executionProviders = hasWebGPU ? ['webgpu', 'wasm'] : ['wasm']
      const device = hasWebGPU ? 'webgpu' : 'wasm'
      
      console.log(`🎯 Using device: ${device} (${hasWebGPU ? 'GPU acceleration available!' : 'Optimized WASM fallback'})`)
      console.log(`🔧 Execution providers: ${executionProviders.join(', ')}`)
      
      // Initialize pipeline with explicit execution providers
      this.pipeline = await pipeline(
        'feature-extraction',
        NativeHuggingFaceService.MODEL_CONFIG.modelId,
        {
          device: device, // Use WebGPU if available, WASM fallback
          executionProviders: executionProviders, // Explicitly set providers
          progress_callback: (progress: unknown) => {
            const progressData = progress as { 
              status?: string; 
              name?: string; 
              progress?: number;
              file?: string;
            }
            
            if (progressData.status === 'downloading') {
              console.log(`📥 Downloading: ${progressData.name} (${progressData.progress?.toFixed(1)}%)`)
            } else if (progressData.status === 'loading') {
              console.log(`⚡ Loading: ${progressData.name}`)
            } else if (progressData.file) {
              console.log(`📁 Processing: ${progressData.file}`)
            }
          }
        }
      )

      const initTime = globalThis.performance.now() - startTime
      console.log(`✅ HuggingFace embedding model initialized in ${initTime.toFixed(2)}ms`)
      console.log(`🔥 Using ${hasWebGPU ? 'WebGPU acceleration' : 'optimized WASM'} for high performance`)
      
      this.initialized = true
      
      // Log environment detection
      this.logEnvironmentInfo()
      
    } catch (error) {
      console.error('❌ Failed to initialize embedding model:', error)
      
      // Provide helpful error messages
      if (error instanceof Error) {
        if (error.message.includes('fetch')) {
          throw new Error(`Network error downloading model: ${error.message}. Check internet connection.`)
        } else if (error.message.includes('WebGPU')) {
          console.warn('⚠️ WebGPU initialization failed, retrying with WASM...')
          // Retry with WASM fallback
          return this.initializeWithWASM()
        }
      }
      
      throw new Error(`Embedding initialization failed: ${error}`)
    }
  }

  /**
   * Fallback initialization with WASM when WebGPU fails
   */
  private async initializeWithWASM(): Promise<void> {
    try {
      console.log('🔄 Initializing with WASM fallback...')
      
      this.pipeline = await pipeline(
        'feature-extraction',
        NativeHuggingFaceService.MODEL_CONFIG.modelId,
        {
          device: 'wasm', // Force WASM backend
          progress_callback: null // Simplified for retry
        }
      )
      
      console.log('✅ WASM fallback initialization successful')
      this.initialized = true
      
    } catch (error) {
      console.error('❌ WASM fallback also failed:', error)
      throw new Error(`Unable to initialize embedding model with any backend: ${error}`)
    }
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    await this.initialize()

    if (!this.pipeline) {
      throw new Error('Native embedding pipeline not initialized')
    }

    try {
      const output = await (this.pipeline as any)(text, {
        pooling: NativeHuggingFaceService.MODEL_CONFIG.pooling,
        normalize: NativeHuggingFaceService.MODEL_CONFIG.normalize
      })

      // Extract the embedding array
      const embedding = Array.from(output.data) as number[]
      
      // Validate dimensions
      if (embedding.length !== NativeHuggingFaceService.MODEL_CONFIG.dimensions) {
        console.warn(`⚠️ Unexpected embedding dimensions: ${embedding.length}, expected: ${NativeHuggingFaceService.MODEL_CONFIG.dimensions}`)
      }
      
      return embedding
      
    } catch (error) {
      console.error('❌ Native embedding generation failed:', error)
      throw new Error(`Embedding generation failed: ${error}`)
    }
  }

  /**
   * Generate embeddings for multiple texts efficiently
   */
  async batchEmbedding(texts: string[]): Promise<number[][]> {
    await this.initialize()

    if (!this.pipeline) {
      throw new Error('Native embedding pipeline not initialized')
    }

    try {
      const output = await (this.pipeline as any)(texts, {
        pooling: NativeHuggingFaceService.MODEL_CONFIG.pooling,
        normalize: NativeHuggingFaceService.MODEL_CONFIG.normalize
      })

      // Extract embeddings array
      const embeddings: number[][] = []
      
      if (Array.isArray(output)) {
        // Multiple outputs
        for (const item of output) {
          const embedding = Array.from(item.data) as number[]
          embeddings.push(embedding)
        }
      } else if (output.data) {
        // Single output with batched dimensions
        const flatData = Array.from(output.data) as number[]
        const dimensions = NativeHuggingFaceService.MODEL_CONFIG.dimensions
        
        for (let i = 0; i < texts.length; i++) {
          const start = i * dimensions
          const end = start + dimensions
          embeddings.push(flatData.slice(start, end))
        }
      }

      // Validate batch size
      if (embeddings.length !== texts.length) {
        console.warn(`⚠️ Batch size mismatch: got ${embeddings.length} embeddings for ${texts.length} texts`)
      }

      return embeddings
      
    } catch (error) {
      console.error('❌ Native batch embedding failed:', error)
      throw new Error(`Batch embedding failed: ${error}`)
    }
  }

  /**
   * Get information about the current model
   */
  getModelInfo(): ModelInfo {
    return {
      id: 'all-minilm-l6-v2',
      name: 'all-MiniLM-L6-v2',
      description: 'High-quality sentence embedding model with native ONNX performance',
      size: '90MB',
      dimensions: NativeHuggingFaceService.MODEL_CONFIG.dimensions,
      contextLength: 512,
      languages: ['en', 'multilingual']
    }
  }

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.pipeline !== null
  }

  /**
   * Get storage paths for debugging
   */
  getStoragePaths(): { modelPath: string; cachePath: string } {
    return {
      modelPath: env.localModelPath || 'unknown',
      cachePath: env.cacheDir || 'unknown'
    }
  }

  /**
   * Check if model files exist on filesystem
   */
  async isModelCached(): Promise<boolean> {
    try {
      // Check if cache directory exists and has model files
      const adapter = this.app.vault.adapter as any
      const cachePath = env.cacheDir
      
      if (!cachePath || !adapter.fs || !adapter.fs.existsSync) {
        // Fallback - assume not cached if we can't check
        return false
      }
      
      const cacheExists = adapter.fs.existsSync(cachePath)
      return cacheExists
      
    } catch (error) {
      console.warn('⚠️ Could not check model cache:', error)
      return false
    }
  }

  /**
   * Log environment and runtime information
   */
  private logEnvironmentInfo(): void {
    console.log(`🌍 Environment Info:`)
    // Safe access to process global (may not be available in all contexts)
    const proc = (globalThis as any).process
    
    console.log(`   Platform: ${proc?.platform || 'unknown'}`)
    console.log(`   Node.js: ${proc?.version || 'unknown'}`)
    console.log(`   Electron: ${proc?.versions?.electron || 'unknown'}`)
    console.log(`   Models Path: ${env.localModelPath}`)
    console.log(`   Cache Path: ${env.cacheDir}`)
    
    // Check if running in native context
    const isNative = typeof proc !== 'undefined' && proc.versions?.electron
    console.log(`   Runtime: ${isNative ? '🔥 Native (Electron)' : '🌐 Web'}`)
  }
}