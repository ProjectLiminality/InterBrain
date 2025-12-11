/**
 * Settings Status Service
 *
 * Centralized service for detecting the status of all InterBrain features.
 * Used by the settings panel to show comprehensive system status.
 */

import * as fs from 'fs';
import * as path from 'path';
import { App } from 'obsidian';
import type { OllamaEmbeddingService } from '../semantic-search/services/ollama-embedding-service';
import type { TranscriptionService } from '../realtime-transcription/services/transcription-service';
import type { RadicleService } from '../social-resonance-filter/radicle-service';

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

export class SettingsStatusService {
	constructor(
		private app: App,
		private pluginId: string,
		private ollamaService?: OllamaEmbeddingService,
		private transcriptionService?: TranscriptionService,
		private radicleService?: RadicleService
	) {}

	/**
	 * Get comprehensive status of all InterBrain features
	 */
	async getSystemStatus(claudeApiKey: string, radiclePassphrase?: string): Promise<SystemStatus> {
		const [semanticSearch, transcription, webLinkAnalyzer, radicle, github, claudeApi] = await Promise.all([
			this.checkSemanticSearch(),
			this.checkTranscription(),
			this.checkWebLinkAnalyzer(claudeApiKey),
			this.checkRadicle(radiclePassphrase),
			this.checkGitHub(),
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
	 * Check Semantic Search (Ollama) status
	 */
	private async checkSemanticSearch(): Promise<FeatureStatus> {
		if (!this.ollamaService) {
			return {
				available: false,
				status: 'error',
				message: 'Service not initialized',
				details: 'Ollama service not available'
			};
		}

		try {
			// Use getHealth() directly for detailed status
			const health = await (this.ollamaService as any).getHealth();

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
	 * Check Transcription (Whisper) status
	 */
	private async checkTranscription(): Promise<FeatureStatus> {
		if (!this.transcriptionService) {
			return {
				available: false,
				status: 'error',
				message: 'Service not initialized',
				details: 'Transcription service not available'
			};
		}

		try {
			const pythonAvailable = await this.transcriptionService.checkPythonAvailable();

			if (!pythonAvailable) {
				return {
					available: false,
					status: 'not-installed',
					message: 'Python not installed',
					details: 'Install Python 3 to use transcription features'
				};
			}

			// Check if venv exists
			const vaultPath = (this.app.vault.adapter as any).basePath;
			const pluginPath = path.join(vaultPath, '.obsidian', 'plugins', this.pluginId);
			const venvPath = path.join(pluginPath, 'src/features/realtime-transcription/scripts/venv');
			const venvExists = fs.existsSync(venvPath);

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
				message: 'Ready (Python + Whisper)',
				details: 'Real-time transcription available'
			};
		} catch (error) {
			return {
				available: false,
				status: 'error',
				message: 'Error checking transcription',
				details: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Check Web Link Analyzer status
	 */
	private async checkWebLinkAnalyzer(claudeApiKey: string): Promise<FeatureStatus> {
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
			const pythonAvailable = await this.checkPythonAvailable();
			if (!pythonAvailable) {
				return {
					available: false,
					status: 'not-installed',
					message: 'Python not installed',
					details: 'Install Python 3.9+ to use AI-powered link analysis'
				};
			}

			// Check if venv exists
			const vaultPath = (this.app.vault.adapter as any).basePath;
			const pluginPath = path.join(vaultPath, '.obsidian', 'plugins', this.pluginId);
			const venvPath = path.join(pluginPath, 'src/features/web-link-analyzer/scripts/venv');
			const venvExists = fs.existsSync(venvPath);

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
	private async checkPythonAvailable(): Promise<boolean> {
		const { exec } = require('child_process');
		return new Promise((resolve) => {
			exec('python3 --version', (error: Error | null) => {
				resolve(!error);
			});
		});
	}

	/**
	 * Check Radicle Network status
	 */
	private async checkRadicle(radiclePassphrase?: string): Promise<FeatureStatus> {
		if (!this.radicleService) {
			return {
				available: false,
				status: 'error',
				message: 'Service not initialized',
				details: 'Radicle service not available'
			};
		}

		try {
			const isAvailable = await this.radicleService.isAvailable();

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
				const identity = await this.radicleService.getIdentity();
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
	 * Check GitHub availability (always available if git exists)
	 */
	private async checkGitHub(): Promise<FeatureStatus> {
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
	 * Check Claude API configuration
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
