import { Plugin } from 'obsidian';
import { UIService } from '../services/ui-service';
import { FaceTimeService } from '../services/facetime-service';
import { useInterBrainStore } from '../store/interbrain-store';
import { VaultService } from '../services/vault-service';

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

        // Automatically switch to copilot mode
        store.setSpatialLayout('copilot');

        uiService.showSuccess(`FaceTime call started with ${selectedNode.name} - Copilot mode active`);
      } catch (error) {
        console.error('Start Video Call command failed:', error);
        uiService.showError(
          `Failed to start video call: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  });

  // Set Contact Info - Temporary testing command for adding contact metadata
  plugin.addCommand({
    id: 'set-contact-info',
    name: 'Set Contact Info (Testing)',
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
          uiService.showError('Contact info is only applicable for person (dreamer) nodes');
          return;
        }

        // Prompt for email address
        const email = await new Promise<string>((resolve) => {
          const modal = document.createElement('div');
          modal.className = 'modal-container';
          modal.innerHTML = `
            <div class="modal" style="padding: 20px; max-width: 400px;">
              <h3>Set Contact Info for ${selectedNode.name}</h3>
              <p style="margin-bottom: 10px;">Enter email address or phone number:</p>
              <input type="text" id="contact-input" style="width: 100%; padding: 8px; margin-bottom: 15px;" placeholder="email@example.com or +1234567890" />
              <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="cancel-btn" class="mod-cta">Cancel</button>
                <button id="save-btn" class="mod-cta">Save</button>
              </div>
            </div>
          `;

          document.body.appendChild(modal);

          const input = modal.querySelector('#contact-input') as globalThis.HTMLInputElement;
          const saveBtn = modal.querySelector('#save-btn');
          const cancelBtn = modal.querySelector('#cancel-btn');

          input.focus();

          const cleanup = () => {
            modal.remove();
          };

          saveBtn?.addEventListener('click', () => {
            resolve(input.value.trim());
            cleanup();
          });

          cancelBtn?.addEventListener('click', () => {
            resolve('');
            cleanup();
          });

          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              resolve(input.value.trim());
              cleanup();
            } else if (e.key === 'Escape') {
              resolve('');
              cleanup();
            }
          });
        });

        if (!email) {
          uiService.showInfo('Contact info update cancelled');
          return;
        }

        // Read existing metadata
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

        // Determine if it's an email or phone number (simple heuristic)
        const isEmail = email.includes('@');

        if (isEmail) {
          metadata.email = email;
        } else {
          metadata.phone = email;
        }

        // Write updated metadata
        try {
          await vaultService.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
          uiService.showSuccess(
            `Contact ${isEmail ? 'email' : 'phone'} updated for ${selectedNode.name}`
          );
        } catch (error) {
          console.error('Failed to write metadata:', error);
          uiService.showError('Failed to update metadata');
        }
      } catch (error) {
        console.error('Set Contact Info command failed:', error);
        uiService.showError(
          `Failed to set contact info: ${error instanceof Error ? error.message : 'Unknown error'}`
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

        // Exit copilot mode if active
        if (store.spatialLayout === 'copilot') {
          store.setSpatialLayout('liminal-web');
        }

        uiService.showSuccess('FaceTime call ended - Copilot mode deactivated');
      } catch (error) {
        console.error('End Video Call command failed:', error);
        uiService.showError(
          `Failed to end video call: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  });
}
