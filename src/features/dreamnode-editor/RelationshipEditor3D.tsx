import React, { useState, useRef, useEffect } from 'react';
import { Html } from '@react-three/drei';
import { dreamNodeStyles, getNodeColors } from '../dreamnode/styles/dreamNodeStyles';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { useOrchestrator } from '../../core/context/orchestrator-context';
import { hybridSearchService } from '../search/services/hybrid-search-service';
import { saveEditModeChanges, cancelEditMode } from './services/editor-service';
import { UIService } from '../../core/services/ui-service';
import { deriveFocusIntent, buildLayoutContext } from '../../core/orchestration/intent-helpers';

const uiService = new UIService();

/**
 * RelationshipEditor3D - Standalone relationship editing UI
 *
 * This component handles RELATIONSHIP editing only:
 * - Renders when spatialLayout is 'relationship-edit'
 * - Shows search input at the top of the screen
 * - Center DreamNode remains visible (no editor overlay)
 * - Clicking nodes toggles their relationship status
 * - Has its own Save/Cancel buttons
 *
 * Note: This is a peer-level mode to 'edit' (metadata editing).
 * Both modes share the editMode state but have different UIs and purposes.
 */
export default function RelationshipEditor3D() {
  const inputRef = useRef<globalThis.HTMLInputElement>(null);

  // Store state
  const {
    editMode,
    spatialLayout,
    setEditModeSearchResults,
    setSearchResults,
    exitEditMode
  } = useInterBrainStore();

  const { editingNode, pendingRelationships } = editMode;

  // Orchestrator for cleanup
  const orchestrator = useOrchestrator();

  // Local UI state
  const [localQuery, setLocalQuery] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Debounced search
  const debounceTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  // Animation state
  const [animatedOpacity, setAnimatedOpacity] = useState<number>(0);

  // Fade in on mount and focus input
  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      setAnimatedOpacity(1);
    }, 50);

    // Focus input after fade-in animation completes
    const focusTimer = globalThis.setTimeout(() => {
      inputRef.current?.focus();
    }, 150);

    // Ensure focus is maintained
    const refocusTimer = globalThis.setTimeout(() => {
      inputRef.current?.focus();
    }, 300);

    return () => {
      globalThis.clearTimeout(timer);
      globalThis.clearTimeout(focusTimer);
      globalThis.clearTimeout(refocusTimer);
    };
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        globalThis.clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  const shouldRender = spatialLayout === 'relationship-edit' && editMode.isActive && !!editingNode;

  // On mount: send background constellation nodes home and display initial relationships
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (shouldRender && orchestrator && !hasInitialized.current) {
      hasInitialized.current = true;

      // Send background constellation nodes to their anchor positions
      orchestrator.sendConstellationNodesHome();

      // Display editing node centered with existing relationships in ring
      if (editingNode) {
        const store = useInterBrainStore.getState();
        const pendingIds = store.editMode.pendingRelationships || [];
        const context = buildLayoutContext(
          editingNode.id,
          store.flipState.flipStates,
          store.spatialLayout
        );
        const { intent } = deriveFocusIntent(editingNode.id, pendingIds, context);
        orchestrator.executeLayoutIntent(intent);
        console.log(`[RelationshipEditor] Entered: centered on "${editingNode.name}" with ${pendingIds.length} existing relationships via unified orchestration`);
      }
    }
    if (!shouldRender) {
      hasInitialized.current = false;
    }
  }, [shouldRender, orchestrator]);

  // Only render in 'relationship-edit' layout mode
  if (!shouldRender) {
    return null;
  }

  // Handle query changes with debounced search
  const handleQueryChange = (e: React.ChangeEvent<globalThis.HTMLInputElement>) => {
    const newQuery = e.target.value;
    setLocalQuery(newQuery);
    setSearchError(null);

    if (debounceTimeoutRef.current) {
      globalThis.clearTimeout(debounceTimeoutRef.current);
    }

    const trimmed = newQuery.trim();
    if (trimmed.length < 2) {
      setEditModeSearchResults([]);
      // When query is cleared, show only pending relationships in ring
      if (editingNode && orchestrator) {
        const store = useInterBrainStore.getState();
        const pendingIds = store.editMode.pendingRelationships || [];
        const context = buildLayoutContext(
          editingNode.id,
          store.flipState.flipStates,
          store.spatialLayout
        );
        const { intent } = deriveFocusIntent(editingNode.id, pendingIds, context);
        orchestrator.executeLayoutIntent(intent);
      }
      return;
    }

    debounceTimeoutRef.current = globalThis.setTimeout(() => {
      performSearch(trimmed);
    }, 150);
  };

  // Perform fuzzy name search (instant, no semantic overhead)
  const performSearch = (query: string) => {
    if (!editingNode || !query.trim()) return;

    try {
      setSearchError(null);

      const oppositeType = editingNode.type === 'dream' ? 'dreamer' : 'dream';
      const searchResults = hybridSearchService.fuzzyNameSearch(query, {
        maxResults: 12,
        nodeTypes: [oppositeType],
        excludeNodeId: editingNode.id,
      });

      const resultNodes = searchResults.map(result => result.node);
      setEditModeSearchResults(resultNodes);
      setSearchResults(resultNodes);

      // Display search results spatially via unified orchestration
      if (resultNodes.length > 0 && orchestrator) {
        // Combine pending relationships (existing) with new search results (deduped)
        const store = useInterBrainStore.getState();
        const pendingIds = store.editMode.pendingRelationships || [];
        const searchIds = resultNodes.map(n => n.id).filter(id => !pendingIds.includes(id));
        const surroundingNodeIds = [...pendingIds, ...searchIds];

        const context = buildLayoutContext(
          editingNode.id,
          store.flipState.flipStates,
          store.spatialLayout
        );
        const { intent } = deriveFocusIntent(editingNode.id, surroundingNodeIds, context);
        orchestrator.executeLayoutIntent(intent);
        console.log(`[RelationshipEditor] Displaying ${surroundingNodeIds.length} nodes (${pendingIds.length} related + ${searchIds.length} search results) via unified orchestration`);
      }

    } catch (error) {
      console.error('RelationshipEditor3D: Search failed:', error);
      setSearchError(error instanceof Error ? error.message : 'Search failed');
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && localQuery.trim()) {
      e.preventDefault();
      if (debounceTimeoutRef.current) {
        globalThis.clearTimeout(debounceTimeoutRef.current);
      }
      performSearch(localQuery.trim());
    }
    // Escape is handled by useEscapeKeyHandler
  };

  // Save handler
  const handleSave = async () => {
    setIsSaving(true);

    const result = await saveEditModeChanges();

    if (!result.success) {
      uiService.showError(result.error || 'Failed to save relationships');
      setIsSaving(false);
      return;
    }

    // Clear orchestrator data and exit
    if (orchestrator) {
      orchestrator.clearEditModeData();
    }

    // Set spatialLayout BEFORE executeLayoutIntent so nodes animate to correct targets
    const store = useInterBrainStore.getState();
    store.setSpatialLayout('liminal-web');

    // Animate back to liminal-web with editing node centered and updated relationships
    if (editingNode && orchestrator) {
      const relatedIds = orchestrator.getRelatedNodeIds(editingNode.id);
      const context = buildLayoutContext(editingNode.id, store.flipState.flipStates, 'liminal-web');
      const { intent } = deriveFocusIntent(editingNode.id, relatedIds, context);
      orchestrator.executeLayoutIntent(intent);
    }

    exitEditMode();
    setIsSaving(false);

    uiService.showSuccess(`Relationships saved (${pendingRelationships.length} connections)`);
  };

  // Cancel handler
  const handleCancel = () => {
    if (orchestrator) {
      orchestrator.clearEditModeData();
    }

    // Set spatialLayout BEFORE executeLayoutIntent so nodes animate to correct targets
    const store = useInterBrainStore.getState();
    store.setSpatialLayout('liminal-web');

    // Animate back to liminal-web with editing node centered and original relationships
    if (editingNode && orchestrator) {
      const relatedIds = orchestrator.getRelatedNodeIds(editingNode.id);
      const context = buildLayoutContext(editingNode.id, store.flipState.flipStates, 'liminal-web');
      const { intent } = deriveFocusIntent(editingNode.id, relatedIds, context);
      orchestrator.executeLayoutIntent(intent);
    }

    cancelEditMode();
  };

  // Styling - use same nodeSize as DreamNodeEditor3D (from dreamNodeStyles)
  const nodeColors = getNodeColors(editingNode.type);
  const nodeSize = dreamNodeStyles.dimensions.nodeSizeThreeD; // 1000 - same as DreamNodeEditor3D
  const inputWidth = nodeSize * 0.75; // 3/4 of node diameter (750px)
  const inputHeight = nodeSize * 0.12; // Twice as tall (120px)
  const inputBorderRadius = inputHeight / 2; // Pill shape - semicircles on ends
  const inputFontSize = nodeSize * 0.035; // Proportional font size

  // Position at center, slightly in front of the regular DreamNode3D (same as DreamNodeEditor3D)
  const position: [number, number, number] = [0, 0, -49.9];

  // Button styling - exactly match DreamNodeEditor3D ActionButtons
  const basePadding = `${Math.max(8, nodeSize * 0.02)}px ${Math.max(16, nodeSize * 0.04)}px`;
  const buttonFontSize = `${Math.max(14, nodeSize * 0.035)}px`;
  const buttonBorderRadius = `${Math.max(4, nodeSize * 0.01)}px`;
  // Approximate button height (fontSize + padding top/bottom)
  const approxButtonHeight = nodeSize * 0.035 + nodeSize * 0.02 * 2; // ~75px
  // Position buttons just below the node, offset by half button height
  const buttonTopOffset = (nodeSize / 2) + 40 + (approxButtonHeight / 2);

  return (
    <group position={position}>
      <Html
        center
        transform
        sprite
        distanceFactor={10}
        style={{
          pointerEvents: 'auto',
          userSelect: 'none',
          opacity: animatedOpacity,
          transition: 'opacity 0.3s ease'
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            pointerEvents: 'none'
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search Input - centered on node, pill-shaped */}
          <input
            ref={inputRef}
            type="text"
            autoFocus
            value={localQuery}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (inputRef.current) {
                inputRef.current.style.borderColor = nodeColors.border;
              }
            }}
            onBlur={(e) => {
              // Keep focus in relationship edit mode
              e.target.focus();
            }}
            placeholder="Search relationships..."
            style={{
              position: 'relative',
              width: `${inputWidth}px`,
              height: `${inputHeight}px`,
              padding: `${inputHeight * 0.15}px ${inputHeight * 0.3}px`,
              background: 'rgba(0, 0, 0, 1.0)',
              border: `8px solid ${nodeColors.border}`,
              borderRadius: `${inputBorderRadius}px`,
              color: 'white',
              fontSize: `${inputFontSize}px`,
              fontFamily: dreamNodeStyles.typography.fontFamily,
              textAlign: 'center',
              outline: 'none',
              boxShadow: 'none',
              pointerEvents: 'auto'
            }}
          />


          {/* Error message - only show errors */}
          {searchError && (
            <div
              style={{
                position: 'absolute',
                top: `${inputHeight + 20}px`,
                fontSize: `${inputFontSize * 0.8}px`,
                color: '#ff6b6b',
                textAlign: 'center',
                whiteSpace: 'nowrap',
                pointerEvents: 'none'
              }}
            >
              {searchError}
            </div>
          )}

          {/* Action buttons - positioned below the node (exactly match DreamNodeEditor3D) */}
          <div
            style={{
              position: 'absolute',
              top: `${buttonTopOffset}px`,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: '12px',
              pointerEvents: 'auto'
            }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); handleCancel(); }}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={isSaving}
              style={{
                padding: basePadding,
                border: '1px solid rgba(255,255,255,0.5)',
                background: 'transparent',
                color: isSaving ? 'rgba(255,255,255,0.5)' : 'white',
                fontSize: buttonFontSize,
                fontFamily: dreamNodeStyles.typography.fontFamily,
                borderRadius: buttonBorderRadius,
                cursor: isSaving ? 'not-allowed' : 'pointer',
                transition: dreamNodeStyles.transitions.default
              }}
            >
              Cancel
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleSave(); }}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={isSaving}
              style={{
                padding: basePadding,
                border: 'none',
                background: isSaving ? 'rgba(255,255,255,0.3)' : nodeColors.border,
                color: isSaving ? 'rgba(255,255,255,0.5)' : 'white',
                fontSize: buttonFontSize,
                fontFamily: dreamNodeStyles.typography.fontFamily,
                borderRadius: buttonBorderRadius,
                cursor: isSaving ? 'not-allowed' : 'pointer',
                transition: dreamNodeStyles.transitions.default
              }}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </Html>
    </group>
  );
}
