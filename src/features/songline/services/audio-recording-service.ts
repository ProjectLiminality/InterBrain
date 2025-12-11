/**
 * Audio Recording Service
 *
 * Coordinates audio recording during conversations for the Songline feature.
 * Recordings are stored in the DreamerNode's conversations/ directory.
 */

import type InterBrainPlugin from '../../../main';
import { VaultService } from '../../../core/services/vault-service';
import type { DreamNode } from '../../dreamnode';

export interface AudioRecordingService {
	/**
	 * Get the path where the audio recording will be saved
	 * @param conversationPartner The DreamerNode we're in conversation with
	 * @param transcriptFileName The transcript filename (for matching)
	 * @returns Absolute path to the audio file (MP3)
	 */
	getAudioOutputPath(conversationPartner: DreamNode, transcriptFileName: string): string;

	/**
	 * Ensure the conversations directory exists in the DreamerNode
	 * @param conversationPartner The DreamerNode we're in conversation with
	 */
	ensureConversationsDirectory(conversationPartner: DreamNode): Promise<void>;

	/**
	 * Get the audio file path after recording completes
	 * Checks for both .mp3 (if conversion succeeded) and .wav (fallback)
	 * @param conversationPartner The DreamerNode we're in conversation with
	 * @param transcriptFileName The transcript filename (for matching)
	 * @returns Absolute path to the audio file, or null if not found
	 */
	getRecordedAudioPath(conversationPartner: DreamNode, transcriptFileName: string): Promise<string | null>;
}

export class AudioRecordingServiceImpl implements AudioRecordingService {
	private plugin: InterBrainPlugin;
	private vaultService: VaultService;

	constructor(plugin: InterBrainPlugin) {
		this.plugin = plugin;
		this.vaultService = new VaultService(plugin.app.vault, plugin.app);
	}

	getAudioOutputPath(conversationPartner: DreamNode, transcriptFileName: string): string {
		const path = require('path');

		// Get vault base path for absolute path resolution
		const vaultPath = (this.plugin.app.vault.adapter as any).basePath;

		// Extract base name from transcript (e.g., "transcript-2025-10-23-14-30.md" -> "conversation-2025-10-23-14-30")
		const baseName = transcriptFileName
			.replace('transcript-', 'conversation-')
			.replace('.md', '');

		// Audio will be saved in conversations/ subdirectory (with .wav, converted to .mp3)
		const absoluteRepoPath = path.join(vaultPath, conversationPartner.repoPath);
		const conversationsDir = path.join(absoluteRepoPath, 'conversations');
		const audioPath = path.join(conversationsDir, `${baseName}.wav`);

		return audioPath;
	}

	async ensureConversationsDirectory(conversationPartner: DreamNode): Promise<void> {
		const path = require('path');
		const fs = require('fs').promises;

		// Get vault base path for absolute path resolution
		const vaultPath = (this.plugin.app.vault.adapter as any).basePath;
		const absoluteRepoPath = path.join(vaultPath, conversationPartner.repoPath);
		const conversationsDir = path.join(absoluteRepoPath, 'conversations');

		try {
			await fs.access(conversationsDir);
			// Directory already exists
		} catch {
			// Create directory
			await fs.mkdir(conversationsDir, { recursive: true });
		}
	}

	async getRecordedAudioPath(conversationPartner: DreamNode, transcriptFileName: string): Promise<string | null> {
		const path = require('path');
		const fs = require('fs').promises;

		// Get vault base path for absolute path resolution
		const vaultPath = (this.plugin.app.vault.adapter as any).basePath;

		const baseName = transcriptFileName
			.replace('transcript-', 'conversation-')
			.replace('.md', '');

		const absoluteRepoPath = path.join(vaultPath, conversationPartner.repoPath);
		const conversationsDir = path.join(absoluteRepoPath, 'conversations');

		// Check for MP3 first (preferred)
		const mp3Path = path.join(conversationsDir, `${baseName}.mp3`);
		try {
			await fs.access(mp3Path);
			return mp3Path;
		} catch {
			// MP3 not found, check for WAV fallback
		}

		// Check for WAV fallback
		const wavPath = path.join(conversationsDir, `${baseName}.wav`);
		try {
			await fs.access(wavPath);
			return wavPath;
		} catch {
			// Neither found
			return null;
		}
	}
}

// Singleton instance
let _audioRecordingServiceInstance: AudioRecordingServiceImpl | null = null;

export function initializeAudioRecordingService(plugin: InterBrainPlugin): void {
	_audioRecordingServiceInstance = new AudioRecordingServiceImpl(plugin);
	console.log('[AudioRecording] Service initialized');
}

export function getAudioRecordingService(): AudioRecordingServiceImpl {
	if (!_audioRecordingServiceInstance) {
		throw new Error('AudioRecordingService not initialized. Call initializeAudioRecordingService() first.');
	}
	return _audioRecordingServiceInstance;
}
