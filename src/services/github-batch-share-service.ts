import { Notice, Plugin } from 'obsidian';
import { DreamNode } from '../core/types/dreamnode';
import { githubService } from '../features/github-sharing/GitHubService';
import { GitDreamNodeService } from '../core/services/git-dreamnode-service';

/**
 * GitHub Batch Share Service
 *
 * Ensures multiple DreamNodes have GitHub URLs before sharing via email links.
 * Handles batch GitHub share operations for Windows/GitHub fallback mode.
 */
export class GitHubBatchShareService {
	private plugin: Plugin;
	private dreamNodeService: GitDreamNodeService;

	constructor(plugin: Plugin, dreamNodeService: GitDreamNodeService) {
		this.plugin = plugin;
		this.dreamNodeService = dreamNodeService;
	}

	/**
	 * Ensure all nodes have GitHub URLs, sharing those that don't
	 * Returns map of UUID → GitHub URL
	 */
	async ensureNodesHaveGitHubUrls(nodeUUIDs: string[]): Promise<Map<string, string>> {
		console.log(`🔮 [GitHubBatchShare] Processing ${nodeUUIDs.length} nodes for GitHub URLs`);

		const result = new Map<string, string>();

		if (nodeUUIDs.length === 0) {
			return result;
		}

		try {
			// Step 1: Load all nodes and check their GitHub status
			const nodes: DreamNode[] = [];

			for (const uuid of nodeUUIDs) {
				const node = await this.dreamNodeService.get(uuid);
				if (node) {
					nodes.push(node);
				} else {
					console.warn(`⚠️ [GitHubBatchShare] Node ${uuid} not found`);
				}
			}

			// Step 2: Separate into already-shared vs needs-sharing
			const { alreadyShared, needsSharing } = await this.categorizeNodes(nodes);

			console.log(`✅ [GitHubBatchShare] ${alreadyShared.length} nodes already have GitHub URLs`);
			console.log(`🔄 [GitHubBatchShare] ${needsSharing.length} nodes need sharing`);

			// Step 3: Add already-shared nodes to result
			for (const node of alreadyShared) {
				const githubUrl = await this.getGitHubUrlFromUdd(node);
				if (githubUrl) {
					result.set(node.id, githubUrl);
				}
			}

			// Step 4: Batch share nodes that need it
			if (needsSharing.length > 0) {
				const notice = new Notice(`Sharing ${needsSharing.length} DreamNode${needsSharing.length > 1 ? 's' : ''} to GitHub...`, 0);

				const shared = await this.batchShareNodes(needsSharing);

				notice.hide();

				// Add newly shared nodes to result
				for (const [uuid, githubUrl] of shared) {
					result.set(uuid, githubUrl);
				}

				const successCount = shared.size;
				const failCount = needsSharing.length - successCount;

				if (successCount > 0) {
					new Notice(`✅ Shared ${successCount} node${successCount > 1 ? 's' : ''} to GitHub`);
				}

				if (failCount > 0) {
					console.warn(`⚠️ [GitHubBatchShare] ${failCount} node(s) failed to share`);
				}
			}

			console.log(`✅ [GitHubBatchShare] Complete: ${result.size}/${nodeUUIDs.length} nodes have GitHub URLs`);
			return result;

		} catch (error) {
			console.error('❌ [GitHubBatchShare] Batch sharing failed:', error);
			throw error;
		}
	}

	/**
	 * Categorize nodes by GitHub sharing status
	 */
	private async categorizeNodes(nodes: DreamNode[]): Promise<{
		alreadyShared: DreamNode[];
		needsSharing: DreamNode[];
	}> {
		const alreadyShared: DreamNode[] = [];
		const needsSharing: DreamNode[] = [];

		for (const node of nodes) {
			const githubUrl = await this.getGitHubUrlFromUdd(node);

			if (githubUrl) {
				alreadyShared.push(node);
			} else {
				needsSharing.push(node);
			}
		}

		return { alreadyShared, needsSharing };
	}

	/**
	 * Read GitHub URL from .udd file
	 */
	private async getGitHubUrlFromUdd(node: DreamNode): Promise<string | null> {
		try {
			const path = require('path');
			const fs = require('fs').promises;
			const adapter = this.plugin.app.vault.adapter as any;
			const vaultPath = adapter.basePath || '';
			const uddPath = path.join(vaultPath, node.repoPath, '.udd');

			try {
				const uddContent = await fs.readFile(uddPath, 'utf-8');
				const udd = JSON.parse(uddContent);

				if (udd.githubRepoUrl) {
					return udd.githubRepoUrl;
				}
			} catch (error) {
				console.warn(`⚠️ [GitHubBatchShare] Could not read .udd for ${node.name}:`, error);
			}

			return null;
		} catch (error) {
			console.warn(`⚠️ [GitHubBatchShare] Could not get GitHub URL for ${node.name}:`, error);
			return null;
		}
	}

	/**
	 * Batch share nodes to GitHub, serializing to prevent race conditions
	 * Returns map of successful UUID → GitHub URL
	 */
	private async batchShareNodes(nodes: DreamNode[]): Promise<Map<string, string>> {
		const result = new Map<string, string>();

		// Check if GitHub is available
		const availabilityCheck = await githubService.isAvailable();
		if (!availabilityCheck.available) {
			console.warn('⚠️ [GitHubBatchShare] GitHub CLI not available, skipping sharing');
			throw new Error(availabilityCheck.error || 'GitHub CLI not available');
		}

		// Get vault path
		const adapter = this.plugin.app.vault.adapter as any;
		const vaultPath = adapter.basePath || '';
		const path = require('path');

		// CRITICAL: Serialize sharing to prevent race conditions
		// Process nodes one at a time to avoid git/GitHub conflicts
		for (const node of nodes) {
			try {
				console.log(`🔄 [GitHubBatchShare] Sharing ${node.name}...`);

				const fullRepoPath = path.join(vaultPath, node.repoPath);

				// Share to GitHub (creates repo, pushes, builds Pages)
				const shareResult = await githubService.shareDreamNode(
					fullRepoPath,
					node.id
				);

				if (shareResult.repoUrl) {
					result.set(node.id, shareResult.repoUrl);
					console.log(`✅ [GitHubBatchShare] ${node.name} shared: ${shareResult.repoUrl}`);

					// Update local node's .udd file to persist GitHub URL
					// The shareDreamNode method should have already updated .udd, but verify
					const githubUrl = await this.getGitHubUrlFromUdd(node);
					if (!githubUrl) {
						console.warn(`⚠️ [GitHubBatchShare] ${node.name} shared but .udd not updated with GitHub URL`);
					}
				} else {
					console.warn(`⚠️ [GitHubBatchShare] ${node.name} shared but no GitHub URL returned`);
				}

			} catch (error) {
				// Check if error is "already shared" or similar - this is NOT an error!
				const errorMsg = error instanceof Error ? error.message : String(error);

				if (errorMsg.includes('already exists') || errorMsg.includes('already shared')) {
					console.log(`ℹ️ [GitHubBatchShare] ${node.name} already shared, retrieving URL...`);

					try {
						const githubUrl = await this.getGitHubUrlFromUdd(node);

						if (githubUrl) {
							result.set(node.id, githubUrl);
							console.log(`✅ [GitHubBatchShare] ${node.name} already shared: ${githubUrl}`);
							continue; // Success! Move to next node
						} else {
							console.warn(`⚠️ [GitHubBatchShare] Could not retrieve GitHub URL for already-shared ${node.name}`);
						}
					} catch (getUrlError) {
						console.error(`❌ [GitHubBatchShare] Could not retrieve GitHub URL for ${node.name}:`, getUrlError);
					}
				} else {
					// Different error - log and continue
					console.error(`❌ [GitHubBatchShare] Failed to share ${node.name}:`, error);
				}
			}
		}

		return result;
	}
}

// Singleton instance
let _githubBatchShareService: GitHubBatchShareService | null = null;

export function initializeGitHubBatchShareService(plugin: Plugin, dreamNodeService: GitDreamNodeService): void {
	_githubBatchShareService = new GitHubBatchShareService(plugin, dreamNodeService);
	console.log(`🔮 [GitHubBatchShare] Service initialized`);
}

export function getGitHubBatchShareService(): GitHubBatchShareService {
	if (!_githubBatchShareService) {
		throw new Error('GitHubBatchShareService not initialized. Call initializeGitHubBatchShareService() first.');
	}
	return _githubBatchShareService;
}
