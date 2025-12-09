/**
 * Orchestrator Context
 *
 * Provides React context access to the SpatialOrchestrator ref.
 * This allows feature overlays (EditMode, Search, Creation, etc.) to
 * directly call orchestrator methods without using custom DOM events.
 */

import { createContext, useContext } from 'react';
import type { SpatialOrchestratorRef } from '../components/SpatialOrchestrator';

// Context for accessing the SpatialOrchestrator
export const OrchestratorContext = createContext<SpatialOrchestratorRef | null>(null);

/**
 * Hook to access the SpatialOrchestrator from feature components.
 * Returns null if called outside the provider (e.g., during SSR or before mount).
 */
export function useOrchestrator(): SpatialOrchestratorRef | null {
  return useContext(OrchestratorContext);
}
