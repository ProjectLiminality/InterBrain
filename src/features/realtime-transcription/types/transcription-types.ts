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
 * Available Whisper models for transcription
 * - tiny: Fastest, lowest accuracy (39M params)
 * - base: Fast, basic accuracy (74M params)
 * - small.en: English-only, good balance (244M params)
 * - small: Multilingual, good balance (244M params)
 * - medium: Higher accuracy, slower (769M params)
 * - large-v3: Best accuracy, requires GPU (1.5B params)
 * - large-v3-turbo: Near-best accuracy, 8x faster than large-v3
 */
export type WhisperModel =
	| 'tiny'
	| 'base'
	| 'small.en'
	| 'small'
	| 'medium'
	| 'large-v3'
	| 'large-v3-turbo';

/**
 * Common language codes for transcription
 * Using ISO 639-1 codes that Whisper supports
 */
export type TranscriptionLanguage =
	| 'auto'  // Auto-detect (multilingual models only)
	| 'en'    // English
	| 'es'    // Spanish
	| 'fr'    // French
	| 'de'    // German
	| 'it'    // Italian
	| 'pt'    // Portuguese
	| 'nl'    // Dutch
	| 'pl'    // Polish
	| 'ru'    // Russian
	| 'zh'    // Chinese
	| 'ja'    // Japanese
	| 'ko'    // Korean
	| 'ar'    // Arabic
	| 'hi'    // Hindi
	| 'he'    // Hebrew
	| 'tr'    // Turkish
	| 'vi'    // Vietnamese
	| 'th'    // Thai
	| 'uk'    // Ukrainian
	| 'cs'    // Czech
	| 'el'    // Greek
	| 'id'    // Indonesian
	| 'ms'    // Malay
	| 'ro'    // Romanian
	| 'hu'    // Hungarian
	| 'sv'    // Swedish
	| 'da'    // Danish
	| 'fi'    // Finnish
	| 'no';   // Norwegian

/**
 * Configuration for transcription session
 */
export interface TranscriptionConfig {
	/** Whisper model to use */
	model: WhisperModel;
	/** Language code for transcription */
	language: TranscriptionLanguage;
	/** Optional microphone device name */
	device?: string;
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
