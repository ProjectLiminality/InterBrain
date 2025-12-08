import { Notice, Plugin } from 'obsidian';
import { DreamNode } from '../dreamnode';
import { RadicleService } from './radicle-service';
import { GitDreamNodeService } from '../dreamnode/services/git-dreamnode-service';

/**
 * Radicle Batch Initialization Service
 *
 * Ensures multiple DreamNodes have Radicle IDs before sharing via email links.
 * Handles batch `rad init` operations with race condition prevention.
 */
export class RadicleBatchInitService {
	private plugin: Plugin;
	private radicleService: RadicleService;
	private dreamNodeService: GitDreamNodeService;

	constructor(plugin: Plugin, radicleService: RadicleService, dreamNodeService: GitDreamNodeService) {
		this.plugin = plugin;
		this.radicleService = radicleService;
		this.dreamNodeService = dreamNodeService;
	}

	/**
	 * Ensure all nodes have Radicle IDs, initializing those that don't
	 * Returns map of UUID → Radicle ID
	 */
	async ensureNodesHaveRadicleIds(nodeUUIDs: string[]): Promise<Map<string, string>> {
		console.log(`🔮 [RadicleBatchInit] Processing ${nodeUUIDs.length} nodes for Radicle IDs`);

		const result = new Map<string, string>();

		if (nodeUUIDs.length === 0) {
			return result;
		}

		try {
			// Step 1: Load all nodes and check their Radicle status
			const nodes: DreamNode[] = [];

			for (const uuid of nodeUUIDs) {
				const node = await this.dreamNodeService.get(uuid);
				if (node) {
					nodes.push(node);
				} else {
					console.warn(`⚠️ [RadicleBatchInit] Node ${uuid} not found`);
				}
			}

			// Step 2: Separate into already-initialized vs needs-init
			const { alreadyInitialized, needsInit } = await this.categorizeNodes(nodes);

			console.log(`✅ [RadicleBatchInit] ${alreadyInitialized.length} nodes already have Radicle IDs`);
			console.log(`🔄 [RadicleBatchInit] ${needsInit.length} nodes need initialization`);

			// Step 3: Add already-initialized nodes to result
			for (const node of alreadyInitialized) {
				const radicleId = await this.getRadicleIdFromUdd(node);
				if (radicleId) {
					result.set(node.id, radicleId);
				}
			}

			// Step 4: Batch initialize nodes that need it
			if (needsInit.length > 0) {
				const notice = new Notice(`Initializing ${needsInit.length} DreamNode${needsInit.length > 1 ? 's' : ''} with Radicle...`, 0);

				const initialized = await this.batchInitializeNodes(needsInit);

				notice.hide();

				// Add newly initialized nodes to result
				for (const [uuid, radicleId] of initialized) {
					result.set(uuid, radicleId);
				}

				const successCount = initialized.size;
				const failCount = needsInit.length - successCount;

				if (successCount > 0) {
					new Notice(`✅ Initialized ${successCount} node${successCount > 1 ? 's' : ''} with Radicle`);
				}

				if (failCount > 0) {
					console.warn(`⚠️ [RadicleBatchInit] ${failCount} node(s) failed to initialize`);
				}
			}

			console.log(`✅ [RadicleBatchInit] Complete: ${result.size}/${nodeUUIDs.length} nodes have Radicle IDs`);
			return result;

		} catch (error) {
			console.error('❌ [RadicleBatchInit] Batch initialization failed:', error);
			throw error;
		}
	}

	/**
	 * Categorize nodes by Radicle initialization status
	 */
	private async categorizeNodes(nodes: DreamNode[]): Promise<{
		alreadyInitialized: DreamNode[];
		needsInit: DreamNode[];
	}> {
		const alreadyInitialized: DreamNode[] = [];
		const needsInit: DreamNode[] = [];

		for (const node of nodes) {
			const radicleId = await this.getRadicleIdFromUdd(node);

			if (radicleId) {
				alreadyInitialized.push(node);
			} else {
				needsInit.push(node);
			}
		}

		return { alreadyInitialized, needsInit };
	}

	/**
	 * Intelligently check and sync Radicle ID between .udd file and git repository
	 * Returns Radicle ID if present OR can be synced, null if not initialized
	 */
	private async getRadicleIdFromUdd(node: DreamNode): Promise<string | null> {
		try {
			const path = require('path');
			const fs = require('fs').promises;
			const adapter = this.plugin.app.vault.adapter as any;
			const vaultPath = adapter.basePath || '';
			const uddPath = path.join(vaultPath, node.repoPath, '.udd');
			const fullRepoPath = path.join(vaultPath, node.repoPath);

			// STEP 1: Try reading Radicle ID from .udd file first
			try {
				const uddContent = await fs.readFile(uddPath, 'utf-8');
				const udd = JSON.parse(uddContent);

				if (udd.radicleId) {
					// SUCCESS: Radicle ID already in .udd
					return udd.radicleId;
				}
			} catch (error) {
				console.warn(`⚠️ [RadicleBatchInit] Could not read .udd for ${node.name}:`, error);
			}

			// STEP 2: No Radicle ID in .udd - check if repository is initialized anyway
			const radicleId = await this.radicleService.getRadicleId(fullRepoPath);
			if (radicleId) {
				// GAP DETECTED: Repository initialized but .udd doesn't have the ID - write it
				console.log(`🔍 [RadicleBatchInit] Found Radicle ID in git for ${node.name}: ${radicleId}, writing to .udd...`);
				try {
					const uddContent = await fs.readFile(uddPath, 'utf-8');
					const udd = JSON.parse(uddContent);
					udd.radicleId = radicleId;
					await fs.writeFile(uddPath, JSON.stringify(udd, null, 2));
					console.log(`✅ [RadicleBatchInit] Successfully wrote Radicle ID to .udd for ${node.name}`);
				} catch (writeError) {
					console.warn(`⚠️ [RadicleBatchInit] Could not write Radicle ID to .udd for ${node.name}:`, writeError);
				}
				return radicleId;
			}

			// STEP 3: Not initialized at all
			return null;
		} catch (error) {
			console.warn(`⚠️ [RadicleBatchInit] Could not get Radicle ID for ${node.name}:`, error);
			return null;
		}
	}

	/**
	 * Batch initialize nodes with Radicle, serializing to prevent race conditions
	 * Returns map of successful UUID → Radicle ID
	 */
	private async batchInitializeNodes(nodes: DreamNode[]): Promise<Map<string, string>> {
		const result = new Map<string, string>();

		// Check if Radicle is available
		const isAvailable = await this.radicleService.isAvailable();
		if (!isAvailable) {
			console.warn('⚠️ [RadicleBatchInit] Radicle CLI not available, skipping initialization');
			return result;
		}

		// Get vault path
		const adapter = this.plugin.app.vault.adapter as any;
		const vaultPath = adapter.basePath || '';
		const path = require('path');

		// CRITICAL: Serialize rad init to prevent race conditions
		// Process nodes one at a time to avoid git/Radicle conflicts
		for (const node of nodes) {
			try {
				console.log(`🔄 [RadicleBatchInit] Initializing ${node.name}...`);

				const fullRepoPath = path.join(vaultPath, node.repoPath);

				// Initialize with Radicle (will auto-save Radicle ID to .udd)
				// IMPORTANT: Use UUID suffix for uniqueness in Radicle storage (prevents collisions)
				// Directory stays clean PascalCase, but Radicle repo name gets UUID for backend uniqueness
				const uniqueRadicleName = node.id ? `${node.repoPath}-${node.id.substring(0, 7)}` : node.repoPath;

				// Get passphrase from settings
				const passphrase = (this.plugin as any).settings?.radiclePassphrase || undefined;

				await this.radicleService.init(
					fullRepoPath,
					uniqueRadicleName, // Backend name with UUID for uniqueness
					`DreamNode: ${node.name}`,
					passphrase
				);

				// Get the Radicle ID (pass passphrase for node startup)
				const radicleId = await this.radicleService.getRadicleId(fullRepoPath, passphrase);

				if (radicleId) {
					result.set(node.id, radicleId);
					console.log(`✅ [RadicleBatchInit] ${node.name} initialized: ${radicleId}`);
				} else {
					console.warn(`⚠️ [RadicleBatchInit] ${node.name} initialized but no Radicle ID found`);
				}

			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);

				// Check if repository exists in Radicle storage but working directory not linked
				if (errorMsg.startsWith('RADICLE_STORAGE_EXISTS:')) {
					const radicleId = errorMsg.replace('RADICLE_STORAGE_EXISTS:', '');
					console.log(`ℹ️ [RadicleBatchInit] ${node.name} exists in storage with ID ${radicleId}, linking to .udd...`);

					try {
						const fullRepoPath = path.join(vaultPath, node.repoPath);
						const fs = require('fs').promises;
						const uddPath = path.join(fullRepoPath, '.udd');

						// Save the Radicle ID to .udd file
						const uddContent = await fs.readFile(uddPath, 'utf-8');
						const udd = JSON.parse(uddContent);
						udd.radicleId = radicleId;
						await fs.writeFile(uddPath, JSON.stringify(udd, null, 2));

						result.set(node.id, radicleId);
						console.log(`✅ [RadicleBatchInit] ${node.name} linked with storage: ${radicleId}`);
						continue; // Success! Move to next node
					} catch (writeError) {
						console.error(`❌ [RadicleBatchInit] Could not write Radicle ID to .udd for ${node.name}:`, writeError);
					}
				}
				// Check if error is "already initialized" or "reinitialize" - this is NOT an error!
				else if (errorMsg.includes('already initialized') || errorMsg.includes('reinitialize')) {
					console.log(`ℹ️ [RadicleBatchInit] ${node.name} already initialized, retrieving ID...`);

					try {
						const fullRepoPath = path.join(vaultPath, node.repoPath);
						const fs = require('fs').promises;
						const uddPath = path.join(fullRepoPath, '.udd');
						const radicleId = await this.radicleService.getRadicleId(fullRepoPath);

						if (radicleId) {
							// GAP CLOSING: Write Radicle ID to .udd file if not already there
							try {
								const uddContent = await fs.readFile(uddPath, 'utf-8');
								const udd = JSON.parse(uddContent);
								if (!udd.radicleId) {
									udd.radicleId = radicleId;
									await fs.writeFile(uddPath, JSON.stringify(udd, null, 2));
									console.log(`✅ [RadicleBatchInit] Wrote Radicle ID to .udd for ${node.name}`);
								}
							} catch (writeError) {
								console.warn(`⚠️ [RadicleBatchInit] Could not write Radicle ID to .udd for ${node.name}:`, writeError);
							}

							result.set(node.id, radicleId);
							console.log(`✅ [RadicleBatchInit] ${node.name} already initialized: ${radicleId}`);
							continue; // Success! Move to next node
						} else {
							console.warn(`⚠️ [RadicleBatchInit] Could not retrieve Radicle ID for already-initialized ${node.name}`);
						}
					} catch (getIdError) {
						console.error(`❌ [RadicleBatchInit] Could not retrieve Radicle ID for ${node.name}:`, getIdError);
					}
				} else {
					// Different error - log and continue
					console.error(`❌ [RadicleBatchInit] Failed to initialize ${node.name}:`, error);
				}
			}
		}

		return result;
	}
}

// Singleton instance
let _radicleBatchInitService: RadicleBatchInitService | null = null;

export function initializeRadicleBatchInitService(plugin: Plugin, radicleService: RadicleService, dreamNodeService: GitDreamNodeService): void {
	_radicleBatchInitService = new RadicleBatchInitService(plugin, radicleService, dreamNodeService);
	console.log(`🔮 [RadicleBatchInit] Service initialized`);
}

export function getRadicleBatchInitService(): RadicleBatchInitService {
	if (!_radicleBatchInitService) {
		throw new Error('RadicleBatchInitService not initialized. Call initializeRadicleBatchInitService() first.');
	}
	return _radicleBatchInitService;
}
