/**
 * Share Link Service
 *
 * Generates and copies share links for DreamNodes with collaboration handshake
 */

import { App, Notice } from 'obsidian';
import { DreamNode } from '../../dreamnode';
import { URIHandlerService } from '../../uri-handler';
import { serviceManager } from '../../../core/services/service-manager';
import { getRadicleBatchInitService } from '../../social-resonance-filter/services/batch-init-service';

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
			} catch {
				// Could not get Radicle identity - continue without it
			}

			// Get sender's email from settings (optional)
			senderEmail = this.plugin.settings?.userEmail || undefined;

			// Ensure node has Radicle ID (initialize if needed)
			// Note: rad init --private auto-seeds the repo, making it available for direct P2P cloning
			// No need to call share() - recipients clone directly using RID + sender NID
			let radicleId: string | null = null;

			try {
				const batchInitService = getRadicleBatchInitService();
				const uuidToRadicleIdMap = await batchInitService.ensureNodesHaveRadicleIds([nodeUuid]);
				radicleId = uuidToRadicleIdMap.get(nodeUuid) || null;

				if (radicleId && recipientDid) {
					// Fire-and-forget: Add recipient as delegate so they can push back
					// This doesn't block link generation - clone works via --seed flag anyway
					const absoluteRepoPath = path.join((this.app.vault.adapter as any).basePath, node.repoPath);
					radicleService.addDelegate(absoluteRepoPath, recipientDid).catch((err: Error) => {
						console.warn('[ShareLink] Failed to add delegate (non-blocking):', err.message);
					});
				}
			} catch (error) {
				console.error('[ShareLink] Failed to ensure Radicle ID:', error);
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
				console.warn('[ShareLink] Using UUID fallback (Radicle init may have failed)');
			}

			return { uri, identifier };

		} catch (error) {
			console.error('[ShareLink] Failed to generate share link:', error);
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
			const { uri, identifier } = await this.generateShareLink(node, recipientDid);

			// Copy to clipboard immediately (snappy UX)
			await navigator.clipboard.writeText(uri);

			// Show success notification
			if (recipientDid) {
				new Notice(`"${node.name}" shared with recipient! Link copied.`);
			} else {
				new Notice(`Share link copied to clipboard!`);
			}

			// FIRE-AND-FORGET: Trigger background seeding for public discoverability
			// This runs async without blocking the clipboard copy operation
			const radicleService = serviceManager.getRadicleService();
			const radicleAvailable = await radicleService.isAvailable();

			if (radicleAvailable && identifier.startsWith('rad:')) {
				const path = require('path');
				const absoluteRepoPath = path.join((this.app.vault.adapter as any).basePath, node.repoPath);

				radicleService.seedInBackground(absoluteRepoPath, identifier);
			}

		} catch (error) {
			console.error('[ShareLink] Failed to copy share link:', error);
			throw new Error(`Share link copy failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}
}
