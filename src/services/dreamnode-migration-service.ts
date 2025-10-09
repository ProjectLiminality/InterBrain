/**
 * DreamNode Migration Service
 *
 * Handles migration of DreamNode folder names from old naming conventions to PascalCase.
 * This includes:
 * - Renaming folders on file system
 * - Updating git submodule paths (.git file gitdir references)
 * - Updating parent .gitmodules files
 * - Renaming GitHub repositories (if published)
 * - Updating git remote URLs
 *
 * Architecture Safety:
 * - All UUIDs remain unchanged (relationships unaffected)
 * - .udd title field already contains human-readable name (no change needed)
 * - Only file system paths change
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
              'git add .udd && git commit -m "Convert title to human-readable format" || true',
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
            'git add .udd && git commit -m "Convert title to human-readable format" || true',
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

      // Step 6: Update store
      node.repoPath = newFolderName;
      store.updateRealNode(nodeId, {
        ...nodeData,
        node,
        lastSynced: Date.now()
      });
      changes.push('Updated Zustand store repoPath');

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
                `git add .gitmodules && git commit -m "Update submodule path: ${oldPath} → ${newPath}" || true`,
                { cwd: path.join(this.vaultPath, dir.name) }
              );
              changes.push(`Committed .gitmodules change in ${dir.name}`);
            } catch (error) {
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
      } catch (error) {
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
          'git add .udd && git commit -m "Update GitHub URLs after repo rename" || true',
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
   * Migrate all DreamNodes in vault
   */
  async migrateAllNodes(): Promise<{ total: number; succeeded: number; failed: number; results: MigrationResult[] }> {
    const store = useInterBrainStore.getState();
    const allNodes = Array.from(store.realNodes.keys());

    const results: MigrationResult[] = [];
    let succeeded = 0;
    let failed = 0;

    for (const nodeId of allNodes) {
      const result = await this.migrateSingleNode(nodeId);
      results.push(result);

      if (result.success) {
        succeeded++;
      } else {
        failed++;
      }
    }

    return {
      total: allNodes.length,
      succeeded,
      failed,
      results
    };
  }
}
