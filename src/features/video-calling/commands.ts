import { Plugin } from 'obsidian';
import { UIService } from '../../core/services/ui-service';
import { FaceTimeService } from './service';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { VaultService } from '../../core/services/vault-service';

/**
 * FaceTime integration commands for video calling
 */
export function registerFaceTimeCommands(
  plugin: Plugin,
  uiService: UIService,
  vaultService: VaultService,
  faceTimeService: FaceTimeService
): void {

  // Start Video Call - Initiates FaceTime call with selected person
  plugin.addCommand({
    id: 'start-video-call',
    name: 'Start Video Call',
    callback: async () => {
      try {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;

        // Validate node selection
        if (!selectedNode) {
          uiService.showError('Please select a person DreamNode first');
          return;
        }

        // Validate node type
        if (selectedNode.type !== 'dreamer') {
          uiService.showError('Video calls are only available for person (dreamer) nodes');
          return;
        }

        console.log(`Starting video call with: ${selectedNode.name}`);

        // Read metadata to get contact info
        const metadataPath = `${selectedNode.repoPath}/.udd`;
        let metadata;

        try {
          const metadataContent = await vaultService.readFile(metadataPath);
          metadata = JSON.parse(metadataContent);
        } catch (error) {
          console.error('Failed to read metadata:', error);
          uiService.showError('Failed to read DreamNode metadata');
          return;
        }

        // Check for contact information
        const email = metadata.email;
        const phone = metadata.phone;

        if (!email && !phone) {
          uiService.showError(
            'No contact information found for this person. Please add an email or phone number to the DreamNode metadata.'
          );
          return;
        }

        // Use email if available, otherwise phone
        const contact = email || phone;

        // Show loading state
        uiService.showInfo(`Initiating FaceTime call with ${selectedNode.name}...`);

        // Start the FaceTime call
        await faceTimeService.startCall(contact);

        // Trigger the full Start Conversation Mode command (which handles copilot mode + transcription)
        (plugin.app as any).commands.executeCommandById('interbrain:start-conversation-mode');

        uiService.showSuccess(`FaceTime call started with ${selectedNode.name}`);
      } catch (error) {
        console.error('Start Video Call command failed:', error);
        uiService.showError(
          `Failed to start video call: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  });

  // End Video Call - Quits FaceTime and exits copilot mode
  plugin.addCommand({
    id: 'end-video-call',
    name: 'End Video Call',
    callback: async () => {
      try {
        const store = useInterBrainStore.getState();

        // Show loading state
        uiService.showInfo('Ending FaceTime call...');

        // End the FaceTime call
        await faceTimeService.endCall();

        // Trigger the full End Conversation Mode command (which handles copilot exit + cleanup)
        if (store.spatialLayout === 'copilot') {
          (plugin.app as any).commands.executeCommandById('interbrain:end-conversation-mode');
        }

        uiService.showSuccess('FaceTime call ended');
      } catch (error) {
        console.error('End Video Call command failed:', error);
        uiService.showError(
          `Failed to end video call: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  });
}
