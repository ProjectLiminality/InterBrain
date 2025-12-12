import { Plugin } from 'obsidian';
import { UIService } from '../../core/services/ui-service';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { semanticSearchService } from '../semantic-search/services/semantic-search-service';
import { serviceManager } from '../../core/services/service-manager';
import { DreamNode } from '../dreamnode';
import { saveEditModeChanges, getFreshNodeData, cancelEditMode, exitToLiminalWeb } from './services/editor-service';

/**
 * Edit mode commands for DreamNode editing with relationship management
 */
export function registerEditModeCommands(plugin: Plugin, uiService: UIService): void {

  // Enter Edit Mode
  plugin.addCommand({
    id: 'enter-edit-mode',
    name: 'Enter Edit Mode',
    hotkeys: [{ modifiers: ['Ctrl'], key: 'e' }],
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

      if (store.editMode.isActive) {
        uiService.showError('Edit mode is already active.');
        return;
      }

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

        // Clear any existing main search results
        store.setSearchResults([]);

        // Enter edit mode with fresh node data
        store.startEditMode(freshNode);

        // If the node has existing relationships, show them
        if (freshNode.liminalWebConnections && freshNode.liminalWebConnections.length > 0) {
          const relatedNodes = await Promise.all(
            freshNode.liminalWebConnections.map(id => dreamNodeService.get(id))
          );

          const validRelatedNodes = relatedNodes.filter((node): node is DreamNode => node !== null);

          store.setEditModeSearchResults(validRelatedNodes);

          // Trigger edit mode search layout
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

  // Exit Edit Mode (without saving)
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
        // Clear stale edit mode data from orchestrator
        const canvas = globalThis.document.querySelector('[data-dreamspace-canvas]');
        if (canvas) {
          canvas.dispatchEvent(new globalThis.CustomEvent('clear-edit-mode-data', {
            detail: { source: 'exit-edit-mode' }
          }));
        }

        exitToLiminalWeb();
        uiService.showSuccess('Edit mode exited');
      } catch (error) {
        console.error('Failed to exit edit mode:', error);
        uiService.showError('Failed to exit edit mode');
      }
    }
  });

  // Search Related Nodes
  plugin.addCommand({
    id: 'search-related-nodes',
    name: 'Search Related Nodes',
    callback: async () => {
      const store = useInterBrainStore.getState();

      if (!store.editMode.isActive || !store.editMode.editingNode) {
        uiService.showError('This command is only available in edit mode.');
        return;
      }

      const isAvailable = await semanticSearchService.isSemanticSearchAvailable();
      if (!isAvailable) {
        uiService.showError('Semantic search is not available. Please check Ollama configuration.');
        return;
      }

      const query = await uiService.promptForText(
        'Search for related nodes',
        'Enter keywords to find relevant nodes for relationships:'
      );

      if (!query || !query.trim()) {
        return;
      }

      try {
        uiService.showProgress('Searching for related nodes...');

        const searchResults = await semanticSearchService.searchOppositeTypeNodes(
          query.trim(),
          store.editMode.editingNode,
          {
            maxResults: 35,
            includeSnippets: false
          }
        );

        store.setEditModeSearchResults(searchResults.map(result => result.node));
        store.setSearchResults(searchResults.map(result => result.node));
        store.setEditModeSearchActive(true);
        store.setSpatialLayout('edit-search');

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
        const result = await saveEditModeChanges();

        if (!result.success) {
          uiService.showError(result.error || 'Failed to save changes');
          return;
        }

        const relationshipCount = store.editMode.pendingRelationships.length;
        uiService.showSuccess(`Changes saved successfully (${relationshipCount} relationships)`);

        // Get fresh node and transition
        const freshNode = await getFreshNodeData(store.editMode.editingNode.id);
        if (freshNode) {
          store.setSelectedNode(freshNode);
        }

        store.exitEditMode();
        store.setSpatialLayout('liminal-web');
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
        // Clear stale edit mode data from orchestrator
        const canvas = globalThis.document.querySelector('[data-dreamspace-canvas]');
        if (canvas) {
          canvas.dispatchEvent(new globalThis.CustomEvent('clear-edit-mode-data', {
            detail: { source: 'cancel-edit-mode' }
          }));
        }

        cancelEditMode();
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

      const isAvailable = await semanticSearchService.isSemanticSearchAvailable();
      if (!isAvailable) {
        uiService.showError('Semantic search is not available. Please check Ollama configuration.');
        return;
      }

      try {
        uiService.showProgress('Finding similar nodes...');

        const searchResults = await semanticSearchService.findSimilarOppositeTypeNodes(
          store.editMode.editingNode,
          {
            maxResults: 35,
            includeSnippets: false
          }
        );

        store.setEditModeSearchResults(searchResults.map(result => result.node));
        store.setSearchResults(searchResults.map(result => result.node));
        store.setEditModeSearchActive(true);
        store.setSpatialLayout('edit-search');

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
