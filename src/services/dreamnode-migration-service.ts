/**
 * DreamNode Migration Service
 *
 * Handles migration of DreamNode folder names from old naming conventions to PascalCase.
 * This includes:
 * - Renaming folders on file system
 * - Updating .udd titles to human-readable format
 * - Updating git submodule paths (.git file gitdir references)
 * - Updating parent .gitmodules files
 * - Updating DreamSong.canvas file paths (parent refs + submodule to standalone)
 * - Renaming GitHub repositories (if published)
 * - Updating git remote URLs
 *
 * Architecture Safety:
 * - All UUIDs remain unchanged (relationships unaffected)
 * - Migration is idempotent - can be run multiple times safely
 * - Only file system paths change, not data integrity
 */

import { Plugin } from 'obsidian';
import { sanitizeTitleToPascalCase, isPascalCase, pascalCaseToTitle } from '../utils/title-sanitization';
import { useInterBrainStore } from '../store/interbrain-store';

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);
const fsPromises = fs.promises;

interface VaultAdapter {
  path?: string;
  basePath?: string;
}

export interface MigrationResult {
  success: boolean;
  oldPath: string;
  newPath: string;
  changes: string[];
  errors: string[];
}

export class DreamNodeMigrationService {
  private plugin: Plugin;
  private vaultPath: string;

  constructor(plugin: Plugin) {
    this.plugin = plugin;

    // Get vault path
    const adapter = plugin.app.vault.adapter as VaultAdapter;
    let vaultPath = '';
    if (typeof adapter.path === 'string') {
      vaultPath = adapter.path;
    } else if (typeof adapter.basePath === 'string') {
      vaultPath = adapter.basePath;
    }
    this.vaultPath = vaultPath;
  }

  /**
   * Normalize title to human-readable format with spaces
   *
   * Handles:
   * - PascalCase: "ThunderstormGenerator" → "Thunderstorm Generator"
   * - kebab-case: "thunderstorm-generator" → "Thunderstorm Generator"
   * - snake_case: "thunderstorm_generator" → "Thunderstorm Generator"
   * - Mixed: "Thunderstorm-Generator-UPDATED" → "Thunderstorm Generator Updated"
   * - Already human: "Thunderstorm Generator" → "Thunderstorm Generator" (no change)
   */
  private normalizeToHumanReadable(title: string): string {
    // If title contains hyphens, underscores, or periods as separators
    if (/[-_.]+/.test(title)) {
      // Replace separators with spaces and normalize
      return title
        .split(/[-_.]+/)                    // Split on hyphens, underscores, periods
        .filter(word => word.length > 0)
        .map(word => {
          // Capitalize first letter, lowercase rest (proper title case)
          const cleaned = word.trim();
          if (cleaned.length === 0) return '';
          return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
        })
        .join(' ')
        .trim();
    }

    // If title is pure PascalCase (no separators), convert to spaced format
    if (isPascalCase(title)) {
      return pascalCaseToTitle(title);
    }

    // Already human-readable with spaces, return as-is
    return title;
  }

  /**
   * Migrate a single DreamNode to PascalCase naming
   */
  async migrateSingleNode(nodeId: string): Promise<MigrationResult> {
    const changes: string[] = [];
    const errors: string[] = [];

    try {
      // Get node from store
      const store = useInterBrainStore.getState();
      const nodeData = store.realNodes.get(nodeId);

      if (!nodeData) {
        return {
          success: false,
          oldPath: '',
          newPath: '',
          changes: [],
          errors: [`Node ${nodeId} not found in store`]
        };
      }

      const node = nodeData.node;
      const oldFolderName = node.repoPath;
      const oldFullPath = path.join(this.vaultPath, oldFolderName);

      // Read .udd to get title
      const uddPath = path.join(oldFullPath, '.udd');
      if (!fs.existsSync(uddPath)) {
        return {
          success: false,
          oldPath: oldFullPath,
          newPath: '',
          changes: [],
          errors: ['.udd file not found']
        };
      }

      const uddContent = await fsPromises.readFile(uddPath, 'utf-8');
      const udd = JSON.parse(uddContent);

      // Step 1: Normalize .udd title to human-readable format if needed
      let titleUpdated = false;
      const humanTitle = this.normalizeToHumanReadable(udd.title);
      if (humanTitle !== udd.title) {
        console.log(`DreamNodeMigration: Converting title to human-readable: "${udd.title}" → "${humanTitle}"`);
        udd.title = humanTitle;
        titleUpdated = true;
      }

      // Step 2: Generate new PascalCase folder name from (now human-readable) title
      const newFolderName = sanitizeTitleToPascalCase(udd.title);
      const newFullPath = path.join(this.vaultPath, newFolderName);

      // Check if already PascalCase (no folder rename needed)
      if (oldFolderName === newFolderName) {
        // Folder is correct, but we may have updated the title
        if (titleUpdated) {
          // Write updated .udd with human-readable title
          await fsPromises.writeFile(uddPath, JSON.stringify(udd, null, 2));
          changes.push(`Updated .udd title: "${pascalCaseToTitle(oldFolderName)}" (human-readable)`);

          // Commit the .udd update
          try {
            await execAsync(
              'git add .udd && git commit --no-verify -m "Convert title to human-readable format" || true',
              { cwd: oldFullPath }
            );
            changes.push('Committed .udd title update');
          } catch (error) {
            errors.push(`Failed to commit .udd update: ${error instanceof Error ? error.message : String(error)}`);
          }

          // Update store with new title
          node.name = udd.title;
          const store = useInterBrainStore.getState();
          store.updateRealNode(nodeId, {
            ...nodeData,
            node,
            lastSynced: Date.now()
          });
          changes.push('Updated node name in store');

          return {
            success: errors.length === 0,
            oldPath: oldFullPath,
            newPath: newFullPath,
            changes,
            errors
          };
        }

        // Nothing to do
        return {
          success: true,
          oldPath: oldFullPath,
          newPath: newFullPath,
          changes: ['Already using PascalCase naming - no migration needed'],
          errors: []
        };
      }

      // Check if target already exists
      if (fs.existsSync(newFullPath)) {
        return {
          success: false,
          oldPath: oldFullPath,
          newPath: newFullPath,
          changes: [],
          errors: [`Target path already exists: ${newFolderName}`]
        };
      }

      // Check if this is a clean repo (no uncommitted changes)
      try {
        const statusResult = await execAsync('git status --porcelain', { cwd: oldFullPath });
        if (statusResult.stdout.trim().length > 0) {
          return {
            success: false,
            oldPath: oldFullPath,
            newPath: newFullPath,
            changes: [],
            errors: ['Repository has uncommitted changes - commit or stash first']
          };
        }
      } catch (error) {
        errors.push(`Failed to check git status: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Step 1: Check if this node is a submodule (has .git file pointing to parent)
      const gitPath = path.join(oldFullPath, '.git');
      const isSubmodule = fs.existsSync(gitPath) && fs.statSync(gitPath).isFile();

      if (isSubmodule) {
        // Read .git file to get gitdir path
        const gitFile = await fsPromises.readFile(gitPath, 'utf-8');
        const gitdirMatch = gitFile.match(/gitdir:\s*(.+)/);

        if (gitdirMatch) {
          const oldGitdir = gitdirMatch[1].trim();
          // Extract parent path and update to new folder name
          // Old: ../.git/modules/OldName
          // New: ../.git/modules/NewName
          const gitdirParts = oldGitdir.split('/');
          gitdirParts[gitdirParts.length - 1] = newFolderName;
          const newGitdir = gitdirParts.join('/');

          changes.push(`Updated .git file gitdir: ${oldGitdir} → ${newGitdir}`);

          // We'll update this after the rename
        }
      }

      // Step 2: Rename folder
      await fsPromises.rename(oldFullPath, newFullPath);
      changes.push(`Renamed folder: ${oldFolderName} → ${newFolderName}`);

      // Step 3: Update .git file if submodule
      if (isSubmodule) {
        const newGitPath = path.join(newFullPath, '.git');
        const gitFile = await fsPromises.readFile(newGitPath, 'utf-8');
        const gitdirMatch = gitFile.match(/gitdir:\s*(.+)/);

        if (gitdirMatch) {
          const oldGitdir = gitdirMatch[1].trim();
          const gitdirParts = oldGitdir.split('/');
          gitdirParts[gitdirParts.length - 1] = newFolderName;
          const newGitdir = gitdirParts.join('/');

          const newGitFileContent = gitFile.replace(oldGitdir, newGitdir);
          await fsPromises.writeFile(newGitPath, newGitFileContent);
          changes.push(`Updated .git file with new gitdir path`);
        }
      }

      // Step 3.5: Write updated .udd file (with human-readable title if it was fixed)
      if (titleUpdated) {
        const newUddPath = path.join(newFullPath, '.udd');
        await fsPromises.writeFile(newUddPath, JSON.stringify(udd, null, 2));
        changes.push(`Updated .udd title: "${udd.title}" (human-readable)`);

        // Commit the .udd update
        try {
          await execAsync(
            'git add .udd && git commit --no-verify -m "Convert title to human-readable format" || true',
            { cwd: newFullPath }
          );
          changes.push('Committed .udd title update');
        } catch (error) {
          errors.push(`Failed to commit .udd update: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Step 4: Find and update parent .gitmodules files
      try {
        const parentUpdates = await this.updateParentGitmodules(oldFolderName, newFolderName);
        changes.push(...parentUpdates);
      } catch (error) {
        errors.push(`Failed to update parent .gitmodules: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Step 5: Rename GitHub repository if published
      if (udd.githubRepoUrl) {
        try {
          const githubRename = await this.renameGitHubRepo(udd.githubRepoUrl, newFolderName, newFullPath);
          changes.push(...githubRename.changes);
          errors.push(...githubRename.errors);
        } catch (error) {
          errors.push(`Failed to rename GitHub repo: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Step 5.5: Update canvas file paths (if DreamSong.canvas exists)
      try {
        const canvasUpdates = await this.updateCanvasPathsForMigration(oldFolderName, newFolderName, newFullPath);
        changes.push(...canvasUpdates);
      } catch (error) {
        errors.push(`Failed to update canvas paths: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Step 6: Update store with new folder path AND human-readable title
      node.repoPath = newFolderName;
      node.name = udd.title;  // Use human-readable title, not PascalCase folder name
      store.updateRealNode(nodeId, {
        ...nodeData,
        node,
        lastSynced: Date.now()
      });
      changes.push('Updated Zustand store repoPath and name');

      return {
        success: errors.length === 0,
        oldPath: oldFullPath,
        newPath: newFullPath,
        changes,
        errors
      };

    } catch (error) {
      errors.push(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        oldPath: '',
        newPath: '',
        changes,
        errors
      };
    }
  }

  /**
   * Find and update parent .gitmodules files
   */
  private async updateParentGitmodules(oldPath: string, newPath: string): Promise<string[]> {
    const changes: string[] = [];

    try {
      // Search all directories in vault for .gitmodules files
      const entries = await fsPromises.readdir(this.vaultPath, { withFileTypes: true });
      const directories = entries.filter((e: any) => e.isDirectory());

      for (const dir of directories) {
        const gitmodulesPath = path.join(this.vaultPath, dir.name, '.gitmodules');

        if (fs.existsSync(gitmodulesPath)) {
          let content = await fsPromises.readFile(gitmodulesPath, 'utf-8');
          const originalContent = content;

          // Update path field
          content = content.replace(
            new RegExp(`(path\\s*=\\s*)${oldPath}`, 'g'),
            `$1${newPath}`
          );

          // Write back if changed
          if (content !== originalContent) {
            await fsPromises.writeFile(gitmodulesPath, content);
            changes.push(`Updated .gitmodules in ${dir.name}`);

            // Auto-commit the change
            try {
              await execAsync(
                `git add .gitmodules && git commit --no-verify -m "Update submodule path: ${oldPath} → ${newPath}" || true`,
                { cwd: path.join(this.vaultPath, dir.name) }
              );
              changes.push(`Committed .gitmodules change in ${dir.name}`);
            } catch {
              // Non-fatal - continue
              changes.push(`Note: Could not auto-commit in ${dir.name}`);
            }
          }
        }
      }
    } catch (error) {
      throw new Error(`Failed to update parent .gitmodules: ${error instanceof Error ? error.message : String(error)}`);
    }

    return changes;
  }

  /**
   * Rename GitHub repository using gh CLI
   */
  private async renameGitHubRepo(
    repoUrl: string,
    newName: string,
    localPath: string
  ): Promise<{ changes: string[]; errors: string[] }> {
    const changes: string[] = [];
    const errors: string[] = [];

    try {
      // Extract owner/repo from URL
      const match = repoUrl.match(/github\.com\/([^/]+)\/([^/\s]+)/);
      if (!match) {
        errors.push(`Invalid GitHub URL format: ${repoUrl}`);
        return { changes, errors };
      }

      const [, owner, oldRepoName] = match;
      const cleanOldName = oldRepoName.replace(/\.git$/, '');

      // Try to detect gh CLI path
      let ghPath = 'gh';
      try {
        const pathsToTry = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', 'gh'];
        for (const testPath of pathsToTry) {
          try {
            await execAsync(`${testPath} --version`);
            ghPath = testPath;
            break;
          } catch {
            continue;
          }
        }
      } catch {
        errors.push('GitHub CLI not found - cannot rename repository');
        return { changes, errors };
      }

      // Rename repository
      try {
        await execAsync(`"${ghPath}" repo rename ${newName} --repo ${owner}/${cleanOldName} --yes`);
        changes.push(`Renamed GitHub repo: ${cleanOldName} → ${newName}`);
      } catch (error) {
        errors.push(`Failed to rename GitHub repo: ${error instanceof Error ? error.message : String(error)}`);
        return { changes, errors };
      }

      // Update git remote URL
      const newUrl = `https://github.com/${owner}/${newName}.git`;
      try {
        await execAsync(`git remote set-url github ${newUrl}`, { cwd: localPath });
        changes.push(`Updated git remote URL: ${newUrl}`);
      } catch (error) {
        errors.push(`Failed to update git remote: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Update .udd file with new GitHub URL
      try {
        const uddPath = path.join(localPath, '.udd');
        const uddContent = await fsPromises.readFile(uddPath, 'utf-8');
        const udd = JSON.parse(uddContent);

        udd.githubRepoUrl = newUrl;
        if (udd.githubPagesUrl) {
          udd.githubPagesUrl = `https://${owner}.github.io/${newName}`;
        }

        await fsPromises.writeFile(uddPath, JSON.stringify(udd, null, 2));
        changes.push('Updated .udd with new GitHub URLs');

        // Commit .udd update
        await execAsync(
          'git add .udd && git commit --no-verify -m "Update GitHub URLs after repo rename" || true',
          { cwd: localPath }
        );
        changes.push('Committed .udd update');
      } catch (error) {
        errors.push(`Failed to update .udd: ${error instanceof Error ? error.message : String(error)}`);
      }

    } catch (error) {
      errors.push(`GitHub rename failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { changes, errors };
  }

  /**
   * Update canvas file paths after migration
   *
   * Handles two types of path updates:
   * 1. Parent folder rename: Holofractal-Universe → HolofractalUniverse
   * 2. Submodule to standalone: Parent/Submodule/file.png → Submodule/file.png
   */
  private async updateCanvasPathsForMigration(
    oldFolderName: string,
    newFolderName: string,
    nodePath: string
  ): Promise<string[]> {
    const changes: string[] = [];

    try {
      // Check if DreamSong.canvas exists
      const canvasPath = path.join(nodePath, 'DreamSong.canvas');
      if (!fs.existsSync(canvasPath)) {
        return changes; // No canvas file, nothing to update
      }

      // Read canvas file
      const canvasContent = await fsPromises.readFile(canvasPath, 'utf-8');
      let canvas = JSON.parse(canvasContent);
      let pathsUpdated = 0;

      // Process each node in the canvas
      if (canvas.nodes && Array.isArray(canvas.nodes)) {
        for (const node of canvas.nodes) {
          if (node.type === 'file' && node.file) {
            const originalPath = node.file;
            let newPath = originalPath;

            // Pattern 1: Update old parent folder name to new name
            // E.g., "Holofractal-Universe/..." → "HolofractalUniverse/..."
            if (originalPath.startsWith(oldFolderName + '/')) {
              newPath = originalPath.replace(oldFolderName + '/', newFolderName + '/');
              changes.push(`Updated parent reference: ${originalPath} → ${newPath}`);
            }

            // Pattern 2: Remove submodule prefix (convert submodule paths to standalone)
            // E.g., "HolofractalUniverse/ThunderstormGenerator/file.png" → "ThunderstormGenerator/file.png"
            // This handles cases where files were in submodules but submodules were removed
            const pathParts = newPath.split('/');
            if (pathParts.length >= 3) {
              // Check if the middle part is a DreamNode (has .udd file at vault root)
              const potentialNodeName = pathParts[1];
              const potentialNodePath = path.join(this.vaultPath, potentialNodeName);
              const potentialUddPath = path.join(potentialNodePath, '.udd');

              if (fs.existsSync(potentialUddPath)) {
                // This is a submodule reference - convert to standalone node path
                const standaloneNodePath = pathParts.slice(1).join('/');
                if (standaloneNodePath !== newPath) {
                  newPath = standaloneNodePath;
                  changes.push(`Converted submodule to standalone: ${originalPath} → ${newPath}`);
                }
              }
            }

            // Update the node's file path if it changed
            if (newPath !== originalPath) {
              node.file = newPath;
              pathsUpdated++;
            }
          }
        }
      }

      // Write updated canvas if any paths changed
      if (pathsUpdated > 0) {
        await fsPromises.writeFile(canvasPath, JSON.stringify(canvas, null, 2));
        changes.push(`Updated ${pathsUpdated} file path(s) in DreamSong.canvas`);

        // Commit the canvas update
        try {
          await execAsync(
            'git add DreamSong.canvas && git commit --no-verify -m "Update canvas paths after migration" || true',
            { cwd: nodePath }
          );
          changes.push('Committed canvas path updates');
        } catch {
          // Non-fatal - continue
          changes.push('Note: Could not auto-commit canvas updates');
        }
      }

    } catch (error) {
      // If canvas doesn't exist or parse fails, that's okay
      if (error instanceof Error && !error.message.includes('ENOENT')) {
        throw error;
      }
    }

    return changes;
  }

  /**
   * Migrate all DreamNodes in vault (parallelized for speed)
   */
  async migrateAllNodes(): Promise<{ total: number; succeeded: number; failed: number; results: MigrationResult[] }> {
    const store = useInterBrainStore.getState();
    const allNodes = Array.from(store.realNodes.keys());

    // Execute all migrations in parallel using Promise.all()
    const results = await Promise.all(
      allNodes.map(nodeId => this.migrateSingleNode(nodeId))
    );

    // Count successes and failures
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return {
      total: allNodes.length,
      succeeded,
      failed,
      results
    };
  }

  /**
   * Audit and fix ALL canvas file paths in the entire vault
   *
   * Scans every DreamSong.canvas file and fixes paths that don't follow PascalCase conventions:
   * - Converts kebab-case folder names to PascalCase
   * - Removes submodule prefixes (converts to standalone paths)
   * - Ensures all path components match actual folder names
   *
   * This is idempotent - safe to run multiple times.
   */
  async auditAllCanvasPaths(): Promise<{
    total: number;
    fixed: number;
    pathsUpdated: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let totalCanvas = 0;
    let fixedCanvas = 0;
    let totalPathsUpdated = 0;

    try {
      // Get all directories in vault
      const entries = await fsPromises.readdir(this.vaultPath, { withFileTypes: true });
      const directories = entries.filter((e: any) => e.isDirectory());

      console.log(`CanvasAudit: Scanning ${directories.length} directories for DreamSong.canvas files...`);

      for (const dir of directories) {
        const canvasPath = path.join(this.vaultPath, dir.name, 'DreamSong.canvas');

        if (!fs.existsSync(canvasPath)) {
          continue; // No canvas file in this directory
        }

        totalCanvas++;
        console.log(`CanvasAudit: Processing ${dir.name}/DreamSong.canvas...`);

        try {
          // Read and parse canvas
          const canvasContent = await fsPromises.readFile(canvasPath, 'utf-8');
          let canvas = JSON.parse(canvasContent);
          let pathsUpdatedInCanvas = 0;

          console.log(`  CanvasAudit: Found ${canvas.nodes?.length || 0} nodes in canvas`);

          // Process each file node
          if (canvas.nodes && Array.isArray(canvas.nodes)) {
            for (const node of canvas.nodes) {
              if (node.type === 'file' && node.file) {
                const originalPath = node.file;
                console.log(`  CanvasAudit: Checking path: ${originalPath}`);
                const fixedPath = await this.fixCanvasPath(originalPath);

                if (fixedPath !== originalPath) {
                  console.log(`  CanvasAudit: ✅ Fixed path: ${originalPath} → ${fixedPath}`);
                  node.file = fixedPath;
                  pathsUpdatedInCanvas++;
                  totalPathsUpdated++;
                } else {
                  console.log(`  CanvasAudit: ✓ Path already correct: ${originalPath}`);
                }
              }
            }
          }

          // Write back if any paths changed
          if (pathsUpdatedInCanvas > 0) {
            await fsPromises.writeFile(canvasPath, JSON.stringify(canvas, null, 2));
            fixedCanvas++;
            console.log(`  CanvasAudit: Updated ${pathsUpdatedInCanvas} path(s) in ${dir.name}/DreamSong.canvas`);

            // Auto-commit changes
            try {
              await execAsync(
                'git add DreamSong.canvas && git commit --no-verify -m "Fix canvas paths to match PascalCase naming" || true',
                { cwd: path.join(this.vaultPath, dir.name) }
              );
              console.log(`  CanvasAudit: Committed changes to ${dir.name}`);
            } catch {
              console.log(`  CanvasAudit: Note - Could not auto-commit in ${dir.name}`);
            }
          }

        } catch (error) {
          const errorMsg = `Failed to process canvas in ${dir.name}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          console.error(`  CanvasAudit: ${errorMsg}`);
        }
      }

      console.log(`CanvasAudit: Complete. Scanned ${totalCanvas} canvas files, fixed ${fixedCanvas}, updated ${totalPathsUpdated} paths.`);

    } catch (error) {
      const errorMsg = `Canvas audit failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      console.error(errorMsg);
    }

    return {
      total: totalCanvas,
      fixed: fixedCanvas,
      pathsUpdated: totalPathsUpdated,
      errors
    };
  }

  /**
   * Fix a single canvas file path to match current naming conventions
   *
   * Simply checks each path component and converts kebab-case to actual folder name.
   * Does NOT remove path components - preserves the full path structure.
   *
   * Example: "9-11/JellifiedSteel/file.jpg" → "911/JellifiedSteel/file.jpg"
   */
  private async fixCanvasPath(originalPath: string): Promise<string> {
    const pathParts = originalPath.split('/');
    const fixedParts: string[] = [];

    console.log(`    CanvasAudit: Analyzing path parts:`, pathParts);

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];

      // Last part is filename - keep as-is
      if (i === pathParts.length - 1) {
        console.log(`      Part[${i}]: "${part}" (filename - keeping as-is)`);
        fixedParts.push(part);
        continue;
      }

      // Check if this part exists as a valid folder
      const potentialNodePath = path.join(this.vaultPath, part);
      console.log(`      Part[${i}]: "${part}" - checking if exists at: ${potentialNodePath}`);

      if (fs.existsSync(potentialNodePath)) {
        // Folder exists with this name - keep it as-is
        console.log(`      ✓ Folder exists as-is: ${part}`);
        fixedParts.push(part);
        continue;
      }

      // Folder doesn't exist - try to find the actual folder name
      console.log(`      ✗ Folder "${part}" doesn't exist, trying alternatives...`);

      // Try removing hyphens/underscores (9-11 → 911, my-node → mynode)
      const withoutSeparators = part.replace(/[-_]/g, '');
      const withoutSeparatorsPath = path.join(this.vaultPath, withoutSeparators);
      console.log(`      Trying without separators: "${withoutSeparators}" at ${withoutSeparatorsPath}`);

      if (fs.existsSync(withoutSeparatorsPath)) {
        // Found it without separators!
        console.log(`      ✅ Found folder without separators: ${part} → ${withoutSeparators}`);
        fixedParts.push(withoutSeparators);
        continue;
      }

      // Try PascalCase conversion
      const pascalCasePart = sanitizeTitleToPascalCase(part);
      const pascalCasePath = path.join(this.vaultPath, pascalCasePart);
      console.log(`      Trying PascalCase: "${pascalCasePart}" at ${pascalCasePath}`);

      if (fs.existsSync(pascalCasePath)) {
        // Found it with PascalCase conversion!
        console.log(`      ✅ Found folder with PascalCase: ${part} → ${pascalCasePart}`);
        fixedParts.push(pascalCasePart);
        continue;
      }

      // Couldn't find matching folder - keep original
      console.log(`      ⚠️ Could not find matching folder for: ${part} - keeping original`);
      fixedParts.push(part);
    }

    const result = fixedParts.join('/');
    console.log(`    CanvasAudit: Result: ${originalPath} → ${result}`);
    return result;
  }
}
