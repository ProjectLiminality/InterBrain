// import React from 'react';
import { useInterBrainStore } from '../../store/interbrain-store';

/**
 * CopilotModeOverlay - Minimal coordinator for conversational copilot functionality
 *
 * Now simplified to just manage the copilot state since transcription happens in markdown files.
 * Search results are displayed using existing SpatialOrchestrator honeycomb layout around person.
 */
export default function CopilotModeOverlay() {
  const { copilotMode } = useInterBrainStore();

  // Don't render if copilot mode is not active
  if (!copilotMode.isActive || !copilotMode.conversationPartner) {
    return null;
  }

  // No UI components needed - transcription happens in markdown file
  // Search results display is handled by existing SpatialOrchestrator + DreamNode3D components
  return null;
}