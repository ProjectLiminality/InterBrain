import { Plugin } from 'obsidian';
import { UIService } from '../services/ui-service';
import { useInterBrainStore } from '../store/interbrain-store';

/**
 * Register camera debug commands for DreamSpace
 * These commands control the 3D camera for debugging and development
 */
export function registerCameraCommands(plugin: Plugin, uiService: UIService): void {
  // Debug: Toggle flying camera controls
  plugin.addCommand({
    id: 'toggle-debug-flying-controls',
    name: '[Dev] Toggle Debug Flying Camera Controls',
    callback: () => {
      const store = useInterBrainStore.getState();
      const newState = !store.debugFlyingControls;
      store.setDebugFlyingControls(newState);
      uiService.showSuccess(`Debug flying controls ${newState ? 'enabled' : 'disabled'}`);
    }
  });

  // Camera command: Reset camera position
  plugin.addCommand({
    id: 'camera-reset',
    name: '[Dev] Reset Camera Position',
    callback: () => {
      const store = useInterBrainStore.getState();
      // Reset to origin for proper Dynamic View Scaling geometry
      store.setCameraPosition([0, 0, 0]);
      store.setCameraTarget([0, 0, 0]);
      store.setCameraTransition(false);
      uiService.showSuccess('Camera position reset');
      console.log('Camera reset to default position');
    }
  });
}
