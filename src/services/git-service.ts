// Access Node.js modules directly in Electron context (following GitDreamNodeService pattern)
/* eslint-disable no-undef */
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
/* eslint-enable no-undef */

const execAsync = promisify(exec);

import { App } from 'obsidian';

// Type for accessing file system path from Obsidian vault adapter
interface VaultAdapter {
  path?: string;
  basePath?: string;
}

export class GitService {
  private vaultPath: string = '';
  
  constructor(private app?: App) {
    if (app) {
      this.initializeVaultPath(app);
    }
  }
  
  private initializeVaultPath(app: App): void {
    // Get vault file system path for Node.js fs operations (same as GitDreamNodeService)
    const adapter = app.vault.adapter as VaultAdapter;
    
    // Try different ways to get the vault path
    let vaultPath = '';
    if (typeof adapter.path === 'string') {
      vaultPath = adapter.path;
    } else if (typeof adapter.basePath === 'string') {
      vaultPath = adapter.basePath;
    } else if (adapter.path && typeof adapter.path === 'object') {
      // Sometimes path is an object with properties
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vaultPath = (adapter.path as any).path || (adapter.path as any).basePath || '';
    }
    
    this.vaultPath = vaultPath;
    console.log('GitService: Vault path:', this.vaultPath);
  }
  
  private getFullPath(repoPath: string): string {
    if (!this.vaultPath) {
      console.warn('GitService: Vault path not initialized, using relative path');
      return repoPath;
    }
    return path.join(this.vaultPath, repoPath);
  }
  async commitWithAI(nodePath: string): Promise<void> {
    // TODO: Implement AI-assisted git commit
    console.log(`Would commit changes for: ${nodePath}`);
    throw new Error('Git operations not yet implemented');
  }

  async createDreamNode(name: string, type: 'dream' | 'dreamer'): Promise<string> {
    // TODO: Implement git init + initial commit
    console.log(`Would create ${type} node: ${name}`);
    throw new Error('DreamNode creation not yet implemented');
  }

  async weaveDreams(nodeIds: string[]): Promise<string> {
    // TODO: Implement git submodule operations
    console.log(`Would weave nodes: ${nodeIds.join(', ')}`);
    throw new Error('Dream weaving not yet implemented');
  }

  /**
   * Stash all uncommitted changes with a creator mode message
   */
  async stashChanges(repoPath: string): Promise<void> {
    const fullPath = this.getFullPath(repoPath);
    try {
      console.log(`GitService: Stashing changes in ${fullPath}`);
      
      // First check if there are any changes to stash
      const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: fullPath });
      if (!statusOutput.trim()) {
        console.log('GitService: No changes to stash');
        return;
      }
      
      // Add all changes
      await execAsync('git add -A', { cwd: fullPath });
      
      // Then stash with a specific message
      const stashMessage = 'InterBrain creator mode';
      await execAsync(`git stash push -m "${stashMessage}"`, { cwd: fullPath });
      
      console.log(`GitService: Successfully stashed changes in: ${fullPath}`);
    } catch (error) {
      console.error('GitService: Failed to stash changes:', error);
      // Check if error is because there's nothing to stash
      if (error instanceof Error && (
        error.message.includes('No local changes') || 
        error.message.includes('No tracked files')
      )) {
        console.log('GitService: No changes to stash (expected)');
        return;
      }
      throw new Error(`Failed to stash changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Pop the most recent stash (if any exists)
   */
  async popStash(repoPath: string): Promise<void> {
    const fullPath = this.getFullPath(repoPath);
    try {
      console.log(`GitService: Checking for stashes in ${fullPath}`);
      
      // Check if there are any stashes first
      const { stdout } = await execAsync('git stash list', { cwd: fullPath });
      if (!stdout.trim()) {
        console.log('GitService: No stashes to pop');
        return;
      }
      
      console.log(`GitService: Found stashes, popping most recent from ${fullPath}`);
      
      // Pop the stash
      await execAsync('git stash pop', { cwd: fullPath });
      console.log(`GitService: Successfully popped stash in: ${fullPath}`);
    } catch (error) {
      console.error('GitService: Failed to pop stash:', error);
      throw new Error(`Failed to pop stash: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a repository has uncommitted changes
   */
  async hasUncommittedChanges(repoPath: string): Promise<boolean> {
    const fullPath = this.getFullPath(repoPath);
    try {
      const { stdout } = await execAsync('git status --porcelain', { cwd: fullPath });
      return stdout.trim().length > 0;
    } catch (error) {
      console.error('Failed to check git status:', error);
      return false;
    }
  }

  /**
   * Check if a repository has any stashes
   */
  async hasStashes(repoPath: string): Promise<boolean> {
    const fullPath = this.getFullPath(repoPath);
    try {
      const { stdout } = await execAsync('git stash list', { cwd: fullPath });
      return stdout.trim().length > 0;
    } catch (error) {
      console.error('Failed to check stashes:', error);
      return false;
    }
  }

  /**
   * Check if a repository has unpushed commits (ahead of remote)
   */
  async hasUnpushedCommits(repoPath: string): Promise<boolean> {
    const fullPath = this.getFullPath(repoPath);
    try {
      // First check if there's a remote tracking branch
      const { stdout: branchInfo } = await execAsync('git branch -vv', { cwd: fullPath });
      const currentBranchLine = branchInfo.split('\n').find((line: string) => line.startsWith('*'));
      
      if (!currentBranchLine || !currentBranchLine.includes('[')) {
        // No remote tracking branch
        return false;
      }
      
      // Check for unpushed commits using rev-list
      const { stdout: aheadCount } = await execAsync('git rev-list --count @{upstream}..HEAD', { cwd: fullPath });
      const count = parseInt(aheadCount.trim(), 10);
      
      return count > 0;
    } catch (error) {
      // If there's no upstream or other git errors, assume no unpushed commits
      console.log(`GitService: No upstream or git error in ${fullPath}:`, error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  /**
   * Get count of unpushed commits (for details)
   */
  async getUnpushedCommitCount(repoPath: string): Promise<number> {
    const fullPath = this.getFullPath(repoPath);
    try {
      const { stdout } = await execAsync('git rev-list --count @{upstream}..HEAD', { cwd: fullPath });
      return parseInt(stdout.trim(), 10) || 0;
    } catch {
      return 0;
    }
  }
}