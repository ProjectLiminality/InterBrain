import React from 'react';
import { useInterBrainStore, ProtoNode } from '../../core/store/interbrain-store';
import { useOrchestrator } from '../../core/context/orchestrator-context';
import { serviceManager } from '../../core/services/service-manager';
import { UIService } from '../../core/services/ui-service';
import ProtoNode3D from './ProtoNode3D';

// Create UIService instance for showing user messages
const uiService = new UIService();

/**
 * CreationModeOverlay - Self-contained coordinator for creation mode functionality
 *
 * Follows the EditModeOverlay/SearchModeOverlay pattern:
 * - Subscribes to its own store state
 * - Renders ProtoNode3D
 * - Uses useOrchestrator() for position calculation
 * - Handles all creation callbacks internally
 */
export default function CreationModeOverlay() {
  const {
    creationState,
    completeCreation,
    cancelCreation
  } = useInterBrainStore();

  // Access orchestrator via context for position calculation
  const orchestrator = useOrchestrator();

  // Don't render if not in creation mode
  if (!creationState.isCreating || !creationState.protoNode) {
    return null;
  }

  /**
   * Handle ProtoNode completion - creates a new DreamNode
   */
  const handleProtoNodeComplete = async (protoNode: ProtoNode) => {
    try {
      // Get position on sphere accounting for current rotation
      let finalPosition = protoNode.position;
      if (orchestrator) {
        finalPosition = orchestrator.calculateForwardPositionOnSphere();
      }

      // Use the service manager to create the node
      const service = serviceManager.getActive();
      await service.create(
        protoNode.title,
        protoNode.type,
        protoNode.dreamTalkFile,
        finalPosition,
        protoNode.additionalFiles
      );

      // Add small delay to ensure new DreamNode renders before hiding proto-node
      globalThis.setTimeout(() => {
        completeCreation();
      }, 100);

    } catch (error) {
      console.error('CreationModeOverlay: Failed to create DreamNode:', error);
      uiService.showError(error instanceof Error ? error.message : 'Failed to create DreamNode');
    }
  };

  /**
   * Handle ProtoNode cancel - exit creation mode
   */
  const handleProtoNodeCancel = () => {
    cancelCreation();
  };

  return (
    <ProtoNode3D
      position={creationState.protoNode.position}
      onComplete={handleProtoNodeComplete}
      onCancel={handleProtoNodeCancel}
    />
  );
}
