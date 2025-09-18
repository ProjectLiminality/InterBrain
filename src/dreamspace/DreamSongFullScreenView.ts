import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import { StrictMode, createElement } from 'react';
import { DreamSong } from '../features/dreamweaving/DreamSong';
import { DreamSongBlock } from '../types/dreamsong';
import { DreamNode } from '../types/dreamnode';
import { useInterBrainStore } from '../store/interbrain-store';
import { serviceManager } from '../services/service-manager';

export const DREAMSONG_FULLSCREEN_VIEW_TYPE = 'dreamsong-fullscreen-view';

export class DreamSongFullScreenView extends ItemView {
  private root: Root | null = null;
  private dreamNode: DreamNode | null = null;
  private blocks: DreamSongBlock[] = [];
  private fileChangeListener: ((file: TFile) => void) | null = null;

  constructor(leaf: WorkspaceLeaf, dreamNode?: DreamNode, blocks?: DreamSongBlock[]) {
    super(leaf);
    this.dreamNode = dreamNode || null;
    this.blocks = blocks || [];
  }

  getViewType(): string {
    return DREAMSONG_FULLSCREEN_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.dreamNode?.name ? `DreamSong: ${this.dreamNode.name}` : 'DreamSong';
  }

  getIcon(): string {
    return 'maximize';
  }

  /**
   * Update the view with new DreamSong blocks
   */
  updateDreamSongBlocks(dreamNode: DreamNode, blocks: DreamSongBlock[]) {
    console.log(`Updating DreamSong view with blocks for: ${dreamNode.name}`);
    this.dreamNode = dreamNode;
    this.blocks = blocks;

    // Use setTimeout to ensure container is ready and avoid timing issues
    globalThis.setTimeout(() => {
      this.render();
    }, 10);

    // Set up file watching for real-time updates
    this.setupFileWatcher();
  }

  /**
   * Set up file watching for real-time DreamSong updates
   */
  private setupFileWatcher() {
    // Clean up existing listener first
    this.cleanupFileWatcher();

    if (!this.dreamNode) {
      return;
    }

    const app = serviceManager.getApp();
    if (!app) {
      return;
    }

    const canvasPath = `${this.dreamNode.repoPath}/DreamSong.canvas`;
    const vault = app.vault;

    // Create the file change handler
    this.fileChangeListener = (file: TFile) => {
      if (file.path === canvasPath) {
        // Parse and update with a small delay to ensure file write is complete
        globalThis.setTimeout(() => {
          this.reparseAndUpdate();
        }, 100);
      }
    };

    // Listen for file modifications and creation
    vault.on('modify', this.fileChangeListener);
    vault.on('create', this.fileChangeListener);
  }

  /**
   * Re-parse the canvas and update the view
   */
  private async reparseAndUpdate() {
    if (!this.dreamNode) {
      return;
    }

    try {
      const canvasPath = `${this.dreamNode.repoPath}/DreamSong.canvas`;

      // Use the same parsing logic as the fullscreen command
      const { parseCanvasToBlocks, resolveMediaPaths } = await import('../services/dreamsong');
      const { CanvasParserService } = await import('../services/canvas-parser-service');

      const canvasParserService = new CanvasParserService(serviceManager.getVaultService());
      const vaultService = serviceManager.getVaultService();

      // Parse canvas using new architecture
      const canvasData = await canvasParserService.parseCanvas(canvasPath);
      let blocks = parseCanvasToBlocks(canvasData, this.dreamNode.id);

      // Resolve media paths to data URLs
      blocks = await resolveMediaPaths(blocks, this.dreamNode.repoPath, vaultService);

      // Update the view with new blocks
      this.blocks = blocks;
      this.render();

    } catch (error) {
      console.error('🎵 [FullScreen] Failed to reparse canvas:', error);
    }
  }

  /**
   * Clean up file watching
   */
  private cleanupFileWatcher() {
    if (this.fileChangeListener) {
      const app = serviceManager.getApp();
      if (app && app.vault) {
        app.vault.off('modify', this.fileChangeListener);
        app.vault.off('create', this.fileChangeListener);
      }
      this.fileChangeListener = null;
    }
  }

  async onOpen(): Promise<void> {
    console.log('DreamSongFullScreenView onOpen called');
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('dreamsong-fullscreen-container');

    // Set up container styling
    const htmlContainer = container as HTMLElement;
    htmlContainer.style.width = '100%';
    htmlContainer.style.height = '100%';
    htmlContainer.style.overflow = 'auto';
    htmlContainer.style.background = '#000000';
    htmlContainer.style.display = 'flex';
    htmlContainer.style.justifyContent = 'center';
    htmlContainer.style.alignItems = 'flex-start';

    // Use setTimeout to ensure container is properly set up before rendering
    globalThis.setTimeout(() => {
      console.log('Initial render after onOpen');
      this.render();
    }, 50);
  }

  private render() {
    console.log('DreamSongFullScreenView render called', {
      hasRoot: !!this.root,
      hasBlocks: !!this.blocks && this.blocks.length > 0,
      dreamNodeName: this.dreamNode?.name
    });

    if (!this.root) {
      const container = this.containerEl.children[1];
      if (!container) {
        console.error('Container not found for DreamSong view');
        return;
      }
      this.root = createRoot(container);
    }

    if (!this.blocks || this.blocks.length === 0) {
      console.log('Rendering loading state (no blocks data)');
      // Show loading or empty state
      this.root.render(
        createElement(StrictMode, null,
          createElement('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              color: '#ffffff',
              fontSize: '18px'
            }
          }, this.dreamNode ? `Loading DreamSong for ${this.dreamNode.name}...` : 'Loading DreamSong...')
        )
      );
      return;
    }

    console.log('Rendering DreamSong component with blocks:', this.blocks);
    // Render the DreamSong component directly - CSS modules handle all styling
    this.root.render(
      createElement(StrictMode, null,
        createElement(DreamSong, {
          blocks: this.blocks,
          sourceDreamNodeId: this.dreamNode?.id,
          dreamNodeName: this.dreamNode?.name,
          dreamTalkMedia: this.dreamNode?.dreamTalkMedia,
          onMediaClick: this.handleMediaClick.bind(this),
          embedded: false
        })
      )
    );
  }

  /**
   * Handle media click navigation
   */
  private handleMediaClick(sourceDreamNodeId: string): void {
    const store = useInterBrainStore.getState();
    const { realNodes, setSelectedNode } = store;
    
    // Convert realNodes Map to dreamNodes array (same pattern as DreamspaceCanvas)
    const dreamNodes = Array.from(realNodes.values()).map(data => data.node);
    
    // Find the DreamNode by ID or name
    const targetNode = dreamNodes.find(node => 
      node.id === sourceDreamNodeId || node.name === sourceDreamNodeId
    );
    
    if (targetNode) {
      setSelectedNode(targetNode);
    }
  }

  async onClose(): Promise<void> {
    // Clean up file watcher
    this.cleanupFileWatcher();

    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }

  /**
   * Get the DreamNode ID associated with this view for leaf management
   */
  getDreamNodeId(): string | null {
    return this.dreamNode?.id || null;
  }
}