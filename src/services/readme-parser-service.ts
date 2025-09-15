/**
 * README Parser Service
 *
 * Parses README.md files and converts them to DreamSongBlock format
 * for consistent rendering in the DreamSong component when no canvas exists.
 */

import { DreamSongBlock, MediaInfo } from '../types/dreamsong';
import { VaultService } from './vault-service';
import { serviceManager } from './service-manager';

export class ReadmeParserService {
  constructor(private vaultService: VaultService) {}

  /**
   * Parse README.md file and convert to DreamSongBlock format
   */
  async parseReadmeToBlocks(dreamNodePath: string, sourceDreamNodeId?: string): Promise<DreamSongBlock[]> {
    const readmePath = `${dreamNodePath}/README.md`;

    try {
      // Check if README exists
      const exists = await this.vaultService.fileExists(readmePath);
      if (!exists) {
        return [];
      }

      // Read README content
      const content = await this.vaultService.readFile(readmePath);
      if (!content.trim()) {
        return [];
      }

      // Parse markdown content
      const blocks = await this.parseMarkdownContent(content, dreamNodePath, sourceDreamNodeId);

      return blocks;
    } catch (error) {
      console.error('Error parsing README:', error);
      return [];
    }
  }

  /**
   * Parse markdown content and extract blocks
   */
  private async parseMarkdownContent(content: string, dreamNodePath: string, sourceDreamNodeId?: string): Promise<DreamSongBlock[]> {
    const blocks: DreamSongBlock[] = [];
    const lines = content.split('\n');

    let currentTextBlock = '';
    let blockIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for embedded media using Obsidian's ![[filename]] syntax
      const mediaMatch = line.match(/!\[\[([^\]]+)\]\]/);

      if (mediaMatch) {
        // If we have accumulated text, create a text block first
        if (currentTextBlock.trim()) {
          blocks.push({
            id: `readme-text-${blockIndex++}`,
            type: 'text',
            text: await this.renderMarkdownToHTML(currentTextBlock.trim())
          });
          currentTextBlock = '';
        }

        // Create media block
        const mediaPath = mediaMatch[1];
        const mediaInfo = await this.createMediaInfo(mediaPath, dreamNodePath, sourceDreamNodeId);

        if (mediaInfo) {
          blocks.push({
            id: `readme-media-${blockIndex++}`,
            type: 'media',
            media: mediaInfo
          });
        }
      } else {
        // Accumulate text content
        currentTextBlock += (currentTextBlock ? '\n' : '') + line;
      }
    }

    // Add any remaining text as final block
    if (currentTextBlock.trim()) {
      blocks.push({
        id: `readme-text-${blockIndex++}`,
        type: 'text',
        text: await this.renderMarkdownToHTML(currentTextBlock.trim())
      });
    }

    return blocks;
  }

  /**
   * Create MediaInfo for embedded file
   */
  private async createMediaInfo(mediaPath: string, dreamNodePath: string, sourceDreamNodeId?: string): Promise<MediaInfo | null> {
    try {
      // Construct full path
      const fullPath = `${dreamNodePath}/${mediaPath}`;

      // Check if file exists
      const exists = await this.vaultService.fileExists(fullPath);
      if (!exists) {
        console.warn(`Media file not found: ${fullPath}`);
        return null;
      }

      // Get file info
      const mimeType = this.getMimeType(mediaPath);

      // Read file as data URL
      const dataUrl = await this.vaultService.readFileAsDataURL(fullPath);

      return {
        type: this.getMediaType(mimeType),
        src: dataUrl,
        alt: mediaPath,
        sourceDreamNodeId
      };
    } catch (error) {
      console.error('Error creating media info:', error);
      return null;
    }
  }

  /**
   * Render markdown to HTML using Obsidian's API
   */
  private async renderMarkdownToHTML(markdown: string): Promise<string> {
    try {
      const app = serviceManager.getApp();
      if (!app) {
        // Fallback: return markdown as-is wrapped in div
        return `<div style="white-space: pre-wrap; font-family: inherit; line-height: 1.5;">${this.escapeHtml(markdown)}</div>`;
      }

      // Try to use Obsidian's MarkdownRenderer if available
      const MarkdownRenderer = (globalThis as any).MarkdownRenderer;
      if (MarkdownRenderer && MarkdownRenderer.renderMarkdown) {
        // Create a temporary container for rendering
        const containerEl = globalThis.document.createElement('div');

        // Render markdown using Obsidian's renderer
        await MarkdownRenderer.renderMarkdown(markdown, containerEl, '', null);

        return containerEl.innerHTML;
      }

      // Fallback: Simple markdown-like formatting
      return this.simpleMarkdownToHTML(markdown);
    } catch (error) {
      console.error('Error rendering markdown:', error);
      // Fallback: return markdown as-is
      return `<div style="white-space: pre-wrap; font-family: inherit; line-height: 1.5;">${this.escapeHtml(markdown)}</div>`;
    }
  }

  /**
   * Simple markdown to HTML converter for fallback
   */
  private simpleMarkdownToHTML(markdown: string): string {
    let html = this.escapeHtml(markdown);

    // Convert headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Convert bold and italic
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Convert line breaks
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');

    return `<div style="line-height: 1.5; font-family: inherit;"><p>${html}</p></div>`;
  }

  /**
   * Escape HTML characters
   */
  private escapeHtml(text: string): string {
    const div = globalThis.document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Get MIME type from file extension
   */
  private getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();

    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'mp4':
        return 'video/mp4';
      case 'webm':
        return 'video/webm';
      case 'mp3':
        return 'audio/mp3';
      case 'wav':
        return 'audio/wav';
      case 'ogg':
        return 'audio/ogg';
      case 'pdf':
        return 'application/pdf';
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * Convert MIME type to MediaInfo type
   */
  private getMediaType(mimeType: string): 'video' | 'image' | 'audio' | 'pdf' {
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'application/pdf') return 'pdf';
    return 'image'; // Default fallback
  }
}