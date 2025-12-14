/**
 * Settings Status Service
 *
 * Aggregates status from feature-owned status checkers.
 * No longer has direct fs access - delegates to feature services.
 */

import { checkSemanticSearchStatus } from '../semantic-search/settings-section';
import { checkTranscriptionStatus } from '../realtime-transcription/settings-section';
import { checkWebLinkAnalyzerStatus } from '../web-link-analyzer/settings-section';
import { checkRadicleStatus } from '../social-resonance-filter/settings-section';
import { checkGitHubStatus } from '../github-publishing/settings-section';

export interface FeatureStatus {
	available: boolean;
	status: 'ready' | 'warning' | 'error' | 'not-installed';
	message: string;
	details?: string;
}

export interface SystemStatus {
	semanticSearch: FeatureStatus;
	transcription: FeatureStatus;
	webLinkAnalyzer: FeatureStatus;
	radicle: FeatureStatus;
	github: FeatureStatus;
	claudeApi: FeatureStatus;
}

// Singleton instance for runtime access
let cachedSettings: { claudeApiKey: string; radiclePassphrase: string } | null = null;

export class SettingsStatusService {
	/**
	 * Store settings for runtime access by other services
	 */
	static setSettings(settings: { claudeApiKey: string; radiclePassphrase: string }): void {
		cachedSettings = settings;
	}

	/**
	 * Get cached settings (for services that need API key)
	 */
	getSettings(): { claudeApiKey: string; radiclePassphrase: string } | null {
		return cachedSettings;
	}

	/**
	 * Get comprehensive status of all InterBrain features
	 * Delegates to feature-owned status checkers
	 */
	async getSystemStatus(claudeApiKey: string, radiclePassphrase?: string): Promise<SystemStatus> {
		const [semanticSearch, transcription, webLinkAnalyzer, radicle, github, claudeApi] = await Promise.all([
			checkSemanticSearchStatus(),
			checkTranscriptionStatus(),
			checkWebLinkAnalyzerStatus(claudeApiKey),
			checkRadicleStatus(radiclePassphrase),
			checkGitHubStatus(),
			this.checkClaudeApi(claudeApiKey)
		]);

		return {
			semanticSearch,
			transcription,
			webLinkAnalyzer,
			radicle,
			github,
			claudeApi
		};
	}

	/**
	 * Check Claude API configuration (stays here as it's a global setting)
	 */
	private async checkClaudeApi(apiKey: string): Promise<FeatureStatus> {
		if (!apiKey || apiKey.trim() === '') {
			return {
				available: false,
				status: 'warning',
				message: 'API key not configured',
				details: 'Add your Anthropic API key to enable AI features'
			};
		}

		// Basic validation: should start with sk-ant-
		if (!apiKey.startsWith('sk-ant-')) {
			return {
				available: false,
				status: 'error',
				message: 'Invalid API key format',
				details: 'Anthropic API keys should start with sk-ant-'
			};
		}

		return {
			available: true,
			status: 'ready',
			message: 'API key configured',
			details: 'Conversation summaries and analysis enabled'
		};
	}

	/**
	 * Get status icon emoji for display
	 */
	static getStatusIcon(status: FeatureStatus['status']): string {
		switch (status) {
			case 'ready': return '✅';
			case 'warning': return '⚠️';
			case 'error': return '❌';
			case 'not-installed': return '❌';
			default: return 'ℹ️';
		}
	}

	/**
	 * Get status color class for CSS styling
	 */
	static getStatusColor(status: FeatureStatus['status']): string {
		switch (status) {
			case 'ready': return 'status-ready';
			case 'warning': return 'status-warning';
			case 'error': return 'status-error';
			case 'not-installed': return 'status-not-installed';
			default: return 'status-unknown';
		}
	}
}

// Singleton export for services that need settings access
export const settingsStatusService = new SettingsStatusService();
