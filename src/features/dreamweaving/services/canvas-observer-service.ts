import { App, Vault, TFile } from 'obsidian';
import { parseLinkFileContent, LinkFileMetadata, getLinkThumbnail } from '../../drag-and-drop';

/**
 * Service that observes canvas DOM changes and replaces .link file previews
 * with proper YouTube thumbnails and play buttons
 *
 * Based on the proven approach from the Canvas Thumbnails plugin:
 * https://github.com/AbyssalSoda/Obsidian-Canvas-Thumbnails
 */
export class CanvasObserverService {
  private observer: MutationObserver | null = null;
  private app: App;
  private vault: Vault;
  private isEnabled = false;

  constructor(app: App) {
    this.app = app;
    this.vault = app.vault;
  }

  /**
   * Start observing canvas changes
   */
  start(): void {
    if (this.isEnabled) {
      return;
    }

    this.observeCanvasChanges();
    this.isEnabled = true;

    // Process any existing canvas nodes after a brief delay
    setTimeout(() => this.processExistingCanvasNodes(), 500);
  }

  /**
   * Stop observing canvas changes
   */
  stop(): void {
    if (!this.isEnabled) {
      return;
    }

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    this.isEnabled = false;
  }

  /**
   * Set up MutationObserver using the proven pattern from Canvas Thumbnails plugin
   */
  private observeCanvasChanges(): void {
    const canvasContainer = document.body;
    const config = { childList: true, subtree: true };

    const callback = (mutationsList: MutationRecord[], _observer: MutationObserver) => {
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList') {
          // Handle added nodes
          mutation.addedNodes.forEach(async (node) => {
            if (!(node instanceof HTMLElement)) return;

            // Look for canvas node content with .link files
            const canvasNodeContent = node.querySelector('.canvas-node-content');
            if (canvasNodeContent && this.isLinkFileNode(canvasNodeContent)) {
              const filePath = this.getFilePath(canvasNodeContent);
              if (filePath) {
                await this.updateCanvasWithThumbnail(canvasNodeContent, filePath);
              }
            }

            // Also check if the node itself is a canvas-node-content
            if (node.classList.contains('canvas-node-content') && this.isLinkFileNode(node)) {
              const filePath = this.getFilePath(node);
              if (filePath) {
                await this.updateCanvasWithThumbnail(node, filePath);
              }
            }
          });
        }
      }
    };

    this.observer = new MutationObserver(callback);
    this.observer.observe(canvasContainer, config);
  }

  /**
   * Check if a canvas node content element represents a .link file
   */
  private isLinkFileNode(canvasNodeContent: Element): boolean {
    const titleElement = canvasNodeContent.querySelector('.file-embed-title');
    const title = titleElement?.textContent?.trim();
    return title?.endsWith('.link') || false;
  }

  /**
   * Get the file title from a canvas node content element
   */
  private getFileTitle(canvasNodeContent: Element): string | null {
    const titleElement = canvasNodeContent.querySelector('.file-embed-title');
    return titleElement?.textContent?.trim() || null;
  }

  /**
   * Get the actual file path from canvas node data attributes
   */
  private getFilePath(canvasNodeContent: Element): string | null {
    // Start with the canvas node content and work our way up
    let currentElement: Element | null = canvasNodeContent;

    // Walk up the DOM tree looking for data-path
    while (currentElement) {
      // Check for data-path attribute
      const dataPath = currentElement.getAttribute('data-path');
      if (dataPath) {
        if (dataPath.endsWith('.link')) {
          return dataPath;
        }
      }

      // Check for other possible data attributes
      const possibleAttrs = ['data-file', 'data-filepath', 'data-src'];
      for (const attr of possibleAttrs) {
        const value = currentElement.getAttribute(attr);
        if (value && value.endsWith('.link')) {
          return value;
        }
      }

      // Move up to parent element
      currentElement = currentElement.parentElement;

      // Safety break - don't go too high up the DOM
      if (currentElement && currentElement.tagName === 'BODY') {
        break;
      }
    }

    // Enhanced fallback: search for .link file by name
    const fileName = this.getFileTitle(canvasNodeContent);
    if (fileName && fileName.endsWith('.link')) {
      const foundPath = this.searchForLinkFile(fileName);
      if (foundPath) {
        return foundPath;
      }
    }

    // Last resort: use the title as filename (original behavior)
    return fileName;
  }

  /**
   * Search for a .link file by name in all vault files
   */
  private searchForLinkFile(fileName: string): string | null {
    try {
      // Get all files in the vault
      const allFiles = this.vault.getAllLoadedFiles();

      // Look for files ending with the target filename
      for (const file of allFiles) {
        if (file.path.endsWith(fileName) && file.path.endsWith('.link')) {
          return file.path;
        }
      }

      // If exact match not found, try to find by just the name part
      const baseFileName = fileName.replace(/\.link$/, '');
      for (const file of allFiles) {
        if (file.path.includes(baseFileName) && file.path.endsWith('.link')) {
          return file.path;
        }
      }

      return null;
    } catch {
      // Ignore canvas parsing errors
      return null;
    }
  }

  /**
   * Process existing canvas nodes when service starts
   */
  private async processExistingCanvasNodes(): Promise<void> {
    const canvasNodeContents = document.querySelectorAll('.canvas-node-content');

    for (const canvasNodeContent of Array.from(canvasNodeContents)) {
      if (this.isLinkFileNode(canvasNodeContent)) {
        const filePath = this.getFilePath(canvasNodeContent);
        if (filePath) {
          await this.updateCanvasWithThumbnail(canvasNodeContent, filePath);
        }
      }
    }
  }

  /**
   * Replace the canvas node content with YouTube thumbnail and play button
   * Based on the proven approach from Canvas Thumbnails plugin
   */
  private async updateCanvasWithThumbnail(canvasNodeContent: Element, filePath: string): Promise<void> {
    try {
      // Check if already processed (avoid duplicate processing)
      if (canvasNodeContent.querySelector('.link-thumbnail-container')) {
        return;
      }

      // Read the .link file content using Obsidian vault API
      const file = this.vault.getAbstractFileByPath(filePath);
      if (!file || !('stat' in file)) {
        return;
      }

      const fileContent = await this.vault.read(file as TFile);

      const linkMetadata = parseLinkFileContent(fileContent);

      if (!linkMetadata) {
        return;
      }

      // Get thumbnail URL
      const thumbnailUrl = getLinkThumbnail(linkMetadata);
      if (!thumbnailUrl) {
        return;
      }

      // Create the thumbnail HTML content
      const thumbnailHTML = this.createThumbnailHTML(linkMetadata, thumbnailUrl, filePath);

      // Replace the entire innerHTML of the canvas node content (proven approach)
      canvasNodeContent.innerHTML = thumbnailHTML;
    } catch {
      // Silently handle thumbnail errors
    }
  }

  /**
   * Create the HTML content for the thumbnail replacement
   */
  private createThumbnailHTML(metadata: LinkFileMetadata, thumbnailUrl: string, _fileName: string): string {
    // const fileNameWithoutExtension = fileName.replace('.link', ''); // For future use

    if (metadata.type === 'youtube' && metadata.videoId) {
      // YouTube video with play button that expands to iframe on click
      // Using youtube-nocookie.com for privacy-enhanced embedding
      const embedUrl = `https://www.youtube-nocookie.com/embed/${metadata.videoId}?autoplay=1`;
      return `
        <div class="link-thumbnail-container" style="
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
          border-radius: 4px;
          background: var(--background-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <img src="${thumbnailUrl}"
               alt="${metadata.title || 'YouTube thumbnail'}"
               style="max-width: 100%; max-height: 100%; object-fit: cover; display: block;"
               onerror="this.parentElement.innerHTML='<div style=\\"color: var(--text-muted); font-size: 12px; text-align: center; padding: 10px;\\">🔗 ${metadata.title || 'Link File'}</div>'">
          <div class="link-play-button" style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 60px;
            height: 60px;
            background: rgba(255, 0, 0, 0.9);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 20px;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            z-index: 10;
          " onclick="
             event.stopPropagation();
             var container = this.parentElement;
             container.innerHTML = '<iframe src=\\'${embedUrl}\\' style=\\'width: 100%; height: 100%; border: none; border-radius: 4px;\\' allow=\\'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture\\' allowfullscreen></iframe>';
           "
             onmouseenter="this.style.transform='translate(-50%, -50%) scale(1.1)'; this.style.background='rgba(255, 0, 0, 1)';"
             onmouseleave="this.style.transform='translate(-50%, -50%) scale(1)'; this.style.background='rgba(255, 0, 0, 0.9)';">
            ▶
          </div>
        </div>
      `;
    } else {
      // Non-YouTube link with title overlay
      return `
        <div class="link-thumbnail-container" style="
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
          border-radius: 4px;
          background: var(--background-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <img src="${thumbnailUrl}"
               alt="${metadata.title || 'Link thumbnail'}"
               style="max-width: 100%; max-height: 100%; object-fit: cover; display: block;"
               onerror="this.parentElement.innerHTML='<div style=\\"color: var(--text-muted); font-size: 12px; text-align: center; padding: 10px;\\">🔗 ${metadata.title || 'Link File'}</div>'">
          ${metadata.title ? `
            <div class="link-title-overlay" style="
              position: absolute;
              bottom: 0;
              left: 0;
              right: 0;
              background: linear-gradient(transparent, rgba(0,0,0,0.7));
              color: white;
              padding: 8px;
              font-size: 12px;
              font-weight: 500;
              text-overflow: ellipsis;
              overflow: hidden;
              white-space: nowrap;
            ">
              ${metadata.title}
            </div>
          ` : ''}
        </div>
      `;
    }
  }
}