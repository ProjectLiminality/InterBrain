import { VaultService } from './vault-service';
import { CanvasParserService, CanvasData, CanvasNode } from './canvas-parser-service';
import { parseCanvasToBlocks } from './dreamsong/parser';

/**
 * Canvas Layout Service
 *
 * Auto-arranges canvas elements in a linear top-to-bottom flow:
 * - Text cards have uniform width, height scales with content
 * - Media nodes positioned in center column
 * - Media-text pairs: media in center, text horizontally offset
 */

export interface LayoutConfig {
  centerX: number;           // X-coordinate for center column
  textCardWidth: number;     // Standard width for text cards
  verticalSpacing: number;   // Gap between elements
  horizontalOffset: number;  // Gap between media and text in pairs
  startY: number;            // Starting Y position
  charHeightRatio: number;   // Approximate height per character for text scaling
}

const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  centerX: 400,
  textCardWidth: 360,  // 600 * 0.6 = 360 (reduced by 40%)
  verticalSpacing: 150,
  horizontalOffset: 50,
  startY: 0,
  charHeightRatio: 0.15  // Rough estimate: 150px per 1000 chars
};

export class CanvasLayoutService {
  constructor(
    private vaultService: VaultService,
    private canvasParser: CanvasParserService
  ) {}

  /**
   * Auto-layout a canvas file with linear top-to-bottom flow
   */
  async autoLayoutCanvas(canvasPath: string, config: Partial<LayoutConfig> = {}): Promise<void> {
    const layoutConfig = { ...DEFAULT_LAYOUT_CONFIG, ...config };

    // Parse canvas
    const canvasData = await this.canvasParser.parseCanvas(canvasPath);

    // Get topologically sorted blocks
    const blocks = parseCanvasToBlocks(canvasData);

    // Build node lookup map
    const nodesMap = new Map<string, CanvasNode>(
      canvasData.nodes.map(node => [node.id, node])
    );

    // Track current Y position
    let currentY = layoutConfig.startY;

    // Process each block in order
    for (const block of blocks) {
      if (block.type === 'media-text') {
        // Handle media-text pair
        const mediaNodeId = block.id.split('-')[0];
        const textNodeId = block.id.split('-')[1];

        const mediaNode = nodesMap.get(mediaNodeId);
        const textNode = nodesMap.get(textNodeId);

        if (mediaNode && textNode) {
          // Normalize media width and calculate height preserving aspect ratio
          const originalAspectRatio = mediaNode.width / mediaNode.height;
          mediaNode.width = layoutConfig.textCardWidth;
          mediaNode.height = layoutConfig.textCardWidth / originalAspectRatio;

          // Position media in center column
          mediaNode.x = layoutConfig.centerX;
          mediaNode.y = currentY;

          // Calculate text height based on content length
          const textHeight = this.calculateTextHeight(textNode.text || '', layoutConfig);
          textNode.width = layoutConfig.textCardWidth;
          textNode.height = textHeight;

          // Position text horizontally adjacent to media
          textNode.x = layoutConfig.centerX + mediaNode.width + layoutConfig.horizontalOffset;
          textNode.y = currentY;

          // Advance Y by the taller of the two elements
          const maxHeight = Math.max(mediaNode.height, textNode.height);
          currentY += maxHeight + layoutConfig.verticalSpacing;
        }
      } else if (block.type === 'media') {
        // Standalone media node
        const mediaNode = nodesMap.get(block.id);
        if (mediaNode) {
          // Normalize media width and calculate height preserving aspect ratio
          const originalAspectRatio = mediaNode.width / mediaNode.height;
          mediaNode.width = layoutConfig.textCardWidth;
          mediaNode.height = layoutConfig.textCardWidth / originalAspectRatio;

          mediaNode.x = layoutConfig.centerX;
          mediaNode.y = currentY;
          currentY += mediaNode.height + layoutConfig.verticalSpacing;
        }
      } else if (block.type === 'text') {
        // Standalone text node
        const textNode = nodesMap.get(block.id);
        if (textNode) {
          const textHeight = this.calculateTextHeight(textNode.text || '', layoutConfig);
          textNode.x = layoutConfig.centerX;
          textNode.y = currentY;
          textNode.width = layoutConfig.textCardWidth;
          textNode.height = textHeight;
          currentY += textHeight + layoutConfig.verticalSpacing;
        }
      }
    }

    // Write updated canvas back to file
    await this.writeCanvas(canvasPath, canvasData);
  }

  /**
   * Calculate text card height based on content length and wrapping
   *
   * Uses realistic text metrics:
   * - Average character width: ~8px (Obsidian's default font)
   * - Line height: ~24px (typical 1.5x line spacing)
   * - Card padding: ~40px (20px top + 20px bottom)
   */
  private calculateTextHeight(text: string, config: LayoutConfig): number {
    const minHeight = 100;   // Minimum card height
    const maxHeight = 2000;  // Maximum card height

    const avgCharWidth = 8;  // Average character width in pixels
    const lineHeight = 24;   // Line height in pixels
    const cardPadding = 40;  // Vertical padding (top + bottom)

    // Calculate how many characters fit per line
    const availableWidth = config.textCardWidth - 40; // Subtract horizontal padding
    const charsPerLine = Math.floor(availableWidth / avgCharWidth);

    // Estimate number of lines (account for newlines in text)
    const textLines = text.split('\n');
    let totalLines = 0;

    for (const line of textLines) {
      if (line.trim() === '') {
        totalLines += 1; // Empty line still takes up space
      } else {
        // Calculate wrapped lines for this paragraph
        const wrappedLines = Math.ceil(line.length / charsPerLine);
        totalLines += Math.max(1, wrappedLines);
      }
    }

    // Calculate total height: lines * lineHeight + padding
    const estimatedHeight = (totalLines * lineHeight) + cardPadding;

    return Math.max(minHeight, Math.min(estimatedHeight, maxHeight));
  }

  /**
   * Write canvas data back to file
   */
  private async writeCanvas(canvasPath: string, canvasData: CanvasData): Promise<void> {
    const canvasJson = JSON.stringify(canvasData, null, 2);
    await this.vaultService.writeFile(canvasPath, canvasJson);
  }
}
