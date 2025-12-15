/**
 * AI Magic Settings Section
 *
 * Unified AI provider configuration UI.
 * Replaces the old "AI Integration" section with comprehensive provider management.
 */

import { Setting } from 'obsidian';
import type InterBrainPlugin from '../../main';
import type { FeatureStatus } from '../settings/settings-status-service';
import { SettingsStatusService } from '../settings/settings-status-service';
import {
	getInferenceService,
	initializeInferenceService
} from './services/inference-service';
import {
	HardwareTier,
	ProviderStatus,
	CURATED_OLLAMA_MODELS,
	CuratedModel
} from './types';

/**
 * Check overall AI Magic status
 */
export async function checkAIMagicStatus(claudeApiKey: string): Promise<FeatureStatus> {
	const service = getInferenceService();

	// Update Claude API key if provided
	if (claudeApiKey) {
		service.setClaudeApiKey(claudeApiKey);
	}

	const isAvailable = await service.isAnyProviderAvailable();
	const statuses = await service.getProvidersStatus();

	const readyProviders = statuses.filter(s => s.status === 'ready');
	const hasLocal = statuses.some(s => s.type === 'local' && s.status === 'ready');
	const hasRemote = statuses.some(s => s.type === 'remote' && s.status === 'ready');

	if (!isAvailable) {
		return {
			available: false,
			status: 'not-installed',
			message: 'No AI providers configured',
			details: 'Configure Claude API key or start Ollama for AI features'
		};
	}

	if (readyProviders.length === 2) {
		return {
			available: true,
			status: 'ready',
			message: 'All providers ready',
			details: 'Both local (Ollama) and remote (Claude) AI available'
		};
	}

	if (hasLocal && !hasRemote) {
		return {
			available: true,
			status: 'ready',
			message: 'Local AI ready',
			details: 'Ollama running. Add Claude API key for remote fallback.'
		};
	}

	if (hasRemote && !hasLocal) {
		return {
			available: true,
			status: 'warning',
			message: 'Remote AI only',
			details: 'Claude configured. Start Ollama for offline/private AI.'
		};
	}

	return {
		available: false,
		status: 'error',
		message: 'Configuration issue',
		details: 'Check provider settings below'
	};
}

/**
 * Create the AI Magic settings section
 */
export function createAIMagicSettingsSection(
	containerEl: HTMLElement,
	plugin: InterBrainPlugin,
	status: FeatureStatus | undefined,
	refreshDisplay?: () => Promise<void>
): void {
	const header = containerEl.createEl('h2', { text: '🤖 AI Magic' });
	header.id = 'ai-magic-section';

	// Overall status
	if (status) {
		createStatusDisplay(containerEl, status);
	}

	// Privacy note
	const privacyNote = containerEl.createDiv({ cls: 'interbrain-privacy-note' });
	privacyNote.style.padding = '12px';
	privacyNote.style.marginBottom = '16px';
	privacyNote.style.borderRadius = '4px';
	privacyNote.createEl('p', {
		text: '🔒 Local AI (Ollama) runs entirely on your machine. Your data never leaves your computer.',
		cls: 'setting-item-description'
	});

	// Provider Status Overview
	createProviderStatusSection(containerEl, plugin);

	// Remote Providers Section
	createRemoteProvidersSection(containerEl, plugin, refreshDisplay);

	// Local AI (Ollama) Section
	createLocalAISection(containerEl, plugin, refreshDisplay);

	// Preferences Section
	createPreferencesSection(containerEl, plugin);
}

/**
 * Create provider status overview
 */
async function createProviderStatusSection(
	containerEl: HTMLElement,
	_plugin: InterBrainPlugin
): Promise<void> {
	const section = containerEl.createDiv({ cls: 'interbrain-provider-status-section' });
	section.createEl('h4', { text: 'Provider Status' });

	const statusGrid = section.createDiv({ cls: 'interbrain-status-grid' });

	try {
		const service = getInferenceService();
		const statuses = await service.getProvidersStatus();

		for (const providerStatus of statuses) {
			createProviderStatusItem(statusGrid, providerStatus);
		}
	} catch (error) {
		statusGrid.createEl('p', {
			text: 'Error loading provider status',
			cls: 'interbrain-status-error'
		});
	}
}

/**
 * Create individual provider status item
 */
function createProviderStatusItem(container: HTMLElement, status: ProviderStatus): void {
	const item = container.createDiv({ cls: 'status-item' });

	const icon = status.status === 'ready' ? '✅' :
		status.status === 'unavailable' ? '🔴' :
			status.status === 'not_configured' ? '⚫' : '🟡';

	const typeLabel = status.type === 'local' ? '(Local)' : '(Remote)';

	item.createSpan({
		text: `${icon} ${status.name} ${typeLabel}`,
		cls: 'status-label'
	});

	item.createSpan({
		text: status.message,
		cls: 'status-message'
	});
}

/**
 * Create remote providers section
 */
function createRemoteProvidersSection(
	containerEl: HTMLElement,
	plugin: InterBrainPlugin,
	refreshDisplay?: () => Promise<void>
): void {
	containerEl.createEl('h4', { text: 'Remote Providers' });

	// Claude API Key
	new Setting(containerEl)
		.setName('Claude API Key')
		.setDesc('Your Anthropic API key for remote AI inference')
		.addText(text => {
			text
				.setPlaceholder('sk-ant-...')
				.setValue(plugin.settings.claudeApiKey)
				.onChange(async (value) => {
					plugin.settings.claudeApiKey = value;
					await plugin.saveSettings();

					// Update inference service
					const service = getInferenceService();
					service.setClaudeApiKey(value);
				});
			text.inputEl.type = 'password';
			return text;
		});

	// Link to get API key
	const linkPara = containerEl.createEl('p', { cls: 'setting-item-description' });
	linkPara.createSpan({ text: 'Get your API key: ' });
	linkPara.createEl('a', {
		text: 'console.anthropic.com/settings/keys',
		href: 'https://console.anthropic.com/settings/keys'
	});

	// OpenRouter (future placeholder)
	new Setting(containerEl)
		.setName('OpenRouter API Key')
		.setDesc('Coming soon: Access to many models via OpenRouter')
		.addText(text => {
			text
				.setPlaceholder('Coming soon...')
				.setDisabled(true);
			return text;
		});
}

/**
 * Create local AI (Ollama) section
 */
function createLocalAISection(
	containerEl: HTMLElement,
	plugin: InterBrainPlugin,
	refreshDisplay?: () => Promise<void>
): void {
	containerEl.createEl('h4', { text: 'Local AI (Ollama)' });

	const service = getInferenceService();
	const ollamaProvider = service.getOllamaProvider();

	// Hardware Tier Selection
	new Setting(containerEl)
		.setName('Hardware Tier')
		.setDesc('Select based on your system RAM. Determines which local models are available.')
		.addDropdown(dropdown => {
			dropdown
				.addOption('high', 'High (64GB+ RAM) - Most capable models')
				.addOption('medium', 'Medium (16GB+ RAM) - Balanced performance')
				.addOption('low', 'Low (8GB+ RAM) - Efficient models')
				.setValue(ollamaProvider?.getHardwareTier() || 'medium')
				.onChange(async (value) => {
					const tier = value as HardwareTier;
					ollamaProvider?.setHardwareTier(tier);
					// Refresh to show updated model recommendations
					if (refreshDisplay) await refreshDisplay();
				});
		});

	// Model Selection (curated list)
	createModelSelectionSection(containerEl, plugin, refreshDisplay);

	// One-click setup
	new Setting(containerEl)
		.setName('Quick Setup')
		.setDesc('Install Ollama and pull recommended models')
		.addButton(button => button
			.setButtonText('Setup Guide')
			.onClick(() => {
				window.open('https://ollama.ai', '_blank');
			}))
		.addButton(button => button
			.setButtonText('Check Ollama Status')
			.onClick(async () => {
				const status = await ollamaProvider?.getStatus();
				if (status) {
					const message = status.status === 'ready'
						? `✅ Ollama is running!\n\nInstalled models:\n${status.models?.join('\n') || 'None'}`
						: `${status.message}\n\n${status.details || ''}`;
					window.alert(message);
				}
			}));
}

/**
 * Create model selection with curated recommendations
 */
function createModelSelectionSection(
	containerEl: HTMLElement,
	plugin: InterBrainPlugin,
	refreshDisplay?: () => Promise<void>
): void {
	const service = getInferenceService();
	const ollamaProvider = service.getOllamaProvider();
	const currentTier = ollamaProvider?.getHardwareTier() || 'medium';

	// Filter models appropriate for current tier
	const appropriateModels = CURATED_OLLAMA_MODELS.filter(m => {
		if (currentTier === 'high') return true; // All models available
		if (currentTier === 'medium') return m.tier !== 'high';
		return m.tier === 'low'; // Low tier only gets low models
	});

	// Group by complexity
	const complexityGroups: Record<string, CuratedModel[]> = {
		complex: appropriateModels.filter(m => m.complexity === 'complex'),
		standard: appropriateModels.filter(m => m.complexity === 'standard'),
		trivial: appropriateModels.filter(m => m.complexity === 'trivial')
	};

	const modelSection = containerEl.createDiv({ cls: 'interbrain-model-selection' });
	modelSection.createEl('p', {
		text: 'Recommended models for your hardware tier:',
		cls: 'setting-item-description'
	});

	const modelList = modelSection.createEl('ul');
	modelList.style.listStyle = 'none';
	modelList.style.paddingLeft = '0';

	for (const [complexity, models] of Object.entries(complexityGroups)) {
		if (models.length === 0) continue;

		const complexityLabel = complexity.charAt(0).toUpperCase() + complexity.slice(1);
		const li = modelList.createEl('li');
		li.style.marginBottom = '8px';

		li.createEl('strong', { text: `${complexityLabel} tasks: ` });

		const modelNames = models.map(m => `${m.name} (${m.size})`).join(', ');
		li.createSpan({ text: modelNames, cls: 'setting-item-description' });

		// Pull button for first recommended model
		const primaryModel = models[0];
		const pullBtn = li.createEl('button', {
			text: `Pull ${primaryModel.id}`,
			cls: 'mod-cta'
		});
		pullBtn.style.marginLeft = '8px';
		pullBtn.style.fontSize = '12px';
		pullBtn.addEventListener('click', async () => {
			pullBtn.textContent = 'Pulling...';
			pullBtn.disabled = true;

			try {
				const success = await ollamaProvider?.pullModel(primaryModel.id, (status) => {
					console.log('Ollama pull:', status);
				});

				if (success) {
					pullBtn.textContent = '✅ Pulled!';
					if (refreshDisplay) await refreshDisplay();
				} else {
					pullBtn.textContent = '❌ Failed';
				}
			} catch (error) {
				pullBtn.textContent = '❌ Error';
				console.error('Model pull failed:', error);
			}

			globalThis.setTimeout(() => {
				pullBtn.textContent = `Pull ${primaryModel.id}`;
				pullBtn.disabled = false;
			}, 3000);
		});
	}
}

/**
 * Create preferences section
 */
function createPreferencesSection(
	containerEl: HTMLElement,
	plugin: InterBrainPlugin
): void {
	containerEl.createEl('h4', { text: 'Preferences' });

	const service = getInferenceService();
	const config = service.getConfig();

	new Setting(containerEl)
		.setName('Prefer Local AI')
		.setDesc('Use Ollama when available, fall back to Claude if needed')
		.addToggle(toggle => toggle
			.setValue(config.preferLocal)
			.onChange(async (value) => {
				service.updateConfig({ preferLocal: value });
			}));

	new Setting(containerEl)
		.setName('Offline Mode')
		.setDesc('Never make API calls - only use local AI (requires Ollama)')
		.addToggle(toggle => toggle
			.setValue(config.offlineMode)
			.onChange(async (value) => {
				service.updateConfig({ offlineMode: value });
			}));
}

/**
 * Helper: Create status display
 */
function createStatusDisplay(containerEl: HTMLElement, status: FeatureStatus): void {
	const statusDiv = containerEl.createDiv({ cls: 'interbrain-status-display' });

	const icon = SettingsStatusService.getStatusIcon(status.status);
	const colorClass = SettingsStatusService.getStatusColor(status.status);

	const statusText = statusDiv.createEl('p', {
		cls: `interbrain-status-text ${colorClass}`
	});
	statusText.createSpan({ text: `${icon} Status: ` });
	statusText.createEl('strong', { text: status.message });

	if (status.details) {
		statusDiv.createEl('p', {
			text: status.details,
			cls: 'interbrain-status-details'
		});
	}
}
