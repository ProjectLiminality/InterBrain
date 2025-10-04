import type InterBrainPlugin from '../../../main';
import { TranscriptionService } from '../services/transcription-service';
import { UIService } from '../../../services/ui-service';

/**
 * Register real-time transcription commands
 */
export function registerTranscriptionCommands(plugin: InterBrainPlugin): void {
	const transcriptionService = new TranscriptionService(plugin);
	const uiService = new UIService(plugin.app);

	// Store transcription service on plugin for cleanup
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(plugin as any).transcriptionService = transcriptionService;

	/**
	 * Command: Start Real-Time Transcription
	 */
	plugin.addCommand({
		id: 'start-realtime-transcription',
		name: 'Start Real-Time Transcription',
		hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 't' }],
		callback: async () => {
			// Check if already running
			if (transcriptionService.isRunning()) {
				uiService.showWarning('Transcription already running');
				return;
			}

			// Validate active file is markdown
			const activeFile = plugin.app.workspace.getActiveFile();
			if (!activeFile || !activeFile.path.endsWith('.md')) {
				uiService.showError('Please open a markdown file for transcript output');
				return;
			}

			// Get full file path (construct manually since getFullPath is private)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const vaultPath = (plugin.app.vault.adapter as any).basePath;
			const transcriptPath = require('path').join(vaultPath, activeFile.path);

			// Start transcription
			try {
				await transcriptionService.startTranscription(transcriptPath, {
					model: 'small.en'
				});
			} catch (error) {
				console.error('[Transcription Commands] Failed to start:', error);
			}
		}
	});

	/**
	 * Command: Stop Real-Time Transcription
	 */
	plugin.addCommand({
		id: 'stop-realtime-transcription',
		name: 'Stop Real-Time Transcription',
		hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 't' }], // Same key toggles
		callback: async () => {
			if (!transcriptionService.isRunning()) {
				uiService.showWarning('No active transcription');
				return;
			}

			await transcriptionService.stopTranscription();
		}
	});
}

/**
 * Cleanup transcription service on plugin unload
 */
export function cleanupTranscriptionService(plugin: InterBrainPlugin): void {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const transcriptionService = (plugin as any).transcriptionService as TranscriptionService | undefined;
	if (transcriptionService) {
		transcriptionService.cleanup();
	}
}
