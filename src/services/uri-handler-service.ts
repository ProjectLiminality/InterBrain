import { App, Notice, Plugin } from 'obsidian';
import { RadicleService } from './radicle-service';
import { GitDreamNodeService } from './git-dreamnode-service';
import { DreamSongRelationshipService } from './dreamsong-relationship-service';
import { useInterBrainStore } from '../store/interbrain-store';
import { DreamNode } from '../types/dreamnode';

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
	 * Handle single DreamNode clone URI with collaboration handshake
	 * Format: obsidian://interbrain-clone?id=<radicleId or uuid>&senderDid=<did>&senderName=<name>
	 * Or: obsidian://interbrain-clone?repo=<github.com/user/repo>
	 */
	private async handleSingleNodeClone(params: Record<string, string>): Promise<'success' | 'skipped' | 'error'> {
		try {
			let id = params.id || params.uuid; // Support both 'id' (new) and 'uuid' (legacy)
			const repo = params.repo; // GitHub repository path
			const senderDid = params.senderDid ? decodeURIComponent(params.senderDid) : undefined;
			const senderName = params.senderName ? decodeURIComponent(params.senderName) : undefined;

			console.log(`🔗 [URIHandler] Single clone request:`, { id, repo, senderDid, senderName });

			// Check for GitHub repository
			if (repo) {
				const result = await this.cloneFromGitHub(repo);

				// If clone successful OR already exists, and we have sender info, create/link Dreamer node
				// (but for single links, we still select the cloned node, not the Dreamer)
				if ((result === 'success' || result === 'skipped') && senderDid && senderName) {
					await this.handleCollaborationHandshake(repo, senderDid, senderName);
				}

				// FINAL STEP: Trigger lightweight plugin reload with cloned node as target
				if (result === 'success' || result === 'skipped') {
					// Single clone links should ALWAYS select the cloned node (not Dreamer)
					const clonedNode = await this.findNodeByIdentifier(repo);
					const targetNodeUUID = clonedNode?.id;

					if (targetNodeUUID) {
						console.log(`🔄 [URIHandler] Storing target UUID for reload (cloned node): ${targetNodeUUID}`);
						(globalThis as any).__interbrainReloadTargetUUID = targetNodeUUID;
					}

					console.log(`🔄 [URIHandler] Triggering plugin reload to finalize single clone...`);
					const plugins = (this.app as any).plugins;
					await plugins.disablePlugin('interbrain');
					await plugins.enablePlugin('interbrain');
					console.log(`✅ [URIHandler] Plugin reload complete - single clone finalized`);
				}

				return result;
			}

			// Check for Radicle/UUID identifier
			if (!id) {
				new Notice('Invalid clone link: missing node identifier or repository');
				console.error(`❌ [URIHandler] Single clone missing identifier parameter`);
				return 'error';
			}

			// URL decode the ID (handles %3A -> : conversion)
			id = decodeURIComponent(id);
			console.log(`🔗 [URIHandler] Decoded ID: ${id}`);

			// Determine if this is a Radicle ID or UUID
			const isRadicleId = id.startsWith('rad:');

			if (isRadicleId) {
				// Clone from Radicle network with collaboration handshake
				const result = await this.cloneFromRadicle(id);

				// If clone successful OR already exists, and we have sender info, create/link Dreamer node
				// (but for single links, we still select the cloned node, not the Dreamer)
				if ((result === 'success' || result === 'skipped') && senderDid && senderName) {
					await this.handleCollaborationHandshake(id, senderDid, senderName);
				}

				// STEP: Trigger comprehensive Radicle sync (configure all peer relationships)
				if ((result === 'success' || result === 'skipped') && senderDid && senderName) {
					try {
						console.log(`🔄 [URIHandler] Triggering comprehensive Radicle network sync...`);
						await (this.app as any).commands.executeCommandById('interbrain:sync-radicle-peer-following');
						console.log(`✅ [URIHandler] Radicle network sync complete`);
					} catch (syncError) {
						console.warn(`⚠️ [URIHandler] Radicle sync failed (non-critical):`, syncError);
					}
				}

				// FINAL STEP: Trigger lightweight plugin reload with cloned node as target
				if (result === 'success' || result === 'skipped') {
					// Single clone links should ALWAYS select the cloned node (not Dreamer)
					const clonedNode = await this.findNodeByIdentifier(id);
					const targetNodeUUID = clonedNode?.id;

					if (targetNodeUUID) {
						console.log(`🔄 [URIHandler] Storing target UUID for reload (cloned node): ${targetNodeUUID}`);
						(globalThis as any).__interbrainReloadTargetUUID = targetNodeUUID;
					}

					console.log(`🔄 [URIHandler] Triggering plugin reload to finalize single clone...`);
					const plugins = (this.app as any).plugins;
					await plugins.disablePlugin('interbrain');
					await plugins.enablePlugin('interbrain');
					console.log(`✅ [URIHandler] Plugin reload complete - single clone finalized`);
				}

				return result;
			} else {
				// Legacy UUID fallback (for Windows users)
				new Notice(`UUID-based links not yet implemented. Please ask sender to share via Radicle.`);
				console.warn(`⚠️ [URIHandler] UUID-based clone not implemented: ${id}`);
				return 'error';
			}

		} catch (error) {
			console.error('Failed to handle clone link:', error);
			new Notice(`Failed to handle clone link: ${error instanceof Error ? error.message : 'Unknown error'}`);
			return 'error';
		}
	}

	/**
	 * Handle batch DreamNode clone URI with collaboration handshake
	 * Format: obsidian://interbrain-clone-batch?ids=<id1,id2,id3>&senderDid=<did>&senderName=<name>
	 * Examples:
	 *   - Pure Radicle: ids=rad:z1234,rad:z5678
	 *   - Pure GitHub: ids=github.com/user/repo1,github.com/user/repo2
	 *   - Mixed: ids=rad:z1234,github.com/user/repo,uuid-fallback
	 */
	private async handleBatchNodeClone(params: Record<string, string>): Promise<void> {
		try {
			const ids = params.ids || params.uuids; // Support both 'ids' (new) and 'uuids' (legacy)
			const senderDid = params.senderDid ? decodeURIComponent(params.senderDid) : undefined;
			const senderName = params.senderName ? decodeURIComponent(params.senderName) : undefined;

			console.log(`🔗 [URIHandler] Batch clone request:`, { ids, senderDid, senderName });

			if (!ids) {
				new Notice('Invalid batch clone link: missing node identifiers');
				console.error(`❌ [URIHandler] Batch clone missing identifiers parameter`);
				return;
			}

			const identifiers = ids.split(',').map(u => u.trim()).filter(Boolean);

			if (identifiers.length === 0) {
				new Notice('Invalid batch clone link: no valid identifiers');
				return;
			}

			// Classify each identifier
			const classified = identifiers.map(id => ({
				raw: id,
				type: this.classifyIdentifier(id)
			}));

			// Show progress notification
			const notice = new Notice(`Cloning ${identifiers.length} DreamNodes in parallel...`, 0);

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
			new Notice(`✅ Batch clone complete: ${summary}`);

			// If we have sender info, handle collaboration handshake ONCE at the end
			if (senderDid && senderName) {
				// CRITICAL: Scan vault FIRST to ensure all cloned nodes are in the store
				// before trying to link them (prevents dangling reference cleanup from removing them)
				console.log(`🔄 [URIHandler] Scanning vault to register ${successCount + skipCount} cloned nodes...`);
				await this.dreamNodeService.scanVault();

				// Find or create the Dreamer node
				const dreamerNode = await this.findOrCreateDreamerNode(senderDid, senderName);
				await new Promise(resolve => setTimeout(resolve, 200));

				// Now link all successfully cloned nodes to the Dreamer node
				// (nodes are now guaranteed to exist in the store)
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

				// STEP 1: Trigger comprehensive Radicle sync (configure all peer relationships)
				// TEMPORARILY COMMENTED OUT FOR DEBUGGING - TEST URI HANDLER IN ISOLATION
				// try {
				// 	console.log(`🔄 [URIHandler] Triggering comprehensive Radicle network sync...`);
				// 	await (this.app as any).commands.executeCommandById('interbrain:sync-radicle-peer-following');
				// 	console.log(`✅ [URIHandler] Radicle network sync complete`);
				// } catch (syncError) {
				// 	console.warn(`⚠️ [URIHandler] Radicle sync failed (non-critical):`, syncError);
				// }

				// STEP 2: Run comprehensive refresh at the very end (preserves DreamSong media + completes all setup)
				// This uses the refresh-plugin command which does a lightweight plugin reload
				// TEMPORARILY COMMENTED OUT FOR DEBUGGING
				// try {
				// 	console.log(`🔄 [URIHandler] Running comprehensive refresh (preserves DreamSong media)...`);

				// 	// Store Dreamer node UUID for reselection after refresh
				// 	(globalThis as any).__interbrainReloadTargetUUID = dreamerNode.id;

				// 	await (this.app as any).commands.executeCommandById('interbrain:refresh-plugin');
				// 	console.log(`✅ [URIHandler] Batch clone complete - all setup finished`);
				// } catch (refreshError) {
				// 	console.error(`❌ [URIHandler] Refresh failed (non-critical):`, refreshError);
				// }

				console.log(`✅ [URIHandler] Batch clone complete (Radicle sync and refresh temporarily disabled for debugging)`);
			}

		} catch (error) {
			console.error('Failed to handle batch clone link:', error);
			new Notice(`Failed to handle batch clone: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Classify identifier type for universal batch clone support
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

		// Set selected node in store FIRST (prevents "no selectedNode available" warning)
		const store = useInterBrainStore.getState();
		store.setSelectedNode(targetNode);

		// Check if DreamSpace is open and has focus API
		const canvasAPI = (globalThis as any).__interbrainCanvas;
		if (!canvasAPI?.focusOnNode) {
			return;
		}

		// Focus on the node (triggers liminal-web layout transition)
		const success = canvasAPI.focusOnNode(targetNode.id);
		if (success && !silent) {
			new Notice(`🎯 Node focused in DreamSpace!`);
		} else if (!success) {
			console.warn(`⚠️ [URIHandler] Failed to focus on "${repoName}"`);
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
			const { indexingService } = await import('../features/semantic-search/services/indexing-service');
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
		const { isPascalCase, pascalCaseToTitle } = await import('../utils/title-sanitization');

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

			// Clone the repository (handles duplicate detection internally)
			if (!silent) {
				new Notice(`Cloning from Radicle network...`, 3000);
			}

			// Get Radicle passphrase from settings for automatic node start
			const passphrase = (this.plugin as any).settings?.radiclePassphrase || undefined;
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
						// Step 4: Apply constellation layout if DreamSpace is open
						const canvasAPI = (globalThis as any).__interbrainCanvas;
						if (canvasAPI?.applyConstellationLayout) {
							await canvasAPI.applyConstellationLayout();

							// Step 5: Auto-focus the newly cloned node
							await this.autoFocusNode(finalRepoName, silent);
						}
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
			const { githubService } = await import('../features/github-sharing/GitHubService');
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
						liminalWebRelationships: [],
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
						// Step 4: Apply constellation layout if DreamSpace is open
						const canvasAPI = (globalThis as any).__interbrainCanvas;
						if (canvasAPI?.applyConstellationLayout) {
							await canvasAPI.applyConstellationLayout();

							// Step 5: Auto-focus the newly cloned node
							await this.autoFocusNode(repoName, silent);
						}
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
					// Apply constellation layout to show new relationship
					const canvasAPI = (globalThis as any).__interbrainCanvas;
					if (canvasAPI?.applyConstellationLayout) {
						await canvasAPI.applyConstellationLayout();
						console.log(`✅ [URIHandler] UI refreshed - relationship now visible`);
					}
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
	private async findOrCreateDreamerNode(did: string, name: string): Promise<any> {
		// Search for existing Dreamer node with this DID
		const allNodes = await this.dreamNodeService.list();
		const existingDreamer = allNodes.find((node: any) => {
			return node.type === 'dreamer' && node.did === did;
		});

		if (existingDreamer) {
			console.log(`👤 [URIHandler] Found existing Dreamer node: "${existingDreamer.name}"`);
			// Store already has .id populated from .udd.uuid during scanVault
			return existingDreamer;
		}

		// Create new Dreamer node with DID metadata using standard creation flow
		// Standard flow handles: git init, rad init, .udd creation with all metadata
		console.log(`👤 [URIHandler] Creating new Dreamer node for ${name} with DID ${did}...`);
		const newDreamer = await this.dreamNodeService.create(name, 'dreamer', undefined, undefined, undefined, { did });

		// Wait for creation to complete and populate UUID
		await new Promise(resolve => setTimeout(resolve, 500));

		const fs = require('fs').promises;
		const path = require('path');
		const uddPath = path.join(this.app.vault.adapter.basePath, newDreamer.repoPath, '.udd');

		try {
			const uddContent = await fs.readFile(uddPath, 'utf-8');
			const udd = JSON.parse(uddContent);
			newDreamer.uuid = udd.uuid;
			console.log(`✅ [URIHandler] Dreamer node created with UUID: ${newDreamer.uuid}, DID: ${did}`);
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
				const uddPath = path.join(this.app.vault.adapter.basePath, node.repoPath, '.udd');
				const uddContent = await fs.readFile(uddPath, 'utf-8');
				const udd = JSON.parse(uddContent);

				// Check Radicle ID
				if (isRadicleId && udd.radicleId === identifier) {
					console.log(`🔍 [URIHandler] Found node by Radicle ID: "${node.name}"`);
					node.uuid = udd.uuid;
					return node;
				}

				// Check GitHub URL
				if (isGitHubUrl && udd.githubRepoUrl) {
					const normalizedUddUrl = udd.githubRepoUrl.replace(/^https?:\/\//, '').replace(/\.git$/, '');
					if (normalizedUddUrl === normalizedGitHubUrl) {
						console.log(`🔍 [URIHandler] Found node by GitHub URL: "${node.name}"`);
						node.uuid = udd.uuid;
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
				} catch (error) {
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
				} catch (error) {
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
	 */
	static generateSingleNodeLink(vaultName: string, identifier: string, senderDid?: string, senderName?: string): string {
		// Don't encode colons in Radicle IDs - they're part of the protocol
		// rad:z... should stay as rad:z..., not rad%3Az...
		const encodedIdentifier = identifier.startsWith('rad:')
			? identifier // Keep Radicle ID as-is
			: encodeURIComponent(identifier); // Encode other identifiers (UUIDs)

		let uri = `obsidian://interbrain-clone?id=${encodedIdentifier}`;

		// Add collaboration handshake parameters if provided
		if (senderDid) {
			uri += `&senderDid=${encodeURIComponent(senderDid)}`;
		}
		if (senderName) {
			uri += `&senderName=${encodeURIComponent(senderName)}`;
		}

		return uri;
	}

	/**
	 * Generate deep link URL for GitHub clone
	 * @param vaultName The Obsidian vault name (unused, kept for API compatibility)
	 * @param githubRepoUrl GitHub repository URL (e.g., "https://github.com/user/repo" or "github.com/user/repo")
	 */
	static generateGitHubCloneLink(vaultName: string, githubRepoUrl: string): string {
		// Extract clean repo path: github.com/user/repo
		const repoPath = githubRepoUrl
			.replace(/^https?:\/\//, '')  // Remove protocol
			.replace(/\.git$/, '');       // Remove .git suffix

		// Return clean URI without encoding (slashes must remain unencoded)
		return `obsidian://interbrain-clone?repo=${repoPath}`;
	}

	/**
	 * Generate deep link URL for batch clone with collaboration handshake
	 * @param vaultName The Obsidian vault name (unused, kept for API compatibility)
	 * @param identifiers Array of identifiers (can be Radicle IDs, GitHub URLs, or UUIDs)
	 * @param senderDid Optional sender's Radicle DID for peer following
	 * @param senderName Optional sender's human-readable name for Dreamer node creation
	 */
	static generateBatchNodeLink(vaultName: string, identifiers: string[], senderDid?: string, senderName?: string): string {
		const encodedIdentifiers = encodeURIComponent(identifiers.join(','));
		let uri = `obsidian://interbrain-clone-batch?ids=${encodedIdentifiers}`;

		// Add collaboration handshake parameters if provided
		if (senderDid) {
			uri += `&senderDid=${encodeURIComponent(senderDid)}`;
		}
		if (senderName) {
			uri += `&senderName=${encodeURIComponent(senderName)}`;
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
