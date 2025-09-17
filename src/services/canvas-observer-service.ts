import { App, Vault } from 'obsidian';
import { parseLinkFileContent, LinkFileMetadata, getLinkThumbnail } from '../utils/link-file-utils';

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
      console.log('CanvasObserverService: Already started');
      return;
    }

    console.log('CanvasObserverService: Starting canvas observation for .link files');
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

    console.log('CanvasObserverService: Stopping canvas observation');

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

    const callback = (mutationsList: MutationRecord[], observer: MutationObserver) => {
      console.log('CanvasObserverService: Mutation observed');
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList') {
          console.log('CanvasObserverService: ChildList mutation detected');

          // Handle added nodes
          mutation.addedNodes.forEach(async (node) => {
            console.log('CanvasObserverService: Node added');
            if (!(node instanceof HTMLElement)) return;

            // Look for canvas node content with .link files
            const canvasNodeContent = node.querySelector('.canvas-node-content');
            if (canvasNodeContent && this.isLinkFileNode(canvasNodeContent)) {
              const filePath = this.getFilePath(canvasNodeContent);
              console.log('CanvasObserverService: Canvas node content added with .link file:', filePath);
              if (filePath) {
                await this.updateCanvasWithThumbnail(canvasNodeContent, filePath);
              }
            }

            // Also check if the node itself is a canvas-node-content
            if (node.classList.contains('canvas-node-content') && this.isLinkFileNode(node)) {
              const filePath = this.getFilePath(node);
              console.log('CanvasObserverService: Direct canvas-node-content added with .link file:', filePath);
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
    console.log('CanvasObserverService: MutationObserver initialized');
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
    console.log('CanvasObserverService: Starting path detection for canvas node');

    // Start with the canvas node content and work our way up
    let currentElement: Element | null = canvasNodeContent;

    // Walk up the DOM tree looking for data-path
    while (currentElement) {
      console.log(`CanvasObserverService: Checking element: ${currentElement.tagName}.${currentElement.className}`);

      // Check for data-path attribute
      const dataPath = currentElement.getAttribute('data-path');
      if (dataPath) {
        console.log('CanvasObserverService: Found data-path:', dataPath);
        if (dataPath.endsWith('.link')) {
          return dataPath;
        }
      }

      // Check for other possible data attributes
      const possibleAttrs = ['data-file', 'data-filepath', 'data-src'];
      for (const attr of possibleAttrs) {
        const value = currentElement.getAttribute(attr);
        if (value && value.endsWith('.link')) {
          console.log(`CanvasObserverService: Found file path in ${attr}:`, value);
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

    // Debug: Print all elements and their attributes for manual inspection
    console.log('CanvasObserverService: DEBUG - Could not find path, inspecting DOM structure:');
    let debugElement: Element | null = canvasNodeContent;
    let level = 0;
    while (debugElement && level < 5) {
      const attrs = Array.from(debugElement.attributes).map(attr => `${attr.name}="${attr.value}"`).join(' ');
      console.log(`  Level ${level}: <${debugElement.tagName.toLowerCase()} ${attrs}>`);
      debugElement = debugElement.parentElement;
      level++;
    }

    // Enhanced fallback: search for .link file by name
    const fileName = this.getFileTitle(canvasNodeContent);
    if (fileName && fileName.endsWith('.link')) {
      console.log('CanvasObserverService: Searching for .link file by name:', fileName);
      const foundPath = this.searchForLinkFile(fileName);
      if (foundPath) {
        console.log('CanvasObserverService: Found .link file at path:', foundPath);
        return foundPath;
      }
    }

    // Last resort: use the title as filename (original behavior)
    console.warn('CanvasObserverService: Could not find data-path or locate file, falling back to title');
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
          console.log('CanvasObserverService: Found matching .link file:', file.path);
          return file.path;
        }
      }

      // If exact match not found, try to find by just the name part
      const baseFileName = fileName.replace(/\.link$/, '');
      for (const file of allFiles) {
        if (file.path.includes(baseFileName) && file.path.endsWith('.link')) {
          console.log('CanvasObserverService: Found partial matching .link file:', file.path);
          return file.path;
        }
      }

      console.warn('CanvasObserverService: No matching .link file found for:', fileName);
      return null;
    } catch (error) {
      console.error('CanvasObserverService: Error searching for .link file:', error);
      return null;
    }
  }

  /**
   * Process existing canvas nodes when service starts
   */
  private async processExistingCanvasNodes(): Promise<void> {
    console.log('CanvasObserverService: Processing existing canvas nodes');

    const canvasNodeContents = document.querySelectorAll('.canvas-node-content');
    console.log(`CanvasObserverService: Found ${canvasNodeContents.length} existing canvas node contents`);

    for (const canvasNodeContent of canvasNodeContents) {
      if (this.isLinkFileNode(canvasNodeContent)) {
        const filePath = this.getFilePath(canvasNodeContent);
        console.log('CanvasObserverService: Processing existing .link file:', filePath);
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
    console.log(`CanvasObserverService: Updating canvas with thumbnail for: ${filePath}`);

    try {
      // Check if already processed (avoid duplicate processing)
      if (canvasNodeContent.querySelector('.link-thumbnail-container')) {
        console.log(`CanvasObserverService: Node already processed: ${filePath}`);
        return;
      }

      // Read the .link file content using Obsidian vault API
      const file = this.vault.getAbstractFileByPath(filePath);
      if (!file) {
        console.warn(`CanvasObserverService: File not found in vault: ${filePath}`);
        console.log(`CanvasObserverService: Available files in vault:`, this.vault.getAllLoadedFiles().map(f => f.path));
        return;
      }

      console.log(`CanvasObserverService: Reading file: ${file.path}`);
      const fileContent = await this.vault.read(file);
      console.log(`CanvasObserverService: File content (first 200 chars): ${fileContent.substring(0, 200)}`);

      const linkMetadata = parseLinkFileContent(fileContent);

      if (!linkMetadata) {
        console.warn(`CanvasObserverService: Could not parse link metadata for: ${filePath}`);
        return;
      }

      // Get thumbnail URL
      const thumbnailUrl = getLinkThumbnail(linkMetadata);
      if (!thumbnailUrl) {
        console.warn(`CanvasObserverService: No thumbnail URL for: ${filePath}`);
        return;
      }

      // Create the thumbnail HTML content
      const thumbnailHTML = this.createThumbnailHTML(linkMetadata, thumbnailUrl, filePath);

      // Replace the entire innerHTML of the canvas node content (proven approach)
      canvasNodeContent.innerHTML = thumbnailHTML;

      console.log(`CanvasObserverService: Successfully replaced preview for: ${filePath}`);
    } catch (error) {
      console.error(`CanvasObserverService: Error processing ${filePath}:`, error);
    }
  }

  /**
   * Create the HTML content for the thumbnail replacement
   */
  private createThumbnailHTML(metadata: LinkFileMetadata, thumbnailUrl: string, fileName: string): string {
    const fileNameWithoutExtension = fileName.replace('.link', '');

    if (metadata.type === 'youtube') {
      // YouTube video with play button
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
          " onclick="window.open('${metadata.url}', '_blank'); event.stopPropagation();"
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