import { App, TFile } from 'obsidian';
import { DreamNode } from '../../../types/dreamnode';
import { getTranscriptionService } from './transcription-service';

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

		// Embed invocation marker in transcript
		await this.embedInvocationInTranscript(node);
	}

	/**
	 * Embed invocation marker inline in the active transcript
	 */
	private async embedInvocationInTranscript(node: DreamNode): Promise<void> {
		try {
			const transcriptionService = getTranscriptionService();
			const transcriptionFile = (transcriptionService as any).transcriptionFile as TFile | null;

			if (!transcriptionFile) {
				console.warn(`⚠️ [ConversationRecording] No active transcript file to embed invocation`);
				return;
			}

			// Read current content
			const currentContent = await this.app.vault.read(transcriptionFile);

			// Append invocation marker inline (like subtitle notation)
			const invocationMarker = ` (Invoked: ${node.name})`;
			const updatedContent = currentContent + invocationMarker;

			// Write back to file
			await this.app.vault.modify(transcriptionFile, updatedContent);

			console.log(`📝 [ConversationRecording] Embedded invocation marker in transcript: "${invocationMarker}"`);
		} catch (error) {
			console.error('❌ [ConversationRecording] Failed to embed invocation in transcript:', error);
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
