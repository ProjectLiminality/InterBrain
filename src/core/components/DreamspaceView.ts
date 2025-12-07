import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import { StrictMode, createElement } from 'react';
import DreamspaceCanvas from './DreamspaceCanvas';

export const DREAMSPACE_VIEW_TYPE = 'dreamspace-view';

export class DreamspaceView extends ItemView {
  private root: Root | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return DREAMSPACE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'DreamSpace';
  }

  getIcon(): string {
    return 'globe';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('dreamspace-container');
    
    this.root = createRoot(container);
    this.root.render(
      createElement(StrictMode, null, createElement(DreamspaceCanvas))
    );
  }

  async onClose(): Promise<void> {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }
}