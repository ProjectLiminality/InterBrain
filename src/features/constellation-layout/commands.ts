import { Plugin } from 'obsidian';
import { UIService } from '../../core/services/ui-service';
import { useInterBrainStore } from '../../core/store/interbrain-store';

/**
 * Register debug commands for constellation layout visualization
 * These commands toggle debug overlays for Dynamic View Scaling geometry
 */
export function registerConstellationDebugCommands(plugin: Plugin, uiService: UIService): void {
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

  // Apply constellation layout positioning - reads relationship data from dreamweaving slice
  plugin.addCommand({
    id: 'apply-constellation-layout',
    name: 'Apply Constellation Layout',
    callback: async () => {
      const store = useInterBrainStore.getState();

      try {
        // Read relationship graph from dreamweaving slice (source of truth)
        const relationshipGraph = store.dreamSongRelationships.graph;
        if (!relationshipGraph) {
          uiService.showError('No relationship data available. Run "Scan DreamSong Relationships" first.', 5000);
          return;
        }

        const layoutNotice = uiService.showInfo('Computing constellation layout...', 0);

        // Request layout application via store-based navigation
        store.requestNavigation({ type: 'applyLayout' });

        await new Promise(resolve => setTimeout(resolve, 100));
        layoutNotice.hide();

        const positions = store.constellationData.positions;
        const positionCount = positions?.size || 0;

        uiService.showSuccess(
          `Constellation layout applied!\n\n${positionCount} DreamNodes positioned using force-directed algorithm`,
          5000
        );

      } catch (error) {
        const errorMessage = `Layout application failed: ${error instanceof Error ? error.message : error}`;
        uiService.showError(errorMessage, 5000);
        console.error('[Constellation] Layout error:', error);
      }
    }
  });
}
