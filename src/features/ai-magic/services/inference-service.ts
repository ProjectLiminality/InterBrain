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
	HardwareTier,
	ProviderKey
} from '../types';
import { ClaudeProvider, createClaudeProvider } from './claude-provider';
import { OllamaInferenceProvider, createOllamaInferenceProvider } from './ollama-inference';
import {
	OpenAICompatibleProvider,
	createOpenAIProvider,
	createGroqProvider,
	createXAIProvider
} from './openai-compatible-provider';

/**
 * Strip <think>...</think> tags from any AI response
 * Safety net in case provider-level stripping fails or is bypassed
 */
function stripThinkingTags(content: string): string {
	// Remove <think>...</think> blocks (including newlines within)
	let result = content.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();

	// Also handle unclosed <think> tags (model cut off mid-thought)
	if (result.includes('<think>')) {
		result = result.replace(/<think>[\s\S]*/g, '').trim();
	}

	return result;
}

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
	private openaiProvider: OpenAICompatibleProvider | null = null;
	private groqProvider: OpenAICompatibleProvider | null = null;
	private xaiProvider: OpenAICompatibleProvider | null = null;
	private config: AIMagicConfig;

	constructor(config?: Partial<AIMagicConfig>) {
		this.config = {
			defaultProvider: config?.defaultProvider,
			preferLocal: config?.preferLocal ?? false, // Remote-first for private beta (higher quality, less error-prone)
			offlineMode: config?.offlineMode ?? false,
			claude: config?.claude,
			ollama: config?.ollama,
			openai: config?.openai,
			groq: config?.groq,
			xai: config?.xai
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
		// Hardware tier will auto-detect if not specified
		this.ollamaProvider = createOllamaInferenceProvider({
			baseUrl: this.config.ollama?.baseUrl,
			hardwareTier: this.config.ollama?.hardwareTier,
			models: this.config.ollama?.models
		});

		// Initialize OpenAI-compatible providers if API keys provided
		if (this.config.openai?.apiKey) {
			this.openaiProvider = createOpenAIProvider(this.config.openai.apiKey);
		}

		if (this.config.groq?.apiKey) {
			this.groqProvider = createGroqProvider(this.config.groq.apiKey);
		}

		if (this.config.xai?.apiKey) {
			this.xaiProvider = createXAIProvider(this.config.xai.apiKey);
		}
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
		if (config.openai) {
			if (config.openai.apiKey) {
				if (this.openaiProvider) {
					this.openaiProvider.setApiKey(config.openai.apiKey);
				} else {
					this.openaiProvider = createOpenAIProvider(config.openai.apiKey);
				}
			}
			this.config.openai = { ...this.config.openai, ...config.openai };
		}
		if (config.groq) {
			if (config.groq.apiKey) {
				if (this.groqProvider) {
					this.groqProvider.setApiKey(config.groq.apiKey);
				} else {
					this.groqProvider = createGroqProvider(config.groq.apiKey);
				}
			}
			this.config.groq = { ...this.config.groq, ...config.groq };
		}
		if (config.xai) {
			if (config.xai.apiKey) {
				if (this.xaiProvider) {
					this.xaiProvider.setApiKey(config.xai.apiKey);
				} else {
					this.xaiProvider = createXAIProvider(config.xai.apiKey);
				}
			}
			this.config.xai = { ...this.config.xai, ...config.xai };
		}
	}

	/**
	 * Set Claude API key
	 */
	setClaudeApiKey(apiKey: string): void {
		this.updateConfig({ claude: { apiKey } });
	}

	/**
	 * Set OpenAI API key
	 */
	setOpenAIApiKey(apiKey: string): void {
		this.updateConfig({ openai: { apiKey } });
	}

	/**
	 * Set Groq API key
	 */
	setGroqApiKey(apiKey: string): void {
		this.updateConfig({ groq: { apiKey } });
	}

	/**
	 * Set xAI API key
	 */
	setXAIApiKey(apiKey: string): void {
		this.updateConfig({ xai: { apiKey } });
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
			const forceKey = options.forceProvider.toLowerCase();
			// Match by provider name or key aliases (e.g., 'xai' matches 'xAI Grok')
			const forced = providers.find(p => {
				const providerName = p.provider.name.toLowerCase();
				return providerName === forceKey ||
					providerName.startsWith(forceKey) ||
					(forceKey === 'xai' && providerName.includes('grok')) ||
					(forceKey === 'grok' && providerName.includes('grok'));
			});
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
				console.log(`[AI Magic] Using provider: ${provider.name}`);
				const response = await provider.generateCompletion(messages, {
					...options,
					model: options?.model || model
				});

				// Safety net: strip thinking tags from any response
				// Some models include <think>...</think> blocks
				const cleanedContent = stripThinkingTags(response.content);

				// Notify user if fallback was used
				if (i > 0 && originalProvider) {
					new Notice(`AI: ${originalProvider} unavailable, used ${provider.name} instead`);
				}

				return {
					...response,
					content: cleanedContent,
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
		_preferLocal: boolean, // Legacy parameter, kept for API compatibility
		complexity: TaskComplexity
	): Promise<Array<{ provider: AIProvider; model: string }>> {
		const providers: Array<{ provider: AIProvider; model: string }> = [];

		// Check availability of all providers in parallel
		const availability: Record<ProviderKey, boolean> = {
			ollama: await this.ollamaProvider?.isAvailable() ?? false,
			claude: await this.claudeProvider?.isAvailable() ?? false,
			openai: await this.openaiProvider?.isAvailable() ?? false,
			groq: await this.groqProvider?.isAvailable() ?? false,
			xai: await this.xaiProvider?.isAvailable() ?? false
		};

		// Offline mode: only local
		if (this.config.offlineMode) {
			if (availability.ollama && this.ollamaProvider) {
				providers.push({
					provider: this.ollamaProvider,
					model: this.ollamaProvider.getModelForComplexity(complexity)
				});
			}
			return providers;
		}

		// Helper to add a provider if available
		const addProvider = (key: ProviderKey) => {
			const providerMap: Record<ProviderKey, AIProvider | null> = {
				claude: this.claudeProvider,
				ollama: this.ollamaProvider,
				openai: this.openaiProvider,
				groq: this.groqProvider,
				xai: this.xaiProvider
			};
			const provider = providerMap[key];
			if (availability[key] && provider) {
				providers.push({
					provider,
					model: provider.getModelForComplexity(complexity)
				});
			}
		};

		// Default fallback order (when default provider fails or isn't set)
		const fallbackOrder: ProviderKey[] = ['claude', 'groq', 'openai', 'xai', 'ollama'];

		// Add default provider first if set and available
		const defaultProvider = this.config.defaultProvider;
		if (defaultProvider && availability[defaultProvider]) {
			addProvider(defaultProvider);
		}

		// Add remaining providers in fallback order
		for (const key of fallbackOrder) {
			if (key !== defaultProvider) {
				addProvider(key);
			}
		}

		return providers;
	}

	/**
	 * Set the default provider
	 */
	setDefaultProvider(provider: ProviderKey): void {
		this.config.defaultProvider = provider;
	}

	/**
	 * Get status of all providers
	 */
	async getProvidersStatus(): Promise<ProviderStatus[]> {
		const statuses: ProviderStatus[] = [];

		// Claude
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

		// Ollama (local)
		if (this.ollamaProvider) {
			statuses.push(await this.ollamaProvider.getStatus());
		}

		// OpenAI
		if (this.openaiProvider) {
			statuses.push(await this.openaiProvider.getStatus());
		} else {
			statuses.push({
				name: 'OpenAI',
				type: 'remote',
				status: 'not_configured',
				message: 'API key not configured',
				details: 'Add your OpenAI API key to enable GPT models'
			});
		}

		// Groq
		if (this.groqProvider) {
			statuses.push(await this.groqProvider.getStatus());
		} else {
			statuses.push({
				name: 'Groq',
				type: 'remote',
				status: 'not_configured',
				message: 'API key not configured',
				details: 'Add your Groq API key for blazing fast inference'
			});
		}

		// xAI Grok
		if (this.xaiProvider) {
			statuses.push(await this.xaiProvider.getStatus());
		} else {
			statuses.push({
				name: 'xAI Grok',
				type: 'remote',
				status: 'not_configured',
				message: 'API key not configured',
				details: 'Add your xAI API key to enable Grok'
			});
		}

		return statuses;
	}

	/**
	 * Check if any provider is available
	 */
	async isAnyProviderAvailable(): Promise<boolean> {
		const [ollamaAvailable, claudeAvailable, openaiAvailable, groqAvailable, xaiAvailable] = await Promise.all([
			this.ollamaProvider?.isAvailable() ?? false,
			this.claudeProvider?.isAvailable() ?? false,
			this.openaiProvider?.isAvailable() ?? false,
			this.groqProvider?.isAvailable() ?? false,
			this.xaiProvider?.isAvailable() ?? false
		]);

		if (this.config.offlineMode) {
			return ollamaAvailable;
		}

		return ollamaAvailable || claudeAvailable || openaiAvailable || groqAvailable || xaiAvailable;
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
		if (normalized === 'openai' && this.openaiProvider) {
			return this.openaiProvider;
		}
		if (normalized === 'groq' && this.groqProvider) {
			return this.groqProvider;
		}
		if ((normalized === 'xai' || normalized === 'grok') && this.xaiProvider) {
			return this.xaiProvider;
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
