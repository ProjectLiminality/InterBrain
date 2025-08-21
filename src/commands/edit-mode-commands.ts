import { Plugin } from 'obsidian';
import { UIService } from '../services/ui-service';
import { useInterBrainStore } from '../store/interbrain-store';
import { semanticSearchService } from '../features/semantic-search/services/semantic-search-service';

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
        // Enter edit mode with the selected node
        store.startEditMode(store.selectedNode);
        uiService.showSuccess(`Edit mode activated for "${store.selectedNode.name}"`);
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
        
        // Update store with search results
        store.setEditModeSearchResults(searchResults.map(result => result.node));
        
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
        // TODO: Implement service layer persistence
        // For now, just save the pending relationships to the store
        store.savePendingRelationships();
        
        // TODO: Persist changes through service layer (real/mock modes)
        // This will need to be implemented when we integrate with service layer
        
        uiService.showSuccess('Changes saved successfully');
        
        // Exit edit mode after saving
        store.exitEditMode();
        
      } catch (error) {
        console.error('Failed to save edit mode changes:', error);
        uiService.showError('Failed to save changes');
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
        
        // Update store with search results
        store.setEditModeSearchResults(searchResults.map(result => result.node));
        
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