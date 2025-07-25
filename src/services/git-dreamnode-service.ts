import { DreamNode, UDDFile, GitStatus } from '../types/dreamnode';
import { useInterBrainStore, RealNodeData } from '../store/interbrain-store';
import { Plugin } from 'obsidian';

// Access Node.js modules directly in Electron context
/* eslint-disable no-undef */
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
/* eslint-enable no-undef */

const execAsync = promisify(exec);
const fsPromises = fs.promises;

// Type for accessing file system path from Obsidian vault adapter
interface VaultAdapter {
  path?: string;
  basePath?: string;
}

/**
 * GitDreamNodeService - Real git-based DreamNode storage
 * 
 * Provides DreamNode CRUD operations backed by actual git repositories.
 * Uses the Zustand real store for UI performance while syncing with vault.
 */
export class GitDreamNodeService {
  private plugin: Plugin;
  private vaultPath: string;
  private templatePath: string;
  
  constructor(plugin: Plugin) {
    this.plugin = plugin;
    // Get vault file system path for Node.js fs operations
    const adapter = plugin.app.vault.adapter as VaultAdapter;
    
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
    
    // Template is packaged with the plugin
    // Get the plugin directory path
    if (this.vaultPath) {
      const pluginDir = path.join(this.vaultPath, '.obsidian', 'plugins', plugin.manifest.id);
      this.templatePath = path.join(pluginDir, 'DreamNode-template');
    } else {
      // Fallback - use relative path
      this.templatePath = './DreamNode-template';
      console.warn('GitDreamNodeService: Could not determine vault path, using relative template path');
    }
    
    console.log('GitDreamNodeService: Vault path:', this.vaultPath);
    console.log('GitDreamNodeService: Template path:', this.templatePath);
  }
  
  /**
   * Create a new DreamNode with git repository
   */
  async create(
    title: string,
    type: 'dream' | 'dreamer',
    dreamTalk?: globalThis.File,
    position?: [number, number, number],
    additionalFiles?: globalThis.File[]
  ): Promise<DreamNode> {
    // Generate unique ID and repo path
    const uuid = crypto.randomUUID();
    const repoName = this.sanitizeRepoName(title);
    const repoPath = path.join(this.vaultPath, repoName);
    
    // Calculate position if not provided
    const nodePosition = position || this.calculateNewNodePosition();
    
    // Process dreamTalk media
    let dreamTalkMedia: Array<{
      path: string;
      absolutePath: string;
      type: string;
      data: string;
      size: number;
    }> = [];
    
    if (dreamTalk) {
      const dataUrl = await this.fileToDataUrl(dreamTalk);
      dreamTalkMedia = [{
        path: dreamTalk.name,
        absolutePath: path.join(repoPath, dreamTalk.name),
        type: dreamTalk.type,
        data: dataUrl,
        size: dreamTalk.size
      }];
    }
    
    // Create DreamNode object
    const node: DreamNode = {
      id: uuid,
      type,
      name: title,
      position: nodePosition,
      dreamTalkMedia,
      dreamSongContent: [],
      liminalWebConnections: [],
      repoPath: repoName, // Relative to vault
      hasUnsavedChanges: false,
      gitStatus: await this.checkGitStatus(repoPath)
    };
    
    // Update store immediately for snappy UI
    const store = useInterBrainStore.getState();
    const nodeData: RealNodeData = {
      node,
      fileHash: dreamTalk ? await this.calculateFileHash(dreamTalk) : undefined,
      lastSynced: Date.now()
    };
    store.updateRealNode(uuid, nodeData);
    
    // Create git repository in parallel (non-blocking)
    this.createGitRepository(repoPath, uuid, title, type, dreamTalk, additionalFiles)
      .catch(error => {
        console.error('Failed to create git repository:', error);
        // TODO: Add error handling/retry logic
      });
    
    console.log(`GitDreamNodeService: Created ${type} "${title}" with ID ${uuid}`);
    return node;
  }
  
  /**
   * Update an existing DreamNode
   */
  async update(id: string, changes: Partial<DreamNode>): Promise<void> {
    const store = useInterBrainStore.getState();
    const nodeData = store.realNodes.get(id);
    
    if (!nodeData) {
      throw new Error(`DreamNode with ID ${id} not found`);
    }
    
    // Update in store
    const updatedNode = { ...nodeData.node, ...changes };
    store.updateRealNode(id, {
      ...nodeData,
      node: updatedNode,
      lastSynced: Date.now()
    });
    
    // If metadata changed, update .udd file
    if (changes.name || changes.type || changes.dreamTalkMedia) {
      await this.updateUDDFile(updatedNode);
    }
    
    console.log(`GitDreamNodeService: Updated node ${id}`, changes);
  }
  
  /**
   * Delete a DreamNode
   */
  async delete(id: string): Promise<void> {
    const store = useInterBrainStore.getState();
    const nodeData = store.realNodes.get(id);
    
    if (!nodeData) {
      throw new Error(`DreamNode with ID ${id} not found`);
    }
    
    // Remove from store
    store.deleteRealNode(id);
    
    // TODO: Optionally delete git repository from disk
    console.log(`GitDreamNodeService: Deleted node ${id}`);
  }
  
  /**
   * List all DreamNodes from store
   */
  async list(): Promise<DreamNode[]> {
    const store = useInterBrainStore.getState();
    return Array.from(store.realNodes.values()).map(data => data.node);
  }
  
  /**
   * Get a specific DreamNode by ID
   */
  async get(id: string): Promise<DreamNode | null> {
    const store = useInterBrainStore.getState();
    const nodeData = store.realNodes.get(id);
    return nodeData ? nodeData.node : null;
  }
  
  /**
   * Scan vault for DreamNode repositories and sync with store
   */
  async scanVault(): Promise<{ added: number; updated: number; removed: number }> {
    console.log('GitDreamNodeService: Scanning vault for DreamNodes...');
    const stats = { added: 0, updated: 0, removed: 0 };
    
    try {
      // Get all root-level directories
      const entries = await fsPromises.readdir(this.vaultPath, { withFileTypes: true });
      const directories = entries.filter((entry: { isDirectory(): boolean }) => entry.isDirectory());
      
      // Track found nodes for removal detection
      const foundNodeIds = new Set<string>();
      
      // Check each directory
      for (const dir of directories) {
        const dirPath = path.join(this.vaultPath, dir.name);
        
        // Check if it's a valid DreamNode (has .git and .udd)
        const isValid = await this.isValidDreamNode(dirPath);
        if (!isValid) continue;
        
        // Read UDD file
        const uddPath = path.join(dirPath, '.udd');
        const uddContent = await fsPromises.readFile(uddPath, 'utf-8');
        const udd: UDDFile = JSON.parse(uddContent);
        
        foundNodeIds.add(udd.uuid);
        
        // Check if node exists in store
        const store = useInterBrainStore.getState();
        const existingData = store.realNodes.get(udd.uuid);
        
        if (!existingData) {
          // New node - add to store
          await this.addNodeFromVault(dirPath, udd, dir.name);
          stats.added++;
        } else {
          // Existing node - check for updates
          const updated = await this.updateNodeFromVault(existingData, dirPath, udd);
          if (updated) stats.updated++;
        }
      }
      
      // Remove nodes that no longer exist in vault
      const store = useInterBrainStore.getState();
      for (const [id] of store.realNodes) {
        if (!foundNodeIds.has(id)) {
          store.deleteRealNode(id);
          stats.removed++;
        }
      }
      
    } catch (error) {
      console.error('Vault scan error:', error);
    }
    
    console.log(`GitDreamNodeService: Scan complete. Added: ${stats.added}, Updated: ${stats.updated}, Removed: ${stats.removed}`);
    return stats;
  }
  
  /**
   * Create git repository with template
   */
  private async createGitRepository(
    repoPath: string,
    uuid: string,
    title: string,
    type: 'dream' | 'dreamer',
    dreamTalk?: globalThis.File,
    additionalFiles?: globalThis.File[]
  ): Promise<void> {
    try {
      // Create directory
      await fsPromises.mkdir(repoPath, { recursive: true });
      
      // Initialize git with template
      console.log(`GitDreamNodeService: Initializing git with template: ${this.templatePath}`);
      const initResult = await execAsync(`git init --template="${this.templatePath}" "${repoPath}"`);
      console.log(`GitDreamNodeService: Git init result:`, initResult);
      
      // Make sure hooks are executable
      const hooksDir = path.join(repoPath, '.git', 'hooks');
      if (await this.fileExists(hooksDir)) {
        await execAsync(`chmod +x "${path.join(hooksDir, 'pre-commit')}"`, { cwd: repoPath });
        console.log(`GitDreamNodeService: Made pre-commit hook executable`);
      }
      
      // Write dreamTalk file if provided
      let dreamTalkPath = '';
      if (dreamTalk) {
        dreamTalkPath = path.join(repoPath, dreamTalk.name);
        const buffer = await dreamTalk.arrayBuffer();
        await fsPromises.writeFile(dreamTalkPath, globalThis.Buffer.from(buffer));
      }
      
      // Write additional files
      if (additionalFiles) {
        for (const file of additionalFiles) {
          const filePath = path.join(repoPath, file.name);
          const buffer = await file.arrayBuffer();
          await fsPromises.writeFile(filePath, globalThis.Buffer.from(buffer));
        }
      }
      
      // Replace placeholders in template files (while still in .git directory)
      await this.replacePlaceholders(repoPath, {
        uuid,
        title,
        type,
        dreamTalk: dreamTalkPath ? dreamTalk!.name : ''
      });
      
      // Make initial commit (will trigger pre-commit hook to move files)
      console.log(`GitDreamNodeService: Starting git operations in ${repoPath}`);
      
      // Add all files
      const addResult = await execAsync('git add -A', { cwd: repoPath });
      console.log(`GitDreamNodeService: Git add result:`, addResult);
      
      // Make the initial commit (this triggers the pre-commit hook)
      const commitResult = await execAsync(`git commit -m "Initialize DreamNode: ${title}"`, { cwd: repoPath });
      console.log(`GitDreamNodeService: Git commit result:`, commitResult);
      
      console.log(`GitDreamNodeService: Git repository created successfully at ${repoPath}`);
    } catch (error) {
      console.error('Failed to create git repository:', error);
      throw error;
    }
  }
  
  /**
   * Replace template placeholders in files
   */
  private async replacePlaceholders(
    repoPath: string,
    values: {
      uuid: string;
      title: string;
      type: string;
      dreamTalk: string;
    }
  ): Promise<void> {
    // Update the udd file while it's still in the .git directory
    // The pre-commit hook will move it to .udd in the working directory
    const uddPath = path.join(repoPath, '.git', 'udd');
    console.log(`GitDreamNodeService: Updating template file at ${uddPath}`);
    
    let uddContent = await fsPromises.readFile(uddPath, 'utf-8');
    
    uddContent = uddContent
      .replace('TEMPLATE_UUID_PLACEHOLDER', values.uuid)
      .replace('TEMPLATE_TITLE_PLACEHOLDER', values.title)
      .replace('"type": "dream"', `"type": "${values.type}"`)
      .replace('TEMPLATE_DREAMTALK_PLACEHOLDER', values.dreamTalk);
    
    await fsPromises.writeFile(uddPath, uddContent);
    console.log(`GitDreamNodeService: Updated template metadata`);
    
    // Update README.md (also in .git directory initially)
    const readmePath = path.join(repoPath, '.git', 'README.md');
    if (await this.fileExists(readmePath)) {
      let readmeContent = await fsPromises.readFile(readmePath, 'utf-8');
      readmeContent = readmeContent.replace(/TEMPLATE_TITLE_PLACEHOLDER/g, values.title);
      await fsPromises.writeFile(readmePath, readmeContent);
      console.log(`GitDreamNodeService: Updated README.md template`);
    }
  }
  
  /**
   * Check if a directory is a valid DreamNode
   */
  private async isValidDreamNode(dirPath: string): Promise<boolean> {
    try {
      // Check for .git directory
      const gitPath = path.join(dirPath, '.git');
      const gitExists = await this.fileExists(gitPath);
      
      // Check for .udd file
      const uddPath = path.join(dirPath, '.udd');
      const uddExists = await this.fileExists(uddPath);
      
      return gitExists && uddExists;
    } catch {
      return false;
    }
  }
  
  /**
   * Add node from vault to store
   */
  private async addNodeFromVault(dirPath: string, udd: UDDFile, repoName: string): Promise<void> {
    // Load dreamTalk media if specified
    let dreamTalkMedia: Array<{
      path: string;
      absolutePath: string;
      type: string;
      data: string;
      size: number;
    }> = [];
    
    if (udd.dreamTalk) {
      const mediaPath = path.join(dirPath, udd.dreamTalk);
      if (await this.fileExists(mediaPath)) {
        const stats = await fsPromises.stat(mediaPath);
        const mimeType = this.getMimeType(udd.dreamTalk);
        const dataUrl = await this.filePathToDataUrl(mediaPath);
        
        dreamTalkMedia = [{
          path: udd.dreamTalk,
          absolutePath: mediaPath,
          type: mimeType,
          data: dataUrl,
          size: stats.size
        }];
      }
    }
    
    // Create node with random position
    const node: DreamNode = {
      id: udd.uuid,
      type: udd.type,
      name: udd.title,
      position: this.calculateNewNodePosition(),
      dreamTalkMedia,
      dreamSongContent: [],
      liminalWebConnections: udd.liminalWebRelationships || [],
      repoPath: repoName,
      hasUnsavedChanges: false
    };
    
    // Add to store
    const store = useInterBrainStore.getState();
    let fileHash: string | undefined;
    if (dreamTalkMedia.length > 0 && udd.dreamTalk) {
      const mediaPath = path.join(dirPath, udd.dreamTalk);
      fileHash = await this.calculateFileHashFromPath(mediaPath);
    }
    store.updateRealNode(udd.uuid, {
      node,
      fileHash,
      lastSynced: Date.now()
    });
  }
  
  /**
   * Update node from vault if changed
   */
  private async updateNodeFromVault(
    existingData: RealNodeData,
    dirPath: string,
    udd: UDDFile
  ): Promise<boolean> {
    let updated = false;
    const node = { ...existingData.node };
    
    // Check metadata changes
    if (node.name !== udd.title || node.type !== udd.type) {
      node.name = udd.title;
      node.type = udd.type;
      updated = true;
    }
    
    // Check dreamTalk changes
    if (udd.dreamTalk) {
      const mediaPath = path.join(dirPath, udd.dreamTalk);
      if (await this.fileExists(mediaPath)) {
        const newHash = await this.calculateFileHashFromPath(mediaPath);
        
        if (newHash !== existingData.fileHash) {
          // File changed - reload
          const stats = await fsPromises.stat(mediaPath);
          const mimeType = this.getMimeType(udd.dreamTalk);
          const dataUrl = await this.filePathToDataUrl(mediaPath);
          
          node.dreamTalkMedia = [{
            path: udd.dreamTalk,
            absolutePath: mediaPath,
            type: mimeType,
            data: dataUrl,
            size: stats.size
          }];
          
          existingData.fileHash = newHash;
          updated = true;
        }
      }
    }
    
    // Update store if changed
    if (updated) {
      const store = useInterBrainStore.getState();
      store.updateRealNode(node.id, {
        node,
        fileHash: existingData.fileHash,
        lastSynced: Date.now()
      });
    }
    
    return updated;
  }
  
  /**
   * Update .udd file with node data
   */
  private async updateUDDFile(node: DreamNode): Promise<void> {
    const uddPath = path.join(this.vaultPath, node.repoPath, '.udd');
    
    const udd: UDDFile = {
      uuid: node.id,
      title: node.name,
      type: node.type,
      dreamTalk: node.dreamTalkMedia.length > 0 ? node.dreamTalkMedia[0].path : '',
      liminalWebRelationships: node.liminalWebConnections || [],
      submodules: [],
      supermodules: []
    };
    
    await fsPromises.writeFile(uddPath, JSON.stringify(udd, null, 2));
  }
  
  /**
   * Helper utilities
   */
  private async fileExists(path: string): Promise<boolean> {
    try {
      await fsPromises.access(path);
      return true;
    } catch {
      return false;
    }
  }
  
  private sanitizeRepoName(title: string): string {
    return title
      .replace(/[^a-zA-Z0-9-_\s]/g, '-') // Allow letters, numbers, hyphens, underscores, and spaces
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
      .substring(0, 50); // Limit length
  }
  
  private calculateNewNodePosition(): [number, number, number] {
    const sphereRadius = 5000;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    
    const x = sphereRadius * Math.sin(phi) * Math.cos(theta);
    const y = sphereRadius * Math.sin(phi) * Math.sin(theta);
    const z = sphereRadius * Math.cos(phi);
    
    return [x, y, z];
  }
  
  private async fileToDataUrl(file: globalThis.File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new globalThis.FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  
  private async filePathToDataUrl(filePath: string): Promise<string> {
    const buffer = await fsPromises.readFile(filePath);
    const mimeType = this.getMimeType(filePath);
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  }
  
  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
  
  private async calculateFileHash(file: globalThis.File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hash = crypto.createHash('sha256');
    hash.update(globalThis.Buffer.from(buffer));
    return hash.digest('hex');
  }
  
  private async calculateFileHashFromPath(filePath: string): Promise<string> {
    const buffer = await fsPromises.readFile(filePath);
    const hash = crypto.createHash('sha256');
    hash.update(buffer);
    return hash.digest('hex');
  }
  
  /**
   * Add files to an existing DreamNode
   */
  async addFilesToNode(nodeId: string, files: globalThis.File[]): Promise<void> {
    const store = useInterBrainStore.getState();
    const nodeData = store.realNodes.get(nodeId);
    
    if (!nodeData) {
      throw new Error(`DreamNode with ID ${nodeId} not found`);
    }
    
    const node = nodeData.node;
    const repoPath = path.join(this.vaultPath, node.repoPath);
    
    // Separate media and other files
    const mediaFiles = files.filter(f => this.isMediaFile(f));
    const otherFiles = files.filter(f => !this.isMediaFile(f));
    
    // Update dreamTalk if media provided
    if (mediaFiles.length > 0) {
      const primaryMedia = mediaFiles[0];
      const dataUrl = await this.fileToDataUrl(primaryMedia);
      
      node.dreamTalkMedia = [{
        path: primaryMedia.name,
        absolutePath: path.join(repoPath, primaryMedia.name),
        type: primaryMedia.type,
        data: dataUrl,
        size: primaryMedia.size
      }];
      
      // Write file to disk
      const buffer = await primaryMedia.arrayBuffer();
      await fsPromises.writeFile(
        path.join(repoPath, primaryMedia.name),
        globalThis.Buffer.from(buffer)
      );
      
      // Update file hash
      nodeData.fileHash = await this.calculateFileHash(primaryMedia);
    }
    
    // Write other files
    for (const file of otherFiles) {
      const buffer = await file.arrayBuffer();
      await fsPromises.writeFile(
        path.join(repoPath, file.name),
        globalThis.Buffer.from(buffer)
      );
    }
    
    // Update store
    store.updateRealNode(nodeId, {
      ...nodeData,
      node,
      lastSynced: Date.now()
    });
    
    // Update .udd file
    await this.updateUDDFile(node);
    
    console.log(`GitDreamNodeService: Added ${files.length} files to ${nodeId}`);
  }
  
  private isMediaFile(file: globalThis.File): boolean {
    const validTypes = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm'
    ];
    
    return validTypes.includes(file.type);
  }
  
  /**
   * Reset all data (clears store but not disk)
   */
  reset(): void {
    const store = useInterBrainStore.getState();
    store.setRealNodes(new Map());
    console.log('GitDreamNodeService: Reset store data');
  }
  
  /**
   * Get statistics
   */
  getStats() {
    const store = useInterBrainStore.getState();
    const nodes = Array.from(store.realNodes.values()).map(d => d.node);
    
    return {
      totalNodes: nodes.length,
      dreamNodes: nodes.filter(n => n.type === 'dream').length,
      dreamerNodes: nodes.filter(n => n.type === 'dreamer').length,
      nodesWithMedia: nodes.filter(n => n.dreamTalkMedia.length > 0).length
    };
  }
  
  /**
   * Check git status for a repository
   */
  private async checkGitStatus(repoPath: string): Promise<GitStatus> {
    try {
      const fullPath = path.join(this.vaultPath, repoPath);
      
      // Check if git repository exists
      const gitDir = path.join(fullPath, '.git');
      if (!await this.fileExists(gitDir)) {
        // No git repo yet, return clean state
        return {
          hasUncommittedChanges: false,
          hasStashedChanges: false,
          lastChecked: Date.now()
        };
      }
      
      // Check for uncommitted changes
      const statusResult = await execAsync('git status --porcelain', { cwd: fullPath });
      const hasUncommittedChanges = statusResult.stdout.trim().length > 0;
      
      // Check for stashed changes
      const stashResult = await execAsync('git stash list', { cwd: fullPath });
      const hasStashedChanges = stashResult.stdout.trim().length > 0;
      
      // Count different types of changes for details
      let details;
      if (hasUncommittedChanges || hasStashedChanges) {
        const statusLines = statusResult.stdout.trim().split('\n').filter((line: string) => line.length > 0);
        const staged = statusLines.filter((line: string) => line.charAt(0) !== ' ' && line.charAt(0) !== '?').length;
        const unstaged = statusLines.filter((line: string) => line.charAt(1) !== ' ').length;
        const untracked = statusLines.filter((line: string) => line.startsWith('??')).length;
        const stashCount = hasStashedChanges ? stashResult.stdout.trim().split('\n').length : 0;
        
        details = { staged, unstaged, untracked, stashCount };
      }
      
      return {
        hasUncommittedChanges,
        hasStashedChanges,
        lastChecked: Date.now(),
        details
      };
      
    } catch (error) {
      console.warn(`Failed to check git status for ${repoPath}:`, error);
      // Return clean state on error
      return {
        hasUncommittedChanges: false,
        hasStashedChanges: false,
        lastChecked: Date.now()
      };
    }
  }
}