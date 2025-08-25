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
    
    // Focus the input after animation
    const focusTimer = globalThis.setTimeout(() => {
      titleInputRef.current?.focus();
    }, 100);
    
    return () => {
      globalThis.clearTimeout(timer);
      globalThis.clearTimeout(focusTimer);
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
            width: `${nodeSize + 20}px`, // Reduced padding around node
            height: `${nodeSize + 60}px`, // Much smaller vertical space to avoid blocking nodes
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Search Input */}
          <input
            ref={titleInputRef}
            type="text"
            value={localQuery}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
            placeholder="Search relationships..."
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: `${Math.max(120, nodeSize * 0.9)}px`, // 2/3 of original 200px = 133px, scale with node
              height: `${Math.max(24, nodeSize * 0.15)}px`, // Proportionally smaller height
              padding: `${Math.max(6, nodeSize * 0.03)}px ${Math.max(10, nodeSize * 0.04)}px`,
              background: 'rgba(0, 0, 0, 1.0)', // Fully opaque black background
              border: `2px solid ${nodeColors.border}`,
              borderRadius: `${Math.max(12, nodeSize * 0.075)}px`, // Pill shape - semicircles on ends
              color: 'white',
              fontSize: `${Math.max(14, nodeSize * 0.08)}px`,
              fontFamily: dreamNodeStyles.typography.fontFamily,
              textAlign: 'center',
              outline: 'none',
              transition: 'border-color 0.2s ease',
            }}
          />
          
          {/* Search Status */}
          {(isSearching || searchError) && (
            <div
              style={{
                position: 'absolute',
                top: '65%',
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: '12px',
                color: searchError ? '#ff6b6b' : 'rgba(255,255,255,0.7)',
                textAlign: 'center',
                whiteSpace: 'nowrap'
              }}
            >
              {isSearching ? 'Searching...' : searchError}
            </div>
          )}
          
          {/* Action Button */}
          <div
            style={{
              position: 'absolute',
              top: `${nodeSize + 40}px`, // Adjusted for smaller container
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: '12px'
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCancel();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                padding: `${Math.max(8, nodeSize * 0.02)}px ${Math.max(16, nodeSize * 0.04)}px`,
                border: '1px solid rgba(255,255,255,0.5)',
                background: 'transparent',
                color: 'white',
                fontSize: `${Math.max(14, nodeSize * 0.035)}px`,
                fontFamily: dreamNodeStyles.typography.fontFamily,
                borderRadius: `${Math.max(4, nodeSize * 0.01)}px`,
                cursor: 'pointer',
                transition: dreamNodeStyles.transitions.default
              }}
            >
              Close
            </button>
          </div>
        </div>
      </Html>
    </group>
  );
}