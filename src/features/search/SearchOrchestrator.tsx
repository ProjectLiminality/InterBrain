import { useEffect, useRef } from 'react';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { DreamNode } from '../dreamnode';

interface SearchResult {
  node: DreamNode;
  score: number;
  snippet?: string;
}

interface SearchOrchestratorProps {
  onSearchResults: (results: SearchResult[]) => void;
}

/**
 * SearchOrchestrator - Manages periodic search updates with 1-second rhythm
 * 
 * Implements the 1-second periodic check pattern for search query changes.
 * Only triggers semantic search on non-trivial changes (ignoring whitespace-only changes).
 * Designed for performance optimization to avoid overwhelming local Ollama processing.
 */
export default function SearchOrchestrator({ onSearchResults }: SearchOrchestratorProps) {
  const { searchInterface } = useInterBrainStore();
  const { isActive } = searchInterface;
  
  // Track last processed query to detect meaningful changes
  const lastProcessedQuery = useRef<string>('');
  const intervalRef = useRef<number | null>(null);
  
  // Periodic search update effect - 1 second rhythm
  useEffect(() => {
    if (!isActive) {
      // Clean up interval when search is inactive
      if (intervalRef.current) {
        globalThis.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    
    // Start periodic check every 1 second
    intervalRef.current = globalThis.setInterval(() => {
      checkForSearchUpdates();
    }, 1000) as unknown as number;
    
    // Cleanup on unmount or when search becomes inactive
    return () => {
      if (intervalRef.current) {
        globalThis.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive]);
  
  // Check for meaningful search query changes
  const checkForSearchUpdates = async () => {
    const store = useInterBrainStore.getState();
    const currentQuery = store.searchInterface.currentQuery;
    
    // Skip if no meaningful change occurred
    if (!hasSignificantChange(lastProcessedQuery.current, currentQuery)) {
      return;
    }
    
    // Update last processed query
    lastProcessedQuery.current = currentQuery;
    
    // Skip search if query is too short or empty
    if (currentQuery.trim().length < 2) {
      onSearchResults([]);
      return;
    }
    
    // Perform semantic search
    try {
      console.log(`🔍 SearchOrchestrator: Triggering search for "${currentQuery}"`);
      
      // Dynamic import to avoid loading semantic search service unless needed
      const { semanticSearchService } = await import('../semantic-search/services/semantic-search-service');
      
      const results = await semanticSearchService.searchByText(currentQuery, {
        maxResults: 36, // Honeycomb layout capacity
        similarityThreshold: 0.50, // 50% similarity minimum
        includeSnippets: true
      });
      
      console.log(`📊 SearchOrchestrator: Found ${results.length} results`);
      
      // Pass results to parent component
      onSearchResults(results);
      
    } catch (error) {
      console.error('SearchOrchestrator: Search failed:', error);
      onSearchResults([]); // Clear results on error
    }
  };
  
  // This component doesn't render anything - it's a pure orchestration component
  return null;
}

/**
 * Detect significant changes in search query
 * Ignores whitespace-only changes to optimize performance
 */
function hasSignificantChange(previousQuery: string, currentQuery: string): boolean {
  // Normalize queries (trim whitespace, convert to lowercase)
  const normalizedPrevious = previousQuery.trim().toLowerCase();
  const normalizedCurrent = currentQuery.trim().toLowerCase();
  
  // Return true if there's a meaningful difference
  return normalizedPrevious !== normalizedCurrent;
}