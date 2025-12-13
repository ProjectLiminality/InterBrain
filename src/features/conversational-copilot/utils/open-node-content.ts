/**
 * Copilot Node Content Opening
 *
 * Opens the appropriate fullscreen content for a DreamNode during copilot mode.
 * Priority: DreamSong > DreamTalk > README
 *
 * This is copilot-specific because it's used for "invoking" nodes during conversation -
 * opening their content as part of the video call experience.
 */

import { DreamNode } from '../../dreamnode';
import { serviceManager } from '../../../core/services/service-manager';
import { UIService } from '../../../core/services/ui-service';
import type { VaultService } from '../../../core/services/vault-service';
import type { CanvasParserService } from '../../dreamweaving/services/canvas-parser-service';

// Singleton service for UI feedback
const uiService = new UIService();

/**
 * Opens the appropriate fullscreen content for a node during copilot mode.
 * Tries DreamSong first, then DreamTalk media, then README as fallback.
 *
 * @param node - The DreamNode to open content for
 * @param vaultService - VaultService for file existence checks
 * @param canvasParserService - CanvasParserService for DreamSong parsing
 */
export async function openNodeContent(
  node: DreamNode,
  vaultService: VaultService | undefined,
  canvasParserService: CanvasParserService | undefined
): Promise<void> {
  const leafManager = serviceManager.getLeafManagerService();

  if (!leafManager || !vaultService || !canvasParserService) {
    console.error('Services not available for opening content');
    return;
  }

  try {
    // Check for DreamSong first (most rich content)
    const dreamSongPath = `${node.repoPath}/DreamSong.canvas`;
    if (await vaultService.fileExists(dreamSongPath)) {
      console.log(`🎭 [Copilot] Opening DreamSong for ${node.name}`);

      // Parse and open DreamSong
      const canvasData = await canvasParserService.parseCanvas(dreamSongPath);
      const { parseCanvasToBlocks, resolveMediaPaths } = await import('../../dreamweaving/dreamsong/index');
      let blocks = parseCanvasToBlocks(canvasData, node.id);
      blocks = await resolveMediaPaths(blocks, node.repoPath, vaultService);

      await leafManager.openDreamSongFullScreen(node, blocks);
      uiService.showSuccess(`Opened DreamSong for ${node.name}`);
      return;
    }

    // Check for DreamTalk media
    if (node.dreamTalkMedia && node.dreamTalkMedia.length > 0) {
      console.log(`🎤 [Copilot] Opening DreamTalk for ${node.name}`);
      await leafManager.openDreamTalkFullScreen(node, node.dreamTalkMedia[0]);
      uiService.showSuccess(`Opened DreamTalk for ${node.name}`);
      return;
    }

    // Try README as final fallback
    const readmePath = `${node.repoPath}/README.md`;
    if (await vaultService.fileExists(readmePath)) {
      console.log(`📖 [Copilot] Opening README for ${node.name}`);
      await leafManager.openReadmeFile(node);
      uiService.showSuccess(`Opened README for ${node.name}`);
      return;
    }

    // Nothing to display
    console.log(`❌ [Copilot] No content found for ${node.name}`);
    uiService.showInfo("Nothing to display");

  } catch (error) {
    console.error(`Failed to open content for ${node.name}:`, error);
    uiService.showError(`Failed to open content: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
