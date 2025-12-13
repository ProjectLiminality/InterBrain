import React from 'react';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { useOrchestrator } from '../../core/context/orchestrator-context';
import { serviceManager } from '../../core/services/service-manager';
import { UIService } from '../../core/services/ui-service';
import { DreamNode } from '../dreamnode';
import SearchNode3D from './SearchNode3D';
import SearchOrchestrator from './SearchOrchestrator';

// Create UIService instance for showing user messages
const uiService = new UIService();

/**
 * SearchModeOverlay - Self-contained coordinator for search mode functionality
 *
 * Follows the EditModeOverlay pattern:
 * - Subscribes to its own store state
 * - Renders SearchNode3D and SearchOrchestrator
 * - Uses useOrchestrator() for spatial navigation
 * - Handles all search callbacks internally
 */
export default function SearchModeOverlay() {
  const {
    searchInterface,
    spatialLayout,
    setSearchActive,
    setSearchResults,
    setSpatialLayout
  } = useInterBrainStore();

  // Access orchestrator via context for position calculation and layout updates
  const orchestrator = useOrchestrator();

  // Don't render if not in search mode or search interface isn't active
  // Also render during save animation (isSaving) to complete the animation
  const shouldRender =
    (searchInterface.isActive && spatialLayout === 'search') ||
    searchInterface.isSaving;

  if (!shouldRender) {
    return null;
  }

  /**
   * Handle search save - creates a new DreamNode from search query
   */
  const handleSearchSave = async (
    query: string,
    dreamTalkFile?: globalThis.File,
    additionalFiles?: globalThis.File[]
  ) => {
    try {
      console.log('SearchModeOverlay: Saving search as DreamNode:', { query, dreamTalkFile, additionalFiles });

      // Get position on sphere accounting for current rotation
      let finalPosition: [number, number, number] = [0, 0, -5000]; // Fallback
      if (orchestrator) {
        finalPosition = orchestrator.calculateForwardPositionOnSphere();
      }

      // Use service to create DreamNode from search query
      const service = serviceManager.getActive();
      await service.create(
        query,
        'dream',
        dreamTalkFile,
        finalPosition,
        additionalFiles
      );

      // Delay dismissing search interface to ensure overlap and prevent flicker
      globalThis.setTimeout(() => {
        const store = useInterBrainStore.getState();
        store.setSearchActive(false);
        uiService.showSuccess(`Created DreamNode: "${query}"`);
      }, 200);

    } catch (error) {
      console.error('SearchModeOverlay: Failed to create DreamNode from search:', error);
      uiService.showError(error instanceof Error ? error.message : 'Failed to create DreamNode');
    }
  };

  /**
   * Handle search cancel - dismiss search interface
   */
  const handleSearchCancel = () => {
    setSearchActive(false);
    setSpatialLayout('constellation');
  };

  /**
   * Handle search results - update store and trigger spatial layout
   */
  const handleSearchResults = (results: { node: DreamNode; score: number }[]) => {
    const searchResultNodes = results.map(result => result.node);

    // Update store with search results
    setSearchResults(searchResultNodes);

    // If we have results and no search interface active, trigger search results display
    if (searchResultNodes.length > 0 && !searchInterface.isActive) {
      if (orchestrator) {
        orchestrator.showSearchResults(searchResultNodes);
      }
    }

    console.log(`SearchModeOverlay: Updated with ${searchResultNodes.length} search results`);
  };

  return (
    <>
      <SearchNode3D
        position={[0, 0, -50]}
        onSave={handleSearchSave}
        onCancel={handleSearchCancel}
      />
      <SearchOrchestrator
        onSearchResults={handleSearchResults}
      />
    </>
  );
}
