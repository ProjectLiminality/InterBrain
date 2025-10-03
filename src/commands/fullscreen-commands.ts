import { Plugin } from 'obsidian';
import { UIService } from '../services/ui-service';
import { useInterBrainStore } from '../store/interbrain-store';
import { serviceManager } from '../services/service-manager';
import { getConversationRecordingService } from '../features/conversational-copilot/services/conversation-recording-service';

/**
 * Full-screen commands for DreamTalk and DreamSong experiences
 */
export function registerFullScreenCommands(
  plugin: Plugin, 
  uiService: UIService
): void {

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

        // Check if canvas exists first
        const canvasExists = await vaultService.fileExists(canvasPath);

        if (canvasExists) {
          // Canvas exists - open DreamSong fullscreen view
          try {
            // Use the new DreamSong service layer to parse blocks
            const { parseCanvasToBlocks, resolveMediaPaths } = await import('../services/dreamsong');
            const canvasParserService = new (await import('../services/canvas-parser-service')).CanvasParserService(
              vaultService
            );

            // Parse canvas using new architecture
            const canvasData = await canvasParserService.parseCanvas(canvasPath);
            let blocks = parseCanvasToBlocks(canvasData, selectedNode.id);

            // Resolve media paths to data URLs
            blocks = await resolveMediaPaths(blocks, selectedNode.repoPath, vaultService);

            console.log(`Parsed ${blocks.length} blocks for canvas fullscreen view`);

            // Open fullscreen view with parsed blocks
            await leafManager.openDreamSongFullScreen(selectedNode, blocks);
            uiService.showSuccess(`Opened DreamSong for ${selectedNode.name}`);

          } catch (parseError) {
            console.error('Failed to parse DreamSong canvas:', parseError);

            // Fallback: open with empty blocks
            await leafManager.openDreamSongFullScreen(selectedNode, []);
            uiService.showInfo(`Opened empty DreamSong for ${selectedNode.name}`);
          }
        } else {
          // No canvas - check for README fallback
          const readmePath = `${selectedNode.repoPath}/README.md`;
          const readmeExists = await vaultService.fileExists(readmePath);

          if (readmeExists) {
            // Open README file directly in Obsidian leaf
            console.log(`No canvas found, opening README for ${selectedNode.name}`);
            await leafManager.openReadmeFile(selectedNode);
            uiService.showSuccess(`Opened README for ${selectedNode.name}`);
          } else {
            // No canvas and no README
            uiService.showError('No DreamSong.canvas or README.md found. Create one first with Ctrl+D or add a README.');
          }
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to open DreamSong full-screen:', errorMessage);
        uiService.showError(`Failed to open DreamSong: ${errorMessage}`);
      }
    }
  });
}