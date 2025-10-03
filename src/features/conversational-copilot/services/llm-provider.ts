/**
 * LLM Provider Abstraction Layer
 *
 * Future-proof architecture for swappable AI providers.
 * Currently supports Claude API, designed for easy OpenRouter/open-source model integration.
 */

export interface LLMMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
}

export interface LLMResponse {
	content: string;
	usage?: {
		inputTokens: number;
		outputTokens: number;
	};
}

export interface LLMProviderConfig {
	apiKey: string;
	model?: string;
	maxTokens?: number;
	temperature?: number;
}

/**
 * Base interface for LLM providers
 */
export interface LLMProvider {
	name: string;
	generateCompletion(messages: LLMMessage[], config?: Partial<LLMProviderConfig>): Promise<LLMResponse>;
}

/**
 * Claude API Provider (Anthropic)
 */
export class ClaudeProvider implements LLMProvider {
	name = 'Claude';
	private apiKey: string;
	private defaultModel = 'claude-3-5-sonnet-20241022';
	private apiEndpoint = 'https://api.anthropic.com/v1/messages';

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	async generateCompletion(
		messages: LLMMessage[],
		config?: Partial<LLMProviderConfig>
	): Promise<LLMResponse> {
		if (!this.apiKey) {
			throw new Error('Claude API key not configured');
		}

		const model = config?.model || this.defaultModel;
		const maxTokens = config?.maxTokens || 4096;
		const temperature = config?.temperature || 1.0;

		// Extract system message if present
		const systemMessage = messages.find(m => m.role === 'system');
		const conversationMessages = messages.filter(m => m.role !== 'system');

		const requestBody = {
			model,
			max_tokens: maxTokens,
			temperature,
			messages: conversationMessages.map(m => ({
				role: m.role,
				content: m.content
			})),
			...(systemMessage && { system: systemMessage.content })
		};

		try {
			const response = await fetch(this.apiEndpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': this.apiKey,
					'anthropic-version': '2023-06-01'
				},
				body: JSON.stringify(requestBody)
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(`Claude API error: ${response.status} - ${JSON.stringify(errorData)}`);
			}

			const data = await response.json();

			return {
				content: data.content[0].text,
				usage: {
					inputTokens: data.usage.input_tokens,
					outputTokens: data.usage.output_tokens
				}
			};
		} catch (error) {
			console.error('Claude API request failed:', error);
			throw error;
		}
	}
}

/**
 * OpenRouter Provider (Future Implementation)
 *
 * Placeholder for OpenRouter integration
 */
export class OpenRouterProvider implements LLMProvider {
	name = 'OpenRouter';

	constructor(_apiKey: string) {
		// Future implementation
	}

	async generateCompletion(
		_messages: LLMMessage[],
		_config?: Partial<LLMProviderConfig>
	): Promise<LLMResponse> {
		throw new Error('OpenRouter provider not yet implemented');
	}
}

/**
 * Factory function to create appropriate provider
 */
export function createLLMProvider(
	providerType: 'claude' | 'openrouter',
	apiKey: string
): LLMProvider {
	switch (providerType) {
		case 'claude':
			return new ClaudeProvider(apiKey);
		case 'openrouter':
			return new OpenRouterProvider(apiKey);
		default:
			throw new Error(`Unknown provider type: ${providerType}`);
	}
}
