/**
 * Conversations Service
 *
 * Manages conversation history for DreamerNodes.
 * Provides caching to avoid redundant file I/O operations.
 */

import type InterBrainPlugin from '../../../main';
import type { DreamNode } from '../../dreamnode';
import { getAudioStreamingService } from '../../dreamweaving/services/audio-streaming-service';

/**
 * A Conversation represents a recorded audio conversation with transcript
 */
export interface Conversation {
	audioPath: string;
	audioDataUrl: string; // Base64 data URL for playback
	transcriptPath: string;
	date: Date;
	title: string;
}

export interface ConversationsService {
	/**
	 * Load all conversations for a DreamerNode
	 * Returns empty array if no conversations exist
	 */
	loadConversations(dreamerNode: DreamNode): Promise<Conversation[]>;

	/**
	 * Load transcript content for a specific conversation
	 */
	loadTranscript(transcriptPath: string): Promise<string>;

	/**
	 * Clear cache for a specific node or all nodes
	 */
	clearCache(nodeId?: string): void;
}

export class ConversationsServiceImpl implements ConversationsService {
	private plugin: InterBrainPlugin;
	private conversationsCache: Map<string, Conversation[]> = new Map();
	private transcriptsCache: Map<string, string> = new Map();

	constructor(plugin: InterBrainPlugin) {
		this.plugin = plugin;
	}

	clearCache(nodeId?: string): void {
		if (nodeId) {
			this.conversationsCache.delete(nodeId);
			// Clear transcript cache entries for this node
			const nodeCacheKeys = Array.from(this.transcriptsCache.keys()).filter(key => key.startsWith(nodeId));
			nodeCacheKeys.forEach(key => this.transcriptsCache.delete(key));
		} else {
			this.conversationsCache.clear();
			this.transcriptsCache.clear();
		}
	}

	async loadConversations(dreamerNode: DreamNode): Promise<Conversation[]> {
		// Check cache first
		if (this.conversationsCache.has(dreamerNode.id)) {
			return this.conversationsCache.get(dreamerNode.id)!;
		}

		const path = require('path');
		const fs = require('fs').promises;

		// Get vault base path
		const vaultBasePath = (this.plugin.app.vault.adapter as any).basePath;
		if (!vaultBasePath) {
			console.error(`[Conversations] Cannot get vault base path`);
			return [];
		}

		try {
			// Build conversations directory path
			const absoluteRepoPath = path.join(vaultBasePath, dreamerNode.repoPath);
			const conversationsDir = path.join(absoluteRepoPath, 'conversations');

			// Check if directory exists
			try {
				await fs.access(conversationsDir);
			} catch (error: any) {
				// Directory doesn't exist - this is normal for DreamerNodes without conversations
				if (error?.code === 'ENOENT') {
					// Cache empty result to avoid repeated checks
					this.conversationsCache.set(dreamerNode.id, []);
					return [];
				}
				throw error;
			}

			// Read all files in conversations directory
			const files = await fs.readdir(conversationsDir);

			// Find audio files
			const audioFiles = files.filter((f: string) => f.endsWith('.mp3') || f.endsWith('.wav'));

			// Build conversation objects
			const convos: Conversation[] = [];
			const audioStreamingService = getAudioStreamingService();

			for (const audioFile of audioFiles) {
				// Extract date from filename: conversation-2025-10-23-14-30.mp3
				const match = audioFile.match(/conversation-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/);
				if (match) {
					const [, year, month, day, hour, minute] = match;
					const date = new Date(
						parseInt(year),
						parseInt(month) - 1,
						parseInt(day),
						parseInt(hour),
						parseInt(minute)
					);

					// Find matching transcript
					const transcriptName = `transcript-${year}-${month}-${day}-${hour}-${minute}.md`;
					const transcriptPath = path.join(conversationsDir, transcriptName);

					// Check if transcript exists
					let hasTranscript = false;
					try {
						await fs.access(transcriptPath);
						hasTranscript = true;
					} catch {
						// Transcript not found - continue without it
					}

					// Load audio file as base64 data URL
					const audioFilePath = path.join(conversationsDir, audioFile);
					let audioDataUrl = '';
					try {
						audioDataUrl = await audioStreamingService.loadAudioAsDataUrl(audioFilePath);
					} catch (error) {
						console.error(`[Conversations] Failed to load audio file ${audioFile}:`, error);
					}

					convos.push({
						audioPath: audioFilePath,
						audioDataUrl,
						transcriptPath: hasTranscript ? transcriptPath : '',
						date,
						title: date.toLocaleString('en-US', {
							dateStyle: 'medium',
							timeStyle: 'short'
						})
					});
				}
			}

			// Sort by date (newest first)
			convos.sort((a, b) => b.date.getTime() - a.date.getTime());

			// Cache the result
			this.conversationsCache.set(dreamerNode.id, convos);

			return convos;
		} catch (error) {
			console.error(`[Conversations] Failed to load conversations for ${dreamerNode.name}:`, error);
			// Cache empty result to avoid repeated failed attempts
			this.conversationsCache.set(dreamerNode.id, []);
			return [];
		}
	}

	async loadTranscript(transcriptPath: string): Promise<string> {
		// Check cache first
		if (this.transcriptsCache.has(transcriptPath)) {
			return this.transcriptsCache.get(transcriptPath)!;
		}

		const fs = require('fs').promises;

		try {
			const content = await fs.readFile(transcriptPath, 'utf-8');

			// Extract conversation text (skip metadata header)
			const lines = content.split('\n');
			const separatorIndex = lines.findIndex((line: string) => line === '---');
			const conversationText = lines
				.slice(separatorIndex + 1)
				.join('\n')
				.trim();

			// Cache the result
			this.transcriptsCache.set(transcriptPath, conversationText);

			return conversationText;
		} catch (error) {
			console.error(`[Conversations] Failed to load transcript ${transcriptPath}:`, error);
			const errorMessage = 'Failed to load transcript';
			this.transcriptsCache.set(transcriptPath, errorMessage);
			return errorMessage;
		}
	}
}

// Singleton instance
let _conversationsServiceInstance: ConversationsServiceImpl | null = null;

export function initializeConversationsService(plugin: InterBrainPlugin): void {
	_conversationsServiceInstance = new ConversationsServiceImpl(plugin);
	console.log('[Conversations] Service initialized');
}

export function getConversationsService(): ConversationsServiceImpl {
	if (!_conversationsServiceInstance) {
		throw new Error('ConversationsService not initialized. Call initializeConversationsService() first.');
	}
	return _conversationsServiceInstance;
}
