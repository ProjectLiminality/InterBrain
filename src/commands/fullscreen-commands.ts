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
        
        // First, try to use already-parsed data from Zustand store
        const storedDreamSongData = store.selectedNodeDreamSongData;
        if (storedDreamSongData && selectedNode.id === store.selectedNode?.id) {
          console.log('Using cached DreamSong data from store');
          await leafManager.openDreamSongFullScreen(selectedNode, storedDreamSongData);
          uiService.showSuccess(`Opened DreamSong for ${selectedNode.name}`);
          return;
        }
        
        // Fallback: Parse canvas if no cached data available
        console.log('No cached data found, parsing canvas...');
        const canvasParser = serviceManager.getService('canvasParserService');
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
          
          const dreamSongData = {
            canvasPath,
            dreamNodePath: selectedNode.repoPath,
            hasContent: analysis?.totalFiles > 0,
            totalBlocks: analysis?.totalFiles || 0,
            blocks: (analysis?.allFiles || []).map((file: any, index: number) => ({
              id: `block-${index}`,
              type: 'text' as const,
              text: `Content from ${file.path}`,
            })),
            lastParsed: Date.now()
          };
          
          // Store parsed data for future use
          store.setSelectedNodeDreamSongData(dreamSongData);
          
          await leafManager.openDreamSongFullScreen(selectedNode, dreamSongData);
          uiService.showSuccess(`Opened DreamSong for ${selectedNode.name}`);
          
        } catch (parseError) {
          console.error('Failed to parse DreamSong canvas:', parseError);
          
          // Fallback: open with empty state
          const emptyDreamSong = {
            canvasPath,
            dreamNodePath: selectedNode.repoPath,
            hasContent: false,
            totalBlocks: 0,
            blocks: [],
            lastParsed: Date.now()
          };
          
          // Store empty data for future use
          store.setSelectedNodeDreamSongData(emptyDreamSong);
          
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