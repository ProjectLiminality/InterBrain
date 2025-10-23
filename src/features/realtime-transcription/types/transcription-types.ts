import { ChildProcess } from 'child_process';

/**
 * Transcription process state
 */
export interface TranscriptionProcess {
	/** The running Python process */
	process: ChildProcess | null;
	/** Path to the output markdown file */
	outputPath: string | null;
	/** Whether transcription is currently active */
	isActive: boolean;
	/** Timestamp when transcription started */
	startedAt: number | null;
}

/**
 * Configuration for transcription session
 */
export interface TranscriptionConfig {
	/** Whisper model size */
	model: 'tiny' | 'base' | 'small.en' | 'medium' | 'large';
	/** Optional microphone device name */
	device?: string;
	/** Optional language code */
	language?: string;
	/** Optional audio output path for recording (Songline feature) */
	audioOutput?: string;
}

/**
 * Transcription service interface
 */
export interface ITranscriptionService {
	/** Start transcription to the specified file */
	startTranscription(outputPath: string, config?: Partial<TranscriptionConfig>): Promise<void>;

	/** Stop active transcription */
	stopTranscription(): Promise<void>;

	/** Check if transcription is currently running */
	isRunning(): boolean;

	/** Get the path to the Python script */
	getScriptPath(): string;

	/** Check if Python is available on the system */
	checkPythonAvailable(): Promise<boolean>;
}
