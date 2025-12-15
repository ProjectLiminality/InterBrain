/**
 * AI Magic Types
 *
 * Core interfaces for unified AI provider management.
 */

/**
 * Task complexity for routing to appropriate model tier
 */
export type TaskComplexity = 'trivial' | 'standard' | 'complex';

/**
 * Provider type classification
 */
export type ProviderType = 'local' | 'remote';

/**
 * Hardware tier for local model selection
 * Determines which Ollama models are appropriate for the user's system
 */
export type HardwareTier = 'high' | 'medium' | 'low';

/**
 * Message format for LLM conversations
 */
export interface AIMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
}

/**
 * Response from AI completion
 */
export interface AIResponse {
	content: string;
	provider: string;
	model: string;
	usage?: {
		inputTokens: number;
		outputTokens: number;
	};
}

/**
 * Options for completion requests
 */
export interface CompletionOptions {
	model?: string;
	maxTokens?: number;
	temperature?: number;
	/** Force a specific provider instead of auto-routing */
	forceProvider?: string;
}

/**
 * Provider status information
 */
export interface ProviderStatus {
	name: string;
	type: ProviderType;
	status: 'ready' | 'unavailable' | 'not_configured' | 'error';
	message: string;
	details?: string;
	models?: string[];
}

/**
 * Base interface for AI providers
 */
export interface AIProvider {
	readonly name: string;
	readonly type: ProviderType;

	/**
	 * Check if provider is available and ready
	 */
	isAvailable(): Promise<boolean>;

	/**
	 * Get detailed status
	 */
	getStatus(): Promise<ProviderStatus>;

	/**
	 * Generate completion
	 */
	generateCompletion(
		messages: AIMessage[],
		options?: CompletionOptions
	): Promise<AIResponse>;

	/**
	 * Get available models for this provider
	 */
	getAvailableModels(): Promise<string[]>;

	/**
	 * Get default model for a given complexity tier
	 */
	getModelForComplexity(complexity: TaskComplexity): string;
}

/**
 * Configuration for Claude provider
 */
export interface ClaudeConfig {
	apiKey: string;
	models?: {
		trivial?: string;
		standard?: string;
		complex?: string;
	};
}

/**
 * Configuration for Ollama provider
 */
export interface OllamaConfig {
	baseUrl?: string; // Default: http://localhost:11434
	hardwareTier: HardwareTier;
	models?: {
		trivial?: string;
		standard?: string;
		complex?: string;
	};
}

/**
 * Configuration for OpenRouter provider (future)
 */
export interface OpenRouterConfig {
	apiKey: string;
	models?: {
		trivial?: string;
		standard?: string;
		complex?: string;
	};
}

/**
 * Full AI Magic configuration stored in settings
 */
export interface AIMagicConfig {
	/** Prefer local AI when available */
	preferLocal: boolean;
	/** Offline mode - never make API calls */
	offlineMode: boolean;
	/** Claude API configuration */
	claude?: ClaudeConfig;
	/** Ollama configuration */
	ollama?: OllamaConfig;
	/** OpenRouter configuration (future) */
	openRouter?: OpenRouterConfig;
}

/**
 * Curated model recommendations for Ollama
 */
export interface CuratedModel {
	id: string;
	name: string;
	description: string;
	size: string;
	tier: HardwareTier;
	complexity: TaskComplexity;
}

/**
 * Default curated models for Ollama
 */
export const CURATED_OLLAMA_MODELS: CuratedModel[] = [
	// High tier (64GB+ RAM)
	{
		id: 'llama3.1:70b',
		name: 'Llama 3.1 70B',
		description: 'Most capable open model, excellent reasoning',
		size: '~40GB',
		tier: 'high',
		complexity: 'complex'
	},
	{
		id: 'qwen2.5:72b',
		name: 'Qwen 2.5 72B',
		description: 'Excellent multilingual and coding capabilities',
		size: '~40GB',
		tier: 'high',
		complexity: 'complex'
	},

	// Medium tier (16GB+ RAM)
	{
		id: 'llama3.1:8b',
		name: 'Llama 3.1 8B',
		description: 'Great balance of capability and speed',
		size: '~5GB',
		tier: 'medium',
		complexity: 'standard'
	},
	{
		id: 'mistral:7b',
		name: 'Mistral 7B',
		description: 'Fast and capable, good for general tasks',
		size: '~4GB',
		tier: 'medium',
		complexity: 'standard'
	},
	{
		id: 'qwen2.5:14b',
		name: 'Qwen 2.5 14B',
		description: 'Strong reasoning in compact size',
		size: '~9GB',
		tier: 'medium',
		complexity: 'standard'
	},

	// Low tier (8GB+ RAM)
	{
		id: 'llama3.2:3b',
		name: 'Llama 3.2 3B',
		description: 'Efficient and fast for simple tasks',
		size: '~2GB',
		tier: 'low',
		complexity: 'trivial'
	},
	{
		id: 'phi3:mini',
		name: 'Phi-3 Mini',
		description: 'Microsoft\'s efficient small model',
		size: '~2GB',
		tier: 'low',
		complexity: 'trivial'
	},
	{
		id: 'gemma2:2b',
		name: 'Gemma 2 2B',
		description: 'Google\'s compact open model',
		size: '~1.5GB',
		tier: 'low',
		complexity: 'trivial'
	}
];

/**
 * Default Claude models by complexity
 */
export const CLAUDE_MODELS = {
	trivial: 'claude-haiku-4-5',
	standard: 'claude-sonnet-4-5',
	complex: 'claude-opus-4-5'
} as const;

/**
 * Default Ollama models by hardware tier
 * Maps hardware tier to recommended models for each complexity level
 */
export const DEFAULT_OLLAMA_MODELS: Record<HardwareTier, Record<TaskComplexity, string>> = {
	high: {
		trivial: 'llama3.2:3b',
		standard: 'llama3.1:8b',
		complex: 'llama3.1:70b'
	},
	medium: {
		trivial: 'llama3.2:3b',
		standard: 'llama3.1:8b',
		complex: 'llama3.1:8b' // Best effort with medium tier
	},
	low: {
		trivial: 'llama3.2:3b',
		standard: 'llama3.2:3b',
		complex: 'llama3.2:3b' // All tasks use small model
	}
};
