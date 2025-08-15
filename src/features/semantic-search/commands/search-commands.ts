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
        
        // Display results
        const resultText = results.map((result, i) => 
          `${i + 1}. **${result.node.name}** (${(result.score * 100).toFixed(1)}% similar)\\n   ${result.snippet || 'No snippet available'}`
        ).join('\\n\\n');
        
        // Create a results file with timestamp to avoid conflicts
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T');
        const resultsFile = await plugin.app.vault.create(
          `Search Results - ${query} - ${timestamp[0]} ${timestamp[1].split('.')[0]}.md`,
          `# Search Results for "${query}"\\n\\n${resultText}`
        );
        await plugin.app.workspace.openLinkText(resultsFile.path, '');
        
        uiService.showSuccess(`Found ${results.length} similar nodes`);
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
        
        // Display results
        const resultText = results.map((result, i) => 
          `${i + 1}. **${result.node.name}** (${(result.score * 100).toFixed(1)}% similar)\\n   ${result.snippet || 'No snippet available'}`
        ).join('\\n\\n');
        
        // Create a results file with timestamp to avoid conflicts
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T');
        const resultsFile = await plugin.app.vault.create(
          `Similar to ${selectedNode.name} - ${timestamp[0]} ${timestamp[1].split('.')[0]}.md`,
          `# Nodes Similar to "${selectedNode.name}"\\n\\n${resultText}`
        );
        await plugin.app.workspace.openLinkText(resultsFile.path, '');
        
        uiService.showSuccess(`Found ${results.length} similar nodes`);
      } catch (error) {
        console.error('Similar nodes search failed:', error);
        uiService.showError('Search failed - check if node is indexed and Ollama is running');
      } finally {
        loadingNotice.hide();
      }
    }
  });
}