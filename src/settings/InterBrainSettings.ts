import { App, PluginSettingTab, Setting } from 'obsidian';
import type InterBrainPlugin from '../main';
import { SettingsStatusService, type SystemStatus } from '../services/settings-status-service';
import { ollamaEmbeddingService } from '../features/semantic-search/services/ollama-embedding-service';
import { getRealtimeTranscriptionService } from '../features/realtime-transcription';
import { serviceManager } from '../services/service-manager';

export interface InterBrainSettings {
	claudeApiKey: string;
	radiclePassphrase: string;
	userEmail: string;
	hasLaunchedBefore: boolean;
	transcriptionEnabled: boolean;
	transcriptionSetupComplete: boolean;
}

export const DEFAULT_SETTINGS: InterBrainSettings = {
	claudeApiKey: '',
	radiclePassphrase: '',
	userEmail: '',
	hasLaunchedBefore: false,
	transcriptionEnabled: true,  // Auto-enabled on first launch
	transcriptionSetupComplete: false
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

		// Initialize status service lazily with singleton service instances
		if (!this.statusService) {
			this.statusService = new SettingsStatusService(
				this.app,
				ollamaEmbeddingService,
				getRealtimeTranscriptionService(),
				serviceManager.getRadicleService()
			);
		}

		// Load system status
		this.systemStatus = await this.statusService.getSystemStatus(
			this.plugin.settings.claudeApiKey,
			this.plugin.settings.radiclePassphrase
		);

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
			{ name: 'Semantic Search', status: this.systemStatus.semanticSearch, sectionId: 'semantic-search-section' },
			{ name: 'Transcription', status: this.systemStatus.transcription, sectionId: 'transcription-section' },
			{ name: 'Radicle Network', status: this.systemStatus.radicle, sectionId: 'radicle-section' },
			{ name: 'GitHub Sharing', status: this.systemStatus.github, sectionId: 'github-section' },
			{ name: 'Claude API', status: this.systemStatus.claudeApi, sectionId: 'ai-section' }
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
	 * AI Integration Section
	 */
	private createAISection(containerEl: HTMLElement): void {
		const header = containerEl.createEl('h2', { text: '🤖 AI Integration' });
		header.id = 'ai-section';

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
		const header = containerEl.createEl('h2', { text: '🔍 Semantic Search (Ollama)' });
		header.id = 'semantic-search-section';

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
		const header = containerEl.createEl('h2', { text: '🎙️ Real-Time Transcription (Whisper)' });
		header.id = 'transcription-section';

		const status = this.systemStatus?.transcription;
		if (status) {
			this.createStatusDisplay(containerEl, status);
		}

		// Enable/Disable Toggle
		new Setting(containerEl)
			.setName('Enable Transcription')
			.setDesc('Automatically set up and enable real-time transcription features')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.transcriptionEnabled)
				.onChange(async (value) => {
					this.plugin.settings.transcriptionEnabled = value;
					await this.plugin.saveSettings();

					// If enabled and not setup, trigger auto-setup
					if (value && !this.plugin.settings.transcriptionSetupComplete) {
						window.alert('Transcription enabled! Setup will run automatically in the background.');
						this.runTranscriptionSetup();
					}

					// Refresh display
					await this.display();
				}));

		// Model info
		containerEl.createEl('p', {
			text: 'Transcription uses OpenAI Whisper for real-time speech-to-text. Setup runs automatically on first launch.',
			cls: 'setting-item-description'
		});

		// Action buttons (only show if enabled)
		if (this.plugin.settings.transcriptionEnabled) {
			const buttonSetting = new Setting(containerEl)
				.setName('Actions')
				.setDesc('Set up transcription environment and manage features');

		// Setup Environment button (if not ready)
		if (status?.status !== 'ready') {
			buttonSetting.addButton(button => button
				.setButtonText('Setup Environment')
				.onClick(async () => {
					const vaultPath = (this.app.vault.adapter as any).basePath;

					// Run setup script
					const { exec } = require('child_process');
					button.setButtonText('Setting up...');
					button.setDisabled(true);

					exec(`cd "${vaultPath}/InterBrain/src/features/realtime-transcription/scripts" && bash setup.sh`,
						(error: Error | null, stdout: string, stderr: string) => {
							if (error) {
								console.error('Setup error:', error);
								console.error('stderr:', stderr);
								window.alert(`Setup failed: ${error.message}\n\nCheck console for details.`);
								button.setButtonText('Setup Environment');
								button.setDisabled(false);
							} else {
								console.log('Setup output:', stdout);
								window.alert('Setup complete! Python environment and Whisper model are ready.');
								button.setButtonText('Setup Complete ✓');
								// Refresh status
								setTimeout(() => this.display(), 1000);
							}
						}
					);
				}));
		}

			// Start Transcription button (always available)
			buttonSetting.addButton(button => button
				.setButtonText('Start Transcription')
				.onClick(() => {
					this.app.commands.executeCommandById('interbrain:start-realtime-transcription');
				}));

			// Installation instructions
			if (status?.status !== 'ready') {
				const installDiv = containerEl.createDiv({ cls: 'interbrain-install-instructions' });
				installDiv.createEl('p', { text: '📦 Automatic setup:' });
				const ol = installDiv.createEl('ol');
				ol.createEl('li', { text: 'Transcription auto-setup runs on first launch' });
				ol.createEl('li', { text: 'Or click "Setup Environment" button above to run manually' });
				ol.createEl('li', { text: 'Setup creates venv and downloads Whisper model (1-2 minutes)' });
				ol.createEl('li', { text: 'Once complete, use "Start Transcription" anytime' });
			}
		}
	}

	/**
	 * Run transcription setup in background
	 */
	private async runTranscriptionSetup(): Promise<void> {
		const vaultPath = (this.app.vault.adapter as any).basePath;
		const { exec } = require('child_process');

		console.log('🎙️ Running transcription auto-setup...');

		exec(`cd "${vaultPath}/InterBrain/src/features/realtime-transcription/scripts" && bash setup.sh`,
			async (error: Error | null, stdout: string, stderr: string) => {
				if (error) {
					console.error('Transcription setup error:', error);
					console.error('stderr:', stderr);
					console.log('Setup will retry on manual trigger or transcription start');
				} else {
					console.log('✅ Transcription setup complete!');
					console.log('Setup output:', stdout);
					this.plugin.settings.transcriptionSetupComplete = true;
					await this.plugin.saveSettings();
					// Refresh status display
					await this.display();
				}
			}
		);
	}

	/**
	 * Radicle Network Section
	 */
	private createRadicleSection(containerEl: HTMLElement): void {
		const header = containerEl.createEl('h2', { text: '🌐 Radicle Peer-to-Peer Network' });
		header.id = 'radicle-section';

		const status = this.systemStatus?.radicle;
		if (status) {
			this.createStatusDisplay(containerEl, status);
		}

		// Create placeholder for identity (will be populated asynchronously)
		const identityPlaceholder = containerEl.createDiv({ cls: 'interbrain-radicle-identity-placeholder' });

		// Show identity if available
		const radicleService = serviceManager.getRadicleService();
		if (radicleService && status?.available) {
			radicleService.getIdentity().then((identity: any) => {
				if (identity) {
					// Clear placeholder and create identity div IN THE SAME LOCATION
					identityPlaceholder.empty();
					identityPlaceholder.addClass('interbrain-radicle-identity');
					identityPlaceholder.removeClass('interbrain-radicle-identity-placeholder');

					identityPlaceholder.createEl('p', { text: 'Your Identity:' });

					const didContainer = identityPlaceholder.createDiv({ cls: 'did-container' });
					didContainer.createSpan({ text: 'DID: ' });
					didContainer.createEl('code', { text: identity.did });

					// Add copy button
					const copyButton = didContainer.createEl('button', {
						text: '📋 Copy',
						cls: 'did-copy-button'
					});
					copyButton.addEventListener('click', () => {
						navigator.clipboard.writeText(identity.did).then(() => {
							copyButton.textContent = '✅ Copied!';
							setTimeout(() => {
								copyButton.textContent = '📋 Copy';
							}, 2000);
						}).catch((err) => {
							console.error('Failed to copy DID:', err);
							copyButton.textContent = '❌ Failed';
							setTimeout(() => {
								copyButton.textContent = '📋 Copy';
							}, 2000);
						});
					});

					if (identity.alias) {
						const aliasContainer = identityPlaceholder.createDiv({ cls: 'alias-container' });
						aliasContainer.style.display = 'flex';
						aliasContainer.style.alignItems = 'center';
						aliasContainer.style.gap = '8px';
						aliasContainer.style.marginTop = '8px';

						const aliasText = aliasContainer.createEl('p', {
							text: `Alias: ${identity.alias}`,
							cls: 'alias-display'
						});
						aliasText.style.margin = '0';

						const editButton = aliasContainer.createEl('button', {
							text: '✏️ Edit',
							cls: 'alias-edit-button'
						});
						editButton.addEventListener('click', async () => {
							// Create input field
							const inputContainer = aliasContainer.createDiv({ cls: 'alias-input-container' });
							inputContainer.style.display = 'flex';
							inputContainer.style.gap = '4px';
							inputContainer.style.width = '100%';

							const input = inputContainer.createEl('input', {
								type: 'text',
								value: identity.alias,
								cls: 'alias-input'
							});
							input.style.flex = '1';
							input.focus();
							input.select();

							const saveButton = inputContainer.createEl('button', {
								text: '✅ Save',
								cls: 'alias-save-button'
							});

							const cancelButton = inputContainer.createEl('button', {
								text: '❌ Cancel',
								cls: 'alias-cancel-button'
							});

							// Hide display elements
							aliasText.style.display = 'none';
							editButton.style.display = 'none';

							const cleanup = () => {
								inputContainer.remove();
								aliasText.style.display = 'block';
								editButton.style.display = 'block';
							};

							cancelButton.addEventListener('click', cleanup);

							saveButton.addEventListener('click', async () => {
								const newAlias = input.value.trim();
								if (!newAlias) {
									alert('Alias cannot be empty');
									return;
								}

								try {
									saveButton.disabled = true;
									saveButton.textContent = '⏳ Saving...';

									const radCmd = await radicleService.getRadCommand();
									const { exec } = require('child_process');
									const { promisify } = require('util');
									const execAsync = promisify(exec);
									const fs = require('fs').promises;

									// Get config file path
									const configPath = (await execAsync(`"${radCmd}" self --config`)).stdout.trim();

									// Read current config
									const configContent = await fs.readFile(configPath, 'utf8');
									const config = JSON.parse(configContent);

									// Update alias in config
									if (!config.node) config.node = {};
									config.node.alias = newAlias;

									// Write updated config back
									await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

									// Update display
									aliasText.textContent = `Alias: ${newAlias}`;
									identity.alias = newAlias;

									cleanup();

									// Show success message
									const successMsg = aliasContainer.createSpan({ text: '✅ Alias updated!' });
									successMsg.style.color = 'green';
									successMsg.style.marginLeft = '8px';
									setTimeout(() => successMsg.remove(), 3000);

								} catch (error: any) {
									alert(`Failed to update alias: ${error.message}`);
									saveButton.disabled = false;
									saveButton.textContent = '✅ Save';
								}
							});

							// Allow Enter to save
							input.addEventListener('keydown', (e) => {
								if (e.key === 'Enter') {
									saveButton.click();
								} else if (e.key === 'Escape') {
									cleanup();
								}
							});
						});
					}
				}
			}).catch(() => {
				// Identity not available, remove placeholder
				identityPlaceholder.remove();
			});
		}

		// Node status display
		const nodeStatusDiv = containerEl.createDiv({ cls: 'interbrain-node-status' });
		nodeStatusDiv.id = 'radicle-node-status';
		this.updateNodeStatus(nodeStatusDiv, radicleService);

		// Passphrase setting with validation
		const passphraseSetting = new Setting(containerEl)
			.setName('Radicle Passphrase')
			.setDesc('Enables automatic node startup for seamless DreamNode sharing')
			.addText(text => {
				text
					.setPlaceholder('Enter passphrase...')
					.setValue(this.plugin.settings.radiclePassphrase)
					.onChange(async (value) => {
						this.plugin.settings.radiclePassphrase = value;
						await this.plugin.saveSettings();
						// Clear validation state when passphrase changes
						const validationEl = document.getElementById('passphrase-validation');
						if (validationEl) {
							validationEl.textContent = '';
						}
					});
				text.inputEl.type = 'password';
				text.inputEl.id = 'radicle-passphrase-input'; // Add ID for external updates
				return text;
			})
			.addButton(button => button
				.setButtonText('Test Passphrase')
				.setTooltip('Validate passphrase by starting the node')
				.onClick(async () => {
					await this.testRadiclePassphrase(radicleService, nodeStatusDiv);
				}));

		// Validation feedback element
		const validationEl = containerEl.createDiv({ cls: 'passphrase-validation' });
		validationEl.id = 'passphrase-validation';

		// User email setting (for collaboration handshake)
		new Setting(containerEl)
			.setName('Email Address')
			.setDesc('Used for collaboration handshake (FaceTime-compatible recommended). Auto-populated in DID backpropagation emails.')
			.addText(text => text
				.setPlaceholder('your.email@example.com')
				.setValue(this.plugin.settings.userEmail)
				.onChange(async (value) => {
					this.plugin.settings.userEmail = value;
					await this.plugin.saveSettings();
				}));

		// Node control buttons
		new Setting(containerEl)
			.setName('Node Control')
			.setDesc('Manually start or stop the Radicle node')
			.addButton(button => button
				.setButtonText('Start Node')
				.onClick(async () => {
					await this.startRadicleNode(radicleService, nodeStatusDiv);
				}))
			.addButton(button => button
				.setButtonText('Stop Node')
				.onClick(async () => {
					await this.stopRadicleNode(radicleService, nodeStatusDiv);
				}));

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
		const header = containerEl.createEl('h2', { text: '📤 GitHub Sharing (Fallback)' });
		header.id = 'github-section';

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

	/**
	 * Update Radicle node status display
	 */
	private async updateNodeStatus(containerEl: HTMLElement, radicleService: any): Promise<void> {
		containerEl.empty();

		if (!radicleService) {
			containerEl.createEl('p', { text: '⚠️ Radicle service not available', cls: 'status-warning' });
			return;
		}

		try {
			const isRunning = await radicleService.isNodeRunning();
			const isAvailable = await radicleService.isAvailable();

			if (!isAvailable) {
				containerEl.createEl('p', { text: '❌ Radicle not installed', cls: 'status-error' });
				return;
			}

			const statusEl = containerEl.createEl('p', { cls: 'node-status-line' });
			if (isRunning) {
				statusEl.createSpan({ text: '✅ Node Status: ', cls: 'status-label' });
				statusEl.createEl('strong', { text: 'Running', cls: 'status-ready' });
			} else {
				statusEl.createSpan({ text: '⚠️ Node Status: ', cls: 'status-label' });
				statusEl.createEl('strong', { text: 'Stopped', cls: 'status-warning' });
			}
		} catch (error) {
			containerEl.createEl('p', {
				text: `❌ Error checking node status: ${error instanceof Error ? error.message : 'Unknown error'}`,
				cls: 'status-error'
			});
		}
	}

	/**
	 * Test Radicle passphrase by attempting to start the node
	 */
	private async testRadiclePassphrase(radicleService: any, nodeStatusDiv: HTMLElement): Promise<void> {
		const validationEl = document.getElementById('passphrase-validation');
		if (!validationEl) return;

		const passphrase = this.plugin.settings.radiclePassphrase;
		if (!passphrase || passphrase.trim() === '') {
			validationEl.innerHTML = '<span class="status-error">❌ Please enter a passphrase first</span>';
			return;
		}

		validationEl.innerHTML = '<span class="status-info">⏳ Testing passphrase...</span>';

		try {
			const { exec } = require('child_process');
			const { promisify } = require('util');
			const execAsync = promisify(exec);

			const env = { ...process.env, RAD_PASSPHRASE: passphrase };

			// Add Radicle bin to PATH
			const radCmd = await radicleService.getRadCommand();
			const path = require('path');
			const radBinDir = path.dirname(radCmd);
			env.PATH = `${radBinDir}:${env.PATH}`;

			// Check if node is already running
			const wasRunning = await radicleService.isNodeRunning();

			if (wasRunning) {
				// Node already running - need to restart it to properly test passphrase
				validationEl.innerHTML = '<span class="status-info">⏳ Node running - restarting to test passphrase...</span>';

				try {
					// Stop the node first
					await execAsync(`"${radCmd}" node stop`, { env });
					// Wait for node to fully stop
					await new Promise(resolve => setTimeout(resolve, 2000));
				} catch (stopError) {
					// Ignore stop errors - node might not have been running
					console.log('Node stop completed (or was not running)');
				}
			}

			// Now start the node with the passphrase
			await execAsync(`"${radCmd}" node start`, { env });

			// Wait longer for node to fully start, then retry status check up to 3 times
			let isRunning = false;
			for (let i = 0; i < 3; i++) {
				await new Promise(resolve => setTimeout(resolve, 2000));
				isRunning = await radicleService.isNodeRunning();
				if (isRunning) break;
			}

			if (isRunning) {
				validationEl.innerHTML = '<span class="status-ready">✅ Passphrase correct! Node started successfully.</span>';
				await this.updateNodeStatus(nodeStatusDiv, radicleService);
			} else {
				validationEl.innerHTML = '<span class="status-warning">⚠️ Node start command succeeded but status check failed. Check console.</span>';
				await this.updateNodeStatus(nodeStatusDiv, radicleService);
			}
		} catch (error: any) {
			const errorMsg = error.message || error.stdout || error.stderr || 'Unknown error';
			if (errorMsg.includes('passphrase') || errorMsg.includes('Passphrase')) {
				validationEl.innerHTML = '<span class="status-error">❌ Passphrase incorrect! Node start failed.</span>';
			} else {
				validationEl.innerHTML = '<span class="status-error">❌ Passphrase incorrect! Node start failed.</span>';
			}
		}
	}

	/**
	 * Start Radicle node
	 */
	private async startRadicleNode(radicleService: any, nodeStatusDiv: HTMLElement): Promise<void> {
		const validationEl = document.getElementById('passphrase-validation');
		if (!validationEl) return;

		const passphrase = this.plugin.settings.radiclePassphrase;
		if (!passphrase || passphrase.trim() === '') {
			validationEl.innerHTML = '<span class="status-error">❌ Please configure passphrase first</span>';
			return;
		}

		validationEl.innerHTML = '<span class="status-info">⏳ Starting node...</span>';

		try {
			const { exec } = require('child_process');
			const { promisify } = require('util');
			const execAsync = promisify(exec);

			const env = { ...process.env, RAD_PASSPHRASE: passphrase };

			const radCmd = await radicleService.getRadCommand();
			const path = require('path');
			const radBinDir = path.dirname(radCmd);
			env.PATH = `${radBinDir}:${env.PATH}`;

			await execAsync(`"${radCmd}" node start`, { env });

			// Wait and retry status check to confirm node started
			let isRunning = false;
			for (let i = 0; i < 3; i++) {
				await new Promise(resolve => setTimeout(resolve, 2000));
				isRunning = await radicleService.isNodeRunning();
				if (isRunning) break;
			}

			if (isRunning) {
				validationEl.innerHTML = '<span class="status-ready">✅ Node started successfully</span>';
			} else {
				validationEl.innerHTML = '<span class="status-ready">✅ Start command sent (status pending)</span>';
			}
			await this.updateNodeStatus(nodeStatusDiv, radicleService);
		} catch (error: any) {
			const errorMsg = error.message || error.stdout || error.stderr || 'Unknown error';
			if (errorMsg.includes('already running') || errorMsg.includes('Already running')) {
				validationEl.innerHTML = '<span class="status-ready">✅ Node already running</span>';
				await this.updateNodeStatus(nodeStatusDiv, radicleService);
			} else {
				validationEl.innerHTML = `<span class="status-error">❌ Failed to start: ${errorMsg}</span>`;
			}
		}
	}

	/**
	 * Stop Radicle node
	 */
	private async stopRadicleNode(radicleService: any, nodeStatusDiv: HTMLElement): Promise<void> {
		const validationEl = document.getElementById('passphrase-validation');
		if (!validationEl) return;

		validationEl.innerHTML = '<span class="status-info">⏳ Stopping node...</span>';

		try {
			const { exec } = require('child_process');
			const { promisify } = require('util');
			const execAsync = promisify(exec);

			const radCmd = await radicleService.getRadCommand();
			await execAsync(`"${radCmd}" node stop`);
			await new Promise(resolve => setTimeout(resolve, 1000));

			validationEl.innerHTML = '<span class="status-info">✓ Node stopped</span>';
			await this.updateNodeStatus(nodeStatusDiv, radicleService);
		} catch (error: any) {
			validationEl.innerHTML = `<span class="status-error">❌ Failed to stop: ${error.message}</span>`;
		}
	}
}
