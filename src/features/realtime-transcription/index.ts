/**
 * Real-Time Transcription Feature
 *
 * Self-contained feature for real-time speech transcription using whisper_streaming.
 * Provides seamless voice-to-text capture during conversations, meetings, and ideation sessions.
 */

export { TranscriptionService } from './services/transcription-service';
export { registerTranscriptionCommands, cleanupTranscriptionService } from './commands/transcription-commands';
export type {
	TranscriptionProcess,
	TranscriptionConfig,
	ITranscriptionService
} from './types/transcription-types';
