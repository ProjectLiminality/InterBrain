import { App, TFile } from 'obsidian';
import { DreamNode } from '../../dreamnode';
import { getTranscriptionService } from './transcription-service';
import { getRealtimeTranscriptionService } from '../../realtime-transcription';

/**
 * Invocation Event
 *
 * Records a single DreamNode invocation during a conversation
 */
export interface InvocationEvent {
	timestamp: Date;
	nodeName: string;
	dreamUUID: string;
}

/**
 * Conversation Recording Service
 *
 * Tracks DreamNode invocations during copilot mode for post-call export.
 * Embeds invocation markers into the real-time transcript.
 */
export class ConversationRecordingService {
	private app: App;
	private isRecording: boolean = false;
	private invocations: InvocationEvent[] = [];
	private conversationStartTime: Date | null = null;
	private conversationPartner: DreamNode | null = null;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Start recording conversation invocations
	 */
	startRecording(conversationPartner: DreamNode): void {
		this.isRecording = true;
		this.invocations = [];
		this.conversationStartTime = new Date();
		this.conversationPartner = conversationPartner;
		console.log(`🎙️ [ConversationRecording] Started recording for conversation with ${conversationPartner.name}`);
	}

	/**
	 * Stop recording and return conversation data
	 */
	stopRecording(): InvocationEvent[] {
		this.isRecording = false;
		const recordedInvocations = [...this.invocations];
		console.log(`🛑 [ConversationRecording] Stopped recording - captured ${recordedInvocations.length} invocations`);

		// Clear data
		this.invocations = [];
		this.conversationStartTime = null;
		this.conversationPartner = null;

		return recordedInvocations;
	}

	/**
	 * Record a DreamNode invocation
	 */
	async recordInvocation(node: DreamNode): Promise<void> {
		console.log(`🎙️ [ConversationRecording] recordInvocation called for: ${node.name}`);
		console.log(`🎙️ [ConversationRecording] isRecording state: ${this.isRecording}`);

		if (!this.isRecording) {
			console.warn(`⚠️ [ConversationRecording] Not recording, ignoring invocation of ${node.name}`);
			return;
		}

		const invocationEvent: InvocationEvent = {
			timestamp: new Date(),
			nodeName: node.name,
			dreamUUID: node.id
		};

		this.invocations.push(invocationEvent);
		console.log(`✅ [ConversationRecording] Recorded invocation #${this.invocations.length}: ${node.name} at ${invocationEvent.timestamp.toLocaleTimeString()}`);
		console.log(`📝 [ConversationRecording] Total invocations so far: ${this.invocations.length}`);

		// Embed invocation marker in transcript
		console.log(`📝 [ConversationRecording] About to embed invocation in transcript`);
		await this.embedInvocationInTranscript(node);
		console.log(`✅ [ConversationRecording] Embedding complete`);
	}

	/**
	 * Embed invocation marker inline in the active transcript
	 */
	private async embedInvocationInTranscript(node: DreamNode): Promise<void> {
		try {
			console.log(`📝 [ConversationRecording] embedInvocationInTranscript starting for: ${node.name}`);

			const transcriptionService = getTranscriptionService();
			console.log(`📝 [ConversationRecording] Got transcription service:`, !!transcriptionService);

			const transcriptionFile = (transcriptionService as any).transcriptionFile as TFile | null;
			console.log(`📝 [ConversationRecording] Transcription file:`, transcriptionFile?.path || 'null');

			if (!transcriptionFile) {
				console.warn(`⚠️ [ConversationRecording] No active transcript file to embed invocation`);
				return;
			}

			// Read current content
			console.log(`📝 [ConversationRecording] Reading current transcript content...`);
			const currentContent = await this.app.vault.read(transcriptionFile);
			console.log(`📝 [ConversationRecording] Current content length: ${currentContent.length} chars`);
			console.log(`📝 [ConversationRecording] Last 100 chars: "${currentContent.slice(-100)}"`);

			// Calculate relative timestamp matching Python format
			const pythonTranscriptionService = getRealtimeTranscriptionService();
			const sessionStartTime = pythonTranscriptionService.getSessionStartTime();

			let timestamp: string;
			if (sessionStartTime) {
				// Use same start time as Python transcription for synchronized timestamps
				const elapsed = Date.now() / 1000 - sessionStartTime;
				const minutes = Math.floor(elapsed / 60);
				const seconds = Math.floor(elapsed % 60);
				timestamp = `${minutes}:${seconds.toString().padStart(2, '0')}`;
			} else {
				// Fallback if start time not available (shouldn't happen)
				timestamp = '0:00';
			}

			const invocationMarker = `[${timestamp}] 🔮 Invoked: ${node.name}\n\n`;
			const updatedContent = currentContent + invocationMarker;
			console.log(`📝 [ConversationRecording] Appending marker: "${invocationMarker.trim()}"`);
			console.log(`📝 [ConversationRecording] New content length: ${updatedContent.length} chars`);

			// Write back to file
			console.log(`📝 [ConversationRecording] Writing updated content to file...`);
			await this.app.vault.modify(transcriptionFile, updatedContent);

			console.log(`✅ [ConversationRecording] Successfully embedded invocation marker in transcript: "${invocationMarker}"`);
		} catch (error) {
			console.error('❌ [ConversationRecording] Failed to embed invocation in transcript:', error);
			console.error('❌ [ConversationRecording] Error stack:', (error as Error).stack);
		}
	}

	/**
	 * Get current recording state
	 */
	isCurrentlyRecording(): boolean {
		return this.isRecording;
	}

	/**
	 * Get conversation metadata
	 */
	getConversationMetadata(): { startTime: Date | null; partner: DreamNode | null; invocationCount: number } {
		return {
			startTime: this.conversationStartTime,
			partner: this.conversationPartner,
			invocationCount: this.invocations.length
		};
	}

	/**
	 * Get all recorded invocations (live access during recording)
	 */
	getInvocations(): InvocationEvent[] {
		return [...this.invocations];
	}
}

// Singleton instance
let _conversationRecordingService: ConversationRecordingService | null = null;

export function initializeConversationRecordingService(app: App): void {
	_conversationRecordingService = new ConversationRecordingService(app);
	console.log(`🎙️ [ConversationRecording] Service initialized`);
}

export function getConversationRecordingService(): ConversationRecordingService {
	if (!_conversationRecordingService) {
		throw new Error('ConversationRecordingService not initialized. Call initializeConversationRecordingService() first.');
	}
	return _conversationRecordingService;
}
