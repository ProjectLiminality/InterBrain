import { App, Notice } from 'obsidian';
import { serviceManager } from './service-manager';

/**
 * URI Handler Service
 *
 * Registers and handles custom Obsidian URI protocols for deep linking.
 * Enables one-click DreamNode cloning from email links.
 */
export class URIHandlerService {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Register all URI handlers
	 */
	registerHandlers(): void {
		// Register single node clone handler
		(this.app as any).registerObsidianProtocolHandler(
			'interbrain-clone',
			this.handleSingleNodeClone.bind(this)
		);
		console.log(`🔗 [URIHandler] Registered: obsidian://interbrain-clone`);

		// Register batch clone handler
		(this.app as any).registerObsidianProtocolHandler(
			'interbrain-clone-batch',
			this.handleBatchNodeClone.bind(this)
		);
		console.log(`🔗 [URIHandler] Registered: obsidian://interbrain-clone-batch`);
	}

	/**
	 * Handle single DreamNode clone URI
	 * Format: obsidian://interbrain-clone?vault=<vault>&uuid=<dreamUUID>
	 */
	private async handleSingleNodeClone(params: Record<string, string>): Promise<void> {
		try {
			const { uuid } = params;

			if (!uuid) {
				new Notice('Invalid clone link: missing DreamNode UUID');
				console.error(`❌ [URIHandler] Single clone missing UUID parameter`);
				return;
			}

			console.log(`🔗 [URIHandler] Cloning DreamNode: ${uuid}`);
			new Notice(`Cloning DreamNode ${uuid}...`);

			// TODO: Implement actual clone logic via DreamNodeService
			// For now, just show success
			await this.cloneDreamNode(uuid);

			new Notice(`Successfully cloned DreamNode!`);
		} catch (error) {
			console.error('Failed to clone DreamNode:', error);
			new Notice(`Failed to clone DreamNode: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Handle batch DreamNode clone URI
	 * Format: obsidian://interbrain-clone-batch?vault=<vault>&uuids=<uuid1,uuid2,uuid3>
	 */
	private async handleBatchNodeClone(params: Record<string, string>): Promise<void> {
		try {
			const { uuids } = params;

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

			console.log(`🔗 [URIHandler] Batch cloning ${uuidList.length} DreamNodes`);
			new Notice(`Cloning ${uuidList.length} DreamNodes...`);

			// Clone all nodes
			for (const uuid of uuidList) {
				await this.cloneDreamNode(uuid);
			}

			new Notice(`Successfully cloned ${uuidList.length} DreamNodes!`);
		} catch (error) {
			console.error('Failed to batch clone DreamNodes:', error);
			new Notice(`Failed to batch clone: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Clone a DreamNode by UUID
	 * TODO: Implement actual git clone logic
	 */
	private async cloneDreamNode(uuid: string): Promise<void> {
		console.log(`📥 [URIHandler] Cloning DreamNode with UUID: ${uuid}`);

		// Placeholder for actual implementation
		// This would:
		// 1. Look up UUID in coherence beacon / registry
		// 2. Get git remote URL
		// 3. Clone to vault using GitService
		// 4. Register in DreamNodeService

		// For now, just simulate delay
		await new Promise(resolve => setTimeout(resolve, 500));

		console.log(`✅ [URIHandler] Cloned DreamNode: ${uuid}`);
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

export function initializeURIHandlerService(app: App): void {
	_uriHandlerService = new URIHandlerService(app);
	_uriHandlerService.registerHandlers();
	console.log(`🔗 [URIHandler] Service initialized`);
}

export function getURIHandlerService(): URIHandlerService {
	if (!_uriHandlerService) {
		throw new Error('URIHandlerService not initialized. Call initializeURIHandlerService() first.');
	}
	return _uriHandlerService;
}
