import { App, Notice, Plugin } from 'obsidian';
import { RadicleService } from './radicle-service';
import { DreamNodeService } from './dreamnode-service';
import { DreamSongRelationshipService } from './dreamsong-relationship-service';
import { useInterBrainStore } from '../store/interbrain-store';

/**
 * URI Handler Service
 *
 * Registers and handles custom Obsidian URI protocols for deep linking.
 * Enables one-click DreamNode cloning from email links.
 */
export class URIHandlerService {
	private app: App;
	private plugin: Plugin;
	private radicleService: RadicleService;
	private dreamNodeService: DreamNodeService;

	constructor(app: App, plugin: Plugin, radicleService: RadicleService, dreamNodeService: DreamNodeService) {
		this.app = app;
		this.plugin = plugin;
		this.radicleService = radicleService;
		this.dreamNodeService = dreamNodeService;
	}

	/**
	 * Register all URI handlers
	 */
	registerHandlers(): void {
		try {
			// Register single node clone handler
			// Format: obsidian://interbrain-clone?vault=<vault>&uuid=<dreamUUID>
			this.plugin.registerObsidianProtocolHandler(
				'interbrain-clone',
				this.handleSingleNodeClone.bind(this)
			);
			console.log(`🔗 [URIHandler] Registered: obsidian://interbrain-clone`);

			// Register batch clone handler
			// Format: obsidian://interbrain-clone-batch?vault=<vault>&uuids=<uuid1,uuid2,uuid3>
			this.plugin.registerObsidianProtocolHandler(
				'interbrain-clone-batch',
				this.handleBatchNodeClone.bind(this)
			);
			console.log(`🔗 [URIHandler] Registered: obsidian://interbrain-clone-batch`);
		} catch (error) {
			console.error('Failed to register URI handlers:', error);
			console.warn(`⚠️ [URIHandler] Deep links will not be functional`);
		}
	}

	/**
	 * Handle single DreamNode clone URI
	 * Format: obsidian://interbrain-clone?id=<radicleId or uuid> OR ?repo=<github.com/user/repo>
	 */
	private async handleSingleNodeClone(params: Record<string, string>): Promise<void> {
		try {
			console.log(`🔗 [URIHandler] Single clone handler called with params:`, params);
			const id = params.id || params.uuid; // Support both 'id' (new) and 'uuid' (legacy)
			const repo = params.repo; // GitHub repository path

			// Check for GitHub repository
			if (repo) {
				console.log(`🔗 [URIHandler] GitHub clone link triggered!`);
				console.log(`🔗 [URIHandler] Repository: ${repo}`);
				await this.cloneFromGitHub(repo);
				return;
			}

			// Check for Radicle/UUID identifier
			if (!id) {
				new Notice('Invalid clone link: missing node identifier or repository');
				console.error(`❌ [URIHandler] Single clone missing identifier parameter`);
				return;
			}

			console.log(`🔗 [URIHandler] Deep link triggered!`);
			console.log(`🔗 [URIHandler] Identifier: ${id}`);

			// Determine if this is a Radicle ID or UUID
			const isRadicleId = id.startsWith('rad:');

			if (isRadicleId) {
				// Clone from Radicle network
				await this.cloneFromRadicle(id);
			} else {
				// Legacy UUID fallback (for Windows users)
				new Notice(`UUID-based links not yet implemented. Please ask sender to share via Radicle.`);
				console.warn(`⚠️ [URIHandler] UUID-based clone not implemented: ${id}`);
			}

		} catch (error) {
			console.error('Failed to handle clone link:', error);
			new Notice(`Failed to handle clone link: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Handle batch DreamNode clone URI
	 * Format: obsidian://interbrain-clone-batch?ids=<radicleId1,radicleId2,radicleId3>
	 */
	private async handleBatchNodeClone(params: Record<string, string>): Promise<void> {
		try {
			console.log(`🔗 [URIHandler] Batch clone handler called with params:`, params);
			const ids = params.ids || params.uuids; // Support both 'ids' (new) and 'uuids' (legacy)

			if (!ids) {
				new Notice('Invalid batch clone link: missing node identifiers');
				console.error(`❌ [URIHandler] Batch clone missing identifiers parameter`);
				return;
			}

			const idList = ids.split(',').map(u => u.trim()).filter(Boolean);

			if (idList.length === 0) {
				new Notice('Invalid batch clone link: no valid identifiers');
				return;
			}

			console.log(`🔗 [URIHandler] Batch deep link triggered!`);
			console.log(`🔗 [URIHandler] Identifiers (${idList.length}):`, idList);

			// Clone all nodes from Radicle network
			const notice = new Notice(`Cloning ${idList.length} DreamNodes...`, 0);

			let successCount = 0;
			let failCount = 0;

			for (const radicleId of idList) {
				if (radicleId.startsWith('rad:')) {
					const success = await this.cloneFromRadicle(radicleId, true); // silent mode
					if (success) {
						successCount++;
					} else {
						failCount++;
					}
				} else {
					console.warn(`⚠️ [URIHandler] Skipping non-Radicle ID: ${radicleId}`);
					failCount++;
				}
			}

			notice.hide();

			if (successCount > 0) {
				new Notice(`✅ Cloned ${successCount} DreamNode${successCount > 1 ? 's' : ''}`);
			}

			if (failCount > 0) {
				new Notice(`⚠️ ${failCount} node${failCount > 1 ? 's' : ''} failed to clone`);
			}

		} catch (error) {
			console.error('Failed to handle batch clone link:', error);
			new Notice(`Failed to handle batch clone: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Auto-focus a node after clone or when clicking already-cloned link
	 * Extracted helper to reuse for both new clones and existing nodes
	 */
	private async autoFocusNode(repoName: string, silent: boolean = false): Promise<void> {
		console.log(`🎯 [URIHandler] Auto-focusing "${repoName}"...`);

		// Find the node by repo name
		const allNodes = await this.dreamNodeService.list();
		const targetNode = allNodes.find(node => node.repoPath === repoName);

		if (!targetNode) {
			console.warn(`⚠️ [URIHandler] Could not find node with repoPath: ${repoName}`);
			return;
		}

		// Set selected node in store FIRST (prevents "no selectedNode available" warning)
		const store = useInterBrainStore.getState();
		store.setSelectedNode(targetNode);

		// Check if DreamSpace is open and has focus API
		const canvasAPI = (globalThis as any).__interbrainCanvas;
		if (!canvasAPI?.focusOnNode) {
			console.log(`ℹ️ [URIHandler] DreamSpace not open or focusOnNode not available`);
			return;
		}

		// Focus on the node (triggers liminal-web layout transition)
		const success = canvasAPI.focusOnNode(targetNode.id);
		if (success) {
			console.log(`✅ [URIHandler] Auto-focused "${repoName}" (${targetNode.id})`);

			if (!silent) {
				new Notice(`🎯 Node focused in DreamSpace!`);
			}
		} else {
			console.warn(`⚠️ [URIHandler] Failed to focus on "${repoName}"`);
		}
	}

	/**
	 * Clone a DreamNode from Radicle network
	 */
	private async cloneFromRadicle(radicleId: string, silent: boolean = false): Promise<boolean> {
		try {
			console.log(`🔗 [URIHandler] Cloning from Radicle: ${radicleId}`);

			// Get vault path
			const adapter = this.app.vault.adapter as any;
			const vaultPath = adapter.basePath || '';

			if (!vaultPath) {
				throw new Error('Could not determine vault path');
			}

			// Clone the repository (handles duplicate detection internally)
			if (!silent) {
				new Notice(`Cloning from Radicle network...`, 3000);
			}

			const cloneResult = await this.radicleService.clone(radicleId, vaultPath);

			// Check if repo already existed - if so, skip refresh but still focus
			if (cloneResult.alreadyExisted) {
				console.log(`ℹ️ [URIHandler] DreamNode already exists: ${cloneResult.repoName}`);
				if (!silent) {
					new Notice(`📌 DreamNode "${cloneResult.repoName}" already cloned!`);
				}

				// Auto-focus the existing node (same as newly cloned)
				await this.autoFocusNode(cloneResult.repoName, silent);

				return true; // Success - already have it, no refresh needed
			}

			console.log(`✅ [URIHandler] Successfully cloned: ${cloneResult.repoName}`);

			if (!silent) {
				new Notice(`✅ Cloned "${cloneResult.repoName}" successfully!`);
			}

			// AUTO-REFRESH: Make the newly cloned node appear immediately
			try {
				console.log(`🔄 [URIHandler] Auto-refreshing vault after clone...`);

				// Step 1: Rescan vault to detect the new DreamNode
				const scanStats = await this.dreamNodeService.scanVault();
				console.log(`📊 [URIHandler] Vault scan: +${scanStats.added} added, ~${scanStats.updated} updated`);

				// Step 2: Rescan DreamSong relationships (now optimized with parallel I/O!)
				const relationshipService = new DreamSongRelationshipService(this.plugin);
				const scanResult = await relationshipService.scanVaultForDreamSongRelationships();

				if (scanResult.success) {
					console.log(`✅ [URIHandler] Relationships rescanned in ${scanResult.stats.scanTimeMs}ms`);

					// Step 3: Apply constellation layout if DreamSpace is open
					const canvasAPI = (globalThis as any).__interbrainCanvas;
					if (canvasAPI?.applyConstellationLayout) {
						console.log(`🌌 [URIHandler] Applying constellation layout...`);
						await canvasAPI.applyConstellationLayout();

						// Step 4: Auto-focus the newly cloned node (reuses same logic as already-cloned case)
						await this.autoFocusNode(cloneResult.repoName, silent);
					} else {
						console.log(`ℹ️ [URIHandler] DreamSpace not open, skipping layout update`);
					}
				} else {
					console.warn(`⚠️ [URIHandler] Relationship scan failed:`, scanResult.error);
				}

			} catch (refreshError) {
				console.error(`❌ [URIHandler] Auto-refresh failed (non-critical):`, refreshError);
				// Don't fail the clone operation if refresh fails
			}

			return true;

		} catch (error) {
			console.error(`❌ [URIHandler] Clone failed for ${radicleId}:`, error);

			if (!silent) {
				const errorMsg = error instanceof Error ? error.message : 'Unknown error';
				new Notice(`Failed to clone: ${errorMsg}`);
			}

			return false;
		}
	}

	/**
	 * Clone a DreamNode from GitHub
	 */
	private async cloneFromGitHub(repoPath: string): Promise<boolean> {
		try {
			console.log(`🔗 [URIHandler] Cloning from GitHub: ${repoPath}`);

			// Get vault path
			const adapter = this.app.vault.adapter as any;
			const vaultPath = adapter.basePath || '';

			if (!vaultPath) {
				throw new Error('Could not determine vault path');
			}

			// Extract repo name from path (e.g., "github.com/user/dreamnode-uuid" → "dreamnode-uuid")
			const match = repoPath.match(/github\.com\/[^/]+\/([^/\s]+)/);
			if (!match) {
				throw new Error(`Invalid GitHub repository path: ${repoPath}`);
			}

			const repoName = match[1].replace(/\.git$/, '');
			const destinationPath = require('path').join(vaultPath, repoName);

			// Check if already exists
			const fs = require('fs');
			if (fs.existsSync(destinationPath)) {
				console.log(`ℹ️ [URIHandler] DreamNode already exists: ${repoName}`);
				new Notice(`📌 DreamNode "${repoName}" already cloned!`);

				// Auto-focus the existing node
				await this.autoFocusNode(repoName, false);
				return true;
			}

			// Show progress
			new Notice(`Cloning from GitHub...`, 3000);

			// Import GitHub service and clone
			const { githubService } = await import('../features/github-sharing/GitHubService');
			const githubUrl = `https://${repoPath}`;
			await githubService.clone(githubUrl, destinationPath);

			console.log(`✅ [URIHandler] Successfully cloned: ${repoName}`);
			new Notice(`✅ Cloned "${repoName}" successfully!`);

			// AUTO-REFRESH: Make the newly cloned node appear immediately
			try {
				console.log(`🔄 [URIHandler] Auto-refreshing vault after clone...`);

				// Step 1: Rescan vault to detect the new DreamNode
				const scanStats = await this.dreamNodeService.scanVault();
				console.log(`📊 [URIHandler] Vault scan: +${scanStats.added} added, ~${scanStats.updated} updated`);

				// Step 2: Rescan DreamSong relationships
				const relationshipService = new DreamSongRelationshipService(this.plugin);
				const scanResult = await relationshipService.scanVaultForDreamSongRelationships();

				if (scanResult.success) {
					console.log(`✅ [URIHandler] Relationships rescanned in ${scanResult.stats.scanTimeMs}ms`);

					// Step 3: Apply constellation layout if DreamSpace is open
					const canvasAPI = (globalThis as any).__interbrainCanvas;
					if (canvasAPI?.applyConstellationLayout) {
						console.log(`🌌 [URIHandler] Applying constellation layout...`);
						await canvasAPI.applyConstellationLayout();

						// Step 4: Auto-focus the newly cloned node
						await this.autoFocusNode(repoName, false);
					} else {
						console.log(`ℹ️ [URIHandler] DreamSpace not open, skipping layout update`);
					}
				} else {
					console.warn(`⚠️ [URIHandler] Relationship scan failed:`, scanResult.error);
				}

			} catch (refreshError) {
				console.error(`❌ [URIHandler] Auto-refresh failed (non-critical):`, refreshError);
				// Don't fail the clone operation if refresh fails
			}

			return true;

		} catch (error) {
			console.error(`❌ [URIHandler] GitHub clone failed for ${repoPath}:`, error);

			const errorMsg = error instanceof Error ? error.message : 'Unknown error';
			new Notice(`Failed to clone from GitHub: ${errorMsg}`);

			return false;
		}
	}

	/**
	 * Generate deep link URL for single DreamNode
	 * @param vaultName The Obsidian vault name (unused, kept for API compatibility)
	 * @param identifier Radicle ID (preferred) or UUID (fallback)
	 */
	static generateSingleNodeLink(vaultName: string, identifier: string): string {
		const encodedIdentifier = encodeURIComponent(identifier);
		return `obsidian://interbrain-clone?id=${encodedIdentifier}`;
	}

	/**
	 * Generate deep link URL for batch clone
	 * @param vaultName The Obsidian vault name (unused, kept for API compatibility)
	 * @param identifiers Array of Radicle IDs (preferred) or UUIDs (fallback)
	 */
	static generateBatchNodeLink(vaultName: string, identifiers: string[]): string {
		const encodedIdentifiers = encodeURIComponent(identifiers.join(','));
		return `obsidian://interbrain-clone-batch?ids=${encodedIdentifiers}`;
	}
}

// Singleton instance
let _uriHandlerService: URIHandlerService | null = null;

export function initializeURIHandlerService(app: App, plugin: Plugin, radicleService: RadicleService, dreamNodeService: DreamNodeService): void {
	_uriHandlerService = new URIHandlerService(app, plugin, radicleService, dreamNodeService);
	_uriHandlerService.registerHandlers();
	console.log(`🔗 [URIHandler] Service initialized`);
}

export function getURIHandlerService(): URIHandlerService {
	if (!_uriHandlerService) {
		throw new Error('URIHandlerService not initialized. Call initializeURIHandlerService() first.');
	}
	return _uriHandlerService;
}
