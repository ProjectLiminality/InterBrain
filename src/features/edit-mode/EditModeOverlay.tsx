import React from 'react';
import { useInterBrainStore } from '../../store/interbrain-store';
import { serviceManager } from '../../services/service-manager';
import { UIService } from '../../services/ui-service';
import { DreamNode } from '../../types/dreamnode';
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
 */
export default function EditModeOverlay() {
  const {
    editMode,
    savePendingRelationships,
    exitEditMode
  } = useInterBrainStore();
  
  // Center position for the editing node (similar to ProtoNode spawn position)
  const centerPosition: [number, number, number] = [0, 0, -50];
  
  // Handler functions defined before useEffect to maintain hook order
  const handleCancel = () => {
    // Exit edit mode - original data is preserved in store
    exitEditMode();
    
    // Return to liminal-web layout (edit mode requires a selected node)
    const store = useInterBrainStore.getState();
    if (store.selectedNode) {
      store.setSpatialLayout('liminal-web');
    }
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
      
      // CRITICAL: Clear stale orchestrator data before showing filtered results
      const canvas = globalThis.document.querySelector('[data-dreamspace-canvas]');
      if (canvas) {
        // First clear the stale edit mode data
        const clearEvent = new globalThis.CustomEvent('clear-edit-mode-data', {
          detail: { source: 'search-toggle-off' }
        });
        canvas.dispatchEvent(clearEvent);
        
        // Then trigger the filtered layout after a brief delay to ensure cleanup completes
        globalThis.setTimeout(() => {
          if (store.editMode.editingNode) {
            const layoutEvent = new globalThis.CustomEvent('edit-mode-search-layout', {
              detail: { 
                centerNodeId: store.editMode.editingNode.id,
                searchResults: validRelatedNodes
              }
            });
            canvas.dispatchEvent(layoutEvent);
          }
        }, 10);
      }
    } else {
      console.log(`📭 [EditModeOverlay] No pending relationships - clearing search results`);
      // No pending relationships, clear search results
      store.setEditModeSearchResults([]);
    }
    
    // CRITICAL: Restore focus to ensure escape key handling works
    // After exiting search mode, focus might be lost, breaking global escape handler
    globalThis.setTimeout(() => {
      // Focus the document body or a reliable element to restore keyboard event handling
      const activeElement = globalThis.document.activeElement as globalThis.HTMLElement;
      console.log(`🎯 [EditModeOverlay] Focus after search toggle off:`, activeElement?.tagName);
      
      // If focus is on an input or other form element, blur it to restore global focus
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        activeElement.blur();
      }
      
      // Ensure document body has focus for global keyboard events
      globalThis.document.body.focus();
      console.log(`🔄 [EditModeOverlay] Restored focus to document body for global escape handling`);
    }, 50); // Small delay to ensure search interface has fully unmounted
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