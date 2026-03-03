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
import { sanitizeTitleToPascalCase } from '../utils/title-sanitization';

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
  dryRun?: boolean;
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

    const dryRun = options.dryRun;
    const logPrefix = dryRun ? '[DRY RUN] ' : '';
    console.log(`[ConvertToDreamNode] ${logPrefix}Starting conversion for:`, folderPath);

    const changes: string[] = [];

    try {
      // Check what's already present
      const hasGit = fs.existsSync(path.join(folderPath, '.git'));
      const hasUdd = UDDService.uddExists(folderPath);
      const hasReadme = fs.existsSync(path.join(folderPath, 'README.md'));
      const hasLicense = fs.existsSync(path.join(folderPath, 'LICENSE'));

      console.log(`[ConvertToDreamNode] ${logPrefix}Current state:`, { hasGit, hasUdd, hasReadme, hasLicense });

      // Generate or read UUID
      let uuid: string;
      let title: string = folderName;
      let type: 'dream' | 'dreamer' = 'dream';

      if (hasUdd) {
        const udd = await UDDService.readUDD(folderPath);
        uuid = udd.uuid;
        title = udd.title || folderName;
        type = udd.type || 'dream';
      } else {
        uuid = crypto.randomUUID();
      }

      // In dry-run mode, skip all mutating steps except repair/migration (which are dry-run aware)
      if (!dryRun) {
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
      } else {
        // Dry-run: report what would be created
        if (!hasGit) changes.push('[DRY RUN] Would initialize git repository');
        if (!hasUdd) changes.push('[DRY RUN] Would create .udd file');
        if (!hasReadme) changes.push('[DRY RUN] Would create README.md');
        if (!hasLicense) changes.push('[DRY RUN] Would create LICENSE');
      }

      // Repair submodule paths that contain spaces (dry-run aware)
      const spaceRepairs = await this.repairSpaceSubmodulePaths(folderPath, dryRun);
      if (spaceRepairs.length > 0) {
        for (const repair of spaceRepairs) {
          changes.push(`${dryRun ? '[DRY RUN] Would rename' : 'Renamed'} submodule path: "${repair.from}" → "${repair.to}"`);
        }
      }

      // Migrate .gitmodules URLs from absolute to relative paths (dry-run aware)
      const migratedCount = await this.migrateGitmodulesUrls(folderPath, dryRun);
      if (migratedCount > 0) {
        changes.push(`${dryRun ? '[DRY RUN] Would migrate' : 'Migrated'} ${migratedCount} .gitmodules URL(s) to relative paths`);
      }

      if (!dryRun) {
        // Sync holarchy relationships (submodules <-> supermodules)
        await this.syncHolarchyRelationships(folderPath, options);

        // Refresh the vault to pick up the new DreamNode
        console.log('[ConvertToDreamNode] Rescanning vault...');
        await serviceManager.scanVault();
      }

      console.log(`[ConvertToDreamNode] ${logPrefix}Conversion complete!`);
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
  /**
   * Repair submodule paths that contain spaces.
   *
   * Spaces in submodule paths break git config parsing, producing garbled
   * [submodule] sections. For each submodule with a space in its path:
   * 1. Compute PascalCase name
   * 2. git mv the directory
   * 3. Rewrite .gitmodules (name, path, url)
   * 4. git submodule sync
   * 5. Rename .git/modules/old → .git/modules/new
   * 6. Fix .git file inside submodule dir (gitdir path)
   * 7. Fix worktree in .git/modules/new/config
   * 8. Update canvas file references
   */
  private async repairSpaceSubmodulePaths(
    folderPath: string,
    dryRun?: boolean
  ): Promise<Array<{ from: string; to: string }>> {
    const gitmodulesPath = path.join(folderPath, '.gitmodules');
    if (!fs.existsSync(gitmodulesPath)) return [];

    const content = fs.readFileSync(gitmodulesPath, 'utf-8');
    const submodules = this.parseGitmodules(content);
    const repairs: Array<{ from: string; to: string }> = [];
    const prefix = dryRun ? '[DRY RUN] ' : '';

    for (const sub of submodules) {
      if (!sub.path.includes(' ') && !sub.name.includes(' ')) continue;

      const pascalName = sanitizeTitleToPascalCase(sub.name);
      if (sub.path === pascalName && sub.name === pascalName) continue;

      const oldPath = sub.path;
      const oldName = sub.name;
      const newName = pascalName;
      const oldFullPath = path.join(folderPath, oldPath);
      const newFullPath = path.join(folderPath, newName);

      console.log(`[ConvertToDreamNode] ${prefix}Repairing space-path submodule: "${oldPath}" → "${newName}"`);

      if (dryRun) {
        // Log what would happen without doing it
        const dirExists = fs.existsSync(oldFullPath);
        const alreadyRenamed = fs.existsSync(newFullPath);
        console.log(`[ConvertToDreamNode] ${prefix}  git mv "${oldPath}" "${newName}" (dir exists: ${dirExists}, already renamed: ${alreadyRenamed})`);
        console.log(`[ConvertToDreamNode] ${prefix}  Rewrite .gitmodules: [submodule "${oldName}"] → [submodule "${newName}"]`);
        console.log(`[ConvertToDreamNode] ${prefix}  Rewrite .gitmodules: path = ${oldPath} → path = ${newName}`);

        const gitDir = path.join(folderPath, '.git');
        let gitModulesDir: string;
        try {
          const gitStat = fs.statSync(gitDir);
          if (gitStat.isFile()) {
            const gitFileContent = fs.readFileSync(gitDir, 'utf-8').trim();
            const gitdirMatch = gitFileContent.match(/^gitdir:\s*(.+)$/);
            gitModulesDir = gitdirMatch
              ? path.join(path.resolve(folderPath, gitdirMatch[1]), 'modules')
              : path.join(gitDir, 'modules');
          } else {
            gitModulesDir = path.join(gitDir, 'modules');
          }
          const oldModulePath = path.join(gitModulesDir, oldName);
          const newModulePath = path.join(gitModulesDir, newName);
          console.log(`[ConvertToDreamNode] ${prefix}  Rename .git/modules/${oldName} → ${newName} (exists: ${fs.existsSync(oldModulePath)}, target exists: ${fs.existsSync(newModulePath)})`);
        } catch {
          console.log(`[ConvertToDreamNode] ${prefix}  Could not inspect .git/modules`);
        }

        // Check canvas files
        const canvasFiles = fs.readdirSync(folderPath, { withFileTypes: true })
          .filter((e: any) => e.isFile() && e.name.endsWith('.canvas'))
          .map((e: any) => e.name);
        if (canvasFiles.length > 0) {
          console.log(`[ConvertToDreamNode] ${prefix}  Would update canvas references in: ${canvasFiles.join(', ')}`);
        }

        repairs.push({ from: oldPath, to: newName });
        continue;
      }

      try {
        // Step 1: Move the directory using git mv
        if (fs.existsSync(oldFullPath)) {
          await execAsync(`git mv "${oldPath}" "${newName}"`, { cwd: folderPath });
        } else if (fs.existsSync(newFullPath)) {
          console.log(`[ConvertToDreamNode] Directory already at ${newName}, updating .gitmodules only`);
        } else {
          console.warn(`[ConvertToDreamNode] Neither "${oldPath}" nor "${newName}" exists - skipping`);
          continue;
        }

        // Step 2: Rewrite .gitmodules — update name, path, and url
        let gitmodulesContent = fs.readFileSync(gitmodulesPath, 'utf-8');
        // Replace section header: [submodule "Old Name"] → [submodule "NewName"]
        gitmodulesContent = gitmodulesContent.replace(
          `[submodule "${oldName}"]`,
          `[submodule "${newName}"]`
        );
        // Replace path = Old Name → path = NewName
        gitmodulesContent = gitmodulesContent.replace(
          new RegExp(`(path\\s*=\\s*)${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
          `$1${newName}`
        );
        // Update url if it references the old space-name
        const oldUrlBasename = path.basename(oldPath);
        gitmodulesContent = gitmodulesContent.replace(
          new RegExp(`(url\\s*=\\s*\\.\\./)${oldUrlBasename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
          `$1${newName}`
        );
        fs.writeFileSync(gitmodulesPath, gitmodulesContent);

        // Step 3: Sync git config
        try {
          await execAsync('git submodule sync', { cwd: folderPath });
        } catch (syncErr) {
          console.warn('[ConvertToDreamNode] git submodule sync after path repair failed (non-fatal):', syncErr);
        }

        // Step 4: Rename .git/modules/old → .git/modules/new
        const gitDir = path.join(folderPath, '.git');
        let gitModulesDir: string;
        const gitStat = fs.statSync(gitDir);
        if (gitStat.isFile()) {
          const gitFileContent = fs.readFileSync(gitDir, 'utf-8').trim();
          const gitdirMatch = gitFileContent.match(/^gitdir:\s*(.+)$/);
          if (gitdirMatch) {
            const resolvedGitDir = path.resolve(folderPath, gitdirMatch[1]);
            gitModulesDir = path.join(resolvedGitDir, 'modules');
          } else {
            gitModulesDir = path.join(gitDir, 'modules');
          }
        } else {
          gitModulesDir = path.join(gitDir, 'modules');
        }

        const oldModulePath = path.join(gitModulesDir, oldName);
        const newModulePath = path.join(gitModulesDir, newName);

        if (fs.existsSync(oldModulePath) && !fs.existsSync(newModulePath)) {
          fs.renameSync(oldModulePath, newModulePath);
          console.log(`[ConvertToDreamNode] Renamed .git/modules/${oldName} → ${newName}`);

          // Step 5: Fix .git file inside the submodule dir (gitdir path)
          const subGitFile = path.join(newFullPath, '.git');
          if (fs.existsSync(subGitFile) && fs.statSync(subGitFile).isFile()) {
            let gitFileContent = fs.readFileSync(subGitFile, 'utf-8');
            gitFileContent = gitFileContent.replace(
              new RegExp(oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
              newName
            );
            fs.writeFileSync(subGitFile, gitFileContent);
            console.log(`[ConvertToDreamNode] Fixed gitdir in ${newName}/.git`);
          }

          // Step 6: Fix worktree in .git/modules/NewName/config
          const moduleConfigPath = path.join(newModulePath, 'config');
          if (fs.existsSync(moduleConfigPath)) {
            let configContent = fs.readFileSync(moduleConfigPath, 'utf-8');
            configContent = configContent.replace(
              new RegExp(oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
              newName
            );
            fs.writeFileSync(moduleConfigPath, configContent);
            console.log(`[ConvertToDreamNode] Fixed worktree in .git/modules/${newName}/config`);
          }
        }

        // Step 7: Update canvas file references
        await this.updateCanvasReferences(folderPath, oldPath, newName);

        // Commit the repair
        try {
          await execAsync('git add -A', { cwd: folderPath });
          const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: folderPath });
          if (statusOutput.trim()) {
            await execAsync(
              `git commit -m "Rename submodule path: ${oldPath} → ${newName}"`,
              { cwd: folderPath }
            );
          }
        } catch (commitErr) {
          console.warn('[ConvertToDreamNode] Could not commit submodule path repair:', commitErr);
        }

        repairs.push({ from: oldPath, to: newName });
      } catch (error) {
        console.error(`[ConvertToDreamNode] Failed to repair submodule "${oldPath}":`, error);
      }
    }

    return repairs;
  }

  /**
   * Update canvas files (DreamSong.canvas, etc.) to reflect renamed submodule paths.
   */
  private async updateCanvasReferences(
    folderPath: string,
    oldSubPath: string,
    newSubPath: string
  ): Promise<void> {
    const folderName = path.basename(folderPath);

    // Find all .canvas files in this DreamNode
    const canvasFiles: string[] = [];
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.canvas')) {
        canvasFiles.push(path.join(folderPath, entry.name));
      }
    }

    for (const canvasFile of canvasFiles) {
      try {
        let content = fs.readFileSync(canvasFile, 'utf-8');
        // Replace references like "ParentName/Old Path/" with "ParentName/NewPath/"
        const oldRef = `${folderName}/${oldSubPath}`;
        const newRef = `${folderName}/${newSubPath}`;
        if (content.includes(oldRef)) {
          content = content.split(oldRef).join(newRef);
          fs.writeFileSync(canvasFile, content);
          console.log(`[ConvertToDreamNode] Updated canvas references in ${path.basename(canvasFile)}: ${oldRef} → ${newRef}`);
        }
        // Also replace bare old path references
        if (content.includes(oldSubPath)) {
          content = content.split(oldSubPath).join(newSubPath);
          fs.writeFileSync(canvasFile, content);
        }
      } catch (canvasErr) {
        console.warn(`[ConvertToDreamNode] Could not update canvas ${path.basename(canvasFile)}:`, canvasErr);
      }
    }
  }

  private async migrateGitmodulesUrls(folderPath: string, dryRun?: boolean): Promise<number> {
    const gitmodulesPath = path.join(folderPath, '.gitmodules');

    if (!fs.existsSync(gitmodulesPath)) {
      return 0;
    }

    const content = fs.readFileSync(gitmodulesPath, 'utf-8');
    let migratedCount = 0;
    const expectedVaultRoot = path.dirname(folderPath);
    const prefix = dryRun ? '[DRY RUN] ' : '';

    // Line-by-line replacement to avoid prefix collision bug.
    // e.g. replacing "/Users/.../InterBrain" must not match inside "/Users/.../InterBrain Mobile"
    const lines = content.split('\n');
    const modifiedLines = lines.map((line: string) => {
      const urlMatch = line.match(/^(\s*url\s*=\s*)(\/.+)$/);
      if (!urlMatch) return line;

      const linePrefix = urlMatch[1];
      const absolutePath = urlMatch[2].trim();
      const actualParentDir = path.dirname(absolutePath);

      if (actualParentDir !== expectedVaultRoot) {
        console.log(`[ConvertToDreamNode] ${prefix}Skipping non-sibling absolute path: ${absolutePath}`);
        return line;
      }

      const repoName = path.basename(absolutePath);
      const relativePath = `../${repoName}`;
      console.log(`[ConvertToDreamNode] ${prefix}Migrating .gitmodules URL: ${absolutePath} → ${relativePath}`);
      migratedCount++;
      return `${linePrefix}${relativePath}`;
    });

    let modified = modifiedLines.join('\n');

    // Clean corrupted [submodule] sections — artifacts of spaces in submodule paths
    // breaking git config parsing. These have [submodule] without a quoted name.
    const cleaned = this.cleanCorruptedGitmodulesSections(modified);
    if (cleaned !== modified) {
      console.log(`[ConvertToDreamNode] ${prefix}Cleaned corrupted .gitmodules sections`);
      modified = cleaned;
    }

    const changed = modified !== content;

    if (dryRun) {
      if (changed) {
        console.log(`[ConvertToDreamNode] [DRY RUN] Would write updated .gitmodules (${migratedCount} URL(s) + cleanup)`);
        console.log(`[ConvertToDreamNode] [DRY RUN] Would run: git submodule sync`);
        console.log(`[ConvertToDreamNode] [DRY RUN] Would commit .gitmodules changes`);
      }
      return migratedCount;
    }

    if (changed) {
      fs.writeFileSync(gitmodulesPath, modified);
      console.log(`[ConvertToDreamNode] Updated .gitmodules (${migratedCount} URL(s) migrated)`);

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
   * Remove corrupted [submodule] blocks that lack a quoted name.
   * These are artifacts of spaces in submodule paths breaking git config parsing,
   * producing garbled sections like:
   *   [submodule]
   *       AI = Token
   *       Installation = Wizard.url
   */
  private cleanCorruptedGitmodulesSections(content: string): string {
    // Split into sections by [submodule markers
    const lines = content.split('\n');
    const cleanedLines: string[] = [];
    let skipSection = false;

    for (const line of lines) {
      // Check for submodule section header
      if (/^\[submodule\b/.test(line.trim())) {
        // Valid section has [submodule "name"]
        if (/^\[submodule "[^"]+"\]/.test(line.trim())) {
          skipSection = false;
          cleanedLines.push(line);
        } else {
          // Corrupted section — no quoted name
          console.log(`[ConvertToDreamNode] Removing corrupted .gitmodules section: ${line.trim()}`);
          skipSection = true;
        }
      } else if (skipSection) {
        // Skip lines belonging to corrupted section (indented key=value or blank lines)
        // Stop skipping when we hit a new section header
        if (line.trim().startsWith('[')) {
          // New section — re-evaluate
          skipSection = false;
          if (/^\[submodule\b/.test(line.trim()) && !/^\[submodule "[^"]+"\]/.test(line.trim())) {
            console.log(`[ConvertToDreamNode] Removing corrupted .gitmodules section: ${line.trim()}`);
            skipSection = true;
          } else {
            cleanedLines.push(line);
          }
        }
        // else: skip this line (part of corrupted section)
      } else {
        cleanedLines.push(line);
      }
    }

    return cleanedLines.join('\n');
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
        } catch (_gitCheckError) {
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
