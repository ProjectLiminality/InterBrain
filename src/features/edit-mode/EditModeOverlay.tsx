import React from 'react';
import fs from 'fs';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { useOrchestrator } from '../../core/context/orchestrator-context';
import { serviceManager } from '../../core/services/service-manager';
import { UIService } from '../../core/services/ui-service';
import { DreamNode } from '../dreamnode';
import EditNode3D from './EditNode3D';
import EditModeSearchNode3D from './EditModeSearchNode3D';

// Create UIService instance for showing user messages
const uiService = new UIService();

/**
 * EditModeOverlay - Main coordinator for edit mode functionality
 *
 * Integrates with existing spatial layout system:
 * - EditNode3D for metadata editing at center position
 * - Leverages existing SpatialOrchestrator search layout for relationship nodes
 * - Uses existing DreamNode3D components with gold glow for relationships
 * - Uses OrchestratorContext for direct orchestrator access (no DOM events)
 */
export default function EditModeOverlay() {
  const {
    editMode,
    savePendingRelationships,
    exitEditMode
  } = useInterBrainStore();

  // Access orchestrator via context (no more DOM events needed)
  const orchestrator = useOrchestrator();
  
  // Position EditNode3D at the same location as the center node in liminal-web mode
  // But slightly offset towards camera so it renders on top of the regular DreamNode3D
  // The regular node is at [0, 0, -50], edit node is at [0, 0, -49.9]
  const centerPosition: [number, number, number] = [0, 0, -49.9];
  
  // Handler functions defined before useEffect to maintain hook order
  const handleCancel = () => {
    const store = useInterBrainStore.getState();

    // IMPORTANT: Change spatial layout BEFORE exiting edit mode
    // This ensures the regular DreamNode3D reappears seamlessly
    if (store.selectedNode) {
      store.setSpatialLayout('liminal-web');
    }

    // Exit edit mode - original data is preserved in store
    exitEditMode();
  };
  
  // Global escape key handling is now managed by DreamspaceCanvas for stability
  
  // Don't render if edit mode is not active
  if (!editMode.isActive || !editMode.editingNode) {
    return null;
  }
  
  const handleSave = async () => {
    try {
      if (!editMode.editingNode) {
        console.error('No editing node available for save operation');
        return;
      }

      // Get the active service for persistence
      const dreamNodeService = serviceManager.getActive();

      // 1. Handle new DreamTalk media file if provided
      if (editMode.newDreamTalkFile) {
        const file = editMode.newDreamTalkFile;

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
          console.log(`EditModeOverlay: File not readable, setting existing file as DreamTalk: ${file.name}`);

          // Load the file data from disk for immediate display
          const vaultService = serviceManager.getVaultService();
          const targetPath = `${editMode.editingNode.repoPath}/${file.name}`;
          let dataUrl = '';
          let fileSize = 0;

          if (vaultService) {
            try {
              dataUrl = await vaultService.readFileAsDataURL(targetPath);
              const fullPath = vaultService.getFullPath(targetPath);
              const stats = fs.statSync(fullPath);
              fileSize = stats.size;
            } catch (err) {
              console.warn(`EditModeOverlay: Could not load file data for preview: ${err}`);
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
          await dreamNodeService.update(editMode.editingNode.id, updates);
        } else if (fileHash) {
          // File is readable - check if it already exists in the repo by comparing hashes
          const vaultService = serviceManager.getVaultService();
          if (vaultService) {
            const targetPath = `${editMode.editingNode.repoPath}/${file.name}`;
            const existingFileExists = await vaultService.fileExists(targetPath);

            if (existingFileExists) {
              // File exists - compare hashes using Node.js fs
              const fullPath = vaultService.getFullPath(targetPath);
              const existingContent = fs.readFileSync(fullPath);
              const existingHashBuffer = await globalThis.crypto.subtle.digest('SHA-256', existingContent);
              const existingHash = Array.from(new Uint8Array(existingHashBuffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');

              if (existingHash === fileHash) {
                // Same file - just update the metadata reference, no copy needed
                console.log(`EditModeOverlay: File already exists with same hash, updating reference: ${file.name}`);

                // Load the file data from disk for immediate display
                let dataUrl = '';
                try {
                  dataUrl = await vaultService.readFileAsDataURL(targetPath);
                } catch (err) {
                  console.warn(`EditModeOverlay: Could not load file data for preview: ${err}`);
                }

                const updates: Partial<DreamNode> = {
                  dreamTalkMedia: [{
                    path: file.name,
                    absolutePath: targetPath,
                    type: file.type || 'application/octet-stream',
                    data: dataUrl,
                    size: file.size
                  }]
                };
                await dreamNodeService.update(editMode.editingNode.id, updates);
              } else {
                // Different file with same name - copy and update
                console.log(`EditModeOverlay: File exists but different hash, replacing: ${file.name}`);
                await dreamNodeService.addFilesToNode(editMode.editingNode.id, [file]);
              }
            } else {
              // File doesn't exist - copy to repo
              console.log(`EditModeOverlay: Saving new DreamTalk media: ${file.name}`);
              await dreamNodeService.addFilesToNode(editMode.editingNode.id, [file]);
            }
          } else {
            // No vault service - fall back to direct save
            console.log(`EditModeOverlay: Saving new DreamTalk media (no vault service): ${file.name}`);
            await dreamNodeService.addFilesToNode(editMode.editingNode.id, [file]);
          }
        }
      }
      
      // 2. Save metadata changes (let service layer handle if no changes)
      const updates: Partial<DreamNode> = {
        name: editMode.editingNode.name,
        type: editMode.editingNode.type
      };

      // Include contact info only for dreamer-type nodes
      if (editMode.editingNode.type === 'dreamer') {
        updates.email = editMode.editingNode.email;
        updates.phone = editMode.editingNode.phone;
        updates.did = editMode.editingNode.did;
      }

      await dreamNodeService.update(editMode.editingNode.id, updates);
      
      // 3. Save relationship changes through service layer
      await dreamNodeService.updateRelationships(
        editMode.editingNode.id,
        editMode.pendingRelationships
      );
      
      // 4. Update store state with confirmed relationships
      savePendingRelationships();
      
      // 5. Clear the new DreamTalk file from edit mode state (successful save)
      if (editMode.newDreamTalkFile) {
        useInterBrainStore.getState().setEditModeNewDreamTalkFile(undefined);
      }
      
      console.log(`Edit mode changes saved for node ${editMode.editingNode.id}:`, {
        relationships: editMode.pendingRelationships.length
      });
      
      // Update the selected node in the main store with the latest data
      const freshNode = await dreamNodeService.get(editMode.editingNode.id);
      if (freshNode) {
        // Update the selectedNode to reflect the saved changes
        useInterBrainStore.getState().setSelectedNode(freshNode);

        // IMPORTANT: Change spatial layout to liminal-web FIRST
        // This ensures the regular DreamNode3D is ready to appear
        useInterBrainStore.getState().setSpatialLayout('liminal-web');

        // Trigger the special edit mode save transition animation via orchestrator
        // This animates the nodes into their liminal-web positions
        if (orchestrator) {
          orchestrator.animateToLiminalWebFromEdit(freshNode.id);
        }

        // Exit edit mode after animations complete
        globalThis.setTimeout(() => {
          exitEditMode();
        }, 1000);
      }
    } catch (error) {
      console.error('Failed to save edit mode changes:', error);
      console.log('Edit mode state during error:', {
        isActive: editMode.isActive,
        hasEditingNode: !!editMode.editingNode,
        editingNodeName: editMode.editingNode?.name
      });
      
      // Show user-friendly error message in Obsidian UI
      uiService.showError('Failed to save changes: ' + (error instanceof Error ? error.message : 'Unknown error'));
      
      // Ensure edit mode state is preserved after error
      console.log('Edit mode state after error message:', {
        isActive: useInterBrainStore.getState().editMode.isActive,
        hasEditingNode: !!useInterBrainStore.getState().editMode.editingNode
      });
      
      // Don't exit edit mode if save fails - user can try again or cancel
    }
  };

  const handleSearchToggleOff = async () => {
    const store = useInterBrainStore.getState();

    console.log(`🔍 [EditModeOverlay] Toggling off search mode - filtering to pending relationships`);

    // Close the search interface
    store.setEditModeSearchActive(false);

    // Get current pending relationships to show only related nodes
    const pendingRelationshipIds = store.editMode.pendingRelationships;

    if (pendingRelationshipIds.length > 0 && store.editMode.editingNode) {
      // Get the related nodes from the service layer
      const dreamNodeService = serviceManager.getActive();
      const relatedNodes = await Promise.all(
        pendingRelationshipIds.map(id => dreamNodeService.get(id))
      );

      // Filter out any null results (in case some relationships are broken)
      const validRelatedNodes = relatedNodes.filter(node => node !== null) as DreamNode[];

      console.log(`✅ [EditModeOverlay] Showing ${validRelatedNodes.length} pending related nodes after search toggle off`);

      // Update the edit mode search results to show only pending relationships
      store.setEditModeSearchResults(validRelatedNodes);

      // Use orchestrator context directly (no DOM events)
      if (orchestrator && store.editMode.editingNode) {
        // First clear the stale edit mode data
        orchestrator.clearEditModeData();

        // Then trigger the filtered layout after a brief delay to ensure cleanup completes
        globalThis.setTimeout(() => {
          if (store.editMode.editingNode) {
            orchestrator.showEditModeSearchResults(store.editMode.editingNode.id, validRelatedNodes);
          }
        }, 10);
      }
    } else {
      console.log(`📭 [EditModeOverlay] No pending relationships - clearing search results`);
      // No pending relationships, clear search results
      store.setEditModeSearchResults([]);
    }

    // Note: Focus management removed - global DreamspaceCanvas escape handler doesn't require it
  };
  
  
  
  return (
    <group>
      {/* Central metadata editing interface */}
      <EditNode3D
        position={centerPosition}
        onSave={handleSave}
        onCancel={handleCancel}
        onToggleSearchOff={handleSearchToggleOff}
      />
      
      {/* Relationship search interface - renders on top of EditNode3D when active */}
      {editMode.isSearchingRelationships && (
        <EditModeSearchNode3D
          position={centerPosition}
        />
      )}
      
      {/* Relationship management now handled by existing SpatialOrchestrator + DreamNode3D components */}
      {/* Gold glow and click handling will be added to existing DreamNode3D components */}
    </group>
  );
}