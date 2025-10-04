import { Plugin } from 'obsidian';
import { UIService } from '../../services/ui-service';
import { useInterBrainStore } from '../../store/interbrain-store';
import { serviceManager } from '../../services/service-manager';
import { getTranscriptionService } from './services/transcription-service';
import { getConversationRecordingService } from './services/conversation-recording-service';
import { getConversationSummaryService } from './services/conversation-summary-service';
import { getEmailExportService } from './services/email-export-service';
import { getRealtimeTranscriptionService } from '../realtime-transcription';

/**
 * Conversational copilot commands for markdown-based transcription and semantic search
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

        // Create transcript file in DreamNode folder (OLD service - creates file + semantic search monitoring)
        const oldTranscriptionService = getTranscriptionService();
        await oldTranscriptionService.startTranscription(freshNode);

        // Get the transcript file path for Python transcription
        const transcriptFile = (oldTranscriptionService as any).transcriptionFile;
        if (!transcriptFile) {
          throw new Error('Failed to create transcript file');
        }

        // Get absolute file system path for Python transcription
        const vaultPath = (plugin.app.vault.adapter as any).basePath;
        const path = require('path');
        const absoluteTranscriptPath = path.join(vaultPath, transcriptFile.path);

        // Start Python real-time transcription to the transcript file
        const pythonTranscriptionService = getRealtimeTranscriptionService();
        await pythonTranscriptionService.startTranscription(absoluteTranscriptPath, {
          model: 'small.en'
        });

        // Start conversation recording (for DreamNode invocations)
        const recordingService = getConversationRecordingService();
        recordingService.startRecording(freshNode);
        console.log(`🎙️ [Copilot] Started recording invocations for conversation with ${freshNode.name}`);

        uiService.showSuccess(`Conversation mode activated with "${freshNode.name}". Start speaking!`);

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

        // Capture the conversation partner, shared nodes, and start time before exiting copilot mode
        const partnerToFocus = store.copilotMode.conversationPartner;
        const sharedNodeIds = [...store.copilotMode.sharedNodeIds]; // Copy before clearing
        console.log(`🎯 [Copilot-Exit] Will focus person after exit: "${partnerToFocus?.name}" (${partnerToFocus?.id})`);

        // Capture conversation metadata before stopping services
        const recordingService = getConversationRecordingService();
        const conversationMetadata = recordingService.getConversationMetadata();
        const conversationStartTime = conversationMetadata.startTime || new Date();

        // Get transcript file reference BEFORE stopping (which deletes it)
        const transcriptionService = getTranscriptionService();
        const transcriptFile = (transcriptionService as any).transcriptionFile;
        console.log(`📝 [Copilot-Exit] Transcript file path:`, transcriptFile?.path || 'null');

        // Read transcript content BEFORE deleting the file
        let transcriptContent = '';
        if (transcriptFile) {
          try {
            transcriptContent = await plugin.app.vault.read(transcriptFile);
            console.log(`📝 [Copilot-Exit] Transcript content captured (${transcriptContent.length} chars)`);
          } catch (error) {
            console.error('❌ [Copilot-Exit] Failed to read transcript:', error);
          }
        }

        // Stop Python transcription first
        const pythonTranscriptionService = getRealtimeTranscriptionService();
        await pythonTranscriptionService.stopTranscription();

        // Stop old transcription service (preserves file, stops monitoring)
        await transcriptionService.stopTranscription();

        // Stop conversation recording and get invocations
        const invocations = recordingService.stopRecording();
        console.log(`🎙️ [Copilot] Stopped recording - captured ${invocations.length} invocations`);

        // Generate AI summary and export email if there were invocations or conversation content
        console.log(`📧 [Copilot-Exit] Checking email export conditions...`);
        console.log(`📧 [Copilot-Exit] partnerToFocus:`, partnerToFocus?.name || 'null');
        console.log(`📧 [Copilot-Exit] transcriptContent length:`, transcriptContent.length);
        console.log(`📧 [Copilot-Exit] invocations count:`, invocations.length);

        if (partnerToFocus && transcriptContent) {
          try {
            // Get plugin settings for API key
            const settings = (plugin as any).settings;
            console.log(`📧 [Copilot-Exit] Plugin settings:`, !!settings);
            const apiKey = settings?.claudeApiKey;
            console.log(`📧 [Copilot-Exit] API key configured:`, apiKey ? 'YES (length: ' + apiKey.length + ')' : 'NO');

            if (!apiKey) {
              console.warn(`⚠️ [Copilot-Exit] No Claude API key configured - skipping AI summary`);
              uiService.showInfo('Email export skipped - configure Claude API key in settings');
            } else {
              console.log(`📧 [Copilot-Exit] Starting email export flow...`);
              uiService.showInfo('Generating conversation summary...');

              // Generate AI summary from transcript content (not file)
              console.log(`📧 [Copilot-Exit] Getting summary service...`);
              const summaryService = getConversationSummaryService();
              console.log(`📧 [Copilot-Exit] Calling generateSummary with content...`);
              const aiSummary = await summaryService.generateSummaryFromContent(
                transcriptContent,
                invocations,
                partnerToFocus,
                apiKey
              );

              console.log(`✅ [Copilot-Exit] AI summary generated (length: ${aiSummary.length})`);
              console.log(`📝 [Copilot-Exit] Summary preview: "${aiSummary.substring(0, 200)}..."`);

              // Export to email
              console.log(`📧 [Copilot-Exit] Getting email service...`);
              const emailService = getEmailExportService();
              const conversationEndTime = new Date();
              console.log(`📧 [Copilot-Exit] Calling exportToEmail...`);

              await emailService.exportToEmail(
                partnerToFocus,
                conversationStartTime,
                conversationEndTime,
                invocations,
                aiSummary
              );

              console.log(`✅ [Copilot-Exit] Email draft created successfully`);
              uiService.showSuccess('Email draft created in Apple Mail');
            }
          } catch (error) {
            console.error('❌ [Copilot-Exit] Failed to generate summary or export email:', error);
            console.error('❌ [Copilot-Exit] Error stack:', (error as Error).stack);
            uiService.showError('Failed to create email summary - check console for details');
          }
        } else {
          console.warn(`⚠️ [Copilot-Exit] Skipping email export - missing requirements`);
        }

        // Exit copilot mode (this processes shared nodes and sets layout back to liminal-web)
        store.exitCopilotMode();

        // Persist bidirectional relationship changes to disk if there were shared nodes
        if (partnerToFocus && sharedNodeIds.length > 0) {
          try {
            const dreamNodeService = serviceManager.getActive();
            const newRelationships = sharedNodeIds.filter(id => !partnerToFocus.liminalWebConnections.includes(id));

            if (newRelationships.length > 0) {
              console.log(`💾 [Copilot-Exit] Adding ${newRelationships.length} bidirectional relationships to disk...`);

              // Add each relationship individually to ensure bidirectional processing
              for (const sharedNodeId of newRelationships) {
                await dreamNodeService.addRelationship(partnerToFocus.id, sharedNodeId);
                console.log(`💾 [Copilot-Exit] Added bidirectional relationship: ${partnerToFocus.name} ↔ ${sharedNodeId}`);
              }

              console.log(`✅ [Copilot-Exit] Successfully persisted ${newRelationships.length} bidirectional relationships`);
            }
          } catch (error) {
            console.error('Failed to persist bidirectional relationship changes:', error);
            uiService.showError('Failed to save bidirectional relationship changes');
          }
        }

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


}