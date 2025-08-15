/**
 * Iframe-Based Transformers.js Embedding Service
 * 
 * This service implements the iframe sandboxing pattern proven by Smart Connections
 * to successfully run @xenova/transformers in Obsidian's Electron environment.
 * 
 * Key advantages:
 * - No bundling complexity (CDN-loaded transformers.js in iframe)
 * - Production-proven approach (Smart Connections uses this pattern)
 * - Full HuggingFace model ecosystem access
 * - Isolation from main plugin bundle
 * - No Node.js compatibility issues
 */

import { ModelInfo, EmbeddingService } from '../indexing/embedding-service'
import { modelServingService, ModelServingService } from './model-serving-service'
import { modelDownloadService, HuggingFaceModelConfig } from './model-download-service'

export interface IframeModelConfig {
  id: string // HuggingFace model ID
  name: string
  description: string
  dimensions: number
  contextLength: number
  languages: string[]
}

export interface IframeMessage {
  type: 'INITIALIZE' | 'EMBED' | 'BATCH_EMBED' | 'MODEL_INFO' | 'SWITCH_MODEL' | 'STATUS' | 'SET_MODEL_CONFIG'
  data?: { modelId?: string; text?: string; texts?: string[]; modelConfig?: any }
  requestId?: string
}

export interface IframeResponse {
  type: 'INITIALIZED' | 'EMBEDDING_RESULT' | 'BATCH_RESULT' | 'MODEL_INFO_RESULT' | 'ERROR' | 'STATUS_RESULT' | 'PROGRESS' | 'MODEL_CONFIG_SET'
  data?: number[] | number[][] | { initialized: boolean; currentModel: string | null } | unknown
  requestId?: string
  error?: string
}

/**
 * Iframe-based Transformers.js service using Smart Connections pattern
 */
export class IframeTransformersService implements EmbeddingService {
  private static instance: IframeTransformersService
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private iframe: any = null
  private initialized = false
  private currentModel = 'Xenova/all-MiniLM-L6-v2'
  private pendingRequests = new Map<string, { resolve: Function; reject: Function }>()
  private modelConfigured = false
  
  // Get available models from ModelDownloadService
  private getAvailableModelConfigs(): Record<string, IframeModelConfig> {
    const configs: Record<string, IframeModelConfig> = {}
    const availableModels = modelDownloadService.getAvailableModels()
    
    for (const model of availableModels) {
      configs[model.id] = {
        id: model.id,
        name: model.name,
        description: model.description,
        dimensions: model.dimensions,
        contextLength: model.contextLength,
        languages: model.languages
      }
    }
    
    return configs
  }

  private constructor() {}

  static getInstance(): IframeTransformersService {
    if (!IframeTransformersService.instance) {
      IframeTransformersService.instance = new IframeTransformersService()
    }
    return IframeTransformersService.instance
  }

  /**
   * Configure model serving for iframe transformers.js
   */
  private async configureModelServing(modelId: string): Promise<void> {
    console.log(`📡 Configuring model serving for ${modelId}...`)
    
    try {
      // Check if model is downloaded
      const isDownloaded = await modelDownloadService.isModelDownloaded(modelId)
      if (!isDownloaded) {
        throw new Error(`Model ${modelId} is not downloaded. Please download it first.`)
      }

      // Serve the model (creates blob URLs)
      const servedModel = await modelServingService.serveModel(modelId)
      
      // Create iframe model configuration
      const modelConfig = modelServingService.createIframeModelConfig(modelId)
      
      console.log(`📦 Model serving configured:`, {
        modelId: modelConfig.modelId,
        totalFiles: modelConfig.totalFiles,
        servedAt: new Date(modelConfig.servedAt).toISOString()
      })
      
      return modelConfig
      
    } catch (error) {
      console.error(`❌ Failed to configure model serving for ${modelId}:`, error)
      throw error
    }
  }

  /**
   * Configure model in iframe using blob URL serving
   */
  private async setModelConfigInIframe(modelId: string): Promise<void> {
    console.log(`🔧 Setting model configuration in iframe for ${modelId}...`)
    
    try {
      const modelConfig = await this.configureModelServing(modelId)
      
      console.log('📡 Sending SET_MODEL_CONFIG message to iframe...')
      await this.sendMessage<void>({
        type: 'SET_MODEL_CONFIG',
        data: { modelConfig }
      })
      
      this.modelConfigured = true
      console.log('✅ Model configuration set successfully in iframe')
      
    } catch (error) {
      console.error('❌ Failed to set model configuration:', error)
      this.modelConfigured = false
      throw error
    }
  }

  /**
   * Initialize the iframe embedding service
   */
  async initialize(): Promise<void> {
    if (this.initialized && this.iframe) {
      return
    }

    console.log('🔄 Initializing IframeTransformersService...')
    
    try {
      // Create sandboxed iframe for ML operations
      await this.createEmbeddingIframe()
      
      // Configure model serving for the default model
      await this.setModelConfigInIframe(this.currentModel)
      
      // Initialize with configured model
      await this.initializeModel(this.currentModel)
      
      this.initialized = true
      const servingStatus = this.modelConfigured ? 'with blob URL serving' : 'with remote models'
      console.log(`✅ IframeTransformersService initialized with ${this.currentModel} ${servingStatus}`)
      
    } catch (error) {
      console.error('❌ Failed to initialize IframeTransformersService:', error)
      throw error
    }
  }

  /**
   * Create iframe with transformers.js loaded from CDN
   * Using Smart Connections proven pattern
   */
  private async createEmbeddingIframe(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.iframe = globalThis.document.createElement('iframe')
      this.iframe.style.display = 'none'
      this.iframe.style.position = 'absolute'
      this.iframe.style.top = '-9999px'
      
      // Iframe content with CDN-loaded transformers.js (no bundling issues!)
      this.iframe.srcdoc = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>InterBrain Embedding Worker</title>
        </head>
        <body>
          <script type="module">
            // Load transformers.js from CDN (Smart Connections proven approach)
            import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';
            
            // Configure for local model serving via blob URLs
            env.allowRemoteModels = false;  // Force local-only loading
            env.allowLocalModels = true;    // Enable local model loading
            env.useBrowserCache = false;    // Disable browser cache (use blob URLs)
            
            // Disable WebAssembly threading for Electron compatibility
            env.backends.onnx.wasm.numThreads = 1;
            env.backends.onnx.wasm.simd = false;
            
            // Model configuration (set via SET_MODEL_CONFIG message)
            let modelConfig = null;
            
            // Override fetch to intercept model file requests
            // UNIVERSAL APPROACH: Handle any model file request pattern
            const originalFetch = window.fetch;
            window.fetch = async (resource, options) => {
              const url = resource.toString();
              
              // Intercept requests to /models/ or app://obsidian.md/models/
              if (url.includes('/models/') && modelConfig) {
                console.log('[FETCH-INTERCEPT] Intercepting request for:', url);
                
                // Extract different possible file identifiers
                const filename = url.split('/').pop();  // Just the filename
                const fullPath = url.split('/models/')[1];  // Full path after /models/
                const pathParts = fullPath ? fullPath.split('/') : [];
                
                // STRATEGY 1: Try exact filename match
                if (modelConfig.files && modelConfig.files[filename]) {
                  const blobUrl = modelConfig.files[filename];
                  console.log('[FETCH-INTERCEPT] ✅ Serving', filename, 'from blob URL');
                  return originalFetch(blobUrl, options);
                }
                
                // STRATEGY 2: Try full path match  
                if (modelConfig.files && modelConfig.files[fullPath]) {
                  const blobUrl = modelConfig.files[fullPath];
                  console.log('[FETCH-INTERCEPT] ✅ Serving', fullPath, 'from blob URL');
                  return originalFetch(blobUrl, options);
                }
                
                // STRATEGY 3: Try fuzzy matching for ONNX files
                // Handle requests like 'model_quantized.onnx' -> 'model.onnx'
                if (filename && filename.includes('.onnx')) {
                  for (const [availableFile, blobUrl] of Object.entries(modelConfig.files)) {
                    if (availableFile.includes('.onnx')) {
                      console.log('[FETCH-INTERCEPT] 🔄 ONNX fallback: serving', availableFile, 'for requested', filename);
                      return originalFetch(blobUrl, options);
                    }
                  }
                }
                
                // STRATEGY 4: Try partial filename matching
                if (filename) {
                  for (const [availableFile, blobUrl] of Object.entries(modelConfig.files)) {
                    if (availableFile.toLowerCase().includes(filename.toLowerCase()) || 
                        filename.toLowerCase().includes(availableFile.toLowerCase())) {
                      console.log('[FETCH-INTERCEPT] 🎯 Partial match: serving', availableFile, 'for requested', filename);
                      return originalFetch(blobUrl, options);
                    }
                  }
                }
                
                console.warn('[FETCH-INTERCEPT] ❌ File not found with any strategy');
                console.warn('[FETCH-INTERCEPT] Requested:', filename, '|', fullPath);
                console.warn('[FETCH-INTERCEPT] Available:', Object.keys(modelConfig.files || {}));
              }
              
              // Default behavior for other requests
              return originalFetch(resource, options);
            };
            
            // Set local model path to trigger local loading
            env.localModelPath = '/models/';
            
            let embedder = null;
            let currentModel = null;
            
            // Message handler for communication with main plugin
            window.addEventListener('message', async (event) => {
              const { type, data, requestId } = event.data;
              
              try {
                switch (type) {
                  case 'INITIALIZE':
                    console.log('🤖 Iframe: Initializing embedding model...', data.modelId);
                    embedder = await pipeline('feature-extraction', data.modelId, { 
                      progress_callback: (progress) => {
                        window.parent.postMessage({
                          type: 'PROGRESS',
                          data: progress,
                          requestId
                        }, '*');
                      }
                    });
                    currentModel = data.modelId;
                    window.parent.postMessage({ type: 'INITIALIZED', requestId }, '*');
                    break;
                    
                  case 'EMBED':
                    if (!embedder) throw new Error('Model not initialized');
                    const result = await embedder(data.text, { pooling: 'mean', normalize: true });
                    window.parent.postMessage({
                      type: 'EMBEDDING_RESULT',
                      data: Array.from(result.data),
                      requestId
                    }, '*');
                    break;
                    
                  case 'BATCH_EMBED':
                    if (!embedder) throw new Error('Model not initialized');
                    const results = [];
                    for (const text of data.texts) {
                      const result = await embedder(text, { pooling: 'mean', normalize: true });
                      results.push(Array.from(result.data));
                    }
                    window.parent.postMessage({
                      type: 'BATCH_RESULT',
                      data: results,
                      requestId
                    }, '*');
                    break;
                    
                  case 'STATUS':
                    window.parent.postMessage({
                      type: 'STATUS_RESULT',
                      data: {
                        initialized: !!embedder,
                        currentModel: currentModel
                      },
                      requestId
                    }, '*');
                    break;
                    
                  case 'SWITCH_MODEL':
                    console.log('🔄 Iframe: Switching to model...', data.modelId);
                    embedder = await pipeline('feature-extraction', data.modelId, {
                      progress_callback: (progress) => {
                        window.parent.postMessage({
                          type: 'PROGRESS',
                          data: progress,
                          requestId
                        }, '*');
                      }
                    });
                    currentModel = data.modelId;
                    window.parent.postMessage({ type: 'INITIALIZED', requestId }, '*');
                    break;
                    
                  case 'SET_MODEL_CONFIG':
                    console.log('📦 Iframe: Setting model configuration...', data.modelConfig);
                    if (data.modelConfig) {
                      modelConfig = data.modelConfig;
                      
                      console.log('✅ Iframe: Model serving configured with fetch interception');
                      console.log('  Model ID:', modelConfig.modelId);
                      console.log('  Files:', Object.keys(modelConfig.files).length);
                      console.log('  Sample file mapping:');
                      Object.entries(modelConfig.files).slice(0, 2).forEach(([filename, blobUrl]) => {
                        console.log('    ' + filename + ' -> ' + blobUrl);
                      });
                    } else {
                      console.log('⚠️ Iframe: No model configuration provided');
                    }
                    window.parent.postMessage({ type: 'MODEL_CONFIG_SET', requestId }, '*');
                    break;
                }
              } catch (error) {
                console.error('❌ Iframe: Error processing message:', error);
                window.parent.postMessage({
                  type: 'ERROR',
                  error: error.message,
                  requestId
                }, '*');
              }
            });
            
            // Signal that iframe is ready
            window.parent.postMessage({ type: 'IFRAME_READY' }, '*');
          </script>
        </body>
        </html>
      `
      
      // Set up message listener before appending iframe
      this.setupMessageListener()
      
      // Handle iframe load
      this.iframe.onload = () => {
        console.log('✅ Embedding iframe loaded successfully')
        resolve()
      }
      
      this.iframe.onerror = (error: unknown) => {
        console.error('❌ Failed to load embedding iframe:', error)
        reject(error)
      }
      
      // Append to document body
      globalThis.document.body.appendChild(this.iframe)
    })
  }

  /**
   * Set up message listener for iframe communication
   */
  private setupMessageListener(): void {
    globalThis.window.addEventListener('message', (event) => {
      if (event.source !== this.iframe?.contentWindow) return
      
      const response: IframeResponse = event.data
      
      // Handle responses with request IDs
      if (response.requestId && this.pendingRequests.has(response.requestId)) {
        const { resolve, reject } = this.pendingRequests.get(response.requestId)!
        this.pendingRequests.delete(response.requestId)
        
        if (response.type === 'ERROR') {
          reject(new Error(response.error || 'Unknown iframe error'))
        } else {
          resolve(response.data)
        }
      }
      
      // Handle status updates and progress
      if (response.type === 'PROGRESS') {
        console.log('📊 Model loading progress:', response.data)
      }
    })
  }

  /**
   * Initialize model in iframe
   */
  private async initializeModel(modelId: string): Promise<void> {
    if (!this.iframe) {
      throw new Error('Iframe not created')
    }

    await this.sendMessage<void>({
      type: 'INITIALIZE',
      data: { modelId }
    })
  }

  /**
   * Send message to iframe and wait for response
   */
  private async sendMessage<T>(message: IframeMessage): Promise<T> {
    if (!this.iframe || !this.iframe.contentWindow) {
      throw new Error('Iframe not available')
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    message.requestId = requestId

    return new Promise<T>((resolve, reject) => {
      // Store promise resolvers
      this.pendingRequests.set(requestId, { resolve, reject })
      
      // Send message to iframe
      this.iframe!.contentWindow.postMessage(message, '*')
      
      // Timeout after 30 seconds
      globalThis.setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId)
          reject(new Error('Iframe request timeout'))
        }
      }, 30000)
    })
  }

  /**
   * Generate embedding for single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const embedding = await this.sendMessage<number[]>({
        type: 'EMBED',
        data: { text }
      })
      
      return embedding
    } catch (error) {
      console.error('❌ Embedding generation failed:', error)
      throw new Error(`Embedding generation failed: ${error}`)
    }
  }

  /**
   * Generate embeddings for multiple texts
   */
  async batchEmbedding(texts: string[]): Promise<number[][]> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const embeddings = await this.sendMessage<number[][]>({
        type: 'BATCH_EMBED',
        data: { texts }
      })
      
      return embeddings
    } catch (error) {
      console.error('❌ Batch embedding failed:', error)
      throw new Error(`Batch embedding failed: ${error}`)
    }
  }

  /**
   * Switch to different model
   */
  async switchModel(modelId: string): Promise<void> {
    const availableModels = this.getAvailableModelConfigs()
    if (!availableModels[modelId]) {
      throw new Error(`Unsupported model: ${modelId}. Available: ${Object.keys(availableModels).join(', ')}`)
    }

    if (this.currentModel === modelId && this.initialized) {
      console.log(`✅ Model ${modelId} already active`)
      return
    }

    console.log(`🔄 Switching to model: ${modelId}`)
    
    try {
      // Configure serving for the new model
      await this.setModelConfigInIframe(modelId)
      
      // Switch model in iframe
      await this.sendMessage<void>({
        type: 'SWITCH_MODEL',
        data: { modelId }
      })
      
      this.currentModel = modelId
      console.log(`✅ Successfully switched to ${modelId}`)
      
    } catch (error) {
      console.error(`❌ Failed to switch to model ${modelId}:`, error)
      throw error
    }
  }

  /**
   * Get current model information
   */
  getModelInfo(): ModelInfo {
    const availableModels = this.getAvailableModelConfigs()
    const config = availableModels[this.currentModel]
    
    if (!config) {
      // Fallback to default
      const defaultConfig = availableModels['Xenova/all-MiniLM-L6-v2']
      if (defaultConfig) {
        return {
          id: defaultConfig.id,
          name: defaultConfig.name,
          description: defaultConfig.description,
          size: '90MB', // Approximate size
          dimensions: defaultConfig.dimensions,
          contextLength: defaultConfig.contextLength,
          languages: defaultConfig.languages
        }
      }
    }

    if (config) {
      return {
        id: config.id,
        name: config.name,
        description: config.description,
        size: '90MB', // Default size estimate
        dimensions: config.dimensions,
        contextLength: config.contextLength,
        languages: config.languages
      }
    }

    // Ultimate fallback
    return {
      id: this.currentModel,
      name: 'Unknown Model',
      description: 'Model configuration not available',
      size: 'Unknown',
      dimensions: 384,
      contextLength: 512,
      languages: ['en']
    }
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.iframe !== null
  }

  /**
   * Check if model serving is configured
   */
  isModelServingEnabled(): boolean {
    return this.modelConfigured
  }

  /**
   * Check if a specific model is available for serving
   */
  async isModelAvailable(modelId: string): Promise<boolean> {
    return await modelDownloadService.isModelDownloaded(modelId)
  }

  /**
   * Get list of available models
   */
  getAvailableModels(): IframeModelConfig[] {
    return Object.values(this.getAvailableModelConfigs())
  }

  /**
   * Get serving status information
   */
  getServingStatus() {
    return modelServingService.getServingStatus()
  }

  /**
   * Get iframe status
   */
  async getStatus(): Promise<{ initialized: boolean; currentModel: string | null }> {
    if (!this.iframe) {
      return { initialized: false, currentModel: null }
    }

    try {
      const status = await this.sendMessage<{ initialized: boolean; currentModel: string | null }>({ type: 'STATUS' })
      return status
    } catch (error) {
      console.warn('Could not get iframe status:', error)
      return { initialized: false, currentModel: null }
    }
  }

  /**
   * Clean up iframe resources
   */
  dispose(): void {
    if (this.iframe) {
      globalThis.document.body.removeChild(this.iframe)
      this.iframe = null
    }
    
    // Clean up served models to free memory
    if (this.modelConfigured) {
      modelServingService.unserveAllModels()
    }
    
    this.initialized = false
    this.modelConfigured = false
    this.pendingRequests.clear()
    console.log('✅ IframeTransformersService disposed')
  }
}