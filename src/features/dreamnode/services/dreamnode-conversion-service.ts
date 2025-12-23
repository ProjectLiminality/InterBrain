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
}

export interface ConversionOptions {
  radiclePassphrase?: string;
  skipRadicle?: boolean;
}

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
      }

      // Create/update .udd file using UDDService
      if (!hasUdd) {
        console.log('[ConvertToDreamNode] Creating .udd file...');
        await UDDService.createUDD(folderPath, { uuid, title, type });
      } else {
        // Validate existing .udd has all required fields
        const updated = await UDDService.ensureRequiredFields(folderPath);
        if (updated) {
          console.log('[ConvertToDreamNode] Updated .udd with missing fields');
        }
      }

      // Create README if not present
      if (!hasReadme) {
        await this.createReadme(folderPath, title);
      }

      // Create LICENSE if not present
      if (!hasLicense) {
        await this.createLicense(folderPath);
      }

      // Commit changes if there are any uncommitted files
      await this.commitIfNeeded(folderPath, title);

      // Initialize Radicle if not already initialized
      if (!options.skipRadicle) {
        const hasRadicle = fs.existsSync(path.join(folderPath, '.rad'));
        if (!hasRadicle) {
          await this.initializeRadicle(folderPath, folderName, type, options.radiclePassphrase);
        }
      }

      // Refresh the vault to pick up the new DreamNode
      console.log('[ConvertToDreamNode] Rescanning vault...');
      await serviceManager.scanVault();

      console.log('[ConvertToDreamNode] Conversion complete!');
      return { success: true, title, uuid };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ConvertToDreamNode] Conversion failed:', error);
      return { success: false, title: folderName, uuid: '', error: errorMessage };
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
}
