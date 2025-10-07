import { App, Notice, Plugin } from 'obsidian';

/**
 * URI Handler Service
 *
 * Registers and handles custom Obsidian URI protocols for deep linking.
 * Enables one-click DreamNode cloning from email links.
 */
export class URIHandlerService {
	private app: App;
	private plugin: Plugin;

	constructor(app: App, plugin: Plugin) {
		this.app = app;
		this.plugin = plugin;
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
	 * Format: obsidian://interbrain-clone?vault=<vault>&uuid=<radicleId or uuid>
	 */
	private async handleSingleNodeClone(params: Record<string, string>): Promise<void> {
		try {
			console.log(`🔗 [URIHandler] Single clone handler called with params:`, params);
			const { uuid, vault } = params; // 'uuid' param actually contains Radicle ID now

			if (!uuid) {
				new Notice('Invalid clone link: missing node identifier');
				console.error(`❌ [URIHandler] Single clone missing identifier parameter`);
				return;
			}

			console.log(`🔗 [URIHandler] Deep link triggered!`);
			console.log(`🔗 [URIHandler] Vault: ${vault || 'not specified'}`);
			console.log(`🔗 [URIHandler] Radicle ID: ${uuid}`);

			// Determine if this is a Radicle ID or UUID
			const isRadicleId = uuid.startsWith('rad:');

			if (isRadicleId) {
				// Clone from Radicle network
				await this.cloneFromRadicle(uuid);
			} else {
				// Legacy UUID fallback (for Windows users)
				new Notice(`UUID-based links not yet implemented. Please ask sender to share via Radicle.`);
				console.warn(`⚠️ [URIHandler] UUID-based clone not implemented: ${uuid}`);
			}

		} catch (error) {
			console.error('Failed to handle clone link:', error);
			new Notice(`Failed to handle clone link: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Handle batch DreamNode clone URI
	 * Format: obsidian://interbrain-clone-batch?vault=<vault>&uuids=<radicleId1,radicleId2,radicleId3>
	 */
	private async handleBatchNodeClone(params: Record<string, string>): Promise<void> {
		try {
			console.log(`🔗 [URIHandler] Batch clone handler called with params:`, params);
			const { uuids, vault } = params; // 'uuids' param actually contains Radicle IDs now

			if (!uuids) {
				new Notice('Invalid batch clone link: missing node identifiers');
				console.error(`❌ [URIHandler] Batch clone missing identifiers parameter`);
				return;
			}

			const idList = uuids.split(',').map(u => u.trim()).filter(Boolean);

			if (idList.length === 0) {
				new Notice('Invalid batch clone link: no valid identifiers');
				return;
			}

			console.log(`🔗 [URIHandler] Batch deep link triggered!`);
			console.log(`🔗 [URIHandler] Vault: ${vault || 'not specified'}`);
			console.log(`🔗 [URIHandler] Radicle IDs (${idList.length}):`, idList);

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
	 * Clone a DreamNode from Radicle network
	 */
	private async cloneFromRadicle(radicleId: string, silent: boolean = false): Promise<boolean> {
		try {
			console.log(`🔗 [URIHandler] Cloning from Radicle: ${radicleId}`);

			// Get services
			const { serviceManager } = require('./service-manager');
			const radicleService = serviceManager.getRadicleService();

			// Get vault path
			const adapter = this.app.vault.adapter as any;
			const vaultPath = adapter.path || adapter.basePath || '';

			if (!vaultPath) {
				throw new Error('Could not determine vault path');
			}

			// Clone the repository
			if (!silent) {
				new Notice(`Cloning from Radicle network...`, 3000);
			}

			const repoName = await radicleService.clone(radicleId, vaultPath);

			console.log(`✅ [URIHandler] Successfully cloned: ${repoName}`);

			if (!silent) {
				new Notice(`✅ Cloned "${repoName}" successfully!`);
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
	 * Generate deep link URL for single DreamNode
	 * @param vaultName The Obsidian vault name
	 * @param identifier Radicle ID (preferred) or UUID (fallback)
	 */
	static generateSingleNodeLink(vaultName: string, identifier: string): string {
		const encodedVault = encodeURIComponent(vaultName);
		const encodedIdentifier = encodeURIComponent(identifier);
		return `obsidian://interbrain-clone?vault=${encodedVault}&uuid=${encodedIdentifier}`;
	}

	/**
	 * Generate deep link URL for batch clone
	 * @param vaultName The Obsidian vault name
	 * @param identifiers Array of Radicle IDs (preferred) or UUIDs (fallback)
	 */
	static generateBatchNodeLink(vaultName: string, identifiers: string[]): string {
		const encodedVault = encodeURIComponent(vaultName);
		const encodedIdentifiers = encodeURIComponent(identifiers.join(','));
		return `obsidian://interbrain-clone-batch?vault=${encodedVault}&uuids=${encodedIdentifiers}`;
	}
}

// Singleton instance
let _uriHandlerService: URIHandlerService | null = null;

export function initializeURIHandlerService(app: App, plugin: Plugin): void {
	_uriHandlerService = new URIHandlerService(app, plugin);
	_uriHandlerService.registerHandlers();
	console.log(`🔗 [URIHandler] Service initialized`);
}

export function getURIHandlerService(): URIHandlerService {
	if (!_uriHandlerService) {
		throw new Error('URIHandlerService not initialized. Call initializeURIHandlerService() first.');
	}
	return _uriHandlerService;
}
