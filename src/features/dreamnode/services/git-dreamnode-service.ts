import { DreamNode, UDDFile } from '../types/dreamnode';
import { useInterBrainStore, DreamNodeData } from '../../../core/store/interbrain-store';
import { Plugin } from 'obsidian';
import { indexingService } from '../../semantic-search/services/indexing-service';
import { UrlMetadata, writeLinkFile, writeUrlReadme, appendUrlToReadme } from '../../drag-and-drop';
import { sanitizeTitleToPascalCase } from '../utils/title-sanitization';
import { webLinkAnalyzerService } from '../../web-link-analyzer';
import { serviceManager } from '../../../core/services/service-manager';
import { GitOperationsService } from '../utils/git-operations';
import { UDDService } from './udd-service';

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
  private gitOpsService: GitOperationsService;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.gitOpsService = new GitOperationsService(plugin.app);
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
    
    // Template is packaged with the plugin in src/features/dreamnode/
    // Get the plugin directory path from Obsidian's plugin manifest
    if (this.vaultPath) {
      const pluginDir = path.join(this.vaultPath, '.obsidian', 'plugins', plugin.manifest.id);
      this.templatePath = path.join(pluginDir, 'src', 'features', 'dreamnode', 'DreamNode-template');
    } else {
      // Fallback - try to get plugin directory from plugin object
      // @ts-ignore - accessing private plugin properties
      const adapter = plugin.app?.vault?.adapter as { basePath?: string };
      const pluginDir = adapter?.basePath ?
        path.join(adapter.basePath, '.obsidian', 'plugins', plugin.manifest.id) :
        './src/features/dreamnode/DreamNode-template';
      this.templatePath = path.join(pluginDir, 'src', 'features', 'dreamnode', 'DreamNode-template');
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
    additionalFiles?: globalThis.File[],
    metadata?: { did?: string; email?: string; phone?: string }
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
    // Dreamer nodes start with InterBrain connection pre-populated
    const INTERBRAIN_UUID = '550e8400-e29b-41d4-a716-446655440000';
    const initialConnections = type === 'dreamer' ? [INTERBRAIN_UUID] : [];

    const node: DreamNode = {
      id: uuid,
      type,
      name: title,
      position: nodePosition,
      dreamTalkMedia,
      dreamSongContent: [],
      liminalWebConnections: initialConnections,
      repoPath: repoName, // Relative to vault
      hasUnsavedChanges: false,
      gitStatus: await this.gitOpsService.getGitStatus(repoPath),
      email: metadata?.email,
      phone: metadata?.phone,
      did: metadata?.did
    };
    
    // Update store immediately for snappy UI
    const store = useInterBrainStore.getState();
    const nodeData: DreamNodeData = {
      node,
      fileHash: dreamTalk ? await this.calculateFileHash(dreamTalk) : undefined,
      lastSynced: Date.now()
    };
    store.updateRealNode(uuid, nodeData);

    // Create git repository in parallel (non-blocking)
    this.createGitRepository(repoPath, uuid, title, type, dreamTalk, additionalFiles, metadata)
      .then(async () => {
        // Index the new node after git repository is created
        try {
          await indexingService.indexNode(node);
        } catch (error) {
          console.error('Failed to index new node:', error);
          // Don't fail the creation if indexing fails
        }
      })
      .catch(async (error) => {
        // Check if git repository actually exists (commit might have succeeded despite stderr)
        try {
          await execAsync('git rev-parse HEAD', { cwd: repoPath });
          // Repository created successfully (stderr from hook is normal)
        } catch {
          // Actually failed
          console.error('Failed to create git repository:', error);
        }
      });

    // InterBrain relationship is already set up for Dreamer nodes:
    // 1. node.liminalWebConnections initialized with [INTERBRAIN_UUID]
    // 2. liminal-web.json created with { relationships: [INTERBRAIN_UUID] }
    // No need for separate auto-link - everything is atomic in initial creation

    return node;
  }
  
  /**
   * Update an existing DreamNode
   */
  async update(id: string, changes: Partial<DreamNode>): Promise<void> {
    const store = useInterBrainStore.getState();
    const nodeData = store.dreamNodes.get(id);
    
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
    if (changes.name || changes.type || changes.dreamTalkMedia || changes.email !== undefined || changes.phone !== undefined || changes.did !== undefined) {
      await this.updateUDDFile(updatedNode);

      // Auto-commit changes if enabled (only for actual file changes, not position)
      await this.autoCommitChanges(updatedNode, changes);
    }
    
  }
  
  /**
   * Delete a DreamNode and its git repository
   */
  async delete(id: string): Promise<void> {
    const store = useInterBrainStore.getState();
    const nodeData = store.dreamNodes.get(id);
    
    if (!nodeData) {
      throw new Error(`DreamNode with ID ${id} not found`);
    }
    
    const nodeName = nodeData.node.name;
    const repoPath = nodeData.node.repoPath;
    const fullRepoPath = path.join(this.vaultPath, repoPath);
    
    try {
      // Delete the actual git repository from disk
      
      // Use recursive removal to delete the entire directory
      await fsPromises.rm(fullRepoPath, { recursive: true, force: true });
      
    } catch (error) {
      console.error(`GitDreamNodeService: Failed to delete git repository for ${nodeName}:`, error);
      throw new Error(`Failed to delete git repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    // Remove from store only after successful deletion
    store.deleteRealNode(id);
    
  }
  
  /**
   * List all DreamNodes from store
   */
  async list(): Promise<DreamNode[]> {
    const store = useInterBrainStore.getState();
    return Array.from(store.dreamNodes.values()).map(data => data.node);
  }
  
  /**
   * Get a specific DreamNode by ID
   */
  async get(id: string): Promise<DreamNode | null> {
    const store = useInterBrainStore.getState();
    const nodeData = store.dreamNodes.get(id);
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

      // Batch collection - don't update store until all nodes are processed
      const nodesToAdd: Array<{ dirPath: string; udd: UDDFile; dirName: string }> = [];
      const nodesToUpdate: Array<{ existingData: DreamNodeData; dirPath: string; udd: UDDFile; dirName: string }> = [];

      // Check each directory
      for (const dir of directories) {
        const dirPath = path.join(this.vaultPath, dir.name);

        try {
          // Check if it's a valid DreamNode (has .git and .udd)
          const isValid = await this.isValidDreamNode(dirPath);
          if (!isValid) continue;

          // Read UDD file
          const uddPath = path.join(dirPath, '.udd');
          const uddContent = await fsPromises.readFile(uddPath, 'utf-8');

          let udd: UDDFile;
          try {
            udd = JSON.parse(uddContent);
          } catch (parseError) {
            console.error(`⚠️ [VaultScan] Invalid JSON in ${dir.name}/.udd:`, parseError);
            console.error(`⚠️ [VaultScan] File content preview:\n${uddContent.substring(0, 500)}`);
            // Skip this node but continue scanning others
            continue;
          }

          foundNodeIds.add(udd.uuid);

          // Check if node exists in store
          const store = useInterBrainStore.getState();
          const existingData = store.dreamNodes.get(udd.uuid);

          if (!existingData) {
            // Queue for batch add
            nodesToAdd.push({ dirPath, udd, dirName: dir.name });
          } else {
            // Queue for batch update
            nodesToUpdate.push({ existingData, dirPath, udd, dirName: dir.name });
          }
        } catch (error) {
          // Log error for this specific node but continue scanning others
          console.error(`⚠️ [VaultScan] Error processing ${dir.name}:`, error);
          continue;
        }
      }

      // Now process all batched operations - build complete Map without triggering re-renders

      const store = useInterBrainStore.getState();
      const newDreamNodes = new Map(store.dreamNodes); // Clone existing map

      // Process all new nodes IN PARALLEL for speed (disk I/O can happen concurrently)
      const addPromises = nodesToAdd.map(async ({ dirPath, udd, dirName }) => {
        const nodeData = await this.buildNodeDataFromVault(dirPath, udd, dirName);
        if (nodeData) {
          return { uuid: udd.uuid, nodeData };
        }
        return null;
      });

      const addResults = await Promise.all(addPromises);
      for (const result of addResults) {
        if (result) {
          newDreamNodes.set(result.uuid, result.nodeData);
          stats.added++;
        }
      }

      // Process all updates IN PARALLEL for speed
      const updatePromises = nodesToUpdate.map(async ({ existingData, dirPath, udd, dirName }) => {
        const nodeData = await this.buildNodeDataFromVault(dirPath, udd, dirName);
        if (nodeData) {
          // Check if actually changed before counting as update
          const changed = JSON.stringify(existingData.node) !== JSON.stringify(nodeData.node);
          if (changed) {
            return { uuid: udd.uuid, nodeData };
          }
        }
        return null;
      });

      const updateResults = await Promise.all(updatePromises);
      for (const result of updateResults) {
        if (result) {
          newDreamNodes.set(result.uuid, result.nodeData);
          stats.updated++;
        }
      }

      // Remove nodes that no longer exist in vault
      for (const [id] of store.dreamNodes) {
        if (!foundNodeIds.has(id)) {
          newDreamNodes.delete(id);
          stats.removed++;
        }
      }

      // Build bidirectional relationships from Dreamer → Dream connections
      // This is the ONLY source of truth for liminal web relationships
      for (const [dreamerId, dreamerData] of newDreamNodes) {
        if (dreamerData.node.type === 'dreamer') {
          // For each Dream node this Dreamer points to
          for (const dreamId of dreamerData.node.liminalWebConnections) {
            const dreamData = newDreamNodes.get(dreamId);
            if (dreamData) {
              // Add reverse connection: Dream → Dreamer
              const dreamConnections = new Set(dreamData.node.liminalWebConnections || []);
              dreamConnections.add(dreamerId);
              dreamData.node.liminalWebConnections = Array.from(dreamConnections);
            } else {
              console.warn(`[VaultScan] Dreamer "${dreamerData.node.name}" references non-existent Dream: ${dreamId}`);
            }
          }
        }
      }

      // Extract and persist lightweight metadata for instant startup
      const nodeMetadata = new Map<string, { name: string; type: string; uuid: string }>();
      for (const [id, data] of newDreamNodes) {
        nodeMetadata.set(id, {
          name: data.node.name,
          type: data.node.type,
          uuid: data.node.id
        });
      }

      // Single store update - triggers only ONE React re-render
      store.setDreamNodes(newDreamNodes);
      store.setNodeMetadata(nodeMetadata);

      // CRITICAL: Defer media loading to give React time to render placeholders first
      setTimeout(() => {
        import('./media-loading-service').then(({ getMediaLoadingService }) => {
          try {
            const mediaLoadingService = getMediaLoadingService();
            mediaLoadingService.loadAllNodesByDistance();
          } catch (error) {
            console.warn('[VaultScan] Failed to start media loading:', error);
          }
        });
      }, 50); // 50ms delay to let React render

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
    additionalFiles?: globalThis.File[],
    metadata?: { did?: string; email?: string; phone?: string }
  ): Promise<void> {
    try {
      // Create directory
      await fsPromises.mkdir(repoPath, { recursive: true });
      
      // Initialize git with template
      await execAsync(`git init --template="${this.templatePath}" "${repoPath}"`);
      
      // Make sure hooks are executable
      const hooksDir = path.join(repoPath, '.git', 'hooks');
      if (await this.fileExists(hooksDir)) {
        await execAsync(`chmod +x "${path.join(hooksDir, 'pre-commit')}"`, { cwd: repoPath });
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
      }, metadata);

      // Move template files from .git/ to working directory
      // (This is what the pre-commit hook used to do, but doing it here prevents timing issues)
      const gitDir = path.join(repoPath, '.git');

      // Move .udd file
      const uddSource = path.join(gitDir, 'udd');
      const uddDest = path.join(repoPath, '.udd');
      if (await this.fileExists(uddSource)) {
        await fsPromises.rename(uddSource, uddDest);
      }

      // Move README.md
      const readmeSource = path.join(gitDir, 'README.md');
      const readmeDest = path.join(repoPath, 'README.md');
      if (await this.fileExists(readmeSource)) {
        await fsPromises.rename(readmeSource, readmeDest);
      }

      // Move LICENSE
      const licenseSource = path.join(gitDir, 'LICENSE');
      const licenseDest = path.join(repoPath, 'LICENSE');
      if (await this.fileExists(licenseSource)) {
        await fsPromises.rename(licenseSource, licenseDest);
      }

      // For Dreamer nodes: Create .gitignore and empty liminal-web.json BEFORE initial commit
      if (type === 'dreamer') {
        // Create .gitignore with liminal-web.json pattern
        const gitignorePath = path.join(repoPath, '.gitignore');
        const gitignoreContent = 'liminal-web.json\n';
        await fsPromises.writeFile(gitignorePath, gitignoreContent);

        // Create/update liminal-web.json with InterBrain relationship
        // All Dreamer nodes should start connected to InterBrain
        const INTERBRAIN_UUID = '550e8400-e29b-41d4-a716-446655440000';
        const liminalWebPath = path.join(repoPath, 'liminal-web.json');

        // Check if file already exists (from prior relationship additions)
        let liminalWeb: { relationships: string[] };
        try {
          const existingContent = await fsPromises.readFile(liminalWebPath, 'utf-8');
          liminalWeb = JSON.parse(existingContent);
        } catch {
          // File doesn't exist, create new
          liminalWeb = { relationships: [] };
        }

        // Add InterBrain UUID if not already present
        if (!liminalWeb.relationships.includes(INTERBRAIN_UUID)) {
          liminalWeb.relationships.push(INTERBRAIN_UUID);
        }

        await fsPromises.writeFile(liminalWebPath, JSON.stringify(liminalWeb, null, 2));
      }

      // Add all files
      await execAsync('git add -A', { cwd: repoPath });
      
      // Make the initial commit (this triggers the pre-commit hook)
      // Escape the title to handle quotes and special characters
      const escapedTitle = title.replace(/"/g, '\\"');
      try {
        await execAsync(`git commit -m "Initialize DreamNode: ${escapedTitle}"`, { cwd: repoPath });
      } catch (commitError: any) {
        // Pre-commit hook outputs to stderr which causes exec to throw even on success
        // Check if commit actually succeeded by verifying HEAD exists
        try {
          await execAsync('git rev-parse HEAD', { cwd: repoPath });
          // Commit succeeded - don't rethrow, continue normally
        } catch (verifyError) {
          // Commit actually failed - HEAD doesn't exist
          console.error('GitDreamNodeService: Commit failed - HEAD verification failed:', verifyError);
          throw commitError;
        }
      }

      // Initialize Radicle repository via RadicleService (social-resonance feature)
      try {
        const radicleService = serviceManager.getRadicleService();
        const nodeTypeLabel = type === 'dreamer' ? 'DreamerNode' : 'DreamNode';
        const timestamp = new Date().toISOString();
        const description = `${nodeTypeLabel} ${timestamp}`;
        const repoName = path.basename(repoPath);

        // Get passphrase from settings
        const settings = (this.plugin as any).settings;
        const passphrase = settings?.radiclePassphrase;

        // Call RadicleService.init() - returns RID or null
        const radicleId = await radicleService.init(repoPath, repoName, description, passphrase);

        if (radicleId) {
          // Update .udd file with radicleId
          const uddPath = path.join(repoPath, '.udd');
          const uddContent = await fsPromises.readFile(uddPath, 'utf-8');
          const udd = JSON.parse(uddContent);
          udd.radicleId = radicleId;
          await fsPromises.writeFile(uddPath, JSON.stringify(udd, null, 2));

          // Commit the radicleId update
          await execAsync('git add .udd', { cwd: repoPath });
          await execAsync('git commit -m "Add Radicle ID to DreamNode"', { cwd: repoPath });
        }
      } catch (radError: any) {
        // Don't throw - allow node creation to proceed even if rad init fails
        console.warn('GitDreamNodeService: Radicle init failed (non-fatal):', radError.message);
      }

    } catch (error: any) {
      // Don't log error if repository was actually created successfully
      // (This can happen if earlier operations like git init had stderr output)
      try {
        await execAsync('git rev-parse HEAD', { cwd: repoPath });
        return; // Success - don't throw
      } catch {
        // Repository doesn't exist - this is a real error
        console.error('GitDreamNodeService: Failed to create git repository:', error);
        throw error;
      }
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
    },
    metadata?: { did?: string; email?: string; phone?: string }
  ): Promise<void> {
    // Update the udd file while it's still in the .git directory
    // The pre-commit hook will move it to .udd in the working directory
    const uddPath = path.join(repoPath, '.git', 'udd');

    let uddContent = await fsPromises.readFile(uddPath, 'utf-8');

    uddContent = uddContent
      .replace('TEMPLATE_UUID_PLACEHOLDER', values.uuid)
      .replace('TEMPLATE_TITLE_PLACEHOLDER', values.title)
      .replace('"type": "dream"', `"type": "${values.type}"`)
      .replace('TEMPLATE_DREAMTALK_PLACEHOLDER', values.dreamTalk)
      .replace('TEMPLATE_RADICLE_ID_PLACEHOLDER', ''); // Empty initially, filled after rad init

    // Add optional metadata fields for Dreamer nodes
    if (metadata) {
      const udd = JSON.parse(uddContent);
      if (metadata.did) udd.did = metadata.did;
      if (metadata.email) udd.email = metadata.email;
      if (metadata.phone) udd.phone = metadata.phone;
      uddContent = JSON.stringify(udd, null, 2);
    }

    await fsPromises.writeFile(uddPath, uddContent);

    // Update README.md (also in .git directory initially)
    const readmePath = path.join(repoPath, '.git', 'README.md');
    if (await this.fileExists(readmePath)) {
      let readmeContent = await fsPromises.readFile(readmePath, 'utf-8');
      readmeContent = readmeContent.replace(/TEMPLATE_TITLE_PLACEHOLDER/g, values.title);
      await fsPromises.writeFile(readmePath, readmeContent);
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
   * Build node data from vault without updating store (for batching)
   */
  private async buildNodeDataFromVault(dirPath: string, udd: UDDFile, repoName: string): Promise<DreamNodeData | null> {
    // Load dreamTalk media if specified
    // IMPORTANT: If file temporarily doesn't exist, preserve existing dreamTalkMedia from store
    const store = useInterBrainStore.getState();
    const existingData = store.dreamNodes.get(udd.uuid);
    let dreamTalkMedia: Array<{
      path: string;
      absolutePath: string;
      type: string;
      data: string;
      size: number;
    }> = existingData?.node.dreamTalkMedia || []; // Preserve existing if we have it

    if (udd.dreamTalk) {
      const mediaPath = path.join(dirPath, udd.dreamTalk);
      if (await this.fileExists(mediaPath)) {
        const stats = await fsPromises.stat(mediaPath);
        const mimeType = this.getMimeType(udd.dreamTalk);

        // CRITICAL: If we already have loaded media data for this file, preserve it
        // Only create fresh entry if we don't have existing data
        const existingMedia = existingData?.node.dreamTalkMedia?.[0];
        const hasExistingData = existingMedia && existingMedia.data && existingMedia.data.length > 0;

        if (hasExistingData && existingMedia.path === udd.dreamTalk) {
          // Keep existing media with loaded data intact
          dreamTalkMedia = existingData.node.dreamTalkMedia;
        } else {
          // Fresh media entry - will lazy load on demand
          dreamTalkMedia = [{
            path: udd.dreamTalk,
            absolutePath: mediaPath,
            type: mimeType,
            data: '', // Empty - lazy load on demand
            size: stats.size
          }];
        }
      }
      // If file doesn't exist but udd.dreamTalk is set, keep existing dreamTalkMedia
      // This prevents flickering when file system is temporarily inaccessible
    }

    // Load relationships ONLY from liminal-web.json in Dreamer nodes
    // Dream nodes don't store relationships - they're discovered via Dreamer → Dream connections
    let relationships: string[] = [];
    if (udd.type === 'dreamer') {
      const liminalWebPath = path.join(dirPath, 'liminal-web.json');
      try {
        if (await this.fileExists(liminalWebPath)) {
          const content = await fsPromises.readFile(liminalWebPath, 'utf-8');
          const liminalWeb = JSON.parse(content);
          relationships = liminalWeb.relationships || [];
        }
      } catch (error) {
        console.warn(`Failed to read liminal-web.json for ${udd.title}:`, error);
        // No fallback - Dreamer nodes MUST have liminal-web.json
      }
    }
    // Dream nodes: relationships array stays empty here
    // They get populated bidirectionally during vault scan by inverting Dreamer relationships

    // Use cached constellation position if available, otherwise random
    const cachedPosition = store.constellationData.positions?.get(udd.uuid);

    const node: DreamNode = {
      id: udd.uuid,
      type: udd.type,
      name: udd.title,
      position: cachedPosition || this.calculateNewNodePosition(),
      dreamTalkMedia,
      dreamSongContent: [],
      liminalWebConnections: relationships,
      repoPath: repoName,
      hasUnsavedChanges: false,
      email: udd.email,
      phone: udd.phone,
      radicleId: udd.radicleId,
      did: udd.did,
      githubRepoUrl: udd.githubRepoUrl,
      githubPagesUrl: udd.githubPagesUrl
    };
    
    // Calculate file hash if needed
    let fileHash: string | undefined;
    if (dreamTalkMedia.length > 0 && udd.dreamTalk) {
      const mediaPath = path.join(dirPath, udd.dreamTalk);
      fileHash = await this.calculateFileHashFromPath(mediaPath);
    }

    // Return node data without updating store
    return {
      node,
      fileHash,
      lastSynced: Date.now()
    };
  }

  /**
   * Add node from vault to store (legacy method - use buildNodeDataFromVault for batching)
   */
  private async addNodeFromVault(dirPath: string, udd: UDDFile, repoName: string): Promise<void> {
    const nodeData = await this.buildNodeDataFromVault(dirPath, udd, repoName);
    if (nodeData) {
      const store = useInterBrainStore.getState();
      store.updateRealNode(udd.uuid, nodeData);
    }
  }
  
  /**
   * Update node from vault if changed
   */
  private async updateNodeFromVault(
    existingData: DreamNodeData,
    dirPath: string,
    udd: UDDFile,
    repoName: string
  ): Promise<boolean> {
    let updated = false;
    const node = { ...existingData.node };

    // CRITICAL: Sync repoPath with actual directory name (handles Radicle clone renames)
    if (node.repoPath !== repoName) {
      node.repoPath = repoName;
      updated = true;
    }

    // CRITICAL: Sync display name with .udd title (human-readable)
    // .udd file is source of truth for display names, NOT the folder name
    // Folder names are PascalCase for compatibility, but display uses human-readable titles
    if (node.name !== udd.title) {
      node.name = udd.title;
      updated = true;
    }

    // Check metadata changes (type, contact fields, radicleId, did, and GitHub URLs - name synced from .udd)
    if (node.type !== udd.type || node.email !== udd.email || node.phone !== udd.phone ||
        node.radicleId !== udd.radicleId || node.did !== udd.did ||
        node.githubRepoUrl !== udd.githubRepoUrl || node.githubPagesUrl !== udd.githubPagesUrl) {
      node.type = udd.type;
      node.email = udd.email;
      node.phone = udd.phone;
      node.radicleId = udd.radicleId;
      node.did = udd.did;
      node.githubRepoUrl = udd.githubRepoUrl;
      node.githubPagesUrl = udd.githubPagesUrl;
      updated = true;
    }
    
    // Check dreamTalk changes
    if (udd.dreamTalk) {
      const mediaPath = path.join(dirPath, udd.dreamTalk);
      if (await this.fileExists(mediaPath)) {
        const newHash = await this.calculateFileHashFromPath(mediaPath);
        
        if (newHash !== existingData.fileHash) {
          // File changed - reload metadata only (data will lazy load)
          const stats = await fsPromises.stat(mediaPath);
          const mimeType = this.getMimeType(udd.dreamTalk);
          // Skip loading media data - will lazy load via MediaLoadingService

          node.dreamTalkMedia = [{
            path: udd.dreamTalk,
            absolutePath: mediaPath,
            type: mimeType,
            data: '', // Empty - lazy load on demand
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

      // No need to write back to .udd - we just read from it (disk is source of truth)
    }

    return updated;
  }
  
  /**
   * Update .udd file with node data
   * CRITICAL: Read-modify-write pattern to preserve fields that exist on disk but not in store
   */
  private async updateUDDFile(node: DreamNode): Promise<void> {
    const fullPath = path.join(this.vaultPath, node.repoPath);

    // Read existing .udd from disk first to preserve all fields
    let existingUdd: Partial<UDDFile> = {};
    try {
      existingUdd = await UDDService.readUDD(fullPath);
    } catch {
      // No existing .udd found, will create new one
    }

    // Build updated UDD, merging with existing fields
    const udd: UDDFile = {
      ...existingUdd, // Start with all existing fields from disk
      // Overwrite with current node data from store
      uuid: node.id,
      title: node.name,
      type: node.type,
      dreamTalk: node.dreamTalkMedia.length > 0 ? node.dreamTalkMedia[0].path : '',
      submodules: existingUdd.submodules || [],
      supermodules: existingUdd.supermodules || []
    };

    // Include contact fields only for dreamer nodes
    // IMPORTANT: Allow empty strings - check !== undefined, not truthiness
    if (node.type === 'dreamer') {
      if (node.email !== undefined) {
        udd.email = node.email; // Preserve empty strings
      }
      if (node.phone !== undefined) {
        udd.phone = node.phone; // Preserve empty strings
      }
      if (node.did !== undefined) {
        udd.did = node.did; // Preserve empty strings
      }
    }

    // CRITICAL: Preserve radicleId from node OR existing disk value
    if (node.radicleId) {
      udd.radicleId = node.radicleId;
    } else if (existingUdd.radicleId) {
      udd.radicleId = existingUdd.radicleId;
    }

    // CRITICAL: Preserve GitHub URLs from node OR existing disk value
    if (node.githubRepoUrl) {
      udd.githubRepoUrl = node.githubRepoUrl;
    } else if (existingUdd.githubRepoUrl) {
      udd.githubRepoUrl = existingUdd.githubRepoUrl;
    }

    if (node.githubPagesUrl) {
      udd.githubPagesUrl = node.githubPagesUrl;
    } else if (existingUdd.githubPagesUrl) {
      udd.githubPagesUrl = existingUdd.githubPagesUrl;
    }

    await UDDService.writeUDD(fullPath, udd);
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
  
  /**
   * Sanitize title to PascalCase for folder names
   * Uses unified sanitization utility for consistency across all layers
   */
  private sanitizeRepoName(title: string): string {
    return sanitizeTitleToPascalCase(title);
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
      
      // Refresh git status after commit
      const newGitStatus = await this.gitOpsService.getGitStatus(node.repoPath);
      
      // Update store with new git status
      const store = useInterBrainStore.getState();
      const nodeData = store.dreamNodes.get(node.id);
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
    // .link files contain JSON metadata and should be read as text, not data URLs
    if (file.name.toLowerCase().endsWith('.link')) {
      return new Promise((resolve, reject) => {
        const reader = new globalThis.FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(file);
      });
    }

    // Regular media files get converted to data URLs
    return new Promise((resolve, reject) => {
      const reader = new globalThis.FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  
  private async filePathToDataUrl(filePath: string): Promise<string> {
    // .link files contain JSON metadata and should be read as text, not data URLs
    if (filePath.toLowerCase().endsWith('.link')) {
      return await fsPromises.readFile(filePath, 'utf-8');
    }

    // Regular media files get converted to data URLs
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
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.pdf': 'application/pdf'
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
    const nodeData = store.dreamNodes.get(nodeId);
    
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
  }

  /**
   * Add files to an existing DreamNode WITHOUT updating dreamTalk
   * Used for regular mode file drops where files should just be added to the repo
   */
  async addFilesToNodeWithoutDreamTalkUpdate(nodeId: string, files: globalThis.File[]): Promise<void> {
    const store = useInterBrainStore.getState();
    const nodeData = store.dreamNodes.get(nodeId);

    if (!nodeData) {
      throw new Error(`DreamNode with ID ${nodeId} not found`);
    }

    const node = nodeData.node;
    const repoPath = path.join(this.vaultPath, node.repoPath);

    // Write all files to disk without updating dreamTalk
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      await fsPromises.writeFile(
        path.join(repoPath, file.name),
        globalThis.Buffer.from(buffer)
      );
    }

    // Update last synced time (no UDD update needed since dreamTalk isn't changing)
    store.updateRealNode(nodeId, {
      ...nodeData,
      lastSynced: Date.now()
    });
  }

  private isMediaFile(file: globalThis.File): boolean {
    const validTypes = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/webp',
      'image/svg+xml',
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

    // Also check file extension for special cases where MIME detection is unreliable
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.link') || fileName.endsWith('.svg') || fileName.endsWith('.webp')) {
      return true;
    }

    return validTypes.includes(file.type);
  }
  
  /**
   * Reset all data (clears store but not disk)
   */
  reset(): void {
    const store = useInterBrainStore.getState();
    store.setDreamNodes(new Map());
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
    const nodes = Array.from(store.dreamNodes.entries());
    
    let updated = 0;
    let errors = 0;

    for (const [nodeId, nodeData] of nodes) {
      try {
        const newGitStatus = await this.gitOpsService.getGitStatus(nodeData.node.repoPath);
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
          
          // Trigger re-indexing if commit changed (meaningful content change)
          if (commitChanged && !newGitStatus.hasUncommittedChanges) {
            // Only re-index if the node is clean (committed changes)
            try {
              await indexingService.indexNode(updatedNode);
            } catch (error) {
              console.error(`GitDreamNodeService: Failed to re-index node ${updatedNode.name}:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`GitDreamNodeService: Failed to refresh git status for node ${nodeId}:`, error);
        errors++;
      }
    }

    return { updated, errors };
  }
  
  /**
   * Get statistics
   */
  getStats() {
    const store = useInterBrainStore.getState();
    const nodes = Array.from(store.dreamNodes.values()).map(d => d.node);
    
    return {
      totalNodes: nodes.length,
      dreamNodes: nodes.filter(n => n.type === 'dream').length,
      dreamerNodes: nodes.filter(n => n.type === 'dreamer').length,
      nodesWithMedia: nodes.filter(n => n.dreamTalkMedia.length > 0).length
    };
  }
  
  // Relationship management methods
  
  /**
   * Update relationships for a node (bidirectional)
   * This method enforces bidirectionality by using atomic add/remove operations
   */
  async updateRelationships(nodeId: string, relationshipIds: string[]): Promise<void> {
    const store = useInterBrainStore.getState();
    const nodeData = store.dreamNodes.get(nodeId);

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

    // Use atomic operations for each change to ensure bidirectionality
    for (const addedId of added) {
      await this.addRelationship(nodeId, addedId);
    }

    for (const removedId of removed) {
      await this.removeRelationship(nodeId, removedId);
    }
  }

  /**
   * Get relationships for a node
   */
  async getRelationships(nodeId: string): Promise<string[]> {
    const store = useInterBrainStore.getState();
    const nodeData = store.dreamNodes.get(nodeId);
    
    if (!nodeData) {
      throw new Error(`DreamNode with ID ${nodeId} not found`);
    }
    
    return nodeData.node.liminalWebConnections || [];
  }

  /**
   * Add a single relationship (bidirectional)
   * This method enforces bidirectionality by updating BOTH nodes atomically
   */
  async addRelationship(nodeId: string, relatedNodeId: string): Promise<void> {
    const store = useInterBrainStore.getState();
    const nodeData = store.dreamNodes.get(nodeId);
    const relatedNodeData = store.dreamNodes.get(relatedNodeId);

    if (!nodeData) {
      throw new Error(`DreamNode with ID ${nodeId} not found`);
    }

    if (!relatedNodeData) {
      throw new Error(`Related DreamNode with ID ${relatedNodeId} not found`);
    }

    // Update both nodes' relationships atomically
    const node = nodeData.node;
    const relatedNode = relatedNodeData.node;

    // Add relationship in both directions
    const relationships = new Set(node.liminalWebConnections || []);
    relationships.add(relatedNodeId);
    node.liminalWebConnections = Array.from(relationships);

    const relatedRelationships = new Set(relatedNode.liminalWebConnections || []);
    relatedRelationships.add(nodeId);
    relatedNode.liminalWebConnections = Array.from(relatedRelationships);

    // Update both nodes in store
    store.updateRealNode(nodeId, {
      ...nodeData,
      node,
      lastSynced: Date.now()
    });

    store.updateRealNode(relatedNodeId, {
      ...relatedNodeData,
      node: relatedNode,
      lastSynced: Date.now()
    });

    // Update liminal-web.json for Dreamer nodes (relationships stored here, not in .udd)
    const updateTasks = [];
    if (node.type === 'dreamer') {
      updateTasks.push(this.updateLiminalWebFile(node));
    }
    if (relatedNode.type === 'dreamer') {
      updateTasks.push(this.updateLiminalWebFile(relatedNode));
    }
    if (updateTasks.length > 0) {
      await Promise.all(updateTasks);
    }
  }

  /**
   * Remove a single relationship (bidirectional)
   * This method enforces bidirectionality by updating BOTH nodes atomically
   */
  async removeRelationship(nodeId: string, relatedNodeId: string): Promise<void> {
    const store = useInterBrainStore.getState();
    const nodeData = store.dreamNodes.get(nodeId);
    const relatedNodeData = store.dreamNodes.get(relatedNodeId);

    if (!nodeData) {
      throw new Error(`DreamNode with ID ${nodeId} not found`);
    }

    if (!relatedNodeData) {
      console.warn(`Related DreamNode with ID ${relatedNodeId} not found - removing one-way relationship only`);
      // Still remove from the first node even if related node is missing
      const node = nodeData.node;
      const relationships = new Set(node.liminalWebConnections || []);
      relationships.delete(relatedNodeId);
      node.liminalWebConnections = Array.from(relationships);

      store.updateRealNode(nodeId, {
        ...nodeData,
        node,
        lastSynced: Date.now()
      });

      // Update liminal-web.json only (relationships not stored in .udd)
      if (node.type === 'dreamer') {
        await this.updateLiminalWebFile(node);
      }
      return;
    }

    // Update both nodes' relationships atomically
    const node = nodeData.node;
    const relatedNode = relatedNodeData.node;

    // Remove relationship in both directions
    const relationships = new Set(node.liminalWebConnections || []);
    relationships.delete(relatedNodeId);
    node.liminalWebConnections = Array.from(relationships);

    const relatedRelationships = new Set(relatedNode.liminalWebConnections || []);
    relatedRelationships.delete(nodeId);
    relatedNode.liminalWebConnections = Array.from(relatedRelationships);

    // Update both nodes in store
    store.updateRealNode(nodeId, {
      ...nodeData,
      node,
      lastSynced: Date.now()
    });

    store.updateRealNode(relatedNodeId, {
      ...relatedNodeData,
      node: relatedNode,
      lastSynced: Date.now()
    });

    // Update liminal-web.json for Dreamer nodes (relationships stored here, not in .udd)
    const updateTasks2 = [];
    if (node.type === 'dreamer') {
      updateTasks2.push(this.updateLiminalWebFile(node));
    }
    if (relatedNode.type === 'dreamer') {
      updateTasks2.push(this.updateLiminalWebFile(relatedNode));
    }
    if (updateTasks2.length > 0) {
      await Promise.all(updateTasks2);
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
    const vaultService = serviceManager.getVaultService();
    if (!vaultService) {
      throw new Error('VaultService not initialized');
    }

    // Use provided position or calculate random position
    const nodePosition = position
      ? position
      : this.calculateNewNodePosition();

    // Create node using existing create method without files
    const node = await this.create(title, type, undefined, nodePosition);

    // Write .link file using drag-and-drop utility
    const linkResult = await writeLinkFile(vaultService, node.repoPath, urlMetadata, title);

    // Update dreamTalk media to reference the .link file
    node.dreamTalkMedia = [linkResult.media];

    // Create README content with URL using drag-and-drop utility
    await writeUrlReadme(vaultService, node.repoPath, urlMetadata, title);

    // Update .udd file with .link file path
    await this.updateUDDFile(node);

    return node;
  }

  /**
   * Create a DreamNode from a website URL with AI-powered analysis
   *
   * Creates the node immediately using createFromUrl(), then spawns
   * the WebLinkAnalyzerService in background to enrich the node with:
   * - Personalized summary based on user profile
   * - Representative image download
   * - Rich README content
   */
  async createFromWebsiteUrl(
    title: string,
    type: 'dream' | 'dreamer',
    urlMetadata: UrlMetadata,
    position?: [number, number, number],
    apiKey?: string
  ): Promise<DreamNode> {
    // Create node immediately using existing method for instant feedback
    const node = await this.createFromUrl(title, type, urlMetadata, position);

    // Get plugin directory path for Python script location
    const pluginPath = path.join(this.vaultPath, '.obsidian', 'plugins', this.plugin.manifest.id);

    // Initialize the analyzer service with vault and plugin paths
    webLinkAnalyzerService.initialize(this.vaultPath, pluginPath);

    // Only run AI analysis if API key is provided
    if (apiKey) {
      // Spawn AI analysis in background (non-blocking)
      // This will update the node's README and DreamTalk when complete
      webLinkAnalyzerService.analyzeWebLink(
        node.id,
        urlMetadata.url,
        node.repoPath,
        apiKey
      ).catch(error => {
        console.error('GitDreamNodeService: Background web analysis failed:', error);
        // Node still exists with basic content - user can retry later
      });
    }

    return node;
  }

  /**
   * Add URL to an existing DreamNode
   */
  async addUrlToNode(nodeId: string, urlMetadata: UrlMetadata): Promise<void> {
    const vaultService = serviceManager.getVaultService();
    if (!vaultService) {
      throw new Error('VaultService not initialized');
    }

    const store = useInterBrainStore.getState();
    const nodeData = store.dreamNodes.get(nodeId);

    if (!nodeData) {
      throw new Error(`DreamNode with ID ${nodeId} not found`);
    }

    const node = nodeData.node;

    // Write .link file using drag-and-drop utility
    const linkResult = await writeLinkFile(vaultService, node.repoPath, urlMetadata, node.name);

    // Add .link file as additional dreamTalk media
    node.dreamTalkMedia.push(linkResult.media);

    // Append URL content to README using drag-and-drop utility
    await appendUrlToReadme(vaultService, node.repoPath, urlMetadata);

    // Update .udd file
    await this.updateUDDFile(node);

    // Update store
    store.updateRealNode(nodeId, {
      ...nodeData,
      node,
      lastSynced: Date.now()
    });
  }

  /**
   * Update liminal-web.json file for a Dreamer node with current relationships
   */
  private async updateLiminalWebFile(node: DreamNode): Promise<void> {
    if (node.type !== 'dreamer') {
      return; // Only Dreamer nodes have liminal-web.json
    }

    const liminalWebPath = path.join(this.vaultPath, node.repoPath, 'liminal-web.json');

    try {
      // Read current file or create structure
      let liminalWeb;
      try {
        const content = await fsPromises.readFile(liminalWebPath, 'utf-8');
        liminalWeb = JSON.parse(content);
      } catch {
        // File doesn't exist or invalid, create new structure
        liminalWeb = { relationships: [] };
      }

      // Update relationships from node's liminalWebConnections
      liminalWeb.relationships = node.liminalWebConnections || [];

      // Write back
      await fsPromises.writeFile(liminalWebPath, JSON.stringify(liminalWeb, null, 2));
    } catch (error) {
      console.error(`GitDreamNodeService: Failed to update liminal-web.json for ${node.name}:`, error);
    }
  }
}