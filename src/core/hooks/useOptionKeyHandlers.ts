import React, { useEffect } from 'react';
import { useInterBrainStore, SpatialLayoutMode } from '../store/interbrain-store';
import type { SpatialOrchestratorRef } from '../components/SpatialOrchestrator';
import { DreamNode } from '../../features/dreamnode';
import {
  deriveCopilotShowRingIntent,
  deriveCopilotHideRingIntent,
} from '../orchestration/intent-helpers';

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

        // Trigger layout update to show frozen results via unified orchestration
        if (orchestratorRef.current && store.copilotMode.conversationPartner) {
          const updatedStore = useInterBrainStore.getState();
          const frozenResults = updatedStore.copilotMode.frozenSearchResults;
          console.log('🔍 [Copilot] frozenSearchResults AFTER freeze:', frozenResults.length, frozenResults.map(n => n.name));

          if (frozenResults && frozenResults.length > 0) {
            console.log(`🔍 [Copilot] Displaying ${frozenResults.length} frozen search results via unified orchestration`);
            const { intent } = deriveCopilotShowRingIntent(
              store.copilotMode.conversationPartner.id,
              frozenResults.map(n => n.id)
            );
            orchestratorRef.current.executeLayoutIntent(intent);
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

        // Trigger layout update to hide results via unified orchestration
        if (orchestratorRef.current && store.copilotMode.conversationPartner) {
          console.log('🔍 [Copilot] Hiding search results via unified orchestration');
          const { intent } = deriveCopilotHideRingIntent(store.copilotMode.conversationPartner.id);
          orchestratorRef.current.executeLayoutIntent(intent);
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
 * ## Race Condition Mitigation (partial fix)
 *
 * Two mitigations were applied but the race condition is NOT fully resolved:
 *
 * 1. **lastIssuedDirection guard**: Prevents keyboard repeat events (~30/sec on macOS)
 *    from re-issuing hideRingNodes every frame, which caused React batching to let
 *    the last hide clobber a subsequent show.
 *
 * 2. **currentPositionRef in DreamNode3D**: setTargetState now reads position from a
 *    ref (updated synchronously in useFrame) instead of React state, so interrupting
 *    a mid-flight animation picks up the true visual position.
 *
 * 3. **Window blur handler**: Resets to "released" state if user switches apps while
 *    holding option key (keyup never fires in that case).
 *
 * These reduce the stuck-state window but don't eliminate it. The fundamental issue
 * is that hideRingNodes/showRingNodes dispatch N individual setTargetState calls
 * (one per node) as React setState batches, and rapid direction changes can still
 * interleave. A proper fix likely needs one of:
 *   - A ref-based animation system bypassing React state entirely (requestAnimationFrame)
 *   - A single "ring visibility" flag that useFrame reads, with position computed per-frame
 *   - Cancellation tokens on animation batches so a new direction cancels in-flight setState
 *
 * See also: DreamNode3D.tsx currentPositionRef (the other half of this mitigation).
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

    // Track the last animation direction we issued to avoid re-issuing
    // the same direction on keyboard repeat events. This prevents rapid
    // setTargetState calls from clobbering each other via React batching.
    let lastIssuedDirection: 'hide' | 'show' | null = null;

    /**
     * Reconcile UI state to match the desired option-key state.
     * Only issues animation commands when direction actually changes.
     */
    const reconcileOptionKeyState = (optionPressed: boolean) => {
      const store = useInterBrainStore.getState();

      // Double-check we're still in liminal-web mode (could have changed since handler was registered)
      if (store.spatialLayout !== 'liminal-web') return;

      // Always sync hardware key tracking
      if (store.radialButtonUI.optionKeyPressed !== optionPressed) {
        store.setOptionKeyPressed(optionPressed);
      }

      const targetDirection = optionPressed ? 'hide' : 'show';

      if (optionPressed) {
        // Option pressed → show radial buttons
        if (!store.radialButtonUI.isActive) {
          store.setRadialButtonUIActive(true);
        }
      } else {
        // Option released → hide radial buttons
        if (store.radialButtonUI.isActive) {
          store.setRadialButtonUIActive(false);
        }
      }

      // Only issue animation command when direction changes
      // This prevents keyboard repeat from re-issuing hideRingNodes 30x/sec
      // which would clobber a subsequent showRingNodes via React batching
      if (lastIssuedDirection !== targetDirection) {
        lastIssuedDirection = targetDirection;
        if (orchestratorRef.current) {
          if (optionPressed) {
            console.log('[LiminalWeb-Option] Hiding ring nodes via hideRingNodes');
            orchestratorRef.current.hideRingNodes(500);
          } else {
            console.log('[LiminalWeb-Option] Showing ring nodes via showRingNodes');
            orchestratorRef.current.showRingNodes(500);
          }
        }
      }
    };

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.altKey) {
        e.preventDefault();
        reconcileOptionKeyState(true);
      }
    };

    const handleKeyUp = (e: globalThis.KeyboardEvent) => {
      if (!e.altKey) {
        reconcileOptionKeyState(false);
      }
    };

    // Also reconcile on window blur — if the user switches apps while holding option,
    // keyup never fires. On refocus, reconcile to "released" state.
    const handleBlur = () => {
      reconcileOptionKeyState(false);
    };

    globalThis.document.addEventListener('keydown', handleKeyDown);
    globalThis.document.addEventListener('keyup', handleKeyUp);
    globalThis.window.addEventListener('blur', handleBlur);

    return () => {
      globalThis.document.removeEventListener('keydown', handleKeyDown);
      globalThis.document.removeEventListener('keyup', handleKeyUp);
      globalThis.window.removeEventListener('blur', handleBlur);
    };
  }, [spatialLayout, selectedNode]);
}
