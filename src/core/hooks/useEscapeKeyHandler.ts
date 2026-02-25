import React, { useEffect } from 'react';
import { useInterBrainStore } from '../store/interbrain-store';
import type { SpatialOrchestratorRef } from '../components/SpatialOrchestrator';
import { deriveConstellationIntent, deriveCopilotExitIntent, deriveFocusIntent, deriveFlipToFrontIntent, deriveExplorerFocusIntent, buildLayoutContext } from '../orchestration/intent-helpers';

/**
 * useEscapeKeyHandler - Unified escape key handling for spatial layout navigation
 *
 * Provides flat navigation through escape key (simplified hierarchy):
 * - creation → constellation
 * - edit → liminal-web (metadata editing)
 * - relationship-edit → liminal-web (relationship editing - peer to edit)
 * - search → constellation
 * - copilot → liminal-web
 * - holarchy (liminal-web + flipped to back) → liminal-web front
 * - liminal-web → constellation
 * - constellation → (already at root)
 *
 * Note: 'edit' and 'relationship-edit' are peer-level modes, not nested.
 * Both exit to liminal-web.
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

          case 'edit':
          case 'relationship-edit': {
            // Both edit modes are peer-level - both exit to liminal-web
            // Capture editing node BEFORE exitEditMode clears it
            const editingNodeId = store.editMode.editingNode?.id;

            // Clear stale edit mode data from orchestrator before exiting
            if (orchestratorRef.current) {
              orchestratorRef.current.clearEditModeData();
            }

            // Set spatialLayout BEFORE executeLayoutIntent so nodes animate correctly
            store.setSpatialLayout('liminal-web');

            // Animate back to liminal-web via unified orchestration
            if (editingNodeId && orchestratorRef.current) {
              console.log(`[Escape] ${layout.toUpperCase()} → LIMINAL_WEB via unified orchestration`);
              const relatedIds = orchestratorRef.current.getRelatedNodeIds(editingNodeId);
              const context = buildLayoutContext(editingNodeId, store.flipState.flipStates, 'liminal-web');
              const { intent } = deriveFocusIntent(editingNodeId, relatedIds, context);
              orchestratorRef.current.executeLayoutIntent(intent);
            }

            // Exit edit mode
            store.exitEditMode();

            // Only show radial buttons if option key is ACTUALLY pressed
            // This prevents buttons from appearing when exiting edit mode with escape
            if (store.radialButtonUI.optionKeyPressed) {
              store.setRadialButtonUIActive(true);
              if (orchestratorRef.current) {
                orchestratorRef.current.hideRingNodes(500);
              }
            } else {
              store.setRadialButtonUIActive(false);
            }
            break;
          }

          case 'search':
            // Exit global search, go to constellation via unified orchestration
            // Set spatialLayout BEFORE executeLayoutIntent so nodes animate to scaled positions
            store.setSearchResults([]);
            store.setSearchActive(false);
            store.setSpatialLayout('constellation');
            if (orchestratorRef.current) {
              console.log('[Escape] SEARCH → CONSTELLATION via unified orchestration');
              const { intent } = deriveConstellationIntent();
              orchestratorRef.current.executeLayoutIntent(intent);
            }
            break;

          case 'copilot': {
            // Exit copilot mode, go to liminal-web via unified orchestration
            // Capture partner + related nodes BEFORE exitCopilotMode clears them
            const partnerId = store.copilotMode.conversationPartner?.id;

            // Set spatialLayout BEFORE executeLayoutIntent so nodes animate to correct targets
            store.setSpatialLayout('liminal-web');

            if (partnerId && orchestratorRef.current) {
              console.log('[Escape] COPILOT → LIMINAL_WEB via unified orchestration');
              const relatedIds = orchestratorRef.current.getRelatedNodeIds(partnerId);
              const { intent } = deriveCopilotExitIntent(partnerId, relatedIds);
              orchestratorRef.current.executeLayoutIntent(intent);
            }

            // exitCopilotMode processes relationships and clears copilot state
            // spatialLayout was already set above, so its setSpatialLayout('liminal-web') is idempotent
            store.exitCopilotMode();
            break;
          }

          case 'liminal-web': {
            // Check if center node is flipped to back (holarchy mode)
            // If so, escape flips back to front (staying in liminal-web) rather than jumping to constellation
            const centerNode = store.selectedNode;
            const centerFlip = centerNode ? store.flipState.flipStates.get(centerNode.id) : null;

            // If explorer-focus is active, first exit explorer-focus (zoom back to normal z, reset layout to reduced)
            if (store.dreamExplorer.explorerFocus && centerNode && orchestratorRef.current) {
              console.log('[Escape] EXPLORER_FOCUS → HOLARCHY (deactivate focus) via unified orchestration');
              store.explorerSetFocus(false);
              // Use deriveExplorerFocusIntent(false) which sets zOverride=undefined (normal z=-50)
              // Pass empty supermoduleIds — the ring nodes are already displayed and won't change
              // since executeLayoutIntent handles the ring from the intent's surroundingNodes
              store.requestNavigation({
                type: 'explorer-focus',
                nodeId: centerNode.id,
                explorerFocusActive: false,
              });
            } else if (centerNode && centerFlip?.flipSide === 'back' && !centerFlip?.isFlipping && orchestratorRef.current) {
              console.log('[Escape] HOLARCHY → LIMINAL_WEB (flip to front) via unified orchestration');
              const relatedIds = orchestratorRef.current.getRelatedNodeIds(centerNode.id);
              const { intent } = deriveFlipToFrontIntent(centerNode.id, relatedIds);
              orchestratorRef.current.executeLayoutIntent(intent);
            } else {
              // Normal liminal-web exit → constellation
              store.addHistoryEntry(null, 'constellation');
              store.setSelectedNode(null);
              if (orchestratorRef.current) {
                console.log('[Escape] LIMINAL_WEB → CONSTELLATION via unified orchestration');
                const { intent } = deriveConstellationIntent();
                orchestratorRef.current.executeLayoutIntent(intent);
              }
              store.setSpatialLayout('constellation');
            }
            break;
          }

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
