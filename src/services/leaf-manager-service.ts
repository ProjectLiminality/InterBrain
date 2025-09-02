import { App, WorkspaceLeaf, TFile } from 'obsidian';
import { DreamNode, MediaFile } from '../types/dreamnode';
import { DreamSongData } from '../types/dreamsong';
import { DreamSongFullScreenView, DREAMSONG_FULLSCREEN_VIEW_TYPE } from '../dreamspace/DreamSongFullScreenView';

/**
 * Leaf Manager Service
 * 
 * Manages Obsidian leaves for full-screen DreamNode experiences.
 * Implements one-leaf-per-node strategy with proper cleanup.
 */
export class LeafManagerService {
  private app: App;
  private dreamSongLeaves: Map<string, WorkspaceLeaf> = new Map();

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Open DreamTalk media file in full-screen using Obsidian's built-in viewer
   */
  async openDreamTalkFullScreen(dreamNode: DreamNode, mediaFile: MediaFile): Promise<void> {
    try {
      // For now, we'll use console logging - in the future we can implement
      // custom media viewing or leverage Obsidian's file opening capabilities
      console.log(`Opening DreamTalk media for ${dreamNode.name}:`, {
        type: mediaFile.type,
        name: mediaFile.name,
        size: mediaFile.size
      });

      // Close any existing DreamSong leaf for this node first
      await this.closeDreamSongFullScreen(dreamNode.id);

      // TODO: Implement media file opening
      // This would involve:
      // 1. Creating a temporary file in the vault if needed
      // 2. Using app.workspace.getLeaf().openFile() to open it
      // 3. Or creating a custom media viewer leaf
      
      // For now, just show a notification
      // @ts-ignore - Obsidian's Notice is available globally
      new Notice(`DreamTalk full-screen: ${mediaFile.name} (${mediaFile.type})`);
      
    } catch (error) {
      console.error('Failed to open DreamTalk full-screen:', error);
      // @ts-ignore - Obsidian's Notice is available globally
      new Notice('Failed to open DreamTalk in full-screen', 3000);
    }
  }

  /**
   * Open DreamSong in full-screen leaf
   * Implements one-leaf-per-node strategy
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

      // Create new leaf
      const leaf = this.app.workspace.getLeaf(true); // Force new leaf
      
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
      // @ts-ignore - Obsidian's Notice is available globally
      new Notice('Failed to open DreamSong in full-screen', 3000);
    }
  }

  /**
   * Close DreamSong full-screen leaf for a specific DreamNode
   */
  async closeDreamSongFullScreen(dreamNodeId: string): Promise<void> {
    const leaf = this.dreamSongLeaves.get(dreamNodeId);
    if (leaf) {
      await leaf.detach();
      this.dreamSongLeaves.delete(dreamNodeId);
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
   * Set up automatic cleanup when a leaf is closed by the user
   */
  private setupLeafCleanup(dreamNodeId: string, leaf: WorkspaceLeaf): void {
    // Listen for leaf detach
    const originalDetach = leaf.detach.bind(leaf);
    leaf.detach = async () => {
      this.dreamSongLeaves.delete(dreamNodeId);
      console.log(`Auto-cleaned up DreamSong leaf for node: ${dreamNodeId}`);
      return originalDetach();
    };
  }

  /**
   * Clean up service resources
   */
  destroy(): void {
    this.closeAllDreamSongFullScreen();
    this.dreamSongLeaves.clear();
  }
}