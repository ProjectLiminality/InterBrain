import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Html } from '@react-three/drei';
import { dreamNodeStyles, getNodeColors } from '../../dreamspace/dreamNodeStyles';
import { useInterBrainStore } from '../../store/interbrain-store';
import { semanticSearchService } from '../semantic-search/services/semantic-search-service';
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
 */
export default function CopilotSearchNode3D({
  position,
  visible = true
}: CopilotSearchNode3DProps): React.JSX.Element | null {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);

  // Local state
  const [isListening, setIsListening] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [animatedOpacity, setAnimatedOpacity] = useState<number>(0);
  const [isSearching, setIsSearching] = useState(false);

  // Store integration
  const {
    copilotMode,
    updateTranscriptionBuffer,
    setListening,
    searchResults,
    setSearchResults
  } = useInterBrainStore();

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

        // Update the input field with current transcript
        if (searchInputRef.current && finalTranscript) {
          const currentValue = searchInputRef.current.value;
          const newValue = currentValue + finalTranscript;
          searchInputRef.current.value = newValue;

          // Update transcription buffer (with FIFO logic)
          updateTranscriptionBuffer(newValue);
          triggerDebouncedSearch(newValue);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setTranscriptionError(`Speech recognition error: ${event.error}`);
        setIsListening(false);
        setListening(false);
        new Notice(`Speech recognition failed: ${event.error}`);
      };

      recognition.onend = () => {
        setIsListening(false);
        setListening(false);
        console.log('Speech recognition ended');
      };

      recognition.onstart = () => {
        setIsListening(true);
        setListening(true);
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
  }, [updateTranscriptionBuffer, setListening]);

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

  // Debounced semantic search (5 seconds for copilot vs 500ms for edit mode)
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

  // Handle manual input changes (for fallback when speech recognition fails)
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value;
    updateTranscriptionBuffer(text);
    triggerDebouncedSearch(text);
  };

  // Manual speech recognition toggle
  const toggleSpeechRecognition = () => {
    if (!recognitionRef.current) {
      new Notice('Speech recognition not available');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
    }
  };

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Don't render if copilot mode is not active
  if (!copilotMode.isActive) {
    return null;
  }

  // Node styling (similar to EditModeSearchNode3D but with copilot-specific styling)
  const nodeSize = 133; // 2/3 of 200px, same as edit mode for consistency
  const nodeColors = getNodeColors('dreamer'); // Use dreamer style since we're talking to a person

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
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            pointerEvents: 'none',
            gap: `${nodeSize * 0.05}px`
          }}
        >
          {/* Transcription Input Field */}
          <input
            ref={searchInputRef}
            type="text"
            value={copilotMode.transcriptionBuffer}
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
              width: `${nodeSize * 1.5}px`, // Wider than edit mode for longer transcriptions
              height: `${nodeSize * 0.15}px`,
              padding: `${nodeSize * 0.03}px ${nodeSize * 0.04}px`,
              background: 'rgba(0, 0, 0, 1.0)',
              border: `2px solid ${nodeColors.border}`,
              borderRadius: `${nodeSize * 0.075}px`,
              color: 'white',
              fontSize: `${nodeSize * 0.05}px`, // Slightly smaller text for longer content
              fontFamily: dreamNodeStyles.typography.fontFamily,
              textAlign: 'center',
              outline: 'none',
              boxShadow: 'none',
              pointerEvents: 'auto'
            }}
          />

          {/* Speech Recognition Controls */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: `${nodeSize * 0.05}px`,
            pointerEvents: 'auto'
          }}>
            <button
              onClick={toggleSpeechRecognition}
              style={{
                padding: `${nodeSize * 0.03}px ${nodeSize * 0.06}px`,
                border: `1px solid ${nodeColors.border}`,
                borderRadius: `${nodeSize * 0.03}px`,
                backgroundColor: isListening ? '#ff4444' : '#44ff44',
                color: 'white',
                cursor: 'pointer',
                fontSize: `${nodeSize * 0.04}px`,
                fontFamily: dreamNodeStyles.typography.fontFamily
              }}
            >
              {isListening ? 'Stop' : 'Listen'}
            </button>

            {/* Status Indicator */}
            <span style={{
              color: isListening ? '#44ff44' : '#888888',
              fontSize: `${nodeSize * 0.04}px`,
              fontFamily: dreamNodeStyles.typography.fontFamily
            }}>
              {isListening ? '🎤 Listening...' : '⏸️ Not listening'}
            </span>
          </div>

          {/* Search Loading Indicator */}
          {isSearching && (
            <div style={{
              color: '#ffffff',
              fontSize: `${nodeSize * 0.04}px`,
              fontFamily: dreamNodeStyles.typography.fontFamily
            }}>
              🔍 Searching...
            </div>
          )}

          {/* Error Display */}
          {transcriptionError && (
            <div style={{
              color: '#ff4444',
              fontSize: `${nodeSize * 0.04}px`,
              fontFamily: dreamNodeStyles.typography.fontFamily,
              textAlign: 'center',
              maxWidth: `${nodeSize * 1.5}px`
            }}>
              {transcriptionError}
            </div>
          )}

          {/* Buffer/Results Info */}
          <div style={{
            color: '#888888',
            fontSize: `${nodeSize * 0.035}px`,
            fontFamily: dreamNodeStyles.typography.fontFamily,
            textAlign: 'center'
          }}>
            Buffer: {copilotMode.transcriptionBuffer.length}/500 chars
            {searchResults.length > 0 && ` | ${searchResults.length} results`}
          </div>
        </div>
      </Html>
    </group>
  );
}