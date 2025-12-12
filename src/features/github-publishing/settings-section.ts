/**
 * GitHub Publishing Settings Section
 *
 * Feature-owned settings UI for publishing DreamSongs to GitHub Pages.
 * Mirrors DreamNode repos to GitHub and creates static DreamSong sites.
 */

import type InterBrainPlugin from '../../main';
import type { FeatureStatus } from '../settings/settings-status-service';
import { SettingsStatusService } from '../settings/settings-status-service';

interface GitHubIdentity {
	username: string;
	ghVersion: string;
}

/**
 * Get environment with extended PATH for gh CLI detection
 * Obsidian/Electron may not have the full shell PATH
 */
function getExtendedEnv(): Record<string, string> {
	const nodeProcess = (globalThis as any).process;
	const env = { ...nodeProcess?.env };

	// Add common gh install locations to PATH
	const extraPaths = [
		'/opt/homebrew/bin',      // macOS ARM Homebrew
		'/usr/local/bin',         // macOS Intel Homebrew / Linux
		'/usr/bin',               // System
		`${env.HOME}/.local/bin`, // Linux user installs
	].filter(Boolean);

	env.PATH = [...extraPaths, env.PATH].join(':');
	return env;
}

/**
 * Get GitHub identity (username and gh version)
 */
async function getGitHubIdentity(): Promise<GitHubIdentity | null> {
	const { exec } = require('child_process');
	const { promisify } = require('util');
	const execAsync = promisify(exec);
	const env = getExtendedEnv();

	try {
		// Get gh version
		const versionResult = await execAsync('gh --version', { env });
		const versionMatch = versionResult.stdout.match(/gh version ([\d.]+)/);
		const ghVersion = versionMatch ? versionMatch[1] : 'unknown';

		// Get authenticated username via gh api
		const userResult = await execAsync('gh api user --jq .login', { env });
		const username = userResult.stdout.trim();

		if (username) {
			return { username, ghVersion };
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Check GitHub feature status
 */
export async function checkGitHubStatus(): Promise<FeatureStatus> {
	const { exec } = require('child_process');
	const { promisify } = require('util');
	const execAsync = promisify(exec);
	const env = getExtendedEnv();

	try {
		// Step 1: Check if gh CLI is installed
		let ghVersion: string | null = null;
		try {
			const versionResult = await execAsync('gh --version', { env });
			const versionMatch = versionResult.stdout.match(/gh version ([\d.]+)/);
			ghVersion = versionMatch ? versionMatch[1] : 'installed';
		} catch {
			// gh not installed
			return {
				available: false,
				status: 'not-installed',
				message: 'GitHub CLI not installed',
				details: 'Re-run the install script to set up gh CLI'
			};
		}

		// Step 2: Check if authenticated
		try {
			const userResult = await execAsync('gh api user --jq .login', { env });
			const username = userResult.stdout.trim();

			if (username) {
				return {
					available: true,
					status: 'ready',
					message: `Ready (${username})`,
					details: `gh CLI v${ghVersion} • Authenticated as ${username}`
				};
			}
		} catch {
			// Not authenticated
			return {
				available: false,
				status: 'warning',
				message: 'Not authenticated',
				details: 'Run "gh auth login" to authenticate with GitHub'
			};
		}

		// gh installed but couldn't get user
		return {
			available: true,
			status: 'warning',
			message: 'gh CLI installed, auth status unknown',
			details: `gh CLI v${ghVersion}`
		};

	} catch (error) {
		return {
			available: false,
			status: 'error',
			message: 'Error checking GitHub CLI',
			details: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

/**
 * Create the GitHub publishing settings section
 */
export function createGitHubSettingsSection(
	containerEl: HTMLElement,
	_plugin: InterBrainPlugin,
	status: FeatureStatus | undefined
): void {
	const header = containerEl.createEl('h2', { text: '🧬 GitHub Publishing' });
	header.id = 'github-section';

	if (status) {
		createStatusDisplay(containerEl, status);
	}

	containerEl.createEl('p', {
		text: 'Publish DreamSongs as static GitHub Pages sites. Also mirrors DreamNode repositories to GitHub as open source.',
		cls: 'setting-item-description'
	});

	// Show GitHub identity if available
	if (status?.available && status.status === 'ready') {
		createGitHubIdentityDisplay(containerEl);
	}

	// Show install script link if not installed
	if (status?.status === 'not-installed') {
		createInstallScriptLink(containerEl);
	}
}

/**
 * Create GitHub identity display with copy button
 */
function createGitHubIdentityDisplay(containerEl: HTMLElement): void {
	// Create placeholder for identity (will be populated asynchronously)
	const identityPlaceholder = containerEl.createDiv({ cls: 'interbrain-github-identity-placeholder' });

	getGitHubIdentity().then((identity) => {
		if (identity) {
			identityPlaceholder.empty();
			identityPlaceholder.addClass('interbrain-github-identity');
			identityPlaceholder.removeClass('interbrain-github-identity-placeholder');

			identityPlaceholder.createEl('p', { text: 'Your GitHub Identity:' });

			const usernameContainer = identityPlaceholder.createDiv({ cls: 'github-username-container' });
			usernameContainer.style.display = 'flex';
			usernameContainer.style.alignItems = 'center';
			usernameContainer.style.gap = '8px';
			usernameContainer.style.marginTop = '8px';

			usernameContainer.createSpan({ text: 'Username: ' });
			usernameContainer.createEl('code', { text: identity.username });

			// Add copy button
			const copyButton = usernameContainer.createEl('button', {
				text: '📋 Copy',
				cls: 'github-copy-button'
			});
			copyButton.addEventListener('click', () => {
				navigator.clipboard.writeText(identity.username).then(() => {
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

			// Show gh version
			const versionText = identityPlaceholder.createEl('p', {
				cls: 'setting-item-description'
			});
			versionText.style.marginTop = '4px';
			versionText.style.fontSize = '12px';
			versionText.textContent = `gh CLI version ${identity.ghVersion}`;
		}
	}).catch(() => {
		// Identity not available, remove placeholder
		identityPlaceholder.remove();
	});
}

/**
 * Create link to install script section
 */
function createInstallScriptLink(containerEl: HTMLElement): void {
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

	linkText.createSpan({ text: ' to set up the GitHub CLI.' });
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
