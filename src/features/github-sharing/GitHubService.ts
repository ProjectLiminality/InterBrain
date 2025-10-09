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

interface SubmoduleInfo {
  name: string;
  path: string;           // Full path to actual git repo (from url field)
  relativePath: string;   // Relative path within parent (from path field)
  url: string;            // URL from .gitmodules
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
   * Sanitize DreamNode title for GitHub repository name
   */
  private sanitizeRepoName(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')  // Replace non-alphanumeric with hyphens
      .replace(/-+/g, '-')           // Collapse multiple hyphens
      .replace(/^-|-$/g, '')         // Remove leading/trailing hyphens
      .substring(0, 90);             // Truncate to 90 chars (leave room for -N suffix)
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

    // Check if already shared
    if (udd.githubRepoUrl) {
      console.log(`GitHubService: Submodule already shared: ${udd.title}`);
      return {
        uuid: udd.uuid,
        githubUrl: udd.githubRepoUrl,
        title: udd.title,
        relativePath: path.basename(submodulePath)
      };
    }

    // Mark as visited
    visitedUUIDs.add(udd.uuid);

    // Recursively share this submodule
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

    // Step 2: Delete GitHub repository
    const repoMatch = udd.githubRepoUrl.match(/github\.com\/([^/]+)\/([^/\s]+)/);
    if (repoMatch) {
      const [, owner, repo] = repoMatch;
      const cleanRepo = repo.replace(/\.git$/, '');

      try {
        const ghPath = await this.detectGhPath();
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

    // Step 5: Setup GitHub Pages
    let pagesUrl: string | undefined;
    try {
      pagesUrl = await this.setupPages(repoUrl);
    } catch (error) {
      console.warn('GitHubService: Failed to enable GitHub Pages:', error);
      // Continue without Pages URL - repo is still created
    }

    // Step 6: Generate Obsidian URI
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
