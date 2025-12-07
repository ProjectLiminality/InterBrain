import { TextFileView, WorkspaceLeaf } from 'obsidian';
import { parseLinkFileContent, LinkFileMetadata, getLinkThumbnail } from '../utils/link-file-utils';

export const LINK_FILE_VIEW_TYPE = 'link-view';

/**
 * Custom view for .link files that displays a proper preview
 * instead of raw JSON content
 */
export class LinkFileView extends TextFileView {
  private linkMetadata: LinkFileMetadata | null = null;
  private rawData: string = '';

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return LINK_FILE_VIEW_TYPE;
  }

  getDisplayText(): string {
    if (this.linkMetadata?.title) {
      return this.linkMetadata.title;
    }
    return this.file?.basename || 'Link File';
  }

  async setViewData(data: string, clear: boolean): Promise<void> {
    if (clear) {
      this.clear();
    }

    // Store raw data for getViewData
    this.rawData = data;

    // Parse the .link file content
    this.linkMetadata = parseLinkFileContent(data);

    // Render the preview
    this.renderLinkPreview();
  }

  getViewData(): string {
    return this.rawData;
  }

  clear(): void {
    this.linkMetadata = null;
    this.rawData = '';
    const container = this.containerEl.querySelector('.link-preview-container');
    if (container) {
      container.remove();
    }
  }

  private renderLinkPreview(): void {
    // Clear any existing preview
    this.clear();

    if (!this.linkMetadata) {
      this.containerEl.createDiv({
        cls: 'link-preview-error',
        text: 'Invalid .link file content'
      });
      return;
    }

    // Create preview container
    const container = this.containerEl.createDiv({ cls: 'link-preview-container' });

    // Add styles
    container.style.cssText = `
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--background-primary);
      color: var(--text-normal);
      height: 100%;
      overflow-y: auto;
    `;

    // Render based on link type
    if (this.linkMetadata.type === 'youtube') {
      this.renderYouTubePreview(container);
    } else if (this.linkMetadata.type === 'website') {
      this.renderWebsitePreview(container);
    } else {
      this.renderGenericPreview(container);
    }
  }

  private renderYouTubePreview(container: HTMLElement): void {
    if (!this.linkMetadata) return;

    // Header
    const header = container.createDiv({ cls: 'link-preview-header' });
    header.style.cssText = `
      display: flex;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--background-modifier-border);
    `;

    const icon = header.createDiv({ cls: 'link-preview-icon' });
    icon.style.cssText = `
      width: 32px;
      height: 32px;
      background: #FF0000;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      margin-right: 12px;
    `;
    icon.textContent = '▶';

    const headerText = header.createDiv({ cls: 'link-preview-header-text' });
    headerText.style.cssText = `flex: 1;`;

    const title = headerText.createDiv({ cls: 'link-preview-title' });
    title.style.cssText = `
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 4px;
      color: var(--text-normal);
    `;
    title.textContent = this.linkMetadata.title || 'YouTube Video';

    const subtitle = headerText.createDiv({ cls: 'link-preview-subtitle' });
    subtitle.style.cssText = `
      font-size: 14px;
      color: var(--text-muted);
    `;
    subtitle.textContent = 'YouTube Video Link';

    // Thumbnail
    const thumbnailUrl = getLinkThumbnail(this.linkMetadata);
    if (thumbnailUrl) {
      const thumbnailContainer = container.createDiv({ cls: 'link-preview-thumbnail' });
      thumbnailContainer.style.cssText = `
        position: relative;
        width: 100%;
        max-width: 560px;
        margin: 16px 0;
        border-radius: 8px;
        overflow: hidden;
        background: var(--background-secondary);
      `;

      const img = thumbnailContainer.createEl('img');
      img.src = thumbnailUrl;
      img.alt = this.linkMetadata.title || 'YouTube thumbnail';
      img.style.cssText = `
        width: 100%;
        height: auto;
        display: block;
      `;

      // Play overlay
      const playOverlay = thumbnailContainer.createDiv({ cls: 'play-overlay' });
      playOverlay.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 80px;
        height: 80px;
        background: rgba(255, 0, 0, 0.9);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 32px;
        cursor: pointer;
        transition: all 0.2s ease;
      `;
      playOverlay.textContent = '▶';

      // Add hover effect
      playOverlay.addEventListener('mouseenter', () => {
        playOverlay.style.transform = 'translate(-50%, -50%) scale(1.1)';
      });
      playOverlay.addEventListener('mouseleave', () => {
        playOverlay.style.transform = 'translate(-50%, -50%) scale(1)';
      });

      // Add click handler to open YouTube
      playOverlay.addEventListener('click', () => {
        if (this.linkMetadata?.url) {
          window.open(this.linkMetadata.url, '_blank');
        }
      });
    }

    // Metadata
    this.renderMetadata(container);

    // Actions
    this.renderActions(container);
  }

  private renderWebsitePreview(container: HTMLElement): void {
    if (!this.linkMetadata) return;

    // Header
    const header = container.createDiv({ cls: 'link-preview-header' });
    header.style.cssText = `
      display: flex;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--background-modifier-border);
    `;

    const icon = header.createDiv({ cls: 'link-preview-icon' });
    icon.style.cssText = `
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      margin-right: 12px;
    `;
    icon.textContent = '🔗';

    const headerText = header.createDiv({ cls: 'link-preview-header-text' });
    headerText.style.cssText = `flex: 1;`;

    const title = headerText.createDiv({ cls: 'link-preview-title' });
    title.style.cssText = `
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 4px;
      color: var(--text-normal);
    `;
    title.textContent = this.linkMetadata.title || 'Website Link';

    const subtitle = headerText.createDiv({ cls: 'link-preview-subtitle' });
    subtitle.style.cssText = `
      font-size: 14px;
      color: var(--text-muted);
    `;
    subtitle.textContent = 'Website Link';

    // Metadata
    this.renderMetadata(container);

    // Actions
    this.renderActions(container);
  }

  private renderGenericPreview(container: HTMLElement): void {
    if (!this.linkMetadata) return;

    const header = container.createDiv({ cls: 'link-preview-header' });
    header.style.cssText = `
      display: flex;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--background-modifier-border);
    `;

    const icon = header.createDiv({ cls: 'link-preview-icon' });
    icon.style.cssText = `
      width: 32px;
      height: 32px;
      background: var(--interactive-accent);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      margin-right: 12px;
    `;
    icon.textContent = '🔗';

    const headerText = header.createDiv({ cls: 'link-preview-header-text' });
    headerText.style.cssText = `flex: 1;`;

    const title = headerText.createDiv({ cls: 'link-preview-title' });
    title.style.cssText = `
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 4px;
      color: var(--text-normal);
    `;
    title.textContent = this.linkMetadata.title || 'Link';

    const subtitle = headerText.createDiv({ cls: 'link-preview-subtitle' });
    subtitle.style.cssText = `
      font-size: 14px;
      color: var(--text-muted);
    `;
    subtitle.textContent = 'External Link';

    // Metadata
    this.renderMetadata(container);

    // Actions
    this.renderActions(container);
  }

  private renderMetadata(container: HTMLElement): void {
    if (!this.linkMetadata) return;

    const metadataSection = container.createDiv({ cls: 'link-preview-metadata' });
    metadataSection.style.cssText = `
      margin: 16px 0;
      padding: 16px;
      background: var(--background-secondary);
      border-radius: 8px;
    `;

    const metadataTitle = metadataSection.createDiv({ cls: 'metadata-title' });
    metadataTitle.style.cssText = `
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
      color: var(--text-normal);
    `;
    metadataTitle.textContent = 'Link Information';

    // URL
    const urlRow = metadataSection.createDiv({ cls: 'metadata-row' });
    urlRow.style.cssText = `
      display: flex;
      margin-bottom: 8px;
      font-size: 13px;
    `;

    const urlLabel = urlRow.createDiv({ cls: 'metadata-label' });
    urlLabel.style.cssText = `
      width: 80px;
      color: var(--text-muted);
      flex-shrink: 0;
    `;
    urlLabel.textContent = 'URL:';

    const urlValue = urlRow.createDiv({ cls: 'metadata-value' });
    urlValue.style.cssText = `
      color: var(--text-normal);
      word-break: break-all;
    `;
    urlValue.textContent = this.linkMetadata.url;

    // Type
    const typeRow = metadataSection.createDiv({ cls: 'metadata-row' });
    typeRow.style.cssText = `
      display: flex;
      margin-bottom: 8px;
      font-size: 13px;
    `;

    const typeLabel = typeRow.createDiv({ cls: 'metadata-label' });
    typeLabel.style.cssText = `
      width: 80px;
      color: var(--text-muted);
      flex-shrink: 0;
    `;
    typeLabel.textContent = 'Type:';

    const typeValue = typeRow.createDiv({ cls: 'metadata-value' });
    typeValue.style.cssText = `
      color: var(--text-normal);
    `;
    typeValue.textContent = this.linkMetadata.type;

    // Created
    const createdRow = metadataSection.createDiv({ cls: 'metadata-row' });
    createdRow.style.cssText = `
      display: flex;
      font-size: 13px;
    `;

    const createdLabel = createdRow.createDiv({ cls: 'metadata-label' });
    createdLabel.style.cssText = `
      width: 80px;
      color: var(--text-muted);
      flex-shrink: 0;
    `;
    createdLabel.textContent = 'Created:';

    const createdValue = createdRow.createDiv({ cls: 'metadata-value' });
    createdValue.style.cssText = `
      color: var(--text-normal);
    `;
    const createdDate = new Date(this.linkMetadata.created);
    createdValue.textContent = createdDate.toLocaleDateString() + ' ' + createdDate.toLocaleTimeString();
  }

  private renderActions(container: HTMLElement): void {
    if (!this.linkMetadata) return;

    const actionsSection = container.createDiv({ cls: 'link-preview-actions' });
    actionsSection.style.cssText = `
      margin: 20px 0;
      display: flex;
      gap: 12px;
    `;

    // Open link button
    const openButton = actionsSection.createEl('button', { cls: 'link-preview-button' });
    openButton.style.cssText = `
      padding: 8px 16px;
      background: var(--interactive-accent);
      color: var(--text-on-accent);
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: background 0.2s ease;
    `;
    openButton.textContent = 'Open Link';
    openButton.addEventListener('click', () => {
      if (this.linkMetadata?.url) {
        window.open(this.linkMetadata.url, '_blank');
      }
    });

    // Copy URL button
    const copyButton = actionsSection.createEl('button', { cls: 'link-preview-button' });
    copyButton.style.cssText = `
      padding: 8px 16px;
      background: var(--background-modifier-border);
      color: var(--text-normal);
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: background 0.2s ease;
    `;
    copyButton.textContent = 'Copy URL';
    copyButton.addEventListener('click', async () => {
      if (this.linkMetadata?.url) {
        await navigator.clipboard.writeText(this.linkMetadata.url);
        copyButton.textContent = 'Copied!';
        setTimeout(() => {
          copyButton.textContent = 'Copy URL';
        }, 2000);
      }
    });
  }
}