/**
 * AI Magic Feature Slice
 *
 * Unified AI provider management for InterBrain.
 * Handles local (Ollama) and remote (Claude, OpenRouter) inference.
 */

// Types
export * from './types';

// Store
export * from './store/slice';

// Services
export {
	InferenceService,
	initializeInferenceService,
	getInferenceService,
	generateAI,
	type InferenceOptions,
	type InferenceResult
} from './services/inference-service';

export {
	ClaudeProvider,
	createClaudeProvider
} from './services/claude-provider';

export {
	OllamaInferenceProvider,
	createOllamaInferenceProvider,
	getSystemRAMInfo
} from './services/ollama-inference';

// Settings
export {
	createAIMagicSettingsSection,
	checkAIMagicStatus
} from './settings-section';

// Commands
export { registerAIMagicCommands } from './commands';
