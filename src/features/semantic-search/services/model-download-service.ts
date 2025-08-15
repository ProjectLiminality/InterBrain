/**
 * Model Download Service
 * 
 * Handles downloading and caching HuggingFace models to filesystem using Node.js capabilities.
 * This service runs in the main plugin context (with filesystem access) and serves as
 * the foundation for serving models to the iframe context via blob URLs.
 * 
 * Key responsibilities:
 * - Download HuggingFace model files via HTTP requests
 * - Parse model manifests to identify required files  
 * - Store models in filesystem with proper directory structure
 * - Track download progress and model availability
 * - Provide model metadata for serving layer
 */

// Import Node.js types for Electron environment
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface HuggingFaceModelConfig {
  id: string // HuggingFace model ID (e.g. 'Xenova/all-MiniLM-L6-v2')
  name: string
  description: string
  dimensions: number
  contextLength: number
  languages: string[]
  estimatedSizeBytes: number
}

export interface ModelFile {
  filename: string
  url: string
  size?: number
  sha?: string
}

export interface ModelManifest {
  modelId: string
  files: ModelFile[]
  totalSize: number
  downloadedAt?: number
}

export interface DownloadProgress {
  status: 'idle' | 'fetching-manifest' | 'downloading' | 'complete' | 'error'
  progress: number // 0-100
  currentFile?: string
  filesCompleted: number
  totalFiles: number
  bytesDownloaded: number
  totalBytes: number
  message?: string
  error?: string
}

/**
 * Model Download Service
 * Handles filesystem-based model downloading and caching
 */
export class ModelDownloadService {
  private static instance: ModelDownloadService
  private fs: any
  private path: any
  private https: any
  private downloadProgress: DownloadProgress = this.createIdleProgress()

  // Available HuggingFace models that work well with transformers.js
  private static readonly AVAILABLE_MODELS: Record<string, HuggingFaceModelConfig> = {
    'Xenova/all-MiniLM-L6-v2': {
      id: 'Xenova/all-MiniLM-L6-v2',
      name: 'all-MiniLM-L6-v2',
      description: 'Lightweight and fast sentence embedding model, 384 dimensions',
      dimensions: 384,
      contextLength: 256,
      languages: ['en', 'multilingual'],
      estimatedSizeBytes: 90 * 1024 * 1024 // 90MB
    },
    'Xenova/all-mpnet-base-v2': {
      id: 'Xenova/all-mpnet-base-v2',
      name: 'all-mpnet-base-v2',
      description: 'High-quality sentence embedding model, 768 dimensions',
      dimensions: 768,
      contextLength: 384,
      languages: ['en'],
      estimatedSizeBytes: 420 * 1024 * 1024 // 420MB
    },
    'Xenova/bge-small-en-v1.5': {
      id: 'Xenova/bge-small-en-v1.5',
      name: 'BGE Small EN v1.5',
      description: 'Efficient English embedding model, 384 dimensions',
      dimensions: 384,
      contextLength: 512,
      languages: ['en'],
      estimatedSizeBytes: 130 * 1024 * 1024 // 130MB
    }
  }

  private constructor() {
    // Initialize Node.js modules (available in Obsidian's Electron context)
    this.fs = (globalThis as any).require('fs')
    this.path = (globalThis as any).require('path')
    this.https = (globalThis as any).require('https')
  }

  static getInstance(): ModelDownloadService {
    if (!ModelDownloadService.instance) {
      ModelDownloadService.instance = new ModelDownloadService()
    }
    return ModelDownloadService.instance
  }

  /**
   * Get available model configurations
   */
  getAvailableModels(): HuggingFaceModelConfig[] {
    return Object.values(ModelDownloadService.AVAILABLE_MODELS)
  }

  /**
   * Get configuration for specific model
   */
  getModelConfig(modelId: string): HuggingFaceModelConfig | null {
    return ModelDownloadService.AVAILABLE_MODELS[modelId] || null
  }

  /**
   * Get current download progress
   */
  getDownloadProgress(): DownloadProgress {
    return { ...this.downloadProgress }
  }

  /**
   * Get models directory path
   */
  getModelsDirectory(): string {
    // Get vault base path from Obsidian
    const vaultBasePath = (globalThis as any).app?.vault?.adapter?.getBasePath?.()
    if (!vaultBasePath) {
      throw new Error('Could not determine Obsidian vault path')
    }

    return this.path.join(
      vaultBasePath,
      '.obsidian',
      'plugins',
      'interbrain',
      'src',
      'features',
      'semantic-search',
      'models'
    )
  }

  /**
   * Get directory path for specific model
   */
  getModelDirectory(modelId: string): string {
    const modelsDir = this.getModelsDirectory()
    // Convert model ID to filesystem-safe name (replace / with _)
    const safeModelId = modelId.replace(/\//g, '_')
    return this.path.join(modelsDir, safeModelId)
  }

  /**
   * Check if model is downloaded and available
   */
  async isModelDownloaded(modelId: string): Promise<boolean> {
    try {
      const modelDir = this.getModelDirectory(modelId)
      const manifestPath = this.path.join(modelDir, 'manifest.json')
      
      // Check if manifest exists and is readable
      if (!this.fs.existsSync(manifestPath)) {
        return false
      }

      // Verify manifest is valid JSON and contains required files
      const manifestData = JSON.parse(this.fs.readFileSync(manifestPath, 'utf-8'))
      const manifest: ModelManifest = manifestData

      // Check that all files in manifest actually exist
      for (const file of manifest.files) {
        const filePath = this.path.join(modelDir, file.filename)
        if (!this.fs.existsSync(filePath)) {
          console.warn(`ModelDownloadService: Missing file ${file.filename} for model ${modelId}`)
          return false
        }
      }

      return true
    } catch (error) {
      console.warn(`ModelDownloadService: Error checking if model ${modelId} is downloaded:`, error)
      return false
    }
  }

  /**
   * Get model manifest if available
   */
  async getModelManifest(modelId: string): Promise<ModelManifest | null> {
    try {
      const modelDir = this.getModelDirectory(modelId)
      const manifestPath = this.path.join(modelDir, 'manifest.json')
      
      if (!this.fs.existsSync(manifestPath)) {
        return null
      }

      const manifestData = JSON.parse(this.fs.readFileSync(manifestPath, 'utf-8'))
      return manifestData as ModelManifest
    } catch (error) {
      console.error(`ModelDownloadService: Error reading manifest for ${modelId}:`, error)
      return null
    }
  }

  /**
   * Fetch model manifest from HuggingFace API with redirect support
   */
  private async fetchModelManifest(modelId: string): Promise<ModelManifest> {
    return new Promise((resolve, reject) => {
      const apiUrl = `https://huggingface.co/api/models/${modelId}/tree/main`
      
      console.log(`🔍 Fetching model manifest from: ${apiUrl}`)
      
      this.makeHttpRequest(apiUrl, {
        'User-Agent': 'InterBrain-Obsidian-Plugin/1.0.0'
      }, (data: string) => {
        try {
          const files = JSON.parse(data)
          
          console.log(`🔍 DEBUG: HuggingFace API returned ${files.length} entries`)
          console.log('🔍 DEBUG: Sample entries:')
          files.slice(0, 10).forEach((file: any, index: number) => {
            console.log(`  ${index + 1}. path: "${file.path}", type: "${file.type}", size: ${file.size}`)
          })
          
          // Filter for essential model files (exclude directories)
          const modelFiles = files
            .filter((file: any) => {
              // Skip directories (they have type 'tree' and no size)
              if (file.type === 'tree' || file.size === undefined || file.size === null) {
                console.log(`📁 Skipping directory: ${file.path}`)
                return false
              }
              
              return this.isEssentialModelFile(file.path)
            })
            .map((file: any) => ({
              filename: file.path,
              url: `https://huggingface.co/${modelId}/resolve/main/${file.path}`,
              size: file.size,
              sha: file.oid
            }))

          const totalSize = modelFiles.reduce((sum: number, file: any) => sum + (file.size || 0), 0)

          console.log(`📋 Selected files for download:`)
          modelFiles.forEach((file: any) => {
            console.log(`  ✓ ${file.filename} (${(file.size / 1024).toFixed(1)}KB)`)
          })

          const manifest: ModelManifest = {
            modelId,
            files: modelFiles,
            totalSize
          }

          console.log(`📋 Found ${modelFiles.length} essential files, total size: ${(totalSize / 1024 / 1024).toFixed(1)}MB`)
          resolve(manifest)
        } catch (error) {
          reject(new Error(`Failed to parse model manifest: ${error}`))
        }
      }, reject)
    })
  }

  /**
   * Check if file is essential for model operation
   * UNIVERSAL APPROACH: Download everything needed for any HuggingFace model
   */
  private isEssentialModelFile(filename: string): boolean {
    const lowerFilename = filename.toLowerCase()
    
    // CRITICAL: Download ALL .onnx files regardless of name or subdirectory
    // Covers: model.onnx, model_quantized.onnx, model_int8.onnx, etc.
    if (lowerFilename.includes('.onnx')) {
      console.log(`📦 Including ONNX model file: ${filename}`)
      return true
    }
    
    // CRITICAL: Download ALL configuration JSON files
    if (lowerFilename.endsWith('.json')) {
      console.log(`⚙️ Including config file: ${filename}`)
      return true
    }
    
    // CRITICAL: Download ALL vocabulary and tokenizer files
    if (lowerFilename.includes('vocab') || 
        lowerFilename.includes('tokenizer') ||
        lowerFilename.includes('merges.txt') ||
        lowerFilename.includes('added_tokens') ||
        lowerFilename.includes('special_tokens')) {
      console.log(`📝 Including tokenizer/vocab file: ${filename}`)
      return true
    }
    
    // CRITICAL: Download any potential model weight files
    if (lowerFilename.includes('model') && 
        (lowerFilename.endsWith('.bin') || 
         lowerFilename.endsWith('.safetensors') ||
         lowerFilename.endsWith('.h5'))) {
      console.log(`🧠 Including model weights file: ${filename}`)
      return true
    }
    
    // Include other potentially important files
    if (lowerFilename.includes('generation_config') ||
        lowerFilename.includes('preprocessor_config') ||
        lowerFilename.includes('sentencepiece')) {
      console.log(`🔧 Including auxiliary file: ${filename}`)
      return true
    }
    
    // Skip obvious non-essential files
    if (lowerFilename.includes('readme') ||
        lowerFilename.includes('.md') ||
        lowerFilename.includes('.txt') && !lowerFilename.includes('vocab') ||
        lowerFilename.includes('.git')) {
      return false
    }
    
    // Default: include anything else that might be important
    // Better to download too much than too little
    console.log(`❓ Including unknown file (better safe than sorry): ${filename}`)
    return true
  }

  /**
   * Download a single file with progress tracking and redirect support
   */
  private async downloadFile(file: ModelFile, targetPath: string, onProgress?: (bytes: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`⬇️ Downloading ${file.filename}...`)
      
      this.downloadFileWithRedirects(file.url, targetPath, onProgress, (downloadedBytes: number) => {
        console.log(`✅ Downloaded ${file.filename} (${(downloadedBytes / 1024 / 1024).toFixed(1)}MB)`)
        resolve()
      }, reject)
    })
  }

  /**
   * Download model to filesystem
   */
  async downloadModel(modelId: string, force = false): Promise<void> {
    const config = this.getModelConfig(modelId)
    if (!config) {
      throw new Error(`Unsupported model: ${modelId}`)
    }

    // Check if already downloaded
    if (!force && await this.isModelDownloaded(modelId)) {
      console.log(`✅ Model ${modelId} already downloaded`)
      return
    }

    this.downloadProgress = {
      ...this.createIdleProgress(),
      status: 'fetching-manifest',
      message: 'Fetching model information...'
    }

    try {
      // Create model directory
      const modelDir = this.getModelDirectory(modelId)
      if (!this.fs.existsSync(modelDir)) {
        this.fs.mkdirSync(modelDir, { recursive: true })
        console.log(`📁 Created directory: ${modelDir}`)
      }

      // Fetch model manifest
      const manifest = await this.fetchModelManifest(modelId)
      
      this.downloadProgress = {
        ...this.downloadProgress,
        status: 'downloading',
        totalFiles: manifest.files.length,
        totalBytes: manifest.totalSize,
        message: 'Downloading model files...'
      }

      let bytesDownloaded = 0
      let filesCompleted = 0

      // Download each file
      for (const file of manifest.files) {
        this.downloadProgress.currentFile = file.filename
        
        const filePath = this.path.join(modelDir, file.filename)
        
        await this.downloadFile(file, filePath, (chunkBytes) => {
          bytesDownloaded += chunkBytes
          this.downloadProgress.bytesDownloaded = bytesDownloaded
          this.downloadProgress.progress = Math.round((bytesDownloaded / manifest.totalSize) * 100)
        })

        filesCompleted++
        this.downloadProgress.filesCompleted = filesCompleted
      }

      // Save manifest
      manifest.downloadedAt = Date.now()
      const manifestPath = this.path.join(modelDir, 'manifest.json')
      this.fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

      this.downloadProgress = {
        ...this.downloadProgress,
        status: 'complete',
        progress: 100,
        message: 'Download complete!'
      }

      console.log(`🎉 Successfully downloaded model ${modelId}`)
      console.log(`📁 Model stored in: ${modelDir}`)

    } catch (error) {
      this.downloadProgress = {
        ...this.downloadProgress,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        message: 'Download failed'
      }
      
      console.error(`❌ Failed to download model ${modelId}:`, error)
      throw error
    }
  }

  /**
   * Delete downloaded model from filesystem
   */
  async deleteModel(modelId: string): Promise<void> {
    try {
      const modelDir = this.getModelDirectory(modelId)
      
      if (this.fs.existsSync(modelDir)) {
        this.fs.rmSync(modelDir, { recursive: true })
        console.log(`🗑️ Deleted model directory: ${modelDir}`)
      }
    } catch (error) {
      console.error(`❌ Failed to delete model ${modelId}:`, error)
      throw error
    }
  }

  /**
   * Get list of downloaded models
   */
  async getDownloadedModels(): Promise<string[]> {
    try {
      const modelsDir = this.getModelsDirectory()
      
      if (!this.fs.existsSync(modelsDir)) {
        return []
      }

      const entries = this.fs.readdirSync(modelsDir, { withFileTypes: true })
      const modelDirs = entries
        .filter((entry: any) => entry.isDirectory())
        .map((entry: any) => entry.name)

      // Convert back from filesystem-safe names to model IDs
      return modelDirs.map((dirName: string) => dirName.replace(/_/g, '/'))
    } catch (error) {
      console.error('ModelDownloadService: Error listing downloaded models:', error)
      return []
    }
  }

  /**
   * Create idle progress state
   */
  private createIdleProgress(): DownloadProgress {
    return {
      status: 'idle',
      progress: 0,
      filesCompleted: 0,
      totalFiles: 0,
      bytesDownloaded: 0,
      totalBytes: 0
    }
  }

  /**
   * HTTP request helper with redirect support
   */
  private makeHttpRequest(url: string, headers: any, onData: (data: string) => void, onError: (error: Error) => void, maxRedirects = 5): void {
    if (maxRedirects <= 0) {
      onError(new Error('Too many redirects'))
      return
    }

    this.https.get(url, {
      headers
    }, (response: any) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const redirectUrl = this.resolveUrl(url, response.headers.location)
        console.log(`🔄 Following redirect to: ${redirectUrl}`)
        return this.makeHttpRequest(redirectUrl, headers, onData, onError, maxRedirects - 1)
      }
      
      if (response.statusCode !== 200) {
        onError(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`))
        return
      }

      let data = ''
      response.on('data', (chunk: any) => {
        data += chunk
      })
      
      response.on('end', () => {
        onData(data)
      })
      
      response.on('error', onError)
    }).on('error', onError)
  }

  /**
   * Download file with redirect support
   */
  private downloadFileWithRedirects(url: string, targetPath: string, onProgress?: (bytes: number) => void, onComplete?: (totalBytes: number) => void, onError?: (error: Error) => void, maxRedirects = 5): void {
    if (maxRedirects <= 0) {
      onError?.(new Error('Too many redirects'))
      return
    }

    this.https.get(url, (response: any) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const redirectUrl = this.resolveUrl(url, response.headers.location)
        console.log(`🔄 Following redirect to: ${redirectUrl}`)
        return this.downloadFileWithRedirects(redirectUrl, targetPath, onProgress, onComplete, onError, maxRedirects - 1)
      }
      
      if (response.statusCode !== 200) {
        onError?.(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`))
        return
      }

      const fileStream = this.fs.createWriteStream(targetPath)
      let downloadedBytes = 0
      
      response.on('data', (chunk: any) => {
        downloadedBytes += chunk.length
        fileStream.write(chunk)
        if (onProgress) {
          onProgress(chunk.length)
        }
      })
      
      response.on('end', () => {
        fileStream.end()
        onComplete?.(downloadedBytes)
      })
      
      response.on('error', onError)
      fileStream.on('error', onError)
    }).on('error', onError)
  }

  /**
   * Resolve relative URLs against base URL
   */
  private resolveUrl(baseUrl: string, relativeUrl: string): string {
    // If it's already absolute, return as-is
    if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
      return relativeUrl
    }
    
    // Parse base URL
    const url = new URL(baseUrl)
    
    // Handle relative URLs
    if (relativeUrl.startsWith('/')) {
      // Absolute path - use base protocol and host
      return `${url.protocol}//${url.host}${relativeUrl}`
    } else {
      // Relative path - resolve against current path
      const basePath = url.pathname.split('/').slice(0, -1).join('/')
      return `${url.protocol}//${url.host}${basePath}/${relativeUrl}`
    }
  }

  /**
   * Reset download progress to idle
   */
  resetProgress(): void {
    this.downloadProgress = this.createIdleProgress()
  }

  /**
   * Get storage information
   */
  async getStorageInfo(): Promise<{
    downloadedModels: string[]
    totalSizeBytes: number
    modelsDirectory: string
  }> {
    const downloadedModels = await this.getDownloadedModels()
    let totalSizeBytes = 0

    // Calculate total size
    for (const modelId of downloadedModels) {
      const manifest = await this.getModelManifest(modelId)
      if (manifest) {
        totalSizeBytes += manifest.totalSize
      }
    }

    return {
      downloadedModels,
      totalSizeBytes,
      modelsDirectory: this.getModelsDirectory()
    }
  }
}

// Export singleton instance
export const modelDownloadService = ModelDownloadService.getInstance()