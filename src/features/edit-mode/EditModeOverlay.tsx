import React from 'react';
import { useInterBrainStore } from '../../store/interbrain-store';
import { serviceManager } from '../../services/service-manager';
import { UIService } from '../../services/ui-service';
import EditNode3D from './EditNode3D';

// Create UIService instance for showing user messages
const uiService = new UIService();

/**
 * EditModeOverlay - Main coordinator for edit mode functionality
 * 
 * Integrates with existing spatial layout system:
 * - EditNode3D for metadata editing at center position  
 * - Leverages existing SpatialOrchestrator search layout for relationship nodes
 * - Uses existing DreamNode3D components with gold glow for relationships
 */
export default function EditModeOverlay() {
  const {
    editMode,
    savePendingRelationships,
    exitEditMode
  } = useInterBrainStore();
  
  // Don't render if edit mode is not active
  if (!editMode.isActive || !editMode.editingNode) {
    return null;
  }
  
  // Center position for the editing node (similar to ProtoNode spawn position)
  const centerPosition: [number, number, number] = [0, 0, -50];
  
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
        console.log(`EditModeOverlay: Saving new DreamTalk media: ${editMode.newDreamTalkFile.name}`);
        await dreamNodeService.addFilesToNode(editMode.editingNode.id, [editMode.newDreamTalkFile]);
      }
      
      // 2. Save metadata changes (let service layer handle if no changes)
      await dreamNodeService.update(editMode.editingNode.id, {
        name: editMode.editingNode.name,
        type: editMode.editingNode.type
        // Add other metadata fields as needed
      });
      
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
        relationships: editMode.pendingRelationships.length,
        dataMode: serviceManager.getMode()
      });
      
      // Update the selected node in the main store with the latest data
      const freshNode = await dreamNodeService.get(editMode.editingNode.id);
      if (freshNode) {
        // Update the selectedNode to reflect the saved changes
        useInterBrainStore.getState().setSelectedNode(freshNode);
        
        // Immediately trigger the special edit mode save transition
        // This starts the parallel animations: UI fade + node movements
        const canvas = globalThis.document.querySelector('[data-dreamspace-canvas]');
        if (canvas) {
          const event = new globalThis.CustomEvent('edit-mode-save-transition', {
            detail: { nodeId: freshNode.id }
          });
          canvas.dispatchEvent(event);
        }
        
        // Exit edit mode after animations complete
        // Don't change spatial layout - it's already handled by the event
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
  
  const handleCancel = () => {
    // Exit edit mode - original data is preserved in store
    exitEditMode();
    
    // Return to liminal-web layout (edit mode requires a selected node)
    const store = useInterBrainStore.getState();
    if (store.selectedNode) {
      store.setSpatialLayout('liminal-web');
    }
  };
  
  
  
  return (
    <group>
      {/* Central metadata editing interface */}
      <EditNode3D
        position={centerPosition}
        onSave={handleSave}
        onCancel={handleCancel}
      />
      
      {/* Relationship management now handled by existing SpatialOrchestrator + DreamNode3D components */}
      {/* Gold glow and click handling will be added to existing DreamNode3D components */}
    </group>
  );
}