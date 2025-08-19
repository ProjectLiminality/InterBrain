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
        // Activate search mode
        store.setSearchActive(true);
        store.setSpatialLayout('search');
        uiService.showSuccess('Search mode activated');
      }
    }
  });
}