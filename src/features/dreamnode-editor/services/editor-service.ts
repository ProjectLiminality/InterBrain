/**
 * EditorService - Orchestrates DreamNode edit operations
 *
 * Coordinates save operations using the parent GitDreamNodeService,
 * handling the complexity of file deduplication and metadata updates.
 */

import fs from 'fs';
import { useInterBrainStore } from '../../../core/store/interbrain-store';
import { serviceManager } from '../../../core/services/service-manager';
import { DreamNode } from '../../dreamnode';

/**
 * Save all pending edit mode changes
 *
 * Handles:
 * 1. New DreamTalk media file (with hash-based deduplication)
 * 2. Metadata changes (name, contact fields for dreamer)
 * 3. Relationship changes
 *
 * Note: Node type is immutable after creation - not saved here.
 */
export async function saveEditModeChanges(): Promise<{ success: boolean; error?: string }> {
  const store = useInterBrainStore.getState();
  const { editMode } = store;

  if (!editMode.isActive || !editMode.editingNode) {
    return { success: false, error: 'No active edit session' };
  }

  try {
    const dreamNodeService = serviceManager.getActive();
    const editingNode = editMode.editingNode;

    // 1. Handle new DreamTalk media file if provided
    if (editMode.newDreamTalkFile) {
      await handleDreamTalkFileUpdate(editingNode, editMode.newDreamTalkFile);
    }

    // 2. Save metadata changes (type is immutable, not saved)
    const updates: Partial<DreamNode> = {
      name: editingNode.name
    };

    // Include contact info only for dreamer-type nodes
    if (editingNode.type === 'dreamer') {
      updates.email = editingNode.email;
      updates.phone = editingNode.phone;
      updates.did = editingNode.did;
    }

    await dreamNodeService.update(editingNode.id, updates);

    // 3. Save relationship changes
    await dreamNodeService.updateRelationships(
      editingNode.id,
      editMode.pendingRelationships
    );

    // 4. Update store state with confirmed relationships
    store.savePendingRelationships();

    // 5. Clear the new DreamTalk file from edit mode state
    if (editMode.newDreamTalkFile) {
      store.setEditModeNewDreamTalkFile(undefined);
    }

    console.log(`EditorService: Saved changes for node ${editingNode.id}:`, {
      relationships: editMode.pendingRelationships.length
    });

    return { success: true };
  } catch (error) {
    console.error('EditorService: Failed to save changes:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Handle DreamTalk file update with smart deduplication
 *
 * Checks if the file is:
 * - An internal file (already in the repo) - just update metadata reference
 * - An external file that matches existing - skip copy, update reference
 * - A new external file - copy to repo and update reference
 */
async function handleDreamTalkFileUpdate(
  editingNode: DreamNode,
  file: globalThis.File
): Promise<void> {
  const dreamNodeService = serviceManager.getActive();
  const vaultService = serviceManager.getVaultService();

  // Try to read the file - if it fails, it's likely an internal file already in the repo
  let fileIsReadable = false;
  let fileHash: string | null = null;

  try {
    const buffer = await file.arrayBuffer();
    fileIsReadable = true;
    // Calculate hash of the dropped file
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', buffer);
    fileHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // File not readable - it's an internal file reference
    fileIsReadable = false;
  }

  if (!fileIsReadable) {
    // Internal file - just update the dreamTalk path in metadata, no file copy needed
    console.log(`EditorService: File not readable, setting existing file as DreamTalk: ${file.name}`);
    await updateDreamTalkReference(editingNode, file, vaultService);
    return;
  }

  if (!fileHash || !vaultService) {
    // Fallback to direct save
    console.log(`EditorService: Saving new DreamTalk media (fallback): ${file.name}`);
    await dreamNodeService.addFilesToNode(editingNode.id, [file]);
    return;
  }

  // File is readable - check if it already exists in the repo by comparing hashes
  const targetPath = `${editingNode.repoPath}/${file.name}`;
  const existingFileExists = await vaultService.fileExists(targetPath);

  if (existingFileExists) {
    // File exists - compare hashes
    const fullPath = vaultService.getFullPath(targetPath);
    const existingContent = fs.readFileSync(fullPath);
    const existingHashBuffer = await globalThis.crypto.subtle.digest('SHA-256', existingContent);
    const existingHash = Array.from(new Uint8Array(existingHashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (existingHash === fileHash) {
      // Same file - just update the metadata reference, no copy needed
      console.log(`EditorService: File already exists with same hash, updating reference: ${file.name}`);
      await updateDreamTalkReference(editingNode, file, vaultService);
      return;
    }

    // Different file with same name - copy and update
    console.log(`EditorService: File exists but different hash, replacing: ${file.name}`);
  } else {
    console.log(`EditorService: Saving new DreamTalk media: ${file.name}`);
  }

  // Copy file to repo
  await dreamNodeService.addFilesToNode(editingNode.id, [file]);
}

/**
 * Update DreamTalk reference without copying file
 * Used when the file already exists in the repo
 */
async function updateDreamTalkReference(
  editingNode: DreamNode,
  file: globalThis.File,
  vaultService: ReturnType<typeof serviceManager.getVaultService>
): Promise<void> {
  const dreamNodeService = serviceManager.getActive();
  const targetPath = `${editingNode.repoPath}/${file.name}`;

  let dataUrl = '';
  let fileSize = 0;

  if (vaultService) {
    try {
      dataUrl = await vaultService.readFileAsDataURL(targetPath);
      const fullPath = vaultService.getFullPath(targetPath);
      const stats = fs.statSync(fullPath);
      fileSize = stats.size;
    } catch (err) {
      console.warn(`EditorService: Could not load file data for preview: ${err}`);
    }
  }

  const updates: Partial<DreamNode> = {
    dreamTalkMedia: [{
      path: file.name,
      absolutePath: targetPath,
      type: file.type || 'application/octet-stream',
      data: dataUrl,
      size: fileSize
    }]
  };

  await dreamNodeService.update(editingNode.id, updates);
}

/**
 * Get fresh node data after save
 */
export async function getFreshNodeData(nodeId: string): Promise<DreamNode | null> {
  const dreamNodeService = serviceManager.getActive();
  return await dreamNodeService.get(nodeId);
}

/**
 * Exit edit mode and return to liminal-web layout
 */
export function exitToLiminalWeb(): void {
  const store = useInterBrainStore.getState();

  if (store.selectedNode) {
    store.setSpatialLayout('liminal-web');
  }

  store.exitEditMode();
}

/**
 * Cancel edit mode without saving
 */
export function cancelEditMode(): void {
  const store = useInterBrainStore.getState();

  // Change spatial layout BEFORE exiting edit mode
  if (store.selectedNode) {
    store.setSpatialLayout('liminal-web');
  }

  // Exit edit mode - original data is preserved in store
  store.exitEditMode();
}
