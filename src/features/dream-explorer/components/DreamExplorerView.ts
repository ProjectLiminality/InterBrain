/**
 * Dream Explorer ItemView
 *
 * Obsidian ItemView that hosts the DreamExplorer React component.
 * Single-instance leaf pattern (same as DreamSongFullScreenView).
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import { StrictMode, createElement } from 'react';
import { DreamExplorer } from './DreamExplorer';
import { useInterBrainStore } from '../../../core/store/interbrain-store';

export const DREAM_EXPLORER_VIEW_TYPE = 'dream-explorer-view';

export class DreamExplorerView extends ItemView {
  private root: Root | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return DREAM_EXPLORER_VIEW_TYPE;
  }

  getDisplayText(): string {
    const path = useInterBrainStore.getState().dreamExplorer.currentPath;
    if (path) {
      const name = path.split('/').pop() || path;
      return `Explorer: ${name}`;
    }
    return 'Dream Explorer';
  }

  getIcon(): string {
    return 'compass';
  }

  /**
   * Navigate the explorer to a specific path.
   * If path is empty, the explorer will show an error state.
   */
  updatePath(path: string, rootName?: string): void {
    if (!path) {
      console.warn('[DreamExplorerView] Cannot open explorer without a path');
      return;
    }
    const store = useInterBrainStore.getState();
    store.explorerOpen(path, rootName);
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('dream-explorer-container');

    const htmlContainer = container as HTMLElement;
    htmlContainer.style.width = '100%';
    htmlContainer.style.height = '100%';
    htmlContainer.style.overflow = 'hidden';
    htmlContainer.style.background = '#000000';

    this.root = createRoot(htmlContainer);
    this.root.render(
      createElement(StrictMode, null,
        createElement(DreamExplorer)
      )
    );
  }

  async onClose(): Promise<void> {
    // Close the explorer state
    useInterBrainStore.getState().explorerClose();

    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }
}
