import { App, PluginSettingTab, Setting } from 'obsidian';
import type InterBrainPlugin from '../main';
import { SettingsStatusService, type SystemStatus } from '../services/settings-status-service';

export interface InterBrainSettings {
	claudeApiKey: string;
	radiclePassphrase: string;
	hasLaunchedBefore: boolean;
}

export const DEFAULT_SETTINGS: InterBrainSettings = {
	claudeApiKey: '',
	radiclePassphrase: '',
	hasLaunchedBefore: false
};

export class InterBrainSettingTab extends PluginSettingTab {
	plugin: InterBrainPlugin;
	private statusService: SettingsStatusService;
	private systemStatus: SystemStatus | null = null;

	constructor(app: App, plugin: InterBrainPlugin) {
		super(app, plugin);
		this.plugin = plugin;

		// Initialize status service
		this.statusService = new SettingsStatusService(
			app,
			(plugin as any).ollamaService,
			(plugin as any).transcriptionService,
			(plugin as any).radicleService
		);
	}

	async display(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('interbrain-settings');

		// Load system status
		this.systemStatus = await this.statusService.getSystemStatus(this.plugin.settings.claudeApiKey);

		// ============================================================
		// Header with Logo
		// ============================================================
		this.createHeader(containerEl);

		// ============================================================
		// Quick Status Overview
		// ============================================================
		this.createStatusOverview(containerEl);

		// ============================================================
		// AI Integration Section
		// ============================================================
		this.createAISection(containerEl);

		// ============================================================
		// Semantic Search Section
		// ============================================================
		this.createSemanticSearchSection(containerEl);

		// ============================================================
		// Transcription Section
		// ============================================================
		this.createTranscriptionSection(containerEl);

		// ============================================================
		// Radicle Network Section
		// ============================================================
		this.createRadicleSection(containerEl);

		// ============================================================
		// GitHub Sharing Section
		// ============================================================
		this.createGitHubSection(containerEl);

		// ============================================================
		// Keyboard Shortcuts Section
		// ============================================================
		this.createKeyboardShortcutsSection(containerEl);

		// ============================================================
		// Advanced Section
		// ============================================================
		this.createAdvancedSection(containerEl);
	}

	/**
	 * Create header with logo
	 */
	private createHeader(containerEl: HTMLElement): void {
		const headerDiv = containerEl.createDiv({ cls: 'interbrain-settings-header' });

		// Try to load logo
		try {
			const vaultPath = (this.app.vault.adapter as any).basePath;
			const logoPath = `${vaultPath}/InterBrain/InterBrain.png`;

			const img = headerDiv.createEl('img', {
				cls: 'interbrain-logo',
				attr: {
					src: `app://local/${logoPath}`,
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
			{ name: 'Semantic Search', status: this.systemStatus.semanticSearch },
			{ name: 'Transcription', status: this.systemStatus.transcription },
			{ name: 'Radicle Network', status: this.systemStatus.radicle },
			{ name: 'GitHub Sharing', status: this.systemStatus.github },
			{ name: 'Claude API', status: this.systemStatus.claudeApi }
		];

		features.forEach(feature => {
			const statusItem = statusGrid.createDiv({ cls: 'status-item' });

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
	 * AI Integration Section
	 */
	private createAISection(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: '🤖 AI Integration' });

		const status = this.systemStatus?.claudeApi;
		if (status) {
			this.createStatusDisplay(containerEl, status);
		}

		new Setting(containerEl)
			.setName('Claude API Key')
			.setDesc('Your Anthropic API key for conversation summaries and semantic analysis')
			.addText(text => {
				text
					.setPlaceholder('sk-ant-...')
					.setValue(this.plugin.settings.claudeApiKey)
					.onChange(async (value) => {
						this.plugin.settings.claudeApiKey = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.type = 'password';
				return text;
			});

		// Add link to get API key
		containerEl.createEl('p', {
			text: 'Get your API key: ',
			cls: 'setting-item-description'
		}).createEl('a', {
			text: 'https://console.anthropic.com/settings/keys',
			href: 'https://console.anthropic.com/settings/keys'
		});
	}

	/**
	 * Semantic Search Section
	 */
	private createSemanticSearchSection(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: '🔍 Semantic Search (Ollama)' });

		const status = this.systemStatus?.semanticSearch;
		if (status) {
			this.createStatusDisplay(containerEl, status);
		}

		// Action buttons
		const buttonSetting = new Setting(containerEl)
			.setName('Actions')
			.setDesc('Check status and manage semantic search features');

		buttonSetting.addButton(button => button
			.setButtonText('Check Status')
			.onClick(() => {
				this.app.commands.executeCommandById('interbrain:ollama-check-status');
			}));

		buttonSetting.addButton(button => button
			.setButtonText('Run Diagnostics')
			.onClick(() => {
				this.app.commands.executeCommandById('interbrain:ollama-run-diagnostics');
			}));

		buttonSetting.addButton(button => button
			.setButtonText('Reindex All')
			.onClick(() => {
				this.app.commands.executeCommandById('interbrain:index-all-nodes');
			}));

		// Installation instructions
		if (status?.status === 'not-installed') {
			const installDiv = containerEl.createDiv({ cls: 'interbrain-install-instructions' });
			installDiv.createEl('p', { text: '📦 Not installed? Follow these steps:' });
			installDiv.createEl('ol').createEl('li', { text: 'Install Ollama: ' })
				.createEl('a', { text: 'https://ollama.ai', href: 'https://ollama.ai' });
			installDiv.lastElementChild?.createEl('li', { text: 'Run: ollama pull nomic-embed-text' });
			installDiv.lastElementChild?.createEl('li', { text: 'Click "Check Status" above to verify' });
		}
	}

	/**
	 * Transcription Section
	 */
	private createTranscriptionSection(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: '🎙️ Real-Time Transcription (Whisper)' });

		const status = this.systemStatus?.transcription;
		if (status) {
			this.createStatusDisplay(containerEl, status);
		}

		// Model info
		containerEl.createEl('p', {
			text: 'Transcription uses OpenAI Whisper for real-time speech-to-text. First run downloads the model.',
			cls: 'setting-item-description'
		});

		// Setup button
		new Setting(containerEl)
			.setName('Setup')
			.setDesc('Initialize Python environment and download Whisper model')
			.addButton(button => button
				.setButtonText('Start Transcription')
				.onClick(() => {
					this.app.commands.executeCommandById('interbrain:start-realtime-transcription');
				}));

		// Installation instructions
		if (status?.status !== 'ready') {
			const installDiv = containerEl.createDiv({ cls: 'interbrain-install-instructions' });
			installDiv.createEl('p', { text: '📦 Setup instructions:' });
			const ol = installDiv.createEl('ol');
			ol.createEl('li', { text: 'Ensure Python 3 is installed' });
			ol.createEl('li', { text: 'Click "Start Transcription" above' });
			ol.createEl('li', { text: 'First run will download Whisper model (may take 1-2 minutes)' });
			ol.createEl('li', { text: 'Subsequent runs start immediately' });
		}
	}

	/**
	 * Radicle Network Section
	 */
	private createRadicleSection(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: '🌐 Radicle Peer-to-Peer Network' });

		const status = this.systemStatus?.radicle;
		if (status) {
			this.createStatusDisplay(containerEl, status);
		}

		// Show identity if available
		const radicleService = (this.plugin as any).radicleService;
		if (radicleService && status?.available) {
			radicleService.getIdentity().then((identity: any) => {
				if (identity) {
					const identityDiv = containerEl.createDiv({ cls: 'interbrain-radicle-identity' });
					identityDiv.createEl('p', { text: 'Your Identity:' });

					const didDiv = identityDiv.createDiv();
					didDiv.createSpan({ text: 'DID: ' });
					didDiv.createEl('code', { text: identity.did });

					if (identity.alias) {
						identityDiv.createEl('p', { text: `Alias: ${identity.alias}` });
					}
				}
			}).catch(() => {
				// Identity not available, that's ok
			});
		}

		// Passphrase setting
		new Setting(containerEl)
			.setName('Radicle Passphrase')
			.setDesc('Enables seamless DreamNode sharing without password prompts')
			.addText(text => {
				text
					.setPlaceholder('Enter passphrase...')
					.setValue(this.plugin.settings.radiclePassphrase)
					.onChange(async (value) => {
						this.plugin.settings.radiclePassphrase = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.type = 'password';
				return text;
			});

		// Installation instructions
		const platform = (window as any).process?.platform || 'unknown';
		if (status?.status === 'not-installed' && platform !== 'win32') {
			const installDiv = containerEl.createDiv({ cls: 'interbrain-install-instructions' });
			installDiv.createEl('p', { text: '📦 Not installed? Install Radicle:' });
			installDiv.createEl('a', {
				text: 'https://radicle.xyz',
				href: 'https://radicle.xyz'
			});
			installDiv.createEl('p', { text: 'Then run: rad auth' });
		}
	}

	/**
	 * GitHub Sharing Section
	 */
	private createGitHubSection(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: '📤 GitHub Sharing (Fallback)' });

		const status = this.systemStatus?.github;
		if (status) {
			this.createStatusDisplay(containerEl, status);
		}

		containerEl.createEl('p', {
			text: 'GitHub is used automatically when Radicle is unavailable or on Windows. Creates GitHub repositories and GitHub Pages sites for DreamNodes.',
			cls: 'setting-item-description'
		});
	}

	/**
	 * Keyboard Shortcuts Section
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
	 * Advanced Section
	 */
	private createAdvancedSection(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: '🔧 Advanced' });

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
	 * Helper: Create status display for a feature
	 */
	private createStatusDisplay(containerEl: HTMLElement, status: any): void {
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
