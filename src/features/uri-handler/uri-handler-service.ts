import { App, Notice, Plugin } from 'obsidian';
import { RadicleService } from '../social-resonance-filter/services/radicle-service';
import { GitDreamNodeService } from '../dreamnode/services/git-dreamnode-service';
import { UDDService } from '../dreamnode/services/udd-service';
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
			// Clone handler: obsidian://interbrain-clone?ids=<id1,id2,...>&senderDid=<did>&senderName=<name>
			this.plugin.registerObsidianProtocolHandler(
				'interbrain-clone',
				this.handleClone.bind(this)
			);

			// Update contact handler: obsidian://interbrain-update-contact?did=<did>&uuid=<uuid>&name=<name>&email=<email>
			this.plugin.registerObsidianProtocolHandler(
				'interbrain-update-contact',
				this.handleUpdateContact.bind(this)
			);
		} catch (error) {
			console.error('[URIHandler] Failed to register handlers:', error);
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
			const ids = params.ids || params.id || params.uuid || params.uuids; // Support legacy formats
			const senderDid = params.senderDid ? decodeURIComponent(params.senderDid) : undefined;
			const senderName = params.senderName ? decodeURIComponent(params.senderName) : undefined;

			if (!ids) {
				new Notice('Invalid clone link: missing node identifiers');
				return;
			}

			const identifiers = ids.split(',').map(u => u.trim()).filter(Boolean);

			if (identifiers.length === 0) {
				new Notice('Invalid clone link: no valid identifiers');
				return;
			}

			const isSingleClone = identifiers.length === 1;

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

			// If we have sender info, handle collaboration handshake
			if (senderDid && senderName) {
				if (allNodesAlreadyExisted) {
					// Fast path: nodes exist, ensure Dreamer + relationships

					// Get current store state (nodes already loaded)
					const store = useInterBrainStore.getState();

					// Convert Map to array for searching
					const nodesArray = Array.from(store.dreamNodes.values()).map(nodeData => nodeData.node);

					// Check if Dreamer node exists
					let dreamerNode = nodesArray.find((n: any) => n.type === 'dreamer' && n.did === senderDid);

					// Extract senderEmail from params if available
					const senderEmail = params.senderEmail ? decodeURIComponent(params.senderEmail) : undefined;

					if (!dreamerNode) {
						// Create Dreamer node and link relationships
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
							} catch {
								// Non-critical link failure
							}
						}

						// Sync Radicle peer relationships
						try {
							await (this.app as any).commands.executeCommandById('interbrain:sync-radicle-peer-following');
						} catch {
							// Non-critical sync failure
						}
					} else {
						// Dreamer exists - DreamNode.id is already the UUID
						(dreamerNode as any).uuid = dreamerNode.id;

						// Check if all cloned nodes are linked to this Dreamer
						let missingLinks = false;
						for (const identifier of identifiers) {
							const clonedNode = await this.findNodeByIdentifier(identifier);
							if (clonedNode && !dreamerNode.liminalWebConnections?.includes(clonedNode.id)) {
								missingLinks = true;
								await this.linkNodes(clonedNode, dreamerNode);
							}
						}

						if (missingLinks) {
							await this.dreamNodeService.scanVault();

							try {
								await (this.app as any).commands.executeCommandById('interbrain:sync-radicle-peer-following');
							} catch {
								// Non-critical
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
					} else {
						// Batch clone: Select the Dreamer node
						targetNode = dreamerNode;
					}

					if (targetNode) {
						store.setSelectedNode(targetNode);
					} else {
						await (this.app as any).commands.executeCommandById('interbrain:refresh-plugin');
					}

				} else {
					// Full path: New nodes cloned - run complete workflow
					await this.dreamNodeService.scanVault();

					const senderEmail = params.senderEmail ? decodeURIComponent(params.senderEmail) : undefined;
					const dreamerNode = await this.findOrCreateDreamerNode(senderDid, senderName, senderEmail);
					await new Promise(resolve => setTimeout(resolve, 200));

					// Link all successfully cloned nodes to the Dreamer node
					for (const { result, identifier } of results) {
						if (result === 'success' || result === 'skipped') {
							try {
								const clonedNode = await this.findNodeByIdentifier(identifier);
								if (clonedNode) {
									await this.linkNodes(clonedNode, dreamerNode);
								}
							} catch {
								// Non-critical link failure
							}
						}
					}

					// Sync Radicle peer relationships
					try {
						await (this.app as any).commands.executeCommandById('interbrain:sync-radicle-peer-following');
					} catch {
						// Non-critical sync failure
					}

					// Refresh UI with smart selection
					try {
						let targetUUID: string | undefined;
						if (isSingleClone) {
							const clonedNode = await this.findNodeByIdentifier(identifiers[0]);
							targetUUID = clonedNode?.id;
						} else {
							targetUUID = dreamerNode.id;
						}

						if (targetUUID) {
							(globalThis as any).__interbrainReloadTargetUUID = targetUUID;
						}
						await (this.app as any).commands.executeCommandById('interbrain:refresh-plugin');
					} catch {
						// Non-critical refresh failure
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

			if (!did) {
				new Notice('Invalid update link: missing DID');
				return;
			}

			if (!uuid) {
				new Notice('Invalid update link: missing Dreamer UUID');
				return;
			}

			// Find the Dreamer node by UUID
			const allNodes = await this.dreamNodeService.list();
			const dreamerNode = allNodes.find((node: any) => node.id === uuid && node.type === 'dreamer');

			if (!dreamerNode) {
				new Notice(`Dreamer node not found (UUID: ${uuid.slice(0, 8)}...)`);
				return;
			}

			// Update the Dreamer node with new contact info
			const updates: Partial<DreamNode> = { did };
			if (name) updates.name = name;
			if (email) updates.email = email;

			await this.dreamNodeService.update(uuid, updates);
			new Notice(`Contact updated: ${name || dreamerNode.name}'s DID received`);

			// Auto-trigger sync for mutual delegation
			try {
				const executed = (this.plugin.app as any).commands.executeCommandById('interbrain:sync-radicle-peer-following');
				if (executed) {
					new Notice('Collaboration setup complete! Syncing peer configuration...');
				} else {
					new Notice('Contact updated. Run "Sync Radicle Peer Following" to complete setup.');
				}
			} catch {
				new Notice('Contact updated, but auto-sync failed. Run "Sync Radicle Peer Following" manually.');
			}

			// Refresh UI
			await this.dreamNodeService.scanVault();

		} catch (error) {
			console.error('[URIHandler] Failed to handle update contact:', error);
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
	 * Auto-focus a node after clone
	 */
	private async autoFocusNode(repoName: string, silent: boolean = false): Promise<void> {
		const allNodes = await this.dreamNodeService.list();
		const targetNode = allNodes.find((node: any) => node.repoPath === repoName);

		if (!targetNode) return;

		const store = useInterBrainStore.getState();
		store.setSelectedNode(targetNode);
		store.requestNavigation({ type: 'focus', nodeId: targetNode.id });

		if (!silent) {
			new Notice(`Node focused in DreamSpace!`);
		}
	}

	/**
	 * Index a newly cloned node for semantic search
	 */
	private async indexNewNode(repoName: string): Promise<void> {
		try {
			const allNodes = await this.dreamNodeService.list();
			const targetNode = allNodes.find((node: any) => node.repoPath === repoName);

			if (!targetNode) return;

			const { indexingService } = await import('../semantic-search/services/indexing-service');
			await indexingService.indexNode(targetNode);
		} catch {
			// Non-critical - don't fail clone
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
	 * @returns Passphrase string, empty if node running, or null if not configured
	 */
	private async ensureRadicleNodeRunning(): Promise<string | null> {
		const { PassphraseManager } = await import('../social-resonance-filter/services/passphrase-manager');
		const { UIService } = await import('../../core/services/ui-service');

		const uiService = new UIService(this.app);
		const passphraseManager = new PassphraseManager(uiService, this.plugin);
		const passphrase = await passphraseManager.getPassphrase();

		if (passphrase === null) {
			new Notice('Please configure your Radicle passphrase in settings and try again');
			return null;
		}

		if (passphrase === '') {
			return ''; // Node already running
		}

		// Start node
		try {
			await (this.radicleService as any).startNode(passphrase);
			new Notice('Radicle node started');
			return passphrase;
		} catch (error) {
			console.error('[URIHandler] Failed to start Radicle node:', error);
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
			const adapter = this.app.vault.adapter as any;
			const vaultPath = adapter.basePath || '';

			if (!vaultPath) {
				throw new Error('Could not determine vault path');
			}

			// Ensure Radicle node is running before attempting clone
			const passphrase = await this.ensureRadicleNodeRunning();
			if (passphrase === null) {
				throw new Error('Radicle node requires passphrase to start. Operation cancelled.');
			}

			if (!silent) {
				new Notice(`Cloning from Radicle network...`, 3000);
			}

			// RadicleService.clone() handles: clone, directory rename, submodule init, .udd update
			const cloneResult = await this.radicleService.clone(radicleId, vaultPath, passphrase);

			if (cloneResult.alreadyExisted) {
				if (!silent) {
					new Notice(`DreamNode "${cloneResult.repoName}" already cloned!`);
					await this.autoFocusNode(cloneResult.repoName, silent);
				}
				return 'skipped';
			}

			if (!silent) {
				new Notice(`Cloned "${cloneResult.repoName}" successfully!`);
			}

			// Auto-refresh: Make the newly cloned node appear immediately
			if (!silent) {
				try {
					await this.dreamNodeService.scanVault();
					await this.indexNewNode(cloneResult.repoName);

					const relationshipService = new DreamSongRelationshipService(this.plugin);
					const scanResult = await relationshipService.scanVaultForDreamSongRelationships();

					if (scanResult.success) {
						const store = useInterBrainStore.getState();
						store.requestNavigation({ type: 'applyLayout' });
						setTimeout(() => this.autoFocusNode(cloneResult.repoName, silent), 100);
					}
				} catch {
					// Non-critical - node was cloned successfully
				}
			}

			return 'success';

		} catch (error) {
			// Handle network propagation delays gracefully
			if (error instanceof Error && error.message === 'NETWORK_PROPAGATION_DELAY') {
				if (!silent) {
					new Notice(
						'Repository is being published to the network. This usually takes 1-2 minutes. Please try again shortly.',
						8000
					);
				}
				return 'error';
			}

			console.error(`[URIHandler] Clone failed for ${radicleId}:`, error);

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
			const adapter = this.app.vault.adapter as any;
			const vaultPath = adapter.basePath || '';

			if (!vaultPath) {
				throw new Error('Could not determine vault path');
			}

			// Extract repo name from path
			const match = repoPath.match(/github\.com\/[^/]+\/([^/\s]+)/);
			if (!match) {
				throw new Error(`Invalid GitHub repository path: ${repoPath}`);
			}

			const repoName = match[1].replace(/\.git$/, '');
			const destinationPath = `${vaultPath}/${repoName}`;

			// Check if already exists - use Obsidian vault API
			if (await this.app.vault.adapter.exists(repoName)) {
				if (!silent) {
					new Notice(`DreamNode "${repoName}" already cloned!`);
					await this.autoFocusNode(repoName, silent);
				}
				return 'skipped';
			}

			if (!silent) {
				new Notice(`Cloning from GitHub...`, 3000);
			}

			// Clone via GitHub service
			const { githubService } = await import('../github-publishing/service');
			const githubUrl = `https://${repoPath}`;
			await githubService.clone(githubUrl, destinationPath);

			// Create .udd file for InterBrain compatibility using UDDService
			try {
				if (!UDDService.uddExists(destinationPath)) {
					// Use Web Crypto API for UUID generation (available in Electron)
					const uuid = globalThis.crypto.randomUUID();
					const title = await this.normalizeRepoNameToTitle(repoName);

					await UDDService.createUDD(destinationPath, {
						uuid,
						title,
						type: 'dream',
						dreamTalk: ''
					});

					// Add GitHub URL to the UDD (createUDD doesn't support this field)
					const udd = await UDDService.readUDD(destinationPath);
					(udd as any).githubRepoUrl = githubUrl;
					await UDDService.writeUDD(destinationPath, udd);
				}
			} catch {
				// Non-critical - clone succeeded
			}

			if (!silent) {
				new Notice(`Cloned "${repoName}" successfully!`);
			}

			// Auto-refresh
			if (!silent) {
				try {
					await this.dreamNodeService.scanVault();
					await this.indexNewNode(repoName);

					const relationshipService = new DreamSongRelationshipService(this.plugin);
					const scanResult = await relationshipService.scanVaultForDreamSongRelationships();

					if (scanResult.success) {
						const store = useInterBrainStore.getState();
						store.requestNavigation({ type: 'applyLayout' });
						setTimeout(() => this.autoFocusNode(repoName, silent), 100);
					}
				} catch {
					// Non-critical
				}
			}

			return 'success';

		} catch (error) {
			console.error(`[URIHandler] GitHub clone failed for ${repoPath}:`, error);

			if (!silent) {
				const errorMsg = error instanceof Error ? error.message : 'Unknown error';
				new Notice(`Failed to clone from GitHub: ${errorMsg}`);
			}

			return 'error';
		}
	}

	/**
	 * Handle collaboration handshake: create Dreamer node for sender and link cloned node
	 */
	private async handleCollaborationHandshake(
		clonedNodeIdentifier: string,
		senderDid: string,
		senderName: string
	): Promise<DreamNode | undefined> {
		try {
			const dreamerNode = await this.findOrCreateDreamerNode(senderDid, senderName);
			await new Promise(resolve => setTimeout(resolve, 200));

			const clonedNode = await this.findNodeByIdentifier(clonedNodeIdentifier);
			if (!clonedNode) return;

			await this.linkNodes(clonedNode, dreamerNode);

			// Refresh UI
			try {
				await this.dreamNodeService.scanVault();
				const relationshipService = new DreamSongRelationshipService(this.plugin);
				const scanResult = await relationshipService.scanVaultForDreamSongRelationships();

				if (scanResult.success) {
					const store = useInterBrainStore.getState();
					store.requestNavigation({ type: 'applyLayout' });
				}
			} catch {
				// Non-critical
			}

			return dreamerNode;
		} catch {
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
			// DreamNode.id is already the UUID from .udd - just alias it for compatibility
			(existingDreamer as any).uuid = existingDreamer.id;
			return existingDreamer;
		}

		// Create new Dreamer node with DID metadata using standard creation flow
		const metadata: any = { did };
		if (email) {
			metadata.email = email;
		}
		const newDreamer = await this.dreamNodeService.create(name, 'dreamer', undefined, undefined, undefined, metadata);

		// Wait for creation to complete
		await new Promise(resolve => setTimeout(resolve, 500));

		// DreamNode.id is already the UUID - just alias it for compatibility
		(newDreamer as any).uuid = newDreamer.id;

		return newDreamer;
	}

	/**
	 * Find node by identifier (Radicle ID or GitHub URL)
	 * Uses DreamNode properties from store (populated from .udd during vault scan)
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

		for (const node of allNodes) {
			// Check Radicle ID (available on DreamNode from vault scan)
			if (isRadicleId && node.radicleId === identifier) {
				(node as any).uuid = node.id;
				return node;
			}

			// Check GitHub URL (available on DreamNode from vault scan)
			if (isGitHubUrl && node.githubRepoUrl) {
				const normalizedUddUrl = node.githubRepoUrl.replace(/^https?:\/\//, '').replace(/\.git$/, '');
				if (normalizedUddUrl === normalizedGitHubUrl) {
					(node as any).uuid = node.id;
					return node;
				}
			}
		}

		return null;
	}

	/**
	 * Link two nodes by adding relationship
	 * Delegates to GitDreamNodeService.addRelationship for proper bidirectional handling
	 */
	private async linkNodes(sourceNode: any, targetNode: any): Promise<void> {
		// Use node.id (which is the UUID) - the uuid alias is just for backward compat
		const sourceId = sourceNode.uuid || sourceNode.id;
		const targetId = targetNode.uuid || targetNode.id;

		if (!sourceId || !targetId) {
			throw new Error(`Cannot link nodes without IDs`);
		}

		// Delegate to GitDreamNodeService which handles bidirectional relationships
		// and liminal-web.json updates for Dreamer nodes
		await this.dreamNodeService.addRelationship(sourceId, targetId);
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
}

export function getURIHandlerService(): URIHandlerService {
	if (!_uriHandlerService) {
		throw new Error('URIHandlerService not initialized. Call initializeURIHandlerService() first.');
	}
	return _uriHandlerService;
}
