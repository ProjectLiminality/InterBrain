import React, { useEffect } from 'react';
import { useInterBrainStore, SpatialLayoutMode } from '../store/interbrain-store';
import type { SpatialOrchestratorRef } from '../components/SpatialOrchestrator';
import { DreamNode } from '../../features/dreamnode';

/**
 * useCopilotOptionKeyHandler - Option key handling for copilot mode search results
 *
 * Shows search results when Option/Alt key is pressed, hides when released.
 * Only active when spatialLayout is 'copilot'.
 *
 * @param orchestratorRef - Reference to SpatialOrchestrator for layout updates
 * @param spatialLayout - Current spatial layout mode
 * @param showSearchResults - Whether search results are currently shown
 */
export function useCopilotOptionKeyHandler(
  orchestratorRef: React.RefObject<SpatialOrchestratorRef | null>,
  spatialLayout: SpatialLayoutMode,
  showSearchResults: boolean
): void {
  useEffect(() => {
    if (spatialLayout !== 'copilot') return;

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      // Option key on Mac, Alt key on Windows/Linux
      if (e.altKey && !showSearchResults) {
        e.preventDefault();
        console.log('🔍 [Copilot] Option key pressed - showing search results');
        const store = useInterBrainStore.getState();

        console.log('🔍 [Copilot] Current searchResults:', store.searchResults.length, store.searchResults.map(n => n.name));
        console.log('🔍 [Copilot] Current frozenSearchResults BEFORE freeze:', store.copilotMode.frozenSearchResults.length, store.copilotMode.frozenSearchResults.map(n => n.name));

        store.freezeSearchResults(); // Capture latest search results
        store.setShowSearchResults(true);

        // Trigger layout update to show frozen results
        if (orchestratorRef.current && store.copilotMode.conversationPartner) {
          const updatedStore = useInterBrainStore.getState();
          const frozenResults = updatedStore.copilotMode.frozenSearchResults;
          console.log('🔍 [Copilot] frozenSearchResults AFTER freeze:', frozenResults.length, frozenResults.map(n => n.name));

          if (frozenResults && frozenResults.length > 0) {
            console.log(`🔍 [Copilot] Displaying ${frozenResults.length} frozen search results`);
            orchestratorRef.current.showEditModeSearchResults(store.copilotMode.conversationPartner.id, frozenResults);
          } else {
            console.log('🔍 [Copilot] No frozen results to display');
          }
        }
      }
    };

    const handleKeyUp = (e: globalThis.KeyboardEvent) => {
      // Detect when Option/Alt key is released
      if (!e.altKey && showSearchResults) {
        console.log('🔍 [Copilot] Option key released - hiding search results');
        const store = useInterBrainStore.getState();
        store.setShowSearchResults(false);

        // Trigger layout update to hide results by calling with empty array
        if (orchestratorRef.current && store.copilotMode.conversationPartner) {
          console.log('🔍 [Copilot] Hiding search results - clearing layout');
          orchestratorRef.current.showEditModeSearchResults(store.copilotMode.conversationPartner.id, []);
        }
      }
    };

    globalThis.document.addEventListener('keydown', handleKeyDown);
    globalThis.document.addEventListener('keyup', handleKeyUp);

    return () => {
      globalThis.document.removeEventListener('keydown', handleKeyDown);
      globalThis.document.removeEventListener('keyup', handleKeyUp);
    };
  }, [spatialLayout, showSearchResults]);
}

/**
 * useLiminalWebOptionKeyHandler - Option key handling for radial button UI
 *
 * Shows radial buttons and hides related nodes when Option/Alt key is pressed.
 * Shows related nodes again when released.
 * Only active when spatialLayout is 'liminal-web' and a node is selected.
 *
 * @param orchestratorRef - Reference to SpatialOrchestrator for node visibility
 * @param spatialLayout - Current spatial layout mode
 * @param selectedNode - Currently selected node (null if none)
 */
export function useLiminalWebOptionKeyHandler(
  orchestratorRef: React.RefObject<SpatialOrchestratorRef | null>,
  spatialLayout: SpatialLayoutMode,
  selectedNode: DreamNode | null
): void {
  useEffect(() => {
    if (spatialLayout !== 'liminal-web' || !selectedNode) return;

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      // Option key on Mac, Alt key on Windows/Linux
      if (e.altKey) {
        e.preventDefault();
        const store = useInterBrainStore.getState();

        // Always track the hardware key state
        if (!store.radialButtonUI.optionKeyPressed) {
          store.setOptionKeyPressed(true);
        }

        // Only show buttons if not already showing
        if (!store.radialButtonUI.isActive) {
          store.setRadialButtonUIActive(true);

          // Hide related nodes by moving them to constellation
          if (orchestratorRef.current) {
            orchestratorRef.current.hideRelatedNodesInLiminalWeb();
          }
        }
      }
    };

    const handleKeyUp = (e: globalThis.KeyboardEvent) => {
      // Detect when Option/Alt key is released
      if (!e.altKey) {
        const store = useInterBrainStore.getState();

        // Always clear the hardware key state
        if (store.radialButtonUI.optionKeyPressed) {
          store.setOptionKeyPressed(false);
        }

        // Only hide buttons if they're currently showing
        if (store.radialButtonUI.isActive) {
          store.setRadialButtonUIActive(false);

          // Show related nodes by moving them back to ring positions
          if (orchestratorRef.current) {
            orchestratorRef.current.showRelatedNodesInLiminalWeb();
          }
        }
      }
    };

    globalThis.document.addEventListener('keydown', handleKeyDown);
    globalThis.document.addEventListener('keyup', handleKeyUp);

    return () => {
      globalThis.document.removeEventListener('keydown', handleKeyDown);
      globalThis.document.removeEventListener('keyup', handleKeyUp);
    };
  }, [spatialLayout, selectedNode]);
}
