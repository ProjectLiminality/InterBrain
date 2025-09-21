import { Plugin } from 'obsidian';
import { UIService } from '../../services/ui-service';
import { useInterBrainStore } from '../../store/interbrain-store';
import { serviceManager } from '../../services/service-manager';

/**
 * Conversational copilot commands for real-time transcription and semantic search
 */
export function registerConversationalCopilotCommands(plugin: Plugin, uiService: UIService): void {

  // Start Conversation Mode
  plugin.addCommand({
    id: 'start-conversation-mode',
    name: 'Start Conversation Mode',
    callback: async () => {
      const store = useInterBrainStore.getState();

      // Check if a person node is selected and in liminal web layout
      if (!store.selectedNode) {
        uiService.showError('No node selected. Please focus a person first.');
        return;
      }

      if (store.spatialLayout !== 'liminal-web') {
        uiService.showError('Conversation mode is only available in liminal web layout.');
        return;
      }

      // Must be a person (dreamer) node
      if (store.selectedNode.type !== 'dreamer') {
        uiService.showError('Conversation mode requires a person (dreamer) node. Please select a person first.');
        return;
      }

      // Check if already in copilot mode
      if (store.copilotMode.isActive) {
        uiService.showError('Conversation mode is already active.');
        return;
      }

      // Check if in edit mode or creation mode
      if (store.editMode.isActive) {
        uiService.showError('Cannot enter conversation mode while in edit mode.');
        return;
      }

      if (store.creationState.isCreating) {
        uiService.showError('Cannot enter conversation mode while creating a node.');
        return;
      }

      try {
        // Get the freshest version of the person node from the service layer
        const dreamNodeService = serviceManager.getActive();
        const freshNode = await dreamNodeService.get(store.selectedNode.id);

        if (!freshNode) {
          uiService.showError('Selected person not found in service layer');
          return;
        }

        // Clear any existing search results to avoid interference
        store.setSearchResults([]);

        // Enter copilot mode with the person as conversation partner
        console.log(`🎯 [Copilot-Entry] Starting conversation mode with "${freshNode.name}" (${freshNode.id})`);
        store.startCopilotMode(freshNode);

        // Show listening indicator
        store.setListening(false); // Start not listening until user activates dictation

        uiService.showSuccess(`Conversation mode activated with "${freshNode.name}". Press Fn key twice to start dictation.`);

        // Auto-focus search field for dictation (handled by the UI component)
        const canvas = globalThis.document.querySelector('[data-dreamspace-canvas]');
        if (canvas) {
          console.log(`🚀 [Copilot-Layout] Dispatching copilot-mode-layout event for person ${freshNode.id}`);
          const event = new globalThis.CustomEvent('copilot-mode-layout', {
            detail: {
              conversationPartnerId: freshNode.id,
              showSearchField: store.copilotMode.showSearchField
            }
          });
          canvas.dispatchEvent(event);
        } else {
          console.error(`❌ [Copilot-Layout] Canvas element not found - layout event failed`);
        }

      } catch (error) {
        console.error('Failed to enter conversation mode:', error);
        uiService.showError('Failed to enter conversation mode');
      }
    }
  });

  // End Conversation Mode
  plugin.addCommand({
    id: 'end-conversation-mode',
    name: 'End Conversation Mode',
    callback: async () => {
      const store = useInterBrainStore.getState();

      if (!store.copilotMode.isActive) {
        uiService.showError('Conversation mode is not active.');
        return;
      }

      try {
        console.log(`🚪 [Copilot-Exit] Ending conversation mode with "${store.copilotMode.conversationPartner?.name}"`);

        // Capture the conversation partner before exiting copilot mode
        const partnerToFocus = store.copilotMode.conversationPartner;
        console.log(`🎯 [Copilot-Exit] Will focus person after exit: "${partnerToFocus?.name}" (${partnerToFocus?.id})`);

        // Exit copilot mode (this also sets layout back to liminal-web)
        store.exitCopilotMode();

        // Clear any search results
        store.setSearchResults([]);

        // Ensure the person remains selected
        if (partnerToFocus) {
          store.setSelectedNode(partnerToFocus);
        }

        uiService.showSuccess(`Conversation mode ended`);

      } catch (error) {
        console.error('Failed to exit conversation mode:', error);
        uiService.showError('Failed to exit conversation mode');
      }
    }
  });

  // Toggle Copilot Search Field (Debug Command)
  plugin.addCommand({
    id: 'toggle-copilot-search-field',
    name: 'Toggle Copilot Search Field',
    callback: async () => {
      const store = useInterBrainStore.getState();

      if (!store.copilotMode.isActive) {
        uiService.showError('Conversation mode is not active.');
        return;
      }

      store.toggleShowSearchField();

      const visibility = store.copilotMode.showSearchField ? 'visible' : 'hidden';
      uiService.showInfo(`Copilot search field is now ${visibility}`);
    }
  });

}