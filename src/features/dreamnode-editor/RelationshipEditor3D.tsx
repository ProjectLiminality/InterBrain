import React, { useState, useRef, useEffect } from 'react';
import { Html } from '@react-three/drei';
import { dreamNodeStyles, getNodeColors } from '../dreamnode/styles/dreamNodeStyles';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { useOrchestrator } from '../../core/context/orchestrator-context';
import { semanticSearchService } from '../semantic-search/services/semantic-search-service';
import { saveEditModeChanges, cancelEditMode } from './services/editor-service';
import { UIService } from '../../core/services/ui-service';

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
  const [isSearching, setIsSearching] = useState(false);
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

  // Only render in 'relationship-edit' layout mode
  if (spatialLayout !== 'relationship-edit' || !editMode.isActive || !editingNode) {
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

    if (!newQuery.trim()) {
      setEditModeSearchResults([]);
      return;
    }

    debounceTimeoutRef.current = globalThis.setTimeout(async () => {
      await performSearch(newQuery.trim());
    }, 500);
  };

  // Perform semantic search
  const performSearch = async (query: string) => {
    if (!editingNode || !query.trim()) return;

    try {
      setIsSearching(true);
      setSearchError(null);

      const isAvailable = await semanticSearchService.isSemanticSearchAvailable();
      if (!isAvailable) {
        setSearchError('Semantic search not available. Please check Ollama configuration.');
        return;
      }

      const searchResults = await semanticSearchService.searchOppositeTypeNodes(
        query,
        editingNode,
        {
          maxResults: 35,
          includeSnippets: false
        }
      );

      const resultNodes = searchResults.map(result => result.node);
      setEditModeSearchResults(resultNodes);
      setSearchResults(resultNodes);

    } catch (error) {
      console.error('RelationshipEditor3D: Search failed:', error);
      setSearchError(error instanceof Error ? error.message : 'Search failed');
    } finally {
      setIsSearching(false);
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

    useInterBrainStore.getState().setSpatialLayout('liminal-web');
    exitEditMode();
    setIsSaving(false);

    uiService.showSuccess(`Relationships saved (${pendingRelationships.length} connections)`);
  };

  // Cancel handler
  const handleCancel = () => {
    if (orchestrator) {
      orchestrator.clearEditModeData();
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

          {/* Elegant Spinning Ring Loading Indicator - inside input pill */}
          {isSearching && (
            <div
              style={{
                position: 'absolute',
                right: `${inputBorderRadius}px`,
                top: '50%',
                transform: 'translate(50%, -50%)',
                width: `${inputHeight * 0.8}px`,
                height: `${inputHeight * 0.8}px`,
                pointerEvents: 'none'
              }}
            >
              {/* Background circle */}
              <div
                style={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  background: 'rgba(0, 0, 0, 1.0)'
                }}
              />
              {/* Spinning gradient ring */}
              <div
                style={{
                  position: 'absolute',
                  top: '12.5%',
                  left: '12.5%',
                  width: '75%',
                  height: '75%',
                  borderRadius: '50%',
                  background: `conic-gradient(from 0deg, transparent 0%, transparent 75%, ${nodeColors.border} 100%)`,
                  mask: 'radial-gradient(circle, transparent 60%, black 65%)',
                  WebkitMask: 'radial-gradient(circle, transparent 60%, black 65%)',
                  animation: 'spin 1s linear infinite',
                  opacity: 0.9
                }}
              />
              <style>
                {`
                  @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                  }
                `}
              </style>
            </div>
          )}

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
