import React, { useState, useRef, useEffect } from 'react';
import { Html } from '@react-three/drei';
import { dreamNodeStyles, getNodeColors } from '../../dreamspace/dreamNodeStyles';
import { useInterBrainStore } from '../../store/interbrain-store';
import { semanticSearchService } from '../semantic-search/services/semantic-search-service';

interface EditModeSearchNode3DProps {
  position: [number, number, number];
  onCancel: () => void;
}

/**
 * EditModeSearchNode3D - Relationship search interface for edit mode
 * 
 * Renders on top of EditNode3D when relationship search is active.
 * Reuses SearchNode3D visual design but integrates with edit mode search functionality.
 * 
 * Search queries trigger real-time relationship discovery for the editing node.
 */
export default function EditModeSearchNode3D({ 
  position,
  onCancel
}: EditModeSearchNode3DProps) {
  const titleInputRef = useRef<globalThis.HTMLInputElement>(null);
  
  // Get edit mode state from store  
  const { editMode, setEditModeSearchResults, setSpatialLayout, setSearchResults } = useInterBrainStore();
  
  // Local UI state for immediate responsiveness
  const [localQuery, setLocalQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  
  // Debounced search - trigger search 500ms after user stops typing
  const debounceTimeoutRef = React.useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  
  // Animation state - spawn directly at position (no fly-in needed for edit mode)
  const [animatedOpacity, setAnimatedOpacity] = useState<number>(0);
  
  // Handle spawn animation
  useEffect(() => {
    // Fade in when component mounts
    const timer = globalThis.setTimeout(() => {
      setAnimatedOpacity(1);
    }, 50);
    
    // Focus the input after animation and keep it focused
    const focusTimer = globalThis.setTimeout(() => {
      titleInputRef.current?.focus();
    }, 100);
    
    return () => {
      globalThis.clearTimeout(timer);
      globalThis.clearTimeout(focusTimer);
    };
  }, []);
  
  // Global escape key handler for persistent focus management
  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    };
    
    // Add global listener
    globalThis.document.addEventListener('keydown', handleGlobalKeyDown);
    
    return () => {
      globalThis.document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);
  
  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        globalThis.clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);
  
  // Handle query changes with debounced search
  const handleQueryChange = (e: React.ChangeEvent<globalThis.HTMLInputElement>) => {
    const newQuery = e.target.value;
    setLocalQuery(newQuery);
    setSearchError(null);
    
    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      globalThis.clearTimeout(debounceTimeoutRef.current);
    }
    
    // If query is empty, clear results immediately
    if (!newQuery.trim()) {
      setEditModeSearchResults([]);
      return;
    }
    
    // Debounced search after 500ms
    debounceTimeoutRef.current = globalThis.setTimeout(async () => {
      await performSearch(newQuery.trim());
    }, 500);
  };
  
  // Perform the actual search
  const performSearch = async (query: string) => {
    if (!editMode.editingNode || !query.trim()) return;
    
    try {
      setIsSearching(true);
      setSearchError(null);
      
      // Check if semantic search is available
      const isAvailable = await semanticSearchService.isSemanticSearchAvailable();
      if (!isAvailable) {
        setSearchError('Semantic search not available. Please check Ollama configuration.');
        return;
      }
      
      console.log(`🔍 [EditModeSearchNode3D] Searching for relationships: "${query}"`);
      
      // Search for opposite-type nodes for relationship editing
      const searchResults = await semanticSearchService.searchOppositeTypeNodes(
        query,
        editMode.editingNode,
        {
          maxResults: 35, // Leave room for center node in honeycomb layout
          includeSnippets: false // We don't need snippets for relationship editing
        }
      );
      
      const resultNodes = searchResults.map(result => result.node);
      console.log(`✅ [EditModeSearchNode3D] Found ${resultNodes.length} related nodes`);
      
      // Update store with search results for edit mode tracking
      setEditModeSearchResults(resultNodes);
      
      // CRITICAL: Use the same pattern as regular search mode to trigger visual layout
      // Set the main search results and switch to search layout
      setSearchResults(resultNodes);
      setSpatialLayout('search');
      
    } catch (error) {
      console.error('EditModeSearchNode3D: Search failed:', error);
      setSearchError(error instanceof Error ? error.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };
  
  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    } else if (e.key === 'Enter' && localQuery.trim()) {
      e.preventDefault();
      // Trigger immediate search
      if (debounceTimeoutRef.current) {
        globalThis.clearTimeout(debounceTimeoutRef.current);
      }
      performSearch(localQuery.trim());
    }
  };
  
  const handleCancel = () => {
    // Clear any pending search
    if (debounceTimeoutRef.current) {
      globalThis.clearTimeout(debounceTimeoutRef.current);
    }
    onCancel();
  };
  
  // Node styling - 2/3 the size of EditNode3D for more compact search interface
  const nodeSize = 133; // 2/3 of 200px
  const nodeColors = getNodeColors('dream'); // Always use dream style for search
  
  return (
    <group position={position}>
      {/* HTML Interface - No 3D geometry needed for pure UI overlay */}
      <Html
        center
        distanceFactor={200}
        style={{
          pointerEvents: 'auto',
          userSelect: 'none',
          opacity: animatedOpacity
        }}
      >
        <div
          style={{
            // Remove fixed dimensions to eliminate rectangular blocking
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            pointerEvents: 'none' // Allow clicks to pass through container
          }}
        >
          {/* Search Input */}
          <input
            ref={titleInputRef}
            type="text"
            value={localQuery}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              // Maintain focus highlight permanently while in search mode
              if (titleInputRef.current) {
                titleInputRef.current.style.borderColor = nodeColors.border;
              }
            }}
            onBlur={(e) => {
              // Immediately refocus to maintain persistent highlight
              e.target.focus();
            }}
            placeholder="Search relationships..."
            style={{
              position: 'relative',
              width: `${nodeSize * 0.9}px`, // 2/3 of original 200px = 120px (133 * 0.9)
              height: `${nodeSize * 0.15}px`, // Proportionally smaller height
              padding: `${nodeSize * 0.03}px ${nodeSize * 0.04}px`,
              background: 'rgba(0, 0, 0, 1.0)', // Fully opaque black background
              border: `2px solid ${nodeColors.border}`,
              borderRadius: `${nodeSize * 0.075}px`, // Pill shape - semicircles on ends
              color: 'white',
              fontSize: `${nodeSize * 0.06}px`, // 75% of original size (0.08 * 0.75 = 0.06)
              fontFamily: dreamNodeStyles.typography.fontFamily,
              textAlign: 'center',
              outline: 'none', // Remove gray browser outline completely
              boxShadow: 'none', // Remove any default focus shadow
              pointerEvents: 'auto' // Enable clicks only on the input itself
            }}
          />
          
          {/* Search Status */}
          {(isSearching || searchError) && (
            <div
              style={{
                position: 'relative',
                marginTop: '8px',
                fontSize: '12px',
                color: searchError ? '#ff6b6b' : 'rgba(255,255,255,0.7)',
                textAlign: 'center',
                whiteSpace: 'nowrap',
                pointerEvents: 'none' // Allow clicks to pass through
              }}
            >
              {isSearching ? 'Searching...' : searchError}
            </div>
          )}
          
          {/* Close button removed - escape key only */}
        </div>
      </Html>
    </group>
  );
}