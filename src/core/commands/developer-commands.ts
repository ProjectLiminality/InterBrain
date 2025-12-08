import { Plugin } from 'obsidian';
import { UIService } from '../services/ui-service';
import { useInterBrainStore } from '../store/interbrain-store';

/**
 * Register developer/debug commands for DreamSpace
 * These commands are useful for debugging and development
 */
export function registerDeveloperCommands(plugin: Plugin, uiService: UIService): void {
  // Debug: Toggle wireframe sphere
  plugin.addCommand({
    id: 'toggle-debug-wireframe-sphere',
    name: '[Dev] Toggle Debug Wireframe Sphere',
    callback: () => {
      const store = useInterBrainStore.getState();
      const newState = !store.debugWireframeSphere;
      store.setDebugWireframeSphere(newState);
      uiService.showSuccess(`Debug wireframe sphere ${newState ? 'enabled' : 'disabled'}`);
    }
  });

  // Debug: Toggle intersection point
  plugin.addCommand({
    id: 'toggle-debug-intersection-point',
    name: '[Dev] Toggle Debug Intersection Point',
    callback: () => {
      const store = useInterBrainStore.getState();
      const newState = !store.debugIntersectionPoint;
      store.setDebugIntersectionPoint(newState);
      uiService.showSuccess(`Debug intersection point ${newState ? 'enabled' : 'disabled'}`);
    }
  });

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
