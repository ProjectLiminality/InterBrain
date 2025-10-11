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
import { sanitizeTitleToPascalCase } from '../../utils/title-sanitization';

const execAsync = promisify(exec);

// Helper to get current file path in CommonJS-style modules
const getCurrentFilePath = () => {
  // Check if we're in a CommonJS context with __filename available
  try {
    if (typeof __filename !== 'undefined') {
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

interface SubmoduleInfo {
  name: string;
  path: string;           // Full path to actual git repo (from url field)
  relativePath: string;   // Relative path within parent (from path field)
  url: string;            // URL from .gitmodules
}

export class GitHubService {
  private ghPath: string | null = null;
  private pluginDir: string | null = null;

  /**
   * Set the plugin directory path (must be called during plugin initialization)
   */
  setPluginDir(dir: string): void {
    this.pluginDir = dir;
    console.log(`GitHubService: Plugin directory set to ${dir}`);
  }

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
   * Sanitize DreamNode title for GitHub repository name
   * Uses unified PascalCase sanitization for consistency with file system
   */
  private sanitizeRepoName(title: string): string {
    return sanitizeTitleToPascalCase(title);
  }

  /**
   * Check if a GitHub repository exists
   */
  private async repoExists(repoName: string): Promise<boolean> {
    try {
      const ghPath = await this.detectGhPath();
      // Try to view repo (fails if doesn't exist)
      // Note: cwd doesn't matter for GitHub API calls
      await execAsync(`"${ghPath}" repo view ${repoName}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Find an available repository name, adding -2, -3, etc. if needed
   */
  private async findAvailableRepoName(title: string): Promise<string> {
    let repoName = this.sanitizeRepoName(title);

    // Handle edge case: sanitized name is empty
    if (!repoName) {
      repoName = 'dreamnode';
    }

    // Check if base name is available
    if (!(await this.repoExists(repoName))) {
      return repoName;
    }

    // Try numbered variants (-2, -3, etc.)
    let attempt = 2;
    while (attempt < 100) {  // Safety limit
      const numberedName = `${repoName}-${attempt}`;
      if (!(await this.repoExists(numberedName))) {
        return numberedName;
      }
      attempt++;
    }

    throw new Error(`Could not find available name for "${title}" after 100 attempts`);
  }

  /**
   * Read .udd file from DreamNode
   */
  private async readUDD(dreamNodePath: string): Promise<any> {
    const uddPath = path.join(dreamNodePath, '.udd');
    const content = fs.readFileSync(uddPath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Write .udd file to DreamNode
   */
  private async writeUDD(dreamNodePath: string, udd: any): Promise<void> {
    const uddPath = path.join(dreamNodePath, '.udd');
    fs.writeFileSync(uddPath, JSON.stringify(udd, null, 2), 'utf-8');
  }

  /**
   * Get list of submodules from .gitmodules file
   * Resolves GitHub URLs to local vault paths automatically
   */
  async getSubmodules(dreamNodePath: string, vaultPath?: string): Promise<SubmoduleInfo[]> {
    const gitmodulesPath = path.join(dreamNodePath, '.gitmodules');

    if (!fs.existsSync(gitmodulesPath)) {
      return [];
    }

    const content = fs.readFileSync(gitmodulesPath, 'utf-8');
    const submodules: SubmoduleInfo[] = [];

    // If vaultPath not provided, derive it from dreamNodePath
    if (!vaultPath) {
      vaultPath = path.dirname(dreamNodePath);
    }

    // Parse .gitmodules format
    const lines = content.split('\n');
    let currentSubmodule: Partial<SubmoduleInfo> = {};

    for (const line of lines) {
      const submoduleMatch = line.match(/\[submodule "([^"]+)"\]/);
      if (submoduleMatch) {
        if (currentSubmodule.name && currentSubmodule.url) {
          submodules.push(currentSubmodule as SubmoduleInfo);
        }
        currentSubmodule = { name: submoduleMatch[1] };
        continue;
      }

      const pathMatch = line.match(/path = (.+)/);
      if (pathMatch && currentSubmodule.name) {
        currentSubmodule.relativePath = pathMatch[1].trim();
      }

      const urlMatch = line.match(/url = (.+)/);
      if (urlMatch && currentSubmodule.name && currentSubmodule.relativePath) {
        const url = urlMatch[1].trim();
        currentSubmodule.url = url;

        // Resolve URL to local path
        if (url.startsWith('http') || url.startsWith('git@')) {
          // GitHub/remote URL - use relativePath to find standalone repo
          // The relativePath tells us the submodule directory name (e.g., "Thunderstorm-Generator-UPDATED-...")
          // The standalone repo should have the same name in the vault root
          const localPath = path.join(vaultPath, currentSubmodule.relativePath);

          if (fs.existsSync(localPath)) {
            currentSubmodule.path = localPath;
          } else {
            console.warn(`GitHubService: Local repo not found for ${url}: ${localPath}`);
            currentSubmodule.path = url; // Fallback to URL
          }
        } else {
          // Local path - use directly
          currentSubmodule.path = url;
        }
      }
    }

    if (currentSubmodule.name && currentSubmodule.url) {
      submodules.push(currentSubmodule as SubmoduleInfo);
    }

    return submodules;
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
  async createRepo(dreamNodePath: string, repoName: string): Promise<string> {
    // Verify directory exists
    if (!fs.existsSync(dreamNodePath)) {
      throw new Error(`DreamNode path does not exist: ${dreamNodePath}`);
    }

    // Ensure it's a git repo
    const gitDir = path.join(dreamNodePath, '.git');
    if (!fs.existsSync(gitDir)) {
      throw new Error('DreamNode is not a git repository. Cannot share to GitHub.');
    }

    try {
      const ghPath = await this.detectGhPath();

      // Create public GitHub repository with provided name
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
   * Enable GitHub Pages for repository (serves from gh-pages branch)
   */
  async setupPages(repoUrl: string): Promise<string> {
    // Extract owner/repo from URL
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/\s]+)/);
    if (!match) {
      throw new Error(`Invalid GitHub URL: ${repoUrl}`);
    }

    const [, owner, repo] = match;
    const cleanRepo = repo.replace(/\.git$/, '');
    const pagesUrl = `https://${owner}.github.io/${cleanRepo}`;

    try {
      const ghPath = await this.detectGhPath();

      // Enable GitHub Pages via API - serve from gh-pages branch
      // Note: gh CLI doesn't have native pages command, so we use gh api
      await execAsync(
        `"${ghPath}" api -X POST "repos/${owner}/${cleanRepo}/pages" -f source[branch]=gh-pages -f source[path]=/`
      );

      console.log(`GitHubService: GitHub Pages enabled successfully`);
      return pagesUrl;
    } catch (error) {
      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();

        // Pages already exists - this is fine, return the URL
        if (errorMsg.includes('already exists') ||
            errorMsg.includes('409') ||
            errorMsg.includes('unexpected end of json')) {
          console.log(`GitHubService: GitHub Pages already configured (this is expected)`);
          return pagesUrl;
        }

        // Other error - log but don't throw (non-fatal)
        console.warn(`GitHubService: Could not configure Pages API (site will still work):`, error.message);
        return pagesUrl;
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
   * @param blocks - Pre-computed DreamSongBlocks from local rendering (already has media resolved)
   */
  async buildStaticSite(
    dreamNodePath: string,
    dreamNodeId: string,
    dreamNodeName: string,
    blocks: any[] // DreamSongBlock[] from local cache
  ): Promise<string> {
    try {
      // Read .udd file to get metadata
      const uddPath = path.join(dreamNodePath, '.udd');
      if (!fs.existsSync(uddPath)) {
        throw new Error('.udd file not found');
      }

      const uddContent = fs.readFileSync(uddPath, 'utf-8');
      const udd = JSON.parse(uddContent);

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

      // Read pre-built viewer bundle from plugin root directory
      if (!this.pluginDir) {
        throw new Error('Plugin directory not set. GitHubService.setPluginDir() must be called during plugin initialization.');
      }

      const viewerBundlePath = path.join(this.pluginDir, 'viewer-bundle', 'index.html');

      console.log(`GitHubService: Looking for viewer bundle at ${viewerBundlePath}`);

      if (!fs.existsSync(viewerBundlePath)) {
        throw new Error(
          `Viewer bundle not found at ${viewerBundlePath}. Run "npm run plugin-build" to build the GitHub viewer bundle.`
        );
      }

      const template = fs.readFileSync(viewerBundlePath, 'utf-8');

      // Inject data into template
      const html = template
        .replace('{{DREAMNODE_NAME}}', dreamNodeName)
        .replace('{{DREAMSONG_DATA}}', JSON.stringify(dreamsongData));

      // Create output directory in system temp (outside the repo)
      const tmpOs = require('os');
      const buildDir = path.join(tmpOs.tmpdir(), `dreamsong-build-${dreamNodeId}-${Date.now()}`);
      if (!fs.existsSync(buildDir)) {
        fs.mkdirSync(buildDir, { recursive: true });
      }

      console.log(`GitHubService: Preparing static site at ${buildDir}`);

      // Write processed HTML
      const indexPath = path.join(buildDir, 'index.html');
      fs.writeFileSync(indexPath, html);

      // Copy assets directory (JS, CSS, images)
      const viewerAssetsDir = path.join(this.pluginDir, 'viewer-bundle', 'assets');
      const buildAssetsDir = path.join(buildDir, 'assets');

      if (fs.existsSync(viewerAssetsDir)) {
        // Create assets directory in build
        fs.mkdirSync(buildAssetsDir, { recursive: true });

        // Copy all files from viewer assets to build assets
        const assetFiles = fs.readdirSync(viewerAssetsDir);
        for (const file of assetFiles) {
          const srcPath = path.join(viewerAssetsDir, file);
          const destPath = path.join(buildAssetsDir, file);
          fs.copyFileSync(srcPath, destPath);
        }
        console.log(`GitHubService: Copied ${assetFiles.length} asset files`);
      } else {
        console.warn(`GitHubService: Assets directory not found at ${viewerAssetsDir}`);
      }

      console.log(`GitHubService: Static site ready for deployment`);

      // Deploy to gh-pages branch
      await this.deployToPages(dreamNodePath, buildDir);

      // Cleanup temp directory
      try {
        fs.rmSync(buildDir, { recursive: true, force: true });
        console.log(`GitHubService: Cleaned up temp build directory`);
      } catch (error) {
        console.warn(`GitHubService: Failed to cleanup temp directory:`, error);
      }

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
   *
   * Queries all submodules and extracts their hosting URLs from .udd files.
   * This enables UUID-based navigation on GitHub Pages (click media → open source DreamNode).
   */
  private async buildLinkResolver(dreamNodePath: string): Promise<any> {
    const githubPagesUrls: Record<string, string> = {};
    const githubRepoUrls: Record<string, string> = {};
    const radicleIds: Record<string, string> = {};

    try {
      // Get vault path (parent of dreamNodePath)
      const vaultPath = path.dirname(dreamNodePath);

      // Get all submodules for this DreamNode
      const submodules = await this.getSubmodules(dreamNodePath, vaultPath);
      console.log(`GitHubService: Building link resolver for ${submodules.length} submodule(s)`);

      for (const submodule of submodules) {
        try {
          // Read .udd file from submodule
          const uddPath = path.join(submodule.path, '.udd');

          if (!fs.existsSync(uddPath)) {
            console.warn(`GitHubService: .udd not found for submodule ${submodule.name} at ${uddPath}`);
            continue;
          }

          const uddContent = fs.readFileSync(uddPath, 'utf-8');
          const udd = JSON.parse(uddContent);

          if (!udd.uuid) {
            console.warn(`GitHubService: UUID missing in .udd for submodule ${submodule.name}`);
            continue;
          }

          // Map UUID to hosting URLs
          if (udd.githubPagesUrl) {
            githubPagesUrls[udd.uuid] = udd.githubPagesUrl;
            console.log(`GitHubService: Mapped ${submodule.name} (${udd.uuid}) → Pages: ${udd.githubPagesUrl}`);
          }

          if (udd.githubRepoUrl) {
            githubRepoUrls[udd.uuid] = udd.githubRepoUrl;
            console.log(`GitHubService: Mapped ${submodule.name} (${udd.uuid}) → Repo: ${udd.githubRepoUrl}`);
          }

          if (udd.radicleId) {
            radicleIds[udd.uuid] = udd.radicleId;
            console.log(`GitHubService: Mapped ${submodule.name} (${udd.uuid}) → Radicle: ${udd.radicleId}`);
          }

        } catch (error) {
          console.error(`GitHubService: Failed to read .udd for submodule ${submodule.name}:`, error);
          // Continue with other submodules
        }
      }

      console.log(`GitHubService: Link resolver built - ${Object.keys(githubPagesUrls).length} Pages URLs, ${Object.keys(githubRepoUrls).length} Repo URLs, ${Object.keys(radicleIds).length} Radicle IDs`);

      return {
        githubPagesUrls,
        githubRepoUrls,
        radicleIds
      };

    } catch (error) {
      console.error('GitHubService: Failed to build link resolver:', error);
      // Return empty resolver on error (media will be non-clickable)
      return {
        githubPagesUrls: {},
        githubRepoUrls: {},
        radicleIds: {}
      };
    }
  }

  /**
   * Resolve source DreamNode UUID from submodule .udd file
   * Mirrors the logic from media-resolver.ts but uses Node.js fs directly
   */
  private async resolveSourceDreamNodeUuid(
    filename: string,
    vaultPath: string
  ): Promise<string | null> {
    try {
      // Extract submodule directory from canvas path
      // Canvas paths look like: "ArkCrystal/VectorEquilibrium/Vector Equilibrium.jpeg"
      // We want the second segment: "VectorEquilibrium"
      const submoduleMatch = filename.match(/^([^/]+)\/([^/]+)\//);

      if (!submoduleMatch) {
        // Local file (no submodule path) - not clickable
        console.log(`[GitHubService] Local file (non-clickable): ${filename}`);
        return null;
      }

      const submoduleDirName = submoduleMatch[2]; // "VectorEquilibrium"
      console.log(`[GitHubService] Detected submodule media: ${filename} → directory: ${submoduleDirName}`);

      // Read .udd file from submodule directory
      const uddPath = path.join(vaultPath, submoduleDirName, '.udd');

      if (!fs.existsSync(uddPath)) {
        // CRITICAL ERROR: Missing .udd file
        console.error(`❌ [GitHubService] CORRUPTED DREAMNODE: ${submoduleDirName} is missing .udd metadata file`);
        console.error(`   Expected .udd at: ${uddPath}`);
        console.error(`   Media will be non-clickable until .udd is restored`);
        return null;
      }

      // Parse .udd file to extract UUID
      const uddContent = fs.readFileSync(uddPath, 'utf-8');
      const udd = JSON.parse(uddContent);

      if (!udd.uuid) {
        console.error(`❌ [GitHubService] CORRUPTED DREAMNODE: ${submoduleDirName} .udd file is missing UUID field`);
        return null;
      }

      console.log(`✅ [GitHubService] Resolved UUID for ${submoduleDirName}: ${udd.uuid}`);
      return udd.uuid;

    } catch (error) {
      console.error(`❌ [GitHubService] FAILED to resolve UUID from .udd file for ${filename}:`, error);
      return null;
    }
  }

  /**
   * Deploy built site to GitHub Pages using gh-pages branch strategy
   * Creates an orphan branch with only the built HTML (no source files)
   */
  private async deployToPages(dreamNodePath: string, buildDir: string): Promise<void> {
    try {
      // Step 1: Initialize a fresh git repo in temp directory
      await execAsync(`git init`, { cwd: buildDir });

      // Step 2: Add all built files
      await execAsync(`git add .`, { cwd: buildDir });

      // Step 3: Commit built site
      await execAsync(
        `git commit -m "Deploy DreamSong to GitHub Pages"`,
        { cwd: buildDir }
      );

      // Step 4: Get the remote URL from main repo
      const { stdout: remoteUrl } = await execAsync(
        `git remote get-url github`,
        { cwd: dreamNodePath }
      );

      // Step 5: Add remote to build repo
      await execAsync(
        `git remote add origin ${remoteUrl.trim()}`,
        { cwd: buildDir }
      );

      // Step 6: Force push to gh-pages branch (orphan branch)
      await execAsync(
        `git push -f origin HEAD:gh-pages`,
        { cwd: buildDir }
      );

      console.log('GitHubService: Successfully deployed to gh-pages branch');

    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to deploy to Pages: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Update .gitmodules file to replace local paths with GitHub URLs
   */
  private async updateGitmodulesUrls(
    dreamNodePath: string,
    sharedSubmodules: Array<{ uuid: string; githubUrl: string; title: string; relativePath: string }>
  ): Promise<void> {
    const gitmodulesPath = path.join(dreamNodePath, '.gitmodules');
    let content = fs.readFileSync(gitmodulesPath, 'utf-8');

    for (const submodule of sharedSubmodules) {
      // Ensure .git suffix
      const gitUrl = submodule.githubUrl.replace(/\.git$/, '') + '.git';

      // Build regex to find this specific submodule's URL line
      const escapedPath = submodule.relativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const urlRegex = new RegExp(
        `(\\[submodule "[^"]*"\\]\\s*path = ${escapedPath}\\s*url = )([^\\n]+)`,
        'gi'
      );

      // Replace URL only if it's not already a GitHub URL
      content = content.replace(urlRegex, (match, prefix, url) => {
        if (url.trim().startsWith('http') || url.trim().startsWith('git@')) {
          return match; // Already a remote URL
        }
        return `${prefix}${gitUrl}`;
      });
    }

    fs.writeFileSync(gitmodulesPath, content);
  }

  /**
   * Share a single submodule recursively
   */
  private async shareSubmodule(
    submodulePath: string,
    visitedUUIDs: Set<string>
  ): Promise<{ uuid: string; githubUrl: string; title: string; relativePath: string }> {

    // Read submodule's .udd
    const udd = await this.readUDD(submodulePath);

    // Check for circular dependencies
    if (visitedUUIDs.has(udd.uuid)) {
      console.log(`GitHubService: Skipping circular dependency: ${udd.title}`);
      if (!udd.githubRepoUrl) {
        throw new Error(`Circular dependency detected but node not yet shared: ${udd.title}`);
      }
      return {
        uuid: udd.uuid,
        githubUrl: udd.githubRepoUrl,
        title: udd.title,
        relativePath: path.basename(submodulePath)
      };
    }

    // Mark as visited
    visitedUUIDs.add(udd.uuid);

    // Check if already shared - if so, skip repo creation but still rebuild Pages
    if (udd.githubRepoUrl) {
      console.log(`GitHubService: Submodule already shared, rebuilding GitHub Pages: ${udd.title}`);

      // Rebuild GitHub Pages with latest code (includes UUID resolution)
      try {
        const { parseCanvasToBlocks, getMimeType } = await import('../../services/dreamsong');
        const files = fs.readdirSync(submodulePath);
        const canvasFiles = files.filter(f => f.endsWith('.canvas'));
        let blocks: any[] = [];

        if (canvasFiles.length > 0) {
          const canvasPath = path.join(submodulePath, canvasFiles[0]);
          const canvasContent = fs.readFileSync(canvasPath, 'utf-8');
          const canvasData = JSON.parse(canvasContent);
          blocks = parseCanvasToBlocks(canvasData, udd.uuid);

          const vaultPath = path.dirname(submodulePath);
          for (const block of blocks) {
            if (block.media && block.media.src && !block.media.src.startsWith('data:') && !block.media.src.startsWith('http')) {
              const resolvedUuid = await this.resolveSourceDreamNodeUuid(block.media.src, vaultPath);
              if (resolvedUuid) {
                block.media.sourceDreamNodeId = resolvedUuid;
              }
              const mediaPath = path.join(vaultPath, block.media.src);
              if (fs.existsSync(mediaPath)) {
                const buffer = fs.readFileSync(mediaPath);
                const base64 = buffer.toString('base64');
                const mimeType = getMimeType(block.media.src);
                block.media.src = `data:${mimeType};base64,${base64}`;
              }
            }
          }
        } else if (udd.dreamTalk) {
          const dreamTalkPath = path.join(submodulePath, udd.dreamTalk);
          if (fs.existsSync(dreamTalkPath)) {
            const buffer = fs.readFileSync(dreamTalkPath);
            const base64 = buffer.toString('base64');
            const mimeType = getMimeType(udd.dreamTalk);
            blocks = [{
              id: 'dreamtalk-fallback',
              type: 'media',
              media: { src: `data:${mimeType};base64,${base64}`, type: mimeType.startsWith('video/') ? 'video' : 'image', alt: udd.title },
              text: '',
              edges: []
            }];
          }
        }

        await this.buildStaticSite(submodulePath, udd.uuid, udd.title, blocks);
        console.log(`GitHubService: Rebuilt GitHub Pages for ${udd.title}`);
      } catch (error) {
        console.warn(`GitHubService: Failed to rebuild Pages for ${udd.title}:`, error);
      }

      return {
        uuid: udd.uuid,
        githubUrl: udd.githubRepoUrl,
        title: udd.title,
        relativePath: path.basename(submodulePath)
      };
    }

    // Recursively share this submodule (creates repo + builds Pages)
    console.log(`GitHubService: Sharing submodule: ${udd.title}`);
    const result = await this.shareDreamNode(submodulePath, udd.uuid, visitedUUIDs);

    // Update submodule's .udd with GitHub URLs
    udd.githubRepoUrl = result.repoUrl;
    if (result.pagesUrl) {
      udd.githubPagesUrl = result.pagesUrl;
    }
    await this.writeUDD(submodulePath, udd);

    // Commit .udd update in submodule
    try {
      await execAsync(
        'git add .udd && git commit -m "Add GitHub URLs to .udd" && git push github main || true',
        { cwd: submodulePath }
      );
    } catch (error) {
      console.warn('GitHubService: Failed to commit .udd update in submodule:', error);
    }

    return {
      uuid: udd.uuid,
      githubUrl: result.repoUrl,
      title: udd.title,
      relativePath: path.basename(submodulePath)
    };
  }

  /**
   * Unpublish a single submodule recursively
   */
  private async unpublishSubmodule(
    submodulePath: string,
    vaultPath: string,
    visitedUUIDs: Set<string>
  ): Promise<{ uuid: string; title: string }> {
    // Read submodule's .udd
    const udd = await this.readUDD(submodulePath);

    // Check for circular dependencies
    if (visitedUUIDs.has(udd.uuid)) {
      console.log(`GitHubService: Skipping circular dependency: ${udd.title}`);
      return { uuid: udd.uuid, title: udd.title };
    }

    // Mark as visited
    visitedUUIDs.add(udd.uuid);

    // Check if this submodule is even published
    if (!udd.githubRepoUrl) {
      console.log(`GitHubService: Submodule not published, skipping: ${udd.title}`);
      return { uuid: udd.uuid, title: udd.title };
    }

    // Recursively unpublish this submodule
    console.log(`GitHubService: Unpublishing submodule: ${udd.title}`);
    await this.unpublishDreamNode(submodulePath, udd.uuid, vaultPath, visitedUUIDs);

    return { uuid: udd.uuid, title: udd.title };
  }

  /**
   * Unpublish DreamNode from GitHub (delete remote repo, clean metadata)
   */
  async unpublishDreamNode(
    dreamNodePath: string,
    dreamNodeUuid: string,
    vaultPath: string,
    visitedUUIDs: Set<string> = new Set()
  ): Promise<void> {
    // Read .udd to get GitHub info
    const udd = await this.readUDD(dreamNodePath);

    // Mark as visited
    visitedUUIDs.add(dreamNodeUuid);

    // Check if published
    if (!udd.githubRepoUrl) {
      throw new Error(`DreamNode "${udd.title}" is not published to GitHub`);
    }

    // Step 1: Unpublish all submodules recursively (depth-first)
    const submodules = await this.getSubmodules(dreamNodePath, vaultPath);
    console.log(`GitHubService: Found ${submodules.length} submodule(s) for ${udd.title}`);

    for (const submodule of submodules) {
      try {
        console.log(`GitHubService: Processing submodule at ${submodule.path}`);
        await this.unpublishSubmodule(submodule.path, vaultPath, visitedUUIDs);
      } catch (error) {
        console.error(`GitHubService: Failed to unpublish submodule ${submodule.name}:`, error);
        // Continue with other submodules
      }
    }

    // Step 2: Delete gh-pages branch first (if exists)
    const repoMatch = udd.githubRepoUrl.match(/github\.com\/([^/]+)\/([^/\s]+)/);
    if (repoMatch) {
      const [, owner, repo] = repoMatch;
      const cleanRepo = repo.replace(/\.git$/, '');

      try {
        const ghPath = await this.detectGhPath();

        // Try to delete gh-pages branch
        console.log(`GitHubService: Deleting gh-pages branch from ${owner}/${cleanRepo}`);
        try {
          await execAsync(`"${ghPath}" api -X DELETE "repos/${owner}/${cleanRepo}/git/refs/heads/gh-pages"`);
          console.log(`GitHubService: gh-pages branch deleted`);
        } catch {
          // Branch might not exist - that's okay
          console.log(`GitHubService: gh-pages branch not found (may not exist)`);
        }

        // Delete GitHub repository
        console.log(`GitHubService: Deleting GitHub repository: ${owner}/${cleanRepo}`);
        await execAsync(`"${ghPath}" repo delete ${owner}/${cleanRepo} --yes`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Check for missing delete_repo scope
        if (errorMessage.includes('delete_repo')) {
          throw new Error(
            'GitHub CLI needs "delete_repo" permission.\n\n' +
            'Run this command in your terminal:\n' +
            'gh auth refresh -h github.com -s delete_repo'
          );
        }

        // Check for already deleted
        if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
          console.log(`GitHubService: Repository already deleted: ${owner}/${cleanRepo}`);
          // Continue - repo already deleted
        } else {
          console.warn(`GitHubService: Failed to delete GitHub repo:`, error);
          throw new Error(`Failed to delete repository: ${errorMessage}`);
        }
      }
    }

    // Step 3: Remove github remote from local repo
    try {
      await execAsync('git remote remove github', { cwd: dreamNodePath });
      console.log(`GitHubService: Removed 'github' remote from local repo`);
    } catch (error) {
      console.warn(`GitHubService: Failed to remove github remote (may not exist):`, error);
      // Continue - remote might not exist
    }

    // Step 4: Clean .udd file
    delete udd.githubRepoUrl;
    delete udd.githubPagesUrl;
    await this.writeUDD(dreamNodePath, udd);
    console.log(`GitHubService: Cleaned GitHub URLs from .udd`);

    // Step 5: Commit .udd changes
    try {
      await execAsync(
        'git add .udd && git commit -m "Remove GitHub URLs from .udd" || true',
        { cwd: dreamNodePath }
      );
    } catch (error) {
      console.warn(`GitHubService: Failed to commit .udd cleanup:`, error);
    }
  }

  /**
   * Complete share workflow: create repo, enable Pages, update UDD
   */
  async shareDreamNode(
    dreamNodePath: string,
    dreamNodeUuid: string,
    visitedUUIDs: Set<string> = new Set()
  ): Promise<GitHubShareResult> {
    // Read .udd to get title
    const udd = await this.readUDD(dreamNodePath);

    // Mark this node as visited (prevent circular deps)
    visitedUUIDs.add(dreamNodeUuid);

    // Step 1: Discover and share all submodules recursively (depth-first)
    const submodules = await this.getSubmodules(dreamNodePath);
    const sharedSubmodules: Array<{ uuid: string; githubUrl: string; title: string; relativePath: string }> = [];

    console.log(`GitHubService: Found ${submodules.length} submodule(s) for ${udd.title}`);

    for (const submodule of submodules) {
      try {
        console.log(`GitHubService: Processing submodule at ${submodule.path}`);
        const result = await this.shareSubmodule(submodule.path, visitedUUIDs);
        sharedSubmodules.push(result);
      } catch (error) {
        console.error(`GitHubService: Failed to share submodule ${submodule.name}:`, error);
        // Continue with other submodules
      }
    }

    // Step 2: Update .gitmodules with GitHub URLs
    if (sharedSubmodules.length > 0) {
      console.log(`GitHubService: Updating .gitmodules with GitHub URLs`);
      await this.updateGitmodulesUrls(dreamNodePath, sharedSubmodules);

      // Commit .gitmodules changes
      try {
        await execAsync(
          'git add .gitmodules && git commit -m "Update submodule URLs for GitHub" || true',
          { cwd: dreamNodePath }
        );
      } catch (error) {
        console.warn('GitHubService: Failed to commit .gitmodules update:', error);
      }
    }

    // Step 3: Find available repo name based on title
    const repoName = await this.findAvailableRepoName(udd.title);
    console.log(`GitHubService: Using repository name: ${repoName}`);

    // Step 4: Create GitHub repository
    const repoUrl = await this.createRepo(dreamNodePath, repoName);

    // Step 5: Build and deploy static DreamSong site
    let pagesUrl: string | undefined;
    console.log(`GitHubService: Building static site for ${udd.title}...`);
    try {
      // Use the same parsing pipeline as local rendering
      // This ensures GitHub Pages displays exactly what you see locally
      const { parseCanvasToBlocks, getMimeType } = await import('../../services/dreamsong');

      // Find and parse canvas file
      const files = fs.readdirSync(dreamNodePath);
      const canvasFiles = files.filter(f => f.endsWith('.canvas'));

      let blocks: any[] = [];

      // Fallback hierarchy: DreamSong → DreamTalk → README
      if (canvasFiles.length > 0) {
        // PRIMARY: DreamSong (canvas file) - Full rich content
        console.log(`GitHubService: Using DreamSong (.canvas) for GitHub Pages`);
        const canvasPath = path.join(dreamNodePath, canvasFiles[0]);
        const canvasContent = fs.readFileSync(canvasPath, 'utf-8');
        const canvasData = JSON.parse(canvasContent);

        // Parse canvas to blocks (same as local rendering)
        blocks = parseCanvasToBlocks(canvasData, dreamNodeUuid);

        // Derive vault path from DreamNode path
        // Canvas media paths are vault-relative, not DreamNode-relative
        const vaultPath = path.dirname(dreamNodePath);

        // Resolve media paths to data URLs AND extract UUIDs from submodule .udd files
        for (const block of blocks) {
          if (block.media && block.media.src && !block.media.src.startsWith('data:') && !block.media.src.startsWith('http')) {
            try {
              // Step 1: Resolve UUID from submodule .udd file (if this is submodule media)
              const resolvedUuid = await this.resolveSourceDreamNodeUuid(block.media.src, vaultPath);
              if (resolvedUuid) {
                block.media.sourceDreamNodeId = resolvedUuid;
                console.log(`GitHubService: Resolved UUID for ${block.media.src} → ${resolvedUuid}`);
              }

              // Step 2: Resolve file path to data URL
              // Canvas paths are vault-relative (e.g., "ArkCrystal/ARK Crystal.jpeg")
              // Resolve relative to vault path, not DreamNode path
              const mediaPath = path.join(vaultPath, block.media.src);
              console.log(`GitHubService: Resolving media ${block.media.src} at ${mediaPath}`);

              if (fs.existsSync(mediaPath)) {
                const buffer = fs.readFileSync(mediaPath);
                const base64 = buffer.toString('base64');
                const mimeType = getMimeType(block.media.src);
                block.media.src = `data:${mimeType};base64,${base64}`;
                console.log(`GitHubService: Successfully loaded media ${block.media.src.slice(0, 50)}...`);
              } else {
                console.warn(`GitHubService: Media file not found: ${mediaPath}`);
              }
            } catch (error) {
              console.warn(`GitHubService: Could not load media ${block.media.src}:`, error);
            }
          }
        }
      } else if (udd.dreamTalk) {
        // FALLBACK 1: DreamTalk media file - Single image/video
        console.log(`GitHubService: No DreamSong found, using DreamTalk media fallback`);
        const dreamTalkPath = path.join(dreamNodePath, udd.dreamTalk);
        if (fs.existsSync(dreamTalkPath)) {
          const buffer = fs.readFileSync(dreamTalkPath);
          const base64 = buffer.toString('base64');
          const mimeType = getMimeType(udd.dreamTalk);
          const dataUrl = `data:${mimeType};base64,${base64}`;

          // Create a single media block with proper type field
          blocks = [{
            id: 'dreamtalk-fallback',
            type: 'media', // IMPORTANT: Must set type for DreamSong component
            media: {
              src: dataUrl,
              type: mimeType.startsWith('video/') ? 'video' : 'image',
              alt: udd.title
            },
            text: '',
            edges: []
          }];
          console.log(`GitHubService: Created DreamTalk fallback block`);
        } else {
          console.warn(`GitHubService: DreamTalk file not found: ${dreamTalkPath}`);
        }
      } else {
        // FALLBACK 2: README.md - Text content
        console.log(`GitHubService: No DreamSong or DreamTalk found, checking for README.md`);
        const readmePath = path.join(dreamNodePath, 'README.md');
        if (fs.existsSync(readmePath)) {
          const readmeContent = fs.readFileSync(readmePath, 'utf-8');

          // Simple markdown to HTML conversion (basic support)
          let htmlContent = readmeContent
            // Headers
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            // Bold
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Italic
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            // Links
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
            // Line breaks to paragraphs
            .split('\n\n')
            .map(para => para.trim() ? `<p>${para.replace(/\n/g, '<br>')}</p>` : '')
            .join('');

          // Create a single text block with proper type field
          blocks = [{
            id: 'readme-fallback',
            type: 'text', // IMPORTANT: Must set type for DreamSong component
            text: htmlContent,
            edges: []
          }];
          console.log(`GitHubService: Created README.md fallback block with HTML conversion`);
        } else {
          console.warn(`GitHubService: No content found - no DreamSong, DreamTalk, or README.md`);
        }
      }

      await this.buildStaticSite(dreamNodePath, dreamNodeUuid, udd.title, blocks);
      console.log(`GitHubService: Static site built and deployed to gh-pages branch`);

      // Step 6: Setup GitHub Pages (configure to serve from gh-pages branch)
      // IMPORTANT: This must happen AFTER buildStaticSite pushes the gh-pages branch
      try {
        pagesUrl = await this.setupPages(repoUrl);
        console.log(`GitHubService: GitHub Pages configured: ${pagesUrl}`);
      } catch (error) {
        console.warn('GitHubService: Failed to enable GitHub Pages:', error);
        // Continue without Pages URL - site is deployed but Pages config might fail
      }

    } catch (error) {
      console.warn(`GitHubService: Failed to build static site (will continue without Pages):`, error);
      // Non-fatal - repo is created, just no Pages hosting
    }

    // Step 7: Generate Obsidian URI
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
