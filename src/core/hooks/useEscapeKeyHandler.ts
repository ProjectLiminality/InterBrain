import React, { useEffect } from 'react';
import { useInterBrainStore } from '../store/interbrain-store';
import type { SpatialOrchestratorRef } from '../components/SpatialOrchestrator';

/**
 * useEscapeKeyHandler - Unified escape key handling for spatial layout navigation
 *
 * Provides hierarchical navigation through escape key:
 * - creation → constellation
 * - edit-search → edit
 * - edit → liminal-web
 * - search → constellation
 * - copilot → liminal-web
 * - liminal-web → constellation
 * - constellation → (already at root)
 *
 * Includes 300ms debouncing to prevent rapid state changes.
 *
 * @param orchestratorRef - Reference to SpatialOrchestrator for spatial transitions
 */
export function useEscapeKeyHandler(
  orchestratorRef: React.RefObject<SpatialOrchestratorRef | null>
): void {
  useEffect(() => {
    let debounceTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;

    const handleEscape = async (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;

      e.preventDefault();

      // Block escape during collaboration preview mode
      const { getCherryPickWorkflowService } = await import('../../features/dreamnode-updater/services/cherry-pick-workflow-service');
      if (getCherryPickWorkflowService()?.isPreviewActive()) {
        console.log('[Escape] Blocked - collaboration preview active. Use the preview banner to accept/reject.');
        return;
      }

      // Debounce rapid escape key presses (300ms)
      if (debounceTimeout) {
        globalThis.clearTimeout(debounceTimeout);
      }

      debounceTimeout = globalThis.setTimeout(() => {
        const store = useInterBrainStore.getState();
        const layout = store.spatialLayout;

        // Complete hierarchical navigation for all states
        switch (layout) {
          case 'creation':
            // Hide radial buttons when exiting creation mode
            if (store.radialButtonUI.isActive) {
              store.setRadialButtonUIActive(false);
            }

            // Exit creation mode, return to constellation
            store.cancelCreation(); // This sets layout to 'constellation'
            break;

          case 'edit-search':
            // Exit search mode, stay in edit mode
            store.setEditModeSearchActive(false); // This will set layout to 'edit'
            break;

          case 'edit':
            // Exit edit mode, go to liminal-web
            store.exitEditMode();
            store.setSpatialLayout('liminal-web');

            // Only show radial buttons if option key is ACTUALLY pressed
            // This prevents buttons from appearing when exiting edit mode with escape
            if (store.radialButtonUI.optionKeyPressed) {
              store.setRadialButtonUIActive(true);
              if (orchestratorRef.current) {
                orchestratorRef.current.hideRelatedNodesInLiminalWeb();
              }
            } else {
              store.setRadialButtonUIActive(false);
            }
            break;

          case 'search':
            // Exit global search, go to constellation
            store.setSearchResults([]);
            store.setSpatialLayout('constellation');
            break;

          case 'copilot':
            // Exit copilot mode, go to liminal-web
            store.exitCopilotMode();
            break;

          case 'liminal-web':
            // Exit liminal-web, go to constellation
            store.setSelectedNode(null);
            store.setSpatialLayout('constellation');
            break;

          case 'constellation':
            // Already at top level
            console.log(`🌌 Already in constellation (root)`);
            break;
        }

        debounceTimeout = null;
      }, 300); // 300ms debounce to prevent rapid state changes
    };

    globalThis.document.addEventListener('keydown', handleEscape);

    return () => {
      if (debounceTimeout) {
        globalThis.clearTimeout(debounceTimeout);
      }
      globalThis.document.removeEventListener('keydown', handleEscape);
    };
  }, []); // Single handler, no dependencies - accesses store via getState()
}
