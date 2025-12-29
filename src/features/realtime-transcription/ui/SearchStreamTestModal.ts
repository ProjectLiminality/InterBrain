/**
 * Search Stream Test Modal
 *
 * A modal for testing the real-time SEARCH stream (stabilized transcription).
 * This stream is used for semantic search during conversations.
 * Shows both the raw stream and the rolling buffer that feeds semantic search.
 */

import { Modal, App } from 'obsidian';
import { getRealtimeTranscriptionService } from '../services/transcription-service';
import type { WhisperModel, TranscriptionLanguage } from '../types/transcription-types';

export class SearchStreamTestModal extends Modal {
	private model: WhisperModel;
	private language: TranscriptionLanguage;
	// eslint-disable-next-line no-undef
	private rawStreamEl: HTMLTextAreaElement | null = null;
	// eslint-disable-next-line no-undef
	private bufferEl: HTMLTextAreaElement | null = null;
	private tempFilePath: string | null = null;
	private isTranscribing = false;

	// Rolling buffer simulation (mirrors conversational-copilot logic)
	private searchBuffer: string = '';
	private lastStreamText: string = '';
	private bufferSize: number = 500;

	constructor(app: App, model: WhisperModel, language: TranscriptionLanguage) {
		super(app);
		this.model = model;
		this.language = language;
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('interbrain-transcription-test-modal');

		// Title
		contentEl.createEl('h2', { text: 'Test Search Stream' });

		// Description
		const descEl = contentEl.createEl('p', {
			cls: 'transcription-test-desc'
		});
		descEl.style.color = 'var(--text-muted)';
		descEl.style.marginBottom = '12px';
		descEl.setText('Shows both raw stream output and the rolling buffer that feeds semantic search.');

		// Info
		const infoEl = contentEl.createEl('p', {
			cls: 'transcription-test-info'
		});
		infoEl.createSpan({ text: `Model: ` });
		infoEl.createEl('strong', { text: this.model });
		infoEl.createSpan({ text: ` | Language: ` });
		infoEl.createEl('strong', { text: this.language === 'auto' ? 'Auto-detect' : this.language });
		infoEl.createSpan({ text: ` | Buffer: ` });
		infoEl.createEl('strong', { text: `${this.bufferSize} chars` });

		// Raw stream label
		const rawLabel = contentEl.createEl('p', { cls: 'transcription-label' });
		rawLabel.style.marginTop = '12px';
		rawLabel.style.marginBottom = '4px';
		rawLabel.style.fontWeight = 'bold';
		rawLabel.style.color = '#3b82f6';
		rawLabel.setText('Raw Stream (current utterance):');

		// Raw stream text area
		this.rawStreamEl = contentEl.createEl('textarea', {
			cls: 'transcription-test-output',
			attr: {
				readonly: 'true',
				placeholder: 'Current utterance appears here...',
				rows: '4'
			}
			// eslint-disable-next-line no-undef
		}) as HTMLTextAreaElement;
		this.rawStreamEl.style.width = '100%';
		this.rawStreamEl.style.minHeight = '80px';
		this.rawStreamEl.style.fontFamily = 'var(--font-monospace)';
		this.rawStreamEl.style.fontSize = '13px';
		this.rawStreamEl.style.padding = '8px';
		this.rawStreamEl.style.resize = 'vertical';

		// Buffer label
		const bufferLabel = contentEl.createEl('p', { cls: 'transcription-label' });
		bufferLabel.style.marginTop = '12px';
		bufferLabel.style.marginBottom = '4px';
		bufferLabel.style.fontWeight = 'bold';
		bufferLabel.style.color = '#22c55e';
		bufferLabel.setText('Semantic Search Buffer (what AI sees):');

		// Buffer text area
		this.bufferEl = contentEl.createEl('textarea', {
			cls: 'transcription-test-output',
			attr: {
				readonly: 'true',
				placeholder: 'Rolling buffer for semantic search...\nAccumulates across utterances.',
				rows: '6'
			}
			// eslint-disable-next-line no-undef
		}) as HTMLTextAreaElement;
		this.bufferEl.style.width = '100%';
		this.bufferEl.style.minHeight = '120px';
		this.bufferEl.style.fontFamily = 'var(--font-monospace)';
		this.bufferEl.style.fontSize = '13px';
		this.bufferEl.style.padding = '8px';
		this.bufferEl.style.resize = 'vertical';
		this.bufferEl.style.backgroundColor = 'var(--background-secondary)';

		// Status indicator
		const statusEl = contentEl.createDiv({ cls: 'transcription-test-status' });
		statusEl.style.marginTop = '12px';
		statusEl.style.display = 'flex';
		statusEl.style.alignItems = 'center';
		statusEl.style.gap = '8px';

		const statusDot = statusEl.createSpan({ cls: 'status-dot' });
		statusDot.style.width = '10px';
		statusDot.style.height = '10px';
		statusDot.style.borderRadius = '50%';
		statusDot.style.backgroundColor = '#3b82f6'; // Blue for search stream
		statusDot.style.animation = 'pulse 1.5s infinite';

		statusEl.createSpan({ text: 'Listening (Search Stream)... Close this modal to stop.' });

		// Add pulse animation
		const styleEl = document.createElement('style');
		styleEl.textContent = `
			@keyframes pulse {
				0%, 100% { opacity: 1; }
				50% { opacity: 0.4; }
			}
		`;
		contentEl.appendChild(styleEl);

		// Start transcription
		await this.startTranscription();
	}

	/**
	 * Process incoming stream text and update rolling buffer
	 * Mirrors the logic in conversational-copilot/transcription-service.ts
	 */
	private processStreamText(text: string): void {
		// Update raw stream display
		if (this.rawStreamEl) {
			this.rawStreamEl.value = text;
		}

		// Detect if this is a new VAD chunk (text reset/shrunk significantly)
		const isNewChunk = text.length < this.lastStreamText.length * 0.5;

		if (isNewChunk && this.lastStreamText) {
			// Previous chunk is complete - append it to the rolling buffer
			this.searchBuffer += ' ' + this.lastStreamText;

			// Trim buffer to max size (keep most recent text)
			if (this.searchBuffer.length > this.bufferSize) {
				this.searchBuffer = this.searchBuffer.slice(-this.bufferSize);
			}
		}

		// Update last stream text
		this.lastStreamText = text;

		// Combine buffer with current text for display
		const combinedText = (this.searchBuffer + ' ' + text).trim();
		const displayText = combinedText.length > this.bufferSize
			? combinedText.slice(-this.bufferSize)
			: combinedText;

		// Update buffer display
		if (this.bufferEl) {
			this.bufferEl.value = displayText;
			this.bufferEl.scrollTop = this.bufferEl.scrollHeight;
		}
	}

	async onClose(): Promise<void> {
		// Clear callback before stopping
		const transcriptionService = getRealtimeTranscriptionService();
		transcriptionService.setSearchTextCallback(null);

		// Stop transcription
		if (this.isTranscribing) {
			await transcriptionService.stopTranscription();
			this.isTranscribing = false;
		}

		// Clean up temp file
		if (this.tempFilePath) {
			try {
				const fs = require('fs');
				if (fs.existsSync(this.tempFilePath)) {
					fs.unlinkSync(this.tempFilePath);
				}
			} catch (error) {
				console.warn('[SearchStreamTestModal] Failed to clean up temp file:', error);
			}
		}
	}

	private async startTranscription(): Promise<void> {
		const transcriptionService = getRealtimeTranscriptionService();

		// Check if already running
		if (transcriptionService.isRunning()) {
			if (this.bufferEl) {
				this.bufferEl.value = 'Error: Transcription is already running elsewhere.\nPlease stop it first.';
			}
			return;
		}

		// Create temp file for transcription output (required by service)
		const os = require('os');
		const path = require('path');
		const fs = require('fs');

		const tempDir = os.tmpdir();
		const tempFileName = `interbrain-search-test-${Date.now()}.md`;
		this.tempFilePath = path.join(tempDir, tempFileName);

		// Create empty file
		fs.writeFileSync(this.tempFilePath, '');

		// Set up search stream callback to process and display both streams
		transcriptionService.setSearchTextCallback((text: string) => {
			this.processStreamText(text);
		});

		// Start transcription to temp file
		try {
			await transcriptionService.startTranscription(this.tempFilePath!, {
				model: this.model,
				language: this.language
			});
			this.isTranscribing = true;
		} catch (error) {
			console.error('[SearchStreamTestModal] Failed to start transcription:', error);
			if (this.bufferEl) {
				this.bufferEl.value = `Error starting transcription: ${error}`;
			}
		}
	}
}
