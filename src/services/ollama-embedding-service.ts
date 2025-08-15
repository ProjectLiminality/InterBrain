import { 
  IEmbeddingService, 
  EmbeddingModelInfo, 
  EmbeddingConfig, 
  EmbeddingHealth,
  EmbeddingServiceError,
  TextProcessor,
  VectorUtils
} from './embedding-service';

/**
 * Ollama API response types
 */
interface OllamaEmbeddingResponse {
  embedding: number[];
}

interface OllamaListResponse {
  models: Array<{
    name: string;
    model: string;
    size: number;
    digest: string;
    details: {
      format: string;
      family: string;
      families: string[];
      parameter_size: string;
      quantization_level: string;
    };
  }>;
}

interface OllamaShowResponse {
  details: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
  model_info: {
    [key: string]: any;
  };
}

/**
 * Default configuration for embedding operations
 */
export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  chunkSize: 500,
  chunkOverlap: 100,
  maxRetries: 3,
  retryDelay: 1000
};

/**
 * Ollama embedding service implementation
 * Provides semantic embeddings via local Ollama API
 */
export class OllamaEmbeddingService implements IEmbeddingService {
  private baseUrl: string;
  private model: string;
  private config: EmbeddingConfig;
  private modelInfo: EmbeddingModelInfo | null = null;
  private lastHealthCheck: { result: EmbeddingHealth; timestamp: number } | null = null;
  private readonly healthCacheMs = 30000; // Cache health status for 30 seconds

  constructor(
    baseUrl: string = 'http://localhost:11434',
    model: string = 'nomic-embed-text',
    config: Partial<EmbeddingConfig> = {}
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.model = model;
    this.config = { ...DEFAULT_EMBEDDING_CONFIG, ...config };
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const cleanedText = TextProcessor.cleanText(text);
    
    if (!cleanedText.trim()) {
      throw new EmbeddingServiceError(
        'Cannot generate embedding for empty text',
        'INVALID_RESPONSE'
      );
    }

    return this.callOllamaEmbedding(cleanedText);
  }

  /**
   * Generate embeddings for multiple texts (batch processing)
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    // Process in batches to avoid overwhelming the API
    const batchSize = 10;
    const results: number[][] = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchPromises = batch.map(text => this.generateEmbedding(text));
      
      try {
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      } catch (error) {
        console.error(`Failed to process batch ${Math.floor(i / batchSize) + 1}:`, error);
        throw error;
      }
      
      // Small delay between batches to be respectful to the API
      if (i + batchSize < texts.length) {
        await new Promise(resolve => globalThis.setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Check if the embedding service is available and ready
   */
  async isAvailable(): Promise<boolean> {
    try {
      const health = await this.getHealth();
      return health.isAvailable && health.modelLoaded;
    } catch {
      return false;
    }
  }

  /**
   * Get information about the current embedding model
   */
  async getModelInfo(): Promise<EmbeddingModelInfo> {
    if (this.modelInfo) {
      return this.modelInfo;
    }

    try {
      const response = await this.fetchWithRetry(`${this.baseUrl}/api/show`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: this.model })
      });

      const data: OllamaShowResponse = await response.json();
      
      // Determine dimensions based on model
      let dimensions = 768; // Default for nomic-embed-text
      if (this.model.includes('all-minilm')) {
        dimensions = 384;
      }

      this.modelInfo = {
        name: this.model,
        dimensions,
        description: `${data.details.family} embedding model (${data.details.parameter_size} parameters)`
      };

      return this.modelInfo;
    } catch (error) {
      throw new EmbeddingServiceError(
        `Failed to get model info: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SERVICE_UNAVAILABLE',
        error
      );
    }
  }

  /**
   * Get detailed health status including model availability
   */
  async getHealth(): Promise<EmbeddingHealth> {
    // Return cached result if still valid
    if (this.lastHealthCheck && 
        Date.now() - this.lastHealthCheck.timestamp < this.healthCacheMs) {
      return this.lastHealthCheck.result;
    }

    const health: EmbeddingHealth = {
      isAvailable: false,
      modelLoaded: false
    };

    try {
      // Check if Ollama is running
      const listResponse = await globalThis.fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!listResponse.ok) {
        health.error = `Ollama not responding (HTTP ${listResponse.status})`;
        return this.cacheHealth(health);
      }

      health.isAvailable = true;

      // Check if our model is available
      const listData: OllamaListResponse = await listResponse.json();
      const modelExists = listData.models.some(m => 
        m.name === this.model || m.model === this.model
      );

      if (!modelExists) {
        health.error = `Model '${this.model}' not found. Run: ollama pull ${this.model}`;
        return this.cacheHealth(health);
      }

      health.modelLoaded = true;
      
      // Get model info if available
      try {
        health.modelInfo = await this.getModelInfo();
      } catch (error) {
        // Model info is nice to have but not critical
        console.warn('Could not get model info:', error);
      }

      return this.cacheHealth(health);

    } catch (error) {
      health.error = `Failed to connect to Ollama: ${error instanceof Error ? error.message : 'Unknown error'}`;
      return this.cacheHealth(health);
    }
  }

  /**
   * Process long text by chunking and averaging embeddings
   */
  async processLongText(text: string, config?: Partial<EmbeddingConfig>): Promise<number[]> {
    const processConfig = { ...this.config, ...config };
    const cleanedText = TextProcessor.extractContent(text);
    
    if (cleanedText.length <= processConfig.chunkSize) {
      return this.generateEmbedding(cleanedText);
    }

    // Split into chunks
    const chunks = TextProcessor.chunkText(
      cleanedText, 
      processConfig.chunkSize, 
      processConfig.chunkOverlap
    );

    console.log(`Processing long text: ${cleanedText.length} chars -> ${chunks.length} chunks`);

    // Generate embeddings for all chunks
    const embeddings = await this.generateBatchEmbeddings(chunks);

    // Average the embeddings
    return VectorUtils.averageVectors(embeddings);
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<EmbeddingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Update model
   */
  updateModel(newModel: string): void {
    this.model = newModel;
    this.modelInfo = null; // Reset cached model info
    this.lastHealthCheck = null; // Reset health cache
  }

  /**
   * Update base URL
   */
  updateBaseUrl(newBaseUrl: string): void {
    this.baseUrl = newBaseUrl.replace(/\/$/, '');
    this.lastHealthCheck = null; // Reset health cache
  }

  /**
   * Make API call to Ollama for embedding generation
   */
  private async callOllamaEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.fetchWithRetry(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt: text
        })
      });

      const data: OllamaEmbeddingResponse = await response.json();
      
      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new EmbeddingServiceError(
          'Invalid embedding response from Ollama',
          'INVALID_RESPONSE',
          data
        );
      }

      return data.embedding;

    } catch (error) {
      if (error instanceof EmbeddingServiceError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      
      if (message.includes('fetch')) {
        throw new EmbeddingServiceError(
          'Cannot connect to Ollama. Make sure Ollama is running on ' + this.baseUrl,
          'NETWORK_ERROR',
          error
        );
      }

      throw new EmbeddingServiceError(
        `Embedding generation failed: ${message}`,
        'UNKNOWN_ERROR',
        error
      );
    }
  }

  /**
   * Fetch with retry logic
   */
  private async fetchWithRetry(url: string, options: Record<string, any>): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await globalThis.fetch(url, {
          ...options,
          // Set reasonable timeout
          // signal: AbortSignal.timeout(30000) // 30 second timeout - commented out for compatibility
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < this.config.maxRetries) {
          console.warn(`Ollama API attempt ${attempt} failed, retrying in ${this.config.retryDelay}ms:`, lastError.message);
          await new Promise(resolve => globalThis.setTimeout(resolve, this.config.retryDelay * attempt));
        }
      }
    }

    throw new EmbeddingServiceError(
      `Failed after ${this.config.maxRetries} attempts: ${lastError?.message}`,
      'NETWORK_ERROR',
      lastError
    );
  }

  /**
   * Cache health check result
   */
  private cacheHealth(health: EmbeddingHealth): EmbeddingHealth {
    this.lastHealthCheck = {
      result: health,
      timestamp: Date.now()
    };
    return health;
  }
}

/**
 * Factory function to create OllamaEmbeddingService instance
 */
export function createOllamaEmbeddingService(
  baseUrl?: string,
  model?: string,
  config?: Partial<EmbeddingConfig>
): OllamaEmbeddingService {
  return new OllamaEmbeddingService(baseUrl, model, config);
}

/**
 * Singleton instance for convenient access
 */
export const ollamaEmbeddingService = createOllamaEmbeddingService();