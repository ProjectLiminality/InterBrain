/**
 * DreamNode Commands
 *
 * Commands for DreamNode interactions:
 * - Flip animations (front/back)
 * - Full-screen views (DreamTalk/DreamSong)
 * - Reveal containing DreamNode (from file explorer)
 * - Convert folder to DreamNode
 */

import { Plugin, TFolder, TAbstractFile } from 'obsidian';
import { UIService } from '../../core/services/ui-service';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { serviceManager } from '../../core/services/service-manager';
import { getConversationRecordingService } from '../conversational-copilot/services/conversation-recording-service';
import { DreamNodeConversionService } from './services/dreamnode-conversion-service';
import { UDDService } from './services/udd-service';
import { DREAMSPACE_VIEW_TYPE } from '../../core/components/DreamspaceView';

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

        // Record invocation if in copilot mode
        if (store.copilotMode.isActive) {
          try {
            const recordingService = getConversationRecordingService();
            await recordingService.recordInvocation(selectedNode);
          } catch (error) {
            console.warn('Failed to record invocation:', error);
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

  // ========================================
  // DreamNode Navigation Commands
  // ========================================

  // Reveal Containing DreamNode - Navigate to the DreamNode containing the selected file
  plugin.addCommand({
    id: 'reveal-containing-dreamnode',
    name: 'Reveal Containing DreamNode',
    callback: async () => {
      const activeFile = plugin.app.workspace.getActiveFile();
      if (!activeFile) {
        uiService.showWarning('No file selected');
        return;
      }

      await revealContainingDreamNode(plugin, uiService, activeFile);
    }
  });

  // ========================================
  // DreamNode Conversion Commands
  // ========================================

  // Convert Folder to DreamNode - Convert a regular folder into a DreamNode
  plugin.addCommand({
    id: 'convert-to-dreamnode',
    name: 'Convert Folder to DreamNode',
    callback: async () => {
      // This command is typically triggered from context menu, not command palette
      // Show info if no folder is selected
      uiService.showInfo('Right-click a folder in the file explorer to convert it to a DreamNode');
    }
  });
}

// ========================================
// Exported functions for context menu integration
// ========================================

/**
 * Reveal the DreamNode containing a file/folder in DreamSpace
 */
export async function revealContainingDreamNode(
  plugin: Plugin,
  uiService: UIService,
  file: TAbstractFile
): Promise<void> {
  const conversionService = new DreamNodeConversionService(plugin.app, plugin.manifest);

  console.log('[RevealDreamNode] Starting search for:', file.path);

  // Find the containing DreamNode by searching for .udd file
  const dreamNodePath = conversionService.findContainingDreamNode(file);

  console.log('[RevealDreamNode] Found DreamNode path:', dreamNodePath);

  if (!dreamNodePath) {
    uiService.showInfo('No DreamNode found for this item');
    return;
  }

  // Read the UUID from the .udd file using UDDService
  let uuid: string;

  try {
    uuid = await UDDService.getUUID(dreamNodePath);
    console.log('[RevealDreamNode] Read UUID from .udd:', uuid);
  } catch (error) {
    console.error('[RevealDreamNode] Failed to read UUID from .udd:', error);
    uiService.showError('Failed to read DreamNode UUID');
    return;
  }

  // Find the DreamNode by UUID (which is the node ID)
  const store = useInterBrainStore.getState();
  const nodeData = store.dreamNodes.get(uuid);

  if (!nodeData) {
    console.error('[RevealDreamNode] No matching node found for UUID:', uuid);
    console.log('[RevealDreamNode] Available UUIDs:', Array.from(store.dreamNodes.keys()));
    const path = require('path');
    uiService.showWarning(`DreamNode not loaded: ${path.basename(dreamNodePath)}`);
    return;
  }

  const targetNode = nodeData.node;
  console.log('[RevealDreamNode] Found target node:', targetNode.name);

  // Open DreamSpace if not already open
  const dreamspaceLeaf = plugin.app.workspace.getLeavesOfType(DREAMSPACE_VIEW_TYPE)[0];
  if (!dreamspaceLeaf) {
    const leaf = plugin.app.workspace.getLeaf(true);
    await leaf.setViewState({
      type: DREAMSPACE_VIEW_TYPE,
      active: true
    });
    plugin.app.workspace.revealLeaf(leaf);
    // Wait a bit for DreamSpace to initialize
    await new Promise(resolve => setTimeout(resolve, 300));
  } else {
    // Focus existing DreamSpace
    plugin.app.workspace.revealLeaf(dreamspaceLeaf);
  }

  // Select the node
  store.setSelectedNode(targetNode);

  // Switch to liminal-web layout to show the selected node
  if (store.spatialLayout !== 'liminal-web') {
    store.setSpatialLayout('liminal-web');
  }

  uiService.showInfo(`Revealed: ${targetNode.name}`);
}

/**
 * Convert a folder to a DreamNode
 */
export async function convertFolderToDreamNode(
  plugin: Plugin,
  uiService: UIService,
  folder: TFolder,
  radiclePassphrase?: string
): Promise<void> {
  const conversionService = new DreamNodeConversionService(plugin.app, plugin.manifest);

  const result = await conversionService.convertToDreamNode(folder, {
    radiclePassphrase
  });

  if (result.success) {
    uiService.showInfo(`Successfully converted "${result.title}" to DreamNode`);
  } else {
    uiService.showError(`Failed to convert to DreamNode: ${result.error}`);
  }
}
