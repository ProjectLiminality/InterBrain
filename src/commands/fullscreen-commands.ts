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
    callback: async () => {
      try {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;
        
        if (!selectedNode) {
          uiService.showError('Please select a DreamNode first');
          return;
        }
        
        // Check if DreamNode has DreamSong data - we need to parse it
        console.log(`Opening DreamSong full-screen for: ${selectedNode.name}`);
        
        // Get services
        const leafManager = serviceManager.getService('leafManagerService');
        const canvasParser = serviceManager.getService('canvasParserService');
        
        if (!leafManager) {
          uiService.showError('Leaf manager service not available');
          return;
        }
        
        if (!canvasParser) {
          uiService.showError('Canvas parser service not available');
          return;
        }
        
        // Try to find and parse DreamSong canvas
        const canvasPath = `${selectedNode.repoPath}/DreamSong.canvas`;
        
        // Check if canvas exists
        const canvasFile = plugin.app.vault.getAbstractFileByPath(canvasPath);
        if (!canvasFile) {
          uiService.showError('No DreamSong.canvas found. Create one first with Ctrl+D');
          return;
        }
        
        // Parse the canvas to get DreamSong data
        try {
          const analysis = await canvasParser.analyzeCanvasDependencies(canvasPath);
          
          // For now, create a simple DreamSong data structure
          // TODO: Implement proper canvas-to-dreamsong parsing
          const dreamSongData = {
            hasContent: analysis.totalFiles > 0,
            totalBlocks: analysis.totalFiles,
            blocks: analysis.allFiles.map((file: any, index: number) => ({
              id: `block-${index}`,
              type: 'text' as const,
              text: `Content from ${file.path}`,
            }))
          };
          
          await leafManager.openDreamSongFullScreen(selectedNode, dreamSongData);
          uiService.showSuccess(`Opened DreamSong for ${selectedNode.name}`);
          
        } catch (parseError) {
          console.error('Failed to parse DreamSong canvas:', parseError);
          
          // Fallback: open with empty state
          const emptyDreamSong = {
            hasContent: false,
            totalBlocks: 0,
            blocks: []
          };
          
          await leafManager.openDreamSongFullScreen(selectedNode, emptyDreamSong);
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