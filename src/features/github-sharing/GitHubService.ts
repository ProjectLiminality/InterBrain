/**
 * GitHub Sharing Service
 *
 * Implements GitHub integration as fallback sharing mechanism and broadcast layer.
 * Uses GitHub CLI (`gh`) for repo operations and GitHub API for Pages setup.
 *
 * Philosophy: "GitHub for sharing, Radicle for collaboration"
 * - Fallback for Windows users (Radicle not yet compatible)
 * - Public broadcast layer via GitHub Pages
 * - Friend-to-friend sharing via Obsidian URI protocol
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

export interface GitHubShareResult {
  /** GitHub repository URL */
  repoUrl: string;

  /** GitHub Pages URL (if Pages enabled) */
  pagesUrl?: string;

  /** Obsidian URI for one-click cloning */
  obsidianUri: string;
}

export class GitHubService {
  /**
   * Check if GitHub CLI is available and authenticated
   */
  async isAvailable(): Promise<{ available: boolean; error?: string }> {
    try {
      // Check if gh CLI is installed
      await execAsync('gh --version');

      // Check if authenticated
      const { stdout } = await execAsync('gh auth status');

      if (stdout.includes('Logged in to github.com')) {
        return { available: true };
      }

      return {
        available: false,
        error: 'GitHub CLI not authenticated. Run: gh auth login'
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('command not found')) {
        return {
          available: false,
          error: 'GitHub CLI not installed. Install from: https://cli.github.com'
        };
      }

      return {
        available: false,
        error: 'GitHub CLI not authenticated. Run: gh auth login'
      };
    }
  }

  /**
   * Create public GitHub repository and push DreamNode content
   */
  async createRepo(dreamNodePath: string, dreamNodeUuid: string): Promise<string> {
    // Verify directory exists
    if (!fs.existsSync(dreamNodePath)) {
      throw new Error(`DreamNode path does not exist: ${dreamNodePath}`);
    }

    // Ensure it's a git repo
    const gitDir = path.join(dreamNodePath, '.git');
    if (!fs.existsSync(gitDir)) {
      throw new Error('DreamNode is not a git repository. Cannot share to GitHub.');
    }

    // Repository name based on UUID
    const repoName = `dreamnode-${dreamNodeUuid}`;

    try {
      // Create public GitHub repository
      const { stdout } = await execAsync(
        `gh repo create ${repoName} --public --source="${dreamNodePath}" --remote=github --push`,
        { cwd: dreamNodePath }
      );

      // Extract repository URL from output
      const match = stdout.match(/https:\/\/github\.com\/[^\s]+/);
      if (!match) {
        throw new Error('Failed to extract repository URL from gh output');
      }

      const repoUrl = match[0];
      return repoUrl;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to create GitHub repository: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Enable GitHub Pages for repository
   */
  async setupPages(repoUrl: string): Promise<string> {
    try {
      // Extract owner/repo from URL
      const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
      if (!match) {
        throw new Error(`Invalid GitHub URL: ${repoUrl}`);
      }

      const [, owner, repo] = match;

      // Remove .git suffix if present
      const cleanRepo = repo.replace(/\.git$/, '');

      // Enable GitHub Pages via API
      // Note: gh CLI doesn't have native pages command, so we use gh api
      await execAsync(
        `gh api -X POST "repos/${owner}/${cleanRepo}/pages" -f source[branch]=main -f source[path]=/`
      );

      // Construct Pages URL
      const pagesUrl = `https://${owner}.github.io/${cleanRepo}`;

      return pagesUrl;
    } catch (error) {
      if (error instanceof Error) {
        // Pages might already be enabled - check if that's the error
        if (error.message.includes('already exists') || error.message.includes('409')) {
          // Extract owner/repo again for Pages URL
          const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
          if (match) {
            const [, owner, repo] = match;
            const cleanRepo = repo.replace(/\.git$/, '');
            return `https://${owner}.github.io/${cleanRepo}`;
          }
        }
        throw new Error(`Failed to setup GitHub Pages: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Generate Obsidian URI for cloning from GitHub
   */
  generateObsidianURI(repoUrl: string): string {
    // Extract repo path (e.g., "user/dreamnode-uuid")
    const match = repoUrl.match(/github\.com\/([^\/]+\/[^\/\s]+)/);
    if (!match) {
      throw new Error(`Invalid GitHub URL: ${repoUrl}`);
    }

    const repoPath = match[1].replace(/\.git$/, '');

    return `obsidian://interbrain-clone?repo=github.com/${repoPath}`;
  }

  /**
   * Clone DreamNode from GitHub URL
   */
  async clone(githubUrl: string, destinationPath: string): Promise<void> {
    try {
      // Ensure parent directory exists
      const parentDir = path.dirname(destinationPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      // Standard git clone
      await execAsync(`git clone "${githubUrl}" "${destinationPath}"`);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to clone from GitHub: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Build static DreamSong site for GitHub Pages
   *
   * This will be implemented in next phase - for now just a placeholder
   */
  async buildStaticSite(dreamNodePath: string, outputDir: string): Promise<void> {
    // TODO: Implement static site builder
    // - Parse .canvas files
    // - Create standalone HTML with React + DreamSong component
    // - Bundle with Vite
    // - Output to directory for Pages deployment

    throw new Error('Static site builder not yet implemented');
  }

  /**
   * Complete share workflow: create repo, enable Pages, update UDD
   */
  async shareDreamNode(
    dreamNodePath: string,
    dreamNodeUuid: string
  ): Promise<GitHubShareResult> {
    // Step 1: Create GitHub repository
    const repoUrl = await this.createRepo(dreamNodePath, dreamNodeUuid);

    // Step 2: Enable GitHub Pages
    let pagesUrl: string | undefined;
    try {
      pagesUrl = await this.setupPages(repoUrl);
    } catch (error) {
      console.warn('Failed to enable GitHub Pages:', error);
      // Continue without Pages URL - repo is still created
    }

    // Step 3: Generate Obsidian URI
    const obsidianUri = this.generateObsidianURI(repoUrl);

    return {
      repoUrl,
      pagesUrl,
      obsidianUri
    };
  }
}

// Singleton instance
export const githubService = new GitHubService();
