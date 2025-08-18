import { Plugin } from 'obsidian';
import { UIService } from '../../../services/ui-service';
import { useInterBrainStore } from '../../../store/interbrain-store';
import { getMockDataForConfig } from '../../../mock/dreamnode-mock-data';

/**
 * Test commands for search mode functionality with various result counts
 */
export function registerTestSearchCommands(plugin: Plugin, uiService: UIService): void {

  // Test search with 3 results (Ring 1 only - good for testing equidistant placement)
  plugin.addCommand({
    id: 'test-search-sparse',
    name: 'Test Search: 3 Results (Ring 1 only)',
    callback: () => {
      const store = useInterBrainStore.getState();
      const mockNodes = getMockDataForConfig('fibonacci-50', store.mockRelationshipData || undefined);
      const testResults = mockNodes.slice(0, 3);
      
      console.log('Test Search: Simulating 3 search results (Ring 1 only)');
      store.setSearchResults(testResults);
      store.setSpatialLayout('search');
      
      uiService.showSuccess(`Test search: Displaying ${testResults.length} results in Ring 1`);
    }
  });

  // Test search with 10 results (Ring 1 + partial Ring 2)
  plugin.addCommand({
    id: 'test-search-medium',
    name: 'Test Search: 10 Results (Ring 1 + partial Ring 2)',
    callback: () => {
      const store = useInterBrainStore.getState();
      const mockNodes = getMockDataForConfig('fibonacci-50', store.mockRelationshipData || undefined);
      const testResults = mockNodes.slice(0, 10);
      
      console.log('Test Search: Simulating 10 search results (Ring 1 + partial Ring 2)');
      store.setSearchResults(testResults);
      store.setSpatialLayout('search');
      
      uiService.showSuccess(`Test search: Displaying ${testResults.length} results across Ring 1 & 2`);
    }
  });

  // Test search with 18 results (Ring 1 + Ring 2 complete)
  plugin.addCommand({
    id: 'test-search-rings12',
    name: 'Test Search: 18 Results (Rings 1 & 2 complete)',
    callback: () => {
      const store = useInterBrainStore.getState();
      const mockNodes = getMockDataForConfig('fibonacci-50', store.mockRelationshipData || undefined);
      const testResults = mockNodes.slice(0, 18);
      
      console.log('Test Search: Simulating 18 search results (Rings 1 & 2 complete)');
      store.setSearchResults(testResults);
      store.setSpatialLayout('search');
      
      uiService.showSuccess(`Test search: Displaying ${testResults.length} results filling Rings 1 & 2`);
    }
  });

  // Test search with 30 results (All rings with good coverage)
  plugin.addCommand({
    id: 'test-search-dense',
    name: 'Test Search: 30 Results (All rings)',
    callback: () => {
      const store = useInterBrainStore.getState();
      const mockNodes = getMockDataForConfig('fibonacci-50', store.mockRelationshipData || undefined);
      const testResults = mockNodes.slice(0, 30);
      
      console.log('Test Search: Simulating 30 search results (All rings active)');
      store.setSearchResults(testResults);
      store.setSpatialLayout('search');
      
      uiService.showSuccess(`Test search: Displaying ${testResults.length} results across all rings`);
    }
  });

  // Test search with maximum results (36 - full capacity)
  plugin.addCommand({
    id: 'test-search-max',
    name: 'Test Search: 36 Results (Maximum capacity)',
    callback: () => {
      const store = useInterBrainStore.getState();
      const mockNodes = getMockDataForConfig('fibonacci-50', store.mockRelationshipData || undefined);
      const testResults = mockNodes.slice(0, 36);
      
      console.log('Test Search: Simulating 36 search results (Maximum honeycomb capacity)');
      store.setSearchResults(testResults);
      store.setSpatialLayout('search');
      
      uiService.showSuccess(`Test search: Displaying ${testResults.length} results at maximum capacity`);
    }
  });

  // Test search with single result (good for testing centered placement)
  plugin.addCommand({
    id: 'test-search-single',
    name: 'Test Search: 1 Result (Single node)',
    callback: () => {
      const store = useInterBrainStore.getState();
      const mockNodes = getMockDataForConfig('fibonacci-50', store.mockRelationshipData || undefined);
      const testResults = mockNodes.slice(0, 1);
      
      console.log('Test Search: Simulating 1 search result (Single node placement)');
      store.setSearchResults(testResults);
      store.setSpatialLayout('search');
      
      uiService.showSuccess(`Test search: Displaying ${testResults.length} result (single node)`);
    }
  });
}