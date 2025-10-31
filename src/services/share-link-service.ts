/**
 * Share Link Service
 *
 * Generates and copies share links for DreamNodes with collaboration handshake
 */

import { App, Notice } from 'obsidian';
import { DreamNode } from '../types/dreamnode';
import { URIHandlerService } from './uri-handler-service';
import { serviceManager } from './service-manager';
import { getRadicleBatchInitService } from './radicle-batch-init-service';
import { getGitHubBatchShareService } from './github-batch-share-service';

export class ShareLinkService {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Generate and copy share link for a single DreamNode
	 * Ensures node is properly initialized for Radicle/GitHub before generating link
	 */
	async copyShareLink(node: DreamNode): Promise<void> {
		try {
			console.log(`🔗 [ShareLink] Generating share link for "${node.name}"...`);

			const vaultName = this.app.vault.getName();

			// Check if Radicle is available on this machine
			const radicleService = serviceManager.getRadicleService();
			const radicleAvailable = await radicleService.isAvailable();

			let deepLink: string;
			let identifier: string;
			let senderDid: string | undefined;
			let senderName: string | undefined;

			if (radicleAvailable) {
				// Get sender's identity for collaboration handshake
				try {
					const identity = await radicleService.getIdentity();
					senderDid = identity.did;
					senderName = identity.alias || 'Friend';
					console.log(`👤 [ShareLink] Sender identity: ${senderName} (${senderDid})`);
				} catch (error) {
					console.warn('⚠️ [ShareLink] Could not get Radicle identity:', error);
				}

				// Ensure node has Radicle ID (initialize if needed)
				console.log(`🔮 [ShareLink] Ensuring node has Radicle ID...`);

				let radicleId: string | null = null;

				try {
					const batchInitService = getRadicleBatchInitService();
					const uuidToRadicleIdMap = await batchInitService.ensureNodesHaveRadicleIds([node.uuid]);
					radicleId = uuidToRadicleIdMap.get(node.uuid) || null;

					if (radicleId) {
						console.log(`✅ [ShareLink] Node has Radicle ID: ${radicleId}`);
					}
				} catch (error) {
					console.error('❌ [ShareLink] Failed to ensure Radicle ID:', error);
					// Continue with fallback
				}

				if (radicleId) {
					// Primary: Radicle ID (peer-to-peer) with collaboration handshake
					deepLink = URIHandlerService.generateSingleNodeLink(vaultName, radicleId, senderDid, senderName);
					identifier = radicleId;
				} else {
					// Fallback: UUID
					deepLink = URIHandlerService.generateSingleNodeLink(vaultName, node.uuid, senderDid, senderName);
					identifier = node.uuid;
					console.warn(`⚠️ [ShareLink] Using UUID fallback (Radicle init may have failed)`);
				}
			} else {
				// Radicle not available - use GitHub fallback
				console.log(`🧪 [ShareLink] Radicle not available - ensuring node has GitHub URL...`);

				let githubUrl: string | null = null;

				try {
					const batchShareService = getGitHubBatchShareService();
					const uuidToGitHubUrlMap = await batchShareService.ensureNodesHaveGitHubUrls([node.uuid]);
					githubUrl = uuidToGitHubUrlMap.get(node.uuid) || null;

					if (githubUrl) {
						console.log(`✅ [ShareLink] Node has GitHub URL: ${githubUrl}`);
					}
				} catch (error) {
					console.error('❌ [ShareLink] Failed to ensure GitHub URL:', error);
					// Continue with fallback
				}

				if (githubUrl) {
					// GitHub fallback
					deepLink = URIHandlerService.generateGitHubCloneLink(vaultName, githubUrl);
					identifier = githubUrl.replace(/^https?:\/\//, '');
				} else {
					// Last resort: UUID
					deepLink = URIHandlerService.generateSingleNodeLink(vaultName, node.uuid);
					identifier = node.uuid;
					console.warn(`⚠️ [ShareLink] Using UUID fallback (GitHub push may have failed)`);
				}
			}

			// Copy to clipboard
			await navigator.clipboard.writeText(deepLink);

			// Show success notification
			new Notice(`📋 Share link copied to clipboard!`);
			console.log(`✅ [ShareLink] Link copied: ${deepLink}`);

		} catch (error) {
			console.error('Failed to generate share link:', error);
			throw new Error(`Share link generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}
}
