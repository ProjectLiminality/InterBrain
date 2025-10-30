import { App, Notice, Plugin } from 'obsidian';
import { RadicleService } from './radicle-service';
import { GitDreamNodeService } from './git-dreamnode-service';
import { DreamSongRelationshipService } from './dreamsong-relationship-service';
import { useInterBrainStore } from '../store/interbrain-store';

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
	 * Handle single DreamNode clone URI
	 * Format: obsidian://interbrain-clone?id=<radicleId or uuid> OR ?repo=<github.com/user/repo>
	 */
	private async handleSingleNodeClone(params: Record<string, string>): Promise<'success' | 'skipped' | 'error'> {
		try {
			let id = params.id || params.uuid; // Support both 'id' (new) and 'uuid' (legacy)
			const repo = params.repo; // GitHub repository path

			// Check for GitHub repository
			if (repo) {
				return await this.cloneFromGitHub(repo);
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
				// Clone from Radicle network
				return await this.cloneFromRadicle(id);
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
	 * Handle batch DreamNode clone URI (Universal: supports mixed Radicle/GitHub/UUID identifiers)
	 * Format: obsidian://interbrain-clone-batch?ids=<id1,id2,id3>
	 * Examples:
	 *   - Pure Radicle: ids=rad:z1234,rad:z5678
	 *   - Pure GitHub: ids=github.com/user/repo1,github.com/user/repo2
	 *   - Mixed: ids=rad:z1234,github.com/user/repo,uuid-fallback
	 */
	private async handleBatchNodeClone(params: Record<string, string>): Promise<void> {
		try {
			const ids = params.ids || params.uuids; // Support both 'ids' (new) and 'uuids' (legacy)

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
			const notice = new Notice(`Cloning ${identifiers.length} DreamNodes...`, 0);

			// Process each identifier using single-node handler
			let successCount = 0;
			let skipCount = 0;
			let errorCount = 0;

			for (const { raw, type } of classified) {
				try {
					// Build params for single-node handler based on type
					const paramsForSingle: Record<string, string> = type === 'github'
						? { repo: raw }
						: { id: raw };

					const result = await this.handleSingleNodeClone(paramsForSingle);

					if (result === 'success') successCount++;
					else if (result === 'skipped') skipCount++;
					else errorCount++;

				} catch (error) {
					console.error(`❌ [URIHandler] Failed to clone ${type} identifier "${raw}":`, error);
					errorCount++;
				}
			}

			notice.hide();

			// Show comprehensive summary
			const parts: string[] = [];
			if (successCount > 0) parts.push(`${successCount} cloned`);
			if (skipCount > 0) parts.push(`${skipCount} already existed`);
			if (errorCount > 0) parts.push(`${errorCount} failed`);

			const summary = parts.join(', ');
			new Notice(`✅ Batch clone complete: ${summary}`);

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

			const cloneResult = await this.radicleService.clone(radicleId, vaultPath);
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
				}

				// Auto-focus the existing node (same as newly cloned)
				await this.autoFocusNode(finalRepoName, silent);

				return 'skipped'; // Already have it, no refresh needed
			}

			if (!silent) {
				new Notice(`✅ Cloned "${finalRepoName}" successfully!`);
			}

			// AUTO-REFRESH: Make the newly cloned node appear immediately
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
				}

				// Auto-focus the existing node
				await this.autoFocusNode(repoName, silent);
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

			// AUTO-REFRESH: Make the newly cloned node appear immediately
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
