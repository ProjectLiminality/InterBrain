import React, { useMemo } from 'react';
import { useInterBrainStore } from '../../store/interbrain-store';
import CopilotSearchNode3D from './CopilotSearchNode3D';

/**
 * CopilotModeOverlay - Main coordinator for conversational copilot functionality
 *
 * Integrates with existing spatial layout system:
 * - CopilotSearchNode3D for transcription and search interface
 * - Leverages existing SpatialOrchestrator search layout for search results
 * - Uses existing DreamNode3D components for displaying results around person
 */
export default function CopilotModeOverlay() {
  const { copilotMode } = useInterBrainStore();

  // Center position for the search interface (closer to camera to overlay person node)
  // Use useMemo to ensure stable reference for React.memo optimization
  const centerPosition = useMemo((): [number, number, number] => [0, 0, -40], []); // 10 units closer than person node

  // Don't render if copilot mode is not active
  if (!copilotMode.isActive || !copilotMode.conversationPartner) {
    return null;
  }

  return (
    <group>
      {/* Conversation partner is positioned at center by SpatialOrchestrator */}
      {/* We only need to render the transcription/search interface */}

      {/* Transcription and search interface - renders at center position (same as edit mode) */}
      <CopilotSearchNode3D
        position={centerPosition} // Exact same position as EditModeSearchNode3D
        visible={copilotMode.showSearchField}
      />

      {/* Search results are handled by existing SpatialOrchestrator + DreamNode3D components */}
      {/* Honeycomb layout and fly-in animations are reused from edit mode */}
    </group>
  );
}