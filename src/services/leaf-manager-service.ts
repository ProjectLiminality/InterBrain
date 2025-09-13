import { App, WorkspaceLeaf, Notice } from 'obsidian';
import { DreamNode, MediaFile } from '../types/dreamnode';
import { DreamSongData } from '../types/dreamsong';
import { DreamSongFullScreenView, DREAMSONG_FULLSCREEN_VIEW_TYPE } from '../dreamspace/DreamSongFullScreenView';

/**
 * Leaf Manager Service
 * 
 * Manages Obsidian leaves for split-screen DreamNode experiences.
 * Creates 50/50 split: DreamSpace on left, single right pane with stacked tabs.
 * All DreamSong/DreamTalk leaves appear as tabs in the right pane.
 * Implements one-leaf-per-node strategy with proper cleanup.
 */
export class LeafManagerService {
  private app: App;
  private dreamSongLeaves: Map<string, WorkspaceLeaf> = new Map();
  private dreamTalkLeaves: Map<string, WorkspaceLeaf> = new Map();
  private canvasLeaves: Map<string, WorkspaceLeaf> = new Map();
  private rightPaneLeaf: WorkspaceLeaf | null = null;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Get or create a leaf in the right pane for DreamSong/DreamTalk leaves
   */
  private getRightLeaf(): WorkspaceLeaf {
    // If we don't have a right pane yet, create the initial split
    if (!this.rightPaneLeaf || !this.rightPaneLeaf.parent) {
      this.rightPaneLeaf = this.app.workspace.getLeaf('split', 'vertical');
      return this.rightPaneLeaf;
    }
    
    // We have a right pane, so create a new tab within that specific pane group
    // First make sure the right pane is active, then create a tab
    this.app.workspace.setActiveLeaf(this.rightPaneLeaf);
    return this.app.workspace.getLeaf('tab');
  }

  /**
   * Check if any DreamNode leaves are still open
   */
  private hasOpenLeaves(): boolean {
    return this.dreamSongLeaves.size > 0 || this.dreamTalkLeaves.size > 0 || this.canvasLeaves.size > 0;
  }

  /**
   * Collapse the right pane if no leaves remain
   */
  private async collapseRightPaneIfEmpty(): Promise<void> {
    if (!this.hasOpenLeaves() && this.rightPaneLeaf) {
      await this.rightPaneLeaf.detach();
      this.rightPaneLeaf = null;
      console.log('Collapsed right pane - no leaves remaining');
    }
  }

  /**
   * Open DreamTalk media file in right pane
   * Creates 50/50 split on first call, then stacks as tabs. Implements one-leaf-per-node strategy.
   */
  async openDreamTalkFullScreen(dreamNode: DreamNode, mediaFile: MediaFile): Promise<void> {
    try {
      console.log(`Opening DreamTalk media for ${dreamNode.name}:`, {
        type: mediaFile.type,
        path: mediaFile.path,
        size: mediaFile.size
      });

      // Check if we already have a leaf for this DreamNode
      const existingLeaf = this.dreamTalkLeaves.get(dreamNode.id);
      
      if (existingLeaf) {
        // Leaf exists, just reveal it
        this.app.workspace.revealLeaf(existingLeaf);
        console.log(`Revealed existing DreamTalk leaf for ${dreamNode.name}`);
        return;
      }

      // Construct the full path within the vault
      const fullPath = `${dreamNode.repoPath}/${mediaFile.path}`;
      console.log(`Looking for file at vault path: ${fullPath}`);

      // Get the file from the vault
      const file = this.app.vault.getAbstractFileByPath(fullPath);
      
      if (!file) {
        console.error(`File not found in vault: ${fullPath}`);
        new Notice(`File not found: ${mediaFile.path}`, 3000);
        return;
      }

      // Check if it's actually a file (not a folder)
      if (file.path !== fullPath) {
        console.error(`Path mismatch - expected: ${fullPath}, got: ${file.path}`);
        new Notice(`Invalid file path: ${mediaFile.path}`, 3000);
        return;
      }

      // Create new leaf in right split group
      const leaf = this.getRightLeaf();
      await leaf.openFile(file as any); // TFile type
      
      // Track this leaf
      this.dreamTalkLeaves.set(dreamNode.id, leaf);
      
      // Set up cleanup when leaf is closed
      this.setupDreamTalkLeafCleanup(dreamNode.id, leaf);
      
      console.log(`Successfully opened ${file.path} in new leaf`);
      new Notice(`Opened ${mediaFile.path}`);
      
    } catch (error) {
      console.error('Failed to open DreamTalk full-screen:', error);
      new Notice('Failed to open DreamTalk in full-screen', 3000);
    }
  }

  /**
   * Open DreamSong in right pane
   * Creates 50/50 split on first call, then stacks as tabs. Implements one-leaf-per-node strategy.
   */
  async openDreamSongFullScreen(dreamNode: DreamNode, dreamSongData: DreamSongData): Promise<void> {
    try {
      // Check if we already have a leaf for this DreamNode
      const existingLeaf = this.dreamSongLeaves.get(dreamNode.id);
      
      if (existingLeaf) {
        // Update existing leaf with new data
        const view = existingLeaf.view as DreamSongFullScreenView;
        if (view && view.updateDreamSongData) {
          view.updateDreamSongData(dreamNode, dreamSongData);
          this.app.workspace.revealLeaf(existingLeaf);
          return;
        } else {
          // Invalid view, close and recreate
          await this.closeDreamSongFullScreen(dreamNode.id);
        }
      }

      // Create new leaf in right split group
      const leaf = this.getRightLeaf();
      
      // Set the view type and data
      await leaf.setViewState({
        type: DREAMSONG_FULLSCREEN_VIEW_TYPE,
        state: {}
      });

      // Get the view instance and update it
      const view = leaf.view as DreamSongFullScreenView;
      if (view && view.updateDreamSongData) {
        view.updateDreamSongData(dreamNode, dreamSongData);
      }

      // Track this leaf
      this.dreamSongLeaves.set(dreamNode.id, leaf);
      
      // Set up cleanup when leaf is closed
      this.setupLeafCleanup(dreamNode.id, leaf);
      
      // Reveal the leaf (bring to front)
      this.app.workspace.revealLeaf(leaf);
      
      console.log(`Opened DreamSong full-screen for: ${dreamNode.name}`);
      
    } catch (error) {
      console.error('Failed to open DreamSong full-screen:', error);
      new Notice('Failed to open DreamSong in full-screen', 3000);
    }
  }

  /**
   * Open DreamSong canvas file in right pane
   * Creates 50/50 split on first call, then stacks as tabs. Implements one-leaf-per-node strategy.
   */
  async openDreamSongCanvas(dreamNode: DreamNode, canvasPath: string): Promise<void> {
    try {
      console.log(`Opening DreamSong canvas for ${dreamNode.name}:`, canvasPath);

      // Check if we already have a leaf for this DreamNode's canvas
      const existingLeaf = this.canvasLeaves.get(dreamNode.id);

      if (existingLeaf) {
        // Leaf exists, just reveal it
        this.app.workspace.revealLeaf(existingLeaf);
        console.log(`Revealed existing canvas leaf for ${dreamNode.name}`);
        return;
      }

      // Get the file from the vault
      const file = this.app.vault.getAbstractFileByPath(canvasPath);

      if (!file) {
        console.error(`Canvas file not found in vault: ${canvasPath}`);
        new Notice(`Canvas file not found: ${canvasPath}`, 3000);
        return;
      }

      // Check if it's actually a file (not a folder)
      if (file.path !== canvasPath) {
        console.error(`Path mismatch - expected: ${canvasPath}, got: ${file.path}`);
        new Notice(`Invalid canvas file path: ${canvasPath}`, 3000);
        return;
      }

      // Create new leaf in right split group
      const leaf = this.getRightLeaf();
      await leaf.openFile(file as any); // TFile type

      // Track this leaf
      this.canvasLeaves.set(dreamNode.id, leaf);

      // Set up cleanup when leaf is closed
      this.setupCanvasLeafCleanup(dreamNode.id, leaf);

      console.log(`Successfully opened ${file.path} in new leaf`);
      new Notice(`Opened DreamSong canvas for ${dreamNode.name}`);

    } catch (error) {
      console.error('Failed to open DreamSong canvas:', error);
      new Notice('Failed to open DreamSong canvas', 3000);
    }
  }

  /**
   * Close DreamSong full-screen leaf for a specific DreamNode
   */
  async closeDreamSongFullScreen(dreamNodeId: string): Promise<void> {
    const leaf = this.dreamSongLeaves.get(dreamNodeId);
    if (leaf) {
      // Remove from map first to prevent cleanup loop
      this.dreamSongLeaves.delete(dreamNodeId);
      await leaf.detach();
      await this.collapseRightPaneIfEmpty();
      console.log(`Closed DreamSong full-screen for node: ${dreamNodeId}`);
    }
  }

  /**
   * Close all DreamSong full-screen leaves
   */
  async closeAllDreamSongFullScreen(): Promise<void> {
    const promises = Array.from(this.dreamSongLeaves.keys()).map(nodeId => 
      this.closeDreamSongFullScreen(nodeId)
    );
    await Promise.all(promises);
  }

  /**
   * Get currently open DreamSong leaves
   */
  getOpenDreamSongLeaves(): { dreamNodeId: string, leaf: WorkspaceLeaf }[] {
    return Array.from(this.dreamSongLeaves.entries()).map(([dreamNodeId, leaf]) => ({
      dreamNodeId,
      leaf
    }));
  }

  /**
   * Check if a DreamNode has an open DreamSong leaf
   */
  isDreamSongOpen(dreamNodeId: string): boolean {
    return this.dreamSongLeaves.has(dreamNodeId);
  }

  /**
   * Set up automatic cleanup when a DreamSong leaf is closed by the user
   */
  private setupLeafCleanup(dreamNodeId: string, leaf: WorkspaceLeaf): void {
    // Listen for leaf detach
    const originalDetach = leaf.detach.bind(leaf);
    leaf.detach = async () => {
      // Only clean up if we still have this leaf tracked
      if (this.dreamSongLeaves.has(dreamNodeId)) {
        this.dreamSongLeaves.delete(dreamNodeId);
        console.log(`Auto-cleaned up DreamSong leaf for node: ${dreamNodeId}`);
        await this.collapseRightPaneIfEmpty();
      }
      return originalDetach();
    };
  }

  /**
   * Set up automatic cleanup when a DreamTalk leaf is closed by the user
   */
  private setupDreamTalkLeafCleanup(dreamNodeId: string, leaf: WorkspaceLeaf): void {
    // Listen for leaf detach
    const originalDetach = leaf.detach.bind(leaf);
    leaf.detach = async () => {
      // Only clean up if we still have this leaf tracked
      if (this.dreamTalkLeaves.has(dreamNodeId)) {
        this.dreamTalkLeaves.delete(dreamNodeId);
        console.log(`Auto-cleaned up DreamTalk leaf for node: ${dreamNodeId}`);
        await this.collapseRightPaneIfEmpty();
      }
      return originalDetach();
    };
  }

  /**
   * Set up automatic cleanup when a canvas leaf is closed by the user
   */
  private setupCanvasLeafCleanup(dreamNodeId: string, leaf: WorkspaceLeaf): void {
    // Listen for leaf detach
    const originalDetach = leaf.detach.bind(leaf);
    leaf.detach = async () => {
      // Only clean up if we still have this leaf tracked
      if (this.canvasLeaves.has(dreamNodeId)) {
        this.canvasLeaves.delete(dreamNodeId);
        console.log(`Auto-cleaned up canvas leaf for node: ${dreamNodeId}`);
        await this.collapseRightPaneIfEmpty();
      }
      return originalDetach();
    };
  }

  /**
   * Close DreamTalk full-screen leaf for a specific DreamNode
   */
  async closeDreamTalkFullScreen(dreamNodeId: string): Promise<void> {
    const leaf = this.dreamTalkLeaves.get(dreamNodeId);
    if (leaf) {
      // Remove from map first to prevent cleanup loop
      this.dreamTalkLeaves.delete(dreamNodeId);
      await leaf.detach();
      await this.collapseRightPaneIfEmpty();
      console.log(`Closed DreamTalk full-screen for node: ${dreamNodeId}`);
    }
  }

  /**
   * Close all open DreamTalk full-screen leaves
   */
  async closeAllDreamTalkFullScreen(): Promise<void> {
    const promises = Array.from(this.dreamTalkLeaves.keys()).map(nodeId => 
      this.closeDreamTalkFullScreen(nodeId)
    );
    await Promise.all(promises);
  }

  /**
   * Check if a DreamNode has an open DreamTalk leaf
   */
  isDreamTalkOpen(dreamNodeId: string): boolean {
    return this.dreamTalkLeaves.has(dreamNodeId);
  }

  /**
   * Close canvas leaf for a specific DreamNode
   */
  async closeCanvasLeaf(dreamNodeId: string): Promise<void> {
    const leaf = this.canvasLeaves.get(dreamNodeId);
    if (leaf) {
      // Remove from map first to prevent cleanup loop
      this.canvasLeaves.delete(dreamNodeId);
      await leaf.detach();
      await this.collapseRightPaneIfEmpty();
      console.log(`Closed canvas leaf for node: ${dreamNodeId}`);
    }
  }

  /**
   * Close all open canvas leaves
   */
  async closeAllCanvasLeaves(): Promise<void> {
    const promises = Array.from(this.canvasLeaves.keys()).map(nodeId =>
      this.closeCanvasLeaf(nodeId)
    );
    await Promise.all(promises);
  }

  /**
   * Check if a DreamNode has an open canvas leaf
   */
  isCanvasOpen(dreamNodeId: string): boolean {
    return this.canvasLeaves.has(dreamNodeId);
  }

  /**
   * Clean up service resources
   */
  async destroy(): Promise<void> {
    await this.closeAllDreamSongFullScreen();
    await this.closeAllDreamTalkFullScreen();
    await this.closeAllCanvasLeaves();
    this.dreamSongLeaves.clear();
    this.dreamTalkLeaves.clear();
    this.canvasLeaves.clear();
    
    // Clean up right pane
    if (this.rightPaneLeaf) {
      await this.rightPaneLeaf.detach();
      this.rightPaneLeaf = null;
    }
  }
}