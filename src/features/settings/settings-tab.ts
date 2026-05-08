/**
 * InterBrain Settings Tab
 *
 * Plugin-local UI/UX preferences only. Anything plumbing — API keys,
 * identity, transport, gh CLI auth, system installs — lives in the
 * InterBrain companion app (system tray).
 */

import { App, PluginSettingTab } from 'obsidian';
import type InterBrainPlugin from '../../main';
import { CONSTELLATION_DEFAULTS } from '../constellation-layout/constants';

import { createTranscriptionSettingsSection } from '../realtime-transcription/settings-section';
import { createConstellationSettingsSection } from '../constellation-layout/settings-section';

export interface InterBrainSettings {
	// AI provider keys + defaults — daemon owns the source of truth, but
	// the plugin caches them in-memory via desktop-bridge settings-sync so
	// the existing 50+ synchronous consumers don't need to be rewritten.
	claudeApiKey: string;
	openaiApiKey: string;
	groqApiKey: string;
	xaiApiKey: string;
	defaultAIProvider: string;
	offlineMode: boolean;

	// Daemon-cached transcription config (model + language). Plugin reads,
	// daemon writes.
	transcriptionModel: string;
	transcriptionLanguage: string;
	transcriptionEnabled: boolean;
	transcriptionSetupComplete: boolean;

	// Plugin-local UX preference (the only one exposed in the settings tab):
	transcriptionSearchBufferSize: number;

	// Constellation rendering UX:
	constellationMaxNodes: number;
	constellationPrioritizeClusters: boolean;

	// Web link analyzer state — feature is dormant unless both flags are
	// set; daemon-owned in spirit but still read here by service-manager.
	webLinkAnalyzerEnabled: boolean;
	webLinkAnalyzerSetupComplete: boolean;

	// Radicle passphrase — feature still has internal callers; daemon will
	// eventually own this. Kept in the cache for now.
	radiclePassphrase: string;

	// Vault-scoped state the plugin owns:
	hasLaunchedBefore: boolean;
	userEmail: string;
}

export const DEFAULT_SETTINGS: InterBrainSettings = {
	claudeApiKey: '',
	openaiApiKey: '',
	groqApiKey: '',
	xaiApiKey: '',
	defaultAIProvider: 'claude',
	offlineMode: false,
	transcriptionModel: 'small',
	transcriptionLanguage: 'auto',
	transcriptionEnabled: true,
	transcriptionSetupComplete: false,
	transcriptionSearchBufferSize: 500,
	constellationMaxNodes: CONSTELLATION_DEFAULTS.MAX_NODES,
	constellationPrioritizeClusters: CONSTELLATION_DEFAULTS.PRIORITIZE_CLUSTERS,
	webLinkAnalyzerEnabled: false,
	webLinkAnalyzerSetupComplete: false,
	radiclePassphrase: '',
	hasLaunchedBefore: false,
	userEmail: '',
};

export class InterBrainSettingTab extends PluginSettingTab {
	plugin: InterBrainPlugin;

	constructor(app: App, plugin: InterBrainPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('interbrain-settings');

		createConstellationSettingsSection(containerEl, this.plugin);
		createTranscriptionSettingsSection(containerEl, this.plugin);
	}
}
