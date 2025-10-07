import { DreamNode, UDDFile, GitStatus } from '../types/dreamnode';
import { useInterBrainStore, RealNodeData } from '../store/interbrain-store';
import { Plugin } from 'obsidian';
import { indexingService } from '../features/semantic-search/services/indexing-service';
import { UrlMetadata, generateYouTubeIframe, generateMarkdownLink } from '../utils/url-utils';
import { createLinkFileContent, getLinkFileName } from '../utils/link-file-utils';

// Access Node.js modules directly in Electron context
 
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
 

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
       
      vaultPath = (adapter.path as any).path || (adapter.path as any).basePath || '';
    }
    
    this.vaultPath = vaultPath;
    
    // Template is packaged with the plugin
    // Get the plugin directory path from Obsidian's plugin manifest
    if (this.vaultPath) {
      const pluginDir = path.join(this.vaultPath, '.obsidian', 'plugins', plugin.manifest.id);
      this.templatePath = path.join(pluginDir, 'DreamNode-template');
    } else {
      // Fallback - try to get plugin directory from plugin object
      // @ts-ignore - accessing private plugin properties
      const adapter = plugin.app?.vault?.adapter as { basePath?: string };
      const pluginDir = adapter?.basePath ?
        path.join(adapter.basePath, '.obsidian', 'plugins', plugin.manifest.id) :
        './DreamNode-template';
      this.templatePath = path.join(pluginDir, 'DreamNode-template');
      console.warn('GitDreamNodeService: Could not determine vault path, using fallback template path:', this.templatePath);
    }
    
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
      gitStatus: await this.checkGitStatus(repoPath),
      email: undefined,
      phone: undefined
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
      .then(async () => {
        // Index the new node after git repository is created
        try {
          await indexingService.indexNode(node);
          console.log(`GitDreamNodeService: Indexed new node "${title}"`);
        } catch (error) {
          console.error('Failed to index new node:', error);
          // Don't fail the creation if indexing fails
        }
      })
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
    
    const originalNode = nodeData.node;
    let updatedNode = { ...originalNode, ...changes };
    
    // Handle folder renaming if name changed
    if (changes.name && changes.name !== originalNode.name) {
      const newRepoName = this.generateRepoName(changes.name, originalNode.type, id);
      const oldRepoPath = path.join(this.vaultPath, originalNode.repoPath);
      const newRepoPath = path.join(this.vaultPath, newRepoName);
      
      // Only rename if the paths are actually different
      if (oldRepoPath !== newRepoPath) {
        // Check if target name already exists
        if (await this.fileExists(newRepoPath)) {
          throw new Error(`A DreamNode with the name "${changes.name}" already exists. Please choose a different name.`);
        }
        
        try {
          // Check if source exists
          if (!await this.fileExists(oldRepoPath)) {
            console.warn(`GitDreamNodeService: Source folder doesn't exist: ${oldRepoPath}`);
            // Just update the repoPath without renaming
            updatedNode = { ...updatedNode, repoPath: newRepoName };
          } else {
            // Rename the folder
            await fsPromises.rename(oldRepoPath, newRepoPath);
            
            // Update repoPath in the node
            updatedNode = { ...updatedNode, repoPath: newRepoName };
            
            console.log(`GitDreamNodeService: Renamed folder from "${originalNode.repoPath}" to "${newRepoName}"`);
          }
        } catch (error) {
          console.error(`Failed to rename folder for node ${id}:`, error);
          throw new Error(`Failed to rename DreamNode folder: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }
    
    // Update in store
    store.updateRealNode(id, {
      ...nodeData,
      node: updatedNode,
      lastSynced: Date.now()
    });
    
    // If metadata changed, update .udd file and auto-commit
    if (changes.name || changes.type || changes.dreamTalkMedia || changes.email !== undefined || changes.phone !== undefined) {
      await this.updateUDDFile(updatedNode);

      // Auto-commit changes if enabled (only for actual file changes, not position)
      await this.autoCommitChanges(updatedNode, changes);
    }
    
    console.log(`GitDreamNodeService: Updated node ${id}`, changes);
  }
  
  /**
   * Delete a DreamNode and its git repository
   */
  async delete(id: string): Promise<void> {
    const store = useInterBrainStore.getState();
    const nodeData = store.realNodes.get(id);
    
    if (!nodeData) {
      throw new Error(`DreamNode with ID ${id} not found`);
    }
    
    const nodeName = nodeData.node.name;
    const repoPath = nodeData.node.repoPath;
    const fullRepoPath = path.join(this.vaultPath, repoPath);
    
    try {
      // Delete the actual git repository from disk
      console.log(`GitDreamNodeService: Deleting git repository at ${fullRepoPath}`);
      
      // Use recursive removal to delete the entire directory
      await fsPromises.rm(fullRepoPath, { recursive: true, force: true });
      
      console.log(`GitDreamNodeService: Successfully deleted git repository for ${nodeName}`);
    } catch (error) {
      console.error(`GitDreamNodeService: Failed to delete git repository for ${nodeName}:`, error);
      throw new Error(`Failed to delete git repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    // Remove from store only after successful deletion
    store.deleteRealNode(id);
    
    console.log(`GitDreamNodeService: Deleted node ${nodeName} (${id})`);
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
          const updated = await this.updateNodeFromVault(existingData, dirPath, udd, dir.name);
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
      // Escape the title to handle quotes and special characters
      const escapedTitle = title.replace(/"/g, '\\"');
      const commitResult = await execAsync(`git commit -m "Initialize DreamNode: ${escapedTitle}"`, { cwd: repoPath });
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
      hasUnsavedChanges: false,
      email: udd.email,
      phone: udd.phone
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
    udd: UDDFile,
    repoName: string
  ): Promise<boolean> {
    let updated = false;
    const node = { ...existingData.node };

    // CRITICAL: Sync repoPath with actual directory name (handles Radicle clone renames)
    if (node.repoPath !== repoName) {
      console.log(`📁 [GitDreamNodeService] Syncing repoPath: "${node.repoPath}" → "${repoName}"`);
      node.repoPath = repoName;
      updated = true;
    }

    // Check metadata changes
    if (node.name !== udd.title || node.type !== udd.type || node.email !== udd.email || node.phone !== udd.phone) {
      node.name = udd.title;
      node.type = udd.type;
      node.email = udd.email;
      node.phone = udd.phone;
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

    // Include contact fields only for dreamer nodes
    if (node.type === 'dreamer') {
      if (node.email) udd.email = node.email;
      if (node.phone) udd.phone = node.phone;
    }

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
  
  private generateRepoName(title: string, _type: string, _nodeId: string): string {
    const sanitized = this.sanitizeRepoName(title);
    // For updates, we can use the same sanitization approach
    // If we need uniqueness, we could append a short hash of nodeId
    return sanitized;
  }
  
  
  /**
   * Auto-commit changes if they are significant
   */
  private async autoCommitChanges(node: DreamNode, changes: Partial<DreamNode>): Promise<void> {
    try {
      const repoPath = path.join(this.vaultPath, node.repoPath);
      
      // Check if there are any changes to commit
      const statusResult = await execAsync('git status --porcelain', { cwd: repoPath });
      if (statusResult.stdout.trim().length === 0) {
        return; // No changes to commit
      }
      
      // Create commit message based on changes
      const changeTypes = [];
      if (changes.name) changeTypes.push(`rename to "${changes.name}"`);
      if (changes.type) changeTypes.push(`change type to ${changes.type}`);
      if (changes.dreamTalkMedia) changeTypes.push('update media');
      
      const commitMessage = changeTypes.length > 0 
        ? `Update DreamNode: ${changeTypes.join(', ')}`
        : 'Update DreamNode metadata';
      
      // Stage and commit changes
      await execAsync('git add -A', { cwd: repoPath });
      // Escape the commit message to handle quotes and special characters
      const escapedMessage = commitMessage.replace(/"/g, '\\"');
      await execAsync(`git commit -m "${escapedMessage}"`, { cwd: repoPath });
      
      console.log(`GitDreamNodeService: Auto-committed changes for ${node.name}: ${commitMessage}`);
      
      // Refresh git status after commit
      const newGitStatus = await this.checkGitStatus(node.repoPath);
      
      // Update store with new git status
      const store = useInterBrainStore.getState();
      const nodeData = store.realNodes.get(node.id);
      if (nodeData) {
        store.updateRealNode(node.id, {
          ...nodeData,
          node: { ...node, gitStatus: newGitStatus },
          lastSynced: Date.now()
        });
      }
      
    } catch (error) {
      console.error(`Failed to auto-commit changes for node ${node.id}:`, error);
      // Don't throw - auto-commit failure shouldn't break the update
    }
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
      'video/webm',
      'audio/mp3',
      'audio/wav',
      'audio/ogg',
      'application/pdf',
      // .link files appear as text/plain or application/octet-stream depending on system
      'text/plain',
      'application/octet-stream'
    ];

    // Also check file extension for .link files since MIME detection is unreliable
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.link')) {
      return true;
    }

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
   * Refresh git status for all nodes (implements IDreamNodeService)
   */
  async refreshGitStatus(): Promise<{ updated: number; errors: number }> {
    return await this.refreshAllGitStatus();
  }
  
  /**
   * Internal method to refresh git status for all nodes
   */
  private async refreshAllGitStatus(): Promise<{ updated: number; errors: number }> {
    const store = useInterBrainStore.getState();
    const nodes = Array.from(store.realNodes.entries());
    
    let updated = 0;
    let errors = 0;
    
    console.log(`GitDreamNodeService: Refreshing git status for ${nodes.length} nodes...`);
    
    for (const [nodeId, nodeData] of nodes) {
      try {
        const newGitStatus = await this.checkGitStatus(nodeData.node.repoPath);
        const oldGitStatus = nodeData.node.gitStatus;
        
        // Check if git status actually changed
        const statusChanged = !oldGitStatus || 
          oldGitStatus.hasUncommittedChanges !== newGitStatus.hasUncommittedChanges ||
          oldGitStatus.hasStashedChanges !== newGitStatus.hasStashedChanges ||
          oldGitStatus.hasUnpushedChanges !== newGitStatus.hasUnpushedChanges;
        
        // Check if commit hash changed (new commit detected)
        const oldCommitHash = oldGitStatus?.details?.commitHash;
        const newCommitHash = newGitStatus.details?.commitHash;
        const commitChanged = oldCommitHash && newCommitHash && oldCommitHash !== newCommitHash;
        
        if (statusChanged || commitChanged) {
          // Update the node with new git status
          const updatedNode = {
            ...nodeData.node,
            gitStatus: newGitStatus
          };
          
          store.updateRealNode(nodeId, {
            ...nodeData,
            node: updatedNode,
            lastSynced: Date.now()
          });
          
          updated++;
          console.log(`GitDreamNodeService: Updated git status for ${updatedNode.name}: uncommitted=${newGitStatus.hasUncommittedChanges}, stashed=${newGitStatus.hasStashedChanges}, unpushed=${newGitStatus.hasUnpushedChanges}`);
          
          // Trigger re-indexing if commit changed (meaningful content change)
          if (commitChanged && !newGitStatus.hasUncommittedChanges) {
            // Only re-index if the node is clean (committed changes)
            try {
              await indexingService.indexNode(updatedNode);
              console.log(`GitDreamNodeService: Re-indexed node "${updatedNode.name}" after commit change`);
            } catch (error) {
              console.error(`Failed to re-index node ${updatedNode.name}:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`GitDreamNodeService: Failed to refresh git status for node ${nodeId}:`, error);
        errors++;
      }
    }
    
    console.log(`GitDreamNodeService: Git status refresh complete. Updated: ${updated}, Errors: ${errors}`);
    return { updated, errors };
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
          hasUnpushedChanges: false,
          lastChecked: Date.now()
        };
      }
      
      // Get current commit hash
      let commitHash: string | undefined;
      try {
        const hashResult = await execAsync('git rev-parse HEAD', { cwd: fullPath });
        commitHash = hashResult.stdout.trim();
      } catch {
        // No commits yet
        console.log(`GitDreamNodeService: No commits yet in ${repoPath}`);
      }
      
      // Check for uncommitted changes
      const statusResult = await execAsync('git status --porcelain', { cwd: fullPath });
      const hasUncommittedChanges = statusResult.stdout.trim().length > 0;
      
      // Check for stashed changes
      const stashResult = await execAsync('git stash list', { cwd: fullPath });
      const hasStashedChanges = stashResult.stdout.trim().length > 0;
      
      // Check for unpushed commits (ahead of remote) using git status
      let hasUnpushedChanges = false;
      let aheadCount = 0;
      try {
        // Use git status --porcelain=v1 --branch to get ahead/behind info
        const statusBranchResult = await execAsync('git status --porcelain=v1 --branch', { cwd: fullPath });
        const branchLine = statusBranchResult.stdout.split('\n')[0];
        
        // Look for "ahead N" in the branch line
        // Format: "## branch...origin/branch [ahead N, behind M]" or "## branch...origin/branch [ahead N]"
        const aheadMatch = branchLine.match(/\[ahead (\d+)/);
        if (aheadMatch) {
          aheadCount = parseInt(aheadMatch[1], 10);
          hasUnpushedChanges = aheadCount > 0;
          console.log(`GitDreamNodeService: Found ${aheadCount} unpushed commits in ${repoPath}`);
        } else {
          console.log(`GitDreamNodeService: No ahead commits detected in ${repoPath}, branch line: ${branchLine}`);
        }
      } catch (error) {
        // No upstream or git error, assume no unpushed commits
        console.log(`GitDreamNodeService: Git status error for ${repoPath}:`, error instanceof Error ? error.message : 'Unknown error');
      }
      
      // Count different types of changes for details
      let details;
      if (hasUncommittedChanges || hasStashedChanges || hasUnpushedChanges || commitHash) {
        const statusLines = statusResult.stdout.trim().split('\n').filter((line: string) => line.length > 0);
        const staged = statusLines.filter((line: string) => line.charAt(0) !== ' ' && line.charAt(0) !== '?').length;
        const unstaged = statusLines.filter((line: string) => line.charAt(1) !== ' ').length;
        const untracked = statusLines.filter((line: string) => line.startsWith('??')).length;
        const stashCount = hasStashedChanges ? stashResult.stdout.trim().split('\n').length : 0;
        
        details = { staged, unstaged, untracked, stashCount, aheadCount, commitHash };
      }
      
      return {
        hasUncommittedChanges,
        hasStashedChanges,
        hasUnpushedChanges,
        lastChecked: Date.now(),
        details
      };
      
    } catch (error) {
      console.warn(`Failed to check git status for ${repoPath}:`, error);
      // Return clean state on error
      return {
        hasUncommittedChanges: false,
        hasStashedChanges: false,
        hasUnpushedChanges: false,
        lastChecked: Date.now()
      };
    }
  }

  // Relationship management methods
  
  /**
   * Update relationships for a node (bidirectional)
   */
  async updateRelationships(nodeId: string, relationshipIds: string[]): Promise<void> {
    const store = useInterBrainStore.getState();
    const nodeData = store.realNodes.get(nodeId);
    
    if (!nodeData) {
      throw new Error(`DreamNode with ID ${nodeId} not found`);
    }

    const node = nodeData.node;
    
    // Get current relationships
    const currentRelationships = new Set(node.liminalWebConnections || []);
    const newRelationships = new Set(relationshipIds);

    // Find added and removed relationships
    const added = relationshipIds.filter(id => !currentRelationships.has(id));
    const removed = Array.from(currentRelationships).filter(id => !newRelationships.has(id));

    // Update the node's relationships
    node.liminalWebConnections = relationshipIds;

    // Update bidirectional relationships
    for (const addedId of added) {
      await this.addBidirectionalRelationshipReal(nodeId, addedId);
    }

    for (const removedId of removed) {
      await this.removeBidirectionalRelationshipReal(nodeId, removedId);
    }

    // Update store
    store.updateRealNode(nodeId, {
      ...nodeData,
      node,
      lastSynced: Date.now()
    });

    // Update .udd file
    await this.updateUDDFile(node);

    console.log(`GitDreamNodeService: Updated relationships for ${nodeId}:`, {
      added: added.length,
      removed: removed.length,
      total: relationshipIds.length
    });
  }

  /**
   * Get relationships for a node
   */
  async getRelationships(nodeId: string): Promise<string[]> {
    const store = useInterBrainStore.getState();
    const nodeData = store.realNodes.get(nodeId);
    
    if (!nodeData) {
      throw new Error(`DreamNode with ID ${nodeId} not found`);
    }
    
    return nodeData.node.liminalWebConnections || [];
  }

  /**
   * Add a single relationship (bidirectional)
   */
  async addRelationship(nodeId: string, relatedNodeId: string): Promise<void> {
    const store = useInterBrainStore.getState();
    const nodeData = store.realNodes.get(nodeId);
    
    if (!nodeData) {
      throw new Error(`DreamNode with ID ${nodeId} not found`);
    }

    const node = nodeData.node;
    const relationships = new Set(node.liminalWebConnections || []);
    relationships.add(relatedNodeId);
    node.liminalWebConnections = Array.from(relationships);

    // Add bidirectional relationship
    await this.addBidirectionalRelationshipReal(nodeId, relatedNodeId);

    // Update store
    store.updateRealNode(nodeId, {
      ...nodeData,
      node,
      lastSynced: Date.now()
    });

    // Update .udd file
    await this.updateUDDFile(node);

    console.log(`GitDreamNodeService: Added relationship ${nodeId} <-> ${relatedNodeId}`);
  }

  /**
   * Remove a single relationship (bidirectional)
   */
  async removeRelationship(nodeId: string, relatedNodeId: string): Promise<void> {
    const store = useInterBrainStore.getState();
    const nodeData = store.realNodes.get(nodeId);
    
    if (!nodeData) {
      throw new Error(`DreamNode with ID ${nodeId} not found`);
    }

    const node = nodeData.node;
    const relationships = new Set(node.liminalWebConnections || []);
    relationships.delete(relatedNodeId);
    node.liminalWebConnections = Array.from(relationships);

    // Remove bidirectional relationship
    await this.removeBidirectionalRelationshipReal(nodeId, relatedNodeId);

    // Update store
    store.updateRealNode(nodeId, {
      ...nodeData,
      node,
      lastSynced: Date.now()
    });

    // Update .udd file
    await this.updateUDDFile(node);

    console.log(`GitDreamNodeService: Removed relationship ${nodeId} <-> ${relatedNodeId}`);
  }

  /**
   * Add bidirectional relationship (internal helper)
   */
  private async addBidirectionalRelationshipReal(nodeId: string, relatedNodeId: string): Promise<void> {
    const store = useInterBrainStore.getState();
    const relatedNodeData = store.realNodes.get(relatedNodeId);
    
    if (relatedNodeData) {
      const relatedNode = relatedNodeData.node;
      const relatedRelationships = new Set(relatedNode.liminalWebConnections || []);
      relatedRelationships.add(nodeId);
      relatedNode.liminalWebConnections = Array.from(relatedRelationships);

      // Update store
      store.updateRealNode(relatedNodeId, {
        ...relatedNodeData,
        node: relatedNode,
        lastSynced: Date.now()
      });

      // Update .udd file
      await this.updateUDDFile(relatedNode);
    }
  }

  /**
   * Remove bidirectional relationship (internal helper)
   */
  private async removeBidirectionalRelationshipReal(nodeId: string, relatedNodeId: string): Promise<void> {
    const store = useInterBrainStore.getState();
    const relatedNodeData = store.realNodes.get(relatedNodeId);
    
    if (relatedNodeData) {
      const relatedNode = relatedNodeData.node;
      const relatedRelationships = new Set(relatedNode.liminalWebConnections || []);
      relatedRelationships.delete(nodeId);
      relatedNode.liminalWebConnections = Array.from(relatedRelationships);

      // Update store
      store.updateRealNode(relatedNodeId, {
        ...relatedNodeData,
        node: relatedNode,
        lastSynced: Date.now()
      });

      // Update .udd file
      await this.updateUDDFile(relatedNode);
    }
  }

  /**
   * Create a DreamNode from URL metadata
   */
  async createFromUrl(
    title: string,
    type: 'dream' | 'dreamer',
    urlMetadata: UrlMetadata,
    position?: [number, number, number]
  ): Promise<DreamNode> {
    // Use provided position or calculate random position
    const nodePosition = position
      ? position // Position is already calculated in world coordinates
      : this.calculateNewNodePosition();

    // Create node using existing create method without files
    const node = await this.create(title, type, undefined, nodePosition);

    // Generate .link file name and content
    const linkFileName = getLinkFileName(urlMetadata, title);
    const linkFileContent = createLinkFileContent(urlMetadata, title);

    console.log(`🔗 [GitDreamNodeService] Creating link file:`, {
      linkFileName,
      linkFilePath: path.join(this.vaultPath, node.repoPath, linkFileName),
      contentLength: linkFileContent.length,
      contentPreview: linkFileContent.substring(0, 100)
    });

    // Write .link file to repository
    const linkFilePath = path.join(this.vaultPath, node.repoPath, linkFileName);
    await fsPromises.writeFile(linkFilePath, linkFileContent);

    console.log(`🔗 [GitDreamNodeService] Link file written successfully:`, linkFilePath);

    // Update dreamTalk media to reference the .link file
    node.dreamTalkMedia = [{
      path: linkFileName,
      absolutePath: linkFilePath,
      type: urlMetadata.type,
      data: linkFileContent, // Store link metadata as data
      size: linkFileContent.length
    }];

    // Create README content with URL
    const readmeContent = this.createUrlReadmeContent(urlMetadata, title);
    await this.writeReadmeFile(node.repoPath, readmeContent);

    // Update .udd file with .link file path
    await this.updateUDDFile(node);

    console.log(`GitDreamNodeService: Created ${type} "${title}" from URL (${urlMetadata.type})`);
    console.log(`GitDreamNodeService: Created .link file: ${linkFileName}`);
    console.log(`GitDreamNodeService: URL: ${urlMetadata.url}`);
    return node;
  }

  /**
   * Add URL to an existing DreamNode
   */
  async addUrlToNode(nodeId: string, urlMetadata: UrlMetadata): Promise<void> {
    const store = useInterBrainStore.getState();
    const nodeData = store.realNodes.get(nodeId);

    if (!nodeData) {
      throw new Error(`DreamNode with ID ${nodeId} not found`);
    }

    const node = nodeData.node;

    // Generate .link file name and content
    const linkFileName = getLinkFileName(urlMetadata, node.name);
    const linkFileContent = createLinkFileContent(urlMetadata, node.name);

    console.log(`🔗 [GitDreamNodeService] Adding link file to existing node:`, {
      linkFileName,
      linkFilePath: path.join(this.vaultPath, node.repoPath, linkFileName),
      contentLength: linkFileContent.length,
      contentPreview: linkFileContent.substring(0, 100)
    });

    // Write .link file to repository
    const linkFilePath = path.join(this.vaultPath, node.repoPath, linkFileName);
    await fsPromises.writeFile(linkFilePath, linkFileContent);

    console.log(`🔗 [GitDreamNodeService] Link file added successfully:`, linkFilePath);

    // Add .link file as additional dreamTalk media
    const linkMedia = {
      path: linkFileName,
      absolutePath: linkFilePath,
      type: urlMetadata.type,
      data: linkFileContent,
      size: linkFileContent.length
    };

    node.dreamTalkMedia.push(linkMedia);

    // Append URL content to README
    const urlContent = this.createUrlReadmeContent(urlMetadata);
    const readmePath = path.join(this.vaultPath, node.repoPath, 'README.md');

    try {
      // Read existing README content
      const existingContent = await fsPromises.readFile(readmePath, 'utf8');
      const newContent = existingContent + '\n\n' + urlContent;
      await fsPromises.writeFile(readmePath, newContent);
    } catch (error) {
      console.warn(`Failed to update README for node ${nodeId}:`, error);
      // Create new README if it doesn't exist
      await this.writeReadmeFile(node.repoPath, urlContent);
    }

    // Update .udd file
    await this.updateUDDFile(node);

    // Update store
    store.updateRealNode(nodeId, {
      ...nodeData,
      node,
      lastSynced: Date.now()
    });

    console.log(`GitDreamNodeService: Added URL (${urlMetadata.type}) to node ${nodeId}: ${urlMetadata.url}`);
    console.log(`GitDreamNodeService: Created .link file: ${linkFileName}`);
  }

  /**
   * Create README content for URLs
   */
  private createUrlReadmeContent(urlMetadata: UrlMetadata, title?: string): string {
    let content = '';

    if (title) {
      content += `# ${title}\n\n`;
    }

    if (urlMetadata.type === 'youtube' && urlMetadata.videoId) {
      // Add YouTube iframe embed for Obsidian
      content += generateYouTubeIframe(urlMetadata.videoId, 560, 315);
      content += '\n\n';

      // Add markdown link as backup
      content += `[${urlMetadata.title || 'YouTube Video'}](${urlMetadata.url})`;
    } else {
      // For other URLs, add as markdown link
      content += generateMarkdownLink(urlMetadata.url, urlMetadata.title);
    }

    return content;
  }

  /**
   * Write README.md file to node repository
   */
  private async writeReadmeFile(repoPath: string, content: string): Promise<void> {
    const readmePath = path.join(this.vaultPath, repoPath, 'README.md');
    await fsPromises.writeFile(readmePath, content);
  }
}