import type { ChildProcess } from 'child_process';
import type InterBrainPlugin from '../../../main';
import { UIService } from '../../../core/services/ui-service';
import type { ITranscriptionService, TranscriptionConfig } from '../types/transcription-types';

/**
 * Callback type for real-time search text updates
 * Called with stabilized text suitable for semantic search
 */
export type SearchTextCallback = (text: string) => void;

/**
 * Callback type for final transcript updates
 * Called with timestamped text for the final transcript
 */
export type TranscriptCallback = (timestampedText: string) => void;

/**
 * Service for managing real-time transcription processes
 *
 * Dual-stream architecture:
 * - SEARCH stream: Real-time stabilized text for semantic search (low latency)
 * - TRANSCRIPT stream: Final accurate text for transcript file (high quality)
 */
export class TranscriptionService implements ITranscriptionService {
	private plugin: InterBrainPlugin;
	private uiService: UIService;
	private currentProcess: ChildProcess | null = null;
	private currentOutputPath: string | null = null;
	private sessionStartTime: number | null = null; // Unix timestamp in seconds

	// Callbacks for dual-stream output
	private searchTextCallback: SearchTextCallback | null = null;
	private transcriptCallback: TranscriptCallback | null = null;

	constructor(plugin: InterBrainPlugin) {
		this.plugin = plugin;
		this.uiService = new UIService(plugin.app);
	}

	/**
	 * Get the path to the Python transcription script
	 */
	getScriptPath(): string {
		const path = require('path');
		const fs = require('fs');

		// Use app.vault.adapter to get the vault's base path
		const vaultPath = (this.plugin.app.vault.adapter as any).basePath;

		// Plugin is installed at vault/.obsidian/plugins/interbrain
		const pluginDir = path.join(vaultPath, '.obsidian', 'plugins', 'interbrain');

		// Resolve symlinks to get the actual source directory
		const realPluginDir = fs.realpathSync(pluginDir);

		const scriptPath = path.join(
			realPluginDir,
			'src',
			'features',
			'realtime-transcription',
			'scripts',
			'interbrain-transcribe.py'
		);

		console.log('[Transcription] Script path resolved:', scriptPath);
		return scriptPath;
	}

	/**
	 * Get the path to the virtual environment Python executable
	 * Returns venv python if it exists, otherwise null
	 */
	private getVenvPython(): string | null {
		const path = require('path');
		const fs = require('fs');

		try {
			// Use app.vault.adapter to get the vault's base path
			const vaultPath = (this.plugin.app.vault.adapter as any).basePath;

			// Plugin is installed at vault/.obsidian/plugins/interbrain
			const pluginDir = path.join(vaultPath, '.obsidian', 'plugins', 'interbrain');

			// Resolve symlinks to get the actual source directory
			const realPluginDir = fs.realpathSync(pluginDir);

			const scriptsDir = path.join(
				realPluginDir,
				'src',
				'features',
				'realtime-transcription',
				'scripts'
			);

			// eslint-disable-next-line no-undef
			if (process.platform === 'win32') {
				const venvPython = path.join(scriptsDir, 'venv', 'Scripts', 'python.exe');
				if (fs.existsSync(venvPython)) {
					console.log('[Transcription] Found venv Python (Windows):', venvPython);
					return venvPython;
				}
			} else {
				const venvPython = path.join(scriptsDir, 'venv', 'bin', 'python3');
				if (fs.existsSync(venvPython)) {
					console.log('[Transcription] Found venv Python (Unix):', venvPython);
					return venvPython;
				}
			}
		} catch (error) {
			console.warn('[Transcription] Error checking for venv:', error);
		}
		return null;
	}

	/**
	 * Check if venv exists for transcription (used by settings status)
	 */
	checkVenvExists(): boolean {
		const path = require('path');
		const fs = require('fs');

		try {
			const vaultPath = (this.plugin.app.vault.adapter as any).basePath;
			const pluginDir = path.join(vaultPath, '.obsidian', 'plugins', 'interbrain');
			const realPluginDir = fs.realpathSync(pluginDir);

			const scriptsDir = path.join(
				realPluginDir,
				'src',
				'features',
				'realtime-transcription',
				'scripts'
			);

			// eslint-disable-next-line no-undef
			const venvPath = process.platform === 'win32'
				? path.join(scriptsDir, 'venv', 'Scripts', 'python.exe')
				: path.join(scriptsDir, 'venv', 'bin', 'python3');

			return fs.existsSync(venvPath);
		} catch {
			return false;
		}
	}

	/**
	 * Check if required Python dependencies are installed in venv
	 * Returns true only if RealtimeSTT is importable
	 */
	async checkDependenciesInstalled(): Promise<boolean> {
		const venvPython = this.getVenvPython();
		if (!venvPython) {
			return false;
		}

		return new Promise((resolve) => {
			try {
				const { exec } = require('child_process');
				// Try to import RealtimeSTT - this is the core dependency
				exec(`"${venvPython}" -c "import RealtimeSTT"`, (error: Error | null) => {
					resolve(!error);
				});
			} catch {
				resolve(false);
			}
		});
	}

	/**
	 * Check if Python 3 is available on the system
	 */
	async checkPythonAvailable(): Promise<boolean> {
		return new Promise((resolve) => {
			try {
				const { exec } = require('child_process');
				// eslint-disable-next-line no-undef
				const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
				exec(`${pythonCommand} --version`, (error: Error | null) => {
					resolve(!error);
				});
			} catch {
				resolve(false);
			}
		});
	}

	/**
	 * Check if transcription is currently running
	 */
	isRunning(): boolean {
		return this.currentProcess !== null && this.currentProcess.exitCode === null;
	}

	/**
	 * Set callback for real-time search text updates
	 * The callback receives stabilized text suitable for semantic search
	 */
	setSearchTextCallback(callback: SearchTextCallback | null): void {
		this.searchTextCallback = callback;
	}

	/**
	 * Set callback for final transcript updates
	 * The callback receives timestamped text for the transcript
	 */
	setTranscriptCallback(callback: TranscriptCallback | null): void {
		this.transcriptCallback = callback;
	}

	/**
	 * Start transcription to the specified markdown file
	 */
	async startTranscription(
		outputPath: string,
		config: Partial<TranscriptionConfig> = {}
	): Promise<void> {
		// Check if already running
		if (this.isRunning()) {
			console.warn('[Transcription] Already running - ignoring start request');
			this.uiService.showWarning('Transcription already running');
			return;
		}

		// Clear any stale process references
		if (this.currentProcess !== null) {
			console.warn('[Transcription] Clearing stale process reference');
			this.currentProcess = null;
			this.currentOutputPath = null;
		}

		// Check Python availability
		const pythonAvailable = await this.checkPythonAvailable();
		if (!pythonAvailable) {
			this.uiService.showError(
				'Python 3.8+ required. Please install Python first.'
			);
			return;
		}

		// Record session start time for relative timestamps
		this.sessionStartTime = Date.now() / 1000; // Convert to Unix timestamp in seconds
		console.log(`[Transcription] Session start time: ${this.sessionStartTime}`);

		// Build command arguments
		// Prefer venv Python if available, otherwise use system Python
		const venvPython = this.getVenvPython();
		// eslint-disable-next-line no-undef
		const basePythonCommand = venvPython || (process.platform === 'win32' ? 'python' : 'python3');
		const scriptPath = this.getScriptPath();
		const model = config.model || 'small.en';

		// Log which Python we're using
		if (venvPython) {
			console.log('[Transcription] Using virtual environment Python:', venvPython);
		} else {
			console.log('[Transcription] Using system Python:', basePythonCommand);
		}

		// On macOS, use wrapper script to set DYLD_FALLBACK_LIBRARY_PATH for gettext
		const path = require('path');
		let pythonCommand = basePythonCommand;
		let args: string[];

		// eslint-disable-next-line no-undef
		if (process.platform === 'darwin') {
			const wrapperScript = path.join(path.dirname(scriptPath), 'run-with-libs.sh');
			pythonCommand = wrapperScript;
			args = [basePythonCommand, scriptPath, '--output', outputPath, '--model', model, '--start-time', this.sessionStartTime!.toString()];
		} else {
			args = [scriptPath, '--output', outputPath, '--model', model, '--start-time', this.sessionStartTime!.toString()];
		}

		if (config.device) {
			args.push('--device', config.device);
		}

		if (config.language) {
			args.push('--language', config.language);
		}

		// Add audio recording parameters if configured
		if (config.audioOutput) {
			args.push('--record-audio');
			args.push('--audio-output', config.audioOutput);
			console.log(`[Transcription] Audio recording enabled: ${config.audioOutput}`);
		}

		console.log(`[Transcription] Starting: ${pythonCommand} ${args.join(' ')}`);

		// Spawn Python process
		try {
			const { spawn } = require('child_process');
			this.currentProcess = spawn(pythonCommand, args);
			this.currentOutputPath = outputPath;

			console.log('[Transcription] Process spawned, waiting for output...');

			// Monitor stdout for status updates and dual-stream output
			// eslint-disable-next-line no-undef
			this.currentProcess?.stdout?.on('data', (data: Buffer) => {
				const rawOutput = data.toString();
				// Process each line separately (data may contain multiple lines)
				const lines = rawOutput.split('\n');

				for (const line of lines) {
					const output = line.trim();
					if (!output) continue;

					// Filter out spinner/progress indicators (they flood the console)
					if (output.match(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/) || output.includes('speak now')) {
						continue;
					}

					// Handle dual-stream output
					if (output.startsWith('SEARCH:')) {
						// Real-time stabilized text for semantic search
						const searchText = output.substring(7); // Remove 'SEARCH:' prefix
						if (this.searchTextCallback && searchText) {
							this.searchTextCallback(searchText);
						}
						continue;
					}

					if (output.startsWith('TRANSCRIPT:')) {
						// Final timestamped text for transcript
						const transcriptText = output.substring(11); // Remove 'TRANSCRIPT:' prefix
						if (this.transcriptCallback && transcriptText) {
							this.transcriptCallback(transcriptText);
						}
						// Also show user notification for transcribed text
						// Extract just the text part (after timestamp)
						const textMatch = transcriptText.match(/^\[[\d:]+\]\s*(.+)$/);
						if (textMatch) {
							this.uiService.showInfo(`Transcribed: ${textMatch[1]}`);
						}
						continue;
					}

					// Handle status messages
					if (output === 'READY') {
						console.log('[Transcription] Python process ready');
						continue;
					}

					if (output === 'END') {
						console.log('[Transcription] Python process ended');
						continue;
					}

					// Show user-friendly notifications for key events
					if (output.includes('Starting transcription')) {
						console.log('[Transcription] Starting...');
						this.uiService.showSuccess('🎙️ Transcription started');
					} else if (output.includes('Model loaded successfully')) {
						console.log('[Transcription] Whisper model ready');
						this.uiService.showSuccess('✅ Whisper model loaded');
					} else if (output.includes('Listening')) {
						console.log('[Transcription] Listening for speech');
						this.uiService.showSuccess('🎤 Listening for speech...');
					} else if (output.startsWith('✅')) {
						// Legacy format - still handle it
						this.uiService.showInfo(`Transcribed: ${output.substring(2).trim()}`);
					} else {
						// Log other meaningful output
						console.log(`[Transcription] ${output}`);
					}
				}
			});

			// Monitor stderr for errors
			// eslint-disable-next-line no-undef
			this.currentProcess?.stderr?.on('data', (data: Buffer) => {
				const error = data.toString().trim();
				if (!error) return;

				// Filter out harmless errors from early termination / rapid open-close
				// These occur when process is terminated before fully initialized
				// or when Python multiprocessing subprocesses are killed mid-spawn
				// Also filter Python traceback formatting artifacts (^ characters, partial lines)
				if (error.includes('EOFError') ||
				    error.includes('Error receiving data from connection') ||
				    error.includes('poll_connection') ||
				    error.includes('multiprocessing') ||
				    error.includes('spawn_main') ||
				    error.includes('SemLock') ||
				    error.includes('pickle.load') ||
				    error.includes('_rebuild') ||
				    error.includes('exitcode') ||
				    error.includes('_main(fd') ||
				    error.includes('FileNotFoundError') ||
				    error.includes('No such file or directory') ||
				    /^[\s^]+$/.test(error)) {  // Lines with only spaces and ^ characters
					// Silently ignore - expected behavior when user ends call quickly
					return;
				}

				console.error(`[Transcription STDERR] ${error}`);

				// Handle specific error cases
				if (error.includes('permission denied') || error.includes('Permission denied')) {
					this.uiService.showError('Microphone permission denied');
				} else if (error.includes('Missing dependency')) {
					this.uiService.showError('Python dependencies missing. Run: pip install -r requirements.txt');
				} else if (error.includes('Cannot write to')) {
					this.uiService.showError('Cannot write to output file. Check permissions.');
				}
			});

			// Handle process exit
			this.currentProcess?.on('close', (code: number) => {
				console.log(`[Transcription] Process exited with code ${code}`);

				if (code === 0) {
					this.uiService.showSuccess('Transcription stopped');
				} else if (code !== null) {
					// Only show error if not null (null means killed by signal)
					this.uiService.showError(`Transcription failed (exit code: ${code})`);
				}

				// Clean up
				this.currentProcess = null;
				this.currentOutputPath = null;
			});

			// Handle process errors
			this.currentProcess?.on('error', (error: Error) => {
				console.error('[Transcription] Process error:', error);
				this.uiService.showError(`Failed to start transcription: ${error.message}`);
				this.currentProcess = null;
				this.currentOutputPath = null;
			});

		} catch (error) {
			console.error('[Transcription] Failed to spawn process:', error);
			this.uiService.showError('Failed to start transcription');
			throw error;
		}
	}

	/**
	 * Stop active transcription
	 */
	async stopTranscription(): Promise<void> {
		if (!this.currentProcess) {
			console.log('[Transcription] No active process to stop');
			return;
		}

		console.log('[Transcription] Stopping process...');

		// Clear callbacks
		this.searchTextCallback = null;
		this.transcriptCallback = null;

		// Check if process is still initializing (no exitCode but also might not be fully started)
		const isInitializing = this.currentProcess.exitCode === null && !this.currentProcess.pid;

		if (isInitializing) {
			console.log('[Transcription] Process still initializing - forcing immediate termination');
			try {
				this.currentProcess.kill('SIGKILL');
			} catch (error) {
				console.warn('[Transcription] Error killing initializing process:', error);
			}
			this.currentProcess = null;
			this.currentOutputPath = null;
			this.sessionStartTime = null;
			return;
		}

		// Send SIGTERM for graceful shutdown
		try {
			this.currentProcess.kill('SIGTERM');
			console.log('[Transcription] SIGTERM sent for graceful shutdown');
		} catch (error) {
			console.warn('[Transcription] Error sending SIGTERM:', error);
			// Force immediate cleanup if SIGTERM fails
			this.currentProcess = null;
			this.currentOutputPath = null;
			this.sessionStartTime = null;
			return;
		}

		// Force kill after 2 seconds if still running (reduced from 5s for faster early termination)
		setTimeout(() => {
			if (this.currentProcess && this.currentProcess.exitCode === null) {
				console.warn('[Transcription] Force killing process after timeout');
				try {
					this.currentProcess.kill('SIGKILL');
				} catch (error) {
					console.warn('[Transcription] Error force killing:', error);
				}
				this.currentProcess = null;
				this.currentOutputPath = null;
				this.sessionStartTime = null;
			}
		}, 2000);
	}

	/**
	 * Get session start time (for synced relative timestamps)
	 */
	getSessionStartTime(): number | null {
		return this.sessionStartTime;
	}

	/**
	 * Clean up any running transcription process
	 * Called when plugin is unloaded
	 */
	cleanup(): void {
		if (this.currentProcess) {
			console.log('[Transcription] Cleaning up process on plugin unload');
			this.currentProcess.kill('SIGTERM');
			this.currentProcess = null;
			this.currentOutputPath = null;
			this.sessionStartTime = null;
		}
	}
}

// Singleton instance - prevents multiple instances from losing track of running processes
let _transcriptionServiceInstance: TranscriptionService | null = null;

export function initializeRealtimeTranscriptionService(plugin: InterBrainPlugin): void {
	_transcriptionServiceInstance = new TranscriptionService(plugin);
	console.log('[RealtimeTranscription] Service initialized');
}

export function getRealtimeTranscriptionService(): TranscriptionService {
	if (!_transcriptionServiceInstance) {
		throw new Error('RealtimeTranscriptionService not initialized. Call initializeRealtimeTranscriptionService() first.');
	}
	return _transcriptionServiceInstance;
}
