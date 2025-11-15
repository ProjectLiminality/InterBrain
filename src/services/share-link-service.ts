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
	 *
	 * @param node - DreamNode to share
	 * @param recipientDid - Optional recipient DID to add as delegate (only for Radicle)
	 */
	async copyShareLink(node: DreamNode, recipientDid?: string): Promise<void> {
		try {
			// Validate node has required fields
			if (!node) {
				throw new Error('Node is undefined');
			}
			if (!node.repoPath) {
				throw new Error(`Node "${node.name}" has no repoPath`);
			}

			// Read UUID from .udd file (don't trust store state)
			const fs = require('fs').promises;
			const path = require('path');
			const uddPath = path.join((this.app.vault.adapter as any).basePath, node.repoPath, '.udd');

			let nodeUuid: string;
			try {
				const uddContent = await fs.readFile(uddPath, 'utf-8');
				const udd = JSON.parse(uddContent);
				nodeUuid = udd.uuid;

				if (!nodeUuid) {
					throw new Error(`Node "${node.name}" .udd file has no uuid field`);
				}
			} catch (error) {
				throw new Error(`Failed to read UUID from .udd file: ${error instanceof Error ? error.message : 'Unknown error'}`);
			}

			console.log(`🔗 [ShareLink] Generating share link for "${node.name}" (UUID: ${nodeUuid})...`);

			const vaultName = this.app.vault.getName();
			console.log(`🔗 [ShareLink] Vault name: ${vaultName}`);

			// Check if Radicle is available on this machine
			const radicleService = serviceManager.getRadicleService();
			const radicleAvailable = await radicleService.isAvailable();
			console.log(`🔗 [ShareLink] Radicle available: ${radicleAvailable}`);

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
					const uuidToRadicleIdMap = await batchInitService.ensureNodesHaveRadicleIds([nodeUuid]);
					radicleId = uuidToRadicleIdMap.get(nodeUuid) || null;

					if (radicleId) {
						console.log(`✅ [ShareLink] Node has Radicle ID: ${radicleId}`);

						// Change visibility to public and publish to network - run in parallel
						// Step 1: Make public (announces to network)
						// Step 2: rad publish (seeds to official nodes)
						console.log(`📡 [ShareLink] Making public and publishing to Radicle network...`);

						// Run the publish flow (RadicleService.share checks if already public)
						// Pass recipientDid if provided to automatically add them as delegate
						// Convert relative repoPath to absolute path using vault base path
					const absoluteRepoPath = path.join((this.app.vault.adapter as any).basePath, node.repoPath);
					radicleService.share(absoluteRepoPath, undefined, recipientDid)
							.then(() => {
								console.log(`✅ [ShareLink] Successfully published "${node.name}" to Radicle network`);
								if (recipientDid) {
									new Notice(`📡 "${node.name}" published and shared with recipient!`);
								} else {
									new Notice(`📡 "${node.name}" published to Radicle network!`);
								}
							})
							.catch((error) => {
								console.error(`❌ [ShareLink] Failed to publish "${node.name}":`, error);
								new Notice(`⚠️ Failed to publish "${node.name}" to network (link still works for direct connections)`);
							});
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
					deepLink = URIHandlerService.generateSingleNodeLink(vaultName, nodeUuid, senderDid, senderName);
					identifier = nodeUuid;
					console.warn(`⚠️ [ShareLink] Using UUID fallback (Radicle init may have failed)`);
				}
			} else {
				// Radicle not available - use GitHub fallback
				console.log(`🧪 [ShareLink] Radicle not available - ensuring node has GitHub URL...`);

				let githubUrl: string | null = null;

				try {
					const batchShareService = getGitHubBatchShareService();
					const uuidToGitHubUrlMap = await batchShareService.ensureNodesHaveGitHubUrls([nodeUuid]);
					githubUrl = uuidToGitHubUrlMap.get(nodeUuid) || null;

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
					deepLink = URIHandlerService.generateSingleNodeLink(vaultName, nodeUuid);
					identifier = nodeUuid;
					console.warn(`⚠️ [ShareLink] Using UUID fallback (GitHub push may have failed)`);
				}
			}

			// Validate that we have a link
			if (!deepLink || !identifier) {
				throw new Error('Failed to generate share link: identifier or deepLink is undefined');
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
