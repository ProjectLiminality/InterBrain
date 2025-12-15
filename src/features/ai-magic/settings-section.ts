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
import { getInferenceService } from './services/inference-service';
import { getSystemRAMInfo } from './services/ollama-inference';
import {
	ProviderStatus,
	CURATED_OLLAMA_MODELS,
	HIGH_TIER_RAM_THRESHOLD_GB
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
	createProviderStatusSection(containerEl);

	// Remote Providers Section
	createRemoteProvidersSection(containerEl, plugin);

	// Local AI (Ollama) Section
	createLocalAISection(containerEl, plugin, refreshDisplay);

	// Preferences Section
	createPreferencesSection(containerEl);

	// Advanced Section (collapsible)
	createAdvancedSection(containerEl, plugin, refreshDisplay);
}

/**
 * Create provider status overview
 */
async function createProviderStatusSection(
	containerEl: HTMLElement
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
	} catch {
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
	plugin: InterBrainPlugin
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

	// Link to get Claude API key
	const claudeLinkPara = containerEl.createEl('p', { cls: 'setting-item-description' });
	claudeLinkPara.style.marginBottom = '16px';
	claudeLinkPara.createSpan({ text: 'Get your Claude API key: ' });
	claudeLinkPara.createEl('a', {
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

	// Link to OpenRouter
	const openRouterLinkPara = containerEl.createEl('p', { cls: 'setting-item-description' });
	openRouterLinkPara.createSpan({ text: 'Get OpenRouter API key: ' });
	openRouterLinkPara.createEl('a', {
		text: 'openrouter.ai/keys',
		href: 'https://openrouter.ai/keys'
	});
}

/**
 * Create local AI (Ollama) section
 * Simplified: auto-detects hardware, shows appropriate model with one-click pull
 */
function createLocalAISection(
	containerEl: HTMLElement,
	_plugin: InterBrainPlugin,
	refreshDisplay?: () => Promise<void>
): void {
	containerEl.createEl('h4', { text: 'Local AI (Ollama)' });

	const service = getInferenceService();
	const ollamaProvider = service.getOllamaProvider();

	// Get hardware info
	const ramInfo = getSystemRAMInfo();
	const currentTier = ollamaProvider?.getHardwareTier() || ramInfo.tier;

	// Show detected hardware
	const hardwareInfo = containerEl.createDiv({ cls: 'interbrain-hardware-info' });
	hardwareInfo.style.padding = '12px';
	hardwareInfo.style.marginBottom = '16px';
	hardwareInfo.style.borderRadius = '4px';

	const tierIcon = ramInfo.meetsHighTier ? '🚀' : '💻';
	const tierLabel = ramInfo.meetsHighTier ? 'High Performance' : 'Standard';
	hardwareInfo.createEl('p', {
		text: `${tierIcon} Detected: ${ramInfo.totalGB.toFixed(0)} GB RAM → ${tierLabel} tier`,
		cls: 'setting-item-description'
	});

	if (ramInfo.meetsHighTier) {
		hardwareInfo.createEl('p', {
			text: 'Your system can run larger, more capable local models.',
			cls: 'setting-item-description'
		});
	} else {
		hardwareInfo.createEl('p', {
			text: `High performance tier requires ${HIGH_TIER_RAM_THRESHOLD_GB}GB+ RAM.`,
			cls: 'setting-item-description'
		});
	}

	// Show recommended model for this tier
	const recommendedModel = CURATED_OLLAMA_MODELS.find(m => m.tier === currentTier);
	if (recommendedModel) {
		const modelSection = containerEl.createDiv({ cls: 'interbrain-model-recommendation' });
		modelSection.style.marginBottom = '16px';

		new Setting(modelSection)
			.setName(`Recommended: ${recommendedModel.name}`)
			.setDesc(`${recommendedModel.description} (${recommendedModel.size})`)
			.addButton(button => {
				button
					.setButtonText(`Pull ${recommendedModel.id}`)
					.setCta()
					.onClick(async () => {
						button.setButtonText('Pulling...');
						button.setDisabled(true);

						try {
							const success = await ollamaProvider?.pullModel(recommendedModel.id, (status) => {
								console.log('Ollama pull:', status);
							});

							if (success) {
								button.setButtonText('✅ Pulled!');
								if (refreshDisplay) await refreshDisplay();
							} else {
								button.setButtonText('❌ Failed');
							}
						} catch (error) {
							button.setButtonText('❌ Error');
							console.error('Model pull failed:', error);
						}

						globalThis.setTimeout(() => {
							button.setButtonText(`Pull ${recommendedModel.id}`);
							button.setDisabled(false);
						}, 3000);
					});
			});
	}

	// Quick setup buttons
	new Setting(containerEl)
		.setName('Setup')
		.setDesc('Install Ollama to enable local AI')
		.addButton(button => button
			.setButtonText('Download Ollama')
			.onClick(() => {
				window.open('https://ollama.ai/download', '_blank');
			}))
		.addButton(button => button
			.setButtonText('Check Status')
			.onClick(async () => {
				const status = await ollamaProvider?.getStatus();
				if (status) {
					const message = status.status === 'ready'
						? `✅ Ollama is running!\n\nInstalled models:\n${status.models?.join('\n') || 'None'}`
						: `${status.message}\n\n${status.details || ''}`;
					window.alert(message);
				}
			}));

	// Link to Ollama
	const ollamaLinkPara = containerEl.createEl('p', { cls: 'setting-item-description' });
	ollamaLinkPara.createSpan({ text: 'Download and documentation: ' });
	ollamaLinkPara.createEl('a', {
		text: 'ollama.ai',
		href: 'https://ollama.ai'
	});
}

/**
 * Create preferences section
 */
function createPreferencesSection(
	containerEl: HTMLElement
): void {
	containerEl.createEl('h4', { text: 'Preferences' });

	const service = getInferenceService();
	const config = service.getConfig();

	new Setting(containerEl)
		.setName('Prefer Local AI')
		.setDesc('Use Ollama when available, fall back to Claude if needed. When disabled (default), uses Claude for higher quality.')
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

	// Info about privacy and resilience
	const infoDiv = containerEl.createDiv({ cls: 'interbrain-info-note' });
	infoDiv.style.marginTop = '12px';
	infoDiv.style.padding = '12px';
	infoDiv.style.borderRadius = '4px';
	infoDiv.createEl('p', {
		text: 'Local AI benefits: Your data stays on your machine. Works offline. Reduces network dependence.',
		cls: 'setting-item-description'
	});
}

/**
 * Create advanced section for power users
 */
function createAdvancedSection(
	containerEl: HTMLElement,
	plugin: InterBrainPlugin,
	refreshDisplay?: () => Promise<void>
): void {
	const details = containerEl.createEl('details', { cls: 'interbrain-advanced-section' });
	details.style.marginTop = '16px';

	const summary = details.createEl('summary', { text: '⚙️ Advanced Settings' });
	summary.style.cursor = 'pointer';
	summary.style.fontWeight = 'bold';

	const content = details.createDiv();
	content.style.padding = '12px 0';

	content.createEl('p', {
		text: 'For power users who want to use custom Ollama models.',
		cls: 'setting-item-description'
	});

	const service = getInferenceService();
	const ollamaProvider = service.getOllamaProvider();

	// Custom model input
	new Setting(content)
		.setName('Custom Ollama Model')
		.setDesc('Enter a model identifier to use (e.g., "codellama:13b"). Must be pulled via terminal first.')
		.addText(text => {
			text
				.setPlaceholder('e.g., codellama:13b')
				.onChange(async (value) => {
					if (value && ollamaProvider) {
						// Update all complexity tiers to use custom model
						ollamaProvider.updateConfig({
							models: {
								trivial: value,
								standard: value,
								complex: value
							}
						});
					}
				});
			return text;
		})
		.addButton(button => button
			.setButtonText('Apply')
			.onClick(async () => {
				if (refreshDisplay) await refreshDisplay();
			}));

	// Show currently configured models
	if (ollamaProvider) {
		const modelInfo = content.createDiv();
		modelInfo.style.marginTop = '12px';
		modelInfo.style.padding = '8px';
		modelInfo.style.borderRadius = '4px';

		const config = service.getConfig();
		const ollamaConfig = config.ollama;
		if (ollamaConfig?.models) {
			modelInfo.createEl('p', {
				text: `Current models: Trivial=${ollamaConfig.models.trivial || 'default'}, Standard=${ollamaConfig.models.standard || 'default'}, Complex=${ollamaConfig.models.complex || 'default'}`,
				cls: 'setting-item-description'
			});
		}
	}

	// How to pull custom models
	content.createEl('p', {
		text: 'To pull a custom model, run in terminal: ollama pull <model-name>',
		cls: 'setting-item-description'
	});
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
