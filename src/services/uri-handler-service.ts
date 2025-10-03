import { App, Notice, Plugin } from 'obsidian';
import { serviceManager } from './service-manager';

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
	 * Format: obsidian://interbrain-clone?vault=<vault>&uuid=<dreamUUID>
	 */
	private async handleSingleNodeClone(params: Record<string, string>): Promise<void> {
		try {
			console.log(`🔗 [URIHandler] Single clone handler called with params:`, params);
			const { uuid, vault } = params;

			if (!uuid) {
				new Notice('Invalid clone link: missing DreamNode UUID');
				console.error(`❌ [URIHandler] Single clone missing UUID parameter`);
				return;
			}

			console.log(`🔗 [URIHandler] Deep link triggered!`);
			console.log(`🔗 [URIHandler] Vault: ${vault || 'not specified'}`);
			console.log(`🔗 [URIHandler] DreamNode UUID: ${uuid}`);
			new Notice(`🔗 Deep link clicked! UUID: ${uuid}`);

			// TODO: Implement actual clone logic via DreamNodeService in future epic
			// For now, just show proof of concept
			console.log(`✅ [URIHandler] Deep link proof of concept working - ready for clone implementation`);
		} catch (error) {
			console.error('Failed to handle clone link:', error);
			new Notice(`Failed to handle clone link: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Handle batch DreamNode clone URI
	 * Format: obsidian://interbrain-clone-batch?vault=<vault>&uuids=<uuid1,uuid2,uuid3>
	 */
	private async handleBatchNodeClone(params: Record<string, string>): Promise<void> {
		try {
			console.log(`🔗 [URIHandler] Batch clone handler called with params:`, params);
			const { uuids, vault } = params;

			if (!uuids) {
				new Notice('Invalid batch clone link: missing UUIDs');
				console.error(`❌ [URIHandler] Batch clone missing uuids parameter`);
				return;
			}

			const uuidList = uuids.split(',').map(u => u.trim()).filter(Boolean);

			if (uuidList.length === 0) {
				new Notice('Invalid batch clone link: no valid UUIDs');
				return;
			}

			console.log(`🔗 [URIHandler] Batch deep link triggered!`);
			console.log(`🔗 [URIHandler] Vault: ${vault || 'not specified'}`);
			console.log(`🔗 [URIHandler] DreamNode UUIDs (${uuidList.length}):`, uuidList);
			new Notice(`🔗 Batch deep link clicked! ${uuidList.length} nodes`);

			// TODO: Implement actual batch clone logic in future epic
			// For now, just show proof of concept
			console.log(`✅ [URIHandler] Batch deep link proof of concept working - ready for clone implementation`);
		} catch (error) {
			console.error('Failed to handle batch clone link:', error);
			new Notice(`Failed to handle batch clone: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Generate deep link URL for single DreamNode
	 */
	static generateSingleNodeLink(vaultName: string, dreamUUID: string): string {
		const encodedVault = encodeURIComponent(vaultName);
		const encodedUUID = encodeURIComponent(dreamUUID);
		return `obsidian://interbrain-clone?vault=${encodedVault}&uuid=${encodedUUID}`;
	}

	/**
	 * Generate deep link URL for batch clone
	 */
	static generateBatchNodeLink(vaultName: string, dreamUUIDs: string[]): string {
		const encodedVault = encodeURIComponent(vaultName);
		const encodedUUIDs = encodeURIComponent(dreamUUIDs.join(','));
		return `obsidian://interbrain-clone-batch?vault=${encodedVault}&uuids=${encodedUUIDs}`;
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
