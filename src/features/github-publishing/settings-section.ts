/**
 * GitHub Sharing Settings Section
 *
 * Feature-owned settings UI for GitHub-based sharing (fallback when Radicle unavailable).
 * Rendered within the main settings panel.
 */

import type InterBrainPlugin from '../../main';
import type { FeatureStatus } from '../settings/settings-status-service';
import { SettingsStatusService } from '../settings/settings-status-service';

/**
 * Check GitHub feature status
 */
export async function checkGitHubStatus(): Promise<FeatureStatus> {
	try {
		// Simple check: git command exists
		const { exec } = require('child_process');
		return new Promise((resolve) => {
			exec('git --version', (error: Error | null) => {
				if (error) {
					resolve({
						available: false,
						status: 'not-installed',
						message: 'Git not installed',
						details: 'Install Git to use GitHub sharing'
					});
				} else {
					resolve({
						available: true,
						status: 'ready',
						message: 'Available (git detected)',
						details: 'Used as fallback when Radicle unavailable'
					});
				}
			});
		});
	} catch (error) {
		return {
			available: false,
			status: 'error',
			message: 'Error checking Git',
			details: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

/**
 * Create the GitHub sharing settings section
 */
export function createGitHubSettingsSection(
	containerEl: HTMLElement,
	_plugin: InterBrainPlugin,
	status: FeatureStatus | undefined
): void {
	const header = containerEl.createEl('h2', { text: '📤 GitHub Sharing (Fallback)' });
	header.id = 'github-section';

	if (status) {
		createStatusDisplay(containerEl, status);
	}

	containerEl.createEl('p', {
		text: 'GitHub is used automatically when Radicle is unavailable or on Windows. Creates GitHub repositories and GitHub Pages sites for DreamNodes.',
		cls: 'setting-item-description'
	});
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
