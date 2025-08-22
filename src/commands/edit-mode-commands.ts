import { Plugin } from 'obsidian';
import { UIService } from '../services/ui-service';
import { useInterBrainStore } from '../store/interbrain-store';
import { semanticSearchService } from '../features/semantic-search/services/semantic-search-service';
import { serviceManager } from '../services/service-manager';
import { DreamNode } from '../types/dreamnode';

/**
 * Edit mode commands for unified node editing with relationship management
 */
export function registerEditModeCommands(plugin: Plugin, uiService: UIService): void {

  // Enter Edit Mode
  plugin.addCommand({
    id: 'enter-edit-mode',
    name: 'Enter Edit Mode',
    callback: async () => {
      const store = useInterBrainStore.getState();
      
      // Check if a node is selected and in liminal web layout
      if (!store.selectedNode) {
        uiService.showError('No node selected. Please focus a node first.');
        return;
      }
      
      if (store.spatialLayout !== 'liminal-web') {
        uiService.showError('Edit mode is only available in liminal web layout.');
        return;
      }
      
      // Check if already in edit mode
      if (store.editMode.isActive) {
        uiService.showError('Edit mode is already active.');
        return;
      }
      
      // Check if in creation mode
      if (store.creationState.isCreating) {
        uiService.showError('Cannot enter edit mode while creating a node.');
        return;
      }
      
      try {
        // Get the freshest version of the node from the service layer
        const dreamNodeService = serviceManager.getActive();
        const freshNode = await dreamNodeService.get(store.selectedNode.id);
        
        if (!freshNode) {
          uiService.showError('Selected node not found in service layer');
          return;
        }
        
        // Enter edit mode with the fresh node data
        store.startEditMode(freshNode);
        
        // If the node has existing relationships, show them in the search layout
        if (freshNode.liminalWebConnections && freshNode.liminalWebConnections.length > 0) {
          // Get all related nodes to display them
          const relatedNodes = await Promise.all(
            freshNode.liminalWebConnections.map(id => dreamNodeService.get(id))
          );
          
          // Filter out any null results (in case some relationships are broken)
          const validRelatedNodes = relatedNodes.filter(node => node !== null) as DreamNode[];
          
          // Set these as edit mode search results
          store.setEditModeSearchResults(validRelatedNodes);
          // Trigger special edit mode search layout that keeps center node in place
          const canvas = globalThis.document.querySelector('[data-dreamspace-canvas]');
          if (canvas) {
            const event = new globalThis.CustomEvent('edit-mode-search-layout', {
              detail: { 
                centerNodeId: freshNode.id,
                searchResults: validRelatedNodes
              }
            });
            canvas.dispatchEvent(event);
          }
          
          uiService.showSuccess(`Edit mode activated for "${freshNode.name}" (${validRelatedNodes.length} existing relationships)`);
        } else {
          uiService.showSuccess(`Edit mode activated for "${freshNode.name}"`);
        }
      } catch (error) {
        console.error('Failed to enter edit mode:', error);
        uiService.showError('Failed to enter edit mode');
      }
    }
  });

  // Exit Edit Mode
  plugin.addCommand({
    id: 'exit-edit-mode',
    name: 'Exit Edit Mode',
    callback: async () => {
      const store = useInterBrainStore.getState();
      
      if (!store.editMode.isActive) {
        uiService.showError('Edit mode is not active.');
        return;
      }
      
      try {
        // Simply exit without saving (user should use save command)
        store.exitEditMode();
        
        // Return to liminal-web layout (edit mode requires a selected node)
        if (store.selectedNode) {
          store.setSpatialLayout('liminal-web');
        }
        
        uiService.showSuccess('Edit mode exited');
      } catch (error) {
        console.error('Failed to exit edit mode:', error);
        uiService.showError('Failed to exit edit mode');
      }
    }
  });

  // Search Related Nodes (for relationship editing)
  plugin.addCommand({
    id: 'search-related-nodes',
    name: 'Search Related Nodes',
    callback: async () => {
      const store = useInterBrainStore.getState();
      
      if (!store.editMode.isActive || !store.editMode.editingNode) {
        uiService.showError('This command is only available in edit mode.');
        return;
      }
      
      // Check if semantic search is available
      const isAvailable = await semanticSearchService.isSemanticSearchAvailable();
      if (!isAvailable) {
        uiService.showError('Semantic search is not available. Please check Ollama configuration.');
        return;
      }
      
      // Prompt user for search query
      const query = await uiService.promptForText(
        'Search for related nodes',
        'Enter keywords to find relevant nodes for relationships:'
      );
      
      if (!query || !query.trim()) {
        return; // User cancelled or entered empty query
      }
      
      try {
        uiService.showProgress('Searching for related nodes...');
        
        // Search for opposite-type nodes
        const searchResults = await semanticSearchService.searchOppositeTypeNodes(
          query.trim(),
          store.editMode.editingNode,
          {
            maxResults: 35, // Leave room for center node in honeycomb layout
            includeSnippets: false // We don't need snippets for relationship editing
          }
        );
        
        // Update store with search results for edit mode tracking
        store.setEditModeSearchResults(searchResults.map(result => result.node));
        
        // CRITICAL: Use the same pattern as search mode to trigger visual layout
        // Set the main search results and switch to search layout
        store.setSearchResults(searchResults.map(result => result.node));
        store.setSpatialLayout('search');
        
        uiService.hideProgress();
        
        if (searchResults.length === 0) {
          uiService.showInfo('No related nodes found for your search query.');
        } else {
          const oppositeType = store.editMode.editingNode.type === 'dream' ? 'Dreamers' : 'Dreams';
          uiService.showSuccess(`Found ${searchResults.length} ${oppositeType} related to "${query}"`);
        }
        
      } catch (error) {
        console.error('Search related nodes failed:', error);
        uiService.hideProgress();
        uiService.showError('Failed to search for related nodes');
      }
    }
  });

  // Save Edit Mode Changes
  plugin.addCommand({
    id: 'save-edit-mode-changes',
    name: 'Save Edit Mode Changes',
    callback: async () => {
      const store = useInterBrainStore.getState();
      
      if (!store.editMode.isActive || !store.editMode.editingNode) {
        uiService.showError('Edit mode is not active.');
        return;
      }
      
      try {
        if (!store.editMode.editingNode) {
          uiService.showError('No editing node available for save operation');
          return;
        }

        // Get the active service for persistence
        const dreamNodeService = serviceManager.getActive();
        
        // 1. Save metadata changes (let service layer handle if no changes)
        await dreamNodeService.update(store.editMode.editingNode.id, {
          name: store.editMode.editingNode.name,
          type: store.editMode.editingNode.type
        });
        
        // 2. Save relationship changes through service layer
        await dreamNodeService.updateRelationships(
          store.editMode.editingNode.id,
          store.editMode.pendingRelationships
        );
        
        // 3. Update store state with confirmed relationships
        store.savePendingRelationships();
        
        uiService.showSuccess(`Changes saved successfully (${store.editMode.pendingRelationships.length} relationships)`);
        
        // Update the selected node in the main store with the latest data
        const freshNode = await dreamNodeService.get(store.editMode.editingNode.id);
        if (freshNode) {
          store.setSelectedNode(freshNode);
        }
        
        // Exit edit mode after saving
        store.exitEditMode();
        
        // Switch to liminal-web layout - this will trigger the focused layout
        // The SpatialOrchestrator will handle moving related nodes to ring positions
        // and unrelated nodes back to constellation
        if (freshNode) {
          store.setSpatialLayout('liminal-web');
        }
        
      } catch (error) {
        console.error('Failed to save edit mode changes:', error);
        uiService.showError('Failed to save changes: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    }
  });

  // Cancel Edit Mode Changes
  plugin.addCommand({
    id: 'cancel-edit-mode-changes',
    name: 'Cancel Edit Mode Changes',
    callback: async () => {
      const store = useInterBrainStore.getState();
      
      if (!store.editMode.isActive) {
        uiService.showError('Edit mode is not active.');
        return;
      }
      
      try {
        // Simply exit edit mode without saving (original data is preserved)
        store.exitEditMode();
        
        // Return to liminal-web layout (edit mode requires a selected node)
        if (store.selectedNode) {
          store.setSpatialLayout('liminal-web');
        }
        
        uiService.showSuccess('Changes cancelled');
      } catch (error) {
        console.error('Failed to cancel edit mode changes:', error);
        uiService.showError('Failed to cancel changes');
      }
    }
  });

  // Find Similar Related Nodes (auto-suggestions)
  plugin.addCommand({
    id: 'find-similar-related-nodes',
    name: 'Find Similar Related Nodes',
    callback: async () => {
      const store = useInterBrainStore.getState();
      
      if (!store.editMode.isActive || !store.editMode.editingNode) {
        uiService.showError('This command is only available in edit mode.');
        return;
      }
      
      // Check if semantic search is available
      const isAvailable = await semanticSearchService.isSemanticSearchAvailable();
      if (!isAvailable) {
        uiService.showError('Semantic search is not available. Please check Ollama configuration.');
        return;
      }
      
      try {
        uiService.showProgress('Finding similar nodes...');
        
        // Find similar opposite-type nodes based on current node content
        const searchResults = await semanticSearchService.findSimilarOppositeTypeNodes(
          store.editMode.editingNode,
          {
            maxResults: 35, // Leave room for center node in honeycomb layout
            includeSnippets: false
          }
        );
        
        // Update store with search results for edit mode tracking
        store.setEditModeSearchResults(searchResults.map(result => result.node));
        
        // CRITICAL: Use the same pattern as search mode to trigger visual layout
        // Set the main search results and switch to search layout
        store.setSearchResults(searchResults.map(result => result.node));
        store.setSpatialLayout('search');
        
        uiService.hideProgress();
        
        if (searchResults.length === 0) {
          uiService.showInfo('No similar nodes found.');
        } else {
          const oppositeType = store.editMode.editingNode.type === 'dream' ? 'Dreamers' : 'Dreams';
          uiService.showSuccess(`Found ${searchResults.length} similar ${oppositeType}`);
        }
        
      } catch (error) {
        console.error('Find similar related nodes failed:', error);
        uiService.hideProgress();
        uiService.showError('Failed to find similar nodes');
      }
    }
  });
}