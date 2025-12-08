/**
 * DreamNode Commands
 *
 * Commands for DreamNode interactions:
 * - Flip animations (front/back)
 * - Full-screen views (DreamTalk/DreamSong)
 */

import { Plugin } from 'obsidian';
import { UIService } from '../../core/services/ui-service';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { serviceManager } from '../../core/services/service-manager';
import { getConversationRecordingService } from '../conversational-copilot/services/conversation-recording-service';

export function registerDreamNodeCommands(
  plugin: Plugin,
  uiService: UIService
): void {

  // ========================================
  // DreamNode Flip Animation Commands
  // ========================================

  // Flip Selected DreamNode - Toggle flip state
  plugin.addCommand({
    id: 'flip-selected-dreamnode',
    name: 'Flip Selected DreamNode',
    hotkeys: [{ modifiers: ['Ctrl'], key: 'j' }],
    checkCallback: (checking: boolean) => {
      const store = useInterBrainStore.getState();
      const { selectedNode, spatialLayout, flipState } = store;

      // Only available in liminal web mode with a selected node
      const currentFlipState = selectedNode ? flipState.flipStates.get(selectedNode.id) : null;
      const canFlip = spatialLayout === 'liminal-web' &&
                     selectedNode !== null &&
                     !currentFlipState?.isFlipping;

      if (checking) {
        return canFlip;
      }

      if (canFlip && selectedNode) {
        console.log(`🎬 [Command] Flip Selected DreamNode: ${selectedNode.name}`);

        // Determine flip direction based on current state
        const isCurrentlyFlipped = currentFlipState?.isFlipped || false;
        const direction = isCurrentlyFlipped ? 'back-to-front' : 'front-to-back';

        store.startFlipAnimation(selectedNode.id, direction);
      }

      return true;
    }
  });

  // Flip DreamNode to Front (DreamTalk)
  plugin.addCommand({
    id: 'flip-dreamnode-to-front',
    name: 'Flip DreamNode to Front (DreamTalk)',
    checkCallback: (checking: boolean) => {
      const store = useInterBrainStore.getState();
      const { selectedNode, spatialLayout, flipState } = store;

      // Only available if there's a selected node that's currently flipped
      const currentFlipState = selectedNode ? flipState.flipStates.get(selectedNode.id) : null;
      const canFlipToFront = spatialLayout === 'liminal-web' &&
                            selectedNode !== null &&
                            currentFlipState?.isFlipped === true &&
                            !currentFlipState?.isFlipping;

      if (checking) {
        return canFlipToFront;
      }

      if (canFlipToFront && selectedNode) {
        console.log(`🎬 [Command] Flip DreamNode to Front: ${selectedNode.name}`);
        store.startFlipAnimation(selectedNode.id, 'back-to-front');
      }

      return true;
    }
  });

  // Flip DreamNode to Back (DreamSong)
  plugin.addCommand({
    id: 'flip-dreamnode-to-back',
    name: 'Flip DreamNode to Back (DreamSong)',
    checkCallback: (checking: boolean) => {
      const store = useInterBrainStore.getState();
      const { selectedNode, spatialLayout, flipState } = store;

      // Only available if there's a selected node that's not currently flipped
      const currentFlipState = selectedNode ? flipState.flipStates.get(selectedNode.id) : null;
      const canFlipToBack = spatialLayout === 'liminal-web' &&
                           selectedNode !== null &&
                           (currentFlipState?.isFlipped !== true) &&
                           !currentFlipState?.isFlipping;

      if (checking) {
        return canFlipToBack;
      }

      if (canFlipToBack && selectedNode) {
        console.log(`🎬 [Command] Flip DreamNode to Back: ${selectedNode.name}`);
        store.startFlipAnimation(selectedNode.id, 'front-to-back');
      }

      return true;
    }
  });

  // ========================================
  // Full-Screen Commands
  // ========================================

  // Open DreamTalk Full-Screen - Opens media file in Obsidian leaf
  plugin.addCommand({
    id: 'open-dreamtalk-fullscreen',
    name: 'Open DreamTalk Full-Screen',
    hotkeys: [{ modifiers: ['Ctrl'], key: 'l' }],
    callback: async () => {
      try {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;

        if (!selectedNode) {
          uiService.showError('Please select a DreamNode first');
          return;
        }

        if (!selectedNode.dreamTalkMedia[0]) {
          uiService.showError('Selected DreamNode has no DreamTalk media');
          return;
        }

        console.log(`Opening DreamTalk full-screen for: ${selectedNode.name}`);

        // Get leaf manager service
        const leafManager = serviceManager.getLeafManagerService();
        if (!leafManager) {
          uiService.showError('Leaf manager service not available');
          return;
        }

        await leafManager.openDreamTalkFullScreen(selectedNode, selectedNode.dreamTalkMedia[0]);
        uiService.showSuccess(`Opened DreamTalk for ${selectedNode.name}`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to open DreamTalk full-screen:', errorMessage);
        uiService.showError(`Failed to open DreamTalk: ${errorMessage}`);
      }
    }
  });

  // Open DreamSong Full-Screen - Opens DreamSong in dedicated leaf
  plugin.addCommand({
    id: 'open-dreamsong-fullscreen',
    name: 'Open DreamSong Full-Screen',
    hotkeys: [{ modifiers: ['Ctrl'], key: 'k' }],
    callback: async () => {
      try {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;

        if (!selectedNode) {
          uiService.showError('Please select a DreamNode first');
          return;
        }

        console.log(`Opening DreamSong full-screen for: ${selectedNode.name}`);

        // Record invocation if in copilot mode
        if (store.copilotMode.isActive) {
          try {
            const recordingService = getConversationRecordingService();
            await recordingService.recordInvocation(selectedNode);
            console.log(`🎙️ [DreamSong] Recorded invocation for conversation export`);
          } catch (error) {
            console.warn(`⚠️ [DreamSong] Failed to record invocation:`, error);
            // Don't block the fullscreen opening if recording fails
          }
        }

        // Get leaf manager service
        const leafManager = serviceManager.getLeafManagerService();
        if (!leafManager) {
          uiService.showError('Leaf manager service not available');
          return;
        }

        // Use the useDreamSongData logic to determine if we should show canvas or README
        const canvasPath = `${selectedNode.repoPath}/DreamSong.canvas`;
        const vaultService = serviceManager.getVaultService();
        if (!vaultService) {
          uiService.showError('Vault service not available');
          return;
        }

        // Always open DreamSong fullscreen view - it handles empty states internally
        let blocks: any[] = [];

        // Try to parse canvas if it exists
        const canvasExists = await vaultService.fileExists(canvasPath);
        if (canvasExists) {
          try {
            // Use the new DreamSong service layer to parse blocks
            const { parseCanvasToBlocks, resolveMediaPaths } = await import('../dreamweaving/dreamsong/index');
            const canvasParserService = new (await import('../dreamweaving/services/canvas-parser-service')).CanvasParserService(
              vaultService
            );

            // Parse canvas using new architecture
            const canvasData = await canvasParserService.parseCanvas(canvasPath);
            blocks = parseCanvasToBlocks(canvasData, selectedNode.id);

            // Resolve media paths to data URLs
            blocks = await resolveMediaPaths(blocks, selectedNode.repoPath, vaultService);

            console.log(`Parsed ${blocks.length} blocks for canvas fullscreen view`);
          } catch (parseError) {
            console.error('Failed to parse DreamSong canvas:', parseError);
            // Continue with empty blocks
          }
        }

        // Open fullscreen view (with or without blocks)
        await leafManager.openDreamSongFullScreen(selectedNode, blocks);
        uiService.showSuccess(`Opened DreamSong for ${selectedNode.name}`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to open DreamSong full-screen:', errorMessage);
        uiService.showError(`Failed to open DreamSong: ${errorMessage}`);
      }
    }
  });
}
