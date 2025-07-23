import { DreamNode } from '../types/dreamnode';

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
      hasUnsavedChanges: false
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
      'video/webm'
    ];
    
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
   */
  private async fileToDataUrl(file: globalThis.File): Promise<string> {
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