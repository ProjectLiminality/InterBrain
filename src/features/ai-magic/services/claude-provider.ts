/**
 * Claude Provider
 *
 * Anthropic Claude API integration for AI Magic.
 * Extracted and enhanced from conversational-copilot/llm-provider.ts
 */

import { requestUrl } from 'obsidian';
import {
	AIProvider,
	AIMessage,
	AIResponse,
	CompletionOptions,
	StreamChunkCallback,
	StreamingCompletionOptions,
	StreamCompletionMeta,
	ProviderStatus,
	TaskComplexity,
	ClaudeConfig,
	CLAUDE_MODELS
} from '../types';

/**
 * Claude API Provider (Anthropic)
 */
export class ClaudeProvider implements AIProvider {
	readonly name = 'Claude';
	readonly type = 'remote' as const;

	private apiKey: string;
	private models: Record<TaskComplexity, string>;
	private apiEndpoint = 'https://api.anthropic.com/v1/messages';

	constructor(config: ClaudeConfig) {
		this.apiKey = config.apiKey;
		this.models = {
			trivial: config.models?.trivial || CLAUDE_MODELS.trivial,
			standard: config.models?.standard || CLAUDE_MODELS.standard,
			complex: config.models?.complex || CLAUDE_MODELS.complex
		};
	}

	/**
	 * Update API key
	 */
	setApiKey(apiKey: string): void {
		this.apiKey = apiKey;
	}

	/**
	 * Check if provider is available
	 */
	async isAvailable(): Promise<boolean> {
		return Boolean(this.apiKey && this.apiKey.startsWith('sk-ant-'));
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
				details: 'Add your Anthropic API key to enable Claude'
			};
		}

		if (!this.apiKey.startsWith('sk-ant-')) {
			return {
				name: this.name,
				type: this.type,
				status: 'error',
				message: 'Invalid API key format',
				details: 'Anthropic API keys should start with sk-ant-'
			};
		}

		return {
			name: this.name,
			type: this.type,
			status: 'ready',
			message: 'Ready',
			models: Object.values(this.models)
		};
	}

	/**
	 * Get available models
	 */
	async getAvailableModels(): Promise<string[]> {
		return Object.values(this.models);
	}

	/**
	 * Get model for complexity tier
	 */
	getModelForComplexity(complexity: TaskComplexity): string {
		return this.models[complexity];
	}

	/**
	 * Generate completion
	 */
	async generateCompletion(
		messages: AIMessage[],
		options?: CompletionOptions
	): Promise<AIResponse> {
		if (!this.apiKey) {
			throw new Error('Claude API key not configured');
		}

		const model = options?.model || this.models.trivial;
		const maxTokens = options?.maxTokens || 4096;
		const temperature = options?.temperature ?? 1.0;

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
			// Use Obsidian's requestUrl to avoid CORS issues
			const response = await requestUrl({
				url: this.apiEndpoint,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': this.apiKey,
					'anthropic-version': '2023-06-01'
				},
				body: JSON.stringify(requestBody),
				throw: false
			});

			if (response.status !== 200) {
				const errorData = response.json || {};
				throw new Error(`Claude API error: ${response.status} - ${JSON.stringify(errorData)}`);
			}

			const data = response.json;

			return {
				content: data.content[0].text,
				provider: this.name,
				model,
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
	/**
	 * Generate streaming completion using Anthropic SSE
	 * Uses Node.js https module to bypass CORS (Obsidian runs in Electron)
	 */
	async generateStreamingCompletion(
		messages: AIMessage[],
		onChunk: StreamChunkCallback,
		options?: StreamingCompletionOptions
	): Promise<StreamCompletionMeta> {
		if (!this.apiKey) {
			throw new Error('Claude API key not configured');
		}

		const model = options?.model || this.models.trivial;
		const maxTokens = options?.maxTokens || 4096;
		const temperature = options?.temperature ?? 1.0;

		const systemMessage = messages.find(m => m.role === 'system');
		const conversationMessages = messages.filter(m => m.role !== 'system');

		const requestBody = {
			model,
			max_tokens: maxTokens,
			temperature,
			stream: true,
			messages: conversationMessages.map(m => ({
				role: m.role,
				content: m.content
			})),
			...(systemMessage && { system: systemMessage.content })
		};

		const bodyStr = JSON.stringify(requestBody);

		// Use Node.js https to bypass CORS (globalThis.fetch is blocked
		// by browser CORS policy for api.anthropic.com from app://obsidian.md)
		const https = require('https') as typeof import('https');
		const url = new URL(this.apiEndpoint);

		return new Promise<StreamCompletionMeta>((resolve, reject) => {
			let aborted = false;

			const req = https.request({
				hostname: url.hostname,
				port: 443,
				path: url.pathname,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': this.apiKey,
					'anthropic-version': '2023-06-01',
					'Content-Length': Buffer.byteLength(bodyStr)
				}
			}, (res) => {
				if (res.statusCode !== 200) {
					let errorBody = '';
					res.on('data', (chunk: Buffer) => { errorBody += chunk.toString(); });
					res.on('end', () => {
						reject(new Error(`Claude API error: ${res.statusCode} - ${errorBody}`));
					});
					return;
				}

				let buffer = '';
				let inputTokens = 0;
				let outputTokens = 0;

				res.setEncoding('utf8');
				res.on('data', (chunk: string) => {
					if (aborted) return;

					buffer += chunk;
					const lines = buffer.split('\n');
					buffer = lines.pop() || '';

					for (const line of lines) {
						if (!line.startsWith('data: ')) continue;
						const json = line.slice(6).trim();
						if (!json) continue;

						try {
							const event = JSON.parse(json);

							if (event.type === 'message_start' && event.message?.usage) {
								inputTokens = event.message.usage.input_tokens || 0;
							} else if (event.type === 'content_block_delta' && event.delta?.text) {
								onChunk(event.delta.text);
							} else if (event.type === 'message_delta' && event.usage) {
								outputTokens = event.usage.output_tokens || 0;
							}
						} catch {
							// Skip malformed JSON lines
						}
					}
				});

				res.on('end', () => {
					if (!aborted) {
						resolve({
							provider: this.name,
							model,
							usage: { inputTokens, outputTokens }
						});
					}
				});

				res.on('error', (err: Error) => {
					if (!aborted) reject(err);
				});
			});

			req.on('error', (err: Error) => {
				if (!aborted) reject(err);
			});

			// Handle abort signal
			if (options?.signal) {
				if (options.signal.aborted) {
					req.destroy();
					reject(new DOMException('Stream aborted', 'AbortError'));
					return;
				}
				options.signal.addEventListener('abort', () => {
					aborted = true;
					req.destroy();
					reject(new DOMException('Stream aborted', 'AbortError'));
				}, { once: true });
			}

			req.write(bodyStr);
			req.end();
		});
	}
}

/**
 * Create Claude provider instance
 */
export function createClaudeProvider(config: ClaudeConfig): ClaudeProvider {
	return new ClaudeProvider(config);
}
