/**
 * Audio Streaming Service
 *
 * Handles loading audio files from the file system and converting them to
 * base64 data URLs for playback in React components.
 *
 * This service isolates Node.js fs operations from React components,
 * following the established architecture pattern.
 */

import type InterBrainPlugin from '../../../main';

export interface AudioStreamingService {
	/**
	 * Load an audio file from disk and convert to base64 data URL
	 * @param audioPath Absolute path to audio file
	 * @returns Base64 data URL for use in <audio> elements
	 */
	loadAudioAsDataUrl(audioPath: string): Promise<string>;
}

export class AudioStreamingServiceImpl implements AudioStreamingService {
	private plugin: InterBrainPlugin;

	constructor(plugin: InterBrainPlugin) {
		this.plugin = plugin;
	}

	async loadAudioAsDataUrl(audioPath: string): Promise<string> {
		const path = require('path');
		const fs = require('fs').promises;

		try {
			const audioBuffer = await fs.readFile(audioPath);
			const ext = path.extname(audioPath).toLowerCase();
			const mimeType = ext === '.mp3' ? 'audio/mpeg' : 'audio/wav';
			const base64 = audioBuffer.toString('base64');
			return `data:${mimeType};base64,${base64}`;
		} catch (error) {
			console.error(`Failed to load audio file: ${audioPath}`, error);
			throw error;
		}
	}
}

// Singleton instance
let _audioStreamingServiceInstance: AudioStreamingServiceImpl | null = null;

export function initializeAudioStreamingService(plugin: InterBrainPlugin): void {
	_audioStreamingServiceInstance = new AudioStreamingServiceImpl(plugin);
	console.log('[AudioStreaming] Service initialized');
}

export function getAudioStreamingService(): AudioStreamingServiceImpl {
	if (!_audioStreamingServiceInstance) {
		throw new Error('AudioStreamingService not initialized. Call initializeAudioStreamingService() first.');
	}
	return _audioStreamingServiceInstance;
}
