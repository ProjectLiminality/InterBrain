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
    hotkeys: [{ modifiers: ['Ctrl'], key: 'f' }],
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
          // From liminal-web: First return to constellation, then trigger search command
          console.log(`🔍 [Search-Toggle] Phase 1: liminal-web → constellation`);
          store.setSelectedNode(null);
          store.setSpatialLayout('constellation');
          
          // Wait for constellation transition to complete, then trigger search command
          globalThis.setTimeout(() => {
            console.log(`🔍 [Search-Toggle] Phase 2: triggering search activation`);
            const freshStore = useInterBrainStore.getState();
            // Use the same logic as normal search activation
            freshStore.setSearchActive(true);
            freshStore.setSpatialLayout('search');
          }, 1100); // Animation duration (1000ms) + buffer (100ms)
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