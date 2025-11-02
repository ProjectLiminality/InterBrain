/**
 * Settings Status Service
 *
 * Centralized service for detecting the status of all InterBrain features.
 * Used by the settings panel to show comprehensive system status.
 */

import * as fs from 'fs';
import * as path from 'path';
import { App } from 'obsidian';
import type { OllamaEmbeddingService } from '../features/semantic-search/services/ollama-embedding-service';
import type { TranscriptionService } from '../features/realtime-transcription/services/transcription-service';
import type { RadicleService } from './radicle-service';

export interface FeatureStatus {
	available: boolean;
	status: 'ready' | 'warning' | 'error' | 'not-installed';
	message: string;
	details?: string;
}

export interface SystemStatus {
	semanticSearch: FeatureStatus;
	transcription: FeatureStatus;
	radicle: FeatureStatus;
	github: FeatureStatus;
	claudeApi: FeatureStatus;
}

export class SettingsStatusService {
	constructor(
		private app: App,
		private ollamaService?: OllamaEmbeddingService,
		private transcriptionService?: TranscriptionService,
		private radicleService?: RadicleService
	) {}

	/**
	 * Get comprehensive status of all InterBrain features
	 */
	async getSystemStatus(claudeApiKey: string): Promise<SystemStatus> {
		const [semanticSearch, transcription, radicle, github, claudeApi] = await Promise.all([
			this.checkSemanticSearch(),
			this.checkTranscription(),
			this.checkRadicle(),
			this.checkGitHub(),
			this.checkClaudeApi(claudeApiKey)
		]);

		return {
			semanticSearch,
			transcription,
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
			const isAvailable = await this.ollamaService.isAvailable();

			if (!isAvailable) {
				return {
					available: false,
					status: 'not-installed',
					message: 'Ollama not installed',
					details: 'Install from https://ollama.ai then run: ollama pull nomic-embed-text'
				};
			}

			// Check if model is loaded
			const health = await (this.ollamaService as any).getHealth?.();
			const modelLoaded = health?.modelLoaded ?? true; // Assume loaded if no health check

			if (modelLoaded) {
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
			const venvPath = path.join(vaultPath, 'InterBrain/src/features/realtime-transcription/scripts/venv');
			const venvExists = fs.existsSync(venvPath);

			if (!venvExists) {
				return {
					available: false,
					status: 'warning',
					message: 'Python installed, environment needs setup',
					details: 'Run: cd scripts && ./setup.sh'
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
	 * Check Radicle Network status
	 */
	private async checkRadicle(): Promise<FeatureStatus> {
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
