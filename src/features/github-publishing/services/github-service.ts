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
import { sanitizeTitleToPascalCase } from '../../dreamnode/utils/title-sanitization';
import { URIHandlerService } from '../../uri-handler';
import { UDDService } from '../../dreamnode/services/udd-service';

const execAsync = promisify(exec);

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
   * Delegates to UDDService for canonical .udd operations
   */
  private async readUDD(dreamNodePath: string): Promise<any> {
    return UDDService.readUDD(dreamNodePath);
  }

  /**
   * Write .udd file to DreamNode
   * Delegates to UDDService for canonical .udd operations
   */
  private async writeUDD(dreamNodePath: string, udd: any): Promise<void> {
    await UDDService.writeUDD(dreamNodePath, udd);
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

      return pagesUrl;
    } catch (error) {
      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();

        // Pages already exists - this is fine, return the URL
        if (errorMsg.includes('already exists') ||
            errorMsg.includes('409') ||
            errorMsg.includes('unexpected end of json')) {
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
   * Delegates to URIHandlerService for canonical URL generation
   */
  generateObsidianURI(repoUrl: string): string {
    return URIHandlerService.generateGitHubCloneLink('', repoUrl);
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

      // Clone with --single-branch (avoids gh-pages and other branches)
      // Try main first, fall back to master for older repos, then let git auto-detect default
      try {
        await execAsync(`git clone --single-branch -b main "${githubUrl}" "${destinationPath}"`);
      } catch {
        // If main branch doesn't exist, try master (older repos like octocat/Hello-World)
        try {
          await execAsync(`git clone --single-branch -b master "${githubUrl}" "${destinationPath}"`);
        } catch {
          // If both fail, let git auto-detect the default branch
          await execAsync(`git clone --single-branch "${githubUrl}" "${destinationPath}"`);
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to clone from GitHub: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Build static DreamSong site for GitHub Pages
   * @param blocks - DreamSongBlocks with media._absolutePath for files to copy
   * @param vaultPath - Path to vault for resolving relative media paths
   */
  async buildStaticSite(
    dreamNodePath: string,
    dreamNodeId: string,
    dreamNodeName: string,
    blocks: any[], // DreamSongBlock[] with _absolutePath metadata
    _vaultPath?: string
  ): Promise<string> {
    try {
      // Read .udd file to get metadata
      const uddPath = path.join(dreamNodePath, '.udd');
      if (!fs.existsSync(uddPath)) {
        throw new Error('.udd file not found');
      }

      const uddContent = fs.readFileSync(uddPath, 'utf-8');
      const udd = JSON.parse(uddContent);

      // Create output directory in system temp (outside the repo)
      const tmpOs = require('os');
      const buildDir = path.join(tmpOs.tmpdir(), `dreamsong-build-${dreamNodeId}-${Date.now()}`);
      if (!fs.existsSync(buildDir)) {
        fs.mkdirSync(buildDir, { recursive: true });
      }


      // Create media directory for copied files
      const mediaDir = path.join(buildDir, 'media');
      fs.mkdirSync(mediaDir, { recursive: true });

      // Track used filenames to handle collisions
      const usedFilenames = new Set<string>();

      // Helper to get unique filename
      const getUniqueFilename = (originalPath: string): string => {
        const ext = path.extname(originalPath);
        const base = path.basename(originalPath, ext);
        let filename = `${base}${ext}`;
        let counter = 1;

        while (usedFilenames.has(filename.toLowerCase())) {
          filename = `${base}-${counter}${ext}`;
          counter++;
        }

        usedFilenames.add(filename.toLowerCase());
        return filename;
      };

      // Copy media files and update block references
      for (const block of blocks) {
        if (block.media && block.media._absolutePath) {
          const absolutePath = block.media._absolutePath;

          if (fs.existsSync(absolutePath)) {
            const uniqueFilename = getUniqueFilename(absolutePath);
            const destPath = path.join(mediaDir, uniqueFilename);

            fs.copyFileSync(absolutePath, destPath);

            // Update src to relative path (works in browser)
            block.media.src = `./media/${uniqueFilename}`;

          } else {
            console.warn(`GitHubService: Media file not found: ${absolutePath}`);
          }

          // Clean up internal metadata before serialization
          delete block.media._absolutePath;
        }
      }


      // Handle DreamTalk media (copy file, not embed)
      let dreamTalkMedia: any[] | undefined;
      if (udd.dreamTalk) {
        const dreamTalkPath = path.join(dreamNodePath, udd.dreamTalk);
        if (fs.existsSync(dreamTalkPath)) {
          const uniqueFilename = getUniqueFilename(dreamTalkPath);
          const destPath = path.join(mediaDir, uniqueFilename);

          fs.copyFileSync(dreamTalkPath, destPath);

          // Determine MIME type from extension
          const ext = path.extname(dreamTalkPath).toLowerCase();
          const mimeTypes: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.ogg': 'audio/ogg'
          };
          const mimeType = mimeTypes[ext] || 'application/octet-stream';

          dreamTalkMedia = [{
            path: path.basename(dreamTalkPath),
            type: mimeType,
            data: `./media/${uniqueFilename}`, // Relative path instead of data URL
            size: fs.statSync(dreamTalkPath).size
          }];

        }
      }

      // Build link resolver map
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

      const viewerBundlePath = path.join(this.pluginDir, 'src/features/github-publishing/viewer-bundle', 'index.html');


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

      // Write processed HTML
      const indexPath = path.join(buildDir, 'index.html');
      fs.writeFileSync(indexPath, html);

      // Copy assets directory (JS, CSS, images)
      const viewerAssetsDir = path.join(this.pluginDir, 'src/features/github-publishing/viewer-bundle', 'assets');
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
      } else {
        console.warn(`GitHubService: Assets directory not found at ${viewerAssetsDir}`);
      }


      // Deploy to gh-pages branch
      await this.deployToPages(dreamNodePath, buildDir);

      // Cleanup temp directory
      try {
        fs.rmSync(buildDir, { recursive: true, force: true });
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
          }

          if (udd.githubRepoUrl) {
            githubRepoUrls[udd.uuid] = udd.githubRepoUrl;
          }

          if (udd.radicleId) {
            radicleIds[udd.uuid] = udd.radicleId;
          }

        } catch (error) {
          console.error(`GitHubService: Failed to read .udd for submodule ${submodule.name}:`, error);
          // Continue with other submodules
        }
      }


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
        return null;
      }

      const submoduleDirName = submoduleMatch[2]; // "VectorEquilibrium"
      const submodulePath = path.join(vaultPath, submoduleDirName);

      // Check if .udd exists using UDDService
      if (!UDDService.uddExists(submodulePath)) {
        console.error(`❌ [GitHubService] CORRUPTED DREAMNODE: ${submoduleDirName} is missing .udd metadata file`);
        return null;
      }

      // Get UUID using UDDService
      return await UDDService.getUUID(submodulePath);

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

      // Rebuild GitHub Pages with latest code (includes UUID resolution)
      try {
        const { parseCanvasToBlocks } = await import('../../dreamweaving/dreamsong/index');
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
              // Store absolute path for file copy (NOT base64 embedding - avoids huge HTML files)
              const mediaPath = path.join(vaultPath, block.media.src);
              if (fs.existsSync(mediaPath)) {
                block.media._absolutePath = mediaPath;
              }
            }
          }
        } else if (udd.dreamTalk) {
          // DreamTalk-only nodes are handled by buildStaticSite via udd.dreamTalk
          blocks = [];
        }

        await this.buildStaticSite(submodulePath, udd.uuid, udd.title, blocks);
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
      return { uuid: udd.uuid, title: udd.title };
    }

    // Mark as visited
    visitedUUIDs.add(udd.uuid);

    // Check if this submodule is even published
    if (!udd.githubRepoUrl) {
      return { uuid: udd.uuid, title: udd.title };
    }

    // Recursively unpublish this submodule
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

    for (const submodule of submodules) {
      try {
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
        try {
          await execAsync(`"${ghPath}" api -X DELETE "repos/${owner}/${cleanRepo}/git/refs/heads/gh-pages"`);
        } catch {
          // Branch might not exist - that's okay
        }

        // Delete GitHub repository
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
    } catch (error) {
      console.warn(`GitHubService: Failed to remove github remote (may not exist):`, error);
      // Continue - remote might not exist
    }

    // Step 4: Clean .udd file
    delete udd.githubRepoUrl;
    delete udd.githubPagesUrl;
    await this.writeUDD(dreamNodePath, udd);

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

    // Check if already shared - .udd file has githubRepoUrl
    if (udd.githubRepoUrl) {

      // Generate Obsidian URI
      const obsidianUri = this.generateObsidianURI(udd.githubRepoUrl);

      return {
        repoUrl: udd.githubRepoUrl,
        pagesUrl: udd.githubPagesUrl,
        obsidianUri
      };
    }

    // Check if 'github' remote exists (edge case: previously shared but .udd not updated)
    try {
      const { stdout } = await execAsync('git remote get-url github', { cwd: dreamNodePath });
      const existingGitHubUrl = stdout.trim();

      if (existingGitHubUrl) {

        // Update .udd with missing GitHub URL
        udd.githubRepoUrl = existingGitHubUrl;
        await this.writeUDD(dreamNodePath, udd);

        // Build and deploy static site (idempotent - safe to run multiple times)
        let pagesUrl: string | undefined;
        try {
          const { parseCanvasToBlocks } = await import('../../dreamweaving/dreamsong/index');

          const files = fs.readdirSync(dreamNodePath);
          const canvasFiles = files.filter(f => f.endsWith('.canvas'));

          let blocks: any[] = [];

          if (canvasFiles.length > 0) {
            const canvasPath = path.join(dreamNodePath, canvasFiles[0]);
            const canvasContent = fs.readFileSync(canvasPath, 'utf-8');
            const canvasData = JSON.parse(canvasContent);

            blocks = parseCanvasToBlocks(canvasData, dreamNodeUuid);

            const vaultPath = path.dirname(dreamNodePath);

            // Store absolute paths for media files (buildStaticSite will copy them)
            for (const block of blocks) {
              if (block.media && block.media.src && !block.media.src.startsWith('data:') && !block.media.src.startsWith('http')) {
                try {
                  const resolvedUuid = await this.resolveSourceDreamNodeUuid(block.media.src, vaultPath);
                  if (resolvedUuid) {
                    block.media.sourceDreamNodeId = resolvedUuid;
                  }

                  // Store absolute path for later file copy (NOT base64 embedding)
                  const mediaPath = path.join(vaultPath, block.media.src);

                  if (fs.existsSync(mediaPath)) {
                    block.media._absolutePath = mediaPath;
                  } else {
                    console.warn(`GitHubService: Media file not found: ${mediaPath}`);
                  }
                } catch (error) {
                  console.warn(`GitHubService: Could not process media ${block.media.src}:`, error);
                }
              }
            }
          } else if (udd.dreamTalk) {
            // DreamTalk media file - handled by buildStaticSite
            blocks = [];
          } else {
            const readmePath = path.join(dreamNodePath, 'README.md');
            if (fs.existsSync(readmePath)) {
              const readmeContent = fs.readFileSync(readmePath, 'utf-8');

              let htmlContent = readmeContent
                .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
                .split('\n\n')
                .map(para => para.trim() ? `<p>${para.replace(/\n/g, '<br>')}</p>` : '')
                .join('');

              blocks = [{
                id: 'readme-fallback',
                type: 'text',
                text: htmlContent,
                edges: []
              }];
            } else {
              console.warn(`GitHubService: No content found - no DreamSong, DreamTalk, or README.md`);
            }
          }

          await this.buildStaticSite(dreamNodePath, dreamNodeUuid, udd.title, blocks);

          // Setup GitHub Pages (idempotent - will succeed even if already configured)
          try {
            pagesUrl = await this.setupPages(existingGitHubUrl);

            // Update .udd with actual Pages URL
            udd.githubPagesUrl = pagesUrl;
            await this.writeUDD(dreamNodePath, udd);
          } catch (error) {
            console.warn('GitHubService: Failed to enable GitHub Pages:', error);
            // Fallback to predicted URL if API fails
            const match = existingGitHubUrl.match(/github\.com\/([^/]+)\/([^/\s]+)/);
            if (match) {
              const [, owner, repo] = match;
              const cleanRepo = repo.replace(/\.git$/, '');
              pagesUrl = `https://${owner}.github.io/${cleanRepo}`;
              udd.githubPagesUrl = pagesUrl;
              await this.writeUDD(dreamNodePath, udd);
            }
          }
        } catch (error) {
          console.warn(`GitHubService: Failed to build static site (will continue without Pages):`, error);
          // Fallback to predicted URL
          const match = existingGitHubUrl.match(/github\.com\/([^/]+)\/([^/\s]+)/);
          if (match) {
            const [, owner, repo] = match;
            const cleanRepo = repo.replace(/\.git$/, '');
            pagesUrl = `https://${owner}.github.io/${cleanRepo}`;
          }
        }

        // Generate Obsidian URI
        const obsidianUri = this.generateObsidianURI(existingGitHubUrl);

        return {
          repoUrl: existingGitHubUrl,
          pagesUrl,
          obsidianUri
        };
      }
    } catch {
      // No 'github' remote exists - this is fine, continue with normal sharing
    }

    // Step 1: Discover and share all submodules recursively (depth-first)
    const submodules = await this.getSubmodules(dreamNodePath);
    const sharedSubmodules: Array<{ uuid: string; githubUrl: string; title: string; relativePath: string }> = [];


    for (const submodule of submodules) {
      try {
        const result = await this.shareSubmodule(submodule.path, visitedUUIDs);
        sharedSubmodules.push(result);
      } catch (error) {
        console.error(`GitHubService: Failed to share submodule ${submodule.name}:`, error);
        // Continue with other submodules
      }
    }

    // Step 2: Update .gitmodules with GitHub URLs
    if (sharedSubmodules.length > 0) {
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

    // Step 4: Create GitHub repository
    const repoUrl = await this.createRepo(dreamNodePath, repoName);

    // Step 5: Build and deploy static DreamSong site
    let pagesUrl: string | undefined;
    try {
      // Use the same parsing pipeline as local rendering
      // This ensures GitHub Pages displays exactly what you see locally
      const { parseCanvasToBlocks } = await import('../../dreamweaving/dreamsong/index');

      // Find and parse canvas file
      const files = fs.readdirSync(dreamNodePath);
      const canvasFiles = files.filter(f => f.endsWith('.canvas'));

      let blocks: any[] = [];

      // Fallback hierarchy: DreamSong → DreamTalk → README
      if (canvasFiles.length > 0) {
        // PRIMARY: DreamSong (canvas file) - Full rich content
        const canvasPath = path.join(dreamNodePath, canvasFiles[0]);
        const canvasContent = fs.readFileSync(canvasPath, 'utf-8');
        const canvasData = JSON.parse(canvasContent);

        // Parse canvas to blocks (same as local rendering)
        blocks = parseCanvasToBlocks(canvasData, dreamNodeUuid);

        // Derive vault path from DreamNode path
        // Canvas media paths are vault-relative, not DreamNode-relative
        const vaultPath = path.dirname(dreamNodePath);

        // Store absolute paths for media files (buildStaticSite will copy them)
        for (const block of blocks) {
          if (block.media && block.media.src && !block.media.src.startsWith('data:') && !block.media.src.startsWith('http')) {
            try {
              // Step 1: Resolve UUID from submodule .udd file (if this is submodule media)
              const resolvedUuid = await this.resolveSourceDreamNodeUuid(block.media.src, vaultPath);
              if (resolvedUuid) {
                block.media.sourceDreamNodeId = resolvedUuid;
              }

              // Step 2: Store absolute path for later file copy (NOT base64 embedding)
              // Canvas paths are vault-relative (e.g., "ArkCrystal/ARK Crystal.jpeg")
              const mediaPath = path.join(vaultPath, block.media.src);

              if (fs.existsSync(mediaPath)) {
                // Store absolute path - buildStaticSite will copy the file
                block.media._absolutePath = mediaPath;
              } else {
                console.warn(`GitHubService: Media file not found: ${mediaPath}`);
              }
            } catch (error) {
              console.warn(`GitHubService: Could not process media ${block.media.src}:`, error);
            }
          }
        }
      } else if (udd.dreamTalk) {
        // FALLBACK 1: DreamTalk media file - handled by buildStaticSite
        // Empty blocks - buildStaticSite reads dreamTalk from .udd and copies it
        blocks = [];
      } else {
        // FALLBACK 2: README.md - Text content
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
        } else {
          console.warn(`GitHubService: No content found - no DreamSong, DreamTalk, or README.md`);
        }
      }

      await this.buildStaticSite(dreamNodePath, dreamNodeUuid, udd.title, blocks);

      // Step 6: Setup GitHub Pages (configure to serve from gh-pages branch)
      // IMPORTANT: This must happen AFTER buildStaticSite pushes the gh-pages branch
      try {
        pagesUrl = await this.setupPages(repoUrl);
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
