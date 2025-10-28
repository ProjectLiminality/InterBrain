import { DreamNode, GitStatus } from '../types/dreamnode';
import { UrlMetadata } from '../utils/url-utils';
import { createLinkFileContent, getLinkFileName } from '../utils/link-file-utils';

/**
 * MockDreamNodeService - Session-based dynamic storage
 * 
 * Provides a mock implementation of DreamNode CRUD operations using
 * in-memory storage. Data persists only for the current session and
 * resets when the plugin is reloaded.
 */
export class MockDreamNodeService {
  private nodes = new Map<string, DreamNode>();
  private fileRefs = new Map<string, globalThis.File>();
  private repositoryFiles = new Map<string, globalThis.File[]>(); // All files in each node's repo
  private idCounter = 1;

  /**
   * Create a new DreamNode with mock data
   */
  async create(
    title: string, 
    type: 'dream' | 'dreamer', 
    dreamTalk?: globalThis.File,
    position?: [number, number, number],
    additionalFiles?: globalThis.File[]
  ): Promise<DreamNode> {
    // Use 'dynamic' prefix to avoid conflicts with static mock data IDs
    const id = `dynamic-${type}-${this.idCounter++}`;
    
    // Store all files for this node
    const allFiles: globalThis.File[] = [];
    
    // Handle dreamTalk media
    let dreamTalkMedia: Array<{ 
      path: string; 
      absolutePath: string; 
      type: string; 
      data: string; 
      size: number 
    }> = [];
    
    if (dreamTalk) {
      this.fileRefs.set(id, dreamTalk);
      allFiles.push(dreamTalk);
      const dataUrl = await this.fileToDataUrl(dreamTalk);
      dreamTalkMedia = [{
        path: `mock/${dreamTalk.name}`,
        absolutePath: `/mock/${id}/${dreamTalk.name}`,
        type: dreamTalk.type,
        data: dataUrl,
        size: dreamTalk.size
      }];
    }
    
    // Handle additional files
    if (additionalFiles && additionalFiles.length > 0) {
      allFiles.push(...additionalFiles);
    }
    
    // Store all files for this repository
    this.repositoryFiles.set(id, allFiles);
    
    // Use provided position (already world coordinates) or calculate random position
    const nodePosition = position 
      ? position // Position is already calculated in world coordinates
      : this.calculateNewNodePosition();
    
    const node: DreamNode = {
      id,
      type,
      name: title,
      position: nodePosition,
      dreamTalkMedia,
      dreamSongContent: [], // Empty for new nodes
      liminalWebConnections: [], // Will be populated as more nodes are created
      repoPath: `/mock/repos/${id}`,
      hasUnsavedChanges: false,
      gitStatus: this.generateMockGitStatus()
    };
    
    this.nodes.set(id, node);
    
    console.log(`MockDreamNodeService: Created ${type} "${title}" with ID ${id} at position:`, nodePosition);
    console.log(`MockDreamNodeService: Position was ${position ? 'provided (world coords)' : 'calculated (random)'}`);
    console.log(`MockDreamNodeService: Repository files for ${id}:`, {
      dreamTalk: dreamTalk ? `${dreamTalk.name} (${dreamTalk.type})` : 'none',
      additionalFiles: additionalFiles?.map(f => `${f.name} (${f.type})`).join(', ') || 'none',
      totalFiles: allFiles.length
    });
    console.log(`MockDreamNodeService: Total nodes in service: ${this.nodes.size}`);
    return node;
  }

  /**
   * Update an existing DreamNode
   */
  async update(id: string, changes: Partial<DreamNode>): Promise<void> {
    const existing = this.nodes.get(id);
    if (!existing) {
      throw new Error(`DreamNode with ID ${id} not found`);
    }
    
    const updated = { ...existing, ...changes };
    this.nodes.set(id, updated);
    
    console.log(`MockDreamNodeService: Updated node ${id}`, changes);
  }

  /**
   * Delete a DreamNode
   */
  async delete(id: string): Promise<void> {
    const existing = this.nodes.get(id);
    if (!existing) {
      throw new Error(`DreamNode with ID ${id} not found`);
    }
    
    // Clean up file references
    this.fileRefs.delete(id);
    this.nodes.delete(id);
    
    console.log(`MockDreamNodeService: Deleted node ${id}`);
  }

  /**
   * List all DreamNodes
   */
  async list(): Promise<DreamNode[]> {
    return Array.from(this.nodes.values());
  }

  /**
   * Get a specific DreamNode by ID
   */
  async get(id: string): Promise<DreamNode | null> {
    return this.nodes.get(id) || null;
  }

  /**
   * Get file reference for a node (for testing purposes)
   */
  getFileRef(id: string): globalThis.File | undefined {
    return this.fileRefs.get(id);
  }

  /**
   * Add files to an existing DreamNode
   * Media files will update/replace dreamTalk, others are added to repository
   */
  async addFilesToNode(nodeId: string, files: globalThis.File[]): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`DreamNode with ID ${nodeId} not found`);
    }

    const existingFiles = this.repositoryFiles.get(nodeId) || [];
    const mediaFiles = files.filter(f => this.isMediaFile(f));
    const otherFiles = files.filter(f => !this.isMediaFile(f));

    // Update dreamTalk if media files are provided
    if (mediaFiles.length > 0) {
      const primaryMedia = mediaFiles[0]; // Use first media file as dreamTalk
      this.fileRefs.set(nodeId, primaryMedia);
      
      const dataUrl = await this.fileToDataUrl(primaryMedia);
      node.dreamTalkMedia = [{
        path: `mock/${primaryMedia.name}`,
        absolutePath: `/mock/${nodeId}/${primaryMedia.name}`,
        type: primaryMedia.type,
        data: dataUrl,
        size: primaryMedia.size
      }];

      console.log(`MockDreamNodeService: ${node.dreamTalkMedia.length > 0 ? 'Replaced' : 'Added'} dreamTalk for ${nodeId}: ${primaryMedia.name}`);
    }

    // Add all files to repository
    const updatedFiles = [...existingFiles, ...files];
    this.repositoryFiles.set(nodeId, updatedFiles);

    // Update the node in storage
    this.nodes.set(nodeId, node);

    // Log complete file inventory
    console.log(`MockDreamNodeService: Files added to ${nodeId}:`, {
      mediaFiles: mediaFiles.map(f => `${f.name} (${f.type})`).join(', ') || 'none',
      otherFiles: otherFiles.map(f => `${f.name} (${f.type})`).join(', ') || 'none',
      totalRepoFiles: updatedFiles.length,
      allFiles: updatedFiles.map(f => `${f.name} (${f.type})`).join(', ')
    });
  }

  /**
   * Check if a file is a media file (image or video)
   */
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
   * Reset all mock data (useful for testing)
   */
  reset(): void {
    // Clean up object URLs for any stored files
    // Note: In a real implementation, we'd revoke object URLs here
    // but since we're using data URLs, no cleanup is needed
    
    this.nodes.clear();
    this.fileRefs.clear();
    this.repositoryFiles.clear();
    this.idCounter = 1;
    
    console.log('MockDreamNodeService: Reset all data');
  }

  /**
   * Refresh git status (mock implementation - regenerates random states)
   */
  async refreshGitStatus(): Promise<{ updated: number; errors: number }> {
    let updated = 0;
    
    // Regenerate random git states for all nodes
    for (const [nodeId, node] of this.nodes) {
      const newGitStatus = this.generateMockGitStatus();
      node.gitStatus = newGitStatus;
      this.nodes.set(nodeId, node);
      updated++;
    }
    
    console.log(`MockDreamNodeService: Refreshed git status for ${updated} nodes with new random states`);
    return { updated, errors: 0 };
  }
  
  /**
   * Get current statistics
   */
  getStats() {
    const nodes = Array.from(this.nodes.values());
    return {
      totalNodes: nodes.length,
      dreamNodes: nodes.filter(n => n.type === 'dream').length,
      dreamerNodes: nodes.filter(n => n.type === 'dreamer').length,
      nodesWithMedia: nodes.filter(n => n.dreamTalkMedia.length > 0).length
    };
  }

  /**
   * Convert File to data URL for storage
   * Note: .link files are read as text (JSON), not data URLs
   */
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

  /**
   * Project a position onto the night sky sphere
   * Takes a position (like the proto-node position) and projects it onto the sphere surface
   */
  private projectPositionToSphere(position: [number, number, number]): [number, number, number] {
    const sphereRadius = 5000; // Night sky sphere radius from DynamicViewScaling
    const [x, y, z] = position;
    
    console.log(`MockDreamNodeService: Projecting position [${x}, ${y}, ${z}] to sphere`);
    
    // Calculate distance from origin (camera position)
    const distance = Math.sqrt(x * x + y * y + z * z);
    
    // If position is at origin, default to forward direction
    if (distance === 0) {
      console.log('MockDreamNodeService: Position at origin, defaulting to forward');
      return [0, 0, -sphereRadius];
    }
    
    // Normalize the direction and scale to sphere radius
    const scale = sphereRadius / distance;
    const projected: [number, number, number] = [x * scale, y * scale, z * scale];
    
    console.log(`MockDreamNodeService: Projected to sphere position:`, projected);
    return projected;
  }
  
  /**
   * Generate mock git status for testing visual indicators
   */
  private generateMockGitStatus(): GitStatus {
    // Randomly generate different git states for visual testing
    const rand = Math.random();
    
    if (rand < 0.4) {
      // 40% clean state
      return {
        hasUncommittedChanges: false,
        hasStashedChanges: false,
        hasUnpushedChanges: false,
        lastChecked: Date.now()
      };
    } else if (rand < 0.7) {
      // 30% uncommitted changes
      return {
        hasUncommittedChanges: true,
        hasStashedChanges: false,
        hasUnpushedChanges: false,
        lastChecked: Date.now(),
        details: {
          staged: Math.floor(Math.random() * 3),
          unstaged: Math.floor(Math.random() * 5) + 1,
          untracked: Math.floor(Math.random() * 2),
          stashCount: 0,
          aheadCount: 0
        }
      };
    } else if (rand < 0.9) {
      // 20% stashed changes
      return {
        hasUncommittedChanges: false,
        hasStashedChanges: true,
        hasUnpushedChanges: false,
        lastChecked: Date.now(),
        details: {
          staged: 0,
          unstaged: 0,
          untracked: 0,
          stashCount: Math.floor(Math.random() * 3) + 1,
          aheadCount: 0
        }
      };
    } else {
      // 10% both uncommitted and stashed
      return {
        hasUncommittedChanges: true,
        hasStashedChanges: true,
        hasUnpushedChanges: false,
        lastChecked: Date.now(),
        details: {
          staged: Math.floor(Math.random() * 2),
          unstaged: Math.floor(Math.random() * 3) + 1,
          untracked: Math.floor(Math.random() * 2),
          stashCount: Math.floor(Math.random() * 2) + 1,
          aheadCount: 0
        }
      };
    }
  }
  
  /**
   * Update relationships for a node (bidirectional)
   * This method enforces bidirectionality by using atomic add/remove operations
   */
  async updateRelationships(nodeId: string, relationshipIds: string[]): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`DreamNode with ID ${nodeId} not found`);
    }

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

    console.log(`MockDreamNodeService: Updated relationships for ${nodeId}:`, {
      added: added.length,
      removed: removed.length,
      total: relationshipIds.length
    });
  }

  /**
   * Get relationships for a node
   */
  async getRelationships(nodeId: string): Promise<string[]> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`DreamNode with ID ${nodeId} not found`);
    }
    return node.liminalWebConnections || [];
  }

  /**
   * Add a single relationship (bidirectional)
   * This method enforces bidirectionality by updating BOTH nodes atomically
   */
  async addRelationship(nodeId: string, relatedNodeId: string): Promise<void> {
    const node = this.nodes.get(nodeId);
    const relatedNode = this.nodes.get(relatedNodeId);

    if (!node) {
      throw new Error(`DreamNode with ID ${nodeId} not found`);
    }

    if (!relatedNode) {
      throw new Error(`Related DreamNode with ID ${relatedNodeId} not found`);
    }

    // Add relationship in both directions
    const relationships = new Set(node.liminalWebConnections || []);
    relationships.add(relatedNodeId);
    node.liminalWebConnections = Array.from(relationships);

    const relatedRelationships = new Set(relatedNode.liminalWebConnections || []);
    relatedRelationships.add(nodeId);
    relatedNode.liminalWebConnections = Array.from(relatedRelationships);

    // Update both nodes
    this.nodes.set(nodeId, node);
    this.nodes.set(relatedNodeId, relatedNode);

    console.log(`MockDreamNodeService: Added bidirectional relationship ${nodeId} <-> ${relatedNodeId}`);
  }

  /**
   * Remove a single relationship (bidirectional)
   * This method enforces bidirectionality by updating BOTH nodes atomically
   */
  async removeRelationship(nodeId: string, relatedNodeId: string): Promise<void> {
    const node = this.nodes.get(nodeId);
    const relatedNode = this.nodes.get(relatedNodeId);

    if (!node) {
      throw new Error(`DreamNode with ID ${nodeId} not found`);
    }

    if (!relatedNode) {
      console.warn(`Related DreamNode with ID ${relatedNodeId} not found - removing one-way relationship only`);
      // Still remove from the first node even if related node is missing
      const relationships = new Set(node.liminalWebConnections || []);
      relationships.delete(relatedNodeId);
      node.liminalWebConnections = Array.from(relationships);
      this.nodes.set(nodeId, node);
      console.log(`MockDreamNodeService: Removed one-way relationship ${nodeId} -> ${relatedNodeId}`);
      return;
    }

    // Remove relationship in both directions
    const relationships = new Set(node.liminalWebConnections || []);
    relationships.delete(relatedNodeId);
    node.liminalWebConnections = Array.from(relationships);

    const relatedRelationships = new Set(relatedNode.liminalWebConnections || []);
    relatedRelationships.delete(nodeId);
    relatedNode.liminalWebConnections = Array.from(relatedRelationships);

    // Update both nodes
    this.nodes.set(nodeId, node);
    this.nodes.set(relatedNodeId, relatedNode);

    console.log(`MockDreamNodeService: Removed bidirectional relationship ${nodeId} <-> ${relatedNodeId}`);
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
    const id = `dynamic-${type}-${this.idCounter++}`;

    // Use provided position or calculate random position
    const nodePosition = position
      ? position // Position is already calculated in world coordinates
      : this.calculateNewNodePosition();

    // Generate .link file name and content (for mock)
    const linkFileName = getLinkFileName(urlMetadata, title);
    const linkFileContent = createLinkFileContent(urlMetadata, title);

    const node: DreamNode = {
      id,
      type,
      name: title,
      position: nodePosition,
      dreamTalkMedia: [{
        path: linkFileName,
        absolutePath: `/mock/repos/${id}/${linkFileName}`,
        type: urlMetadata.type,
        data: linkFileContent, // Store the link file content as data
        size: linkFileContent.length
      }],
      dreamSongContent: [],
      liminalWebConnections: [],
      repoPath: `/mock/repos/${id}`,
      hasUnsavedChanges: false,
      gitStatus: this.generateMockGitStatus()
    };

    this.nodes.set(id, node);

    console.log(`MockDreamNodeService: Created ${type} "${title}" from URL (${urlMetadata.type}) with ID ${id}`);
    console.log(`MockDreamNodeService: Created .link file: ${linkFileName}`);
    console.log(`MockDreamNodeService: URL: ${urlMetadata.url}`);
    return node;
  }

  /**
   * Add URL to an existing DreamNode
   */
  async addUrlToNode(nodeId: string, urlMetadata: UrlMetadata): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`DreamNode with ID ${nodeId} not found`);
    }

    // Generate .link file name and content (for mock)
    const linkFileName = getLinkFileName(urlMetadata, node.name);
    const linkFileContent = createLinkFileContent(urlMetadata);

    // Add .link file as additional dreamTalk media
    const linkMedia = {
      path: linkFileName,
      absolutePath: `${node.repoPath}/${linkFileName}`,
      type: urlMetadata.type,
      data: linkFileContent,
      size: linkFileContent.length
    };

    node.dreamTalkMedia.push(linkMedia);

    this.nodes.set(nodeId, node);

    console.log(`MockDreamNodeService: Added URL (${urlMetadata.type}) to node ${nodeId}: ${urlMetadata.url}`);
    console.log(`MockDreamNodeService: Created .link file: ${linkFileName}`);
  }

  /**
   * Create dreamTalk content for URLs (mock CanvasFile format)
   */
  private createUrlDreamTalkContent(_urlMetadata: UrlMetadata): import('../types/dreamnode').CanvasFile[] {
    // For mock service, we don't actually create files, just return empty array
    // URL content will be handled by README generation in real service
    return [];
  }

  /**
   * Calculate position for new nodes
   * Places them on the night sky sphere (5000 units) for proper dynamic scaling
   */
  private calculateNewNodePosition(): [number, number, number] {
    // Place new nodes on the night sky sphere surface (same as other nodes)
    const sphereRadius = 5000; // Night sky sphere radius from DynamicViewScaling

    const theta = Math.random() * Math.PI * 2; // Random angle around sphere
    const phi = Math.acos(2 * Math.random() - 1); // Random inclination (uniform distribution)

    // Position exactly on sphere surface for consistent behavior with other nodes
    const x = sphereRadius * Math.sin(phi) * Math.cos(theta);
    const y = sphereRadius * Math.sin(phi) * Math.sin(theta);
    const z = sphereRadius * Math.cos(phi);

    return [x, y, z];
  }
}

// Export singleton instance for session persistence
export const mockDreamNodeService = new MockDreamNodeService();