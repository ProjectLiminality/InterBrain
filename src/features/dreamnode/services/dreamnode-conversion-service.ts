/**
 * DreamNode Conversion Service
 *
 * Handles conversion of regular directories into DreamNodes.
 * This includes:
 * - Git repository initialization with DreamNode template
 * - UDD file creation/validation
 * - README and LICENSE file creation
 * - Radicle initialization (optional)
 */

import { TFolder, TAbstractFile, App, PluginManifest } from 'obsidian';
import { UDDService } from './udd-service';
import { UDDFile } from '../types/dreamnode';
import { serviceManager } from '../../../core/services/service-manager';

const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');

const execAsync = promisify(exec);

export interface ConversionResult {
  success: boolean;
  title: string;
  uuid: string;
  error?: string;
  changes?: string[];
}

export interface ConversionOptions {
  radiclePassphrase?: string;
  skipRadicle?: boolean;
  skipLfs?: boolean;
}

// File size threshold for LFS (10MB)
const LFS_SIZE_THRESHOLD = 10 * 1024 * 1024;

// Extensions to track with LFS (common media files)
const LFS_EXTENSIONS = [
  // Video
  '*.mp4', '*.mov', '*.avi', '*.mkv', '*.webm', '*.m4v', '*.wmv',
  // Audio
  '*.mp3', '*.wav', '*.flac', '*.aac', '*.ogg', '*.m4a', '*.wma',
  // Images (large formats)
  '*.psd', '*.ai', '*.eps', '*.tiff', '*.tif', '*.bmp', '*.raw', '*.cr2', '*.nef',
  // Archives
  '*.zip', '*.tar', '*.gz', '*.7z', '*.rar',
  // Other large files
  '*.pdf', '*.iso', '*.dmg',
];

export class DreamNodeConversionService {
  private vaultPath: string;
  private pluginId: string;

  constructor(app: App, manifest: PluginManifest) {
    this.vaultPath = (app.vault.adapter as any).basePath;
    this.pluginId = manifest.id;
  }

  /**
   * Convert a regular directory into a DreamNode (idempotent)
   * Fills in any missing pieces: .git repo, .udd file, hooks, README, LICENSE
   */
  async convertToDreamNode(
    folder: TFolder,
    options: ConversionOptions = {}
  ): Promise<ConversionResult> {
    const folderPath = path.join(this.vaultPath, folder.path);
    const folderName = path.basename(folder.path);

    console.log('[ConvertToDreamNode] Starting conversion for:', folderPath);

    const changes: string[] = [];

    try {
      // Check what's already present
      const hasGit = fs.existsSync(path.join(folderPath, '.git'));
      const hasUdd = UDDService.uddExists(folderPath);
      const hasReadme = fs.existsSync(path.join(folderPath, 'README.md'));
      const hasLicense = fs.existsSync(path.join(folderPath, 'LICENSE'));

      console.log('[ConvertToDreamNode] Current state:', { hasGit, hasUdd, hasReadme, hasLicense });

      // Generate or read UUID
      let uuid: string;
      let title: string = folderName;
      let type: 'dream' | 'dreamer' = 'dream';

      if (hasUdd) {
        // Read existing .udd file using UDDService
        const udd = await UDDService.readUDD(folderPath);
        uuid = udd.uuid;
        title = udd.title || folderName;
        type = udd.type || 'dream';
        console.log('[ConvertToDreamNode] Using existing UUID from .udd:', uuid);
      } else {
        // Generate new UUID
        uuid = crypto.randomUUID();
        console.log('[ConvertToDreamNode] Generated new UUID:', uuid);
      }

      // Initialize git if not present
      if (!hasGit) {
        await this.initializeGitRepository(folderPath);
        changes.push('Initialized git repository');
      }

      // Setup Git LFS if needed (before staging files)
      if (!options.skipLfs) {
        await this.setupLfsIfNeeded(folderPath);
      }

      // Create/update .udd file using UDDService
      if (!hasUdd) {
        console.log('[ConvertToDreamNode] Creating .udd file...');
        await UDDService.createUDD(folderPath, { uuid, title, type });
        changes.push('Created .udd file');
      } else {
        // Validate existing .udd has all required fields
        const updated = await UDDService.ensureRequiredFields(folderPath);
        if (updated) {
          console.log('[ConvertToDreamNode] Updated .udd with missing fields');
          changes.push('Added missing .udd fields');
        }
      }

      // Create README if not present
      if (!hasReadme) {
        await this.createReadme(folderPath, title);
        changes.push('Created README.md');
      }

      // Create LICENSE if not present
      if (!hasLicense) {
        await this.createLicense(folderPath);
        changes.push('Created LICENSE');
      }

      // Commit changes if there are any uncommitted files
      await this.commitIfNeeded(folderPath, title);

      // Initialize Radicle if not already initialized
      // Check both .rad directory AND if UDD already has a radicleId
      if (!options.skipRadicle) {
        const hasRadicle = fs.existsSync(path.join(folderPath, '.rad'));
        const udd = await UDDService.readUDD(folderPath);
        const hasRadicleId = !!udd.radicleId;

        if (!hasRadicle && !hasRadicleId) {
          await this.initializeRadicle(folderPath, folderName, type, options.radiclePassphrase);
          changes.push('Initialized Radicle');
        } else if (hasRadicleId) {
          console.log('[ConvertToDreamNode] Already has Radicle ID:', udd.radicleId);
        }
      }

      // Migrate .gitmodules URLs from absolute to relative paths
      const migratedCount = await this.migrateGitmodulesUrls(folderPath);
      if (migratedCount > 0) {
        changes.push(`Migrated ${migratedCount} .gitmodules URL(s) to relative paths`);
      }

      // Sync holarchy relationships (submodules <-> supermodules)
      // This handles existing git submodules and populates .udd arrays with radicleIds
      await this.syncHolarchyRelationships(folderPath, options);

      // Refresh the vault to pick up the new DreamNode
      console.log('[ConvertToDreamNode] Rescanning vault...');
      await serviceManager.scanVault();

      console.log('[ConvertToDreamNode] Conversion complete!');
      return { success: true, title, uuid, changes: changes.length > 0 ? changes : undefined };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ConvertToDreamNode] Conversion failed:', error);
      return { success: false, title: folderName, uuid: '', error: errorMessage, changes: changes.length > 0 ? changes : undefined };
    }
  }

  /**
   * Find the containing DreamNode by searching upward for .udd file
   * Returns the absolute path to the DreamNode folder, or null if not found
   */
  findContainingDreamNode(file: TAbstractFile): string | null {
    // Start from the file's directory (or the folder itself if it's a folder)
    let currentPath: string;

    if (file instanceof TFolder) {
      // For folders: first check if this folder has .udd directly inside
      currentPath = path.join(this.vaultPath, file.path);
      console.log('[FindDreamNode] Checking folder for .udd:', currentPath);
      if (UDDService.uddExists(currentPath)) {
        console.log('[FindDreamNode] Found .udd in folder!');
        return currentPath;
      }
      // If not, check parent (same level as this folder)
      currentPath = path.dirname(currentPath);
      console.log('[FindDreamNode] Not found in folder, moving to parent:', currentPath);
    } else {
      // For files: start from parent directory
      currentPath = path.join(this.vaultPath, path.dirname(file.path));
      console.log('[FindDreamNode] File detected, starting from parent:', currentPath);
    }

    // Walk up the tree looking for .udd file
    let iterations = 0;
    while (currentPath.startsWith(this.vaultPath)) {
      iterations++;
      console.log(`[FindDreamNode] Iteration ${iterations}: Checking ${currentPath}`);

      if (UDDService.uddExists(currentPath)) {
        console.log('[FindDreamNode] Found .udd file!');
        return currentPath;
      }

      // Move up one directory
      const parentPath = path.dirname(currentPath);

      // Stop if we've reached the vault root or can't go higher
      if (parentPath === currentPath || parentPath === this.vaultPath) {
        console.log('[FindDreamNode] Reached vault root, stopping');
        break;
      }

      currentPath = parentPath;
    }

    console.log('[FindDreamNode] No .udd file found after', iterations, 'iterations');
    return null;
  }

  // ============================================
  // Private helper methods
  // ============================================

  private async initializeGitRepository(folderPath: string): Promise<void> {
    console.log('[ConvertToDreamNode] Initializing git with template...');
    const templatePath = path.join(
      this.vaultPath,
      '.obsidian',
      'plugins',
      this.pluginId,
      'src',
      'features',
      'dreamnode',
      'DreamNode-template'
    );
    await execAsync(`git init --template="${templatePath}" "${folderPath}"`);

    // Make hooks executable
    const hooksDir = path.join(folderPath, '.git', 'hooks');
    if (fs.existsSync(hooksDir)) {
      await execAsync(`chmod +x "${path.join(hooksDir, 'pre-commit')}"`, { cwd: folderPath });
      await execAsync(`chmod +x "${path.join(hooksDir, 'post-commit')}"`, { cwd: folderPath });
      console.log('[ConvertToDreamNode] Made hooks executable');
    }
  }

  private async createReadme(folderPath: string, title: string): Promise<void> {
    console.log('[ConvertToDreamNode] Creating README.md...');
    const readmeContent = `# ${title}\n\nA DreamNode in the InterBrain network.\n`;
    fs.writeFileSync(path.join(folderPath, 'README.md'), readmeContent);
  }

  private async createLicense(folderPath: string): Promise<void> {
    console.log('[ConvertToDreamNode] Creating LICENSE...');
    const licenseContent = `GNU AFFERO GENERAL PUBLIC LICENSE
Version 3, 19 November 2007

This DreamNode is licensed under the GNU AGPL v3.
See https://www.gnu.org/licenses/agpl-3.0.html for full license text.
`;
    fs.writeFileSync(path.join(folderPath, 'LICENSE'), licenseContent);
  }

  private async commitIfNeeded(folderPath: string, title: string): Promise<void> {
    const gitStatus = await execAsync('git status --porcelain', { cwd: folderPath });
    if (gitStatus.stdout.trim()) {
      console.log('[ConvertToDreamNode] Committing DreamNode initialization...');
      await execAsync('git add -A', { cwd: folderPath });
      try {
        await execAsync(`git commit -m "Convert to DreamNode: ${title}"`, { cwd: folderPath });
      } catch (commitError: any) {
        // Verify commit succeeded (hooks may output to stderr)
        try {
          await execAsync('git rev-parse HEAD', { cwd: folderPath });
          console.log('[ConvertToDreamNode] Commit verified successful');
        } catch {
          throw commitError;
        }
      }
    } else {
      console.log('[ConvertToDreamNode] No uncommitted changes, skipping commit');
    }
  }

  /**
   * Check if LFS is needed and set it up
   * LFS is needed if:
   * 1. Directory contains files matching LFS extensions, OR
   * 2. Directory contains any file larger than threshold
   */
  private async setupLfsIfNeeded(folderPath: string): Promise<void> {
    // Check if LFS is already configured
    const gitattributesPath = path.join(folderPath, '.gitattributes');
    if (fs.existsSync(gitattributesPath)) {
      const content = fs.readFileSync(gitattributesPath, 'utf-8');
      if (content.includes('filter=lfs')) {
        console.log('[ConvertToDreamNode] LFS already configured, skipping');
        return;
      }
    }

    // Scan for files that need LFS
    const { hasLargeFiles, hasMediaFiles, largeFiles } = this.scanForLfsFiles(folderPath);

    if (!hasLargeFiles && !hasMediaFiles) {
      console.log('[ConvertToDreamNode] No large or media files found, skipping LFS');
      return;
    }

    console.log('[ConvertToDreamNode] Setting up Git LFS...');
    if (largeFiles.length > 0) {
      console.log('[ConvertToDreamNode] Large files found:', largeFiles);
    }

    // Check if git-lfs is installed
    try {
      await execAsync('git lfs version');
    } catch {
      console.warn('[ConvertToDreamNode] git-lfs not installed, skipping LFS setup');
      console.warn('[ConvertToDreamNode] Install with: brew install git-lfs');
      return;
    }

    // Initialize LFS in the repository
    // Use --skip-smudge to avoid hook conflicts with DreamNode template hooks
    // The LFS filter config is what matters, not the hooks
    try {
      await execAsync('git lfs install --local --skip-smudge', { cwd: folderPath });
      console.log('[ConvertToDreamNode] Git LFS initialized');
    } catch (lfsError: any) {
      // If hooks conflict, try without hooks (just set up filters)
      if (lfsError.message?.includes('Hook already exists')) {
        console.log('[ConvertToDreamNode] LFS hooks conflict with DreamNode hooks, configuring filters only...');
        // Manually configure LFS filter without hooks
        await execAsync('git config --local filter.lfs.clean "git-lfs clean -- %f"', { cwd: folderPath });
        await execAsync('git config --local filter.lfs.smudge "git-lfs smudge -- %f"', { cwd: folderPath });
        await execAsync('git config --local filter.lfs.process "git-lfs filter-process"', { cwd: folderPath });
        await execAsync('git config --local filter.lfs.required true', { cwd: folderPath });
        console.log('[ConvertToDreamNode] Git LFS filters configured manually');
      } else {
        throw lfsError;
      }
    }

    // Track all media extensions
    for (const ext of LFS_EXTENSIONS) {
      await execAsync(`git lfs track "${ext}"`, { cwd: folderPath });
    }

    // Track any additional large files by their specific extensions
    const additionalExtensions = new Set<string>();
    for (const file of largeFiles) {
      const ext = path.extname(file).toLowerCase();
      if (ext && !LFS_EXTENSIONS.includes(`*${ext}`)) {
        additionalExtensions.add(`*${ext}`);
      }
    }
    for (const ext of additionalExtensions) {
      await execAsync(`git lfs track "${ext}"`, { cwd: folderPath });
      console.log(`[ConvertToDreamNode] Added LFS tracking for: ${ext}`);
    }

    console.log('[ConvertToDreamNode] Git LFS setup complete');
  }

  /**
   * Recursively scan directory for files that need LFS
   */
  private scanForLfsFiles(folderPath: string): {
    hasLargeFiles: boolean;
    hasMediaFiles: boolean;
    largeFiles: string[];
  } {
    const largeFiles: string[] = [];
    let hasMediaFiles = false;

    const scanDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip .git directory
        if (entry.name === '.git') continue;

        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile()) {
          // Check extension against LFS patterns
          const ext = path.extname(entry.name).toLowerCase();
          if (LFS_EXTENSIONS.some(pattern => pattern === `*${ext}`)) {
            hasMediaFiles = true;
          }

          // Check file size
          try {
            const stats = fs.statSync(fullPath);
            if (stats.size > LFS_SIZE_THRESHOLD) {
              largeFiles.push(path.relative(folderPath, fullPath));
            }
          } catch {
            // Ignore stat errors
          }
        }
      }
    };

    scanDir(folderPath);

    return {
      hasLargeFiles: largeFiles.length > 0,
      hasMediaFiles,
      largeFiles,
    };
  }

  private async initializeRadicle(
    folderPath: string,
    folderName: string,
    type: 'dream' | 'dreamer',
    passphrase?: string
  ): Promise<void> {
    console.log('[ConvertToDreamNode] Initializing Radicle repository...');
    try {
      const process = require('process');
      const env = { ...process.env };
      if (passphrase) {
        env.RAD_PASSPHRASE = passphrase;
      }

      const nodeTypeLabel = type === 'dreamer' ? 'DreamerNode' : 'DreamNode';
      const timestamp = new Date().toISOString();
      const description = `${nodeTypeLabel} ${timestamp}`;

      const radInitPromise = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        // NOTE: No --no-seed flag. Repo is auto-seeded so direct peers can fetch.
        // Privacy comes from --private (not announced), not from refusing to serve.
        const child = spawn('rad', [
          'init',
          folderPath,
          '--private',
          '--name', folderName,
          '--default-branch', 'main',
          '--description', description,
          '--no-confirm'
        ], {
          env,
          cwd: folderPath,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data: any) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data: any) => {
          stderr += data.toString();
        });

        child.on('close', (code: number) => {
          if (code === 0) {
            resolve({ stdout, stderr });
          } else {
            reject(new Error(`rad init exited with code ${code}`));
          }
        });

        child.on('error', reject);
        child.stdin?.end();
      });

      const radResult = await radInitPromise;

      // Extract and save RID using UDDService
      const ridMatch = radResult.stdout.match(/rad:z[a-zA-Z0-9]+/);
      if (ridMatch) {
        const radicleId = ridMatch[0];
        await UDDService.setRadicleId(folderPath, radicleId);

        await execAsync('git add .udd', { cwd: folderPath });
        await execAsync('git commit -m "Add Radicle ID to DreamNode"', { cwd: folderPath });
        console.log('[ConvertToDreamNode] Added Radicle ID:', radicleId);
      }
    } catch (radError) {
      console.warn('[ConvertToDreamNode] Radicle init failed (continuing anyway):', radError);
    }
  }

  /**
   * Migrate .gitmodules URLs from absolute filesystem paths to relative paths.
   *
   * Absolute paths (e.g., /Users/davidrug/RealDealVault/DreamTalk) break portability.
   * Relative paths (e.g., ../DreamTalk) work because git resolves them against the
   * remote named "origin". Since our remote is named "rad" (not "origin"), git falls
   * back to filesystem resolution — so ../Name correctly points to the sibling
   * sovereign repo at vault root.
   *
   * Returns the number of URLs migrated.
   */
  private async migrateGitmodulesUrls(folderPath: string): Promise<number> {
    const gitmodulesPath = path.join(folderPath, '.gitmodules');

    if (!fs.existsSync(gitmodulesPath)) {
      return 0;
    }

    const content = fs.readFileSync(gitmodulesPath, 'utf-8');
    let modified = content;
    let migratedCount = 0;

    // Match url = /absolute/path lines where the path points to a vault-root repo
    // We detect absolute paths: they start with / and contain at least one path segment
    const urlRegex = /(url\s*=\s*)(\/.+)/g;
    let match;

    while ((match = urlRegex.exec(content)) !== null) {
      const absolutePath = match[2].trim();
      const repoName = path.basename(absolutePath);
      const relativePath = `../${repoName}`;

      // Verify this absolute path is a sibling at the same level (vault root)
      const expectedVaultRoot = path.dirname(folderPath);
      const actualParentDir = path.dirname(absolutePath);

      if (actualParentDir === expectedVaultRoot) {
        console.log(`[ConvertToDreamNode] Migrating .gitmodules URL: ${absolutePath} → ${relativePath}`);
        modified = modified.replace(absolutePath, relativePath);
        migratedCount++;
      } else {
        console.log(`[ConvertToDreamNode] Skipping non-sibling absolute path: ${absolutePath}`);
      }
    }

    if (migratedCount > 0) {
      fs.writeFileSync(gitmodulesPath, modified);
      console.log(`[ConvertToDreamNode] Migrated ${migratedCount} .gitmodules URL(s) to relative paths`);

      // Sync git's internal URL tracking to match the updated .gitmodules
      try {
        await execAsync('git submodule sync', { cwd: folderPath });
        console.log('[ConvertToDreamNode] Ran git submodule sync after URL migration');
      } catch (syncError) {
        console.warn('[ConvertToDreamNode] git submodule sync failed (non-fatal):', syncError);
      }

      // Commit the migration
      try {
        await execAsync('git add .gitmodules', { cwd: folderPath });
        const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: folderPath });
        if (statusOutput.trim()) {
          await execAsync('git commit -m "Migrate .gitmodules URLs to relative paths"', { cwd: folderPath });
          console.log('[ConvertToDreamNode] Committed .gitmodules URL migration');
        }
      } catch (commitError) {
        console.warn('[ConvertToDreamNode] Could not commit .gitmodules migration (non-fatal):', commitError);
      }
    }

    return migratedCount;
  }

  /**
   * Sync holarchy relationships for a DreamNode
   *
   * This method:
   * 1. Parses .gitmodules to find existing git submodules
   * 2. For each submodule, ensures it has a radicleId (recursively converts if needed)
   * 3. Populates the parent's .udd submodules array with child radicleIds
   * 4. Populates each child's .udd supermodules array with parent's radicleId
   *
   * This is idempotent - safe to run multiple times.
   */
  private async syncHolarchyRelationships(
    folderPath: string,
    options: ConversionOptions = {}
  ): Promise<void> {
    console.log('[ConvertToDreamNode] Syncing holarchy relationships...');

    const gitmodulesPath = path.join(folderPath, '.gitmodules');

    // Check if .gitmodules exists
    if (!fs.existsSync(gitmodulesPath)) {
      console.log('[ConvertToDreamNode] No .gitmodules file - no submodules to sync');
      return;
    }

    try {
      // Get parent's radicleId
      const parentUDD = await UDDService.readUDD(folderPath);
      const parentRadicleId = parentUDD.radicleId;
      const parentTitle = parentUDD.title;

      if (!parentRadicleId) {
        console.warn('[ConvertToDreamNode] Parent has no radicleId - skipping holarchy sync');
        return;
      }

      console.log(`[ConvertToDreamNode] Parent radicleId: ${parentRadicleId}`);

      // Parse .gitmodules to get submodule paths
      const gitmodulesContent = fs.readFileSync(gitmodulesPath, 'utf-8');
      const submodules = this.parseGitmodules(gitmodulesContent);

      console.log(`[ConvertToDreamNode] Found ${submodules.length} git submodules:`,
        submodules.map(s => s.name));

      let parentModified = false;

      for (const submodule of submodules) {
        const submodulePath = path.join(folderPath, submodule.path);

        // Check if submodule directory exists and has .git
        if (!fs.existsSync(path.join(submodulePath, '.git'))) {
          console.log(`[ConvertToDreamNode] Submodule ${submodule.name} not initialized - initializing...`);
          try {
            await execAsync(`git submodule update --init "${submodule.path}"`, { cwd: folderPath });
          } catch (initError) {
            console.warn(`[ConvertToDreamNode] Could not initialize submodule ${submodule.name}:`, initError);
            continue;
          }
        }

        // Verify submodule is a functional git repo (handles broken .git references)
        try {
          await execAsync('git rev-parse --git-dir', { cwd: submodulePath });
        } catch (gitCheckError) {
          console.warn(`[ConvertToDreamNode] Submodule ${submodule.name} has broken git reference - attempting repair...`);
          try {
            // Try to repair by re-initializing the submodule
            await execAsync(`git submodule deinit -f "${submodule.path}"`, { cwd: folderPath });
            await execAsync(`git submodule update --init "${submodule.path}"`, { cwd: folderPath });
          } catch (repairError) {
            console.warn(`[ConvertToDreamNode] Could not repair submodule ${submodule.name} - skipping:`, repairError);
            continue;
          }
        }

        // Check if submodule has .udd file
        const hasSubmoduleUdd = UDDService.uddExists(submodulePath);

        if (!hasSubmoduleUdd) {
          console.log(`[ConvertToDreamNode] Submodule ${submodule.name} has no .udd - creating...`);
          // Create basic .udd for the submodule
          const submoduleUuid = crypto.randomUUID();
          await UDDService.createUDD(submodulePath, {
            uuid: submoduleUuid,
            title: submodule.name,
            type: 'dream'
          });
        }

        // Get or create radicleId for submodule
        let childUDD = await UDDService.readUDD(submodulePath);
        let childRadicleId = childUDD.radicleId;

        if (!childRadicleId && !options.skipRadicle) {
          // Initialize Radicle for the submodule
          console.log(`[ConvertToDreamNode] Submodule ${submodule.name} has no radicleId - initializing Radicle...`);
          const hasRadicle = fs.existsSync(path.join(submodulePath, '.rad'));
          if (!hasRadicle) {
            await this.initializeRadicle(
              submodulePath,
              submodule.name,
              'dream',
              options.radiclePassphrase
            );
            // Re-read UDD to get the new radicleId
            childUDD = await UDDService.readUDD(submodulePath);
            childRadicleId = childUDD.radicleId;
          }
        }

        if (!childRadicleId) {
          console.warn(`[ConvertToDreamNode] Submodule ${submodule.name} still has no radicleId - skipping`);
          continue;
        }

        console.log(`[ConvertToDreamNode] Submodule ${submodule.name} radicleId: ${childRadicleId}`);

        // Add child's radicleId to parent's submodules array
        if (await UDDService.addSubmodule(folderPath, childRadicleId)) {
          console.log(`[ConvertToDreamNode] Added ${submodule.name} to parent's submodules array`);
          parentModified = true;
        }

        // Add parent's radicleId to child's supermodules array
        const supermoduleEntry = {
          radicleId: parentRadicleId,
          title: parentTitle,
          atCommit: await this.getCurrentCommitHash(folderPath),
          addedAt: Date.now()
        };

        if (await UDDService.addSupermoduleEntry(submodulePath, supermoduleEntry)) {
          console.log(`[ConvertToDreamNode] Added parent to ${submodule.name}'s supermodules array`);

          // Commit the change in the submodule
          try {
            await execAsync('git add .udd', { cwd: submodulePath });
            const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: submodulePath });
            if (statusOutput.trim()) {
              await execAsync(`git commit -m "Add supermodule relationship: ${parentTitle}"`, { cwd: submodulePath });
              console.log(`[ConvertToDreamNode] Committed supermodule relationship in ${submodule.name}`);
            }
          } catch (commitError) {
            console.warn(`[ConvertToDreamNode] Could not commit submodule .udd:`, commitError);
          }
        }

        // === SOVEREIGN REPO SYNC ===
        // Ensure submodule has a sovereign clone at vault root
        await this.ensureSovereignRepo(submodulePath, submodule.name, childUDD);
      }

      // Commit parent's .udd changes if modified
      if (parentModified) {
        try {
          await execAsync('git add .udd', { cwd: folderPath });
          const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: folderPath });
          if (statusOutput.trim()) {
            await execAsync('git commit -m "Sync holarchy relationships in .udd"', { cwd: folderPath });
            console.log('[ConvertToDreamNode] Committed holarchy relationships');
          }
        } catch (commitError) {
          console.warn('[ConvertToDreamNode] Could not commit parent .udd:', commitError);
        }
      }

      console.log('[ConvertToDreamNode] Holarchy sync complete');

    } catch (error) {
      console.error('[ConvertToDreamNode] Error syncing holarchy:', error);
      // Non-fatal - continue with conversion
    }
  }

  /**
   * Parse .gitmodules file to extract submodule information
   */
  private parseGitmodules(content: string): Array<{ name: string; path: string; url: string }> {
    const submodules: Array<{ name: string; path: string; url: string }> = [];

    // Match [submodule "name"] sections
    const sectionRegex = /\[submodule "([^"]+)"\]\s*((?:(?!\[submodule).)*)/gs;
    let match;

    while ((match = sectionRegex.exec(content)) !== null) {
      const name = match[1];
      const section = match[2];

      // Extract path and url from section
      const pathMatch = section.match(/path\s*=\s*(.+)/);
      const urlMatch = section.match(/url\s*=\s*(.+)/);

      if (pathMatch) {
        submodules.push({
          name,
          path: pathMatch[1].trim(),
          url: urlMatch ? urlMatch[1].trim() : ''
        });
      }
    }

    return submodules;
  }

  /**
   * Get current commit hash for a repository
   */
  private async getCurrentCommitHash(repoPath: string): Promise<string> {
    try {
      const { stdout } = await execAsync('git rev-parse HEAD', { cwd: repoPath });
      return stdout.trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Ensure a submodule has a sovereign clone at the vault root
   *
   * This method:
   * 1. Checks if a sovereign repo exists at vault root with the same name
   * 2. If exists: syncs metadata from submodule to sovereign (radicleId, supermodules, etc.)
   * 3. If missing: clones from submodule to create sovereign repo at vault root
   * 4. Ensures submodule's remote points to the sovereign repo
   *
   * @param submodulePath - Full path to the submodule inside parent
   * @param submoduleName - Name of the submodule (used for sovereign path)
   * @param submoduleUDD - The submodule's current UDD data
   */
  private async ensureSovereignRepo(
    submodulePath: string,
    submoduleName: string,
    submoduleUDD: UDDFile
  ): Promise<void> {
    const sovereignPath = path.join(this.vaultPath, submoduleName);
    const sovereignExists = fs.existsSync(path.join(sovereignPath, '.git'));

    console.log(`[ConvertToDreamNode] Checking sovereign repo for ${submoduleName}...`);

    if (sovereignExists) {
      // Sovereign exists - sync metadata from submodule
      await this.syncToSovereignRepo(submodulePath, sovereignPath, submoduleName, submoduleUDD);
    } else {
      // Sovereign missing - clone from submodule to create it
      await this.createSovereignFromSubmodule(submodulePath, sovereignPath, submoduleName);
    }
  }

  /**
   * Sync metadata from submodule to existing sovereign repo
   */
  private async syncToSovereignRepo(
    submodulePath: string,
    sovereignPath: string,
    submoduleName: string,
    submoduleUDD: UDDFile
  ): Promise<void> {
    console.log(`[ConvertToDreamNode] Syncing metadata to sovereign repo: ${submoduleName}`);

    try {
      // Read sovereign's current UDD
      if (!UDDService.uddExists(sovereignPath)) {
        console.warn(`[ConvertToDreamNode] Sovereign ${submoduleName} has no .udd - skipping sync`);
        return;
      }

      const sovereignUDD = await UDDService.readUDD(sovereignPath);
      let modified = false;

      // Sync radicleId if missing in sovereign
      if (submoduleUDD.radicleId && !sovereignUDD.radicleId) {
        console.log(`[ConvertToDreamNode] Adding radicleId to sovereign: ${submoduleUDD.radicleId}`);
        await UDDService.setRadicleId(sovereignPath, submoduleUDD.radicleId);
        modified = true;
      }

      // Sync supermodules from submodule to sovereign
      for (const supermodule of submoduleUDD.supermodules || []) {
        const radicleId = typeof supermodule === 'string' ? supermodule : supermodule.radicleId;

        if (typeof supermodule === 'string') {
          // Legacy format
          if (await UDDService.addSupermodule(sovereignPath, supermodule)) {
            console.log(`[ConvertToDreamNode] Added supermodule ${supermodule} to sovereign`);
            modified = true;
          }
        } else {
          // Enhanced format
          if (await UDDService.addSupermoduleEntry(sovereignPath, supermodule)) {
            console.log(`[ConvertToDreamNode] Added supermodule ${radicleId} to sovereign`);
            modified = true;
          }
        }
      }

      // Commit changes if modified
      if (modified) {
        try {
          await execAsync('git add .udd', { cwd: sovereignPath });
          const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: sovereignPath });
          if (statusOutput.trim()) {
            await execAsync('git commit -m "Sync metadata from submodule"', { cwd: sovereignPath });
            console.log(`[ConvertToDreamNode] Committed metadata sync to sovereign ${submoduleName}`);
          }
        } catch (commitError) {
          console.warn(`[ConvertToDreamNode] Could not commit sovereign .udd:`, commitError);
        }
      } else {
        console.log(`[ConvertToDreamNode] Sovereign ${submoduleName} already in sync`);
      }

      // Ensure submodule's origin remote points to sovereign
      await this.ensureSubmoduleRemote(submodulePath, sovereignPath, submoduleName);

    } catch (error) {
      console.error(`[ConvertToDreamNode] Error syncing to sovereign ${submoduleName}:`, error);
    }
  }

  /**
   * Create a sovereign repo at vault root by cloning from submodule
   */
  private async createSovereignFromSubmodule(
    submodulePath: string,
    sovereignPath: string,
    submoduleName: string
  ): Promise<void> {
    console.log(`[ConvertToDreamNode] Creating sovereign repo from submodule: ${submoduleName}`);

    try {
      // Clone the submodule to the vault root as a new sovereign repo
      // Use --no-hardlinks to ensure it's a true copy
      await execAsync(`git clone --no-hardlinks "${submodulePath}" "${sovereignPath}"`);
      console.log(`[ConvertToDreamNode] Cloned submodule to sovereign: ${sovereignPath}`);

      // Remove the origin remote (it points to submodule path, not useful)
      try {
        await execAsync('git remote remove origin', { cwd: sovereignPath });
      } catch {
        // Origin might not exist, that's fine
      }

      // If the submodule had a useful remote (GitHub, Radicle URL), add it back
      try {
        const { stdout: remoteUrl } = await execAsync('git remote get-url origin', { cwd: submodulePath });
        const url = remoteUrl.trim();
        // Only add back if it's a real URL (not a local path)
        if (url && (url.startsWith('http') || url.startsWith('git@') || url.startsWith('rad://'))) {
          await execAsync(`git remote add origin "${url}"`, { cwd: sovereignPath });
          console.log(`[ConvertToDreamNode] Set sovereign remote to: ${url}`);
        }
      } catch {
        // No remote to copy, that's fine
      }

      // Now update submodule's origin to point to the new sovereign
      await this.ensureSubmoduleRemote(submodulePath, sovereignPath, submoduleName);

      console.log(`[ConvertToDreamNode] Successfully created sovereign repo: ${submoduleName}`);

    } catch (error) {
      console.error(`[ConvertToDreamNode] Failed to create sovereign from submodule:`, error);
    }
  }

  /**
   * Ensure submodule's origin remote points to the sovereign repo
   * This allows changes in submodule to be pushed to sovereign
   */
  private async ensureSubmoduleRemote(
    submodulePath: string,
    sovereignPath: string,
    submoduleName: string
  ): Promise<void> {
    try {
      // Check current origin
      let currentOrigin = '';
      try {
        const { stdout } = await execAsync('git remote get-url origin', { cwd: submodulePath });
        currentOrigin = stdout.trim();
      } catch {
        // No origin set
      }

      // If origin doesn't point to sovereign, update it
      if (currentOrigin !== sovereignPath) {
        try {
          await execAsync('git remote remove origin', { cwd: submodulePath });
        } catch {
          // Origin might not exist
        }
        await execAsync(`git remote add origin "${sovereignPath}"`, { cwd: submodulePath });
        console.log(`[ConvertToDreamNode] Updated submodule ${submoduleName} origin to sovereign`);
      }
    } catch (error) {
      console.warn(`[ConvertToDreamNode] Could not update submodule remote:`, error);
    }
  }
}
