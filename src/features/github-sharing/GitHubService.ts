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
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

// Helper to get current file path in CommonJS-style modules
const getCurrentFilePath = () => {
  // Check if we're in a CommonJS context with __filename available
  try {
    // eslint-disable-next-line no-undef
    if (typeof __filename !== 'undefined') {
      // eslint-disable-next-line no-undef
      return __filename;
    }
  } catch {
    // __filename not available, fall through to ESM approach
  }

  // In ESM context, use import.meta.url
  return fileURLToPath(import.meta.url);
};

export interface GitHubShareResult {
  /** GitHub repository URL */
  repoUrl: string;

  /** GitHub Pages URL (if Pages enabled) */
  pagesUrl?: string;

  /** Obsidian URI for one-click cloning */
  obsidianUri: string;
}

export class GitHubService {
  private ghPath: string | null = null;

  /**
   * Detect and cache the GitHub CLI path
   */
  private async detectGhPath(): Promise<string> {
    if (this.ghPath) {
      return this.ghPath;
    }

    // Try with full path first (Homebrew default on Apple Silicon)
    const pathsToTry = [
      '/opt/homebrew/bin/gh',
      '/usr/local/bin/gh',
      'gh'
    ];

    for (const path of pathsToTry) {
      try {
        await execAsync(`${path} --version`);
        this.ghPath = path;
        console.log(`GitHubService: Found gh at ${path}`);
        return path;
      } catch {
        // Try next path
      }
    }

    throw new Error('GitHub CLI not found in any standard location');
  }

  /**
   * Check if GitHub CLI is available and authenticated
   */
  async isAvailable(): Promise<{ available: boolean; error?: string }> {
    try {
      const ghPath = await this.detectGhPath();

      // Check if authenticated (stderr goes to stdout for gh auth status)
      const { stdout, stderr } = await execAsync(`${ghPath} auth status 2>&1`);
      const output = stdout + stderr;

      console.log('GitHubService: gh auth status output:', output);

      if (output.includes('Logged in to github.com')) {
        return { available: true };
      }

      return {
        available: false,
        error: 'GitHub CLI not authenticated. Run: gh auth login'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('GitHubService: isAvailable check failed:', errorMessage);

      if (errorMessage.includes('command not found') || errorMessage.includes('ENOENT') || errorMessage.includes('not found in any standard location')) {
        return {
          available: false,
          error: 'GitHub CLI not found. Install from: https://cli.github.com or ensure /opt/homebrew/bin is in PATH'
        };
      }

      return {
        available: false,
        error: `GitHub CLI error: ${errorMessage}`
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
      const ghPath = await this.detectGhPath();

      // Create public GitHub repository
      const { stdout } = await execAsync(
        `"${ghPath}" repo create ${repoName} --public --source="${dreamNodePath}" --remote=github --push`,
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
      const ghPath = await this.detectGhPath();

      // Extract owner/repo from URL
      const match = repoUrl.match(/github\.com\/([^/]+)\/([^/\s]+)/);
      if (!match) {
        throw new Error(`Invalid GitHub URL: ${repoUrl}`);
      }

      const [, owner, repo] = match;

      // Remove .git suffix if present
      const cleanRepo = repo.replace(/\.git$/, '');

      // Enable GitHub Pages via API
      // Note: gh CLI doesn't have native pages command, so we use gh api
      await execAsync(
        `"${ghPath}" api -X POST "repos/${owner}/${cleanRepo}/pages" -f source[branch]=main -f source[path]=/`
      );

      // Construct Pages URL
      const pagesUrl = `https://${owner}.github.io/${cleanRepo}`;

      return pagesUrl;
    } catch (error) {
      if (error instanceof Error) {
        // Pages might already be enabled - check if that's the error
        if (error.message.includes('already exists') || error.message.includes('409')) {
          // Extract owner/repo again for Pages URL
          const match = repoUrl.match(/github\.com\/([^/]+)\/([^/\s]+)/);
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
    const match = repoUrl.match(/github\.com\/([^/]+\/[^/\s]+)/);
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
   */
  async buildStaticSite(
    dreamNodePath: string,
    dreamNodeId: string,
    dreamNodeName: string
  ): Promise<string> {
    try {
      // Import parsing services
      const { parseCanvasToBlocks, resolveMediaPaths } = await import('../../services/dreamsong');
      const { CanvasParserService } = await import('../../services/canvas-parser-service');

      // Read .udd file to get metadata
      const uddPath = path.join(dreamNodePath, '.udd');
      if (!fs.existsSync(uddPath)) {
        throw new Error('.udd file not found');
      }

      const uddContent = fs.readFileSync(uddPath, 'utf-8');
      const udd = JSON.parse(uddContent);

      // Find .canvas files in DreamNode
      const files = fs.readdirSync(dreamNodePath);
      const canvasFiles = files.filter(f => f.endsWith('.canvas'));

      if (canvasFiles.length === 0) {
        throw new Error('No .canvas files found in DreamNode');
      }

      // Use first canvas file (TODO: handle multiple canvas files in future)
      const canvasPath = path.join(dreamNodePath, canvasFiles[0]);
      const canvasContent = fs.readFileSync(canvasPath, 'utf-8');

      // Parse canvas using service
      const canvasParser = new CanvasParserService();
      const canvasData = canvasParser.parseCanvas(canvasContent);

      // Parse canvas to blocks
      let blocks = parseCanvasToBlocks(canvasData, dreamNodeId);

      // Resolve media paths to data URLs for embedding
      // Note: resolveMediaPaths may need vaultService - simplifying for now
      blocks = await resolveMediaPaths(blocks, dreamNodePath, null as any);

      // Get DreamTalk media if exists
      const dreamTalkMedia = udd.dreamTalk
        ? await this.loadDreamTalkMedia(path.join(dreamNodePath, udd.dreamTalk))
        : undefined;

      // Build link resolver map (will be populated when we integrate with DreamNodeService)
      const linkResolver = await this.buildLinkResolver(dreamNodePath);

      // Prepare data payload
      const dreamsongData = {
        dreamNodeName,
        dreamNodeId,
        dreamTalkMedia,
        blocks,
        linkResolver
      };

      // Read standalone template
      const templatePath = path.join(path.dirname(getCurrentFilePath()), 'dreamsong-standalone', 'index.html');
      const template = fs.readFileSync(templatePath, 'utf-8');

      // Inject data into template
      const html = template
        .replace('{{DREAMNODE_NAME}}', dreamNodeName)
        .replace('{{DREAMSONG_DATA}}', JSON.stringify(dreamsongData));

      // Create output directory
      const buildDir = path.join(dreamNodePath, '.github-pages-build');
      if (!fs.existsSync(buildDir)) {
        fs.mkdirSync(buildDir, { recursive: true });
      }

      // Write processed HTML
      const indexPath = path.join(buildDir, 'index.html');
      fs.writeFileSync(indexPath, html);

      // Copy standalone build assets
      const standalonePath = path.join(path.dirname(getCurrentFilePath()), 'dreamsong-standalone');

      // Run Vite build
      await execAsync(
        `npx vite build --config "${path.join(standalonePath, 'vite.config.ts')}" --outDir "${buildDir}"`,
        { cwd: standalonePath }
      );

      // Commit and push build to gh-pages branch (or main if GitHub Pages serves from main)
      await this.deployToPages(dreamNodePath, buildDir);

      return buildDir;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to build static site: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Load DreamTalk media file as data URL
   */
  private async loadDreamTalkMedia(mediaPath: string): Promise<any> {
    if (!fs.existsSync(mediaPath)) {
      return undefined;
    }

    // Read file and convert to data URL
    const buffer = fs.readFileSync(mediaPath);
    const base64 = buffer.toString('base64');

    // Determine MIME type from extension
    const ext = path.extname(mediaPath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg'
    };

    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    return [{
      path: path.basename(mediaPath),
      absolutePath: mediaPath,
      type: mimeType,
      data: `data:${mimeType};base64,${base64}`,
      size: buffer.length
    }];
  }

  /**
   * Build link resolver map for cross-DreamNode navigation
   */
  private async buildLinkResolver(_dreamNodePath: string): Promise<any> {
    // TODO: Query DreamNodeService for all DreamNodes and their hosting URLs
    // For now, return empty resolver
    return {
      githubPagesUrls: {},
      githubRepoUrls: {},
      radicleIds: {}
    };
  }

  /**
   * Deploy built site to GitHub Pages
   */
  private async deployToPages(dreamNodePath: string, _buildDir: string): Promise<void> {
    try {
      // Add build files to git
      await execAsync('git add .github-pages-build/', { cwd: dreamNodePath });

      // Commit build
      await execAsync(
        'git commit -m "Deploy DreamSong to GitHub Pages" || true',
        { cwd: dreamNodePath }
      );

      // Push to GitHub (GitHub Pages will auto-deploy from main branch)
      await execAsync('git push github main', { cwd: dreamNodePath });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to deploy to Pages: ${error.message}`);
      }
      throw error;
    }
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
