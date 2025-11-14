import { DreamNode, UDDFile, GitStatus } from '../types/dreamnode';
import { useInterBrainStore, RealNodeData } from '../store/interbrain-store';
import { Plugin } from 'obsidian';
import { indexingService } from '../features/semantic-search/services/indexing-service';
import { UrlMetadata, generateYouTubeIframe, generateMarkdownLink } from '../utils/url-utils';
import { createLinkFileContent, getLinkFileName } from '../utils/link-file-utils';
import { sanitizeTitleToPascalCase } from '../utils/title-sanitization';

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
    const repoCreationPromise = this.createGitRepository(repoPath, uuid, title, type, dreamTalk, additionalFiles, metadata)
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
      .catch(async (error) => {
        // Check if git repository actually exists (commit might have succeeded despite stderr)
        try {
          await execAsync('git rev-parse HEAD', { cwd: repoPath });
          console.log(`GitDreamNodeService: Repository created successfully (stderr from hook is normal)`);
        } catch {
          // Actually failed
          console.error('Failed to create git repository:', error);
        }
      });

    // Auto-link dreamer nodes to InterBrain (bidirectional)
    if (type === 'dreamer') {
      const INTERBRAIN_UUID = '550e8400-e29b-41d4-a716-446655440000';
      console.log(`GitDreamNodeService: Auto-linking dreamer "${title}" to InterBrain...`);

      // IMPORTANT: Wait for git repository creation to complete before adding relationships
      // This ensures liminal-web.json exists and is ready to be updated
      repoCreationPromise.then(() => {
        this.addRelationship(uuid, INTERBRAIN_UUID)
          .then(() => {
            console.log(`✅ GitDreamNodeService: Auto-linked dreamer "${title}" to InterBrain`);
          })
          .catch((error) => {
            console.error(`Failed to auto-link dreamer "${title}" to InterBrain:`, error);
            // Non-fatal - sync command will catch this later
          });
      });
    }

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
      console.log('[VaultScan] Starting batch scan...');

      // Get all root-level directories
      const entries = await fsPromises.readdir(this.vaultPath, { withFileTypes: true });
      const directories = entries.filter((entry: { isDirectory(): boolean }) => entry.isDirectory());

      // Track found nodes for removal detection
      const foundNodeIds = new Set<string>();

      // Batch collection - don't update store until all nodes are processed
      const nodesToAdd: Array<{ dirPath: string; udd: UDDFile; dirName: string }> = [];
      const nodesToUpdate: Array<{ existingData: RealNodeData; dirPath: string; udd: UDDFile; dirName: string }> = [];

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
          const existingData = store.realNodes.get(udd.uuid);

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
      console.log(`[VaultScan] Processing ${nodesToAdd.length} adds, ${nodesToUpdate.length} updates`);

      const store = useInterBrainStore.getState();
      const newRealNodes = new Map(store.realNodes); // Clone existing map

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
          newRealNodes.set(result.uuid, result.nodeData);
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
          newRealNodes.set(result.uuid, result.nodeData);
          stats.updated++;
        }
      }

      // Remove nodes that no longer exist in vault
      for (const [id] of store.realNodes) {
        if (!foundNodeIds.has(id)) {
          newRealNodes.delete(id);
          stats.removed++;
        }
      }

      // Build bidirectional relationships from Dreamer → Dream connections
      // This is the ONLY source of truth for liminal web relationships
      console.log('[VaultScan] Building bidirectional relationships from liminal-web.json files...');
      for (const [dreamerId, dreamerData] of newRealNodes) {
        if (dreamerData.node.type === 'dreamer') {
          // For each Dream node this Dreamer points to
          for (const dreamId of dreamerData.node.liminalWebConnections) {
            const dreamData = newRealNodes.get(dreamId);
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
      console.log('[VaultScan] Bidirectional relationships complete');

      // Extract and persist lightweight metadata for instant startup
      const nodeMetadata = new Map<string, { name: string; type: string; uuid: string }>();
      for (const [id, data] of newRealNodes) {
        nodeMetadata.set(id, {
          name: data.node.name,
          type: data.node.type,
          uuid: data.node.id
        });
      }

      // Single store update - triggers only ONE React re-render
      store.setRealNodes(newRealNodes);
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
      }, metadata);

      // Move template files from .git/ to working directory
      // (This is what the pre-commit hook used to do, but doing it here prevents timing issues)
      console.log(`GitDreamNodeService: Moving template files to working directory`);
      const gitDir = path.join(repoPath, '.git');

      // Move .udd file
      const uddSource = path.join(gitDir, 'udd');
      const uddDest = path.join(repoPath, '.udd');
      if (await this.fileExists(uddSource)) {
        await fsPromises.rename(uddSource, uddDest);
        console.log(`GitDreamNodeService: Moved .git/udd to .udd`);
      }

      // Move README.md
      const readmeSource = path.join(gitDir, 'README.md');
      const readmeDest = path.join(repoPath, 'README.md');
      if (await this.fileExists(readmeSource)) {
        await fsPromises.rename(readmeSource, readmeDest);
        console.log(`GitDreamNodeService: Moved .git/README.md to README.md`);
      }

      // Move LICENSE
      const licenseSource = path.join(gitDir, 'LICENSE');
      const licenseDest = path.join(repoPath, 'LICENSE');
      if (await this.fileExists(licenseSource)) {
        await fsPromises.rename(licenseSource, licenseDest);
        console.log(`GitDreamNodeService: Moved .git/LICENSE to LICENSE`);
      }

      // For Dreamer nodes: Create .gitignore and empty liminal-web.json BEFORE initial commit
      if (type === 'dreamer') {
        // Create .gitignore with liminal-web.json pattern
        const gitignorePath = path.join(repoPath, '.gitignore');
        const gitignoreContent = 'liminal-web.json\n';
        await fsPromises.writeFile(gitignorePath, gitignoreContent);
        console.log(`GitDreamNodeService: Created .gitignore for Dreamer node`);

        // Create empty liminal-web.json (will be populated by updateLiminalWebFile later)
        const liminalWebPath = path.join(repoPath, 'liminal-web.json');
        const emptyLiminalWeb = { relationships: [] };
        await fsPromises.writeFile(liminalWebPath, JSON.stringify(emptyLiminalWeb, null, 2));
        console.log(`GitDreamNodeService: Created empty liminal-web.json for Dreamer node`);
      }

      // Make initial commit
      console.log(`GitDreamNodeService: Starting git operations in ${repoPath}`);

      // Add all files
      const addResult = await execAsync('git add -A', { cwd: repoPath });
      console.log(`GitDreamNodeService: Git add result:`, addResult);
      
      // Make the initial commit (this triggers the pre-commit hook)
      // Escape the title to handle quotes and special characters
      const escapedTitle = title.replace(/"/g, '\\"');
      try {
        const commitResult = await execAsync(`git commit -m "Initialize DreamNode: ${escapedTitle}"`, { cwd: repoPath });
        console.log(`GitDreamNodeService: Git commit result:`, commitResult);
      } catch (commitError: any) {
        // Pre-commit hook outputs to stderr which causes exec to throw even on success
        // Check if commit actually succeeded by verifying HEAD exists
        try {
          const headResult = await execAsync('git rev-parse HEAD', { cwd: repoPath });
          console.log(`[GitDreamNodeService] ✅ Commit verified successful despite stderr - HEAD exists: ${headResult.stdout.trim()}`);
          // Commit succeeded - don't rethrow, continue normally
        } catch (verifyError) {
          // Commit actually failed - HEAD doesn't exist
          console.error(`[GitDreamNodeService] ❌ Commit failed - HEAD verification failed:`, verifyError);
          throw commitError;
        }
      }

      console.log(`GitDreamNodeService: Git repository created successfully at ${repoPath}`);

      // Initialize Radicle repository (rad init --private)
      console.log(`GitDreamNodeService: Initializing Radicle repository...`);
      try {
        const nodeTypeLabel = type === 'dreamer' ? 'DreamerNode' : 'DreamNode';
        const timestamp = new Date().toISOString();
        const description = `${nodeTypeLabel} ${timestamp}`;

        // Get passphrase from settings
        const settings = (this.plugin as any).settings;
        const passphrase = settings?.radiclePassphrase;

        // Prepare environment with passphrase
        const process = require('process');
        const env = { ...process.env };
        if (passphrase) {
          env.RAD_PASSPHRASE = passphrase;
          console.log('GitDreamNodeService: Using passphrase from settings via RAD_PASSPHRASE');
        } else {
          console.log('GitDreamNodeService: No passphrase in settings, relying on ssh-agent');
        }

        // Note: Radicle node management is handled separately (Concern 2)
        // We assume the node is already running if user has Radicle configured

        // Find rad command in common installation locations
        const os = require('os');
        const homeDir = os.homedir();
        const possibleRadPaths = [
          'rad', // Try PATH first
          path.join(homeDir, '.radicle', 'bin', 'rad'), // Standard Radicle install location
          '/usr/local/bin/rad', // Homebrew default
          '/opt/homebrew/bin/rad', // Homebrew on Apple Silicon
        ];

        let radCommand: string | null = null;
        for (const radPath of possibleRadPaths) {
          try {
            await execAsync(`"${radPath}" --version`);
            radCommand = radPath;
            console.log(`GitDreamNodeService: Found rad at ${radPath}`);
            break;
          } catch {
            // Continue to next path
          }
        }

        if (!radCommand) {
          console.warn('GitDreamNodeService: rad command not found, skipping Radicle init');
          throw new Error('rad command not found');
        }

        // Use spawn instead of exec to provide proper stdin (bypasses TTY requirement)
        // IMPORTANT: --name is REQUIRED for non-TTY mode, otherwise rad init fails with TTY error
        // IMPORTANT: --no-seed prevents automatic network seeding (user controls sharing via "Share" command)
        // Use sanitized directory name (already cleaned by sanitizeTitleToPascalCase)
        const repoName = path.basename(repoPath);

        const { spawn } = require('child_process');
        const spawnPromise = () => new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
          const child = spawn(radCommand, [
            'init',
            repoPath,
            '--private',  // Private = not announced, stays local until share
            '--name', repoName,  // REQUIRED for non-TTY mode, use sanitized dir name
            '--default-branch', 'main',
            '--description', description,
            '--no-confirm',
            '--no-seed'  // Don't seed until user explicitly shares (Concern 2)
          ], {
            env,  // Pass environment with RAD_PASSPHRASE
            cwd: repoPath,
            stdio: ['pipe', 'pipe', 'pipe']  // Provide stdin pipe to bypass TTY
          });

          let stdout = '';
          let stderr = '';

          child.stdout?.on('data', (data) => {
            stdout += data.toString();
          });

          child.stderr?.on('data', (data) => {
            stderr += data.toString();
          });

          child.on('close', (code) => {
            console.log(`GitDreamNodeService: rad init closed with code ${code}`);
            console.log(`GitDreamNodeService: rad init stdout:`, stdout);
            console.log(`GitDreamNodeService: rad init stderr:`, stderr);

            if (code === 0) {
              resolve({ stdout, stderr });
            } else {
              const error: any = new Error(`rad init exited with code ${code}`);
              error.stdout = stdout;
              error.stderr = stderr;
              reject(error);
            }
          });

          child.on('error', (error) => {
            console.error(`GitDreamNodeService: rad init spawn error:`, error);
            reject(error);
          });

          // Close stdin immediately since we're non-interactive
          child.stdin?.end();
        });

        const radInitResult = await spawnPromise();
        console.log(`GitDreamNodeService: Radicle init succeeded`);

        // Extract RID from rad init output
        // Expected format: "Repository rad:z... created."
        const ridMatch = radInitResult.stdout.match(/rad:z[a-zA-Z0-9]+/);
        if (ridMatch) {
          const radicleId = ridMatch[0];
          console.log(`GitDreamNodeService: Captured Radicle ID: ${radicleId}`);

          // Update .udd file with radicleId AND preserve existing metadata (did, email, phone)
          const uddPath = path.join(repoPath, '.udd');
          const uddContent = await fsPromises.readFile(uddPath, 'utf-8');
          const udd = JSON.parse(uddContent);

          // Add radicleId (preserves all existing fields like did, email, phone)
          udd.radicleId = radicleId;

          await fsPromises.writeFile(uddPath, JSON.stringify(udd, null, 2));
          console.log(`GitDreamNodeService: Updated .udd with radicleId (preserving existing metadata)`);

          // Commit the radicleId + metadata update as single atomic commit
          await execAsync('git add .udd', { cwd: repoPath });
          await execAsync('git commit -m "Add Radicle ID and metadata to DreamNode"', { cwd: repoPath });
          console.log(`GitDreamNodeService: Committed radicleId + metadata in single commit`);
        } else {
          console.warn(`GitDreamNodeService: Could not extract RID from rad init output`);
        }
      } catch (radError: any) {
        console.error(`GitDreamNodeService: Radicle init failed:`, radError);
        if (radError.stderr) {
          console.error(`GitDreamNodeService: Radicle stderr:`, radError.stderr);
        }
        if (radError.stdout) {
          console.log(`GitDreamNodeService: Radicle stdout:`, radError.stdout);
        }
        // Don't throw - allow node creation to proceed even if rad init fails
        // This ensures the plugin works even without Radicle CLI installed
      }

    } catch (error: any) {
      // Don't log error if repository was actually created successfully
      // (This can happen if earlier operations like git init had stderr output)
      try {
        await execAsync('git rev-parse HEAD', { cwd: repoPath });
        console.log(`[GitDreamNodeService] ✅ Repository exists despite error - operation succeeded`);
        return; // Success - don't throw
      } catch {
        // Repository doesn't exist - this is a real error
        console.error('Failed to create git repository:', error);
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
    console.log(`GitDreamNodeService: Updating template file at ${uddPath}`);

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
      console.log(`GitDreamNodeService: Added metadata to .udd:`, Object.keys(metadata));
    }

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
   * Build node data from vault without updating store (for batching)
   */
  private async buildNodeDataFromVault(dirPath: string, udd: UDDFile, repoName: string): Promise<RealNodeData | null> {
    // Load dreamTalk media if specified
    // IMPORTANT: If file temporarily doesn't exist, preserve existing dreamTalkMedia from store
    const store = useInterBrainStore.getState();
    const existingData = store.realNodes.get(udd.uuid);
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
        // Skip loading media data during vault scan - will lazy load via MediaLoadingService

        dreamTalkMedia = [{
          path: udd.dreamTalk,
          absolutePath: mediaPath,
          type: mimeType,
          data: '', // Empty - lazy load on demand
          size: stats.size
        }];
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

    // CRITICAL: Sync display name with .udd title (human-readable)
    // .udd file is source of truth for display names, NOT the folder name
    // Folder names are PascalCase for compatibility, but display uses human-readable titles
    if (node.name !== udd.title) {
      console.log(`✏️ [GitDreamNodeService] Syncing display name from .udd: "${node.name}" → "${udd.title}"`);
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

      // Write updated metadata back to .udd file (keeps file system in sync)
      await this.updateUDDFile(node);
      console.log(`💾 [GitDreamNodeService] Updated .udd file for ${node.name}`);
    }

    return updated;
  }
  
  /**
   * Update .udd file with node data
   * CRITICAL: Read-modify-write pattern to preserve fields that exist on disk but not in store
   */
  private async updateUDDFile(node: DreamNode): Promise<void> {
    const uddPath = path.join(this.vaultPath, node.repoPath, '.udd');

    // Read existing .udd from disk first to preserve all fields
    let existingUdd: Partial<UDDFile> = {};
    try {
      const existingContent = await fsPromises.readFile(uddPath, 'utf-8');
      existingUdd = JSON.parse(existingContent);
    } catch (error) {
      console.log(`GitDreamNodeService: No existing .udd found, creating new one`);
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
    if (node.type === 'dreamer') {
      if (node.email) udd.email = node.email;
      if (node.phone) udd.phone = node.phone;
      if (node.did) udd.did = node.did;
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
   * This method enforces bidirectionality by using atomic add/remove operations
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

    // Use atomic operations for each change to ensure bidirectionality
    for (const addedId of added) {
      await this.addRelationship(nodeId, addedId);
    }

    for (const removedId of removed) {
      await this.removeRelationship(nodeId, removedId);
    }

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
   * This method enforces bidirectionality by updating BOTH nodes atomically
   */
  async addRelationship(nodeId: string, relatedNodeId: string): Promise<void> {
    const store = useInterBrainStore.getState();
    const nodeData = store.realNodes.get(nodeId);
    const relatedNodeData = store.realNodes.get(relatedNodeId);

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

    // Update both .udd files
    await Promise.all([
      this.updateUDDFile(node),
      this.updateUDDFile(relatedNode)
    ]);

    // Update liminal-web.json for Dreamer nodes
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

    console.log(`GitDreamNodeService: Added bidirectional relationship ${nodeId} <-> ${relatedNodeId}`);
  }

  /**
   * Remove a single relationship (bidirectional)
   * This method enforces bidirectionality by updating BOTH nodes atomically
   */
  async removeRelationship(nodeId: string, relatedNodeId: string): Promise<void> {
    const store = useInterBrainStore.getState();
    const nodeData = store.realNodes.get(nodeId);
    const relatedNodeData = store.realNodes.get(relatedNodeId);

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

      await this.updateUDDFile(node);
      if (node.type === 'dreamer') {
        await this.updateLiminalWebFile(node);
      }
      console.log(`GitDreamNodeService: Removed one-way relationship ${nodeId} -> ${relatedNodeId}`);
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

    // Update both .udd files
    await Promise.all([
      this.updateUDDFile(node),
      this.updateUDDFile(relatedNode)
    ]);

    // Update liminal-web.json for Dreamer nodes
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

    console.log(`GitDreamNodeService: Removed bidirectional relationship ${nodeId} <-> ${relatedNodeId}`);
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
      console.log(`GitDreamNodeService: Updated liminal-web.json for ${node.name} with ${liminalWeb.relationships.length} relationships`);
    } catch (error) {
      console.error(`GitDreamNodeService: Failed to update liminal-web.json for ${node.name}:`, error);
    }
  }
}