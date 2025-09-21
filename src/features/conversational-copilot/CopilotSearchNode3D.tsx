import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Html } from '@react-three/drei';
import { dreamNodeStyles, getNodeColors } from '../../dreamspace/dreamNodeStyles';
import { useInterBrainStore } from '../../store/interbrain-store';
// import { semanticSearchService } from '../semantic-search/services/semantic-search-service'; // DISABLED for performance testing
import { Notice } from 'obsidian';

interface CopilotSearchNode3DProps {
  position: [number, number, number];
  visible?: boolean;
}

// Type declarations for Web Speech API (browser support varies)
declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

/**
 * CopilotSearchNode3D - Transcription and search interface for copilot mode
 *
 * Renders at a 3D position using Html from @react-three/drei, following the exact
 * pattern from EditModeSearchNode3D. Integrates Web Speech API for real-time
 * transcription with 500-character FIFO buffer and 5-second debounced search.
 *
 * Memoized to prevent unnecessary re-renders when parent components update.
 */
function CopilotSearchNode3D({
  position,
  visible = true
}: CopilotSearchNode3DProps): React.JSX.Element | null {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);

  // Local state for immediate UI responsiveness
  const [localTranscription, setLocalTranscription] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [animatedOpacity, setAnimatedOpacity] = useState<number>(0);
  const [isSearching, setIsSearching] = useState(false);

  // Store integration with optimized selectors to minimize re-renders
  const isActive = useInterBrainStore(state => state.copilotMode.isActive);
  const conversationPartner = useInterBrainStore(state => state.copilotMode.conversationPartner);
  // DISABLED for performance testing - remove unused store subscriptions:
  // const updateTranscriptionBuffer = useInterBrainStore(state => state.updateTranscriptionBuffer);
  // const setListening = useInterBrainStore(state => state.setListening);
  // const searchResults = useInterBrainStore(state => state.searchResults);
  // const setSearchResults = useInterBrainStore(state => state.setSearchResults);

  // Initialize Web Speech API
  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
      const recognition = new SpeechRecognition();

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      // Handle speech recognition results
      recognition.onresult = (event: any) => {
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          }
        }

        // Update local state with current transcript for immediate responsiveness
        if (finalTranscript) {
          setLocalTranscription(prevValue => {
            const newValue = prevValue + finalTranscript;

            // DISABLED for performance testing:
            // updateTranscriptionBuffer(newValue);
            // triggerDebouncedSearch(newValue);

            return newValue;
          });
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setTranscriptionError(`Speech recognition error: ${event.error}`);
        setIsListening(false);
        // DISABLED for performance testing: setListening(false);
        new Notice(`Speech recognition failed: ${event.error}`);
      };

      recognition.onend = () => {
        setIsListening(false);
        // DISABLED for performance testing: setListening(false);
        console.log('Speech recognition ended');
      };

      recognition.onstart = () => {
        setIsListening(true);
        // DISABLED for performance testing: setListening(true);
        setTranscriptionError(null);
        console.log('Speech recognition started');
        new Notice('Listening... (Press Fn key twice to stop)');
      };

      recognitionRef.current = recognition;
    } else {
      setTranscriptionError('Speech recognition not supported in this browser');
      console.warn('Speech recognition not supported');
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []); // DISABLED dependencies for performance testing

  // Initialize local state from store on mount
  useEffect(() => {
    // DISABLED for performance testing - start with empty transcription
    // setLocalTranscription(copilotMode.transcriptionBuffer);
    setLocalTranscription(''); // Start clean for performance testing
  }, []); // Only on mount, not on every store change

  // Spawn animation (similar to EditModeSearchNode3D)
  useEffect(() => {
    if (visible) {
      const timer = globalThis.setTimeout(() => {
        setAnimatedOpacity(1);
      }, 50);

      // Auto-focus the input field for dictation
      const focusTimer = globalThis.setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);

      return () => {
        globalThis.clearTimeout(timer);
        globalThis.clearTimeout(focusTimer);
      };
    } else {
      setAnimatedOpacity(0);
      return; // Explicit return for this code path
    }
  }, [visible]);

  // DISABLED for performance testing - semantic search functionality
  /*
  const triggerDebouncedSearch = useCallback(async (text: string) => {
    if (!text.trim() || !copilotMode.conversationPartner) return;

    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Set new timeout for 5 seconds (copilot uses longer debounce than edit mode)
    searchTimeoutRef.current = window.setTimeout(async () => {
      try {
        console.log(`🔍 [CopilotSearchNode3D] Running semantic search for: "${text.slice(-50)}..."`);
        setIsSearching(true);

        // Check if semantic search is available
        const isAvailable = await semanticSearchService.isSemanticSearchAvailable();
        if (!isAvailable) {
          console.warn('Semantic search not available');
          return;
        }

        // Search for opposite-type nodes relative to the conversation partner
        const searchResults = await semanticSearchService.searchOppositeTypeNodes(
          text,
          copilotMode.conversationPartner!,
          {
            maxResults: 35, // Leave room for center node in honeycomb layout
            includeSnippets: false // We don't need snippets for copilot mode
          }
        );

        // Update search results in store (this will trigger layout updates)
        setSearchResults(searchResults.map(result => result.node));

        console.log(`✅ [CopilotSearchNode3D] Found ${searchResults.length} search results`);

      } catch (error) {
        console.error('Semantic search failed:', error);
        setTranscriptionError('Search failed');
      } finally {
        setIsSearching(false);
      }
    }, 5000);
  }, [copilotMode.conversationPartner, setSearchResults]);
  */

  // Handle manual input changes with immediate local state update for responsiveness
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value;

    // IMMEDIATE: Update local state for instant responsiveness
    setLocalTranscription(text);

    // DISABLED for performance testing:
    // updateTranscriptionBuffer(text);
    // triggerDebouncedSearch(text);
  };

  // Speech recognition is controlled via Fn key twice - manual toggle removed for cleaner UI

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Don't render if copilot mode is not active
  if (!isActive) {
    return null;
  }

  // Node styling (exactly matching EditModeSearchNode3D)
  const nodeSize = 133; // 2/3 of 200px, same as edit mode for consistency
  const nodeColors = getNodeColors('dream'); // Always use dream style for search (matches EditModeSearchNode3D)

  return (
    <group position={position}>
      <Html
        center
        distanceFactor={200}
        style={{
          pointerEvents: 'auto',
          userSelect: 'none',
          opacity: visible ? animatedOpacity : 0
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
          {/* Transcription Input Field */}
          <input
            ref={searchInputRef}
            type="text"
            value={localTranscription}
            onChange={handleInputChange}
            onFocus={() => {
              if (searchInputRef.current) {
                searchInputRef.current.style.borderColor = nodeColors.border;
              }
            }}
            onBlur={(e) => {
              // Immediately refocus to maintain persistent highlight
              e.target.focus();
            }}
            placeholder="Conversation transcription (press Fn twice to start dictation)..."
            style={{
              position: 'relative',
              width: `${nodeSize * 0.9}px`, // Exact same width as EditModeSearchNode3D: 2/3 of original 200px = 120px (133 * 0.9)
              height: `${nodeSize * 0.15}px`, // Proportionally smaller height
              padding: `${nodeSize * 0.03}px ${nodeSize * 0.04}px`,
              background: 'rgba(0, 0, 0, 1.0)', // Fully opaque black background
              border: `2px solid ${nodeColors.border}`,
              borderRadius: `${nodeSize * 0.075}px`, // Pill shape - semicircles on ends
              color: 'white',
              fontSize: `${nodeSize * 0.06}px`, // 75% of original size (0.08 * 0.75 = 0.06) - matches EditModeSearchNode3D
              fontFamily: dreamNodeStyles.typography.fontFamily,
              textAlign: 'center',
              outline: 'none', // Remove gray browser outline completely
              boxShadow: 'none', // Remove any default focus shadow
              pointerEvents: 'auto' // Enable clicks only on the input itself
            }}
          />

          {/* Simplified Speech Recognition Status - matching EditModeSearchNode3D minimal approach */}
          {isListening && (
            <div
              style={{
                position: 'relative',
                marginTop: '4px',
                fontSize: '10px',
                color: '#44ff44',
                textAlign: 'center',
                whiteSpace: 'nowrap',
                pointerEvents: 'none'
              }}
            >
              🎤 Listening...
            </div>
          )}

          {/* Elegant Spinning Ring Loading Indicator (copied from EditModeSearchNode3D) */}
          {isSearching && (
            <div
              style={{
                position: 'absolute',
                right: `${nodeSize * 0.075}px`, // Distance from right edge to center of right semicircle
                top: '50%',
                transform: 'translate(50%, -50%)', // Center the circle on the right semicircle center
                width: `${nodeSize * 0.12}px`, // Full background circle size
                height: `${nodeSize * 0.12}px`,
                pointerEvents: 'none'
              }}
            >
              {/* Background circle - opaque black to hide text behind (full size) */}
              <div
                style={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  background: 'rgba(0, 0, 0, 1.0)'
                }}
              />

              {/* Spinning gradient ring - 75% size of background circle */}
              <div
                style={{
                  position: 'absolute',
                  top: '12.5%', // Center the 75% sized ring: (100% - 75%) / 2 = 12.5%
                  left: '12.5%',
                  width: '75%', // 75% of the background circle size
                  height: '75%',
                  borderRadius: '50%',
                  background: `conic-gradient(from 0deg, transparent 0%, transparent 75%, ${nodeColors.border} 100%)`,
                  mask: 'radial-gradient(circle, transparent 60%, black 65%)', // Creates ring effect
                  WebkitMask: 'radial-gradient(circle, transparent 60%, black 65%)', // Safari support
                  animation: 'spin 1s linear infinite',
                  opacity: 0.9
                }}
              />

              {/* CSS keyframe animation */}
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

          {/* Error Status - only show errors, matching EditModeSearchNode3D style */}
          {transcriptionError && (
            <div
              style={{
                position: 'relative',
                marginTop: '8px',
                fontSize: '12px',
                color: '#ff6b6b',
                textAlign: 'center',
                whiteSpace: 'nowrap',
                pointerEvents: 'none'
              }}
            >
              {transcriptionError}
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

// Export memoized component to prevent unnecessary re-renders
export default React.memo(CopilotSearchNode3D);