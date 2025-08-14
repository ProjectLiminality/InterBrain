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

export interface IframeModelConfig {
  id: string // HuggingFace model ID
  name: string
  description: string
  dimensions: number
  contextLength: number
  languages: string[]
}

export interface IframeMessage {
  type: 'INITIALIZE' | 'EMBED' | 'BATCH_EMBED' | 'MODEL_INFO' | 'SWITCH_MODEL' | 'STATUS'
  data?: { modelId?: string; text?: string; texts?: string[] }
  requestId?: string
}

export interface IframeResponse {
  type: 'INITIALIZED' | 'EMBEDDING_RESULT' | 'BATCH_RESULT' | 'MODEL_INFO_RESULT' | 'ERROR' | 'STATUS_RESULT' | 'PROGRESS'
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
  
  // Popular models available via transformers.js (Xenova-converted for ONNX compatibility)
  private static readonly AVAILABLE_MODELS: Record<string, IframeModelConfig> = {
    'Xenova/all-MiniLM-L6-v2': {
      id: 'Xenova/all-MiniLM-L6-v2',
      name: 'all-MiniLM-L6-v2',
      description: 'Lightweight and fast sentence embedding model, 384 dimensions',
      dimensions: 384,
      contextLength: 256,
      languages: ['en', 'multilingual']
    },
    'Xenova/all-mpnet-base-v2': {
      id: 'Xenova/all-mpnet-base-v2',
      name: 'all-mpnet-base-v2',
      description: 'High-quality sentence embedding model, 768 dimensions',
      dimensions: 768,
      contextLength: 384,
      languages: ['en']
    },
    'Xenova/bge-small-en-v1.5': {
      id: 'Xenova/bge-small-en-v1.5',
      name: 'BGE Small EN v1.5',
      description: 'Efficient English embedding model, 384 dimensions',
      dimensions: 384,
      contextLength: 512,
      languages: ['en']
    }
  }

  private constructor() {}

  static getInstance(): IframeTransformersService {
    if (!IframeTransformersService.instance) {
      IframeTransformersService.instance = new IframeTransformersService()
    }
    return IframeTransformersService.instance
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
      
      // Initialize with default model
      await this.initializeModel(this.currentModel)
      
      this.initialized = true
      console.log(`✅ IframeTransformersService initialized with ${this.currentModel}`)
      
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
            
            // Configure for browser environment with Electron compatibility
            env.allowRemoteModels = true;
            env.allowLocalModels = false;
            env.useBrowserCache = true;
            
            // Disable WebAssembly threading for Electron compatibility
            env.backends.onnx.wasm.numThreads = 1;
            env.backends.onnx.wasm.simd = false;
            
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
    if (!IframeTransformersService.AVAILABLE_MODELS[modelId]) {
      throw new Error(`Unsupported model: ${modelId}. Available: ${Object.keys(IframeTransformersService.AVAILABLE_MODELS).join(', ')}`)
    }

    if (this.currentModel === modelId && this.initialized) {
      console.log(`✅ Model ${modelId} already active`)
      return
    }

    console.log(`🔄 Switching to model: ${modelId}`)
    
    try {
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
    const config = IframeTransformersService.AVAILABLE_MODELS[this.currentModel]
    if (!config) {
      // Fallback to default
      const defaultConfig = IframeTransformersService.AVAILABLE_MODELS['Xenova/all-MiniLM-L6-v2']
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

    return {
      id: config.id,
      name: config.name,
      description: config.description,
      size: '90MB', // Transformers.js models are cached by browser
      dimensions: config.dimensions,
      contextLength: config.contextLength,
      languages: config.languages
    }
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.iframe !== null
  }

  /**
   * Get list of available models
   */
  getAvailableModels(): IframeModelConfig[] {
    return Object.values(IframeTransformersService.AVAILABLE_MODELS)
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
    
    this.initialized = false
    this.pendingRequests.clear()
    console.log('✅ IframeTransformersService disposed')
  }
}