/**
 * Ollama Inference Provider
 *
 * Local LLM inference via Ollama chat/generate API.
 * Separate from semantic-search embeddings - this is for text generation.
 */

import {
	AIProvider,
	AIMessage,
	AIResponse,
	CompletionOptions,
	ProviderStatus,
	TaskComplexity,
	HardwareTier,
	OllamaConfig,
	DEFAULT_OLLAMA_MODELS,
	detectHardwareTier,
	HIGH_TIER_RAM_THRESHOLD_GB
} from '../types';

/**
 * Ollama API response types
 */
interface OllamaChatResponse {
	model: string;
	message: {
		role: string;
		content: string;
	};
	done: boolean;
	total_duration?: number;
	load_duration?: number;
	prompt_eval_count?: number;
	eval_count?: number;
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
			parameter_size: string;
			quantization_level: string;
		};
	}>;
}

/**
 * Strip <think>...</think> tags from model output
 * Some models (like qwen3) include reasoning in these tags by default
 */
function stripThinkingTags(content: string): string {
	// Remove <think>...</think> blocks (including newlines within)
	return content.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
}

/**
 * Ollama Inference Provider
 * Uses Ollama's /api/chat endpoint for conversational AI
 */
export class OllamaInferenceProvider implements AIProvider {
	readonly name = 'Ollama';
	readonly type = 'local' as const;

	private baseUrl: string;
	private hardwareTier: HardwareTier;
	private models: Record<TaskComplexity, string>;
	private availableModels: string[] | null = null;
	private lastHealthCheck: { available: boolean; timestamp: number } | null = null;
	private readonly healthCacheMs = 30000;

	constructor(config: OllamaConfig) {
		this.baseUrl = (config.baseUrl || 'http://localhost:11434').replace(/\/$/, '');
		// Auto-detect hardware tier if not specified
		this.hardwareTier = config.hardwareTier || detectHardwareTier();
		this.models = {
			trivial: config.models?.trivial || DEFAULT_OLLAMA_MODELS[this.hardwareTier].trivial,
			standard: config.models?.standard || DEFAULT_OLLAMA_MODELS[this.hardwareTier].standard,
			complex: config.models?.complex || DEFAULT_OLLAMA_MODELS[this.hardwareTier].complex
		};
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<OllamaConfig>): void {
		if (config.baseUrl) {
			this.baseUrl = config.baseUrl.replace(/\/$/, '');
			this.lastHealthCheck = null;
		}
		if (config.hardwareTier) {
			this.hardwareTier = config.hardwareTier;
			// Update default models for new tier
			this.models = {
				trivial: config.models?.trivial || DEFAULT_OLLAMA_MODELS[this.hardwareTier].trivial,
				standard: config.models?.standard || DEFAULT_OLLAMA_MODELS[this.hardwareTier].standard,
				complex: config.models?.complex || DEFAULT_OLLAMA_MODELS[this.hardwareTier].complex
			};
		}
		if (config.models) {
			if (config.models.trivial) this.models.trivial = config.models.trivial;
			if (config.models.standard) this.models.standard = config.models.standard;
			if (config.models.complex) this.models.complex = config.models.complex;
		}
		this.availableModels = null;
	}

	/**
	 * Check if Ollama is running and accessible
	 */
	async isAvailable(): Promise<boolean> {
		// Return cached result if still valid
		if (this.lastHealthCheck &&
			Date.now() - this.lastHealthCheck.timestamp < this.healthCacheMs) {
			return this.lastHealthCheck.available;
		}

		try {
			const response = await globalThis.fetch(`${this.baseUrl}/api/tags`, {
				method: 'GET',
				headers: { 'Content-Type': 'application/json' }
			});

			const available = response.ok;
			this.lastHealthCheck = { available, timestamp: Date.now() };
			return available;
		} catch {
			this.lastHealthCheck = { available: false, timestamp: Date.now() };
			return false;
		}
	}

	/**
	 * Get detailed status
	 */
	async getStatus(): Promise<ProviderStatus> {
		const isAvailable = await this.isAvailable();

		if (!isAvailable) {
			return {
				name: this.name,
				type: this.type,
				status: 'unavailable',
				message: 'Ollama not running',
				details: 'Start Ollama to enable local AI'
			};
		}

		// Check if configured models are available
		const availableModels = await this.getAvailableModels();
		const configuredModels = Object.values(this.models);
		const missingModels = configuredModels.filter(m =>
			!availableModels.some(am => am === m || am.startsWith(`${m}:`))
		);

		if (missingModels.length > 0) {
			return {
				name: this.name,
				type: this.type,
				status: 'error',
				message: 'Models needed',
				details: `Pull missing models: ${missingModels.join(', ')}`,
				models: availableModels
			};
		}

		const tierLabel = this.hardwareTier === 'high' ? 'High Performance' : 'Standard';
		return {
			name: this.name,
			type: this.type,
			status: 'ready',
			message: `Ready (${tierLabel})`,
			details: `Using ${this.models.standard} on ${this.baseUrl}`,
			models: availableModels
		};
	}

	/**
	 * Get list of models installed in Ollama
	 */
	async getAvailableModels(): Promise<string[]> {
		if (this.availableModels) {
			return this.availableModels;
		}

		try {
			const response = await globalThis.fetch(`${this.baseUrl}/api/tags`, {
				method: 'GET',
				headers: { 'Content-Type': 'application/json' }
			});

			if (!response.ok) {
				return [];
			}

			const data: OllamaListResponse = await response.json();
			this.availableModels = data.models.map(m => m.name);
			return this.availableModels;
		} catch {
			return [];
		}
	}

	/**
	 * Get model for complexity tier
	 */
	getModelForComplexity(complexity: TaskComplexity): string {
		return this.models[complexity];
	}

	/**
	 * Pull a model from Ollama registry
	 */
	async pullModel(modelName: string, onProgress?: (status: string) => void): Promise<boolean> {
		try {
			const response = await globalThis.fetch(`${this.baseUrl}/api/pull`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: modelName, stream: false })
			});

			if (!response.ok) {
				throw new Error(`Failed to pull model: ${response.statusText}`);
			}

			// Invalidate cache
			this.availableModels = null;
			onProgress?.(`Successfully pulled ${modelName}`);
			return true;
		} catch (error) {
			console.error('Failed to pull Ollama model:', error);
			onProgress?.(`Failed to pull ${modelName}: ${error}`);
			return false;
		}
	}

	/**
	 * Generate completion using Ollama chat API
	 */
	async generateCompletion(
		messages: AIMessage[],
		options?: CompletionOptions
	): Promise<AIResponse> {
		const model = options?.model || this.models.trivial;

		// Convert messages to Ollama format
		const ollamaMessages = messages.map(m => ({
			role: m.role,
			content: m.content
		}));

		const requestBody = {
			model,
			messages: ollamaMessages,
			stream: false,
			options: {
				...(options?.temperature !== undefined && { temperature: options.temperature }),
				...(options?.maxTokens && { num_predict: options.maxTokens })
			}
		};

		try {
			const response = await globalThis.fetch(`${this.baseUrl}/api/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody)
			});

			if (!response.ok) {
				const error = await response.text();
				throw new Error(`Ollama API error: ${response.status} - ${error}`);
			}

			const data: OllamaChatResponse = await response.json();

			// Strip thinking tags from models that include them (e.g., qwen3)
			const content = stripThinkingTags(data.message.content);

			return {
				content,
				provider: this.name,
				model,
				usage: {
					inputTokens: data.prompt_eval_count || 0,
					outputTokens: data.eval_count || 0
				}
			};
		} catch (error) {
			console.error('Ollama inference failed:', error);
			throw error;
		}
	}

	/**
	 * Get current hardware tier
	 */
	getHardwareTier(): HardwareTier {
		return this.hardwareTier;
	}

	/**
	 * Set hardware tier and update default models
	 */
	setHardwareTier(tier: HardwareTier): void {
		this.hardwareTier = tier;
		this.models = { ...DEFAULT_OLLAMA_MODELS[tier] };
	}
}

/**
 * Create Ollama inference provider
 */
export function createOllamaInferenceProvider(config?: Partial<OllamaConfig>): OllamaInferenceProvider {
	return new OllamaInferenceProvider({
		hardwareTier: config?.hardwareTier, // Will auto-detect if not provided
		baseUrl: config?.baseUrl,
		models: config?.models
	});
}

/**
 * Get system RAM info for display
 */
export function getSystemRAMInfo(): { totalGB: number; tier: HardwareTier; meetsHighTier: boolean } {
	try {
		const os = require('os');
		const totalGB = os.totalmem() / (1024 * 1024 * 1024);
		const tier = detectHardwareTier();
		return {
			totalGB,
			tier,
			meetsHighTier: totalGB >= HIGH_TIER_RAM_THRESHOLD_GB
		};
	} catch {
		return {
			totalGB: 0,
			tier: 'standard',
			meetsHighTier: false
		};
	}
}
