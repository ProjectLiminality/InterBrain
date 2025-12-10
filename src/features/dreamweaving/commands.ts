import { Plugin, TFile } from 'obsidian';
import { UIService } from '../../core/services/ui-service';
import { VaultService } from '../../core/services/vault-service';
import { CanvasParserService } from './services/canvas-parser-service';
import { CanvasLayoutService } from './services/canvas-layout-service';
import { SubmoduleManagerService } from './services/submodule-manager-service';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { serviceManager } from '../../core/services/service-manager';
import { DreamSongRelationshipService } from './dreamsong-relationship-service';
import { DEFAULT_DREAMSONG_RELATIONSHIP_CONFIG, DreamSongRelationshipGraph } from './types/relationship';

/**
 * Dreamweaving commands for canvas analysis and submodule management
 */
export function registerDreamweavingCommands(
  plugin: Plugin,
  uiService: UIService,
  vaultService: VaultService,
  canvasParser: CanvasParserService,
  submoduleManager: SubmoduleManagerService
): void {
  // Initialize canvas layout service
  const canvasLayoutService = new CanvasLayoutService(vaultService, canvasParser);

  // Create DreamSong Canvas - Creates new canvas file in selected DreamNode
  plugin.addCommand({
    id: 'create-dreamsong-canvas',
    name: 'Create DreamSong Canvas',
    hotkeys: [{ modifiers: ['Ctrl'], key: 'd' }],
    callback: async () => {
      try {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;
        
        if (!selectedNode) {
          uiService.showError('Please select a DreamNode first');
          return;
        }
        
        console.log(`Creating DreamSong.canvas in DreamNode: ${selectedNode.name}`);
        uiService.showInfo('Creating DreamSong canvas...');
        
        // Create the canvas file path using the DreamNode's repository path
        const canvasPath = `${selectedNode.repoPath}/DreamSong.canvas`;
        
        // Check if canvas already exists
        const existingFile = plugin.app.vault.getAbstractFileByPath(canvasPath);
        if (existingFile instanceof TFile) {
          uiService.showInfo('DreamSong.canvas already exists, opening in split view...');

          // Get leaf manager service
          const leafManager = serviceManager.getLeafManagerService();
          if (!leafManager) {
            uiService.showError('Leaf manager service not available');
            return;
          }

          // Open canvas using leaf manager for proper split-screen behavior
          await leafManager.openDreamSongCanvas(selectedNode, canvasPath);
          uiService.showSuccess('Opened existing DreamSong.canvas');
          return;
        }
        
        // Create basic canvas structure
        const emptyCanvas = {
          nodes: [],
          edges: []
        };
        
        // Create the canvas file using Obsidian API
        await plugin.app.vault.create(canvasPath, JSON.stringify(emptyCanvas, null, 2));
        
        // Commit the new canvas file
        try {
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);
          
          // Get vault path for git operations
          const adapter = plugin.app.vault.adapter as { path?: string; basePath?: string };
          let vaultPath = '';
          if (typeof adapter.path === 'string') {
            vaultPath = adapter.path;
          } else if (typeof adapter.basePath === 'string') {
            vaultPath = adapter.basePath;
          } else if (adapter.path && typeof adapter.path === 'object') {
            const pathObj = adapter.path as Record<string, string>;
            vaultPath = pathObj.path || pathObj.basePath || '';
          }
          const fullRepoPath = require('path').join(vaultPath, selectedNode.repoPath);
          
          // Add and commit the canvas file
          await execAsync('git add DreamSong.canvas', { cwd: fullRepoPath });
          await execAsync('git commit -m "Add DreamSong canvas"', { cwd: fullRepoPath });
          console.log('DreamSong canvas committed successfully');
        } catch (commitError) {
          console.error('Failed to commit DreamSong canvas:', commitError);
          // Don't fail the whole operation if commit fails
        }

        // Get leaf manager service for proper split-screen opening
        const leafManager = serviceManager.getLeafManagerService();
        if (!leafManager) {
          uiService.showError('Leaf manager service not available');
          return;
        }

        // Open the new canvas file using leaf manager
        await leafManager.openDreamSongCanvas(selectedNode, canvasPath);
        uiService.showSuccess(`Created and opened DreamSong.canvas in ${selectedNode.name}`);
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to create DreamSong canvas:', errorMessage);
        uiService.showError(`Failed to create DreamSong canvas: ${errorMessage}`);
      }
    }
  });

  // Parse Canvas Dependencies - Debug command
  plugin.addCommand({
    id: 'parse-canvas-dependencies',
    name: 'Parse Canvas Dependencies',
    callback: async () => {
      try {
        const activeFile = plugin.app.workspace.getActiveFile();
        
        if (!activeFile || !activeFile.path.endsWith('.canvas')) {
          uiService.showError('Please open a canvas file first');
          return;
        }
        
        console.log(`Analyzing canvas dependencies: ${activeFile.path}`);
        uiService.showInfo('Analyzing canvas dependencies...');
        
        const analysis = await canvasParser.analyzeCanvasDependencies(activeFile.path);
        const report = canvasParser.generateAnalysisReport(analysis);
        
        console.log('Canvas Analysis Report:\n', report);
        
        if (analysis.hasExternalDependencies) {
          uiService.showSuccess(`Found ${analysis.externalDependencies.length} external dependencies`);
        } else {
          uiService.showSuccess('No external dependencies found');
        }
        
        // Show report in console for now
        // TODO: Could create a modal or side panel to show the report
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Canvas analysis failed:', errorMessage);
        uiService.showError(`Canvas analysis failed: ${errorMessage}`);
      }
    }
  });

  // Import and Update Paths - Combined command
  plugin.addCommand({
    id: 'import-and-update-paths',
    name: 'Import and Update Canvas Paths',
    callback: async () => {
      try {
        const activeFile = plugin.app.workspace.getActiveFile();
        
        if (!activeFile || !activeFile.path.endsWith('.canvas')) {
          uiService.showError('Please open a canvas file first');
          return;
        }
        
        console.log(`Import and update paths for canvas: ${activeFile.path}`);
        uiService.showInfo('Importing external DreamNodes and updating paths...');
        
        const analysis = await canvasParser.analyzeCanvasDependencies(activeFile.path);
        
        if (!analysis.hasExternalDependencies) {
          uiService.showSuccess('No external dependencies to import');
          return;
        }
        
        // Group dependencies by DreamNode
        const dreamNodeGroups = new Map<string, number>();
        for (const dep of analysis.externalDependencies) {
          if (dep.dreamNodePath) {
            const count = dreamNodeGroups.get(dep.dreamNodePath) || 0;
            dreamNodeGroups.set(dep.dreamNodePath, count + 1);
          }
        }
        
        let successCount = 0;
        let failureCount = 0;
        const importResults = [];
        
        // Import each unique external DreamNode
        for (const [dreamNodePath] of dreamNodeGroups) {
          const result = await submoduleManager.importSubmodule(
            analysis.dreamNodeBoundary,
            dreamNodePath
          );
          
          importResults.push(result);
          
          if (result.success) {
            successCount++;
            console.log(`Successfully imported submodule: ${result.submoduleName}`);
          } else {
            failureCount++;
            console.error(`Failed to import ${dreamNodePath}:`, result.error);
          }
        }
        
        // Now update canvas paths using the import results
        if (successCount > 0) {
          console.log('Updating canvas paths with imported submodules...');
          
          const pathUpdates = new Map<string, string>();
          
          // Build path updates from successful imports
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
                pathUpdates.set(dep.filePath, newPath);
                console.log(`Path mapping: ${dep.filePath} → ${newPath}`);
              }
            }
          }
          
          if (pathUpdates.size > 0) {
            await canvasParser.updateCanvasFilePaths(activeFile.path, pathUpdates);
            console.log('Path updates applied:', Object.fromEntries(pathUpdates));
            
            // Commit the canvas path updates
            try {
              const { exec } = require('child_process');
              const { promisify } = require('util');
              const execAsync = promisify(exec);
              
              // Get vault path for git operations
              const adapter = plugin.app.vault.adapter as { path?: string; basePath?: string };
              let vaultPath = '';
              if (typeof adapter.path === 'string') {
                vaultPath = adapter.path;
              } else if (typeof adapter.basePath === 'string') {
                vaultPath = adapter.basePath;
              } else if (adapter.path && typeof adapter.path === 'object') {
                const pathObj = adapter.path as Record<string, string>;
                vaultPath = pathObj.path || pathObj.basePath || '';
              }
              const fullRepoPath = require('path').join(vaultPath, analysis.dreamNodeBoundary);
              
              // Add and commit the updated canvas file
              const canvasFileName = require('path').basename(activeFile.path);
              await execAsync(`git add "${canvasFileName}"`, { cwd: fullRepoPath });
              await execAsync(`git commit -m "Update canvas paths for ${successCount} submodule(s)"`, { cwd: fullRepoPath });
              console.log('Canvas path updates committed successfully');
            } catch (commitError) {
              console.error('Failed to commit canvas updates:', commitError);
              // Don't fail the whole operation if commit fails
            }
          }
        }
        
        // Final status message
        if (failureCount === 0) {
          uiService.showSuccess(`Imported ${successCount} submodules and updated canvas paths`);
        } else {
          uiService.showWarning(`Imported ${successCount} submodules, ${failureCount} failed. Canvas paths updated for successful imports.`);
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Import and update failed:', errorMessage);
        uiService.showError(`Import and update failed: ${errorMessage}`);
      }
    }
  });

  // Sync Submodules - Unified command
  plugin.addCommand({
    id: 'sync-canvas-submodules',
    name: 'Sync Canvas Submodules',
    hotkeys: [{ modifiers: ['Ctrl', 'Shift'], key: 's' }],
    callback: async () => {
      try {
        const activeFile = plugin.app.workspace.getActiveFile();
        let canvasPath: string | null = null;

        // Try to get canvas from active file first
        if (activeFile && activeFile.path.endsWith('.canvas')) {
          canvasPath = activeFile.path;
          console.log(`Syncing submodules for canvas: ${canvasPath}`);
        } else {
          // Fallback: Use selected DreamNode's DreamSong.canvas
          const store = useInterBrainStore.getState();
          const selectedNode = store.selectedNode;

          if (!selectedNode) {
            uiService.showError('Please open a canvas file or select a DreamNode first');
            return;
          }

          canvasPath = `${selectedNode.repoPath}/DreamSong.canvas`;
          const canvasFile = plugin.app.vault.getAbstractFileByPath(canvasPath);

          if (!(canvasFile instanceof TFile)) {
            uiService.showError(`No DreamSong.canvas found in ${selectedNode.name}`);
            return;
          }

          console.log(`Syncing submodules for selected DreamNode canvas: ${canvasPath}`);
        }

        uiService.showInfo('Syncing canvas submodules...');

        // Step 1: Commit any current canvas changes before sync
        try {
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);

          // Get vault path for git operations
          const adapter = plugin.app.vault.adapter as { path?: string; basePath?: string };
          let vaultPath = '';
          if (typeof adapter.path === 'string') {
            vaultPath = adapter.path;
          } else if (typeof adapter.basePath === 'string') {
            vaultPath = adapter.basePath;
          } else if (adapter.path && typeof adapter.path === 'object') {
            const pathObj = adapter.path as Record<string, string>;
            vaultPath = pathObj.path || pathObj.basePath || '';
          }

          // Parse canvas to find the DreamNode boundary
          const analysis = await canvasParser.analyzeCanvasDependencies(canvasPath);
          const fullRepoPath = require('path').join(vaultPath, analysis.dreamNodeBoundary);
          const canvasFileName = require('path').basename(canvasPath);

          // Check if there are uncommitted changes to the canvas
          const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: fullRepoPath });
          const canvasHasChanges = statusOutput.includes(canvasFileName);

          if (canvasHasChanges) {
            await execAsync(`git add "${canvasFileName}"`, { cwd: fullRepoPath });
            await execAsync(`git commit -m "Save canvas before submodule sync"`, { cwd: fullRepoPath });
            console.log('Pre-sync canvas changes committed');
          } else {
            console.log('No canvas changes to commit before sync');
          }
        } catch (commitError) {
          console.error('Failed to commit canvas before sync:', commitError);
          // Continue with sync even if pre-commit fails
        }

        // Step 2: Run the sync operation
        const result = await submoduleManager.syncCanvasSubmodules(canvasPath);

        if (result.success) {
          const report = submoduleManager.generateSyncReport(result);
          console.log('Sync Report:\n', report);

          // Note: SubmoduleManagerService already commits all changes including updated canvas paths

          if (result.submodulesImported.length === 0) {
            uiService.showSuccess('Canvas already synchronized (no external dependencies)');
          } else {
            uiService.showSuccess(`Synchronized ${result.submodulesImported.length} submodules`);
          }
        } else {
          console.error('Sync failed:', result.error);
          uiService.showError(`Sync failed: ${result.error}`);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Canvas submodule sync failed:', errorMessage);
        uiService.showError(`Canvas sync failed: ${errorMessage}`);
      }
    }
  });

  // Commit All Changes - Utility command
  plugin.addCommand({
    id: 'commit-all-changes',
    name: 'Commit All Changes',
    callback: async () => {
      try {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;
        
        if (!selectedNode) {
          uiService.showError('Please select a DreamNode first');
          return;
        }
        
        console.log(`Committing all changes in DreamNode: ${selectedNode.name}`);
        uiService.showInfo('Committing all changes...');

        // Use the SubmoduleManager's git operations (it has execAsync)
        const fullPath = submoduleManager['getFullPath'](selectedNode.repoPath);
        const execAsync = require('child_process').exec;
        const { promisify } = require('util');
        const execAsyncPromise = promisify(execAsync);

        // Step 1: Initialize any uninitialized submodules first
        try {
          console.log('  Initializing submodules (if any)...');
          const { stdout: initOutput, stderr: initStderr } = await execAsyncPromise('git submodule update --init --recursive', { cwd: fullPath });
          console.log('  ✓ Submodules initialized');
          if (initOutput) console.log('    Output:', initOutput);
          if (initStderr) console.log('    Stderr:', initStderr);
        } catch (initError) {
          // Non-fatal - submodules may not exist
          const errorMsg = initError instanceof Error ? initError.message : String(initError);
          console.log('  ℹ️ Submodule init status:', errorMsg);
        }

        // Step 2: Recursively commit all dirty submodules
        try {
          console.log('  Checking for dirty submodules...');
          await execAsyncPromise('git submodule foreach --recursive "git add -A && git diff-index --quiet HEAD || git commit --no-verify -m \'Save submodule changes\'"', { cwd: fullPath });
          console.log('  ✓ Submodules committed (if any)');
        } catch {
          // Non-fatal - continue with parent commit
          console.log('  ℹ️ No submodule changes');
        }

        // Step 3: Add all files in parent (including updated submodule references)
        console.log('  Adding all files...');
        try {
          await execAsyncPromise('git add -A', { cwd: fullPath });
          console.log('  ✓ Files added');
        } catch (addError) {
          const errorMsg = addError instanceof Error ? addError.message : String(addError);

          // Check if error is due to broken submodule (no commit checked out)
          if (errorMsg.includes('does not have a commit checked out')) {
            console.log('  ⚠️ Broken submodule detected, attempting to remove from index...');

            // Try to reset submodules and add files without them
            try {
              // Remove all gitlink entries (submodules) from the index
              await execAsyncPromise('git rm --cached -r . 2>/dev/null || true', { cwd: fullPath });
              // Re-add all files (this time without broken submodules)
              await execAsyncPromise('git add -A', { cwd: fullPath });
              console.log('  ✓ Files added (broken submodules skipped)');
            } catch (recoveryError) {
              console.error('  ✗ Recovery failed:', recoveryError);
              throw addError; // Re-throw original error
            }
          } else {
            console.error('  ✗ git add failed:', errorMsg);
            throw addError; // Re-throw to trigger outer catch
          }
        }

        // Step 4: Check if there are any changes to commit
        const { stdout: statusOutput } = await execAsyncPromise('git status --porcelain', { cwd: fullPath });

        if (!statusOutput.trim()) {
          uiService.showSuccess('No changes to commit - repository is clean');
          return;
        }

        // Step 5: Commit parent with all changes (skip hooks with --no-verify)
        const commitMessage = `Save all changes in ${selectedNode.name}`;
        await execAsyncPromise(`git commit --no-verify -m "${commitMessage}"`, { cwd: fullPath });

        uiService.showSuccess(`Committed all changes in ${selectedNode.name}`);
        console.log(`Successfully committed changes with message: "${commitMessage}"`);
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to commit changes:', errorMessage);
        uiService.showError(`Failed to commit changes: ${errorMessage}`);
      }
    }
  });

  // Commit All DreamNodes - Utility command for all repos
  plugin.addCommand({
    id: 'commit-all-dreamnodes',
    name: 'Commit All DreamNodes',
    callback: async () => {
      try {
        console.log('Committing all changes across all DreamNodes...');
        uiService.showInfo('Committing changes in all DreamNodes...');
        
        // Get all nodes from the service manager
        const service = serviceManager.getActive();
        const allNodes = await service.list();
        
        if (allNodes.length === 0) {
          uiService.showWarning('No DreamNodes found');
          return;
        }
        
        // Git operations setup
        const execAsync = require('child_process').exec;
        const { promisify } = require('util');
        const execAsyncPromise = promisify(execAsync);
        
        let processedCount = 0;
        let committedCount = 0;
        let cleanCount = 0;
        let errorCount = 0;
        
        // Process each DreamNode
        for (const node of allNodes) {
          try {
            console.log(`Processing DreamNode: ${node.name} (${node.repoPath})`);

            const fullPath = submoduleManager['getFullPath'](node.repoPath);

            // Step 1: Initialize any uninitialized submodules first
            try {
              const { stdout: initOutput, stderr: initStderr } = await execAsyncPromise('git submodule update --init --recursive', { cwd: fullPath });
              if (initOutput) console.log(`    Init output:`, initOutput);
              if (initStderr) console.log(`    Init stderr:`, initStderr);
            } catch (initError) {
              // Non-fatal - submodules may not exist
              const errorMsg = initError instanceof Error ? initError.message : String(initError);
              console.log(`    Submodule init: ${errorMsg}`);
            }

            // Step 2: Recursively commit all dirty submodules
            try {
              await execAsyncPromise('git submodule foreach --recursive "git add -A && git diff-index --quiet HEAD || git commit --no-verify -m \'Save submodule changes\'"', { cwd: fullPath });
            } catch {
              // Non-fatal - continue with parent commit
            }

            // Step 3: Add all files in parent (including updated submodule references)
            try {
              await execAsyncPromise('git add -A', { cwd: fullPath });
            } catch (addError) {
              const errorMsg = addError instanceof Error ? addError.message : String(addError);

              // Check if error is due to broken submodule (no commit checked out)
              if (errorMsg.includes('does not have a commit checked out')) {
                console.log(`  ⚠️ ${node.name}: Broken submodule detected, removing from index...`);

                // Try to reset submodules and add files without them
                try {
                  // Remove all gitlink entries (submodules) from the index
                  await execAsyncPromise('git rm --cached -r . 2>/dev/null || true', { cwd: fullPath });
                  // Re-add all files (this time without broken submodules)
                  await execAsyncPromise('git add -A', { cwd: fullPath });
                  console.log(`  ✓ ${node.name}: Files added (broken submodules skipped)`);
                } catch (recoveryError) {
                  console.error(`  ✗ ${node.name}: Recovery failed:`, recoveryError);
                  throw addError; // Re-throw original error
                }
              } else {
                console.error(`  ✗ git add failed for ${node.name}:`, errorMsg);
                throw addError;
              }
            }

            // Step 4: Check if there are any changes to commit
            const { stdout: statusOutput } = await execAsyncPromise('git status --porcelain', { cwd: fullPath });

            if (!statusOutput.trim()) {
              console.log(`  ✓ ${node.name}: Already clean`);
              cleanCount++;
            } else {
              // Step 5: Commit with a generic message (skip hooks with --no-verify)
              const commitMessage = `Save all changes in ${node.name}`;
              await execAsyncPromise(`git commit --no-verify -m "${commitMessage}"`, { cwd: fullPath });
              console.log(`  ✓ ${node.name}: Committed changes`);
              committedCount++;
            }

            processedCount++;
            
          } catch (error) {
            console.error(`  ✗ ${node.name}: Failed - ${error instanceof Error ? error.message : 'Unknown error'}`);
            errorCount++;
          }
        }
        
        // Final status message
        const summary = `Processed ${processedCount}/${allNodes.length} DreamNodes: ${committedCount} committed, ${cleanCount} already clean${errorCount > 0 ? `, ${errorCount} errors` : ''}`;
        console.log('Bulk commit summary:', summary);
        
        if (errorCount === 0) {
          uiService.showSuccess(summary);
        } else {
          uiService.showWarning(summary + ' (check console for errors)');
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to commit all DreamNodes:', errorMessage);
        uiService.showError(`Failed to commit all DreamNodes: ${errorMessage}`);
      }
    }
  });

  // Remove All Submodules - Cleanup command
  plugin.addCommand({
    id: 'remove-all-submodules',
    name: 'Remove All Submodules',
    callback: async () => {
      try {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;
        
        if (!selectedNode) {
          uiService.showError('Please select a DreamNode first');
          return;
        }
        
        console.log(`Removing all submodules from DreamNode: ${selectedNode.name}`);
        uiService.showInfo('Removing all submodules...');
        
        // Git operations setup
        const execAsync = require('child_process').exec;
        const { promisify } = require('util');
        const execAsyncPromise = promisify(execAsync);
        const fullPath = submoduleManager['getFullPath'](selectedNode.repoPath);
        
        // List current submodules
        const submodules = await submoduleManager.listSubmodules(selectedNode.repoPath);
        
        if (submodules.length === 0) {
          uiService.showSuccess('No submodules found to remove');
          return;
        }
        
        console.log(`Found ${submodules.length} submodules to remove:`, submodules.map(s => s.name));
        
        let removedCount = 0;
        let errorCount = 0;
        
        // Remove each submodule
        for (const submodule of submodules) {
          try {
            console.log(`Removing submodule: ${submodule.name} (${submodule.path})`);
            
            // Step 1: Remove submodule from git config
            await execAsyncPromise(`git submodule deinit -f "${submodule.path}"`, { cwd: fullPath });
            
            // Step 2: Remove submodule from .gitmodules and git index
            await execAsyncPromise(`git rm -f "${submodule.path}"`, { cwd: fullPath });
            
            // Step 3: Remove submodule directory (if it still exists)
            try {
              const fs = require('fs');
              const path = require('path');
              const submoduleFullPath = path.join(fullPath, submodule.path);
              if (fs.existsSync(submoduleFullPath)) {
                fs.rmSync(submoduleFullPath, { recursive: true, force: true });
                console.log(`  ✓ Removed directory: ${submodule.path}`);
              }
            } catch (dirError) {
              console.warn(`  ⚠️ Could not remove directory ${submodule.path}:`, dirError);
            }
            
            removedCount++;
            console.log(`  ✓ Successfully removed submodule: ${submodule.name}`);
            
          } catch (error) {
            console.error(`  ✗ Failed to remove submodule ${submodule.name}:`, error);
            errorCount++;
          }
        }
        
        // Clean up .git/modules directory (optional but thorough)
        try {
          const path = require('path');
          const fs = require('fs');
          const gitModulesPath = path.join(fullPath, '.git', 'modules');
          if (fs.existsSync(gitModulesPath)) {
            fs.rmSync(gitModulesPath, { recursive: true, force: true });
            console.log('  ✓ Cleaned up .git/modules directory');
          }
        } catch (cleanupError) {
          console.warn('  ⚠️ Could not clean up .git/modules:', cleanupError);
        }
        
        // Commit all changes
        if (removedCount > 0) {
          try {
            console.log('Committing submodule removal changes...');
            
            // Add all changes (including removed files)
            await execAsyncPromise('git add -A', { cwd: fullPath });
            
            // Check if there are changes to commit
            const { stdout: statusOutput } = await execAsyncPromise('git status --porcelain', { cwd: fullPath });
            
            if (statusOutput.trim()) {
              const commitMessage = `Remove ${removedCount} submodule(s) from ${selectedNode.name}`;
              await execAsyncPromise(`git commit -m "${commitMessage}"`, { cwd: fullPath });
              console.log(`  ✓ Committed changes: "${commitMessage}"`);
            } else {
              console.log('  ✓ No changes to commit (already clean)');
            }
            
          } catch (commitError) {
            console.error('Failed to commit submodule removal:', commitError);
            uiService.showWarning('Submodules removed but commit failed. Check git status manually.');
            return;
          }
        }
        
        // Final status message
        if (errorCount === 0) {
          uiService.showSuccess(`Removed ${removedCount} submodules and committed changes`);
        } else {
          uiService.showWarning(`Removed ${removedCount} submodules, ${errorCount} failed. Repository committed.`);
        }
        
        console.log(`Submodule removal summary: ${removedCount} removed, ${errorCount} errors`);
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to remove submodules:', errorMessage);
        uiService.showError(`Failed to remove submodules: ${errorMessage}`);
      }
    }
  });

  // List Canvas Submodules - Info command
  plugin.addCommand({
    id: 'list-canvas-submodules',
    name: 'List Canvas Submodules',
    callback: async () => {
      try {
        const activeFile = plugin.app.workspace.getActiveFile();

        if (!activeFile || !activeFile.path.endsWith('.canvas')) {
          uiService.showError('Please open a canvas file first');
          return;
        }

        const dreamNodeBoundary = await canvasParser.findDreamNodeBoundary(activeFile.path);

        if (!dreamNodeBoundary) {
          uiService.showError('Canvas is not inside a DreamNode');
          return;
        }

        const submodules = await submoduleManager.listSubmodules(dreamNodeBoundary);

        if (submodules.length === 0) {
          uiService.showSuccess('No submodules found in this DreamNode');
          return;
        }

        console.log(`Submodules in ${dreamNodeBoundary}:`, submodules);
        uiService.showSuccess(`Found ${submodules.length} submodules (see console)`);

        // TODO: Could show this in a modal or side panel

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to list submodules:', errorMessage);
        uiService.showError(`Failed to list submodules: ${errorMessage}`);
      }
    }
  });

  // Auto-Layout Canvas - Linear top-to-bottom flow
  plugin.addCommand({
    id: 'auto-layout-canvas',
    name: 'Auto-layout Canvas',
    callback: async () => {
      try {
        const activeFile = plugin.app.workspace.getActiveFile();

        if (!activeFile || !activeFile.path.endsWith('.canvas')) {
          uiService.showError('Please open a canvas file first');
          return;
        }

        console.log(`Auto-layouting canvas: ${activeFile.path}`);
        uiService.showInfo('Auto-layouting canvas elements...');

        await canvasLayoutService.autoLayoutCanvas(activeFile.path);

        uiService.showSuccess('Canvas auto-layout complete!');
        console.log('Canvas elements arranged in linear top-to-bottom flow');

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Auto-layout failed:', errorMessage);
        uiService.showError(`Auto-layout failed: ${errorMessage}`);
      }
    }
  });

  // Scan DreamSong Relationships - Extract relationship graph from all DreamSongs
  const relationshipService = new DreamSongRelationshipService(plugin);

  plugin.addCommand({
    id: 'scan-dreamsong-relationships',
    name: 'Scan DreamSong Relationships',
    callback: async () => {
      const store = useInterBrainStore.getState();
      store.setDreamSongRelationshipScanning(true);

      const scanNotice = uiService.showInfo('Scanning DreamSong relationships...', 0);

      try {
        const result = await relationshipService.scanVaultForDreamSongRelationships(
          DEFAULT_DREAMSONG_RELATIONSHIP_CONFIG
        );

        scanNotice.hide();

        if (result.success && result.graph) {
          const { metadata, nodes } = result.graph;
          const existingGraph = store.dreamSongRelationships.graph;
          const relationshipsChanged = hasDreamSongRelationshipsChanged(existingGraph, result.graph);

          store.setDreamSongRelationshipGraph(result.graph);

          const changeIndicator = relationshipsChanged ? 'UPDATED' : 'NO CHANGES';
          const statsMessage = [
            `DreamSong relationship scan complete! ${changeIndicator}`,
            ``,
            `Results:`,
            `- ${metadata.totalNodes} DreamNodes discovered`,
            `- ${metadata.totalDreamSongs} DreamSongs found`,
            `- ${metadata.totalEdges} relationship edges created`,
            `- ${metadata.standaloneNodes} standalone nodes`,
            `- ${nodes.size - metadata.standaloneNodes} connected nodes`,
            ``,
            `Scan completed in ${result.stats.scanTimeMs}ms`,
            relationshipsChanged
              ? `Relationships changed - constellation will update`
              : `No changes detected`
          ].join('\n');

          uiService.showSuccess(statsMessage, 8000);

          if (relationshipsChanged) {
            // Request constellation layout update
            store.requestNavigation({ type: 'applyLayout' });
          }

        } else {
          store.setDreamSongRelationshipScanning(false);
          const errorMessage = result.error
            ? `Scan failed: ${result.error.message}\n\nType: ${result.error.type}`
            : 'Scan failed with unknown error';
          uiService.showError(errorMessage, 8000);
          console.error('[DreamSong Relationships] Scan failed:', result.error);
        }

      } catch (error) {
        scanNotice.hide();
        store.setDreamSongRelationshipScanning(false);
        const errorMessage = `Unexpected error during scan: ${error instanceof Error ? error.message : error}`;
        uiService.showError(errorMessage, 8000);
        console.error('[DreamSong Relationships] Unexpected scan error:', error);
      }
    }
  });

}

/**
 * Check if DreamSong relationship graph has changed
 */
function hasDreamSongRelationshipsChanged(
  oldGraph: DreamSongRelationshipGraph | null,
  newGraph: DreamSongRelationshipGraph
): boolean {
  if (!oldGraph) return true;

  if (oldGraph.edges.length !== newGraph.edges.length) return true;
  if (oldGraph.metadata.totalNodes !== newGraph.metadata.totalNodes) return true;

  const oldEdgeSignatures = new Set(oldGraph.edges.map(e => `${e.source}→${e.target}`));
  const newEdgeSignatures = new Set(newGraph.edges.map(e => `${e.source}→${e.target}`));

  for (const sig of newEdgeSignatures) {
    if (!oldEdgeSignatures.has(sig)) return true;
  }
  for (const sig of oldEdgeSignatures) {
    if (!newEdgeSignatures.has(sig)) return true;
  }

  return false;
}