/**
 * Model Serving Service
 * 
 * Bridges the gap between filesystem-stored models and iframe context by converting
 * model files to Blob URLs. This service runs in the main plugin context and creates
 * web-compatible URLs that can be consumed by the iframe transformers.js instance.
 * 
 * Key responsibilities:
 * - Convert filesystem model files to Blob URLs
 * - Manage object URL lifecycle to prevent memory leaks
 * - Provide model registry for iframe consumption
 * - Handle proper MIME types for different file formats
 * - Serve model files on-demand to iframe context
 */

import { modelDownloadService, ModelManifest } from './model-download-service'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ServedModel {
  modelId: string
  baseUrl: string // Base URL for model files (all files available under this path)
  files: ServedModelFile[]
  createdAt: number
  manifest: ModelManifest
}

export interface ServedModelFile {
  filename: string
  blobUrl: string
  size: number
  mimeType: string
}

export interface ModelServingStatus {
  servedModels: string[] // List of currently served model IDs
  totalObjectUrls: number
  memoryUsageEstimate: number // Estimated memory usage in bytes
}

/**
 * Model Serving Service
 * Converts filesystem models to blob URLs for iframe consumption
 */
export class ModelServingService {
  private static instance: ModelServingService
  private servedModels = new Map<string, ServedModel>()
  private fs: any
  private path: any

  // MIME type mapping for model files
  private static readonly MIME_TYPES: Record<string, string> = {
    '.json': 'application/json',
    '.onnx': 'application/octet-stream',
    '.txt': 'text/plain',
    '.bin': 'application/octet-stream'
  }

  private constructor() {
    this.fs = (globalThis as any).require('fs')
    this.path = (globalThis as any).require('path')
  }

  static getInstance(): ModelServingService {
    if (!ModelServingService.instance) {
      ModelServingService.instance = new ModelServingService()
    }
    return ModelServingService.instance
  }

  /**
   * Get MIME type for file based on extension
   */
  private getMimeType(filename: string): string {
    const ext = this.path.extname(filename).toLowerCase()
    return ModelServingService.MIME_TYPES[ext] || 'application/octet-stream'
  }

  /**
   * Create blob URL from file data
   */
  private createBlobUrl(data: ArrayBuffer, mimeType: string): string {
    const blob = new (globalThis as any).Blob([data], { type: mimeType })
    return (globalThis as any).URL.createObjectURL(blob)
  }

  /**
   * Serve a model by creating blob URLs for all its files
   */
  async serveModel(modelId: string): Promise<ServedModel> {
    // Check if model is already served
    if (this.servedModels.has(modelId)) {
      console.log(`✅ Model ${modelId} already served`)
      return this.servedModels.get(modelId)!
    }

    // Check if model is downloaded
    const isDownloaded = await modelDownloadService.isModelDownloaded(modelId)
    if (!isDownloaded) {
      throw new Error(`Model ${modelId} is not downloaded. Please download it first.`)
    }

    // Get model manifest
    const manifest = await modelDownloadService.getModelManifest(modelId)
    if (!manifest) {
      throw new Error(`Could not load manifest for model ${modelId}`)
    }

    const modelDir = modelDownloadService.getModelDirectory(modelId)
    const servedFiles: ServedModelFile[] = []

    console.log(`📡 Serving model ${modelId} with ${manifest.files.length} files...`)

    try {
      // Create blob URLs for all model files
      for (const file of manifest.files) {
        const filePath = this.path.join(modelDir, file.filename)
        
        if (!this.fs.existsSync(filePath)) {
          throw new Error(`Model file not found: ${file.filename}`)
        }

        // Read file data
        const fileData = this.fs.readFileSync(filePath)
        const arrayBuffer = fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength)
        
        // Create blob URL
        const mimeType = this.getMimeType(file.filename)
        const blobUrl = this.createBlobUrl(arrayBuffer, mimeType)

        servedFiles.push({
          filename: file.filename,
          blobUrl,
          size: fileData.length,
          mimeType
        })

        console.log(`  📄 ${file.filename} → ${blobUrl} (${mimeType})`)
      }

      // Create served model record
      const servedModel: ServedModel = {
        modelId,
        baseUrl: `blob://interbrain-model/${modelId.replace(/\//g, '_')}/`, // Virtual base URL pattern
        files: servedFiles,
        createdAt: Date.now(),
        manifest
      }

      this.servedModels.set(modelId, servedModel)

      console.log(`🎉 Successfully served model ${modelId} with ${servedFiles.length} blob URLs`)
      
      return servedModel

    } catch (error) {
      // Clean up any blob URLs created before the error
      for (const file of servedFiles) {
        (globalThis as any).URL.revokeObjectURL(file.blobUrl)
      }
      
      console.error(`❌ Failed to serve model ${modelId}:`, error)
      throw error
    }
  }

  /**
   * Get served model info
   */
  getServedModel(modelId: string): ServedModel | null {
    return this.servedModels.get(modelId) || null
  }

  /**
   * Check if model is currently served
   */
  isModelServed(modelId: string): boolean {
    return this.servedModels.has(modelId)
  }

  /**
   * Get list of currently served models
   */
  getServedModels(): string[] {
    return Array.from(this.servedModels.keys())
  }

  /**
   * Unserve a model (revoke blob URLs and free memory)
   */
  unserveModel(modelId: string): void {
    const servedModel = this.servedModels.get(modelId)
    if (!servedModel) {
      console.warn(`Model ${modelId} is not currently served`)
      return
    }

    // Revoke all blob URLs to free memory
    for (const file of servedModel.files) {
      (globalThis as any).URL.revokeObjectURL(file.blobUrl)
    }

    this.servedModels.delete(modelId)
    console.log(`🗑️ Unserved model ${modelId}, freed ${servedModel.files.length} blob URLs`)
  }

  /**
   * Unserve all models
   */
  unserveAllModels(): void {
    const modelIds = Array.from(this.servedModels.keys())
    for (const modelId of modelIds) {
      this.unserveModel(modelId)
    }
    console.log(`🗑️ Unserved all models`)
  }

  /**
   * Get model serving status
   */
  getServingStatus(): ModelServingStatus {
    const servedModels = this.getServedModels()
    let totalObjectUrls = 0
    let memoryUsageEstimate = 0

    for (const servedModel of this.servedModels.values()) {
      totalObjectUrls += servedModel.files.length
      memoryUsageEstimate += servedModel.files.reduce((sum, file) => sum + file.size, 0)
    }

    return {
      servedModels,
      totalObjectUrls,
      memoryUsageEstimate
    }
  }

  /**
   * Create model serving configuration for iframe
   * This generates the configuration that tells transformers.js where to find model files
   */
  createIframeModelConfig(modelId: string): any {
    const servedModel = this.getServedModel(modelId)
    if (!servedModel) {
      throw new Error(`Model ${modelId} is not currently served`)
    }

    // Create a mapping of filenames to blob URLs
    const fileUrlMap: Record<string, string> = {}
    for (const file of servedModel.files) {
      fileUrlMap[file.filename] = file.blobUrl
    }

    return {
      modelId,
      baseUrl: servedModel.baseUrl,
      files: fileUrlMap,
      totalFiles: servedModel.files.length,
      servedAt: servedModel.createdAt
    }
  }

  /**
   * Get blob URL for specific model file
   */
  getModelFileUrl(modelId: string, filename: string): string | null {
    const servedModel = this.getServedModel(modelId)
    if (!servedModel) {
      return null
    }

    const file = servedModel.files.find(f => f.filename === filename)
    return file ? file.blobUrl : null
  }

  /**
   * Validate that all blob URLs are still valid
   * (In case they were revoked externally)
   */
  async validateServedModel(modelId: string): Promise<boolean> {
    const servedModel = this.getServedModel(modelId)
    if (!servedModel) {
      return false
    }

    // Test one blob URL to see if it's still valid
    try {
      if (servedModel.files.length > 0) {
        const testUrl = servedModel.files[0].blobUrl
        const response = await (globalThis as any).fetch(testUrl, { method: 'HEAD' })
        return response.ok
      }
      return true
    } catch (error) {
      console.warn(`Served model ${modelId} has invalid blob URLs:`, error)
      return false
    }
  }

  /**
   * Refresh served model (re-create blob URLs)
   */
  async refreshServedModel(modelId: string): Promise<void> {
    // Unserve existing model
    this.unserveModel(modelId)
    
    // Serve again (creates new blob URLs)
    await this.serveModel(modelId)
    
    console.log(`🔄 Refreshed served model ${modelId}`)
  }

  /**
   * Get memory usage estimate in human-readable format
   */
  getMemoryUsageString(): string {
    const status = this.getServingStatus()
    const bytes = status.memoryUsageEstimate
    
    if (bytes === 0) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  /**
   * Cleanup on service disposal
   */
  dispose(): void {
    this.unserveAllModels()
    console.log('✅ ModelServingService disposed')
  }
}

// Export singleton instance
export const modelServingService = ModelServingService.getInstance()