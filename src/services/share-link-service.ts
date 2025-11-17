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

export class ShareLinkService {
	private app: App;
	private plugin: any;

	constructor(app: App, plugin: any) {
		this.app = app;
		this.plugin = plugin;
	}

	/**
	 * Generate share link for a single DreamNode (no clipboard copy)
	 * Ensures node is properly initialized for Radicle before generating link
	 *
	 * @param node - DreamNode to share
	 * @param recipientDid - Optional recipient DID to add as delegate
	 * @returns Object with URI and identifier (Radicle ID or UUID fallback)
	 */
	async generateShareLink(node: DreamNode, recipientDid?: string): Promise<{ uri: string; identifier: string }> {
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

			// Get Radicle service
			const radicleService = serviceManager.getRadicleService();
			const radicleAvailable = await radicleService.isAvailable();

			if (!radicleAvailable) {
				throw new Error('Radicle is not available - InterBrain now requires Radicle for sharing');
			}

			let senderDid: string | undefined;
			let senderName: string | undefined;
			let senderEmail: string | undefined;

			// Get sender's identity for collaboration handshake
			try {
				const identity = await radicleService.getIdentity();
				senderDid = identity.did;
				senderName = identity.alias || 'Friend';
				console.log(`👤 [ShareLink] Sender identity: ${senderName} (${senderDid})`);
			} catch (error) {
				console.warn('⚠️ [ShareLink] Could not get Radicle identity:', error);
			}

			// Get sender's email from settings (optional)
			senderEmail = this.plugin.settings?.userEmail || undefined;
			if (senderEmail) {
				console.log(`📧 [ShareLink] Sender email: ${senderEmail}`);
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

					// Publish to network and add delegate if recipient DID provided
					console.log(`📡 [ShareLink] Publishing to Radicle network...`);
					const absoluteRepoPath = path.join((this.app.vault.adapter as any).basePath, node.repoPath);

					// Call share synchronously (wait for completion)
					await radicleService.share(absoluteRepoPath, undefined, recipientDid);
					console.log(`✅ [ShareLink] Successfully published "${node.name}" to Radicle network`);
				}
			} catch (error) {
				console.error('❌ [ShareLink] Failed to ensure Radicle ID:', error);
				throw error;
			}

			// Generate URI
			let uri: string;
			let identifier: string;

			if (radicleId) {
				// Primary: Radicle ID (peer-to-peer) with collaboration handshake
				uri = URIHandlerService.generateSingleNodeLink(vaultName, radicleId, senderDid, senderName, senderEmail);
				identifier = radicleId;
			} else {
				// Fallback: UUID (if Radicle init somehow failed but didn't throw)
				uri = URIHandlerService.generateSingleNodeLink(vaultName, nodeUuid, senderDid, senderName, senderEmail);
				identifier = nodeUuid;
				console.warn(`⚠️ [ShareLink] Using UUID fallback (Radicle init may have failed)`);
			}

			return { uri, identifier };

		} catch (error) {
			console.error('Failed to generate share link:', error);
			throw new Error(`Share link generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Generate and copy share link for a single DreamNode
	 * Ensures node is properly initialized for Radicle before generating link
	 *
	 * @param node - DreamNode to share
	 * @param recipientDid - Optional recipient DID to add as delegate (only for Radicle)
	 */
	async copyShareLink(node: DreamNode, recipientDid?: string): Promise<void> {
		try {
			// Use the core generateShareLink method
			const { uri } = await this.generateShareLink(node, recipientDid);

			// Copy to clipboard
			await navigator.clipboard.writeText(uri);

			// Show success notification
			if (recipientDid) {
				new Notice(`📡 "${node.name}" shared with recipient! Link copied.`);
			} else {
				new Notice(`📋 Share link copied to clipboard!`);
			}
			console.log(`✅ [ShareLink] Link copied: ${uri}`);

		} catch (error) {
			console.error('Failed to copy share link:', error);
			throw new Error(`Share link copy failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}
}
