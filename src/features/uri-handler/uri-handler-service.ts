import { App, Notice, Plugin } from 'obsidian';
import { RadicleService } from '../social-resonance/radicle-service';
import { GitDreamNodeService } from '../dreamnode/services/git-dreamnode-service';
import { DreamSongRelationshipService } from '../dreamweaving/services/dreamsong-relationship-service';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { DreamNode } from '../dreamnode';

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
	private dreamNodeService: GitDreamNodeService;

	constructor(app: App, plugin: Plugin, radicleService: RadicleService, dreamNodeService: GitDreamNodeService) {
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
			// Register unified clone handler (handles both single and batch clones)
			// Format: obsidian://interbrain-clone?ids=<id1,id2,...>&senderDid=<did>&senderName=<name>
			// Single: ids=rad:z1234 → selects cloned Dream node
			// Batch:  ids=rad:z1234,rad:z5678 → selects Dreamer node
			this.plugin.registerObsidianProtocolHandler(
				'interbrain-clone',
				this.handleClone.bind(this)
			);
			console.log(`🔗 [URIHandler] Registered: obsidian://interbrain-clone`);

			// Register update-contact handler for DID backpropagation
			// Format: obsidian://interbrain-update-contact?did=<did>&uuid=<dreamer-uuid>&name=<name>&email=<email>
			this.plugin.registerObsidianProtocolHandler(
				'interbrain-update-contact',
				this.handleUpdateContact.bind(this)
			);
			console.log(`🔗 [URIHandler] Registered: obsidian://interbrain-update-contact`);
		} catch (error) {
			console.error('Failed to register URI handlers:', error);
			console.warn(`⚠️ [URIHandler] Deep links will not be functional`);
		}
	}

	/**
	 * Unified clone handler - handles both single and batch clones
	 * Format: obsidian://interbrain-clone?ids=<id1,id2,...>&senderDid=<did>&senderName=<name>
	 *
	 * Selection logic:
	 * - Single ID (ids=rad:z1234): Selects the cloned Dream node
	 * - Multiple IDs (ids=rad:z1234,rad:z5678): Selects the Dreamer node
	 */
	private async handleClone(params: Record<string, string>): Promise<void> {
		try {
			const ids = params.ids || params.id || params.uuid || params.uuids; // Support all legacy formats
			const senderDid = params.senderDid ? decodeURIComponent(params.senderDid) : undefined;
			const senderName = params.senderName ? decodeURIComponent(params.senderName) : undefined;

			console.log(`🔗 [URIHandler] Clone request:`, { ids, senderDid, senderName });

			if (!ids) {
				new Notice('Invalid clone link: missing node identifiers');
				console.error(`❌ [URIHandler] Clone missing identifiers parameter`);
				return;
			}

			const identifiers = ids.split(',').map(u => u.trim()).filter(Boolean);

			if (identifiers.length === 0) {
				new Notice('Invalid clone link: no valid identifiers');
				return;
			}

			const isSingleClone = identifiers.length === 1;
			console.log(`🔗 [URIHandler] ${isSingleClone ? 'Single' : 'Batch'} clone with ${identifiers.length} identifier(s)`);

			// Classify each identifier
			const classified = identifiers.map(id => ({
				raw: id,
				type: this.classifyIdentifier(id)
			}));

			// Show progress notification
			const notice = new Notice(`Cloning ${identifiers.length} DreamNode${identifiers.length > 1 ? 's' : ''} in parallel...`, 0);

			// PARALLELIZED: Clone all nodes simultaneously
			const clonePromises = classified.map(async ({ raw, type }) => {
				try {
					// Determine clone method based on type
					let result: 'success' | 'skipped' | 'error';
					if (type === 'github') {
						result = await this.cloneFromGitHub(raw, true); // silent=true
					} else if (type === 'radicle') {
						result = await this.cloneFromRadicle(raw, true); // silent=true
					} else {
						console.warn(`⚠️ [URIHandler] UUID-based clone not implemented: ${raw}`);
						return { result: 'error', identifier: raw, type };
					}

					return { result, identifier: raw, type };
				} catch (error) {
					console.error(`❌ [URIHandler] Failed to clone ${type} identifier "${raw}":`, error);
					return { result: 'error' as const, identifier: raw, type };
				}
			});

			// Wait for all clones to complete
			const results = await Promise.all(clonePromises);

			// Count results
			let successCount = 0;
			let skipCount = 0;
			let errorCount = 0;

			results.forEach(({ result }) => {
				if (result === 'success') successCount++;
				else if (result === 'skipped') skipCount++;
				else errorCount++;
			});

			notice.hide();

			// Show comprehensive summary
			const parts: string[] = [];
			if (successCount > 0) parts.push(`${successCount} cloned`);
			if (skipCount > 0) parts.push(`${skipCount} already existed`);
			if (errorCount > 0) parts.push(`${errorCount} failed`);

			const summary = parts.join(', ');
			new Notice(`✅ Clone complete: ${summary}`);

			// Determine if anything actually changed (new clones vs all already existed)
			const allNodesAlreadyExisted = successCount === 0 && skipCount > 0;
			console.log(`🔍 [URIHandler] All nodes already existed: ${allNodesAlreadyExisted} (${successCount} new, ${skipCount} skipped)`);

			// If we have sender info, handle collaboration handshake
			if (senderDid && senderName) {
				if (allNodesAlreadyExisted) {
					// FAST PATH: All nodes already exist - but still need to ensure Dreamer + relationships are set up
					console.log(`⚡ [URIHandler] Fast path - all DreamNodes existed, checking Dreamer and relationships...`);

					// Get current store state (nodes already loaded)
					const store = useInterBrainStore.getState();

					// Convert Map to array for searching
					const nodesArray = Array.from(store.dreamNodes.values()).map(nodeData => nodeData.node);

					// Check if Dreamer node exists
					let dreamerNode = nodesArray.find((n: any) => n.type === 'dreamer' && n.did === senderDid);

					// Extract senderEmail from params if available
					const senderEmail = params.senderEmail ? decodeURIComponent(params.senderEmail) : undefined;

					if (!dreamerNode) {
						console.log(`🔄 [URIHandler] Dreamer node doesn't exist - creating it...`);
						// Need to create Dreamer node and link relationships
						await this.dreamNodeService.scanVault();
						dreamerNode = await this.findOrCreateDreamerNode(senderDid, senderName, senderEmail);
						await new Promise(resolve => setTimeout(resolve, 200));

						// Link all cloned nodes to the Dreamer
						for (const identifier of identifiers) {
							try {
								const clonedNode = await this.findNodeByIdentifier(identifier);
								if (clonedNode) {
									await this.linkNodes(clonedNode, dreamerNode);
								}
							} catch (linkError) {
								console.error(`❌ [URIHandler] Failed to link ${identifier}:`, linkError);
							}
						}

						// Sync Radicle peer relationships
						try {
							console.log(`🔄 [URIHandler] Syncing Radicle peer relationships...`);
							await (this.app as any).commands.executeCommandById('interbrain:sync-radicle-peer-following');
						} catch (syncError) {
							console.error(`❌ [URIHandler] Radicle peer sync failed (non-critical):`, syncError);
						}
					} else {
						// Dreamer exists - check if relationships are properly set up
						console.log(`✅ [URIHandler] Dreamer node exists: "${dreamerNode.name}"`);

						// CRITICAL: Load UUID from .udd file for linkNodes() compatibility
						const fs = require('fs').promises;
						const path = require('path');
						const uddPath = path.join((this.app.vault.adapter as any).basePath, dreamerNode.repoPath, '.udd');

						try {
							const uddContent = await fs.readFile(uddPath, 'utf-8');
							const udd = JSON.parse(uddContent);
							const dreamerUuid = udd.uuid;
							console.log(`✅ [URIHandler] Loaded UUID for existing Dreamer: ${dreamerUuid}`);
						} catch (error) {
							console.error(`❌ [URIHandler] Failed to read UUID from existing Dreamer:`, error);
						}

						// Check if all cloned nodes are linked to this Dreamer
						let missingLinks = false;
						for (const identifier of identifiers) {
							const clonedNode = await this.findNodeByIdentifier(identifier);
							if (clonedNode && !dreamerNode.liminalWebConnections?.includes(clonedNode.id)) {
								console.log(`🔄 [URIHandler] Missing relationship: Dreamer "${dreamerNode.name}" ↔ "${clonedNode.name}"`);
								missingLinks = true;
								await this.linkNodes(clonedNode, dreamerNode);
							}
						}

						if (missingLinks) {
							// Refresh store to reflect new relationships in UI
							console.log(`🔄 [URIHandler] Refreshing store with new relationships...`);
							await this.dreamNodeService.scanVault();

							// Re-sync Radicle relationships if we added any new links
							try {
								console.log(`🔄 [URIHandler] Re-syncing Radicle peer relationships...`);
								await (this.app as any).commands.executeCommandById('interbrain:sync-radicle-peer-following');
							} catch (syncError) {
								console.error(`❌ [URIHandler] Radicle peer sync failed (non-critical):`, syncError);
							}
						}
					}

					// Select the appropriate target node
					let targetNode: any;
					if (isSingleClone) {
						// Single clone: Select the cloned Dream node
						targetNode = nodesArray.find(n => {
							if (identifiers[0].startsWith('rad:')) {
								return n.radicleId === identifiers[0];
							}
							if (identifiers[0].includes('github.com/')) {
								return n.githubRepoUrl?.includes(identifiers[0]);
							}
							return false;
						});
						console.log(`⚡ [URIHandler] Single clone - selecting Dream node: ${targetNode?.name}`);
					} else {
						// Batch clone: Select the Dreamer node
						targetNode = dreamerNode;
						console.log(`⚡ [URIHandler] Batch clone - selecting Dreamer node: ${dreamerNode?.name}`);
					}

					if (targetNode) {
						// Directly select the node in the store (no refresh needed)
						store.setSelectedNode(targetNode);
						console.log(`✅ [URIHandler] Fast path complete - node selected with relationships verified`);
					} else {
						console.warn(`⚠️ [URIHandler] Fast path failed - could not find target node, falling back to refresh`);
						await (this.app as any).commands.executeCommandById('interbrain:refresh-plugin');
					}

				} else {
					// FULL PATH: New nodes were cloned - run complete workflow
					console.log(`🔄 [URIHandler] Full path - new nodes cloned, running complete workflow...`);

					// CRITICAL: Scan vault FIRST to ensure all cloned nodes are in the store
					console.log(`🔄 [URIHandler] Scanning vault to register ${successCount + skipCount} cloned node(s)...`);
					await this.dreamNodeService.scanVault();

					// Extract senderEmail from params if available
					const senderEmail = params.senderEmail ? decodeURIComponent(params.senderEmail) : undefined;

					// Find or create the Dreamer node
					const dreamerNode = await this.findOrCreateDreamerNode(senderDid, senderName, senderEmail);
					await new Promise(resolve => setTimeout(resolve, 200));

					// Link all successfully cloned nodes to the Dreamer node
					for (const { result, identifier } of results) {
						if (result === 'success' || result === 'skipped') {
							try {
								const clonedNode = await this.findNodeByIdentifier(identifier);
								if (clonedNode) {
									await this.linkNodes(clonedNode, dreamerNode);
								} else {
									console.warn(`⚠️ [URIHandler] Node not found after vault scan: ${identifier}`);
								}
							} catch (linkError) {
								console.error(`❌ [URIHandler] Failed to link ${identifier}:`, linkError);
							}
						}
					}

					// Sync Radicle peer relationships (follow, delegate, remotes, seeding scope)
					try {
						console.log(`🔄 [URIHandler] Syncing Radicle peer relationships for Dreamer "${dreamerNode.name}"...`);
						await (this.app as any).commands.executeCommandById('interbrain:sync-radicle-peer-following');
						console.log(`✅ [URIHandler] Radicle peer sync complete`);
					} catch (syncError) {
						console.error(`❌ [URIHandler] Radicle peer sync failed (non-critical):`, syncError);
					}

					// FINAL STEP: Refresh UI with smart selection
					try {
						let targetUUID: string | undefined;

						if (isSingleClone) {
							// Single clone: Select the cloned Dream node
							const clonedNode = await this.findNodeByIdentifier(identifiers[0]);
							targetUUID = clonedNode?.id;
							console.log(`🔄 [URIHandler] Single clone - selecting Dream node: ${clonedNode?.name} (${targetUUID})`);
						} else {
							// Batch clone: Select the Dreamer node
							targetUUID = dreamerNode.id;
							console.log(`🔄 [URIHandler] Batch clone - selecting Dreamer node: ${dreamerNode.name} (${targetUUID})`);
						}

						// CRITICAL: Set target UUID BEFORE calling refresh command
						if (targetUUID) {
							(globalThis as any).__interbrainReloadTargetUUID = targetUUID;
							console.log(`✅ [URIHandler] Target UUID stored in globalThis.__interbrainReloadTargetUUID`);
						}

						// Trigger refresh command
						console.log(`🔄 [URIHandler] Triggering plugin refresh...`);
						await (this.app as any).commands.executeCommandById('interbrain:refresh-plugin');
						console.log(`✅ [URIHandler] Clone complete - node selected with all relationships visible`);
					} catch (refreshError) {
						console.error(`❌ [URIHandler] Refresh failed:`, refreshError);
					}
				}
			}

		} catch (error) {
			console.error('Failed to handle clone link:', error);
			new Notice(`Failed to handle clone: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Handle contact update (DID backpropagation from Bob → Alice)
	 * Format: obsidian://interbrain-update-contact?did=<did>&uuid=<dreamer-uuid>&name=<name>&email=<email>
	 *
	 * This enables the collaboration handshake completion:
	 * 1. Alice shares with Bob → Bob installs → Bob gets Alice's DID
	 * 2. Bob shares DID back to Alice via this URI
	 * 3. Alice's Dreamer node for Bob gets updated with his DID
	 * 4. Sync command auto-triggers → mutual delegation established
	 */
	private async handleUpdateContact(params: Record<string, string>): Promise<void> {
		try {
			const did = params.did ? decodeURIComponent(params.did) : undefined;
			const uuid = params.uuid ? decodeURIComponent(params.uuid) : undefined;
			const name = params.name ? decodeURIComponent(params.name) : undefined;
			const email = params.email ? decodeURIComponent(params.email) : undefined;

			console.log(`🔄 [URIHandler] Update contact request:`, { did, uuid, name, email });

			if (!did) {
				new Notice('Invalid update link: missing DID');
				console.error(`❌ [URIHandler] Update contact missing DID parameter`);
				return;
			}

			if (!uuid) {
				new Notice('Invalid update link: missing Dreamer UUID');
				console.error(`❌ [URIHandler] Update contact missing UUID parameter`);
				return;
			}

			// Find the Dreamer node by UUID
			const allNodes = await this.dreamNodeService.list();
			const dreamerNode = allNodes.find((node: any) => node.id === uuid && node.type === 'dreamer');

			if (!dreamerNode) {
				new Notice(`Dreamer node not found (UUID: ${uuid.slice(0, 8)}...)`);
				console.error(`❌ [URIHandler] Dreamer node not found: ${uuid}`);
				return;
			}

			console.log(`👤 [URIHandler] Found Dreamer node: "${dreamerNode.name}" (${uuid})`);

			// Prepare updates
			const updates: Partial<DreamNode> = { did };
			if (name) updates.name = name;
			if (email) updates.email = email;

			// Update the Dreamer node with new contact info
			await this.dreamNodeService.update(uuid, updates);

			console.log(`✅ [URIHandler] Updated "${dreamerNode.name}" with DID: ${did}`);
			new Notice(`Contact updated: ${name || dreamerNode.name}'s DID received`);

			// Auto-trigger sync command to establish mutual delegation
			console.log(`🔄 [URIHandler] Triggering Radicle peer sync for mutual delegation...`);
			try {
				// Execute the sync command via Obsidian's command API
				// This runs the "Sync Radicle Peer Following" command which handles:
				// - rad follow <DID>
				// - rad id update --delegate <DID> --threshold 1
				// - git remote add <Peer> rad://<RID>/<DID>
				// - rad seed <RID> --scope followed
				const executed = (this.plugin.app as any).commands.executeCommandById('interbrain:sync-radicle-peer-following');

				if (executed) {
					console.log(`✅ [URIHandler] Radicle sync triggered - mutual delegation will be established`);
					new Notice('Collaboration setup complete! Syncing peer configuration...');
				} else {
					console.warn(`⚠️ [URIHandler] Sync command not found - may need manual sync`);
					new Notice('Contact updated. Run "Sync Radicle Peer Following" to complete setup.');
				}
			} catch (syncError) {
				console.error(`❌ [URIHandler] Radicle sync failed (non-critical):`, syncError);
				new Notice('Contact updated, but auto-sync failed. Run "Sync Radicle Peer Following" manually.');
			}

			// Refresh UI to show updated node
			await this.dreamNodeService.scanVault();

		} catch (error) {
			console.error('Failed to handle update contact:', error);
			new Notice(`Failed to update contact: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Classify identifier type for universal clone support
	 */
	private classifyIdentifier(id: string): 'radicle' | 'github' | 'uuid' {
		if (id.startsWith('rad:')) return 'radicle';
		if (id.includes('github.com/')) return 'github';
		return 'uuid';
	}

	/**
	 * Auto-focus a node after clone or when clicking already-cloned link
	 * Extracted helper to reuse for both new clones and existing nodes
	 */
	private async autoFocusNode(repoName: string, silent: boolean = false): Promise<void> {
		// Find the node by repo name
		const allNodes = await this.dreamNodeService.list();
		const targetNode = allNodes.find((node: any) => node.repoPath === repoName);

		if (!targetNode) {
			console.warn(`⚠️ [URIHandler] Could not find node with repoPath: ${repoName}`);
			return;
		}

		// Set selected node and request navigation via store
		const store = useInterBrainStore.getState();
		store.setSelectedNode(targetNode);
		store.requestNavigation({ type: 'focus', nodeId: targetNode.id });

		if (!silent) {
			new Notice(`🎯 Node focused in DreamSpace!`);
		}
	}

	/**
	 * Index a newly cloned node for semantic search
	 * Extracted helper to reuse for both Radicle and GitHub clones
	 */
	private async indexNewNode(repoName: string): Promise<void> {
		try {
			// Find the node by repo name
			const allNodes = await this.dreamNodeService.list();
			const targetNode = allNodes.find((node: any) => node.repoPath === repoName);

			if (!targetNode) {
				console.warn(`⚠️ [URIHandler] Could not find node for indexing: ${repoName}`);
				return;
			}

			// Index the node using semantic search service
			const { indexingService } = await import('../semantic-search/services/indexing-service');
			await indexingService.indexNode(targetNode);

		} catch (error) {
			console.error(`❌ [URIHandler] Failed to index node (non-critical):`, error);
			// Don't fail the clone operation if indexing fails
		}
	}

	/**
	 * Normalize repository name to human-readable title
	 * Uses the same logic as DreamNodeMigrationService.normalizeToHumanReadable()
	 *
	 * Handles:
	 * - PascalCase: "ThunderstormGenerator" → "Thunderstorm Generator"
	 * - kebab-case: "thunderstorm-generator" → "Thunderstorm Generator"
	 * - snake_case: "thunderstorm_generator" → "Thunderstorm Generator"
	 * - Mixed: "Thunderstorm-Generator-UPDATED" → "Thunderstorm Generator Updated"
	 */
	private async normalizeRepoNameToTitle(repoName: string): Promise<string> {
		const { isPascalCase, pascalCaseToTitle } = await import('../dreamnode/utils/title-sanitization');

		// If repo name contains hyphens, underscores, or periods as separators
		if (/[-_.]+/.test(repoName)) {
			// Replace separators with spaces and normalize
			return repoName
				.split(/[-_.]+/)                    // Split on hyphens, underscores, periods
				.filter(word => word.length > 0)
				.map(word => {
					// Capitalize first letter, lowercase rest (proper title case)
					const cleaned = word.trim();
					if (cleaned.length === 0) return '';
					return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
				})
				.join(' ')
				.trim();
		}

		// If repo name is pure PascalCase (no separators), convert to spaced format
		if (isPascalCase(repoName)) {
			return pascalCaseToTitle(repoName);
		}

		// Already human-readable with spaces, return as-is
		return repoName;
	}

	/**
	 * Ensure Radicle node is running before clone operations
	 * Uses PassphraseManager for simplified, consistent passphrase flow
	 *
	 * @returns Passphrase string (from settings or empty if node running), or null if not configured
	 */
	private async ensureRadicleNodeRunning(): Promise<string | null> {
		// Import PassphraseManager for consistent passphrase handling
		const { PassphraseManager } = await import('../social-resonance/passphrase-manager');
		const { UIService } = await import('../../core/services/ui-service');

		// Create temporary instances for passphrase management
		const uiService = new UIService(this.app);
		const passphraseManager = new PassphraseManager(uiService, this.plugin);

		// Get passphrase (checks node status internally, returns '' if already running)
		const passphrase = await passphraseManager.getPassphrase();

		if (passphrase === null) {
			// User needs to configure passphrase in settings
			console.warn('⚠️ [URIHandler] No passphrase configured - operation aborted');
			new Notice('Please configure your Radicle passphrase in settings and try again');
			return null;
		}

		if (passphrase === '') {
			// Node is already running, no passphrase needed
			console.log('✅ [URIHandler] Radicle node already running');
			return '';
		}

		// Node is not running, we have a passphrase - start the node
		console.log('🔄 [URIHandler] Starting Radicle node with passphrase from settings...');
		try {
			await (this.radicleService as any).startNode(passphrase);
			console.log('✅ [URIHandler] Radicle node started successfully');
			new Notice('Radicle node started');
			return passphrase;
		} catch (error) {
			console.error('❌ [URIHandler] Failed to start Radicle node:', error);
			new Notice(`Failed to start Radicle node: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	/**
	 * Clone a DreamNode from Radicle network
	 * Public method to allow reuse by CoherenceBeaconService and other features
	 */
	public async cloneFromRadicle(radicleId: string, silent: boolean = false): Promise<'success' | 'skipped' | 'error'> {
		try {
			// Get vault path
			const adapter = this.app.vault.adapter as any;
			const vaultPath = adapter.basePath || '';

			if (!vaultPath) {
				throw new Error('Could not determine vault path');
			}

			// CRITICAL: Ensure Radicle node is running before attempting clone
			// This handles fresh installs where passphrase might not be set
			const passphrase = await this.ensureRadicleNodeRunning();
			if (passphrase === null) {
				// User cancelled passphrase prompt
				throw new Error('Radicle node requires passphrase to start. Operation cancelled.');
			}

			// Clone the repository (handles duplicate detection internally)
			if (!silent) {
				new Notice(`Cloning from Radicle network...`, 3000);
			}

			const cloneResult = await this.radicleService.clone(radicleId, vaultPath, passphrase);
			let finalRepoName = cloneResult.repoName;

			// Strip UUID suffix from directory name if present (backend uses it for uniqueness)
			// Format: "Name-abc1234" → "Name"
			if (!cloneResult.alreadyExisted) {
				const cleanName = cloneResult.repoName.replace(/-[a-f0-9]{7}$/i, '');
				if (cleanName !== cloneResult.repoName) {
					const path = require('path');
					const fs = require('fs').promises;
					const oldPath = path.join(vaultPath, cloneResult.repoName);
					const newPath = path.join(vaultPath, cleanName);

					console.log(`URIHandler: Renaming ${cloneResult.repoName} → ${cleanName}...`);
					await fs.rename(oldPath, newPath);
					finalRepoName = cleanName;
					console.log(`URIHandler: ✓ Renamed to clean PascalCase name`);

					// Initialize submodules if any
					const execAsync = require('util').promisify(require('child_process').exec);
					try {
						await execAsync('git submodule update --init --recursive', { cwd: newPath });
						console.log(`URIHandler: ✓ Submodules initialized`);
					} catch (subErr) {
						console.warn(`URIHandler: No submodules or init failed:`, subErr);
					}
				}
			}

			// Check if repo already existed - if so, skip refresh but still focus
			if (cloneResult.alreadyExisted) {
				if (!silent) {
					new Notice(`📌 DreamNode "${finalRepoName}" already cloned!`);
					// Auto-focus the existing node (only when not in batch mode)
					await this.autoFocusNode(finalRepoName, silent);
				}

				return 'skipped'; // Already have it, no refresh needed
			}

			if (!silent) {
				new Notice(`✅ Cloned "${finalRepoName}" successfully!`);
			}

			// CRITICAL: Write Radicle ID to .udd file for future lookups
			try {
				const fs = require('fs').promises;
				const path = require('path');
				const uddPath = path.join(vaultPath, finalRepoName, '.udd');
				const uddContent = await fs.readFile(uddPath, 'utf-8');
				const udd = JSON.parse(uddContent);

				if (!udd.radicleId) {
					udd.radicleId = radicleId;
					await fs.writeFile(uddPath, JSON.stringify(udd, null, 2), 'utf-8');
					console.log(`✅ [URIHandler] Saved Radicle ID to .udd: ${radicleId}`);
				}
			} catch (uddError) {
				console.warn(`⚠️ [URIHandler] Could not save Radicle ID to .udd:`, uddError);
			}

			// AUTO-REFRESH: Make the newly cloned node appear immediately (skip in batch mode)
			if (!silent) {
				try {
					// Step 1: Rescan vault to detect the new DreamNode
					await this.dreamNodeService.scanVault();

					// Step 2: Index the newly cloned node for semantic search
					await this.indexNewNode(finalRepoName);

					// Step 3: Rescan DreamSong relationships
					const relationshipService = new DreamSongRelationshipService(this.plugin);
					const scanResult = await relationshipService.scanVaultForDreamSongRelationships();

					if (scanResult.success) {
						// Step 4: Apply constellation layout via store
						const store = useInterBrainStore.getState();
						store.requestNavigation({ type: 'applyLayout' });

						// Step 5: Auto-focus the newly cloned node (after brief delay for layout)
						setTimeout(() => this.autoFocusNode(finalRepoName, silent), 100);
					} else {
						console.warn(`⚠️ [URIHandler] Relationship scan failed:`, scanResult.error);
					}

				} catch (refreshError) {
					console.error(`❌ [URIHandler] Auto-refresh failed (non-critical):`, refreshError);
					// Don't fail the clone operation if refresh fails
				}
			}

			return 'success';

		} catch (error) {
			// Handle network propagation delays gracefully
			if (error instanceof Error && error.message === 'NETWORK_PROPAGATION_DELAY') {
				console.log(`⏳ [URIHandler] Repository ${radicleId} is still propagating to network seeds`);

				if (!silent) {
					new Notice(
						'Repository is being published to the network. This usually takes 1-2 minutes. Please try again shortly.',
						8000 // Show for 8 seconds
					);
				}

				return 'error';
			}

			console.error(`❌ [URIHandler] Clone failed for ${radicleId}:`, error);

			if (!silent) {
				const errorMsg = error instanceof Error ? error.message : 'Unknown error';
				new Notice(`Failed to clone: ${errorMsg}`);
			}

			return 'error';
		}
	}

	/**
	 * Clone a DreamNode from GitHub
	 */
	private async cloneFromGitHub(repoPath: string, silent: boolean = false): Promise<'success' | 'skipped' | 'error'> {
		try {
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
				if (!silent) {
					new Notice(`📌 DreamNode "${repoName}" already cloned!`);
					// Auto-focus the existing node (only when not in batch mode)
					await this.autoFocusNode(repoName, silent);
				}
				return 'skipped';
			}

			// Show progress
			if (!silent) {
				new Notice(`Cloning from GitHub...`, 3000);
			}

			// Import GitHub service and clone
			const { githubService } = await import('../github-publishing/service');
			const githubUrl = `https://${repoPath}`;
			await githubService.clone(githubUrl, destinationPath);

			// AUTO-INITIALIZE: Create .udd file for InterBrain compatibility
			try {
				const path = require('path');
				const fsPromises = require('fs').promises;
				const uddPath = path.join(destinationPath, '.udd');

				// Check if .udd already exists (shouldn't happen, but be safe)
				if (!fs.existsSync(uddPath)) {
					// Generate UUID for this DreamNode (using Node.js built-in)
					const crypto = require('crypto');
					const uuid = crypto.randomUUID();

					// Derive human-readable title from repo name using established naming schema
					// Uses the same normalization logic as DreamNodeMigrationService
					// Handles kebab-case, snake_case, PascalCase → "Human Readable Title"
					const title = await this.normalizeRepoNameToTitle(repoName);

					// Create minimal .udd structure
					const udd = {
						uuid,
						title,
						type: 'dream',
						dreamTalk: '',
						submodules: [],
						supermodules: [],
						githubRepoUrl: githubUrl // Preserve GitHub URL for fallback broadcasts
					};

					// Write .udd file asynchronously to ensure completion before scanVault()
					await fsPromises.writeFile(uddPath, JSON.stringify(udd, null, 2), 'utf8');
				}
			} catch (uddError) {
				console.error(`❌ [URIHandler] Failed to create .udd file (non-critical):`, uddError);
				// Don't fail the clone operation if .udd creation fails
			}

			if (!silent) {
				new Notice(`✅ Cloned "${repoName}" successfully!`);
			}

			// AUTO-REFRESH: Make the newly cloned node appear immediately (skip in batch mode)
			if (!silent) {
				try {
					// Step 1: Rescan vault to detect the new DreamNode
					await this.dreamNodeService.scanVault();

					// Step 2: Index the newly cloned node for semantic search
					await this.indexNewNode(repoName);

					// Step 3: Rescan DreamSong relationships
					const relationshipService = new DreamSongRelationshipService(this.plugin);
					const scanResult = await relationshipService.scanVaultForDreamSongRelationships();

					if (scanResult.success) {
						// Step 4: Apply constellation layout via store
						const store = useInterBrainStore.getState();
						store.requestNavigation({ type: 'applyLayout' });

						// Step 5: Auto-focus the newly cloned node (after brief delay for layout)
						setTimeout(() => this.autoFocusNode(repoName, silent), 100);
					} else {
						console.warn(`⚠️ [URIHandler] Relationship scan failed:`, scanResult.error);
					}

				} catch (refreshError) {
					console.error(`❌ [URIHandler] Auto-refresh failed (non-critical):`, refreshError);
					// Don't fail the clone operation if refresh fails
				}
			}

			return 'success';

		} catch (error) {
			console.error(`❌ [URIHandler] GitHub clone failed for ${repoPath}:`, error);

			if (!silent) {
				const errorMsg = error instanceof Error ? error.message : 'Unknown error';
				new Notice(`Failed to clone from GitHub: ${errorMsg}`);
			}

			return 'error';
		}
	}

	/**
	 * Handle collaboration handshake: create Dreamer node for sender and link cloned node
	 * @param clonedNodeIdentifier Radicle ID or GitHub URL of the cloned node
	 * @param senderDid Sender's Radicle DID
	 * @param senderName Sender's human-readable name
	 */
	private async handleCollaborationHandshake(
		clonedNodeIdentifier: string,
		senderDid: string,
		senderName: string
	): Promise<DreamNode | undefined> {
		try {
			console.log(`🤝 [URIHandler] Starting collaboration handshake for ${senderName} (${senderDid})...`);

			// Step 1: Find or create Dreamer node for sender
			const dreamerNode = await this.findOrCreateDreamerNode(senderDid, senderName);

			// Wait a bit to ensure all file operations are complete
			await new Promise(resolve => setTimeout(resolve, 200));

			// Step 2: Find the cloned node by identifier (Radicle ID or GitHub URL)
			const clonedNode = await this.findNodeByIdentifier(clonedNodeIdentifier);
			if (!clonedNode) {
				console.warn(`⚠️ [URIHandler] Could not find cloned node with identifier: ${clonedNodeIdentifier}`);
				return;
			}

			// Step 3: Link cloned node to Dreamer node (add relationship)
			await this.linkNodes(clonedNode, dreamerNode);

			console.log(`✅ [URIHandler] Collaboration handshake complete: "${clonedNode.name}" linked to "${dreamerNode.name}"`);

			// Step 4: Refresh UI to show new relationship immediately
			try {
				// Rescan vault to detect the new Dreamer node (if created)
				await this.dreamNodeService.scanVault();

				// Rescan relationships to update constellation
				const relationshipService = new DreamSongRelationshipService(this.plugin);
				const scanResult = await relationshipService.scanVaultForDreamSongRelationships();

				if (scanResult.success) {
					// Apply constellation layout via store to show new relationship
					const store = useInterBrainStore.getState();
					store.requestNavigation({ type: 'applyLayout' });
					console.log(`✅ [URIHandler] UI refreshed - relationship now visible`);
				}
			} catch (refreshError) {
				console.error(`❌ [URIHandler] UI refresh failed (non-critical):`, refreshError);
			}

			return dreamerNode;

		} catch (error) {
			console.error(`❌ [URIHandler] Collaboration handshake failed:`, error);
			// Don't fail the whole operation if handshake fails
			return undefined;
		}
	}

	/**
	 * Find existing Dreamer node by DID, or create new one
	 */
	private async findOrCreateDreamerNode(did: string, name: string, email?: string): Promise<any> {
		// Search for existing Dreamer node with this DID
		const allNodes = await this.dreamNodeService.list();
		const existingDreamer = allNodes.find((node: any) => {
			return node.type === 'dreamer' && node.did === did;
		});

		if (existingDreamer) {
			console.log(`👤 [URIHandler] Found existing Dreamer node: "${existingDreamer.name}"`);

			// CRITICAL: Read UUID from .udd file for linkNodes() compatibility
			// linkNodes() expects .uuid property, not .id
			const fs = require('fs').promises;
			const path = require('path');
			const uddPath = path.join((this.app.vault.adapter as any).basePath, existingDreamer.repoPath, '.udd');

			try {
				const uddContent = await fs.readFile(uddPath, 'utf-8');
				const udd = JSON.parse(uddContent);
				(existingDreamer as any).uuid = udd.uuid;
				console.log(`✅ [URIHandler] Loaded UUID for existing Dreamer: ${(existingDreamer as any).uuid}`);
			} catch (error) {
				console.error(`❌ [URIHandler] Failed to read UUID from existing Dreamer:`, error);
			}

			return existingDreamer;
		}

		// Create new Dreamer node with DID metadata using standard creation flow
		// Standard flow handles: git init, rad init, .udd creation with all metadata
		console.log(`👤 [URIHandler] Creating new Dreamer node for ${name} with DID ${did}${email ? ` and email ${email}` : ''}...`);
		const metadata: any = { did };
		if (email) {
			metadata.email = email;
		}
		const newDreamer = await this.dreamNodeService.create(name, 'dreamer', undefined, undefined, undefined, metadata);

		// Wait for creation to complete and populate UUID
		await new Promise(resolve => setTimeout(resolve, 500));

		const fs = require('fs').promises;
		const path = require('path');
		const uddPath = path.join((this.app.vault.adapter as any).basePath, newDreamer.repoPath, '.udd');

		try {
			const uddContent = await fs.readFile(uddPath, 'utf-8');
			const udd = JSON.parse(uddContent);
			(newDreamer as any).uuid = udd.uuid;
			console.log(`✅ [URIHandler] Dreamer node created with UUID: ${(newDreamer as any).uuid}, DID: ${did}`);
		} catch (error) {
			console.error(`❌ [URIHandler] Failed to read UUID from Dreamer node:`, error);
		}

		return newDreamer;
	}

	/**
	 * Find node by identifier (Radicle ID or GitHub URL)
	 */
	private async findNodeByIdentifier(identifier: string): Promise<any> {
		const allNodes = await this.dreamNodeService.list();

		// Determine if identifier is Radicle ID or GitHub URL
		const isRadicleId = identifier.startsWith('rad:');
		const isGitHubUrl = identifier.includes('github.com/');

		// Normalize GitHub URL if needed (remove protocol, .git suffix)
		const normalizedGitHubUrl = isGitHubUrl
			? identifier.replace(/^https?:\/\//, '').replace(/\.git$/, '')
			: null;

		const fs = require('fs').promises;
		const path = require('path');

		for (const node of allNodes) {
			try {
				const uddPath = path.join((this.app.vault.adapter as any).basePath, node.repoPath, '.udd');
				const uddContent = await fs.readFile(uddPath, 'utf-8');
				const udd = JSON.parse(uddContent);

				// Check Radicle ID
				if (isRadicleId && udd.radicleId === identifier) {
					console.log(`🔍 [URIHandler] Found node by Radicle ID: "${node.name}"`);
					(node as any).uuid = udd.uuid;
					return node;
				}

				// Check GitHub URL
				if (isGitHubUrl && udd.githubRepoUrl) {
					const normalizedUddUrl = udd.githubRepoUrl.replace(/^https?:\/\//, '').replace(/\.git$/, '');
					if (normalizedUddUrl === normalizedGitHubUrl) {
						console.log(`🔍 [URIHandler] Found node by GitHub URL: "${node.name}"`);
						(node as any).uuid = udd.uuid;
						return node;
					}
				}
			} catch {
				// Skip nodes without .udd or invalid JSON
			}
		}

		console.warn(`⚠️ [URIHandler] No node found with identifier: ${identifier}`);
		return null;
	}

	/**
	 * Link two nodes by adding relationship
	 * CRITICAL: Only Dreamer nodes hold liminal-web.json (subjective relationship data)
	 * DreamNodes don't have this file to avoid merge conflicts in collaboration
	 */
	private async linkNodes(sourceNode: any, targetNode: any): Promise<void> {
		try {
			// CRITICAL VALIDATION: Ensure both nodes have UUIDs
			if (!sourceNode.uuid) {
				console.error(`❌ [URIHandler] Source node "${sourceNode.name}" has no UUID!`);
				throw new Error(`Cannot link node without UUID: ${sourceNode.name}`);
			}
			if (!targetNode.uuid) {
				console.error(`❌ [URIHandler] Target node "${targetNode.name}" has no UUID!`);
				throw new Error(`Cannot link node without UUID: ${targetNode.name}`);
			}

			const fs = require('fs').promises;
			const path = require('path');
			const adapter = this.app.vault.adapter as any;
			const vaultPath = adapter.basePath || '';

			// Source -> Target (only if source is a Dreamer)
			if (sourceNode.type === 'dreamer') {
				const sourceLiminalWebPath = path.join(vaultPath, sourceNode.repoPath, 'liminal-web.json');
				let sourceLiminalWeb: any = { relationships: [] };

				try {
					const content = await fs.readFile(sourceLiminalWebPath, 'utf-8');
					sourceLiminalWeb = JSON.parse(content);
				} catch {
					console.log(`📝 [URIHandler] Creating liminal-web.json for Dreamer "${sourceNode.name}"`);
				}

				if (!sourceLiminalWeb.relationships) {
					sourceLiminalWeb.relationships = [];
				}

				if (!sourceLiminalWeb.relationships.includes(targetNode.uuid)) {
					sourceLiminalWeb.relationships.push(targetNode.uuid);
					await fs.writeFile(sourceLiminalWebPath, JSON.stringify(sourceLiminalWeb, null, 2), 'utf-8');
					console.log(`🔗 [URIHandler] Added relationship: Dreamer "${sourceNode.name}" -> "${targetNode.name}"`);
				}
			}

			// Target -> Source (only if target is a Dreamer)
			if (targetNode.type === 'dreamer') {
				const targetLiminalWebPath = path.join(vaultPath, targetNode.repoPath, 'liminal-web.json');
				let targetLiminalWeb: any = { relationships: [] };

				try {
					const content2 = await fs.readFile(targetLiminalWebPath, 'utf-8');
					targetLiminalWeb = JSON.parse(content2);
				} catch {
					console.log(`📝 [URIHandler] Creating liminal-web.json for Dreamer "${targetNode.name}"`);
				}

				if (!targetLiminalWeb.relationships) {
					targetLiminalWeb.relationships = [];
				}

				if (!targetLiminalWeb.relationships.includes(sourceNode.uuid)) {
					targetLiminalWeb.relationships.push(sourceNode.uuid);
					await fs.writeFile(targetLiminalWebPath, JSON.stringify(targetLiminalWeb, null, 2), 'utf-8');
					console.log(`🔗 [URIHandler] Added relationship: Dreamer "${targetNode.name}" -> "${sourceNode.name}"`);
				}
			}

			console.log(`✅ [URIHandler] Linked "${sourceNode.name}" <-> "${targetNode.name}"`);
		} catch (error) {
			console.error(`❌ [URIHandler] Failed to link nodes:`, error);
			throw error;
		}
	}

	/**
	 * Generate deep link URL for single DreamNode with collaboration handshake
	 * @param vaultName The Obsidian vault name (unused, kept for API compatibility)
	 * @param identifier Radicle ID (preferred) or UUID (fallback)
	 * @param senderDid Optional sender's Radicle DID for peer following
	 * @param senderName Optional sender's human-readable name for Dreamer node creation
	 * @param senderEmail Optional sender's email address for contact info
	 */
	static generateSingleNodeLink(vaultName: string, identifier: string, senderDid?: string, senderName?: string, senderEmail?: string): string {
		// Unified schema: Use ?ids= for both single and batch clones
		// Don't encode colons in Radicle IDs - they're part of the protocol
		// rad:z... should stay as rad:z..., not rad%3Az...
		const encodedIdentifier = identifier.startsWith('rad:')
			? identifier // Keep Radicle ID as-is
			: encodeURIComponent(identifier); // Encode other identifiers (UUIDs)

		let uri = `obsidian://interbrain-clone?ids=${encodedIdentifier}`;

		// Add collaboration handshake parameters if provided
		if (senderDid) {
			uri += `&senderDid=${encodeURIComponent(senderDid)}`;
		}
		if (senderName) {
			uri += `&senderName=${encodeURIComponent(senderName)}`;
		}
		if (senderEmail) {
			uri += `&senderEmail=${encodeURIComponent(senderEmail)}`;
		}

		return uri;
	}

	/**
	 * Generate deep link URL for GitHub clone (uses unified ?ids= schema)
	 * @param vaultName The Obsidian vault name (unused, kept for API compatibility)
	 * @param githubRepoUrl GitHub repository URL (e.g., "https://github.com/user/repo" or "github.com/user/repo")
	 */
	static generateGitHubCloneLink(vaultName: string, githubRepoUrl: string): string {
		// Extract clean repo path: github.com/user/repo
		const repoPath = githubRepoUrl
			.replace(/^https?:\/\//, '')  // Remove protocol
			.replace(/\.git$/, '');       // Remove .git suffix

		// Use unified ?ids= schema (not ?repo=)
		return `obsidian://interbrain-clone?ids=${repoPath}`;
	}

	/**
	 * Generate deep link URL for batch clone with collaboration handshake
	 * @param vaultName The Obsidian vault name (unused, kept for API compatibility)
	 * @param identifiers Array of identifiers (can be Radicle IDs, GitHub URLs, or UUIDs)
	 * @param senderDid Optional sender's Radicle DID for peer following
	 * @param senderName Optional sender's human-readable name for Dreamer node creation
	 */
	static generateBatchNodeLink(vaultName: string, identifiers: string[], senderDid?: string, senderName?: string, senderEmail?: string): string {
		// Unified schema: Use ?ids= with comma-separated list
		const encodedIdentifiers = encodeURIComponent(identifiers.join(','));
		let uri = `obsidian://interbrain-clone?ids=${encodedIdentifiers}`;

		// Add collaboration handshake parameters if provided
		if (senderDid) {
			uri += `&senderDid=${encodeURIComponent(senderDid)}`;
		}
		if (senderName) {
			uri += `&senderName=${encodeURIComponent(senderName)}`;
		}
		if (senderEmail) {
			uri += `&senderEmail=${encodeURIComponent(senderEmail)}`;
		}

		return uri;
	}

	/**
	 * Generate update-contact URI for DID backpropagation
	 * @param did Sender's Radicle DID
	 * @param dreamerUuid UUID of the recipient's Dreamer node (for the sender)
	 * @param name Optional sender's name
	 * @param email Optional sender's email
	 *
	 * Example: Bob installs InterBrain and wants to share his DID with Alice
	 * - did: Bob's newly created Radicle DID
	 * - dreamerUuid: Alice's UUID for her Dreamer node representing Bob
	 * - name: "Bob" (optional, for display)
	 * - email: "bob@example.com" (optional, for additional contact info)
	 */
	static generateUpdateContactLink(did: string, dreamerUuid: string, name?: string, email?: string): string {
		let uri = `obsidian://interbrain-update-contact?did=${encodeURIComponent(did)}&uuid=${encodeURIComponent(dreamerUuid)}`;

		if (name) {
			uri += `&name=${encodeURIComponent(name)}`;
		}
		if (email) {
			uri += `&email=${encodeURIComponent(email)}`;
		}

		return uri;
	}
}

// Singleton instance
let _uriHandlerService: URIHandlerService | null = null;

export function initializeURIHandlerService(app: App, plugin: Plugin, radicleService: RadicleService, dreamNodeService: GitDreamNodeService): void {
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
