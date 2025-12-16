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
			details: 'Configure an API key or start Ollama for AI features'
		};
	}

	// At least one provider is ready
	if (hasLocal && hasRemote) {
		const remoteCount = readyProviders.filter(s => s.type === 'remote').length;
		return {
			available: true,
			status: 'ready',
			message: `${readyProviders.length} providers ready`,
			details: `Local AI + ${remoteCount} remote provider${remoteCount > 1 ? 's' : ''} available`
		};
	}

	if (hasLocal && !hasRemote) {
		return {
			available: true,
			status: 'ready',
			message: 'Local AI ready',
			details: 'Ollama running. Add an API key for remote fallback.'
		};
	}

	if (hasRemote && !hasLocal) {
		const remoteCount = readyProviders.length;
		return {
			available: true,
			status: 'ready',
			message: `${remoteCount} remote provider${remoteCount > 1 ? 's' : ''} ready`,
			details: 'Start Ollama for offline/private AI.'
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

	// Provider Status Overview (with default provider selection)
	createProviderStatusSection(containerEl, plugin);

	// Remote Providers Section
	createRemoteProvidersSection(containerEl, plugin);

	// Local AI (Ollama) Section
	createLocalAISection(containerEl, plugin, refreshDisplay);

	// Preferences Section
	createPreferencesSection(containerEl, plugin);
}

/**
 * Map provider display names to provider keys
 */
const PROVIDER_NAME_TO_KEY: Record<string, string> = {
	'Claude': 'claude',
	'Ollama': 'ollama',
	'OpenAI': 'openai',
	'Groq': 'groq',
	'xAI Grok': 'xai'
};

/**
 * Create provider status overview with default provider selection
 */
async function createProviderStatusSection(
	containerEl: HTMLElement,
	plugin: InterBrainPlugin
): Promise<void> {
	const section = containerEl.createDiv({ cls: 'interbrain-provider-status-section' });
	section.createEl('h4', { text: 'Provider Status' });

	const statusGrid = section.createDiv({ cls: 'interbrain-status-grid' });

	try {
		const service = getInferenceService();
		const statuses = await service.getProvidersStatus();
		const currentDefault = plugin.settings.defaultAIProvider || 'claude';

		for (const providerStatus of statuses) {
			createProviderStatusItem(statusGrid, providerStatus, currentDefault, plugin, service);
		}
	} catch {
		statusGrid.createEl('p', {
			text: 'Error loading provider status',
			cls: 'interbrain-status-error'
		});
	}
}

/**
 * Create individual provider status item with default selection radio
 */
function createProviderStatusItem(
	container: HTMLElement,
	status: ProviderStatus,
	currentDefault: string,
	plugin: InterBrainPlugin,
	service: ReturnType<typeof getInferenceService>
): void {
	const item = container.createDiv({ cls: 'status-item' });
	item.style.display = 'flex';
	item.style.alignItems = 'center';
	item.style.gap = '8px';

	const providerKey = PROVIDER_NAME_TO_KEY[status.name] || status.name.toLowerCase();
	const isReady = status.status === 'ready';
	const isDefault = currentDefault === providerKey;

	// Radio button for default selection (only shown if ready)
	const radioContainer = item.createDiv();
	radioContainer.style.width = '20px';

	if (isReady) {
		const radio = radioContainer.createEl('input', {
			type: 'radio',
			attr: {
				name: 'default-ai-provider',
				value: providerKey
			}
		});
		radio.checked = isDefault;
		radio.style.cursor = 'pointer';
		radio.addEventListener('change', async () => {
			plugin.settings.defaultAIProvider = providerKey;
			await plugin.saveSettings();
			service.setDefaultProvider(providerKey as any);
		});
	}

	const icon = status.status === 'ready' ? '✅' :
		status.status === 'unavailable' ? '🔴' :
			status.status === 'not_configured' ? '⚫' : '🟡';

	const typeLabel = status.type === 'local' ? '(Local)' : '(Remote)';

	const labelContainer = item.createDiv();
	labelContainer.style.flex = '1';

	labelContainer.createSpan({
		text: `${icon} ${status.name} ${typeLabel}`,
		cls: 'status-label'
	});

	if (isDefault && isReady) {
		const defaultBadge = labelContainer.createSpan({
			text: ' ★ Default',
			cls: 'status-default-badge'
		});
		defaultBadge.style.color = 'var(--text-accent)';
		defaultBadge.style.fontSize = '0.85em';
	}

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

	const service = getInferenceService();

	// Claude API Key (primary)
	new Setting(containerEl)
		.setName('Claude API Key')
		.setDesc('Anthropic Claude - highest quality AI inference (recommended)')
		.addText(text => {
			text
				.setPlaceholder('sk-ant-...')
				.setValue(plugin.settings.claudeApiKey)
				.onChange(async (value) => {
					plugin.settings.claudeApiKey = value;
					await plugin.saveSettings();
					service.setClaudeApiKey(value);
				});
			text.inputEl.type = 'password';
			return text;
		});

	const claudeLinkPara = containerEl.createEl('p', { cls: 'setting-item-description' });
	claudeLinkPara.style.marginBottom = '16px';
	claudeLinkPara.createSpan({ text: 'Get your Claude API key: ' });
	claudeLinkPara.createEl('a', {
		text: 'console.anthropic.com/settings/keys',
		href: 'https://console.anthropic.com/settings/keys'
	});

	// Groq API Key (blazing fast)
	new Setting(containerEl)
		.setName('Groq API Key')
		.setDesc('Groq - blazing fast inference (sub-second responses)')
		.addText(text => {
			text
				.setPlaceholder('gsk_...')
				.setValue(plugin.settings.groqApiKey || '')
				.onChange(async (value) => {
					plugin.settings.groqApiKey = value;
					await plugin.saveSettings();
					service.setGroqApiKey(value);
				});
			text.inputEl.type = 'password';
			return text;
		});

	const groqLinkPara = containerEl.createEl('p', { cls: 'setting-item-description' });
	groqLinkPara.style.marginBottom = '16px';
	groqLinkPara.createSpan({ text: 'Get your Groq API key: ' });
	groqLinkPara.createEl('a', {
		text: 'console.groq.com/keys',
		href: 'https://console.groq.com/keys'
	});

	// OpenAI API Key
	new Setting(containerEl)
		.setName('OpenAI API Key')
		.setDesc('OpenAI GPT models (GPT-4o)')
		.addText(text => {
			text
				.setPlaceholder('sk-...')
				.setValue(plugin.settings.openaiApiKey || '')
				.onChange(async (value) => {
					plugin.settings.openaiApiKey = value;
					await plugin.saveSettings();
					service.setOpenAIApiKey(value);
				});
			text.inputEl.type = 'password';
			return text;
		});

	const openaiLinkPara = containerEl.createEl('p', { cls: 'setting-item-description' });
	openaiLinkPara.style.marginBottom = '16px';
	openaiLinkPara.createSpan({ text: 'Get your OpenAI API key: ' });
	openaiLinkPara.createEl('a', {
		text: 'platform.openai.com/api-keys',
		href: 'https://platform.openai.com/api-keys'
	});

	// xAI Grok API Key
	new Setting(containerEl)
		.setName('xAI Grok API Key')
		.setDesc('xAI Grok - advanced AI from xAI')
		.addText(text => {
			text
				.setPlaceholder('xai-...')
				.setValue(plugin.settings.xaiApiKey || '')
				.onChange(async (value) => {
					plugin.settings.xaiApiKey = value;
					await plugin.saveSettings();
					service.setXAIApiKey(value);
				});
			text.inputEl.type = 'password';
			return text;
		});

	const xaiLinkPara = containerEl.createEl('p', { cls: 'setting-item-description' });
	xaiLinkPara.style.marginBottom = '16px';
	xaiLinkPara.createSpan({ text: 'Get your xAI API key: ' });
	xaiLinkPara.createEl('a', {
		text: 'console.x.ai',
		href: 'https://console.x.ai'
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

	// Advanced Ollama settings (collapsible)
	const details = containerEl.createEl('details', { cls: 'interbrain-advanced-ollama' });
	details.style.marginTop = '16px';

	const summary = details.createEl('summary', { text: '⚙️ Advanced Ollama Settings' });
	summary.style.cursor = 'pointer';
	summary.style.fontWeight = 'bold';
	summary.style.fontSize = '0.9em';

	const advancedContent = details.createDiv();
	advancedContent.style.padding = '12px 0';

	advancedContent.createEl('p', {
		text: 'For power users who want to use custom Ollama models.',
		cls: 'setting-item-description'
	});

	// Custom model input
	new Setting(advancedContent)
		.setName('Custom Model')
		.setDesc('Enter a model identifier (e.g., "codellama:13b"). Must be pulled via terminal first.')
		.addText(text => {
			text
				.setPlaceholder('e.g., codellama:13b')
				.onChange(async (value) => {
					if (value && ollamaProvider) {
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
		const config = service.getConfig();
		const ollamaConfig = config.ollama;
		if (ollamaConfig?.models) {
			const modelInfo = advancedContent.createDiv();
			modelInfo.style.marginTop = '8px';
			modelInfo.createEl('p', {
				text: `Current: ${ollamaConfig.models.standard || 'default'}`,
				cls: 'setting-item-description'
			});
		}
	}

	advancedContent.createEl('p', {
		text: 'To pull a custom model, run in terminal: ollama pull <model-name>',
		cls: 'setting-item-description'
	});
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

	new Setting(containerEl)
		.setName('Offline Mode')
		.setDesc('Never make API calls - only use local AI (requires Ollama). Data never leaves your machine.')
		.addToggle(toggle => toggle
			.setValue(plugin.settings.offlineMode ?? false)
			.onChange(async (value) => {
				plugin.settings.offlineMode = value;
				await plugin.saveSettings();
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
