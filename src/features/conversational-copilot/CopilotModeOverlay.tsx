import { useEffect, useRef } from 'react';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { useOrchestrator } from '../../core/context/orchestrator-context';
import { deriveCopilotEnterIntent } from '../../core/orchestration/intent-helpers';

/**
 * CopilotModeOverlay - Self-contained coordinator for copilot mode spatial orchestration
 *
 * Follows the SearchModeOverlay pattern:
 * - Subscribes to its own store state
 * - On mount: sends constellation nodes home + executes copilot enter intent
 * - Renders nothing (purely orchestration)
 */
export default function CopilotModeOverlay() {
  const copilotMode = useInterBrainStore(state => state.copilotMode);
  const spatialLayout = useInterBrainStore(state => state.spatialLayout);

  // Access orchestrator via context for layout updates
  const orchestrator = useOrchestrator();

  // Only active when copilot mode is on
  const shouldRender = copilotMode.isActive && spatialLayout === 'copilot';

  // On mount: send background constellation nodes home and center the conversation partner
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (shouldRender && orchestrator && !hasInitialized.current) {
      hasInitialized.current = true;

      // Send background constellation nodes to their anchor positions (same as search/liminal-web entry)
      orchestrator.sendConstellationNodesHome();

      // Center the conversation partner with empty ring (ring only shows on Option key)
      if (copilotMode.conversationPartner) {
        const { intent } = deriveCopilotEnterIntent(copilotMode.conversationPartner.id);
        orchestrator.executeLayoutIntent(intent);
        console.log(`[Copilot] Entered copilot mode: centered on "${copilotMode.conversationPartner.name}" via unified orchestration`);
      }
    }
    if (!shouldRender) {
      hasInitialized.current = false;
    }
  }, [shouldRender, orchestrator]);

  // This component is purely for orchestration — no visual output
  return null;
}
