/**
 * Radicle Network Settings Section
 *
 * Feature-owned settings UI for Radicle P2P network configuration.
 * Rendered within the main settings panel.
 */

import { Setting } from 'obsidian';
import type InterBrainPlugin from '../../main';
import type { FeatureStatus } from '../settings/settings-status-service';
import { SettingsStatusService } from '../settings/settings-status-service';
import { serviceManager } from '../../core/services/service-manager';

/**
 * Check Radicle network feature status
 */
export async function checkRadicleStatus(radiclePassphrase?: string): Promise<FeatureStatus> {
	const radicleService = serviceManager.getRadicleService();

	if (!radicleService) {
		return {
			available: false,
			status: 'error',
			message: 'Service not initialized',
			details: 'Radicle service not available'
		};
	}

	try {
		const isAvailable = await radicleService.isAvailable();

		if (!isAvailable) {
			const platform = (window as any).process?.platform || 'unknown';
			const isWindows = platform === 'win32';

			return {
				available: false,
				status: 'not-installed',
				message: isWindows ? 'Not available on Windows' : 'Radicle not installed',
				details: isWindows
					? 'Radicle is only supported on macOS and Linux'
					: 'Install from https://radicle.xyz'
			};
		}

		// Check if identity exists
		try {
			const identity = await radicleService.getIdentity();
			if (identity) {
				// Identity exists - now check if passphrase is configured
				if (!radiclePassphrase || radiclePassphrase.trim() === '') {
					return {
						available: true,
						status: 'warning',
						message: 'Passphrase not configured',
						details: 'Enter your Radicle passphrase below to enable automatic node startup'
					};
				}

				return {
					available: true,
					status: 'ready',
					message: `Ready (${identity.alias || 'Identity created'})`,
					details: `DID: ${identity.did}`
				};
			}
		} catch {
			// Identity not created yet
			return {
				available: false,
				status: 'warning',
				message: 'Radicle installed, identity needed',
				details: 'Run: rad auth to create your identity'
			};
		}

		return {
			available: true,
			status: 'ready',
			message: 'Radicle CLI installed',
			details: 'Peer-to-peer sharing available'
		};
	} catch (error) {
		return {
			available: false,
			status: 'error',
			message: 'Error checking Radicle',
			details: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

/**
 * Create the Radicle network settings section
 */
export function createRadicleSettingsSection(
	containerEl: HTMLElement,
	plugin: InterBrainPlugin,
	status: FeatureStatus | undefined,
	_refreshDisplay: () => Promise<void>
): void {
	const header = containerEl.createEl('h2', { text: '🌐 Radicle Peer-to-Peer Network' });
	header.id = 'radicle-section';

	if (status) {
		createStatusDisplay(containerEl, status);
	}

	const radicleService = serviceManager.getRadicleService();

	// Create placeholder for identity (will be populated asynchronously)
	const identityPlaceholder = containerEl.createDiv({ cls: 'interbrain-radicle-identity-placeholder' });

	// Show identity if available
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
					createAliasEditor(identityPlaceholder, identity, radicleService);
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
	updateNodeStatus(nodeStatusDiv, radicleService);

	// Passphrase setting with validation
	new Setting(containerEl)
		.setName('Radicle Passphrase')
		.setDesc('Enables automatic node startup for seamless DreamNode sharing')
		.addText(text => {
			text
				.setPlaceholder('Enter passphrase...')
				.setValue(plugin.settings.radiclePassphrase)
				.onChange(async (value) => {
					plugin.settings.radiclePassphrase = value;
					await plugin.saveSettings();
					// Clear validation state when passphrase changes
					const validationEl = document.getElementById('passphrase-validation');
					if (validationEl) {
						validationEl.textContent = '';
					}
				});
			text.inputEl.type = 'password';
			return text;
		})
		.addButton(button => button
			.setButtonText('Test Passphrase')
			.setTooltip('Validate passphrase by starting the node')
			.onClick(async () => {
				await testRadiclePassphrase(plugin, radicleService, nodeStatusDiv);
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
			.setValue(plugin.settings.userEmail)
			.onChange(async (value) => {
				plugin.settings.userEmail = value;
				await plugin.saveSettings();
			}));

	// Node control buttons
	new Setting(containerEl)
		.setName('Node Control')
		.setDesc('Manually start or stop the Radicle node')
		.addButton(button => button
			.setButtonText('Start Node')
			.onClick(async () => {
				await startRadicleNode(plugin, radicleService, nodeStatusDiv);
			}))
		.addButton(button => button
			.setButtonText('Stop Node')
			.onClick(async () => {
				await stopRadicleNode(radicleService, nodeStatusDiv);
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
 * Create alias editor UI
 */
function createAliasEditor(container: HTMLElement, identity: any, _radicleService: any): void {
	const aliasContainer = container.createDiv({ cls: 'alias-container' });
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
				const { Notice } = await import('obsidian');
				new Notice('Alias cannot be empty');
				return;
			}

			try {
				saveButton.disabled = true;
				saveButton.textContent = '⏳ Saving...';

				const { exec } = require('child_process');
				const { promisify } = require('util');
				const execAsync = promisify(exec);
				const fs = require('fs').promises;

				// Use 'rad' command directly - Radicle should be in PATH
				const radCmd = 'rad';

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
				const { Notice } = await import('obsidian');
				new Notice(`Failed to update alias: ${error.message}`);
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

/**
 * Update Radicle node status display
 */
async function updateNodeStatus(containerEl: HTMLElement, radicleService: any): Promise<void> {
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
async function testRadiclePassphrase(
	plugin: InterBrainPlugin,
	radicleService: any,
	nodeStatusDiv: HTMLElement
): Promise<void> {
	const validationEl = document.getElementById('passphrase-validation');
	if (!validationEl) return;

	const passphrase = plugin.settings.radiclePassphrase;
	if (!passphrase || passphrase.trim() === '') {
		validationEl.innerHTML = '<span class="status-error">❌ Please enter a passphrase first</span>';
		return;
	}

	validationEl.innerHTML = '<span class="status-info">⏳ Testing passphrase...</span>';

	try {
		const { exec } = require('child_process');
		const { promisify } = require('util');
		const execAsync = promisify(exec);

		const nodeProcess = (globalThis as any).process;
		const env = { ...nodeProcess?.env, RAD_PASSPHRASE: passphrase };

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
			} catch {
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
			await updateNodeStatus(nodeStatusDiv, radicleService);
		} else {
			validationEl.innerHTML = '<span class="status-warning">⚠️ Node start command succeeded but status check failed. Check console.</span>';
			await updateNodeStatus(nodeStatusDiv, radicleService);
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
async function startRadicleNode(
	plugin: InterBrainPlugin,
	radicleService: any,
	nodeStatusDiv: HTMLElement
): Promise<void> {
	const validationEl = document.getElementById('passphrase-validation');
	if (!validationEl) return;

	const passphrase = plugin.settings.radiclePassphrase;
	if (!passphrase || passphrase.trim() === '') {
		validationEl.innerHTML = '<span class="status-error">❌ Please configure passphrase first</span>';
		return;
	}

	validationEl.innerHTML = '<span class="status-info">⏳ Starting node...</span>';

	try {
		const { exec } = require('child_process');
		const { promisify } = require('util');
		const execAsync = promisify(exec);

		const nodeProcess = (globalThis as any).process;
		const env = { ...nodeProcess?.env, RAD_PASSPHRASE: passphrase };

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
		await updateNodeStatus(nodeStatusDiv, radicleService);
	} catch (error: any) {
		const errorMsg = error.message || error.stdout || error.stderr || 'Unknown error';
		if (errorMsg.includes('already running') || errorMsg.includes('Already running')) {
			validationEl.innerHTML = '<span class="status-ready">✅ Node already running</span>';
			await updateNodeStatus(nodeStatusDiv, radicleService);
		} else {
			validationEl.innerHTML = `<span class="status-error">❌ Failed to start: ${errorMsg}</span>`;
		}
	}
}

/**
 * Stop Radicle node
 */
async function stopRadicleNode(radicleService: any, nodeStatusDiv: HTMLElement): Promise<void> {
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
		await updateNodeStatus(nodeStatusDiv, radicleService);
	} catch (error: any) {
		validationEl.innerHTML = `<span class="status-error">❌ Failed to stop: ${error.message}</span>`;
	}
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
