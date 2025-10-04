import type { ChildProcess } from 'child_process';
import type InterBrainPlugin from '../../../main';
import { UIService } from '../../../services/ui-service';
import type { ITranscriptionService, TranscriptionConfig } from '../types/transcription-types';

/**
 * Service for managing real-time transcription processes
 */
export class TranscriptionService implements ITranscriptionService {
	private plugin: InterBrainPlugin;
	private uiService: UIService;
	private currentProcess: ChildProcess | null = null;
	private currentOutputPath: string | null = null;

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
	 * Start transcription to the specified markdown file
	 */
	async startTranscription(
		outputPath: string,
		config: Partial<TranscriptionConfig> = {}
	): Promise<void> {
		// Check if already running
		if (this.isRunning()) {
			this.uiService.showWarning('Transcription already running');
			return;
		}

		// Check Python availability
		const pythonAvailable = await this.checkPythonAvailable();
		if (!pythonAvailable) {
			this.uiService.showError(
				'Python 3.8+ required. Please install Python first.'
			);
			return;
		}

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
			args = [basePythonCommand, scriptPath, '--output', outputPath, '--model', model];
		} else {
			args = [scriptPath, '--output', outputPath, '--model', model];
		}

		if (config.device) {
			args.push('--device', config.device);
		}

		if (config.language) {
			args.push('--language', config.language);
		}

		console.log(`[Transcription] Starting: ${pythonCommand} ${args.join(' ')}`);

		// Spawn Python process
		try {
			const { spawn } = require('child_process');
			this.currentProcess = spawn(pythonCommand, args);
			this.currentOutputPath = outputPath;

			// Monitor stdout for status updates
			// eslint-disable-next-line no-undef
			this.currentProcess.stdout?.on('data', (data: Buffer) => {
				const output = data.toString().trim();
				console.log(`[Transcription] ${output}`);

				// Show user-friendly notifications for key events
				if (output.includes('Starting transcription')) {
					this.uiService.showSuccess('🎙️ Transcription started');
				} else if (output.includes('Model loaded successfully')) {
					console.log('[Transcription] Whisper model ready');
				}
			});

			// Monitor stderr for errors
			// eslint-disable-next-line no-undef
			this.currentProcess.stderr?.on('data', (data: Buffer) => {
				const error = data.toString().trim();
				console.error(`[Transcription Error] ${error}`);

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
			this.currentProcess.on('close', (code: number) => {
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
			this.currentProcess.on('error', (error: Error) => {
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
			this.uiService.showWarning('No active transcription');
			return;
		}

		console.log('[Transcription] Stopping process...');
		this.uiService.showInfo('Stopping transcription...');

		// Send SIGTERM for graceful shutdown
		this.currentProcess.kill('SIGTERM');

		// Force kill after 5 seconds if still running
		setTimeout(() => {
			if (this.currentProcess && this.currentProcess.exitCode === null) {
				console.warn('[Transcription] Force killing process');
				this.currentProcess.kill('SIGKILL');
			}
		}, 5000);
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
		}
	}
}
