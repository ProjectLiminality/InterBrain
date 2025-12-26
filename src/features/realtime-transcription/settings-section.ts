/**
 * Transcription Settings Section
 *
 * Feature-owned settings UI for real-time transcription configuration.
 * Rendered within the main settings panel.
 */

import { Setting } from 'obsidian';
import type InterBrainPlugin from '../../main';
import type { FeatureStatus } from '../settings/settings-status-service';
import { SettingsStatusService } from '../settings/settings-status-service';
import { getRealtimeTranscriptionService } from './services/transcription-service';

/**
 * Check transcription feature status
 */
export async function checkTranscriptionStatus(): Promise<FeatureStatus> {
	try {
		const transcriptionService = getRealtimeTranscriptionService();

		const pythonAvailable = await transcriptionService.checkPythonAvailable();

		if (!pythonAvailable) {
			return {
				available: false,
				status: 'not-installed',
				message: 'Python not installed',
				details: 'Install Python 3 to use transcription features'
			};
		}

		// Check if venv exists using the service method
		const venvExists = transcriptionService.checkVenvExists();

		if (!venvExists) {
			return {
				available: false,
				status: 'warning',
				message: 'Python installed, environment needs setup',
				details: 'Click "Setup Environment" button below to initialize'
			};
		}

		// Check if dependencies are actually installed in the venv
		const depsInstalled = await transcriptionService.checkDependenciesInstalled();

		if (!depsInstalled) {
			return {
				available: false,
				status: 'warning',
				message: 'Dependencies missing in environment',
				details: 'Click "Setup Environment" to install required packages'
			};
		}

		return {
			available: true,
			status: 'ready',
			message: 'Ready (Python + Whisper)',
			details: 'Real-time transcription available'
		};
	} catch {
		// Service not initialized or other error - fall back to direct checks
		const venvExists = checkVenvExistsFallback();
		const pythonAvailable = await checkPythonAvailableFallback();
		const depsInstalled = await checkDependenciesInstalledFallback();

		if (!pythonAvailable) {
			return {
				available: false,
				status: 'not-installed',
				message: 'Python not installed',
				details: 'Install Python 3 to use transcription features'
			};
		}

		if (!venvExists) {
			return {
				available: false,
				status: 'warning',
				message: 'Python installed, environment needs setup',
				details: 'Click "Setup Environment" button below to initialize'
			};
		}

		if (!depsInstalled) {
			return {
				available: false,
				status: 'warning',
				message: 'Dependencies missing in environment',
				details: 'Click "Setup Environment" to install required packages'
			};
		}

		return {
			available: true,
			status: 'ready',
			message: 'Ready (Python + Whisper)',
			details: 'Real-time transcription available'
		};
	}
}

/**
 * Fallback venv check when service not initialized
 */
function checkVenvExistsFallback(): boolean {
	try {
		const path = require('path');
		const fs = require('fs');

		const vaultPath = (globalThis as any).app?.vault?.adapter?.basePath;
		if (!vaultPath) return false;

		const pluginDir = path.join(vaultPath, '.obsidian', 'plugins', 'interbrain');

		// Try direct path first
		const scriptsDir = path.join(pluginDir, 'src', 'features', 'realtime-transcription', 'scripts');
		const isWindows = (globalThis as any).process?.platform === 'win32';
		const venvPython = isWindows
			? path.join(scriptsDir, 'venv', 'Scripts', 'python.exe')
			: path.join(scriptsDir, 'venv', 'bin', 'python3');

		if (fs.existsSync(venvPython)) {
			return true;
		}

		// Try with symlink resolution
		try {
			const realPluginDir = fs.realpathSync(pluginDir);
			const realScriptsDir = path.join(realPluginDir, 'src', 'features', 'realtime-transcription', 'scripts');
			const realVenvPython = isWindows
				? path.join(realScriptsDir, 'venv', 'Scripts', 'python.exe')
				: path.join(realScriptsDir, 'venv', 'bin', 'python3');

			return fs.existsSync(realVenvPython);
		} catch {
			return false;
		}
	} catch {
		return false;
	}
}

/**
 * Fallback Python check when service not initialized
 */
async function checkPythonAvailableFallback(): Promise<boolean> {
	const { exec } = require('child_process');
	const isWindows = (globalThis as any).process?.platform === 'win32';
	const pythonCmd = isWindows ? 'python' : 'python3';

	return new Promise((resolve) => {
		exec(`${pythonCmd} --version`, (error: Error | null) => {
			resolve(!error);
		});
	});
}

/**
 * Fallback dependency check when service not initialized
 * Tries to import RealtimeSTT using the venv Python
 */
async function checkDependenciesInstalledFallback(): Promise<boolean> {
	const path = require('path');
	const fs = require('fs');
	const { exec } = require('child_process');

	try {
		const vaultPath = (globalThis as any).app?.vault?.adapter?.basePath;
		if (!vaultPath) return false;

		const pluginDir = path.join(vaultPath, '.obsidian', 'plugins', 'interbrain');
		const isWindows = (globalThis as any).process?.platform === 'win32';

		// Try to get venv Python path
		let venvPython: string;
		try {
			const realPluginDir = fs.realpathSync(pluginDir);
			const scriptsDir = path.join(realPluginDir, 'src', 'features', 'realtime-transcription', 'scripts');
			venvPython = isWindows
				? path.join(scriptsDir, 'venv', 'Scripts', 'python.exe')
				: path.join(scriptsDir, 'venv', 'bin', 'python3');

			if (!fs.existsSync(venvPython)) {
				return false;
			}
		} catch {
			return false;
		}

		return new Promise((resolve) => {
			exec(`"${venvPython}" -c "import RealtimeSTT"`, (error: Error | null) => {
				resolve(!error);
			});
		});
	} catch {
		return false;
	}
}

/**
 * Create the transcription settings section
 */
export function createTranscriptionSettingsSection(
	containerEl: HTMLElement,
	plugin: InterBrainPlugin,
	status: FeatureStatus | undefined,
	refreshDisplay: () => Promise<void>
): void {
	const header = containerEl.createEl('h2', { text: '🎙️ Real-Time Transcription (Whisper)' });
	header.id = 'transcription-section';

	if (status) {
		createStatusDisplay(containerEl, status);
	}

	// Enable/Disable Toggle
	new Setting(containerEl)
		.setName('Enable Transcription')
		.setDesc('Automatically set up and enable real-time transcription features')
		.addToggle(toggle => toggle
			.setValue(plugin.settings.transcriptionEnabled)
			.onChange(async (value) => {
				plugin.settings.transcriptionEnabled = value;
				await plugin.saveSettings();

				// If enabled and not setup, trigger auto-setup
				if (value && !plugin.settings.transcriptionSetupComplete) {
					window.alert('Transcription enabled! Setup will run automatically in the background.');
					runTranscriptionSetup(plugin, refreshDisplay);
				}

				// Refresh display
				await refreshDisplay();
			}));

	// Model info
	containerEl.createEl('p', {
		text: 'Transcription uses OpenAI Whisper for real-time speech-to-text. Setup runs automatically on first launch.',
		cls: 'setting-item-description'
	});

	// Action buttons (only show if enabled)
	if (plugin.settings.transcriptionEnabled) {
		const buttonSetting = new Setting(containerEl)
			.setName('Actions')
			.setDesc('Set up transcription environment and manage features');

		// Setup Environment button (if not ready)
		if (status?.status !== 'ready') {
			buttonSetting.addButton(button => button
				.setButtonText('Setup Environment')
				.onClick(async () => {
					const vaultPath = (plugin.app.vault.adapter as any).basePath;
					const pluginPath = `${vaultPath}/.obsidian/plugins/${plugin.manifest.id}`;

					// Run setup script
					const { exec } = require('child_process');
					button.setButtonText('Setting up...');
					button.setDisabled(true);

					exec(`cd "${pluginPath}/src/features/realtime-transcription/scripts" && bash setup.sh`,
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
								setTimeout(() => refreshDisplay(), 1000);
							}
						}
					);
				}));
		}

		// Start Transcription button (always available)
		buttonSetting.addButton(button => button
			.setButtonText('Start Transcription')
			.onClick(() => {
				plugin.app.commands.executeCommandById('interbrain:start-realtime-transcription');
			}));

		// Installation instructions
		if (status?.status === 'not-installed') {
			// Python not installed - link to install script
			createInstallScriptLink(containerEl, 'Python');
		} else if (status?.status !== 'ready') {
			// Python installed but venv needs setup
			const installDiv = containerEl.createDiv({ cls: 'interbrain-install-instructions' });
			installDiv.createEl('p', { text: '📦 Automatic setup:' });
			const ol = installDiv.createEl('ol');
			ol.createEl('li', { text: 'Click "Setup Environment" button above to run setup' });
			ol.createEl('li', { text: 'Setup creates venv and downloads Whisper model (1-2 minutes)' });
			ol.createEl('li', { text: 'Once complete, use "Start Transcription" anytime' });
		}
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
 * Run transcription setup in background
 */
async function runTranscriptionSetup(
	plugin: InterBrainPlugin,
	refreshDisplay: () => Promise<void>
): Promise<void> {
	const vaultPath = (plugin.app.vault.adapter as any).basePath;
	const pluginPath = `${vaultPath}/.obsidian/plugins/${plugin.manifest.id}`;
	const { exec } = require('child_process');

	console.log('🎙️ Running transcription auto-setup...');

	exec(`cd "${pluginPath}/src/features/realtime-transcription/scripts" && bash setup.sh`,
		async (error: Error | null, stdout: string, stderr: string) => {
			if (error) {
				console.error('Transcription setup error:', error);
				console.error('stderr:', stderr);
				console.log('Setup will retry on manual trigger or transcription start');
			} else {
				console.log('✅ Transcription setup complete!');
				console.log('Setup output:', stdout);
				plugin.settings.transcriptionSetupComplete = true;
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
