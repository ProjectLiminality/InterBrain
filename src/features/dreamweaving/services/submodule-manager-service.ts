// Access Node.js modules directly in Electron context (following GitService pattern)
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execAsync = promisify(exec);

import { App } from 'obsidian';
import { GitOperationsService } from '../../dreamnode/utils/git-operations';
import { VaultService } from '../../../core/services/vault-service';
import { CanvasParserService, DependencyInfo, CanvasAnalysis } from './canvas-parser-service';
import { UDDService } from '../../dreamnode/services/udd-service';
import { RadicleService } from '../../social-resonance-filter/radicle-service';

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
  submodulesRemoved: string[];  // Names of submodules that were removed
  pathsUpdated: Map<string, string>;
  commitHash?: string;
  error?: string;
  success: boolean;
}

export class SubmoduleManagerService {
  private gitOpsService: GitOperationsService;
  private vaultPath: string = '';

  constructor(
    private app: App,
    private vaultService: VaultService,
    private canvasParser: CanvasParserService,
    private radicleService: RadicleService
  ) {
    this.gitOpsService = new GitOperationsService(app);
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
   * Get Radicle ID from a DreamNode's .udd file
   * ASSUMPTION: All DreamNodes are guaranteed to have Radicle IDs (initialized on creation)
   */
  private async getRadicleIdFromUDD(repoPath: string): Promise<string | null> {
    const fs = require('fs').promises;
    const uddPath = path.join(repoPath, '.udd');

    try {
      const uddContent = await fs.readFile(uddPath, 'utf-8');
      const udd = JSON.parse(uddContent);

      if (udd.radicleId) {
        console.log(`SubmoduleManagerService: Found Radicle ID in .udd: ${udd.radicleId}`);
        return udd.radicleId;
      }

      console.warn(`SubmoduleManagerService: No Radicle ID in .udd at ${uddPath} - this should not happen!`);
      return null;
    } catch (error) {
      console.error(`SubmoduleManagerService: Could not read .udd at ${uddPath}:`, error);
      return null;
    }
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

      // Get Radicle ID for the submodule (network-based URL)
      const radicleId = await this.radicleService.getRadicleId(sourceFullPath);
      if (!radicleId) {
        throw new Error(`Cannot add submodule: ${actualSubmoduleName} does not have a Radicle ID. Initialize with Radicle first.`);
      }

      console.log(`SubmoduleManagerService: Using Radicle URL for submodule: ${radicleId}`);

      // Convert rad:zABC... to rad://zABC... format for git submodule
      const radicleUrl = radicleId.replace(/^rad:/, 'rad://');
      console.log(`SubmoduleManagerService: Converted to git-compatible URL: ${radicleUrl}`);

      // Import the submodule using Radicle URL (use --force to handle previously-removed submodules)
      // CRITICAL: Add Radicle bin to PATH so git can find git-remote-rad helper
      const os = require('os');
      const homeDir = os.homedir();
      const radicleGitHelperPaths = [
        `${homeDir}/.radicle/bin`,
        '/usr/local/bin',
        '/opt/homebrew/bin'
      ];
      const nodeProcess = (globalThis as any).process;
      const enhancedPath = radicleGitHelperPaths.join(':') + ':' + (nodeProcess?.env?.PATH || '');

      const submoduleCommand = `git submodule add --force "${radicleUrl}" "${actualSubmoduleName}"`;
      await execAsync(submoduleCommand, { cwd: parentFullPath, env: { ...nodeProcess?.env, PATH: enhancedPath } });

      console.log(`SubmoduleManagerService: Successfully imported submodule ${actualSubmoduleName} with Radicle URL`);
      
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
      const lines = stdout.split('\n').filter((line: string) => line.trim());
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
  async syncCanvasSubmodules(canvasPath: string, options?: { skipRadicle?: boolean }): Promise<SyncResult> {
    const skipRadicle = options?.skipRadicle ?? false; // Default: false (Radicle enabled)
    console.log(`SubmoduleManagerService: Starting sync for canvas ${canvasPath} (Radicle: ${skipRadicle ? 'DISABLED' : 'enabled'})`);

    try {
      // Analyze canvas dependencies
      const analysis = await this.canvasParser.analyzeCanvasDependencies(canvasPath);

      // Check git state safety
      await this.ensureCleanGitState(analysis.dreamNodeBoundary);

      // Import external dependencies as submodules (only if there are any)
      const importResults = analysis.hasExternalDependencies
        ? await this.importExternalDependencies(analysis)
        : [];

      // Check for unused submodules (bidirectional sync)
      // This runs EVEN if there are no external dependencies, to clean up orphaned submodules
      const removedSubmodules = await this.removeUnusedSubmodules(analysis, importResults);

      // Update bidirectional .udd relationships (submodules <-> supermodules)
      // This ALWAYS runs to ensure existing submodules have correct relationships
      // SKIP RADICLE for local-only saves (massive performance improvement)
      await this.updateBidirectionalRelationships(
        analysis.dreamNodeBoundary,
        importResults,
        removedSubmodules,
        { skipRadicle }
      );

      // Early exit: If all submodules already existed AND none removed, no git commit needed
      const newImports = importResults.filter(r => r.success && !r.alreadyExisted);
      if (newImports.length === 0 && removedSubmodules.length === 0) {
        console.log(`SubmoduleManagerService: All submodules already synced - no git changes needed`);
        return {
          canvasPath,
          dreamNodePath: analysis.dreamNodeBoundary,
          submodulesImported: importResults,
          submodulesRemoved: [],
          pathsUpdated: new Map(),
          success: true
        };
      }

      // Log sync summary for git changes
      console.log(`SubmoduleManagerService: Git sync summary - Added: ${newImports.length}, Removed: ${removedSubmodules.length}`);
      if (newImports.length > 0) {
        console.log(`  Added submodules: ${newImports.map(r => r.submoduleName).join(', ')}`);
      }
      if (removedSubmodules.length > 0) {
        console.log(`  Removed submodules: ${removedSubmodules.join(', ')}`);
      }

      // Update canvas file paths (only if there are new imports)
      const pathUpdates = this.buildCanvasPathUpdates(analysis, importResults);
      if (pathUpdates.size > 0) {
        await this.canvasParser.updateCanvasFilePaths(canvasPath, pathUpdates);
      }

      // Commit changes (including removals)
      let commitHash: string | undefined;
      commitHash = await this.commitSubmoduleChanges(
        analysis.dreamNodeBoundary,
        canvasPath,
        importResults,
        removedSubmodules
      );

      console.log(`SubmoduleManagerService: Successfully synced canvas ${canvasPath}`);

      return {
        canvasPath,
        dreamNodePath: analysis.dreamNodeBoundary,
        submodulesImported: importResults,
        submodulesRemoved: removedSubmodules,
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
        submodulesRemoved: [],
        pathsUpdated: new Map(),
        error: errorMessage,
        success: false
      };
    }
  }

  /**
   * Ensure git repository is in clean state before submodule operations
   * Auto-commits any uncommitted changes to prevent data loss
   */
  private async ensureCleanGitState(dreamNodePath: string): Promise<void> {
    const hasUncommitted = await this.gitOpsService.hasUncommittedChanges(dreamNodePath);
    if (hasUncommitted) {
      // Auto-commit changes before submodule operations
      // This is safer than stashing because commits are permanent and traceable
      const committed = await this.gitOpsService.commitAllChanges(
        dreamNodePath,
        'Auto-save before submodule sync'
      );
      if (committed) {
        console.log('SubmoduleManagerService: Auto-committed uncommitted changes for clean state');
      }
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
   * Remove submodules that are no longer referenced in the canvas (bidirectional sync)
   */
  private async removeUnusedSubmodules(
    analysis: CanvasAnalysis,
    _importResults: SubmoduleImportResult[]
  ): Promise<string[]> {
    const removedSubmodules: string[] = [];

    try {
      // Get all existing submodules
      const existingSubmodules = await this.listSubmodules(analysis.dreamNodeBoundary);

      // Build set of required submodule names from analysis
      const requiredSubmoduleNames = new Set<string>();
      for (const dep of analysis.externalDependencies) {
        if (dep.dreamNodePath) {
          const submoduleName = path.basename(dep.dreamNodePath);
          requiredSubmoduleNames.add(submoduleName);
        }
      }

      console.log(`SubmoduleManagerService: Required submodules:`, Array.from(requiredSubmoduleNames));
      console.log(`SubmoduleManagerService: Existing submodules:`, existingSubmodules.map(s => s.name));

      // Find submodules that are no longer needed
      for (const existingSubmodule of existingSubmodules) {
        if (!requiredSubmoduleNames.has(existingSubmodule.name)) {
          console.log(`SubmoduleManagerService: Removing unused submodule: ${existingSubmodule.name}`);

          try {
            const fullPath = this.getFullPath(analysis.dreamNodeBoundary);

            // Step 1: Deinitialize submodule
            await execAsync(`git submodule deinit -f "${existingSubmodule.path}"`, { cwd: fullPath });

            // Step 2: Remove from git index and .gitmodules
            await execAsync(`git rm -f "${existingSubmodule.path}"`, { cwd: fullPath });

            // Step 3: Remove directory if it still exists
            try {
              const fs = require('fs');
              const submoduleFullPath = path.join(fullPath, existingSubmodule.path);
              if (fs.existsSync(submoduleFullPath)) {
                fs.rmSync(submoduleFullPath, { recursive: true, force: true });
                console.log(`SubmoduleManagerService: Removed directory: ${existingSubmodule.path}`);
              }
            } catch (dirError) {
              console.warn(`SubmoduleManagerService: Could not remove directory ${existingSubmodule.path}:`, dirError);
            }

            removedSubmodules.push(existingSubmodule.name);
            console.log(`SubmoduleManagerService: Successfully removed submodule: ${existingSubmodule.name}`);

          } catch (error) {
            console.error(`SubmoduleManagerService: Failed to remove submodule ${existingSubmodule.name}:`, error);
            // Continue with other submodules even if one fails
          }
        }
      }

      if (removedSubmodules.length > 0) {
        console.log(`SubmoduleManagerService: Removed ${removedSubmodules.length} unused submodule(s)`);
      } else {
        console.log(`SubmoduleManagerService: No unused submodules to remove`);
      }

      return removedSubmodules;

    } catch (error) {
      console.error('SubmoduleManagerService: Failed to check for unused submodules:', error);
      return [];
    }
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
   * Commit submodule additions/removals and canvas changes
   */
  private async commitSubmoduleChanges(
    dreamNodePath: string,
    canvasPath: string,
    importResults: SubmoduleImportResult[],
    removedSubmodules: string[] = []
  ): Promise<string> {
    const fullPath = this.getFullPath(dreamNodePath);

    try {
      // Add all changes (submodules and updated canvas)
      await execAsync('git add -A', { cwd: fullPath });

      // Check if there are actually changes to commit
      const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: fullPath });

      if (!statusOutput.trim()) {
        console.log('SubmoduleManagerService: No changes to commit (already committed by submodule operations)');
        return 'no-changes';
      }

      // Create commit message
      const addedCount = importResults.filter(r => r.success && !r.alreadyExisted).length;
      const removedCount = removedSubmodules.length;
      const canvasName = path.basename(canvasPath, '.canvas');

      let commitMessage = `Sync submodules for canvas ${canvasName}`;
      if (addedCount > 0 && removedCount > 0) {
        commitMessage = `Sync submodules for ${canvasName}: +${addedCount}, -${removedCount}`;
      } else if (addedCount > 0) {
        commitMessage = `Add ${addedCount} submodule(s) for ${canvasName}`;
      } else if (removedCount > 0) {
        commitMessage = `Remove ${removedCount} unused submodule(s) from ${canvasName}`;
      }

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
   * Update bidirectional .udd relationships after submodule sync
   * This implements the Coherence Beacon foundation: parent tracks children, children track parents
   */
  private async updateBidirectionalRelationships(
    parentPath: string,
    importResults: SubmoduleImportResult[],
    removedSubmodules: string[],
    options?: { skipRadicle?: boolean }
  ): Promise<void> {
    const skipRadicle = options?.skipRadicle ?? false;
    console.log(`SubmoduleManagerService: Updating bidirectional .udd relationships... (Radicle: ${skipRadicle ? 'SKIP' : 'enabled'})`);

    const fullParentPath = this.getFullPath(parentPath);

    try {
      // Get parent's title (always needed)
      const parentUDD = await UDDService.readUDD(fullParentPath);
      const parentTitle = parentUDD.title;

      // Get parent's Radicle ID from .udd
      // All DreamNodes are guaranteed to have Radicle IDs (initialized on creation)
      const parentRadicleId = await this.getRadicleIdFromUDD(fullParentPath);

      if (!parentRadicleId) {
        console.error('SubmoduleManagerService: Parent has no Radicle ID - this should not happen!');
        return;
      }

      console.log(`SubmoduleManagerService: Parent Radicle ID: ${parentRadicleId}`);

      let parentModified = false;

      // Process ALL successful submodules (both new and existing)
      // This ensures bidirectional relationships are always in sync, even for pre-existing submodules
      const allSuccessfulImports = importResults.filter(r => r.success);
      for (const result of allSuccessfulImports) {
        const isNew = !result.alreadyExisted;

        console.log(`SubmoduleManagerService: Checking ${isNew ? 'new' : 'existing'} submodule: ${result.submoduleName}`);

        try {
          // Detect sovereign repo path FIRST (e.g., Cseti/Hawkinsscale -> ../Hawkinsscale at vault root)
          const sovereignPath = path.join(this.vaultPath, result.submoduleName);
          const sovereignExists = require('fs').existsSync(path.join(sovereignPath, '.git'));

          if (!sovereignExists) {
            console.log(`SubmoduleManagerService: No sovereign repo found for ${result.submoduleName} - skipping relationship tracking`);
            console.log(`SubmoduleManagerService: (This is normal for DreamNodes cloned from GitHub/Radicle)`);
            continue;
          }

          console.log(`SubmoduleManagerService: Found sovereign repo at vault root: ${result.submoduleName}`);

          // STEP 1: Work in sovereign repo ONLY - update all metadata before importing submodule

          // Get child's Radicle ID from .udd
          // All DreamNodes are guaranteed to have Radicle IDs (initialized on creation)
          const childUDD = await UDDService.readUDD(sovereignPath);
          const childTitle = childUDD.title;
          const childRadicleId = await this.getRadicleIdFromUDD(sovereignPath);

          if (!childRadicleId) {
            console.warn(`SubmoduleManagerService: Child ${result.submoduleName} has no Radicle ID - skipping`);
            continue;
          }

          console.log(`SubmoduleManagerService: Child Radicle ID: ${childRadicleId}`);

          let sovereignModified = false;

          // Add parent's Radicle ID to sovereign's supermodules array (source of truth)
          // All DreamNodes are guaranteed to have Radicle IDs, so this should always succeed
          if (await UDDService.addSupermodule(sovereignPath, parentRadicleId)) {
            console.log(`SubmoduleManagerService: Added ${parentTitle} (${parentRadicleId}) to sovereign ${childTitle}'s supermodules`);
            sovereignModified = true;
          }

          // Commit all sovereign changes at once (only if there are actual changes)
          // IMPORTANT: Always create COHERENCE_BEACON commits, even in skipRadicle mode
          // The skipRadicle flag only affects network operations, not local commits
          if (sovereignModified) {
            try {
              await execAsync('git add .udd', { cwd: sovereignPath });

              // Check if there are actually staged changes before committing
              const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: sovereignPath });

              if (statusOutput.trim()) {
                // Only create COHERENCE_BEACON if we have a parent Radicle ID
                if (!parentRadicleId) {
                  console.warn(`SubmoduleManagerService: Cannot create COHERENCE_BEACON - parent Radicle ID not available`);
                  console.warn(`SubmoduleManagerService: Committing .udd changes without beacon metadata`);
                  await execAsync(`git commit -m "Add supermodule relationship: ${parentTitle}"`, { cwd: sovereignPath });
                } else {
                  // Commit with COHERENCE_BEACON metadata for network discovery
                  const beaconData = JSON.stringify({
                    type: 'supermodule',
                    radicleId: parentRadicleId,
                    title: parentTitle
                  });

                  const commitMessage = `Add supermodule relationship: ${parentTitle}\n\nCOHERENCE_BEACON: ${beaconData}`;

                  console.log(`SubmoduleManagerService: 🎯 Creating COHERENCE_BEACON commit in sovereign ${childTitle}`);
                  console.log(`SubmoduleManagerService: Beacon metadata:`, beaconData);
                  console.log(`SubmoduleManagerService: Full commit message:\n${commitMessage}`);

                  const { stdout: commitOutput } = await execAsync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { cwd: sovereignPath });
                  console.log(`SubmoduleManagerService: Commit output:`, commitOutput);

                  // Get the commit hash
                  const { stdout: commitHash } = await execAsync('git rev-parse HEAD', { cwd: sovereignPath });
                  console.log(`SubmoduleManagerService: ✓ COHERENCE_BEACON commit created: ${commitHash.trim()}`);
                  console.log(`SubmoduleManagerService: This commit will be detected when other vaults run "Check for Updates"`)
                }
              } else {
                console.log(`SubmoduleManagerService: No changes to commit in sovereign ${childTitle} (metadata already up to date)`);
              }
            } catch (error) {
              console.warn(`SubmoduleManagerService: Failed to commit sovereign .udd changes:`, error);
            }
          }

          // STEP 2: NOW update submodule to point to latest sovereign commit with all metadata
          console.log(`SubmoduleManagerService: Updating submodule to latest sovereign state...`);

          try {
            // Initialize submodule first (if not already)
            // CRITICAL: Add Radicle bin to PATH for git-remote-rad helper
            const os = require('os');
            const homeDir = os.homedir();
            const radicleGitHelperPaths = [
              `${homeDir}/.radicle/bin`,
              '/usr/local/bin',
              '/opt/homebrew/bin'
            ];
            const nodeProcess = (globalThis as any).process;
            const enhancedPath = radicleGitHelperPaths.join(':') + ':' + (nodeProcess?.env?.PATH || '');

            await execAsync(`git submodule update --init "${result.submoduleName}"`, {
              cwd: fullParentPath,
              env: { ...nodeProcess?.env, PATH: enhancedPath }
            });

            // Update submodule to point to latest commit from sovereign (remote origin/main)
            const submodulePath = path.join(fullParentPath, result.submoduleName);
            await execAsync(`git fetch origin`, {
              cwd: submodulePath,
              env: { ...nodeProcess?.env, PATH: enhancedPath }
            });
            await execAsync(`git checkout origin/main`, {
              cwd: submodulePath,
              env: { ...nodeProcess?.env, PATH: enhancedPath }
            });

            console.log(`SubmoduleManagerService: ✓ Submodule ${childTitle} updated to latest with complete metadata`);
          } catch (error) {
            console.warn(`SubmoduleManagerService: Could not update submodule ${result.submoduleName} (non-fatal):`, error instanceof Error ? error.message : 'Unknown error');
            console.warn(`SubmoduleManagerService: Continuing with relationship tracking...`);
          }

          // Update parent's .udd (add child's Radicle ID to submodules array if missing)
          if (childRadicleId && await UDDService.addSubmodule(fullParentPath, childRadicleId)) {
            console.log(`SubmoduleManagerService: Added ${childTitle} (${childRadicleId}) to parent's submodules`);
            parentModified = true;
          }

        } catch (error) {
          console.error(`SubmoduleManagerService: Error processing ${result.submoduleName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Process removed submodules
      for (const submoduleName of removedSubmodules) {
        console.log(`SubmoduleManagerService: Processing removed submodule: ${submoduleName}`);

        try {
          // Try to get child's Radicle ID from sovereign repo (preferred source)
          const sovereignPath = path.join(this.vaultPath, submoduleName);
          const sovereignExists = require('fs').existsSync(path.join(sovereignPath, '.git'));

          if (!sovereignExists) {
            console.log(`SubmoduleManagerService: No sovereign repo found for ${submoduleName} - skipping relationship cleanup`);
            console.log(`SubmoduleManagerService: (This is expected for DreamNodes cloned from GitHub/Radicle)`);
            continue;
          }

          // Get child's Radicle ID from sovereign repo
          // All DreamNodes are guaranteed to have Radicle IDs (initialized on creation)
          const childRadicleId = await this.getRadicleIdFromUDD(sovereignPath);

          if (!childRadicleId) {
            console.warn(`SubmoduleManagerService: Removed submodule ${submoduleName} has no Radicle ID - skipping cleanup`);
            continue;
          }

          console.log(`SubmoduleManagerService: Removed submodule Radicle ID: ${childRadicleId}`);

          // Update parent's .udd (remove child's Radicle ID from submodules array)
          if (await UDDService.removeSubmodule(fullParentPath, childRadicleId)) {
            console.log(`SubmoduleManagerService: Removed ${submoduleName} (${childRadicleId}) from parent's submodules`);
            parentModified = true;
          }

          // Update sovereign's supermodules on removal (bidirectional cleanup)
          console.log(`SubmoduleManagerService: Removing supermodule relationship from sovereign ${submoduleName}`);

          if (parentRadicleId && await UDDService.removeSupermodule(sovereignPath, parentRadicleId)) {
            console.log(`SubmoduleManagerService: Removed ${parentTitle} (${parentRadicleId}) from sovereign ${submoduleName}'s supermodules`);

            // Commit the change in the sovereign repository
            try {
              await execAsync('git add .udd', { cwd: sovereignPath });
              await execAsync(`git commit -m "Remove supermodule relationship: ${parentTitle}"`, { cwd: sovereignPath });
              console.log(`SubmoduleManagerService: Committed supermodule removal in sovereign ${submoduleName}`);
            } catch (error) {
              console.error(`SubmoduleManagerService: Failed to commit sovereign .udd changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          } else {
            console.log(`SubmoduleManagerService: Supermodule relationship already removed from sovereign ${submoduleName}`);
          }

        } catch (error) {
          console.error(`SubmoduleManagerService: Error processing removed ${submoduleName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Commit parent's .udd changes if needed
      if (parentModified) {
        try {
          await execAsync('git add .udd', { cwd: fullParentPath });
          await execAsync('git commit -m "Update submodule relationships in .udd"', { cwd: fullParentPath });
          console.log('SubmoduleManagerService: Committed parent .udd relationship changes');
        } catch (error) {
          console.error(`SubmoduleManagerService: Failed to commit parent .udd: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      console.log('SubmoduleManagerService: Bidirectional relationship tracking complete');

      // FINAL STEP: Sync .gitmodules to .udd submodules array (idempotent robustness)
      // This ensures .udd always reflects actual git submodules, even if relationship tracking failed
      await this.syncGitmodulesToUDD(fullParentPath);

    } catch (error) {
      console.error(`SubmoduleManagerService: Fatal error in bidirectional tracking: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Don't throw - this is a non-critical enhancement
    }
  }

  /**
   * Idempotent sync: Parse .gitmodules and ensure all submodule RIDs are in .udd array
   * This provides robustness if relationship tracking fails partway through
   */
  private async syncGitmodulesToUDD(parentPath: string): Promise<void> {
    console.log('SubmoduleManagerService: Syncing .gitmodules → .udd submodules array...');

    try {
      const fs = require('fs');
      const gitmodulesPath = path.join(parentPath, '.gitmodules');

      // Check if .gitmodules exists
      if (!fs.existsSync(gitmodulesPath)) {
        console.log('SubmoduleManagerService: No .gitmodules file - skipping sync');
        return;
      }

      // Parse .gitmodules to get all submodule names
      const gitmodulesContent = fs.readFileSync(gitmodulesPath, 'utf-8');
      const submoduleNames: string[] = [];

      // Match [submodule "name"] sections
      const submoduleRegex = /\[submodule "([^"]+)"\]/g;
      let match;
      while ((match = submoduleRegex.exec(gitmodulesContent)) !== null) {
        submoduleNames.push(match[1]);
      }

      console.log(`SubmoduleManagerService: Found ${submoduleNames.length} submodules in .gitmodules:`, submoduleNames);

      if (submoduleNames.length === 0) {
        console.log('SubmoduleManagerService: No submodules in .gitmodules - nothing to sync');
        return;
      }

      // For each submodule, get RID from sovereign repo and ensure it's in .udd
      let addedCount = 0;
      for (const submoduleName of submoduleNames) {
        const sovereignPath = path.join(this.vaultPath, submoduleName);
        const sovereignExists = fs.existsSync(path.join(sovereignPath, '.git'));

        if (!sovereignExists) {
          console.log(`SubmoduleManagerService: No sovereign repo for ${submoduleName} - skipping .udd sync`);
          continue;
        }

        // Get RID from sovereign .udd
        const childRadicleId = await this.getRadicleIdFromUDD(sovereignPath);
        if (!childRadicleId) {
          console.warn(`SubmoduleManagerService: ${submoduleName} has no Radicle ID - skipping .udd sync`);
          continue;
        }

        // Add to parent's .udd (idempotent - only adds if missing)
        if (await UDDService.addSubmodule(parentPath, childRadicleId)) {
          console.log(`SubmoduleManagerService: ✓ Added ${submoduleName} (${childRadicleId}) to .udd submodules`);
          addedCount++;
        }
      }

      if (addedCount > 0) {
        console.log(`SubmoduleManagerService: Added ${addedCount} missing RID(s) to .udd submodules array`);

        // Commit the .udd update
        try {
          await execAsync('git add .udd', { cwd: parentPath });

          // Check if there are staged changes
          const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: parentPath });
          if (statusOutput.trim()) {
            await execAsync('git commit -m "Sync .gitmodules to .udd submodules array"', { cwd: parentPath });
            console.log('SubmoduleManagerService: ✓ Committed .udd sync changes');
          }
        } catch (error) {
          console.warn('SubmoduleManagerService: Could not commit .udd sync (non-fatal):', error instanceof Error ? error.message : 'Unknown error');
        }
      } else {
        console.log('SubmoduleManagerService: .udd submodules array already up to date with .gitmodules');
      }

    } catch (error) {
      console.error('SubmoduleManagerService: Error syncing .gitmodules to .udd (non-fatal):', error instanceof Error ? error.message : 'Unknown error');
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

    // Show added submodules (filter out already-existed ones)
    const newImports = result.submodulesImported.filter(r => r.success && !r.alreadyExisted);
    report += `\nSubmodules Added: ${newImports.length}\n`;
    for (const imported of newImports) {
      report += `  + ${imported.submoduleName}\n`;
    }

    // Show removed submodules
    report += `\nSubmodules Removed: ${result.submodulesRemoved.length}\n`;
    for (const removed of result.submodulesRemoved) {
      report += `  - ${removed}\n`;
    }

    // Show unchanged submodules (already existed)
    const unchanged = result.submodulesImported.filter(r => r.alreadyExisted);
    if (unchanged.length > 0) {
      report += `\nSubmodules Unchanged: ${unchanged.length}\n`;
      for (const existing of unchanged) {
        report += `  = ${existing.submoduleName}\n`;
      }
    }

    report += `\nPaths Updated: ${result.pathsUpdated.size}\n`;
    for (const [original, updated] of result.pathsUpdated) {
      report += `  - ${original} → ${updated}\n`;
    }

    return report;
  }
}