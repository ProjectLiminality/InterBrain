/**
 * Semantic Search Settings Section
 *
 * Feature-owned settings UI for Ollama-based semantic search.
 * Rendered within the main settings panel.
 */

import { Setting } from 'obsidian';
import type InterBrainPlugin from '../../main';
import type { FeatureStatus } from '../settings/settings-status-service';
import { SettingsStatusService } from '../settings/settings-status-service';
import { ollamaEmbeddingService } from './services/ollama-embedding-service';

/**
 * Check semantic search feature status
 */
export async function checkSemanticSearchStatus(): Promise<FeatureStatus> {
	if (!ollamaEmbeddingService) {
		return {
			available: false,
			status: 'error',
			message: 'Service not initialized',
			details: 'Ollama service not available'
		};
	}

	try {
		// Use getHealth() directly for detailed status
		const health = await (ollamaEmbeddingService as any).getHealth();

		if (!health.isAvailable) {
			return {
				available: false,
				status: 'not-installed',
				message: 'Ollama not running',
				details: health.error || 'Install from https://ollama.ai then run: ollama pull nomic-embed-text'
			};
		}

		// Ollama is running, check if model is loaded
		if (health.modelLoaded) {
			return {
				available: true,
				status: 'ready',
				message: 'Ready (nomic-embed-text, 768 dimensions)',
				details: 'Semantic search fully operational'
			};
		} else {
			return {
				available: false,
				status: 'warning',
				message: 'Ollama running, model not loaded',
				details: 'Run: ollama pull nomic-embed-text'
			};
		}
	} catch (error) {
		return {
			available: false,
			status: 'error',
			message: 'Error checking Ollama',
			details: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

/**
 * Create the semantic search settings section
 */
export function createSemanticSearchSettingsSection(
	containerEl: HTMLElement,
	plugin: InterBrainPlugin,
	status: FeatureStatus | undefined
): void {
	const header = containerEl.createEl('h2', { text: '🔍 Semantic Search (Ollama)' });
	header.id = 'semantic-search-section';

	if (status) {
		createStatusDisplay(containerEl, status);
	}

	// Action buttons
	const buttonSetting = new Setting(containerEl)
		.setName('Actions')
		.setDesc('Check status and manage semantic search features');

	buttonSetting.addButton(button => button
		.setButtonText('Check Status')
		.onClick(() => {
			plugin.app.commands.executeCommandById('interbrain:ollama-check-status');
		}));

	buttonSetting.addButton(button => button
		.setButtonText('Run Diagnostics')
		.onClick(() => {
			plugin.app.commands.executeCommandById('interbrain:ollama-run-diagnostics');
		}));

	buttonSetting.addButton(button => button
		.setButtonText('Reindex All')
		.onClick(() => {
			plugin.app.commands.executeCommandById('interbrain:index-all-nodes');
		}));

	// Installation instructions - link to install script section
	if (status?.status === 'not-installed') {
		createInstallScriptLink(containerEl, 'Ollama');
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
