/**
 * Perspective Service
 *
 * Manages perspectives.json files for Songline feature.
 * Perspectives are audio clips from conversations that provide "living definitions" of DreamNodes.
 */

import type InterBrainPlugin from '../../../main';
import { VaultService } from '../../../core/services/vault-service';
import type { DreamNode } from '../../../core/types/dreamnode';
import { v4 as uuidv4 } from 'uuid';

/**
 * A Perspective is a conversation clip that provides context for a DreamNode
 */
export interface Perspective {
	uuid: string;
	sourceAudioPath: string;        // Relative path from vault root to audio file
	startTime: number;              // Seconds
	endTime: number;                // Seconds
	transcript: string;             // Excerpt from conversation
	conversationDate: string;       // ISO timestamp
	participants: [string, string]; // [peer name, my name]
	dreamerNodeId: string;          // UUID of source DreamerNode
	dreamerNodeName: string;        // Name of source DreamerNode
}

/**
 * Structure of perspectives.json file
 */
export interface PerspectivesFile {
	perspectives: Perspective[];
}

export interface PerspectiveService {
	/**
	 * Add a new perspective to a DreamNode's perspectives.json
	 */
	addPerspective(
		dreamNode: DreamNode,
		perspective: Omit<Perspective, 'uuid'>
	): Promise<void>;

	/**
	 * Load all perspectives for a DreamNode
	 * Returns empty array if no perspectives exist
	 */
	loadPerspectives(dreamNode: DreamNode): Promise<Perspective[]>;

	/**
	 * Convert MM:SS timestamp string to seconds
	 */
	timestampToSeconds(timestamp: string): number;

	/**
	 * Convert seconds to MM:SS timestamp string
	 */
	secondsToTimestamp(seconds: number): string;
}

export class PerspectiveServiceImpl implements PerspectiveService {
	private plugin: InterBrainPlugin;
	private vaultService: VaultService;
	private cache: Map<string, Perspective[]> = new Map();

	constructor(plugin: InterBrainPlugin) {
		this.plugin = plugin;
		this.vaultService = new VaultService(plugin.app.vault, plugin.app);
	}

	/**
	 * Clear cache for a specific node or all nodes
	 */
	clearCache(nodeId?: string): void {
		if (nodeId) {
			this.cache.delete(nodeId);
			console.log(`[Perspective] Cleared cache for node: ${nodeId}`);
		} else {
			this.cache.clear();
			console.log('[Perspective] Cleared entire cache');
		}
	}

	async addPerspective(
		dreamNode: DreamNode,
		perspective: Omit<Perspective, 'uuid'>
	): Promise<void> {
		const path = require('path');
		const fs = require('fs').promises;

		// Get vault base path for absolute path resolution
		const vaultPath = (this.plugin.app.vault.adapter as any).basePath;
		const absoluteRepoPath = path.join(vaultPath, dreamNode.repoPath);
		const perspectivesPath = path.join(absoluteRepoPath, 'perspectives.json');

		try {
			// Load existing perspectives or create empty array
			let perspectivesFile: PerspectivesFile;

			try {
				const content = await fs.readFile(perspectivesPath, 'utf-8');
				perspectivesFile = JSON.parse(content);
			} catch {
				// File doesn't exist or is invalid, create new
				perspectivesFile = { perspectives: [] };
			}

			// Add new perspective with generated UUID
			const newPerspective: Perspective = {
				uuid: uuidv4(),
				...perspective
			};

			perspectivesFile.perspectives.push(newPerspective);

			// Write back to file
			await fs.writeFile(
				perspectivesPath,
				JSON.stringify(perspectivesFile, null, 2),
				'utf-8'
			);

			// Invalidate cache for this node
			this.clearCache(dreamNode.id);

			console.log(`✅ [Perspective] Added perspective to ${dreamNode.name}: ${newPerspective.uuid}`);

		} catch (error) {
			console.error(`Failed to add perspective to ${dreamNode.name}:`, error);
			throw new Error(`Failed to add perspective: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	async loadPerspectives(dreamNode: DreamNode): Promise<Perspective[]> {
		// Check cache first
		if (this.cache.has(dreamNode.id)) {
			console.log(`[Perspective] Cache hit for ${dreamNode.name}`);
			return this.cache.get(dreamNode.id)!;
		}

		const path = require('path');
		const fs = require('fs').promises;

		// Get vault base path for absolute path resolution
		const vaultPath = (this.plugin.app.vault.adapter as any).basePath;
		const absoluteRepoPath = path.join(vaultPath, dreamNode.repoPath);
		const perspectivesPath = path.join(absoluteRepoPath, 'perspectives.json');

		try {
			const content = await fs.readFile(perspectivesPath, 'utf-8');
			const perspectivesFile: PerspectivesFile = JSON.parse(content);
			const perspectives = perspectivesFile.perspectives || [];

			// Cache the result
			this.cache.set(dreamNode.id, perspectives);
			console.log(`[Perspective] Loaded and cached ${perspectives.length} perspectives for ${dreamNode.name}`);

			return perspectives;
		} catch (error: any) {
			// Only log if it's not a simple "file doesn't exist" case
			if (error?.code !== 'ENOENT') {
				console.warn(`[Perspective] Error loading perspectives for ${dreamNode.name}:`, error);
			}

			// Cache empty result to avoid repeated file checks
			this.cache.set(dreamNode.id, []);
			return [];
		}
	}

	timestampToSeconds(timestamp: string): number {
		// Parse MM:SS format
		const parts = timestamp.split(':');
		if (parts.length !== 2) {
			console.warn(`Invalid timestamp format: ${timestamp}`);
			return 0;
		}

		const minutes = parseInt(parts[0], 10);
		const seconds = parseInt(parts[1], 10);

		if (isNaN(minutes) || isNaN(seconds)) {
			console.warn(`Invalid timestamp numbers: ${timestamp}`);
			return 0;
		}

		return minutes * 60 + seconds;
	}

	secondsToTimestamp(seconds: number): string {
		const minutes = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${minutes}:${secs.toString().padStart(2, '0')}`;
	}
}

// Singleton instance
let _perspectiveServiceInstance: PerspectiveServiceImpl | null = null;

export function initializePerspectiveService(plugin: InterBrainPlugin): void {
	_perspectiveServiceInstance = new PerspectiveServiceImpl(plugin);
	console.log('[Perspective] Service initialized');
}

export function getPerspectiveService(): PerspectiveServiceImpl {
	if (!_perspectiveServiceInstance) {
		throw new Error('PerspectiveService not initialized. Call initializePerspectiveService() first.');
	}
	return _perspectiveServiceInstance;
}
