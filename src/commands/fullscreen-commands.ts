import { Plugin } from 'obsidian';
import { UIService } from '../services/ui-service';
import { useInterBrainStore } from '../store/interbrain-store';
import { serviceManager } from '../services/service-manager';

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
        const leafManager = serviceManager.getService('leafManagerService');
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
        
        // Get leaf manager service
        const leafManager = serviceManager.getService('leafManagerService');
        if (!leafManager) {
          uiService.showError('Leaf manager service not available');
          return;
        }
        
        // Use the new DreamSong architecture to parse blocks
        const canvasPath = `${selectedNode.repoPath}/DreamSong.canvas`;

        // Check if canvas exists
        const canvasFile = plugin.app.vault.getAbstractFileByPath(canvasPath);
        if (!canvasFile) {
          uiService.showError('No DreamSong.canvas found. Create one first with Ctrl+D');
          return;
        }

        try {
          // Use the new DreamSong service layer to parse blocks
          const { parseCanvasToBlocks, resolveMediaPaths } = await import('../services/dreamsong');
          const canvasParserService = new (await import('../services/canvas-parser-service')).CanvasParserService(
            serviceManager.getVaultService()
          );
          const vaultService = serviceManager.getVaultService();

          // Parse canvas using new architecture
          const canvasData = await canvasParserService.parseCanvas(canvasPath);
          let blocks = parseCanvasToBlocks(canvasData);

          // Resolve media paths to data URLs
          blocks = await resolveMediaPaths(blocks, selectedNode.repoPath, vaultService);

          console.log(`Parsed ${blocks.length} blocks for fullscreen view`);

          // Open fullscreen view with parsed blocks
          await leafManager.openDreamSongFullScreen(selectedNode, blocks);
          uiService.showSuccess(`Opened DreamSong for ${selectedNode.name}`);

        } catch (parseError) {
          console.error('Failed to parse DreamSong canvas:', parseError);

          // Fallback: open with empty blocks
          await leafManager.openDreamSongFullScreen(selectedNode, []);
          uiService.showInfo(`Opened empty DreamSong for ${selectedNode.name}`);
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to open DreamSong full-screen:', errorMessage);
        uiService.showError(`Failed to open DreamSong: ${errorMessage}`);
      }
    }
  });
}