// Access Node.js modules directly in Electron context (following GitService pattern)
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execAsync = promisify(exec);

import { App } from 'obsidian';
import { GitService } from './git-service';
import { VaultService } from './vault-service';
import { CanvasParserService, DependencyInfo, CanvasAnalysis } from './canvas-parser-service';

export interface SubmoduleInfo {
  name: string;
  path: string;
  url: string;
  branch?: string;
}

export interface SubmoduleImportResult {
  success: boolean;
  submoduleName: string;
  originalPath: string;
  newPath: string;
  error?: string;
  alreadyExisted?: boolean; // Track if submodule was already present
}

export interface SyncResult {
  canvasPath: string;
  dreamNodePath: string;
  submodulesImported: SubmoduleImportResult[];
  pathsUpdated: Map<string, string>;
  commitHash?: string;
  error?: string;
  success: boolean;
}

export class SubmoduleManagerService {
  private gitService: GitService;
  private vaultPath: string = '';

  constructor(
    private app: App,
    private vaultService: VaultService,
    private canvasParser: CanvasParserService
  ) {
    this.gitService = new GitService(app);
    this.initializeVaultPath(app);
  }

  private initializeVaultPath(app: App): void {
    // Get vault file system path for Node.js fs operations (same pattern as GitService)
    const adapter = app.vault.adapter as { path?: string; basePath?: string };
    
    let vaultPath = '';
    if (typeof adapter.path === 'string') {
      vaultPath = adapter.path;
    } else if (typeof adapter.basePath === 'string') {
      vaultPath = adapter.basePath;
    } else if (adapter.path && typeof adapter.path === 'object') {
      const pathObj = adapter.path as Record<string, string>;
      vaultPath = pathObj.path || pathObj.basePath || '';
    }
    
    this.vaultPath = vaultPath;
  }

  private getFullPath(repoPath: string): string {
    if (!this.vaultPath) {
      console.warn('SubmoduleManagerService: Vault path not initialized, using relative path');
      return repoPath;
    }
    return path.join(this.vaultPath, repoPath);
  }

  /**
   * Import a DreamNode as a git submodule
   */
  async importSubmodule(
    parentDreamNodePath: string,
    sourceDreamNodePath: string,
    submoduleName?: string
  ): Promise<SubmoduleImportResult> {
    const parentFullPath = this.getFullPath(parentDreamNodePath);
    const sourceFullPath = this.getFullPath(sourceDreamNodePath);
    
    // Use directory name if submodule name not provided
    const actualSubmoduleName = submoduleName || path.basename(sourceDreamNodePath);
    
    try {
      console.log(`SubmoduleManagerService: Importing ${sourceDreamNodePath} as submodule ${actualSubmoduleName} into ${parentDreamNodePath}`);
      
      // Check if parent is a git repository
      await this.verifyGitRepository(parentFullPath);
      
      // Check if source is a git repository
      await this.verifyGitRepository(sourceFullPath);
      
      // Check for naming conflicts
      await this.checkSubmoduleNameConflict(parentFullPath, actualSubmoduleName);
      
      // Import the submodule
      const submoduleCommand = `git submodule add "${sourceFullPath}" "${actualSubmoduleName}"`;
      await execAsync(submoduleCommand, { cwd: parentFullPath });
      
      console.log(`SubmoduleManagerService: Successfully imported submodule ${actualSubmoduleName}`);
      
      return {
        success: true,
        submoduleName: actualSubmoduleName,
        originalPath: sourceDreamNodePath,
        newPath: actualSubmoduleName
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('SubmoduleManagerService: Failed to import submodule:', errorMessage);
      
      return {
        success: false,
        submoduleName: actualSubmoduleName,
        originalPath: sourceDreamNodePath,
        newPath: '',
        error: errorMessage
      };
    }
  }

  /**
   * Check if a submodule name would conflict with existing files/directories
   */
  private async checkSubmoduleNameConflict(parentPath: string, submoduleName: string): Promise<void> {
    const targetPath = path.join(parentPath, submoduleName);
    
    try {
      // Check if path exists using Node.js fs directly
      const fs = require('fs');
      const exists = fs.existsSync(targetPath);
      
      if (exists) {
        throw new Error(`Submodule name conflict: ${submoduleName} already exists in ${parentPath}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        throw error;
      }
      // Other errors (like permission issues) we'll let slide for now
      console.warn('SubmoduleManagerService: Could not check for name conflicts:', error);
    }
  }

  /**
   * Verify that a path is a git repository
   */
  private async verifyGitRepository(repoPath: string): Promise<void> {
    try {
      await execAsync('git rev-parse --git-dir', { cwd: repoPath });
    } catch {
      throw new Error(`Not a git repository: ${repoPath}`);
    }
  }

  /**
   * List existing submodules in a repository
   */
  async listSubmodules(dreamNodePath: string): Promise<SubmoduleInfo[]> {
    const fullPath = this.getFullPath(dreamNodePath);
    const submodules: SubmoduleInfo[] = [];

    try {
      console.log(`SubmoduleManagerService: Listing submodules in ${dreamNodePath} (${fullPath})`);
      const { stdout } = await execAsync('git submodule status', { cwd: fullPath });

      console.log(`SubmoduleManagerService: git submodule status output:`, stdout);

      if (!stdout.trim()) {
        console.log(`SubmoduleManagerService: No submodules found (empty output)`);
        return submodules;
      }

      // Don't trim before splitting - each line needs its leading space for the regex
      const lines = stdout.split('\n').filter(line => line.trim());
      console.log(`SubmoduleManagerService: Processing ${lines.length} lines`);
      for (const line of lines) {
        console.log(`SubmoduleManagerService: Processing line: "${line}"`);
        // Git submodule status format: " hash path (branch)" or "+hash path (branch)"
        const match = line.match(/^[\s+-]\w+\s+(.+?)(?:\s+\(.+\))?$/);
        console.log(`SubmoduleManagerService: Regex match result:`, match);
        if (match) {
          const submodulePath = match[1];
          const submoduleName = path.basename(submodulePath);
          console.log(`SubmoduleManagerService: Parsed submodule: path="${submodulePath}", name="${submoduleName}"`);
          
          // Get submodule URL
          try {
            const { stdout: urlOutput } = await execAsync(
              `git config --file .gitmodules submodule.${submodulePath}.url`,
              { cwd: fullPath }
            );
            
            submodules.push({
              name: submoduleName,
              path: submodulePath,
              url: urlOutput.trim()
            });
          } catch {
            // If we can't get URL, still include the submodule
            submodules.push({
              name: submoduleName,
              path: submodulePath,
              url: 'unknown'
            });
          }
        }
      }
      
      return submodules;
    } catch (error) {
      console.error('SubmoduleManagerService: Failed to list submodules:', error);
      return submodules;
    }
  }

  /**
   * Sync canvas submodules - complete end-to-end workflow
   */
  async syncCanvasSubmodules(canvasPath: string): Promise<SyncResult> {
    console.log(`SubmoduleManagerService: Starting sync for canvas ${canvasPath}`);
    
    try {
      // Analyze canvas dependencies
      const analysis = await this.canvasParser.analyzeCanvasDependencies(canvasPath);
      
      if (!analysis.hasExternalDependencies) {
        return {
          canvasPath,
          dreamNodePath: analysis.dreamNodeBoundary,
          submodulesImported: [],
          pathsUpdated: new Map(),
          success: true
        };
      }
      
      // Check git state safety
      await this.ensureCleanGitState(analysis.dreamNodeBoundary);
      
      // Import external dependencies as submodules
      const importResults = await this.importExternalDependencies(analysis);

      // Early exit: If all submodules already existed, nothing to update or commit
      const newImports = importResults.filter(r => r.success && !r.alreadyExisted);
      if (newImports.length === 0) {
        console.log(`SubmoduleManagerService: All submodules already synced - no changes needed`);
        return {
          canvasPath,
          dreamNodePath: analysis.dreamNodeBoundary,
          submodulesImported: importResults,
          pathsUpdated: new Map(),
          success: true
        };
      }

      // Update canvas file paths (only if there are new imports)
      const pathUpdates = this.buildCanvasPathUpdates(analysis, importResults);
      if (pathUpdates.size > 0) {
        await this.canvasParser.updateCanvasFilePaths(canvasPath, pathUpdates);
      }

      // Commit changes
      let commitHash: string | undefined;
      commitHash = await this.commitSubmoduleChanges(
        analysis.dreamNodeBoundary,
        canvasPath,
        importResults
      );
      
      console.log(`SubmoduleManagerService: Successfully synced canvas ${canvasPath}`);
      
      return {
        canvasPath,
        dreamNodePath: analysis.dreamNodeBoundary,
        submodulesImported: importResults,
        pathsUpdated: pathUpdates,
        commitHash,
        success: true
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('SubmoduleManagerService: Sync failed:', errorMessage);
      
      return {
        canvasPath,
        dreamNodePath: '',
        submodulesImported: [],
        pathsUpdated: new Map(),
        error: errorMessage,
        success: false
      };
    }
  }

  /**
   * Ensure git repository is in clean state before submodule operations
   */
  private async ensureCleanGitState(dreamNodePath: string): Promise<void> {
    const hasUncommitted = await this.gitService.hasUncommittedChanges(dreamNodePath);
    if (hasUncommitted) {
      // Use existing autostash system
      await this.gitService.stashChanges(dreamNodePath);
      console.log('SubmoduleManagerService: Stashed uncommitted changes for clean state');
    }
  }

  /**
   * Import all external dependencies as submodules
   */
  private async importExternalDependencies(analysis: CanvasAnalysis): Promise<SubmoduleImportResult[]> {
    const results: SubmoduleImportResult[] = [];

    // Group dependencies by DreamNode to avoid duplicate submodules
    const dreamNodeGroups = new Map<string, DependencyInfo[]>();

    for (const dep of analysis.externalDependencies) {
      if (dep.dreamNodePath) {
        const existing = dreamNodeGroups.get(dep.dreamNodePath) || [];
        existing.push(dep);
        dreamNodeGroups.set(dep.dreamNodePath, existing);
      }
    }

    // Get existing submodules to avoid conflicts
    const existingSubmodules = await this.listSubmodules(analysis.dreamNodeBoundary);
    const existingSubmoduleNames = new Set(existingSubmodules.map(s => s.name));

    console.log(`SubmoduleManagerService: Found ${existingSubmodules.length} existing submodules:`, Array.from(existingSubmoduleNames));

    // Import each unique external DreamNode as a submodule (only if not already present)
    for (const [dreamNodePath, dependencies] of dreamNodeGroups) {
      const submoduleName = path.basename(dreamNodePath);

      if (existingSubmoduleNames.has(submoduleName)) {
        console.log(`SubmoduleManagerService: Submodule ${submoduleName} already exists, skipping import`);
        // Create a success result for already-existing submodule
        results.push({
          success: true,
          submoduleName,
          originalPath: dreamNodePath,
          newPath: submoduleName,
          alreadyExisted: true
        });
      } else {
        console.log(`SubmoduleManagerService: Importing ${dreamNodePath} for ${dependencies.length} dependencies`);

        const result = await this.importSubmodule(
          analysis.dreamNodeBoundary,
          dreamNodePath
        );

        results.push(result);
      }
    }

    return results;
  }

  /**
   * Build path update map for canvas file rewriting (old method, kept for compatibility)
   */
  private buildPathUpdates(importResults: SubmoduleImportResult[]): Map<string, string> {
    const pathUpdates = new Map<string, string>();
    
    for (const result of importResults) {
      if (result.success) {
        // Map original DreamNode path to submodule path
        pathUpdates.set(result.originalPath, result.newPath);
      }
    }
    
    return pathUpdates;
  }

  /**
   * Build canvas path updates using the correct logic from the working command
   */
  private buildCanvasPathUpdates(analysis: CanvasAnalysis, importResults: SubmoduleImportResult[]): Map<string, string> {
    const pathUpdates = new Map<string, string>();

    // Build path updates from successful imports (same logic as working command)
    for (const dep of analysis.externalDependencies) {
      if (dep.dreamNodePath) {
        // Find the import result for this dependency's DreamNode
        const matchingImport = importResults.find(result =>
          result.success && result.originalPath === dep.dreamNodePath
        );

        if (matchingImport) {
          // Build new path: dreamNodeBoundary/submoduleName + file path within that DreamNode
          const relativePath = dep.filePath.replace(dep.dreamNodePath + '/', '');
          const newPath = `${analysis.dreamNodeBoundary}/${matchingImport.submoduleName}/${relativePath}`;

          // Only add to pathUpdates if the path actually changes
          if (dep.filePath !== newPath) {
            pathUpdates.set(dep.filePath, newPath);
            console.log(`SubmoduleManager path mapping: ${dep.filePath} → ${newPath}`);
          } else {
            console.log(`SubmoduleManager path already correct: ${dep.filePath}`);
          }
        }
      }
    }

    return pathUpdates;
  }

  /**
   * Commit submodule additions and canvas changes
   */
  private async commitSubmoduleChanges(
    dreamNodePath: string,
    canvasPath: string,
    importResults: SubmoduleImportResult[]
  ): Promise<string> {
    const fullPath = this.getFullPath(dreamNodePath);
    
    try {
      // Add all changes (submodules and updated canvas)
      await execAsync('git add -A', { cwd: fullPath });
      
      // Create commit message
      const successCount = importResults.filter(r => r.success).length;
      const canvasName = path.basename(canvasPath, '.canvas');
      const commitMessage = `Add ${successCount} submodule(s) for canvas ${canvasName}`;
      
      // Commit changes
      const { stdout } = await execAsync(`git commit -m "${commitMessage}"`, { cwd: fullPath });
      
      // Extract commit hash from output
      const hashMatch = stdout.match(/\[.+\s+(\w+)\]/);
      const commitHash = hashMatch ? hashMatch[1] : 'unknown';
      
      console.log(`SubmoduleManagerService: Committed changes with hash ${commitHash}`);
      return commitHash;
      
    } catch (error) {
      console.error('SubmoduleManagerService: Failed to commit changes:', error);
      throw new Error(`Failed to commit submodule changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a summary report of sync operation
   */
  generateSyncReport(result: SyncResult): string {
    let report = `Submodule Sync Report: ${result.canvasPath}\n`;
    report += `DreamNode: ${result.dreamNodePath}\n`;
    report += `Status: ${result.success ? 'SUCCESS' : 'FAILED'}\n`;
    
    if (result.error) {
      report += `Error: ${result.error}\n`;
    }
    
    if (result.commitHash) {
      report += `Commit: ${result.commitHash}\n`;
    }
    
    report += `\nSubmodules Imported: ${result.submodulesImported.length}\n`;
    
    for (const imported of result.submodulesImported) {
      const status = imported.success ? 'SUCCESS' : 'FAILED';
      report += `  - ${imported.submoduleName}: ${status}`;
      if (imported.error) {
        report += ` (${imported.error})`;
      }
      report += '\n';
    }
    
    report += `\nPaths Updated: ${result.pathsUpdated.size}\n`;
    for (const [original, updated] of result.pathsUpdated) {
      report += `  - ${original} → ${updated}\n`;
    }
    
    return report;
  }
}