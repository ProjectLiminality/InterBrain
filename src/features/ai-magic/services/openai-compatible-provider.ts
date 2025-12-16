/**
 * OpenAI-Compatible Provider
 *
 * Base implementation for providers that follow the OpenAI API format.
 * This unlocks: OpenAI, Groq, xAI Grok, and many others with minimal config.
 *
 * The OpenAI chat completions format has become the de facto standard.
 */

import { requestUrl } from 'obsidian';
import {
	AIProvider,
	AIMessage,
	AIResponse,
	CompletionOptions,
	ProviderStatus,
	TaskComplexity
} from '../types';

/**
 * OpenAI API response format
 */
interface OpenAIChatResponse {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: Array<{
		index: number;
		message: {
			role: string;
			content: string;
		};
		finish_reason: string;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

/**
 * Configuration for an OpenAI-compatible provider
 */
export interface OpenAICompatibleConfig {
	/** Display name for this provider */
	name: string;
	/** API base URL (without /v1/chat/completions) */
	baseUrl: string;
	/** API key */
	apiKey: string;
	/** Models for each complexity tier */
	models: {
		trivial: string;
		standard: string;
		complex: string;
	};
	/** Header name for API key (default: 'Authorization' with 'Bearer ' prefix) */
	authHeader?: 'Authorization' | 'x-api-key';
	/** Whether to use 'Bearer ' prefix (default: true) */
	useBearerPrefix?: boolean;
}

/**
 * Default model configurations for supported providers
 */
export const PROVIDER_DEFAULTS: Record<string, Omit<OpenAICompatibleConfig, 'apiKey'>> = {
	openai: {
		name: 'OpenAI',
		baseUrl: 'https://api.openai.com',
		models: {
			trivial: 'gpt-4o-mini',
			standard: 'gpt-4o',
			complex: 'gpt-4o'
		}
	},
	groq: {
		name: 'Groq',
		baseUrl: 'https://api.groq.com/openai',
		models: {
			trivial: 'llama-3.1-8b-instant',
			standard: 'llama-3.1-70b-versatile',
			complex: 'llama-3.1-70b-versatile'
		}
	},
	xai: {
		name: 'xAI Grok',
		baseUrl: 'https://api.x.ai/v1',
		models: {
			trivial: 'grok-3-mini-fast',
			standard: 'grok-3-mini',
			complex: 'grok-4'
		}
	}
};

/**
 * OpenAI-Compatible Provider Implementation
 *
 * Works with any provider that implements the OpenAI chat completions API.
 */
export class OpenAICompatibleProvider implements AIProvider {
	readonly name: string;
	readonly type = 'remote' as const;

	private baseUrl: string;
	private apiKey: string;
	private models: Record<TaskComplexity, string>;
	private authHeader: 'Authorization' | 'x-api-key';
	private useBearerPrefix: boolean;

	private lastHealthCheck: { available: boolean; timestamp: number } | null = null;
	private readonly healthCacheMs = 30000;

	constructor(config: OpenAICompatibleConfig) {
		this.name = config.name;
		this.baseUrl = config.baseUrl.replace(/\/$/, '');
		this.apiKey = config.apiKey;
		this.models = config.models;
		this.authHeader = config.authHeader || 'Authorization';
		this.useBearerPrefix = config.useBearerPrefix !== false;
	}

	/**
	 * Update API key
	 */
	setApiKey(apiKey: string): void {
		this.apiKey = apiKey;
		this.lastHealthCheck = null;
	}

	/**
	 * Check if provider is available
	 */
	async isAvailable(): Promise<boolean> {
		if (!this.apiKey) {
			return false;
		}

		// Return cached result if still valid
		if (this.lastHealthCheck &&
			Date.now() - this.lastHealthCheck.timestamp < this.healthCacheMs) {
			return this.lastHealthCheck.available;
		}

		// For OpenAI-compatible APIs, we do a lightweight models list call
		// or just assume available if we have an API key
		// (actual availability is checked on first real call)
		const available = !!this.apiKey;
		this.lastHealthCheck = { available, timestamp: Date.now() };
		return available;
	}

	/**
	 * Get detailed status
	 */
	async getStatus(): Promise<ProviderStatus> {
		if (!this.apiKey) {
			return {
				name: this.name,
				type: this.type,
				status: 'not_configured',
				message: 'API key not configured',
				details: `Add your ${this.name} API key to enable`
			};
		}

		return {
			name: this.name,
			type: this.type,
			status: 'ready',
			message: 'Ready',
			details: `Using ${this.models.standard} for standard tasks`
		};
	}

	/**
	 * Get available models (returns configured models)
	 */
	async getAvailableModels(): Promise<string[]> {
		return [...new Set(Object.values(this.models))];
	}

	/**
	 * Get model for complexity tier
	 */
	getModelForComplexity(complexity: TaskComplexity): string {
		return this.models[complexity];
	}

	/**
	 * Generate completion using OpenAI chat completions API
	 */
	async generateCompletion(
		messages: AIMessage[],
		options?: CompletionOptions
	): Promise<AIResponse> {
		if (!this.apiKey) {
			throw new Error(`${this.name} API key not configured`);
		}

		const model = options?.model || this.models.trivial;

		// Build request body in OpenAI format
		const requestBody = {
			model,
			messages: messages.map(m => ({
				role: m.role,
				content: m.content
			})),
			...(options?.maxTokens && { max_tokens: options.maxTokens }),
			...(options?.temperature !== undefined && { temperature: options.temperature })
		};

		// Build auth header
		const authValue = this.useBearerPrefix
			? `Bearer ${this.apiKey}`
			: this.apiKey;

		try {
			// Build URL - baseUrl may or may not include /v1
			const url = this.baseUrl.endsWith('/v1')
				? `${this.baseUrl}/chat/completions`
				: `${this.baseUrl}/v1/chat/completions`;

			const response = await requestUrl({
				url,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					[this.authHeader]: authValue
				},
				body: JSON.stringify(requestBody),
				throw: false
			});

			if (response.status !== 200) {
				const errorData = response.json || {};
				throw new Error(`${this.name} API error: ${response.status} - ${JSON.stringify(errorData)}`);
			}

			const data: OpenAIChatResponse = response.json;

			if (!data.choices || data.choices.length === 0) {
				throw new Error(`${this.name} returned empty response`);
			}

			return {
				content: data.choices[0].message.content,
				provider: this.name,
				model: data.model || model,
				usage: data.usage ? {
					inputTokens: data.usage.prompt_tokens,
					outputTokens: data.usage.completion_tokens
				} : undefined
			};
		} catch (error) {
			console.error(`${this.name} API request failed:`, error);
			throw error;
		}
	}
}

/**
 * Factory functions for specific providers
 */

export function createOpenAIProvider(apiKey: string): OpenAICompatibleProvider {
	return new OpenAICompatibleProvider({
		...PROVIDER_DEFAULTS.openai,
		apiKey
	});
}

export function createGroqProvider(apiKey: string): OpenAICompatibleProvider {
	return new OpenAICompatibleProvider({
		...PROVIDER_DEFAULTS.groq,
		apiKey
	});
}

export function createXAIProvider(apiKey: string): OpenAICompatibleProvider {
	return new OpenAICompatibleProvider({
		...PROVIDER_DEFAULTS.xai,
		apiKey
	});
}
