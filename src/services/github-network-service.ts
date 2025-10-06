/**
 * GitHub Network Service - Windows implementation placeholder
 *
 * This service will provide the same "Save & Share" interface as RadicleService
 * but using GitHub as the backend for Windows users.
 *
 * Future implementation will support:
 * - GitHub repository creation/initialization
 * - Push/pull operations via GitHub API or git CLI
 * - Clone operations from GitHub
 * - Same user-facing commands as Radicle ("Share DreamNode", "Clone DreamNode")
 *
 * @see Issue #337 (or similar) for full GitHub implementation specification
 */

/**
 * PLACEHOLDER: This interface mirrors RadicleService for future GitHub implementation
 */
export interface GitHubNetworkService {
  /**
   * Check if GitHub CLI or credentials are configured
   */
  isAvailable(): Promise<boolean>;

  /**
   * Initialize a DreamNode repository with GitHub remote
   * TODO: Implement gh repo create or git remote add origin
   */
  init(dreamNodePath: string): Promise<void>;

  /**
   * Clone a DreamNode from GitHub
   * @param githubUrl - GitHub repository URL or owner/repo format
   * TODO: Implement gh repo clone or git clone
   */
  clone(githubUrl: string, destinationPath: string): Promise<string>;

  /**
   * Share DreamNode to GitHub (push changes)
   * TODO: Implement git push with GitHub authentication
   */
  share(dreamNodePath: string): Promise<void>;

  /**
   * Check if there are local commits to share
   * TODO: Same as Radicle - use git log to check unpushed commits
   */
  hasChangesToShare(dreamNodePath: string): Promise<boolean>;
}

/**
 * PLACEHOLDER IMPLEMENTATION
 * Returns helpful error messages directing users to documentation
 */
export class GitHubNetworkServiceImpl implements GitHubNetworkService {
  async isAvailable(): Promise<boolean> {
    // TODO: Check for gh CLI or git credentials
    return false;
  }

  async init(_dreamNodePath: string): Promise<void> {
    throw new Error('GitHub network integration coming soon for Windows users');
  }

  async clone(_githubUrl: string, _destinationPath: string): Promise<string> {
    throw new Error('GitHub network integration coming soon for Windows users');
  }

  async share(_dreamNodePath: string): Promise<void> {
    throw new Error('GitHub network integration coming soon for Windows users');
  }

  async hasChangesToShare(_dreamNodePath: string): Promise<boolean> {
    return false;
  }
}
