import { Notice, Plugin } from 'obsidian';
import { DreamNode } from '../../dreamnode';
import { githubService } from './github-service';
import { GitDreamNodeService } from '../../dreamnode/services/git-dreamnode-service';
import { UDDService } from '../../dreamnode/services/udd-service';
import { serviceManager } from '../../../core/services/service-manager';

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
					console.warn(`[GitHubBatchShare] Node ${uuid} not found`);
				}
			}

			// Step 2: Separate into already-shared vs needs-sharing
			const { alreadyShared, needsSharing } = await this.categorizeNodes(nodes);

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
					new Notice(`Shared ${successCount} node${successCount > 1 ? 's' : ''} to GitHub`);
				}

				if (failCount > 0) {
					console.warn(`[GitHubBatchShare] ${failCount} node(s) failed to share`);
				}
			}

			return result;

		} catch (error) {
			console.error('[GitHubBatchShare] Batch sharing failed:', error);
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
	 * Read GitHub URL from .udd file using UDDService
	 */
	private async getGitHubUrlFromUdd(node: DreamNode): Promise<string | null> {
		try {
			const vaultService = serviceManager.getVaultService();
			const fullRepoPath = vaultService?.getFullPath(node.repoPath) || node.repoPath;

			const udd = await UDDService.readUDD(fullRepoPath);
			return (udd as any).githubRepoUrl || null;
		} catch {
			// Could not read .udd - this is expected for new nodes
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
			throw new Error(availabilityCheck.error || 'GitHub CLI not available');
		}

		// Get VaultService for path resolution
		const vaultService = serviceManager.getVaultService();

		// CRITICAL: Serialize sharing to prevent race conditions
		// Process nodes one at a time to avoid git/GitHub conflicts
		for (const node of nodes) {
			try {
				const fullRepoPath = vaultService?.getFullPath(node.repoPath) || node.repoPath;

				// Share to GitHub (creates repo, pushes, builds Pages)
				const shareResult = await githubService.shareDreamNode(
					fullRepoPath,
					node.id
				);

				if (shareResult.repoUrl) {
					result.set(node.id, shareResult.repoUrl);
				} else {
					console.warn(`[GitHubBatchShare] ${node.name} shared but no GitHub URL returned`);
				}

			} catch (error) {
				// Check if error is "already shared" or similar - this is NOT an error!
				const errorMsg = error instanceof Error ? error.message : String(error);

				if (errorMsg.includes('already exists') || errorMsg.includes('already shared')) {
					try {
						const githubUrl = await this.getGitHubUrlFromUdd(node);

						if (githubUrl) {
							result.set(node.id, githubUrl);
							continue; // Success! Move to next node
						}
					} catch (getUrlError) {
						console.error(`[GitHubBatchShare] Could not retrieve GitHub URL for ${node.name}:`, getUrlError);
					}
				} else {
					// Different error - log and continue
					console.error(`[GitHubBatchShare] Failed to share ${node.name}:`, error);
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
}

export function getGitHubBatchShareService(): GitHubBatchShareService {
	if (!_githubBatchShareService) {
		throw new Error('GitHubBatchShareService not initialized. Call initializeGitHubBatchShareService() first.');
	}
	return _githubBatchShareService;
}
