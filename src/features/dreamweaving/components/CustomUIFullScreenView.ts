import { ItemView, WorkspaceLeaf } from 'obsidian';
import { DreamNode } from '../../dreamnode/types/dreamnode';
import { serviceManager } from '../../../core/services/service-manager';
import { createHtmlBlobUrl, revokeHtmlBlobUrl } from '../../dreamnode/utils/html-loader';
import { generateAI, generateStreamAI } from '../../ai-magic/services/inference-service';
import type { TaskComplexity } from '../../ai-magic/types';

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
  private bridge: any = null;
  private bridgeMessageHandler: ((e: MessageEvent) => void) | null = null;
  private aiMessageHandler: ((e: MessageEvent) => void) | null = null;
  private activeStreams: Map<string, AbortController> = new Map();

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

    // Clean up previous bridges and iframe before re-rendering
    this.destroyAIBridge();
    this.destroyBridge();

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

    // Start PRISM bridge if bridge.js exists in the DreamNode
    this.startBridge();

    // Start AI inference bridge (available to all custom UIs)
    this.startAIBridge();
  }

  private startBridge(): void {
    if (!this.dreamNode?.repoPath || !this.iframeEl) return;

    try {
      const fs = require('fs');
      const path = require('path');
      const adapter = serviceManager.getApp()?.vault.adapter as any;
      if (!adapter?.basePath) return;

      const bridgePath = path.join(adapter.basePath, this.dreamNode.repoPath, 'bridge.js');
      if (!fs.existsSync(bridgePath)) return;

      const wtPath = path.join(adapter.basePath, this.dreamNode.repoPath, 'node_modules', 'webtorrent');
      if (!fs.existsSync(wtPath)) return;

      const { PRISMBridge } = require(bridgePath);
      this.bridge = new PRISMBridge();

      this.bridge.start().then((port: number) => {
        console.log(`[PRISM Bridge] fullscreen started on port ${port}`);

        this.bridgeMessageHandler = (e: MessageEvent) => {
          if (e.data?.type === 'prism-bridge-probe' && this.iframeEl?.contentWindow) {
            this.iframeEl.contentWindow.postMessage({ type: 'prism-bridge', port }, '*');
          }
        };
        window.addEventListener('message', this.bridgeMessageHandler);

        const sendPort = () => {
          if (this.iframeEl?.contentWindow) {
            this.iframeEl.contentWindow.postMessage({ type: 'prism-bridge', port }, '*');
          }
        };
        setTimeout(sendPort, 200);
        setTimeout(sendPort, 600);
      }).catch((err: Error) => {
        console.error('[PRISM Bridge] fullscreen failed to start:', err);
      });
    } catch (err) {
      console.error('[PRISM Bridge] fullscreen failed to load:', err);
    }
  }

  private startAIBridge(): void {
    if (!this.iframeEl) return;

    this.aiMessageHandler = async (e: MessageEvent) => {
      if (!this.iframeEl?.contentWindow) return;
      const { data } = e;

      if (data?.type === 'ai-bridge-probe') {
        this.iframeEl.contentWindow.postMessage({
          type: 'ai-bridge-ready',
          version: '2',
          instanceId: data.instanceId || undefined
        }, '*');
        return;
      }

      // Non-streaming request (v1 backward compat)
      if (data?.type === 'ai-inference-request') {
        const { requestId, messages, complexity } = data;
        try {
          const result = await generateAI(messages, (complexity as TaskComplexity) || 'trivial');
          this.iframeEl?.contentWindow?.postMessage({
            type: 'ai-inference-response',
            requestId,
            content: result.content,
            provider: result.provider,
            model: result.model,
          }, '*');
        } catch (err: any) {
          this.iframeEl?.contentWindow?.postMessage({
            type: 'ai-inference-error',
            requestId,
            error: err?.message || String(err),
          }, '*');
        }
        return;
      }

      // Streaming request
      if (data?.type === 'ai-inference-stream-request') {
        const { requestId, messages, complexity, options } = data;
        const abortController = new AbortController();
        this.activeStreams.set(requestId, abortController);

        let partialContent = '';

        try {
          const result = await generateStreamAI(
            messages,
            (chunk: string) => {
              partialContent += chunk;
              this.iframeEl?.contentWindow?.postMessage({
                type: 'ai-inference-stream-chunk',
                requestId,
                chunk,
              }, '*');
            },
            (complexity as TaskComplexity) || 'trivial',
            {
              ...options,
              signal: abortController.signal,
            }
          );

          this.iframeEl?.contentWindow?.postMessage({
            type: 'ai-inference-stream-done',
            requestId,
            provider: result.provider,
            model: result.model,
            usage: result.usage,
          }, '*');
        } catch (err: any) {
          // Don't send error for intentional aborts
          if (err?.name !== 'AbortError') {
            this.iframeEl?.contentWindow?.postMessage({
              type: 'ai-inference-stream-error',
              requestId,
              error: err?.message || String(err),
              partialContent: partialContent || undefined,
            }, '*');
          }
        } finally {
          this.activeStreams.delete(requestId);
        }
        return;
      }

      // Stream cancellation
      if (data?.type === 'ai-inference-stream-cancel') {
        const { requestId } = data;
        const controller = this.activeStreams.get(requestId);
        if (controller) {
          controller.abort();
          this.activeStreams.delete(requestId);
        }
        return;
      }
    };
    window.addEventListener('message', this.aiMessageHandler);
  }

  private destroyAIBridge(): void {
    // Abort all active streams
    for (const controller of this.activeStreams.values()) {
      controller.abort();
    }
    this.activeStreams.clear();

    if (this.aiMessageHandler) {
      window.removeEventListener('message', this.aiMessageHandler);
      this.aiMessageHandler = null;
    }
  }

  private destroyBridge(): void {
    if (this.bridgeMessageHandler) {
      window.removeEventListener('message', this.bridgeMessageHandler);
      this.bridgeMessageHandler = null;
    }
    if (this.bridge) {
      this.bridge.destroy();
      this.bridge = null;
    }
  }

  async onClose(): Promise<void> {
    this.destroyAIBridge();
    this.destroyBridge();
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
