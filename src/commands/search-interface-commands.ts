import { Plugin } from 'obsidian';
import { UIService } from '../services/ui-service';
import { useInterBrainStore } from '../store/interbrain-store';

/**
 * Search interface commands for toggling search mode
 */
export function registerSearchInterfaceCommands(plugin: Plugin, uiService: UIService): void {

  // Toggle Search Mode
  plugin.addCommand({
    id: 'toggle-search-mode',
    name: 'Toggle Search Mode',
    callback: async () => {
      const store = useInterBrainStore.getState();
      
      // Check if search is already active
      if (store.searchInterface.isActive) {
        // Dismiss search and return to constellation
        store.setSearchActive(false);
        store.setSpatialLayout('constellation');
        uiService.showSuccess('Search dismissed');
      } else {
        // Check current layout to determine transition path
        if (store.spatialLayout === 'liminal-web') {
          // From liminal-web: go to constellation first, then activate search
          console.log(`🔍 [Search-Toggle] Transitioning liminal-web → constellation → search`);
          store.setSelectedNode(null);
          store.setSpatialLayout('constellation');
          // Small delay to ensure smooth transition
          globalThis.setTimeout(() => {
            const freshStore = useInterBrainStore.getState();
            freshStore.setSearchActive(true);
            freshStore.setSpatialLayout('search');
            console.log(`🔍 [Search-Toggle] Completed transition to search mode`);
          }, 100);
          uiService.showSuccess('Search mode activated from liminal web');
        } else {
          // Normal activation from constellation or other states
          store.setSearchActive(true);
          store.setSpatialLayout('search');
          uiService.showSuccess('Search mode activated');
        }
      }
    }
  });
}