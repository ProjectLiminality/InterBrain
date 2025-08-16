import { Plugin } from 'obsidian';
import { UIService } from '../../../services/ui-service';
import { useInterBrainStore } from '../../../store/interbrain-store';

/**
 * Semantic search and similarity commands
 */
export function registerSearchCommands(plugin: Plugin, uiService: UIService): void {

  // Semantic Search
  plugin.addCommand({
    id: 'semantic-search',
    name: 'Semantic Search',
    callback: async () => {
      const query = await uiService.getUserInput('Enter search query:');
      if (!query) return;
      
      const loadingNotice = uiService.showLoading('Searching...');
      try {
        const { semanticSearchService } = await import('../services/semantic-search-service');
        
        const results = await semanticSearchService.searchByText(query, {
          maxResults: 10,
          includeSnippets: true
        });
        
        if (results.length === 0) {
          uiService.showWarning('No similar nodes found');
          return;
        }
        
        // Store search results and scores in Zustand store
        const store = useInterBrainStore.getState();
        
        // Convert search results to DreamNodes for the store
        const searchResultNodes = results.map(result => result.node);
        
        // Store the similarity scores in a separate map for the layout system
        const searchScores = new Map<string, number>();
        results.forEach(result => {
          searchScores.set(result.node.id, result.score);
        });
        
        // Update store with search results
        store.setSearchResults(searchResultNodes);
        
        // Switch to search spatial layout to trigger honeycomb ring layout
        store.setSpatialLayout('search');
        
        // Log search results for debugging
        console.log(`\\n=== Semantic Search Results for "${query}" ===`);
        results.forEach((result, i) => {
          console.log(`${i + 1}. ${result.node.name} (${(result.score * 100).toFixed(1)}% similar)`);
          console.log(`   Type: ${result.node.type}, Snippet: ${result.snippet || 'No snippet'}`);
        });
        console.log(`\\nSearch results stored in Zustand. Spatial layout switched to 'search' mode.`);
        console.log(`Total results: ${results.length} nodes arranged in honeycomb rings`);
        
        uiService.showSuccess(`Found ${results.length} similar nodes - switched to search layout`);
      } catch (error) {
        console.error('Semantic search failed:', error);
        uiService.showError('Search failed - check if Ollama is running');
      } finally {
        loadingNotice.hide();
      }
    }
  });

  // Find Similar Nodes
  plugin.addCommand({
    id: 'find-similar-nodes',
    name: 'Find Similar to Selected Node',
    callback: async () => {
      const store = useInterBrainStore.getState();
      const selectedNode = store.selectedNode;
      
      if (!selectedNode) {
        uiService.showError('Please select a DreamNode first');
        return;
      }
      
      const loadingNotice = uiService.showLoading(`Finding nodes similar to "${selectedNode.name}"...`);
      try {
        const { semanticSearchService } = await import('../services/semantic-search-service');
        
        const results = await semanticSearchService.findSimilarNodes(selectedNode, {
          maxResults: 10,
          includeSnippets: true
        });
        
        if (results.length === 0) {
          uiService.showWarning('No similar nodes found');
          return;
        }
        
        // Store search results and scores in Zustand store
        // Note: store is already defined from the selectedNode check above
        
        // Convert search results to DreamNodes for the store
        const searchResultNodes = results.map(result => result.node);
        
        // Store the similarity scores in a separate map for the layout system
        const searchScores = new Map<string, number>();
        results.forEach(result => {
          searchScores.set(result.node.id, result.score);
        });
        
        // Update store with search results
        store.setSearchResults(searchResultNodes);
        
        // Switch to search spatial layout to trigger honeycomb ring layout
        store.setSpatialLayout('search');
        
        // Log search results for debugging
        console.log(`\\n=== Similar Nodes to "${selectedNode.name}" ===`);
        results.forEach((result, i) => {
          console.log(`${i + 1}. ${result.node.name} (${(result.score * 100).toFixed(1)}% similar)`);
          console.log(`   Type: ${result.node.type}, Snippet: ${result.snippet || 'No snippet'}`);
        });
        console.log(`\\nSimilarity results stored in Zustand. Spatial layout switched to 'search' mode.`);
        console.log(`Total results: ${results.length} nodes arranged in honeycomb rings`);
        
        uiService.showSuccess(`Found ${results.length} similar nodes - switched to search layout`);
      } catch (error) {
        console.error('Similar nodes search failed:', error);
        uiService.showError('Search failed - check if node is indexed and Ollama is running');
      } finally {
        loadingNotice.hide();
      }
    }
  });
}