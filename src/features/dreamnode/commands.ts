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
import { sanitizeTitleToPascalCase } from './utils/title-sanitization';
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

      // Only available in liminal web mode with a selected Dream node
      // Dreamers cannot flip - they don't participate in holarchy
      const currentFlipState = selectedNode ? flipState.flipStates.get(selectedNode.id) : null;
      const canFlip = spatialLayout === 'liminal-web' &&
                     selectedNode !== null &&
                     selectedNode.type !== 'dreamer' && // Dreamers cannot flip
                     !currentFlipState?.isFlipping;

      if (checking) {
        return canFlip;
      }

      if (canFlip && selectedNode) {
        store.requestNavigation({ type: 'flip', nodeId: selectedNode.id });
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

      // Only available if there's a selected Dream node that's currently flipped
      // Dreamers cannot flip - they don't participate in holarchy
      const currentFlipState = selectedNode ? flipState.flipStates.get(selectedNode.id) : null;
      const canFlipToFront = spatialLayout === 'liminal-web' &&
                            selectedNode !== null &&
                            selectedNode.type !== 'dreamer' && // Dreamers cannot flip
                            currentFlipState?.flipSide === 'back' &&
                            !currentFlipState?.isFlipping;

      if (checking) {
        return canFlipToFront;
      }

      if (canFlipToFront && selectedNode) {
        store.requestNavigation({ type: 'flip', nodeId: selectedNode.id });
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

      // Only available if there's a selected Dream node that's not currently flipped
      // Dreamers cannot flip - they don't participate in holarchy
      const currentFlipState = selectedNode ? flipState.flipStates.get(selectedNode.id) : null;
      const canFlipToBack = spatialLayout === 'liminal-web' &&
                           selectedNode !== null &&
                           selectedNode.type !== 'dreamer' && // Dreamers cannot flip
                           (currentFlipState?.flipSide !== 'back') &&
                           !currentFlipState?.isFlipping;

      if (checking) {
        return canFlipToBack;
      }

      if (canFlipToBack && selectedNode) {
        store.requestNavigation({ type: 'flip', nodeId: selectedNode.id });
      }

      return true;
    }
  });

  // ========================================
  // Carousel Navigation Commands (Back Side)
  // ========================================

  // Cycle DreamSong Carousel Left - Navigate to previous view (holarchy/DreamSongs)
  plugin.addCommand({
    id: 'cycle-dreamsong-left',
    name: 'Cycle DreamSong View Left',
    hotkeys: [{ modifiers: ['Ctrl'], key: 'ArrowLeft' }],
    checkCallback: (checking: boolean) => {
      const store = useInterBrainStore.getState();
      const { selectedNode, spatialLayout, flipState } = store;

      // Only available in liminal web mode with a flipped node
      const currentFlipState = selectedNode ? flipState.flipStates.get(selectedNode.id) : null;
      const canCycle = spatialLayout === 'liminal-web' &&
                      selectedNode !== null &&
                      currentFlipState?.flipSide === 'back' &&
                      !currentFlipState?.isFlipping;

      if (checking) {
        return canCycle;
      }

      if (canCycle && selectedNode) {
        // Note: totalItems is determined by the component, so we use a large number here
        // The cycleCarousel function handles wrapping correctly
        // A better approach would be to store totalItems in the store, but for now this works
        store.cycleCarousel(selectedNode.id, 'left', 100);
      }

      return true;
    }
  });

  // Cycle DreamSong Carousel Right - Navigate to next view (holarchy/DreamSongs)
  plugin.addCommand({
    id: 'cycle-dreamsong-right',
    name: 'Cycle DreamSong View Right',
    hotkeys: [{ modifiers: ['Ctrl'], key: 'ArrowRight' }],
    checkCallback: (checking: boolean) => {
      const store = useInterBrainStore.getState();
      const { selectedNode, spatialLayout, flipState } = store;

      // Only available in liminal web mode with a flipped node
      const currentFlipState = selectedNode ? flipState.flipStates.get(selectedNode.id) : null;
      const canCycle = spatialLayout === 'liminal-web' &&
                      selectedNode !== null &&
                      currentFlipState?.flipSide === 'back' &&
                      !currentFlipState?.isFlipping;

      if (checking) {
        return canCycle;
      }

      if (canCycle && selectedNode) {
        // Note: totalItems is determined by the component, so we use a large number here
        store.cycleCarousel(selectedNode.id, 'right', 100);
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

        const vaultService = serviceManager.getVaultService();
        if (!vaultService) {
          uiService.showError('Vault service not available');
          return;
        }

        // Prioritize custom UI (index.html) over DreamSong canvas
        const customUIPath = `${selectedNode.repoPath}/index.html`;
        const hasCustomUI = await vaultService.fileExists(customUIPath);

        if (hasCustomUI) {
          await leafManager.openCustomUIFullScreen(selectedNode, customUIPath);
          uiService.showSuccess(`Opened Custom UI for ${selectedNode.name}`);
          return;
        }

        // Fall back to DreamSong canvas
        const canvasPath = `${selectedNode.repoPath}/DreamSong.canvas`;
        let blocks: any[] = [];

        const canvasExists = await vaultService.fileExists(canvasPath);
        if (canvasExists) {
          try {
            const { parseCanvasToBlocks, resolveMediaPaths } = await import('../dreamweaving/dreamsong/index');
            const canvasParserService = new (await import('../dreamweaving/services/canvas-parser-service')).CanvasParserService(
              vaultService
            );

            const canvasData = await canvasParserService.parseCanvas(canvasPath);
            blocks = parseCanvasToBlocks(canvasData, selectedNode.id);
            blocks = await resolveMediaPaths(blocks, selectedNode.repoPath, vaultService);
          } catch (parseError) {
            console.error('Failed to parse DreamSong canvas:', parseError);
          }
        }

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

  // Vault Health Check - Run Convert to DreamNode on all sovereign DreamNodes
  plugin.addCommand({
    id: 'vault-health-check',
    name: 'Vault Health Check',
    callback: async () => {
      await runVaultHealthCheck(plugin, uiService);
    }
  });

  // Vault Health Check (Dry Run) - Preview all changes without executing them
  plugin.addCommand({
    id: 'vault-health-check-dry-run',
    name: 'Vault Health Check (Dry Run)',
    callback: async () => {
      await runVaultHealthCheck(plugin, uiService, { dryRun: true });
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

/**
 * Open DreamSong for the DreamNode containing a file/folder
 */
export async function openDreamSongForFile(
  plugin: Plugin,
  uiService: UIService,
  file: TAbstractFile
): Promise<void> {
  const conversionService = new DreamNodeConversionService(plugin.app, plugin.manifest);

  // Find the containing DreamNode
  const dreamNodePath = conversionService.findContainingDreamNode(file);
  if (!dreamNodePath) {
    uiService.showInfo('No DreamNode found for this item');
    return;
  }

  // Get the node from store
  let uuid: string;
  try {
    uuid = await UDDService.getUUID(dreamNodePath);
  } catch (error) {
    console.error('[OpenDreamSong] Failed to read UUID:', error);
    uiService.showError('Failed to read DreamNode UUID');
    return;
  }

  const store = useInterBrainStore.getState();
  const nodeData = store.dreamNodes.get(uuid);

  if (!nodeData) {
    const path = require('path');
    uiService.showWarning(`DreamNode not loaded: ${path.basename(dreamNodePath)}`);
    return;
  }

  // Select the node and execute DreamSong fullscreen command
  store.setSelectedNode(nodeData.node);
  (plugin.app as any).commands.executeCommandById('interbrain:open-dreamsong-fullscreen');
}

/**
 * Run vault-wide health check: converts all sovereign DreamNodes (idempotent)
 * Reports what was updated across the vault.
 */
export async function runVaultHealthCheck(
  plugin: Plugin,
  uiService: UIService,
  options: { dryRun?: boolean } = {}
): Promise<void> {
  const fs = require('fs');
  const path = require('path');
  const vaultPath = (plugin.app.vault.adapter as any).basePath;
  const dryRun = options.dryRun;
  const logPrefix = dryRun ? '[DRY RUN] ' : '';

  uiService.showInfo(`Vault Health Check${dryRun ? ' (Dry Run)' : ''}: scanning DreamNodes...`);
  console.log(`[VaultHealthCheck] ${logPrefix}Starting vault-wide health check...`);

  // List all root-level folders with .git (sovereign DreamNodes)
  const entries = fs.readdirSync(vaultPath, { withFileTypes: true });
  const dreamNodeFolders: TFolder[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue; // Skip hidden dirs (.obsidian, .git, etc.)

    const fullPath = path.join(vaultPath, entry.name);
    if (fs.existsSync(path.join(fullPath, '.git'))) {
      // Find the matching TFolder in Obsidian's vault
      const folder = plugin.app.vault.getAbstractFileByPath(entry.name);
      if (folder instanceof TFolder) {
        dreamNodeFolders.push(folder);
      }
    }
  }

  console.log(`[VaultHealthCheck] Found ${dreamNodeFolders.length} sovereign DreamNodes`);

  if (dreamNodeFolders.length === 0) {
    uiService.showInfo('Vault Health Check: no DreamNodes found');
    return;
  }

  // ========================================
  // Phase 1: Rename sovereign folders with spaces at vault root
  // Must happen BEFORE conversions so that submodule URLs like ../InterBrainMobile resolve
  // ========================================
  const renamedSovereigns: Array<{ from: string; to: string }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    if (!entry.name.includes(' ')) continue;

    const fullPath = path.join(vaultPath, entry.name);
    if (!fs.existsSync(path.join(fullPath, '.git'))) continue;

    const newName = sanitizeTitleToPascalCase(entry.name);
    if (newName === entry.name) continue;

    // Check if target name already exists at vault root
    const targetPath = path.join(vaultPath, newName);
    if (fs.existsSync(targetPath)) {
      console.log(`[VaultHealthCheck] ${logPrefix}Phase 1: "${newName}" already exists — skipping rename of "${entry.name}"`);
      // The old space-named folder is a duplicate; the PascalCase sovereign is canonical.
      // Don't rename, but do note it so submodule URL migration uses the right name.
      continue;
    }

    console.log(`[VaultHealthCheck] ${logPrefix}Phase 1: Renaming sovereign "${entry.name}" → "${newName}"`);

    if (dryRun) {
      renamedSovereigns.push({ from: entry.name, to: newName });
      continue;
    }

    try {
      const folder = plugin.app.vault.getAbstractFileByPath(entry.name);
      if (folder) {
        // Use Obsidian's API to rename — it handles vault indexing and link updates
        await (plugin.app as any).fileManager.renameFile(folder, newName);
        renamedSovereigns.push({ from: entry.name, to: newName });
        console.log(`[VaultHealthCheck] Renamed: "${entry.name}" → "${newName}"`);
      }
    } catch (renameError) {
      console.error(`[VaultHealthCheck] Failed to rename "${entry.name}":`, renameError);
      // Fall back to fs.renameSync if Obsidian API fails
      try {
        fs.renameSync(fullPath, targetPath);
        renamedSovereigns.push({ from: entry.name, to: newName });
        console.log(`[VaultHealthCheck] Renamed via fs: "${entry.name}" → "${newName}"`);
      } catch (fsError) {
        console.error(`[VaultHealthCheck] fs rename also failed for "${entry.name}":`, fsError);
      }
    }
  }

  if (renamedSovereigns.length > 0) {
    console.log(`[VaultHealthCheck] ${logPrefix}Phase 1 complete: ${dryRun ? 'would rename' : 'renamed'} ${renamedSovereigns.length} sovereign(s)`);
  }

  // Re-scan after renames so Obsidian picks up the new paths (skip in dry run)
  let updatedDreamNodeFolders: TFolder[] = [];
  if (!dryRun) {
    const updatedEntries = fs.readdirSync(vaultPath, { withFileTypes: true });
    for (const entry of updatedEntries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(vaultPath, entry.name);
      if (fs.existsSync(path.join(fullPath, '.git'))) {
        const folder = plugin.app.vault.getAbstractFileByPath(entry.name);
        if (folder instanceof TFolder) {
          updatedDreamNodeFolders.push(folder);
        }
      }
    }
  }

  // ========================================
  // Phase 2: Run conversions on all sovereign DreamNodes
  // ========================================

  const conversionService = new DreamNodeConversionService(plugin.app, plugin.manifest);

  // Run conversion on all DreamNodes in parallel
  const foldersToConvert = updatedDreamNodeFolders.length > 0 ? updatedDreamNodeFolders : dreamNodeFolders;
  const results = await Promise.allSettled(
    foldersToConvert.map(folder =>
      conversionService.convertToDreamNode(folder, { skipRadicle: true, dryRun })
    )
  );

  // Aggregate results
  let successCount = 0;
  let updatedCount = 0;
  let failedCount = 0;
  const allChanges: string[] = [];

  // Include sovereign renames in changes
  for (const rename of renamedSovereigns) {
    allChanges.push(`${logPrefix}${dryRun ? 'Would rename' : 'Renamed'} sovereign: "${rename.from}" → "${rename.to}"`);
  }

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const folderName = foldersToConvert[i].name;

    if (result.status === 'fulfilled') {
      if (result.value.success) {
        successCount++;
        if (result.value.changes && result.value.changes.length > 0) {
          updatedCount++;
          for (const change of result.value.changes) {
            allChanges.push(`${folderName}: ${change}`);
          }
          console.log(`[VaultHealthCheck] ${folderName}: updated -`, result.value.changes.join(', '));
        } else {
          console.log(`[VaultHealthCheck] ${folderName}: healthy`);
        }
      } else {
        failedCount++;
        console.error(`[VaultHealthCheck] ${folderName}: FAILED -`, result.value.error);
      }
    } else {
      failedCount++;
      console.error(`[VaultHealthCheck] ${folderName}: REJECTED -`, result.reason);
    }
  }

  const healthyCount = successCount - updatedCount;
  let summary = `Vault Health Check${dryRun ? ' (Dry Run)' : ''}: ${foldersToConvert.length} DreamNodes checked.`;
  if (renamedSovereigns.length > 0) summary += ` ${renamedSovereigns.length} ${dryRun ? 'would be renamed' : 'renamed'}.`;
  if (updatedCount > 0) summary += ` ${updatedCount} updated.`;
  if (healthyCount > 0) summary += ` ${healthyCount} already healthy.`;
  if (failedCount > 0) summary += ` ${failedCount} failed.`;

  if (allChanges.length > 0) {
    console.log(`[VaultHealthCheck] ${logPrefix}Changes${dryRun ? ' that would be made' : ' made'}:`, allChanges);
  }

  console.log(`[VaultHealthCheck] ${summary}`);
  if (dryRun) {
    uiService.showInfo(summary);
  } else {
    uiService.showSuccess(summary);
  }
}

/**
 * Open DreamTalk for the DreamNode containing a file/folder
 */
export async function openDreamTalkForFile(
  plugin: Plugin,
  uiService: UIService,
  file: TAbstractFile
): Promise<void> {
  const conversionService = new DreamNodeConversionService(plugin.app, plugin.manifest);

  // Find the containing DreamNode
  const dreamNodePath = conversionService.findContainingDreamNode(file);
  if (!dreamNodePath) {
    uiService.showInfo('No DreamNode found for this item');
    return;
  }

  // Get the node from store
  let uuid: string;
  try {
    uuid = await UDDService.getUUID(dreamNodePath);
  } catch (error) {
    console.error('[OpenDreamTalk] Failed to read UUID:', error);
    uiService.showError('Failed to read DreamNode UUID');
    return;
  }

  const store = useInterBrainStore.getState();
  const nodeData = store.dreamNodes.get(uuid);

  if (!nodeData) {
    const path = require('path');
    uiService.showWarning(`DreamNode not loaded: ${path.basename(dreamNodePath)}`);
    return;
  }

  // Select the node and execute DreamTalk fullscreen command
  store.setSelectedNode(nodeData.node);
  (plugin.app as any).commands.executeCommandById('interbrain:open-dreamtalk-fullscreen');
}
