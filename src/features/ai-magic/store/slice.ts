/**
 * AI Magic Store Slice
 *
 * Zustand slice for AI provider state management.
 */

import type { StateCreator } from 'zustand';
import type { HardwareTier, ProviderStatus, AIMagicConfig } from '../types';

/**
 * AI Magic slice state
 */
export interface AIMagicSlice {
	// Configuration
	aiMagicConfig: AIMagicConfig;

	// Runtime state
	providerStatuses: ProviderStatus[];
	isCheckingProviders: boolean;
	lastStatusCheck: number | null;

	// Actions
	setAIMagicConfig: (config: Partial<AIMagicConfig>) => void;
	setClaudeApiKey: (apiKey: string) => void;
	setHardwareTier: (tier: HardwareTier) => void;
	setPreferLocal: (prefer: boolean) => void;
	setOfflineMode: (offline: boolean) => void;
	setProviderStatuses: (statuses: ProviderStatus[]) => void;
	setIsCheckingProviders: (checking: boolean) => void;
}

/**
 * Default AI Magic configuration
 */
export const DEFAULT_AI_MAGIC_CONFIG: AIMagicConfig = {
	preferLocal: true,
	offlineMode: false,
	claude: undefined,
	ollama: {
		hardwareTier: 'medium'
	}
};

/**
 * Create AI Magic slice
 */
export const createAIMagicSlice: StateCreator<AIMagicSlice, [], [], AIMagicSlice> = (set) => ({
	// Initial state
	aiMagicConfig: DEFAULT_AI_MAGIC_CONFIG,
	providerStatuses: [],
	isCheckingProviders: false,
	lastStatusCheck: null,

	// Actions
	setAIMagicConfig: (config) =>
		set((state) => ({
			aiMagicConfig: { ...state.aiMagicConfig, ...config }
		})),

	setClaudeApiKey: (apiKey) =>
		set((state) => ({
			aiMagicConfig: {
				...state.aiMagicConfig,
				claude: { ...state.aiMagicConfig.claude, apiKey }
			}
		})),

	setHardwareTier: (tier) =>
		set((state) => ({
			aiMagicConfig: {
				...state.aiMagicConfig,
				ollama: { ...state.aiMagicConfig.ollama, hardwareTier: tier }
			}
		})),

	setPreferLocal: (prefer) =>
		set((state) => ({
			aiMagicConfig: { ...state.aiMagicConfig, preferLocal: prefer }
		})),

	setOfflineMode: (offline) =>
		set((state) => ({
			aiMagicConfig: { ...state.aiMagicConfig, offlineMode: offline }
		})),

	setProviderStatuses: (statuses) =>
		set({
			providerStatuses: statuses,
			lastStatusCheck: Date.now()
		}),

	setIsCheckingProviders: (checking) =>
		set({ isCheckingProviders: checking })
});
