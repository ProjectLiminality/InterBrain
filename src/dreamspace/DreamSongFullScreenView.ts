import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import { StrictMode, createElement } from 'react';
import { DreamSong } from '../features/dreamweaving/DreamSong';
import { DreamSongData } from '../types/dreamsong';
import { DreamNode } from '../types/dreamnode';

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
    this.dreamNode = dreamNode;
    this.dreamSongData = dreamSongData;
    this.render();
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('dreamsong-fullscreen-container');

    // Add full-screen specific styles
    container.createEl('style', {
      text: `
        .dreamsong-fullscreen-container {
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: rgba(0, 0, 0, 0.95);
        }
        
        .dreamsong-fullscreen-wrapper {
          width: 100%;
          height: 100%;
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          box-sizing: border-box;
        }
      `
    });

    this.render();
  }

  private render() {
    if (!this.root) {
      const container = this.containerEl.children[1];
      this.root = createRoot(container);
    }

    if (!this.dreamSongData) {
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
          }, 'Loading DreamSong...')
        )
      );
      return;
    }

    // Render the exact same DreamSong component - no wrapper needed!
    this.root.render(
      createElement(StrictMode, null,
        createElement('div', {
          className: 'dreamsong-fullscreen-wrapper'
        }, 
          createElement(DreamSong, {
            dreamSongData: this.dreamSongData,
            className: 'dreamsong-fullscreen'
          })
        )
      )
    );
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