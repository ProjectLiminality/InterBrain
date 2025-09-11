import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import { StrictMode, createElement } from 'react';
import { DreamSong } from '../features/dreamweaving/DreamSong';
import { DreamSongData } from '../types/dreamsong';
import { DreamNode } from '../types/dreamnode';
import { useInterBrainStore } from '../store/interbrain-store';

export const DREAMSONG_FULLSCREEN_VIEW_TYPE = 'dreamsong-fullscreen-view';

export class DreamSongFullScreenView extends ItemView {
  private root: Root | null = null;
  private dreamNode: DreamNode | null = null;
  private dreamSongData: DreamSongData | null = null;

  constructor(leaf: WorkspaceLeaf, dreamNode?: DreamNode, dreamSongData?: DreamSongData) {
    super(leaf);
    this.dreamNode = dreamNode || null;
    this.dreamSongData = dreamSongData || null;
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
   * Update the view with new DreamSong data
   */
  updateDreamSongData(dreamNode: DreamNode, dreamSongData: DreamSongData) {
    console.log(`Updating DreamSong view with data for: ${dreamNode.name}`);
    this.dreamNode = dreamNode;
    this.dreamSongData = dreamSongData;
    
    // Use setTimeout to ensure container is ready and avoid timing issues
    globalThis.setTimeout(() => {
      this.render();
    }, 10);
  }

  async onOpen(): Promise<void> {
    console.log('DreamSongFullScreenView onOpen called');
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('dreamsong-fullscreen-container');

    // Add full-screen specific styles
    container.createEl('style', {
      text: `
        .dreamsong-fullscreen-container {
          width: 100%;
          height: 100%;
          overflow: auto;
          background: rgba(0, 0, 0, 0.95);
        }
        
        .dreamsong-fullscreen-wrapper {
          width: 100%;
          height: 100%;
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          box-sizing: border-box;
          overflow-y: auto;
        }
      `
    });

    // Use setTimeout to ensure container is properly set up before rendering
    globalThis.setTimeout(() => {
      console.log('Initial render after onOpen');
      this.render();
    }, 50);
  }

  private render() {
    console.log('DreamSongFullScreenView render called', {
      hasRoot: !!this.root,
      hasDreamSongData: !!this.dreamSongData,
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

    if (!this.dreamSongData) {
      console.log('Rendering loading state (no DreamSong data)');
      // Show loading or empty state
      this.root.render(
        createElement(StrictMode, null,
          createElement('div', {
            className: 'dreamsong-fullscreen-wrapper',
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '18px'
            }
          }, this.dreamNode ? `Loading DreamSong for ${this.dreamNode.name}...` : 'Loading DreamSong...')
        )
      );
      return;
    }

    console.log('Rendering DreamSong component with data:', this.dreamSongData);
    // Render the exact same DreamSong component - no wrapper needed!
    this.root.render(
      createElement(StrictMode, null,
        createElement('div', {
          className: 'dreamsong-fullscreen-wrapper',
          'data-type': 'dreamsong-fullscreen',
          'data-node-id': this.dreamNode?.id
        }, 
          createElement(DreamSong, {
            dreamSongData: this.dreamSongData,
            className: 'dreamsong-fullscreen',
            sourceDreamNodeId: this.dreamNode?.id,
            onMediaClick: this.handleMediaClick.bind(this)
          })
        )
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