/**
 * Web Link Analyzer Settings Section
 *
 * Feature-owned settings UI for AI-powered web link analysis.
 * Rendered within the main settings panel.
 */

import { Setting } from 'obsidian';
import type InterBrainPlugin from '../../main';
import type { FeatureStatus } from '../settings/settings-status-service';
import { SettingsStatusService } from '../settings/settings-status-service';
import { webLinkAnalyzerService } from './services/web-link-analyzer-service';

/**
 * Check web link analyzer feature status
 */
export async function checkWebLinkAnalyzerStatus(claudeApiKey: string): Promise<FeatureStatus> {
	try {
		// Check if API key is configured
		if (!claudeApiKey || claudeApiKey.trim() === '') {
			return {
				available: false,
				status: 'warning',
				message: 'Claude API key required',
				details: 'Configure your Anthropic API key in the AI Integration section above'
			};
		}

		// Check if Python is available
		const pythonAvailable = await checkPythonAvailable();
		if (!pythonAvailable) {
			return {
				available: false,
				status: 'not-installed',
				message: 'Python not installed',
				details: 'Install Python 3.9+ to use AI-powered link analysis'
			};
		}

		// Check if venv exists using the service method
		const venvExists = webLinkAnalyzerService.checkVenvExists();

		if (!venvExists) {
			return {
				available: false,
				status: 'warning',
				message: 'Python installed, environment needs setup',
				details: 'Click "Setup Environment" button below to initialize'
			};
		}

		return {
			available: true,
			status: 'ready',
			message: 'Ready (Python + Claude API)',
			details: 'AI-powered web link analysis available'
		};
	} catch (error) {
		return {
			available: false,
			status: 'error',
			message: 'Error checking web link analyzer',
			details: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

/**
 * Helper: Check if Python 3 is available
 */
async function checkPythonAvailable(): Promise<boolean> {
	const { exec } = require('child_process');
	return new Promise((resolve) => {
		exec('python3 --version', (error: Error | null) => {
			resolve(!error);
		});
	});
}

/**
 * Create the web link analyzer settings section
 */
export function createWebLinkAnalyzerSettingsSection(
	containerEl: HTMLElement,
	plugin: InterBrainPlugin,
	status: FeatureStatus | undefined,
	refreshDisplay: () => Promise<void>
): void {
	const header = containerEl.createEl('h2', { text: '🔗 Web Link Analyzer (AI-Powered)' });
	header.id = 'web-link-analyzer-section';

	if (status) {
		createStatusDisplay(containerEl, status);
	}

	// Enable/Disable Toggle
	new Setting(containerEl)
		.setName('Enable Web Link Analyzer')
		.setDesc('Analyze dropped web links with Claude AI to generate personalized summaries')
		.addToggle(toggle => toggle
			.setValue(plugin.settings.webLinkAnalyzerEnabled)
			.onChange(async (value) => {
				plugin.settings.webLinkAnalyzerEnabled = value;
				await plugin.saveSettings();

				// If enabled and not setup, trigger auto-setup
				if (value && !plugin.settings.webLinkAnalyzerSetupComplete) {
					// Check if API key is configured
					if (!plugin.settings.claudeApiKey) {
						window.alert('Please configure your Claude API key in the AI Integration section first.');
						plugin.settings.webLinkAnalyzerEnabled = false;
						await plugin.saveSettings();
						await refreshDisplay();
						return;
					}
					window.alert('Web Link Analyzer enabled! Setup will run automatically in the background.');
					runWebLinkAnalyzerSetup(plugin, refreshDisplay);
				}

				// Refresh display
				await refreshDisplay();
			}));

	// Feature description
	containerEl.createEl('p', {
		text: 'When enabled, dropping a web link creates a DreamNode with an AI-generated summary tailored to your profile from ~/.claude/CLAUDE.md.',
		cls: 'setting-item-description'
	});

	// Action buttons (only show if enabled)
	if (plugin.settings.webLinkAnalyzerEnabled) {
		const buttonSetting = new Setting(containerEl)
			.setName('Actions')
			.setDesc('Set up the Python environment for web link analysis');

		// Setup Environment button (if not ready)
		if (status?.status !== 'ready') {
			buttonSetting.addButton(button => button
				.setButtonText('Setup Environment')
				.onClick(async () => {
					const vaultPath = (plugin.app.vault.adapter as any).basePath;

					// Run setup script
					const { exec } = require('child_process');
					button.setButtonText('Setting up...');
					button.setDisabled(true);

					const pluginPath = `${vaultPath}/.obsidian/plugins/${plugin.manifest.id}`;
					exec(`cd "${pluginPath}/src/features/web-link-analyzer/scripts" && bash setup.sh`,
						(error: Error | null, stdout: string, stderr: string) => {
							if (error) {
								console.error('Setup error:', error);
								console.error('stderr:', stderr);
								window.alert(`Setup failed: ${error.message}\n\nCheck console for details.`);
								button.setButtonText('Setup Environment');
								button.setDisabled(false);
							} else {
								console.log('Setup output:', stdout);
								window.alert('Setup complete! Python environment and anthropic package are ready.');
								button.setButtonText('Setup Complete ✓');
								plugin.settings.webLinkAnalyzerSetupComplete = true;
								plugin.saveSettings();
								// Refresh status
								setTimeout(() => refreshDisplay(), 1000);
							}
						}
					);
				}));
		}

		// Installation instructions
		if (status?.status === 'not-installed') {
			// Python not installed - link to install script
			createInstallScriptLink(containerEl, 'Python');
		} else if (status?.status !== 'ready') {
			// Python installed but venv needs setup
			const installDiv = containerEl.createDiv({ cls: 'interbrain-install-instructions' });
			installDiv.createEl('p', { text: '📦 Setup requirements:' });
			const ol = installDiv.createEl('ol');
			ol.createEl('li', { text: 'Claude API key must be configured (in AI Integration section above)' });
			ol.createEl('li', { text: 'Click "Setup Environment" to create Python venv and install anthropic package' });
			ol.createEl('li', { text: 'Once complete, drop any web link into DreamSpace for AI analysis' });
		}
	}

	// Show what happens without the feature
	if (!plugin.settings.webLinkAnalyzerEnabled || status?.status !== 'ready') {
		containerEl.createEl('p', {
			text: '💡 Without this feature, dropped web links still create DreamNodes with basic metadata.',
			cls: 'setting-item-description'
		});
	}
}

/**
 * Create link to install script section
 */
function createInstallScriptLink(containerEl: HTMLElement, dependencyName: string): void {
	const linkDiv = containerEl.createDiv({ cls: 'interbrain-install-link' });
	linkDiv.style.marginTop = '12px';

	const linkText = linkDiv.createEl('p');
	linkText.createSpan({ text: '💡 ' });

	const link = linkText.createEl('a', {
		text: 'Re-run the install script',
		href: '#install-script-section'
	});
	link.addEventListener('click', (e) => {
		e.preventDefault();
		const section = document.getElementById('install-script-section');
		if (section) {
			section.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	});

	linkText.createSpan({ text: ` to set up ${dependencyName}.` });
}

/**
 * Run web link analyzer setup in background
 */
async function runWebLinkAnalyzerSetup(
	plugin: InterBrainPlugin,
	refreshDisplay: () => Promise<void>
): Promise<void> {
	const vaultPath = (plugin.app.vault.adapter as any).basePath;
	const pluginPath = `${vaultPath}/.obsidian/plugins/${plugin.manifest.id}`;
	const { exec } = require('child_process');

	console.log('🔗 Running web link analyzer auto-setup...');

	exec(`cd "${pluginPath}/src/features/web-link-analyzer/scripts" && bash setup.sh`,
		async (error: Error | null, stdout: string, stderr: string) => {
			if (error) {
				console.error('Web link analyzer setup error:', error);
				console.error('stderr:', stderr);
				console.log('Setup will retry on manual trigger');
			} else {
				console.log('✅ Web link analyzer setup complete!');
				console.log('Setup output:', stdout);
				plugin.settings.webLinkAnalyzerSetupComplete = true;
				await plugin.saveSettings();
				// Refresh status display
				await refreshDisplay();
			}
		}
	);
}

/**
 * Helper: Create status display for a feature
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
