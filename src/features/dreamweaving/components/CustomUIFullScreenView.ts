import { ItemView, WorkspaceLeaf } from 'obsidian';
import { DreamNode } from '../../dreamnode/types/dreamnode';
import { serviceManager } from '../../../core/services/service-manager';
import { createHtmlBlobUrl, revokeHtmlBlobUrl } from '../../dreamnode/utils/html-loader';

export const CUSTOM_UI_FULLSCREEN_VIEW_TYPE = 'custom-ui-fullscreen-view';

/**
 * Fullscreen Obsidian view for DreamNode custom UIs (index.html).
 * Reads HTML from disk, resolves relative paths to Obsidian resource URLs,
 * and renders via blob URL in an iframe (file:// blocked by Chromium).
 */
export class CustomUIFullScreenView extends ItemView {
  private dreamNode: DreamNode | null = null;
  private htmlPath: string = '';
  private iframeEl: HTMLIFrameElement | null = null;
  private blobUrl: string | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return CUSTOM_UI_FULLSCREEN_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.dreamNode?.name ? `${this.dreamNode.name}` : 'Custom UI';
  }

  getIcon(): string {
    return 'layout-template';
  }

  /**
   * Update the view with a new DreamNode and HTML path
   */
  updateContent(dreamNode: DreamNode, htmlPath: string): void {
    this.dreamNode = dreamNode;
    this.htmlPath = htmlPath;

    globalThis.setTimeout(() => {
      this.render();
    }, 10);
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('custom-ui-fullscreen-container');

    container.style.width = '100%';
    container.style.height = '100%';
    container.style.overflow = 'hidden';
    container.style.background = '#000000';
    container.style.display = 'flex';
    container.style.justifyContent = 'center';
    container.style.alignItems = 'center';

    globalThis.setTimeout(() => {
      this.render();
    }, 50);
  }

  private async render(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    if (!container) return;

    // Clear previous content and revoke old blob URL
    container.empty();
    revokeHtmlBlobUrl(this.blobUrl);
    this.blobUrl = null;

    if (!this.htmlPath) {
      container.createEl('div', {
        text: 'No custom UI loaded',
        attr: { style: 'color: #666; font-size: 16px;' }
      });
      return;
    }

    const app = serviceManager.getApp();
    if (!app) {
      container.createEl('div', {
        text: 'App not available',
        attr: { style: 'color: #666; font-size: 16px;' }
      });
      return;
    }

    // Create blob URL with resolved resource paths
    this.blobUrl = await createHtmlBlobUrl(app, this.htmlPath);

    if (!this.blobUrl) {
      container.createEl('div', {
        text: 'Failed to load custom UI',
        attr: { style: 'color: #666; font-size: 16px;' }
      });
      return;
    }

    // Create iframe
    this.iframeEl = container.createEl('iframe', {
      attr: {
        src: this.blobUrl,

        title: this.dreamNode?.name ? `${this.dreamNode.name} Custom UI` : 'Custom UI'
      }
    });

    this.iframeEl.style.width = '100%';
    this.iframeEl.style.height = '100%';
    this.iframeEl.style.border = 'none';
    this.iframeEl.style.background = '#000';
  }

  async onClose(): Promise<void> {
    revokeHtmlBlobUrl(this.blobUrl);
    this.blobUrl = null;
    this.iframeEl = null;
  }

  /**
   * Get the DreamNode ID associated with this view for leaf management
   */
  getDreamNodeId(): string | null {
    return this.dreamNode?.id || null;
  }
}
