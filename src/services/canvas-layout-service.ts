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
  textCardWidth: 600,
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
   * Calculate text card height based on content length
   */
  private calculateTextHeight(text: string, config: LayoutConfig): number {
    const minHeight = 200;  // Minimum card height
    const maxHeight = 1000; // Maximum card height

    // Estimate height based on character count
    const estimatedHeight = Math.max(minHeight, text.length * config.charHeightRatio);

    return Math.min(estimatedHeight, maxHeight);
  }

  /**
   * Write canvas data back to file
   */
  private async writeCanvas(canvasPath: string, canvasData: CanvasData): Promise<void> {
    const canvasJson = JSON.stringify(canvasData, null, 2);
    await this.vaultService.writeFile(canvasPath, canvasJson);
  }
}
