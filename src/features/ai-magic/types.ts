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
 * Automatically detected based on system RAM
 * - standard: Works on most machines (8GB+ RAM)
 * - high: For powerful machines (32GB+ RAM) - enables larger models
 */
export type HardwareTier = 'standard' | 'high';

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
	hardwareTier?: HardwareTier; // Auto-detected if not specified
	models?: {
		trivial?: string;
		standard?: string;
		complex?: string;
	};
}

/**
 * Configuration for OpenAI provider
 */
export interface OpenAIConfig {
	apiKey: string;
	models?: {
		trivial?: string;
		standard?: string;
		complex?: string;
	};
}

/**
 * Configuration for Groq provider (blazing fast inference)
 */
export interface GroqConfig {
	apiKey: string;
	models?: {
		trivial?: string;
		standard?: string;
		complex?: string;
	};
}

/**
 * Configuration for xAI Grok provider
 */
export interface XAIConfig {
	apiKey: string;
	models?: {
		trivial?: string;
		standard?: string;
		complex?: string;
	};
}

/**
 * Provider identifiers for default provider selection
 */
export type ProviderKey = 'claude' | 'ollama' | 'openai' | 'groq' | 'xai';

/**
 * Full AI Magic configuration stored in settings
 */
export interface AIMagicConfig {
	/** Default provider to use (if available) */
	defaultProvider?: ProviderKey;
	/** Prefer local AI when available (legacy, use defaultProvider instead) */
	preferLocal: boolean;
	/** Offline mode - never make API calls */
	offlineMode: boolean;
	/** Claude API configuration */
	claude?: ClaudeConfig;
	/** Ollama configuration */
	ollama?: OllamaConfig;
	/** OpenAI configuration */
	openai?: OpenAIConfig;
	/** Groq configuration (fast inference) */
	groq?: GroqConfig;
	/** xAI Grok configuration */
	xai?: XAIConfig;
}

/**
 * Curated model recommendations for Ollama
 * Simplified: one model per tier
 */
export interface CuratedModel {
	id: string;
	name: string;
	description: string;
	size: string;
	tier: HardwareTier;
}

/**
 * RAM threshold for high tier (in GB)
 * Machines with 32GB+ RAM get access to larger models
 */
export const HIGH_TIER_RAM_THRESHOLD_GB = 32;

/**
 * Detect hardware tier based on system RAM
 * Returns 'high' if system has 32GB+ RAM, otherwise 'standard'
 */
export function detectHardwareTier(): HardwareTier {
	try {
		// In Electron/Node context, we can access os module
		const os = require('os');
		const totalMemoryGB = os.totalmem() / (1024 * 1024 * 1024);
		console.log(`[AI Magic] Detected system RAM: ${totalMemoryGB.toFixed(1)} GB`);
		return totalMemoryGB >= HIGH_TIER_RAM_THRESHOLD_GB ? 'high' : 'standard';
	} catch {
		console.warn('[AI Magic] Could not detect system RAM, defaulting to standard tier');
		return 'standard';
	}
}

/**
 * Default curated models for Ollama
 * One model per tier for simplicity
 */
export const CURATED_OLLAMA_MODELS: CuratedModel[] = [
	// High tier (32GB+ RAM) - more capable model
	{
		id: 'qwen3:32b',
		name: 'Qwen 3 32B',
		description: 'Powerful reasoning model for complex tasks',
		size: '~20GB',
		tier: 'high'
	},
	// Standard tier (8GB+ RAM) - efficient model that works everywhere
	{
		id: 'llama3.2:3b',
		name: 'Llama 3.2 3B',
		description: 'Fast and efficient for most tasks',
		size: '~2GB',
		tier: 'standard'
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
 * Simplified: high tier uses qwen3:32b, standard uses llama3.2:3b
 * All complexity levels use the same model per tier (simplicity)
 */
export const DEFAULT_OLLAMA_MODELS: Record<HardwareTier, Record<TaskComplexity, string>> = {
	high: {
		trivial: 'qwen3:32b',
		standard: 'qwen3:32b',
		complex: 'qwen3:32b'
	},
	standard: {
		trivial: 'llama3.2:3b',
		standard: 'llama3.2:3b',
		complex: 'llama3.2:3b'
	}
};
