/**
 * Model Manager Service for HuggingFace Embedding Model
 * 
 * Handles downloading, caching, and managing the all-MiniLM-L6-v2 model
 * using native filesystem storage for optimal performance in Obsidian/Electron.
 */

import { pipeline, env } from '@xenova/transformers'
import { App } from 'obsidian'

export interface ModelInfo {
  id: string
  name: string
  description: string
  size: string
  sizeBytes: number
  dimensions: number
  contextLength: number
  languages: string[]
  downloadUrl: string
  checksum?: string
}

export interface ModelDownloadProgress {
  status: 'idle' | 'downloading' | 'validating' | 'complete' | 'error'
  progress: number // 0-100
  loaded: number // bytes loaded
  total: number // total bytes
  message?: string
  error?: string
}

export interface ModelCacheInfo {
  exists: boolean
  path?: string
  size?: number
  lastModified?: number
}

/**
 * Native Filesystem Model Manager Service
 */
export class ModelManagerService {
  private static instance: ModelManagerService
  private app: App
  private downloadProgress: ModelDownloadProgress = {
    status: 'idle',
    progress: 0,
    loaded: 0,
    total: 0
  }
  private downloadAbortController: any | null = null

  // all-MiniLM-L6-v2 Embedding Model Configuration (well-supported, native performance)
  private static readonly EMBEDDING_MODEL: ModelInfo = {
    id: 'all-minilm-l6-v2',
    name: 'all-MiniLM-L6-v2',
    description: 'High-quality sentence embedding model with native ONNX performance',
    size: '90MB',
    sizeBytes: 90 * 1024 * 1024, // 90MB in bytes
    dimensions: 384,
    contextLength: 512,
    languages: ['en', 'multilingual'],
    downloadUrl: 'https://huggingface.co/Xenova/all-MiniLM-L6-v2',
    checksum: undefined
  }

  private constructor(app: App) {
    this.app = app
    this.configureTransformersJS()
  }

  static getInstance(app?: App): ModelManagerService {
    if (!ModelManagerService.instance && app) {
      ModelManagerService.instance = new ModelManagerService(app)
    }
    return ModelManagerService.instance
  }

  /**
   * Configure transformers.js for native filesystem persistence
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
      
      console.log(`🔧 ModelManagerService: Configured paths`)   
      console.log(`   Models: ${env.localModelPath}`)
      console.log(`   Cache: ${env.cacheDir}`)
      
    } catch (error) {
      console.warn('⚠️ ModelManagerService: Could not determine vault path, using defaults:', error)
      env.localModelPath = './.models/'
      env.cacheDir = './.cache/'
    }
  }

  /**
   * Get information about the embedding model
   */
  getModelInfo(): ModelInfo {
    return { ...ModelManagerService.EMBEDDING_MODEL }
  }

  /**
   * Check if model is available on filesystem
   * Uses transformers.js cache directory to determine availability
   */
  async isModelAvailable(): Promise<boolean> {
    try {
      const cacheInfo = await this.getModelCacheInfo()
      return cacheInfo.exists
    } catch (error) {
      console.error('ModelManagerService: Error checking model availability:', error)
      return false
    }
  }

  /**
   * Get model cache information from filesystem
   */
  async getModelCacheInfo(): Promise<ModelCacheInfo> {
    try {
      const adapter = this.app.vault.adapter as any
      const cachePath = env.cacheDir
      
      if (!cachePath || !adapter.fs) {
        return { exists: false }
      }
      
      // Check if cache directory exists
      const cacheExists = adapter.fs.existsSync && adapter.fs.existsSync(cachePath)
      
      if (!cacheExists) {
        return { exists: false }
      }
      
      // Try to get directory stats
      let size = 0
      let lastModified = 0
      
      try {
        if (adapter.fs.statSync) {
          const stats = adapter.fs.statSync(cachePath)
          size = stats.size || 0
          lastModified = stats.mtime?.getTime() || 0
        }
      } catch {
        // Stats may not be available, that's okay
      }
      
      return {
        exists: true,
        path: cachePath,
        size,
        lastModified
      }
      
    } catch (error) {
      console.warn('⚠️ ModelManagerService: Could not check cache info:', error)
      return { exists: false }
    }
  }

  /**
   * Get current download progress
   */
  getDownloadProgress(): ModelDownloadProgress {
    return { ...this.downloadProgress }
  }

  /**
   * Download the embedding model with progress reporting
   */
  async downloadModel(force = false): Promise<void> {
    const modelInfo = ModelManagerService.EMBEDDING_MODEL

    // Check if already available and not forcing redownload
    if (!force && await this.isModelAvailable()) {
      console.log('ModelManagerService: Model already cached, skipping download')
      return
    }

    // If forcing redownload, clear existing cache
    if (force) {
      console.log('ModelManagerService: Forcing redownload, clearing cache...')
      await this.clearModel()
    }

    this.downloadProgress = {
      status: 'downloading',
      progress: 0,
      loaded: 0,
      total: modelInfo.sizeBytes,
      message: 'Initializing download...'
    }

    this.downloadAbortController = new (globalThis as any).AbortController()

    try {
      console.log(`ModelManagerService: Starting download of ${modelInfo.name}...`)
      
      // Use Transformers.js to download and cache the model natively
      await this.downloadNativeModel(modelInfo)

      this.downloadProgress = {
        status: 'complete',
        progress: 100,
        loaded: modelInfo.sizeBytes,
        total: modelInfo.sizeBytes,
        message: 'Download complete!'
      }

      console.log(`ModelManagerService: Successfully downloaded ${modelInfo.name}`)

    } catch (error) {
      this.downloadProgress = {
        status: 'error',
        progress: 0,
        loaded: 0,
        total: modelInfo.sizeBytes,
        message: 'Download failed',
        error: error instanceof Error ? error.message : String(error)
      }

      console.error('ModelManagerService: Download failed:', error)
      throw error

    } finally {
      this.downloadAbortController = null
    }
  }

  /**
   * Cancel ongoing download
   */
  cancelDownload(): void {
    if (this.downloadAbortController) {
      this.downloadAbortController.abort()
      this.downloadProgress = {
        status: 'idle',
        progress: 0,
        loaded: 0,
        total: 0,
        message: 'Download cancelled'
      }
      console.log('ModelManagerService: Download cancelled by user')
    }
  }

  /**
   * Clear model from filesystem cache
   */
  async clearModel(): Promise<void> {
    try {
      const adapter = this.app.vault.adapter as any
      const cachePath = env.cacheDir
      
      if (cachePath && adapter.fs && adapter.fs.existsSync && adapter.fs.existsSync(cachePath)) {
        // Clear cache directory if it exists
        if (adapter.fs.rmSync) {
          adapter.fs.rmSync(cachePath, { recursive: true, force: true })
          console.log('ModelManagerService: Filesystem cache cleared')
        } else {
          console.warn('ModelManagerService: Cannot clear cache - rmSync not available')
        }
      } else {
        console.log('ModelManagerService: No cache to clear')
      }
    } catch (error) {
      console.error('ModelManagerService: Error clearing cache:', error)
      throw error
    }
  }

  /**
   * Get filesystem storage information
   */
  async getStorageInfo(): Promise<{
    modelStored: boolean
    modelSize?: number
    cachePath?: string
    lastModified?: Date
  }> {
    const cacheInfo = await this.getModelCacheInfo()

    return {
      modelStored: cacheInfo.exists,
      modelSize: cacheInfo.size,
      cachePath: cacheInfo.path,
      lastModified: cacheInfo.lastModified ? new Date(cacheInfo.lastModified) : undefined
    }
  }

  /**
   * Validate model cache integrity
   */
  async validateModel(): Promise<boolean> {
    const cacheInfo = await this.getModelCacheInfo()
    
    if (!cacheInfo.exists) {
      return false
    }

    // Basic validation - check if cache directory exists and seems reasonable
    if (cacheInfo.size !== undefined && cacheInfo.size < 1024) { // Less than 1KB is suspicious
      console.warn(`ModelManagerService: Cache size too small: ${cacheInfo.size} bytes`)
      return false
    }

    // If we have transformers.js available, try to validate by loading
    try {
      // Quick validation - can we create a pipeline?
      const testPipeline = await pipeline('feature-extraction', ModelManagerService.EMBEDDING_MODEL.id, {
        progress_callback: null // Disable progress for validation
      })
      
      if (testPipeline) {
        console.log('ModelManagerService: Model validation successful')
        return true
      }
    } catch (error) {
      console.warn('ModelManagerService: Model validation failed:', error)
      return false
    }

    return true
  }

  /**
   * Download the embedding model using optimized WebGPU/WASM backend
   */
  private async downloadNativeModel(modelInfo: ModelInfo): Promise<void> {
    this.downloadProgress.message = 'Downloading model files to filesystem...'
    
    // Force WASM for now - WebGPU requires special initialization in Electron
    const hasWebGPU = false // Disabled until WebGPU initialization is fixed
    const device = 'wasm'
    
    try {
      
      console.log(`ModelManagerService: Downloading with ${device} backend support`)
      
      // Create pipeline which will trigger download with optimal backend
      const pipeline_ = await pipeline(
        'feature-extraction',
        modelInfo.id.replace('all-minilm-l6-v2', 'Xenova/all-MiniLM-L6-v2'), // Ensure correct model path
        {
          device: device, // Use WebGPU if available, WASM fallback
          progress_callback: (progress: unknown) => {
            const progressData = progress as { 
              status?: string; 
              name?: string; 
              progress?: number;
              loaded?: number;
              total?: number;
            }
            
            if (progressData.status === 'downloading' && progressData.progress !== undefined) {
              const currentProgress = Math.round(progressData.progress)
              
              this.downloadProgress = {
                status: 'downloading',
                progress: currentProgress,
                loaded: progressData.loaded || Math.round((currentProgress / 100) * modelInfo.sizeBytes),
                total: modelInfo.sizeBytes,
                message: `Downloading ${progressData.name}: ${currentProgress}%`
              }
              
              console.log(`ModelManagerService: ${progressData.name}: ${currentProgress}%`)
            } else if (progressData.status === 'loading') {
              this.downloadProgress.message = `Loading ${progressData.name}...`
              console.log(`ModelManagerService: Loading ${progressData.name}`)
            }
            
            // Check for cancellation
            if (this.downloadAbortController?.signal.aborted) {
              throw new Error('Download cancelled')
            }
          }
        }
      )

      this.downloadProgress.message = 'Model cached to filesystem'
      
      // Verify the model was cached
      const cacheInfo = await this.getModelCacheInfo()
      if (!cacheInfo.exists) {
        throw new Error('Model download completed but cache not found')
      }
      
      console.log(`ModelManagerService: Model cached successfully to ${cacheInfo.path}`)
      console.log(`ModelManagerService: Backend support: ${device} (${hasWebGPU ? 'GPU acceleration' : 'optimized WASM'})`)
      
      // Clean up pipeline reference
      if (pipeline_) {
        console.log('ModelManagerService: Model ready for high-performance inference')
      }
      
    } catch (error) {
      console.error('ModelManagerService: Model download failed:', error)
      
      // If WebGPU failed, retry with WASM
      if (error instanceof Error && error.message.includes('WebGPU') && device === 'webgpu') {
        console.log('ModelManagerService: Retrying download with WASM backend...')
        return this.downloadWithWASMFallback(modelInfo)
      }
      
      throw error
    }
  }

  /**
   * Fallback download method using WASM when WebGPU fails
   */
  private async downloadWithWASMFallback(modelInfo: ModelInfo): Promise<void> {
    try {
      const pipeline_ = await pipeline(
        'feature-extraction',
        modelInfo.id.replace('all-minilm-l6-v2', 'Xenova/all-MiniLM-L6-v2'),
        {
          device: 'wasm', // Force WASM backend
          progress_callback: null // Simplified for retry
        }
      )
      
      this.downloadProgress.message = 'Model cached to filesystem (WASM backend)'
      
      const cacheInfo = await this.getModelCacheInfo()
      if (!cacheInfo.exists) {
        throw new Error('Model download completed but cache not found')
      }
      
      console.log('ModelManagerService: WASM fallback download successful')
      
    } catch (error) {
      console.error('ModelManagerService: WASM fallback download also failed:', error)
      throw error
    }
  }
}

// Export factory function - requires app instance
export const createModelManagerService = (app: App): ModelManagerService => {
  return ModelManagerService.getInstance(app)
}

// Export singleton getter (must be initialized first)
export const getModelManagerService = (): ModelManagerService => {
  return ModelManagerService.getInstance()
}