/**
 * InterBrain Settings Tab
 *
 * Thin orchestrator that delegates to feature-owned settings sections.
 * Only contains global settings (header, status overview, API key, keyboard shortcuts, advanced).
 */

import { App, PluginSettingTab, Setting } from 'obsidian';
import type InterBrainPlugin from '../../main';
import { SettingsStatusService, type SystemStatus, type FeatureStatus } from './settings-status-service';

// Feature-owned settings sections
import { createSemanticSearchSettingsSection } from '../semantic-search/settings-section';
import { createTranscriptionSettingsSection } from '../realtime-transcription/settings-section';
import { createWebLinkAnalyzerSettingsSection } from '../web-link-analyzer/settings-section';
import { createRadicleSettingsSection } from '../social-resonance-filter/settings-section';
import { createGitHubSettingsSection } from '../github-publishing/settings-section';
import { createFeedbackSettingsSection } from '../feedback/settings-section';
import { createAIMagicSettingsSection } from '../ai-magic/settings-section';

export interface InterBrainSettings {
	claudeApiKey: string;
	openaiApiKey: string;
	groqApiKey: string;
	xaiApiKey: string;
	radiclePassphrase: string;
	userEmail: string;
	hasLaunchedBefore: boolean;
	transcriptionEnabled: boolean;
	transcriptionSetupComplete: boolean;
	webLinkAnalyzerEnabled: boolean;
	webLinkAnalyzerSetupComplete: boolean;
}

export const DEFAULT_SETTINGS: InterBrainSettings = {
	claudeApiKey: '',
	openaiApiKey: '',
	groqApiKey: '',
	xaiApiKey: '',
	radiclePassphrase: '',
	userEmail: '',
	hasLaunchedBefore: false,
	transcriptionEnabled: true,  // Auto-enabled on first launch
	transcriptionSetupComplete: false,
	webLinkAnalyzerEnabled: false,  // Requires manual setup (needs API key)
	webLinkAnalyzerSetupComplete: false
};

export class InterBrainSettingTab extends PluginSettingTab {
	plugin: InterBrainPlugin;
	private statusService: SettingsStatusService | null = null;
	private systemStatus: SystemStatus | null = null;

	constructor(app: App, plugin: InterBrainPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async display(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('interbrain-settings');

		// Initialize status service lazily
		if (!this.statusService) {
			this.statusService = new SettingsStatusService();
		}

		// Load system status
		this.systemStatus = await this.statusService.getSystemStatus(
			this.plugin.settings.claudeApiKey,
			this.plugin.settings.radiclePassphrase
		);

		// Callback for feature sections to refresh display
		const refreshDisplay = async () => {
			await this.display();
		};

		// ============================================================
		// Header with Logo (global)
		// ============================================================
		this.createHeader(containerEl);

		// ============================================================
		// Quick Status Overview (global)
		// ============================================================
		this.createStatusOverview(containerEl);

		// ============================================================
		// AI Magic Section (feature-owned - unified AI provider management)
		// ============================================================
		createAIMagicSettingsSection(
			containerEl,
			this.plugin,
			this.systemStatus?.aiMagic,
			refreshDisplay
		);

		// ============================================================
		// Semantic Search Section (feature-owned)
		// ============================================================
		createSemanticSearchSettingsSection(
			containerEl,
			this.plugin,
			this.systemStatus?.semanticSearch
		);

		// ============================================================
		// Transcription Section (feature-owned)
		// ============================================================
		createTranscriptionSettingsSection(
			containerEl,
			this.plugin,
			this.systemStatus?.transcription,
			refreshDisplay
		);

		// ============================================================
		// Web Link Analyzer Section (feature-owned)
		// ============================================================
		createWebLinkAnalyzerSettingsSection(
			containerEl,
			this.plugin,
			this.systemStatus?.webLinkAnalyzer,
			refreshDisplay
		);

		// ============================================================
		// Radicle Network Section (feature-owned)
		// ============================================================
		createRadicleSettingsSection(
			containerEl,
			this.plugin,
			this.systemStatus?.radicle,
			refreshDisplay
		);

		// ============================================================
		// GitHub Publishing Section (feature-owned)
		// ============================================================
		createGitHubSettingsSection(
			containerEl,
			this.plugin,
			this.systemStatus?.github
		);

		// ============================================================
		// Bug Reporting Section (feature-owned)
		// ============================================================
		createFeedbackSettingsSection(
			containerEl,
			this.plugin
		);

		// ============================================================
		// Keyboard Shortcuts Section (global)
		// ============================================================
		this.createKeyboardShortcutsSection(containerEl);

		// ============================================================
		// Advanced Section (global)
		// ============================================================
		this.createAdvancedSection(containerEl);
	}

	/**
	 * Create header with logo
	 */
	private createHeader(containerEl: HTMLElement): void {
		const headerDiv = containerEl.createDiv({ cls: 'interbrain-settings-header' });

		// Try to load logo using Obsidian's resource path API
		try {
			// Use Obsidian's getResourcePath to get proper URL
			const logoUrl = this.app.vault.adapter.getResourcePath('InterBrain/InterBrain.png');

			const img = headerDiv.createEl('img', {
				cls: 'interbrain-logo',
				attr: {
					src: logoUrl,
					alt: 'InterBrain Logo'
				}
			});
			img.style.width = '64px';
			img.style.height = '64px';
			img.style.display = 'block';
			img.style.margin = '0 auto 16px';
		} catch (error) {
			console.error('Failed to load InterBrain logo:', error);
		}

		headerDiv.createEl('h1', {
			text: 'InterBrain Settings',
			cls: 'interbrain-settings-title'
		});

		headerDiv.createEl('p', {
			text: 'Manage AI integration, peer-to-peer networking, and feature availability',
			cls: 'interbrain-settings-subtitle'
		});
	}

	/**
	 * Create status overview grid
	 */
	private createStatusOverview(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: '🎯 Quick Status Overview' });

		const statusGrid = containerEl.createDiv({ cls: 'interbrain-status-grid' });

		if (!this.systemStatus) return;

		const features = [
			{ name: 'AI Magic', status: this.systemStatus.aiMagic, sectionId: 'ai-magic-section' },
			{ name: 'Semantic Search', status: this.systemStatus.semanticSearch, sectionId: 'semantic-search-section' },
			{ name: 'Transcription', status: this.systemStatus.transcription, sectionId: 'transcription-section' },
			{ name: 'Web Link Analyzer', status: this.systemStatus.webLinkAnalyzer, sectionId: 'web-link-analyzer-section' },
			{ name: 'Radicle Network', status: this.systemStatus.radicle, sectionId: 'radicle-section' },
			{ name: 'GitHub Publishing', status: this.systemStatus.github, sectionId: 'github-section' }
		];

		features.forEach(feature => {
			const statusItem = statusGrid.createDiv({ cls: 'status-item clickable-status' });

			// Make the entire status item clickable to jump to section
			statusItem.addEventListener('click', () => {
				const section = document.getElementById(feature.sectionId);
				if (section) {
					section.scrollIntoView({ behavior: 'smooth', block: 'start' });
				}
			});

			const icon = SettingsStatusService.getStatusIcon(feature.status.status);
			const colorClass = SettingsStatusService.getStatusColor(feature.status.status);

			statusItem.createSpan({
				text: `${icon} ${feature.name}`,
				cls: `status-label ${colorClass}`
			});

			statusItem.createSpan({
				text: feature.status.message,
				cls: 'status-message'
			});
		});

		// Refresh button
		new Setting(containerEl)
			.setName('')
			.addButton(button => button
				.setButtonText('🔄 Refresh Status')
				.onClick(async () => {
					await this.display(); // Reload entire settings panel
				}));
	}

	/**
	 * Keyboard Shortcuts Section (global)
	 */
	private createKeyboardShortcutsSection(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: '⌨️ Keyboard Shortcuts' });

		containerEl.createEl('p', {
			text: 'InterBrain registers many keyboard shortcuts for quick access. Customize them in Obsidian hotkey settings.',
			cls: 'setting-item-description'
		});

		new Setting(containerEl)
			.setName('Manage Hotkeys')
			.setDesc('Open Obsidian hotkey settings to customize InterBrain shortcuts')
			.addButton(button => button
				.setButtonText('Open Hotkey Settings')
				.onClick(() => {
					// @ts-ignore - Private API
					this.app.setting.open();
					// @ts-ignore - Private API
					this.app.setting.openTabById('hotkeys');
				}));

		// Show some common hotkeys
		const hotkeyList = containerEl.createDiv({ cls: 'interbrain-hotkey-list' });
		hotkeyList.createEl('h4', { text: 'Common Shortcuts:' });

		const shortcuts = [
			{ key: 'Cmd+R', desc: 'Reload Plugin (development)' },
			{ key: 'Ctrl+F', desc: 'Toggle Search' },
			{ key: 'Ctrl+E', desc: 'Toggle Edit Mode' },
			{ key: 'Ctrl+N', desc: 'Create DreamNode' },
			{ key: 'Cmd+Shift+T', desc: 'Start/Stop Transcription' }
		];

		const list = hotkeyList.createEl('ul');
		shortcuts.forEach(shortcut => {
			const li = list.createEl('li');
			li.createEl('code', { text: shortcut.key });
			li.appendText(` - ${shortcut.desc}`);
		});
	}

	/**
	 * Advanced Section (global)
	 */
	private createAdvancedSection(containerEl: HTMLElement): void {
		const header = containerEl.createEl('h2', { text: '🔧 Advanced' });
		header.id = 'advanced-section';

		// Install Script (for missing dependencies)
		this.createInstallScriptSection(containerEl);

		// Reset settings button
		new Setting(containerEl)
			.setName('Reset Settings')
			.setDesc('Reset all InterBrain settings to defaults')
			.addButton(button => button
				.setButtonText('Reset All')
				.setWarning()
				.onClick(async () => {
					const confirmed = window.confirm('Reset all settings to defaults? This cannot be undone.');
					if (confirmed) {
						this.plugin.settings = { ...DEFAULT_SETTINGS };
						await this.plugin.saveSettings();
						await this.display(); // Refresh display
					}
				}));

		// Export diagnostics button
		new Setting(containerEl)
			.setName('Export Diagnostics')
			.setDesc('Export system status and diagnostics for troubleshooting')
			.addButton(button => button
				.setButtonText('Export')
				.onClick(async () => {
					if (this.systemStatus) {
						const diagnostics = JSON.stringify(this.systemStatus, null, 2);
						console.log('InterBrain Diagnostics:', diagnostics);
						navigator.clipboard.writeText(diagnostics);
						window.alert('Diagnostics copied to clipboard!');
					}
				}));
	}

	/**
	 * Install Script Section - canonical way to install missing dependencies
	 */
	private createInstallScriptSection(containerEl: HTMLElement): void {
		const installDiv = containerEl.createDiv({ cls: 'interbrain-install-script-section' });
		installDiv.id = 'install-script-section';

		installDiv.createEl('h4', { text: '📦 Install Script' });
		installDiv.createEl('p', {
			text: 'Missing dependencies? Re-run the install script to set up Radicle, GitHub CLI, and other requirements:',
			cls: 'setting-item-description'
		});

		const scriptContainer = installDiv.createDiv({ cls: 'install-script-container' });
		scriptContainer.style.display = 'flex';
		scriptContainer.style.alignItems = 'center';
		scriptContainer.style.gap = '8px';
		scriptContainer.style.marginTop = '8px';
		scriptContainer.style.marginBottom = '16px';

		const installCommand = 'bash <(curl -fsSL https://raw.githubusercontent.com/ProjectLiminality/InterBrain/main/install.sh)';

		const codeEl = scriptContainer.createEl('code', {
			text: installCommand,
			cls: 'install-script-command'
		});
		codeEl.style.padding = '8px 12px';
		codeEl.style.borderRadius = '4px';
		codeEl.style.fontSize = '12px';
		codeEl.style.flex = '1';
		codeEl.style.overflowX = 'auto';

		const copyButton = scriptContainer.createEl('button', {
			text: '📋 Copy',
			cls: 'install-script-copy-button'
		});
		copyButton.addEventListener('click', () => {
			navigator.clipboard.writeText(installCommand).then(() => {
				copyButton.textContent = '✅ Copied!';
				setTimeout(() => {
					copyButton.textContent = '📋 Copy';
				}, 2000);
			}).catch(() => {
				copyButton.textContent = '❌ Failed';
				setTimeout(() => {
					copyButton.textContent = '📋 Copy';
				}, 2000);
			});
		});

		installDiv.createEl('p', {
			text: 'The script is idempotent and safe to run multiple times.',
			cls: 'setting-item-description'
		});
	}

	/**
	 * Helper: Create status display for a feature
	 */
	private createStatusDisplay(containerEl: HTMLElement, status: FeatureStatus): void {
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
}
