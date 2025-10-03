import { App, WorkspaceLeaf, Notice, TFile } from 'obsidian';
import { DreamNode, MediaFile } from '../types/dreamnode';
import { DreamSongBlock } from '../types/dreamsong';
import { DreamSongFullScreenView, DREAMSONG_FULLSCREEN_VIEW_TYPE } from '../dreamspace/DreamSongFullScreenView';
import { generateYouTubeIframe, extractYouTubeVideoId } from '../utils/url-utils';
import { parseLinkFileContent, isLinkFile } from '../utils/link-file-utils';
import { useInterBrainStore } from '../store/interbrain-store';
import { DREAMSPACE_VIEW_TYPE } from '../dreamspace/DreamspaceView';

/**
 * Leaf Manager Service
 *
 * Manages Obsidian leaves for DreamNode content viewing.
 *
 * Normal mode: Creates 50/50 split with DreamSpace on left, single right pane with stacked tabs.
 * Copilot mode: Uses fullscreen overlays that cover the entire workspace for video call sharing.
 *
 * All DreamSong/DreamTalk leaves appear as tabs in the right pane (normal) or overlays (copilot).
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
   * Find the dreamspace leaf in the workspace
   */
  private findDreamspaceLeaf(): WorkspaceLeaf | null {
    const leaves = this.app.workspace.getLeavesOfType(DREAMSPACE_VIEW_TYPE);
    if (leaves.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      console.log(`🎯 [LeafManager] Found dreamspace leaf: ${(leaves[0] as any).id}`);
      return leaves[0];
    }
    console.warn(`⚠️ [LeafManager] No dreamspace leaf found`);
    return null;
  }

  /**
   * Get or create a leaf for DreamSong/DreamTalk leaves
   * In copilot mode: overlays specifically on dreamspace leaf (preserving transcript pane)
   * In normal mode: uses right split pane with tabs
   */
  private getRightLeaf(): WorkspaceLeaf {
    const store = useInterBrainStore.getState();

    // Check if we're in copilot mode - overlay specifically on dreamspace leaf
    if (store.copilotMode.isActive) {
      console.log(`🎯 [LeafManager] Copilot mode active - finding dreamspace leaf for overlay`);

      // Find the dreamspace leaf to overlay on (preserving transcript pane)
      const dreamspaceLeaf = this.findDreamspaceLeaf();
      if (dreamspaceLeaf) {
        // Create overlay specifically on the dreamspace leaf
        console.log(`🎯 [LeafManager] Creating overlay on dreamspace leaf`);
        const overlayLeaf = this.app.workspace.createLeafInParent(dreamspaceLeaf.parent, -1);

        // Set up simple refocus workaround: when overlay closes, refocus transcript
        this.setupOverlayCloseHandler(overlayLeaf);

        return overlayLeaf;
      } else {
        console.warn(`⚠️ [LeafManager] Could not find dreamspace leaf, falling back to generic overlay`);
        return this.app.workspace.getLeaf(false);
      }
    }

    // Normal mode - use split pane with tabs
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
   * Supports both file-based media and URL-based media (YouTube, websites).
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

      // Handle .link files
      if (isLinkFile(mediaFile.path)) {
        await this.openLinkFileInLeaf(dreamNode, mediaFile);
        return;
      }

      // Handle legacy URL-based media (backward compatibility)
      if (mediaFile.path?.startsWith('url:') || mediaFile.absolutePath?.startsWith('http')) {
        await this.openUrlInLeaf(dreamNode, mediaFile);
        return;
      }

      // Handle file-based media (existing logic)
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
      await leaf.openFile(file as TFile);

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
   * Open .link file in a new leaf with HTML content
   */
  private async openLinkFileInLeaf(dreamNode: DreamNode, mediaFile: MediaFile): Promise<void> {
    try {
      const linkMetadata = parseLinkFileContent(mediaFile.data);

      if (!linkMetadata) {
        console.error('Failed to parse .link file metadata');
        new Notice('Invalid .link file format', 3000);
        return;
      }

      const url = linkMetadata.url;

      // Create a temporary HTML file in the vault for the URL content
      const tempFileName = `temp-dreamtalk-${dreamNode.id}-${Date.now()}.md`;
      let htmlContent: string;

      if (linkMetadata.type === 'youtube' && linkMetadata.videoId) {
        htmlContent = `# ${dreamNode.name}\n\n${generateYouTubeIframe(linkMetadata.videoId, 800, 450)}\n\n[Original Link](${url})`;
      } else {
        // For other URLs, create a simple markdown link
        htmlContent = `# ${dreamNode.name}\n\n[${url}](${url})\n\n---\n\n*This is a .link file containing: ${linkMetadata.title || url}*`;
      }

      // Create temporary file
      const tempFile = await this.app.vault.create(tempFileName, htmlContent);

      // Create new leaf in right split group
      const leaf = this.getRightLeaf();
      await leaf.openFile(tempFile);

      // Track this leaf
      this.dreamTalkLeaves.set(dreamNode.id, leaf);

      // Set up cleanup when leaf is closed (also delete temp file)
      this.setupUrlLeafCleanup(dreamNode.id, leaf, tempFile.path);

      console.log(`Successfully opened .link file ${mediaFile.path} in new leaf`);
      new Notice(`Opened ${linkMetadata.type === 'youtube' ? 'YouTube video' : 'link'}: ${dreamNode.name}`);

    } catch (error) {
      console.error('Failed to open .link file:', error);
      new Notice('Failed to open .link file in full-screen', 3000);
    }
  }

  /**
   * Open URL-based media in a new leaf with HTML content
   */
  private async openUrlInLeaf(dreamNode: DreamNode, mediaFile: MediaFile): Promise<void> {
    const url = mediaFile.data || mediaFile.absolutePath;

    // Create a temporary HTML file in the vault for the URL content
    const tempFileName = `temp-dreamtalk-${dreamNode.id}-${Date.now()}.md`;
    let htmlContent: string;

    if (mediaFile.type === 'youtube') {
      const videoId = extractYouTubeVideoId(url);
      if (videoId) {
        htmlContent = `# ${dreamNode.name}\n\n${generateYouTubeIframe(videoId, 800, 450)}\n\n[Original Link](${url})`;
      } else {
        htmlContent = `# ${dreamNode.name}\n\n[${url}](${url})`;
      }
    } else {
      // For other URLs, create a simple markdown link
      htmlContent = `# ${dreamNode.name}\n\n[${url}](${url})\n\n---\n\n*This is a URL-based DreamTalk. Click the link above to open in your browser.*`;
    }

    try {
      // Create temporary file
      const tempFile = await this.app.vault.create(tempFileName, htmlContent);

      // Create new leaf in right split group
      const leaf = this.getRightLeaf();
      await leaf.openFile(tempFile);

      // Track this leaf
      this.dreamTalkLeaves.set(dreamNode.id, leaf);

      // Set up cleanup when leaf is closed (also delete temp file)
      this.setupUrlLeafCleanup(dreamNode.id, leaf, tempFile.path);

      console.log(`Successfully opened URL ${url} in new leaf`);
      new Notice(`Opened ${mediaFile.type === 'youtube' ? 'YouTube video' : 'URL'}: ${dreamNode.name}`);

    } catch (error) {
      console.error('Failed to create temporary file for URL:', error);
      new Notice('Failed to open URL in full-screen', 3000);
    }
  }

  /**
   * Open README file in right pane
   * Creates 50/50 split on first call, then stacks as tabs. Same behavior as DreamTalk media.
   */
  async openReadmeFile(dreamNode: DreamNode): Promise<void> {
    try {
      console.log(`Opening README file for ${dreamNode.name}`);

      // Check if we already have a leaf for this DreamNode's README
      const existingLeaf = this.dreamTalkLeaves.get(`${dreamNode.id}-readme`);

      if (existingLeaf) {
        // Leaf exists, just reveal it
        this.app.workspace.revealLeaf(existingLeaf);
        console.log(`Revealed existing README leaf for ${dreamNode.name}`);
        return;
      }

      // Construct the README path
      const readmePath = `${dreamNode.repoPath}/README.md`;
      console.log(`Looking for README at vault path: ${readmePath}`);

      // Get the file from the vault
      const file = this.app.vault.getAbstractFileByPath(readmePath);

      if (!file) {
        console.error(`README not found in vault: ${readmePath}`);
        new Notice(`README not found: ${readmePath}`, 3000);
        return;
      }

      // Create new leaf in right split group
      const leaf = this.getRightLeaf();
      await leaf.openFile(file as TFile);

      // Track this leaf with special README identifier
      this.dreamTalkLeaves.set(`${dreamNode.id}-readme`, leaf);

      // Set up cleanup when leaf is closed
      this.setupDreamTalkLeafCleanup(`${dreamNode.id}-readme`, leaf);

      console.log(`Successfully opened README ${file.path} in new leaf`);
      new Notice(`Opened README.md`);

    } catch (error) {
      console.error('Failed to open README file:', error);
      new Notice('Failed to open README file', 3000);
    }
  }

  /**
   * Open DreamSong in right pane
   * Creates 50/50 split on first call, then stacks as tabs. Implements one-leaf-per-node strategy.
   */
  async openDreamSongFullScreen(dreamNode: DreamNode, blocks: DreamSongBlock[]): Promise<void> {
    try {
      // Check if we already have a leaf for this DreamNode
      const existingLeaf = this.dreamSongLeaves.get(dreamNode.id);
      
      if (existingLeaf) {
        // Update existing leaf with new data
        const view = existingLeaf.view as DreamSongFullScreenView;
        if (view && view.updateDreamSongBlocks) {
          view.updateDreamSongBlocks(dreamNode, blocks);
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
      if (view && view.updateDreamSongBlocks) {
        view.updateDreamSongBlocks(dreamNode, blocks);
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
      await leaf.openFile(file as TFile);

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
   * Set up automatic cleanup for URL-based leaves (also deletes temporary file)
   */
  private setupUrlLeafCleanup(dreamNodeId: string, leaf: WorkspaceLeaf, tempFilePath: string): void {
    // Listen for leaf detach
    const originalDetach = leaf.detach.bind(leaf);
    leaf.detach = async () => {
      // Only clean up if we still have this leaf tracked
      if (this.dreamTalkLeaves.has(dreamNodeId)) {
        this.dreamTalkLeaves.delete(dreamNodeId);
        console.log(`Auto-cleaned up URL DreamTalk leaf for node: ${dreamNodeId}`);

        // Delete the temporary file
        try {
          const tempFile = this.app.vault.getAbstractFileByPath(tempFilePath);
          if (tempFile) {
            await this.app.vault.delete(tempFile);
            console.log(`Deleted temporary file: ${tempFilePath}`);
          }
        } catch (error) {
          console.warn(`Failed to delete temporary file ${tempFilePath}:`, error);
        }

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
   * Set up handler to refocus transcript when overlay closes in copilot mode
   * Simple workaround: clicking X button breaks focus, so we programmatically refocus
   */
  private setupOverlayCloseHandler(overlayLeaf: WorkspaceLeaf): void {
    // Use workspace layout-change event to detect when this specific leaf closes
    const handler = this.app.workspace.on('layout-change', () => {
      const store = useInterBrainStore.getState();

      // Check if we're still in copilot mode
      if (!store.copilotMode.isActive) {
        this.app.workspace.offref(eventRef);
        return;
      }

      // Check if the overlay leaf still exists in the workspace
      const allLeaves = this.app.workspace.getLeavesOfType(DREAMSONG_FULLSCREEN_VIEW_TYPE);
      const leafStillExists = allLeaves.includes(overlayLeaf);

      // If leaf was closed, trigger refocus and cleanup this listener
      if (!leafStillExists) {
        console.log(`🎯 [LeafManager] Overlay closed, refocusing transcript (simple workaround)`);

        // Simple refocus: click the dreamspace to restore window focus, then let periodic check handle it
        // Even simpler: just call setActiveLeaf on the transcript leaf
        const transcriptLeaves = this.app.workspace.getLeavesOfType('markdown');
        const transcriptLeaf = transcriptLeaves.find(leaf => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const file = (leaf.view as any).file;
          return file && file.path && file.path.includes('transcript-');
        });

        if (transcriptLeaf) {
          // Small delay to let Obsidian settle after close
          setTimeout(() => {
            // Try to focus the Electron window directly (more aggressive than window.focus())
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const electron = (window as any).require?.('electron');
              if (electron?.remote?.getCurrentWindow) {
                const currentWindow = electron.remote.getCurrentWindow();
                currentWindow.focus();
                console.log(`🪟 [LeafManager] Focused Electron window via remote`);
              } else if (electron?.BrowserWindow) {
                const currentWindow = electron.BrowserWindow.getFocusedWindow();
                if (currentWindow) {
                  currentWindow.focus();
                  console.log(`🪟 [LeafManager] Focused Electron window via BrowserWindow`);
                }
              } else {
                // Fallback to regular window.focus()
                window.focus();
                console.log(`🪟 [LeafManager] Focused window (fallback)`);
              }
            } catch {
              // If electron access fails, fall back to window.focus()
              window.focus();
              console.log(`🪟 [LeafManager] Focused window (error fallback)`);
            }

            this.app.workspace.setActiveLeaf(transcriptLeaf, { focus: true });

            // Also focus the editor
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const editor = (transcriptLeaf.view as any).editor;
            if (editor) {
              if (editor.focus) {
                editor.focus();
              }

              // ULTRA HACK: Simulate a click on the editor to trigger whatever input state needs to activate
              // This mimics what happens when user manually clicks
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const editorElement = (editor as any).cm?.dom;
                if (editorElement) {
                  // Dispatch a click event to the editor DOM element
                  const clickEvent = new window.MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                  });
                  editorElement.dispatchEvent(clickEvent);
                  console.log(`🖱️ [LeafManager] Simulated click on editor element`);
                }
              } catch {
                console.log(`⚠️ [LeafManager] Could not simulate click on editor`);
              }
            }

            console.log(`✅ [LeafManager] Transcript refocused after overlay close`);
          }, 100); // Increased delay to 100ms
        }

        // Cleanup this one-time handler
        this.app.workspace.offref(eventRef);
      }
    });

    const eventRef = handler;
    console.log(`🎯 [LeafManager] Set up overlay close handler for transcript refocus`);
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