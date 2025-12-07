import { Plugin } from 'obsidian';
import { UIService } from '../../services/ui-service';
import { useInterBrainStore } from '../../store/interbrain-store';
import { serviceManager } from '../../services/service-manager';
import { getTranscriptionService } from './services/transcription-service';
import { getConversationRecordingService } from './services/conversation-recording-service';
import { getConversationSummaryService } from './services/conversation-summary-service';
import { getEmailExportService } from './services/email-export-service';
import { getRealtimeTranscriptionService } from '../realtime-transcription';
import { getAudioRecordingService } from './services/audio-recording-service';
import { getPerspectiveService } from './services/perspective-service';
import { getAudioTrimmingService } from './services/audio-trimming-service';

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

        // Enter copilot mode with the person as conversation partner
        console.log(`🎯 [Copilot-Entry] Starting conversation mode with "${freshNode.name}" (${freshNode.id})`);
        store.startCopilotMode(freshNode);

        // NOTE: searchResults are now pre-populated with conversation partner's related nodes
        // This provides a non-empty initial array for better UX
        // First semantic search will overwrite this with fresh results

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

        // Prepare audio recording path for Songline feature
        const audioRecordingService = getAudioRecordingService();
        await audioRecordingService.ensureConversationsDirectory(freshNode);
        const audioOutputPath = audioRecordingService.getAudioOutputPath(freshNode, transcriptFile.name);

        // Start Python real-time transcription with audio recording to the transcript file
        const pythonTranscriptionService = getRealtimeTranscriptionService();
        await pythonTranscriptionService.startTranscription(absoluteTranscriptPath, {
          model: 'small.en',
          audioOutput: audioOutputPath  // Enable audio recording for Songline
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

        // Exit copilot mode IMMEDIATELY for responsive UI
        // This switches layout back to liminal-web and focuses the person
        store.exitCopilotMode();
        console.log(`🌐 [Copilot-Exit] Exited copilot mode - layout switched to liminal-web`);

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

        if (partnerToFocus && (transcriptContent || invocations.length > 0)) {
          try {
            // Get plugin settings for API key
            const settings = (plugin as any).settings;
            console.log(`📧 [Copilot-Exit] Plugin settings:`, !!settings);
            const apiKey = settings?.claudeApiKey;
            console.log(`📧 [Copilot-Exit] API key configured:`, apiKey ? 'YES (length: ' + apiKey.length + ')' : 'NO');

            let aiSummary = '';
            const clipSuggestions: any[] = [];

            if (!apiKey) {
              console.warn(`⚠️ [Copilot-Exit] No Claude API key configured - using basic summary`);
              uiService.showInfo('Creating email with shared DreamNodes (AI summary disabled)');
              // Fallback: No AI summary, just list shared nodes
              aiSummary = ''; // Empty string will trigger basic template in email service
            } else {
              console.log(`📧 [Copilot-Exit] Starting AI summary and clip generation...`);
              uiService.showInfo('Generating AI conversation summary and clips...');

              // Generate AI summary and clip suggestions from transcript content
              console.log(`📧 [Copilot-Exit] Getting summary service...`);
              const summaryService = getConversationSummaryService();
              console.log(`📧 [Copilot-Exit] Calling generateSummaryFromContent...`);
              const result = await summaryService.generateSummaryFromContent(
                transcriptContent,
                invocations,
                partnerToFocus,
                apiKey
              );

              aiSummary = result.summary;
              clipSuggestions.push(...result.clips);

              console.log(`✅ [Copilot-Exit] AI summary generated (length: ${aiSummary.length})`);
              console.log(`✅ [Copilot-Exit] ${clipSuggestions.length} clip suggestions generated`);
              console.log(`📝 [Copilot-Exit] Summary preview: "${aiSummary.substring(0, Math.min(200, aiSummary.length))}..."`);
            }

            // Export to email (works with or without AI summary)
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

            // Process clip suggestions and create Perspectives (Songline feature)
            if (clipSuggestions.length > 0 && transcriptFile) {
              try {
                console.log(`🎵 [Songline] Processing ${clipSuggestions.length} clip suggestions...`);

                // Check for recorded audio file (optional - perspectives work without it)
                const audioRecordingService = getAudioRecordingService();
                const audioPath = await audioRecordingService.getRecordedAudioPath(partnerToFocus, transcriptFile.name);

                let relativeAudioPath: string;
                const vaultPath = (plugin.app.vault.adapter as any).basePath;
                const path = require('path');

                if (!audioPath) {
                  console.warn(`⚠️ [Songline] Audio recording not found - creating perspectives without audio`);
                  console.log(`🎵 [Songline] Expected audio at: conversations/conversation-${transcriptFile.name.replace('transcript-', '').replace('.md', '')}.mp3`);

                  // Create expected path even if file doesn't exist yet
                  // (audio might be added later, or recording might have failed)
                  const baseName = transcriptFile.name.replace('transcript-', 'conversation-').replace('.md', '');
                  const expectedPath = path.join(partnerToFocus.repoPath, 'conversations', `${baseName}.mp3`);
                  relativeAudioPath = expectedPath;
                  console.log(`🎵 [Songline] Using expected audio path: ${relativeAudioPath}`);
                } else {
                  relativeAudioPath = path.relative(vaultPath, audioPath);
                  console.log(`✅ [Songline] Audio recording found: ${audioPath}`);
                }

                // Get perspective service, audio trimming service, and dream node service
                const perspectiveService = getPerspectiveService();
                const audioTrimmingService = getAudioTrimmingService();
                const dreamNodeService = serviceManager.getActive();
                const radicleService = serviceManager.getRadicleService();

                // Check if ffmpeg is available
                const ffmpegAvailable = await audioTrimmingService.checkFfmpegAvailable();
                if (!ffmpegAvailable) {
                  console.error('❌ [Songline] ffmpeg not found - cannot create audio clips');
                  uiService.showError(
                    'ffmpeg is required for Songlines feature.\n\n' +
                    'Install ffmpeg:\n' +
                    '• macOS: brew install ffmpeg\n' +
                    '• Ubuntu/Debian: sudo apt install ffmpeg\n' +
                    '• Windows: Download from ffmpeg.org\n\n' +
                    'Perspectives were not created - please install ffmpeg and try again.'
                  );
                  // Don't fail the entire copilot exit - just skip perspective creation
                  console.log('⚠️ [Songline] Skipping perspective creation - ffmpeg not available');
                } else {
                  // Get my Radicle alias for filename generation
                  let myAlias = 'Me'; // Fallback
                  try {
                    const identity = await radicleService.getIdentity();
                    if (identity?.alias) {
                      myAlias = identity.alias;
                      console.log(`🎵 [Songline] Using Radicle alias: ${myAlias}`);
                    } else {
                      console.warn(`⚠️ [Songline] No Radicle alias found, using fallback: ${myAlias}`);
                    }
                  } catch {
                    console.warn(`⚠️ [Songline] Could not get Radicle identity, using fallback: ${myAlias}`);
                  }

                  // Process each clip suggestion
                  let successCount = 0;
                  for (const clip of clipSuggestions) {
                  try {
                    // Find the DreamNode for this clip
                    const dreamNode = await dreamNodeService.get(clip.nodeUuid);
                    if (!dreamNode) {
                      console.warn(`⚠️ [Songline] DreamNode not found for clip: ${clip.nodeUuid} (${clip.nodeName})`);
                      continue;
                    }

                    // Convert timestamp strings to seconds
                    const startSeconds = perspectiveService.timestampToSeconds(clip.startTime);
                    const endSeconds = perspectiveService.timestampToSeconds(clip.endTime);

                    console.log(`🎵 [Songline] Creating perspective for ${dreamNode.name}:`);
                    console.log(`   - Time: ${clip.startTime} → ${clip.endTime} (${startSeconds}s → ${endSeconds}s)`);
                    console.log(`   - Source audio: ${relativeAudioPath}`);

                    // STEP 1: Create sovereign audio clip by trimming source audio (if audio exists)
                    let clipFilename: string | undefined;
                    if (audioPath) {
                      const sourceExtension = path.extname(audioPath);
                      clipFilename = audioTrimmingService.generateClipFilename(
                        partnerToFocus.name,    // Peer name (Dreamer node title)
                        myAlias || '',           // My name (Radicle alias)
                        conversationStartTime,   // Timestamp
                        sourceExtension          // Audio file extension
                      );
                      const clipPath = path.join(vaultPath, dreamNode.repoPath, clipFilename);

                      console.log(`🎵 [Songline] Trimming audio clip: ${clipFilename}`);
                      await audioTrimmingService.trimAudio({
                        sourceAudioPath: audioPath,
                        outputAudioPath: clipPath,
                        startTime: startSeconds,
                        endTime: endSeconds
                      });
                    } else {
                      console.log(`⚠️ [Songline] Skipping audio trimming - no audio file`);
                    }

                    // STEP 2: Create perspective with sovereign clip (no temporal masking needed)
                    await perspectiveService.addPerspective(dreamNode, {
                      sourceAudioPath: clipFilename || '', // Relative path within DreamNode (sovereign, empty if no audio)
                      startTime: 0,                   // Clip starts at 0 (already trimmed)
                      endTime: endSeconds - startSeconds, // Duration of clip
                      transcript: clip.transcript,
                      conversationDate: conversationStartTime.toISOString(),
                      participants: [partnerToFocus.name, myAlias || ''],
                      dreamerNodeId: partnerToFocus.id,
                      dreamerNodeName: partnerToFocus.name
                    });

                    // STEP 3: Auto-commit the new perspective
                    try {
                      const { exec } = require('child_process');
                      const { promisify } = require('util');
                      const execAsync = promisify(exec);
                      const dreamNodePath = path.join(vaultPath, dreamNode.repoPath);

                      // Add perspectives.json and the audio clip
                      await execAsync('git add perspectives.json perspectives/', { cwd: dreamNodePath });

                      // Check if there are changes to commit
                      const { stdout: status } = await execAsync('git status --porcelain', { cwd: dreamNodePath });
                      if (status.trim()) {
                        const commitMsg = `Add perspective: ${partnerToFocus.name} on ${dreamNode.name}`;
                        await execAsync(`git commit -m "${commitMsg}"`, { cwd: dreamNodePath });
                        console.log(`✅ [Songline] Auto-committed perspective in ${dreamNode.name}`);
                      }
                    } catch (commitError) {
                      console.warn(`⚠️ [Songline] Failed to auto-commit perspective (non-critical):`, commitError);
                      // Don't fail the entire operation if commit fails
                    }

                    successCount++;
                    console.log(`✅ [Songline] Created sovereign perspective ${successCount}/${clipSuggestions.length} for ${dreamNode.name}`);
                  } catch (error) {
                    console.error(`❌ [Songline] Failed to create perspective for ${clip.nodeName}:`, error);
                  }
                  }

                  console.log(`✅ [Songline] Finished processing: ${successCount}/${clipSuggestions.length} perspectives created`);
                  if (successCount > 0) {
                    uiService.showSuccess(`Created ${successCount} conversation perspective${successCount > 1 ? 's' : ''}`);
                  }
                }
              } catch (error) {
                console.error('❌ [Songline] Failed to process perspectives:', error);
                uiService.showWarning('Failed to create conversation clips - check console');
              }
            }
          } catch (error) {
            console.error('❌ [Copilot-Exit] Failed to generate summary or export email:', error);
            console.error('❌ [Copilot-Exit] Error stack:', (error as Error).stack);
            uiService.showError('Failed to create email summary - check console for details');
          }
        } else {
          console.warn(`⚠️ [Copilot-Exit] Skipping email export - no content or invocations`);
        }

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