/**
 * Inference Service
 *
 * Unified AI inference interface that routes requests to appropriate providers
 * based on task complexity, availability, and user preferences.
 */

import { Notice } from 'obsidian';
import {
	AIProvider,
	AIMessage,
	AIResponse,
	CompletionOptions,
	ProviderStatus,
	TaskComplexity,
	AIMagicConfig,
	HardwareTier
} from '../types';
import { ClaudeProvider, createClaudeProvider } from './claude-provider';
import { OllamaInferenceProvider, createOllamaInferenceProvider } from './ollama-inference';

/**
 * Extended inference options
 */
export interface InferenceOptions extends CompletionOptions {
	/** Override prefer local setting for this request */
	preferLocal?: boolean;
	/** Fail instead of falling back to another provider */
	noFallback?: boolean;
}

/**
 * Inference result with metadata
 */
export interface InferenceResult extends AIResponse {
	/** Whether fallback was used */
	usedFallback: boolean;
	/** Original provider that was tried first (if different from final) */
	originalProvider?: string;
}

/**
 * Inference Service
 *
 * Main entry point for AI inference in InterBrain.
 * Manages providers and routes requests intelligently.
 */
export class InferenceService {
	private claudeProvider: ClaudeProvider | null = null;
	private ollamaProvider: OllamaInferenceProvider | null = null;
	private config: AIMagicConfig;

	constructor(config?: Partial<AIMagicConfig>) {
		this.config = {
			preferLocal: config?.preferLocal ?? false, // Remote-first for private beta (higher quality, less error-prone)
			offlineMode: config?.offlineMode ?? false,
			claude: config?.claude,
			ollama: config?.ollama
		};

		this.initializeProviders();
	}

	/**
	 * Initialize providers based on configuration
	 */
	private initializeProviders(): void {
		// Initialize Claude if API key provided
		if (this.config.claude?.apiKey) {
			this.claudeProvider = createClaudeProvider(this.config.claude);
		}

		// Always initialize Ollama (it checks availability dynamically)
		this.ollamaProvider = createOllamaInferenceProvider({
			baseUrl: this.config.ollama?.baseUrl,
			hardwareTier: this.config.ollama?.hardwareTier || 'medium',
			models: this.config.ollama?.models
		});
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<AIMagicConfig>): void {
		if (config.preferLocal !== undefined) {
			this.config.preferLocal = config.preferLocal;
		}
		if (config.offlineMode !== undefined) {
			this.config.offlineMode = config.offlineMode;
		}
		if (config.claude) {
			if (config.claude.apiKey) {
				if (this.claudeProvider) {
					this.claudeProvider.setApiKey(config.claude.apiKey);
				} else {
					this.claudeProvider = createClaudeProvider(config.claude);
				}
			}
			this.config.claude = { ...this.config.claude, ...config.claude };
		}
		if (config.ollama) {
			this.ollamaProvider?.updateConfig(config.ollama);
			this.config.ollama = { ...this.config.ollama, ...config.ollama };
		}
	}

	/**
	 * Set Claude API key
	 */
	setClaudeApiKey(apiKey: string): void {
		this.updateConfig({ claude: { apiKey } });
	}

	/**
	 * Set Ollama hardware tier
	 */
	setHardwareTier(tier: HardwareTier): void {
		this.ollamaProvider?.setHardwareTier(tier);
		if (this.config.ollama) {
			this.config.ollama.hardwareTier = tier;
		} else {
			this.config.ollama = { hardwareTier: tier };
		}
	}

	/**
	 * Main inference method
	 *
	 * Routes to appropriate provider based on:
	 * 1. User preferences (preferLocal, offlineMode)
	 * 2. Provider availability
	 * 3. Task complexity
	 */
	async generate(
		messages: AIMessage[],
		complexity: TaskComplexity = 'trivial',
		options?: InferenceOptions
	): Promise<InferenceResult> {
		const preferLocal = options?.preferLocal ?? this.config.preferLocal;
		const noFallback = options?.noFallback ?? false;

		// Determine provider order
		const providers = await this.getProviderOrder(preferLocal, complexity);

		if (providers.length === 0) {
			throw new Error('No AI providers available. Configure Claude API key or start Ollama.');
		}

		// Force specific provider if requested
		if (options?.forceProvider) {
			const forced = providers.find(p => p.provider.name.toLowerCase() === options.forceProvider?.toLowerCase());
			if (forced) {
				const response = await forced.provider.generateCompletion(messages, {
					...options,
					model: options.model || forced.model
				});
				return { ...response, usedFallback: false };
			}
			throw new Error(`Provider '${options.forceProvider}' not available`);
		}

		// Try providers in order
		let lastError: Error | null = null;
		let originalProvider: string | undefined;

		for (let i = 0; i < providers.length; i++) {
			const { provider, model } = providers[i];

			if (i === 0) {
				originalProvider = provider.name;
			}

			try {
				const response = await provider.generateCompletion(messages, {
					...options,
					model: options?.model || model
				});

				// Notify user if fallback was used
				if (i > 0 && originalProvider) {
					new Notice(`AI: ${originalProvider} unavailable, used ${provider.name} instead`);
				}

				return {
					...response,
					usedFallback: i > 0,
					originalProvider: i > 0 ? originalProvider : undefined
				};
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				console.warn(`Provider ${provider.name} failed:`, lastError.message);

				if (noFallback) {
					throw lastError;
				}
			}
		}

		throw lastError || new Error('All providers failed');
	}

	/**
	 * Get providers in order of preference
	 */
	private async getProviderOrder(
		preferLocal: boolean,
		complexity: TaskComplexity
	): Promise<Array<{ provider: AIProvider; model: string }>> {
		const providers: Array<{ provider: AIProvider; model: string }> = [];

		const ollamaAvailable = await this.ollamaProvider?.isAvailable();
		const claudeAvailable = await this.claudeProvider?.isAvailable();

		// Offline mode: only local
		if (this.config.offlineMode) {
			if (ollamaAvailable && this.ollamaProvider) {
				providers.push({
					provider: this.ollamaProvider,
					model: this.ollamaProvider.getModelForComplexity(complexity)
				});
			}
			return providers;
		}

		// Build ordered list
		if (preferLocal) {
			// Local first, remote fallback
			if (ollamaAvailable && this.ollamaProvider) {
				providers.push({
					provider: this.ollamaProvider,
					model: this.ollamaProvider.getModelForComplexity(complexity)
				});
			}
			if (claudeAvailable && this.claudeProvider) {
				providers.push({
					provider: this.claudeProvider,
					model: this.claudeProvider.getModelForComplexity(complexity)
				});
			}
		} else {
			// Remote first, local fallback
			if (claudeAvailable && this.claudeProvider) {
				providers.push({
					provider: this.claudeProvider,
					model: this.claudeProvider.getModelForComplexity(complexity)
				});
			}
			if (ollamaAvailable && this.ollamaProvider) {
				providers.push({
					provider: this.ollamaProvider,
					model: this.ollamaProvider.getModelForComplexity(complexity)
				});
			}
		}

		return providers;
	}

	/**
	 * Get status of all providers
	 */
	async getProvidersStatus(): Promise<ProviderStatus[]> {
		const statuses: ProviderStatus[] = [];

		if (this.claudeProvider) {
			statuses.push(await this.claudeProvider.getStatus());
		} else {
			statuses.push({
				name: 'Claude',
				type: 'remote',
				status: 'not_configured',
				message: 'API key not configured',
				details: 'Add your Anthropic API key to enable Claude'
			});
		}

		if (this.ollamaProvider) {
			statuses.push(await this.ollamaProvider.getStatus());
		}

		return statuses;
	}

	/**
	 * Check if any provider is available
	 */
	async isAnyProviderAvailable(): Promise<boolean> {
		const [ollamaAvailable, claudeAvailable] = await Promise.all([
			this.ollamaProvider?.isAvailable() ?? false,
			this.claudeProvider?.isAvailable() ?? false
		]);

		if (this.config.offlineMode) {
			return ollamaAvailable;
		}

		return ollamaAvailable || claudeAvailable;
	}

	/**
	 * Get provider by name
	 */
	getProvider(name: string): AIProvider | undefined {
		const normalized = name.toLowerCase();
		if (normalized === 'claude' && this.claudeProvider) {
			return this.claudeProvider;
		}
		if (normalized === 'ollama' && this.ollamaProvider) {
			return this.ollamaProvider;
		}
		return undefined;
	}

	/**
	 * Get Ollama provider for direct access (e.g., model pulling)
	 */
	getOllamaProvider(): OllamaInferenceProvider | null {
		return this.ollamaProvider;
	}

	/**
	 * Get Claude provider for direct access
	 */
	getClaudeProvider(): ClaudeProvider | null {
		return this.claudeProvider;
	}

	/**
	 * Get current configuration
	 */
	getConfig(): AIMagicConfig {
		return { ...this.config };
	}
}

// Singleton instance
let inferenceService: InferenceService | null = null;

/**
 * Initialize the inference service
 */
export function initializeInferenceService(config?: Partial<AIMagicConfig>): InferenceService {
	if (!inferenceService) {
		inferenceService = new InferenceService(config);
	} else if (config) {
		inferenceService.updateConfig(config);
	}
	return inferenceService;
}

/**
 * Get the inference service instance
 */
export function getInferenceService(): InferenceService {
	if (!inferenceService) {
		inferenceService = new InferenceService();
	}
	return inferenceService;
}

/**
 * Convenience function for simple inference calls
 */
export async function generateAI(
	messages: AIMessage[],
	complexity: TaskComplexity = 'trivial',
	options?: InferenceOptions
): Promise<AIResponse> {
	return getInferenceService().generate(messages, complexity, options);
}
