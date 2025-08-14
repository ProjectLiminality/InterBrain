/**
 * Model Manager Service for Qwen3 Embedding Model
 * 
 * Handles downloading, caching, and managing the Qwen3-Embedding-0.6B model
 * using IndexedDB for storage and providing progress reporting.
 */

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

export interface ModelStorage {
  modelId: string
  data: ArrayBuffer
  metadata: {
    downloadedAt: number
    checksum?: string
    version: string
    size: number
  }
}

/**
 * IndexedDB-based model storage for large files
 */
class ModelStorageDB {
  private dbName = 'InterBrainModels'
  private dbVersion = 1
  private storeName = 'models'
  private db: IDBDatabase | null = null

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(this.dbName, this.dbVersion)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'modelId' })
          store.createIndex('downloadedAt', 'metadata.downloadedAt')
        }
      }
    })
  }

  async storeModel(storage: ModelStorage): Promise<void> {
    if (!this.db) await this.initialize()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.put(storage)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async getModel(modelId: string): Promise<ModelStorage | null> {
    if (!this.db) await this.initialize()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.get(modelId)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || null)
    })
  }

  async deleteModel(modelId: string): Promise<void> {
    if (!this.db) await this.initialize()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.delete(modelId)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async getAllModels(): Promise<ModelStorage[]> {
    if (!this.db) await this.initialize()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.getAll()
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  async getStorageQuota(): Promise<{ used: number; available: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate()
      return {
        used: estimate.usage || 0,
        available: estimate.quota || 0
      }
    }
    return { used: 0, available: 0 }
  }
}

/**
 * Main Model Manager Service
 */
export class ModelManagerService {
  private static instance: ModelManagerService
  private storage: ModelStorageDB
  private downloadProgress: ModelDownloadProgress = {
    status: 'idle',
    progress: 0,
    loaded: 0,
    total: 0
  }
  private downloadAbortController: AbortController | null = null

  // Qwen3 Embedding Model Configuration
  private static readonly QWEN3_MODEL: ModelInfo = {
    id: 'qwen3-embedding-0.6b',
    name: 'Qwen3-Embedding-0.6B',
    description: 'Multilingual embedding model with 1024 dimensions, optimized for semantic search',
    size: '639MB',
    sizeBytes: 639 * 1024 * 1024, // 639MB in bytes
    dimensions: 1024,
    contextLength: 32768,
    languages: ['en', 'zh', 'multilingual', 'code'],
    downloadUrl: 'https://huggingface.co/onnx-community/Qwen3-Embedding-0.6B-ONNX',
    checksum: undefined // Will be populated from model metadata
  }

  private constructor() {
    this.storage = new ModelStorageDB()
  }

  static getInstance(): ModelManagerService {
    if (!ModelManagerService.instance) {
      ModelManagerService.instance = new ModelManagerService()
    }
    return ModelManagerService.instance
  }

  /**
   * Get information about the Qwen3 model
   */
  getModelInfo(): ModelInfo {
    return { ...ModelManagerService.QWEN3_MODEL }
  }

  /**
   * Check if model is available in storage
   */
  async isModelAvailable(): Promise<boolean> {
    try {
      const stored = await this.storage.getModel(ModelManagerService.QWEN3_MODEL.id)
      return stored !== null
    } catch (error) {
      console.error('ModelManagerService: Error checking model availability:', error)
      return false
    }
  }

  /**
   * Get stored model data
   */
  async getStoredModel(): Promise<ModelStorage | null> {
    try {
      return await this.storage.getModel(ModelManagerService.QWEN3_MODEL.id)
    } catch (error) {
      console.error('ModelManagerService: Error getting stored model:', error)
      return null
    }
  }

  /**
   * Get current download progress
   */
  getDownloadProgress(): ModelDownloadProgress {
    return { ...this.downloadProgress }
  }

  /**
   * Download the Qwen3 model with progress reporting
   */
  async downloadModel(force = false): Promise<void> {
    const modelInfo = ModelManagerService.QWEN3_MODEL

    // Check if already available and not forcing redownload
    if (!force && await this.isModelAvailable()) {
      console.log('ModelManagerService: Model already available, skipping download')
      return
    }

    // If forcing redownload, clear existing model
    if (force) {
      console.log('ModelManagerService: Forcing redownload, clearing existing model...')
      await this.clearModel()
    }

    this.downloadProgress = {
      status: 'downloading',
      progress: 0,
      loaded: 0,
      total: modelInfo.sizeBytes,
      message: 'Initializing download...'
    }

    this.downloadAbortController = new AbortController()

    try {
      console.log(`ModelManagerService: Starting download of ${modelInfo.name}...`)
      
      // Simulate model download for now - in real implementation this would
      // use the Transformers.js model loading mechanism which handles caching
      await this.simulateModelDownload(modelInfo)

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
   * Clear stored model from cache
   */
  async clearModel(): Promise<void> {
    try {
      await this.storage.deleteModel(ModelManagerService.QWEN3_MODEL.id)
      console.log('ModelManagerService: Model cache cleared')
    } catch (error) {
      console.error('ModelManagerService: Error clearing model cache:', error)
      throw error
    }
  }

  /**
   * Get storage usage information
   */
  async getStorageInfo(): Promise<{
    modelStored: boolean
    modelSize?: number
    totalUsed: number
    totalAvailable: number
    usagePercentage: number
  }> {
    const quota = await this.storage.getStorageQuota()
    const storedModel = await this.getStoredModel()

    return {
      modelStored: storedModel !== null,
      modelSize: storedModel?.metadata.size,
      totalUsed: quota.used,
      totalAvailable: quota.available,
      usagePercentage: quota.available > 0 ? (quota.used / quota.available) * 100 : 0
    }
  }

  /**
   * Validate stored model integrity
   */
  async validateModel(): Promise<boolean> {
    const stored = await this.getStoredModel()
    if (!stored) return false

    // Basic validation - check size matches expected
    const expectedSize = ModelManagerService.QWEN3_MODEL.sizeBytes
    const actualSize = stored.metadata.size

    if (Math.abs(actualSize - expectedSize) > expectedSize * 0.01) { // 1% tolerance
      console.warn(`ModelManagerService: Model size mismatch. Expected: ${expectedSize}, Actual: ${actualSize}`)
      return false
    }

    // TODO: Add checksum validation when available
    return true
  }

  /**
   * Simulate model download with progress reporting
   * In real implementation, this would be replaced with actual Transformers.js model loading
   */
  private async simulateModelDownload(modelInfo: ModelInfo): Promise<void> {
    const chunkSize = 1024 * 1024 // 1MB chunks
    const totalChunks = Math.ceil(modelInfo.sizeBytes / chunkSize)
    
    for (let chunk = 0; chunk < totalChunks; chunk++) {
      // Check for cancellation
      if (this.downloadAbortController?.signal.aborted) {
        throw new Error('Download cancelled')
      }

      // Simulate download delay
      await new Promise(resolve => globalThis.setTimeout(resolve, 50))

      const loaded = Math.min((chunk + 1) * chunkSize, modelInfo.sizeBytes)
      const progress = (loaded / modelInfo.sizeBytes) * 100

      this.downloadProgress = {
        status: 'downloading',
        progress: Math.round(progress),
        loaded,
        total: modelInfo.sizeBytes,
        message: `Downloading... ${Math.round(progress)}%`
      }

      // Report progress periodically
      if (chunk % 10 === 0 || chunk === totalChunks - 1) {
        console.log(`ModelManagerService: Download progress: ${Math.round(progress)}%`)
      }
    }

    // Simulate storing the model
    this.downloadProgress.message = 'Storing model...'
    await new Promise(resolve => globalThis.setTimeout(resolve, 200))

    const modelStorage: ModelStorage = {
      modelId: modelInfo.id,
      data: new ArrayBuffer(modelInfo.sizeBytes), // Placeholder data
      metadata: {
        downloadedAt: Date.now(),
        version: '1.0.0',
        size: modelInfo.sizeBytes,
        checksum: modelInfo.checksum
      }
    }

    await this.storage.storeModel(modelStorage)
  }
}

// Export singleton instance
export const modelManagerService = ModelManagerService.getInstance()