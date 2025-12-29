/**
 * Transcription Test Modal
 *
 * A modal for testing transcription settings. Writes to a temp file
 * and displays the transcribed text in real-time.
 */

import { Modal, App } from 'obsidian';
import { getRealtimeTranscriptionService } from '../services/transcription-service';
import type { WhisperModel, TranscriptionLanguage } from '../types/transcription-types';

export class TranscriptionTestModal extends Modal {
	private model: WhisperModel;
	private language: TranscriptionLanguage;
	// eslint-disable-next-line no-undef
	private textAreaEl: HTMLTextAreaElement | null = null;
	private tempFilePath: string | null = null;
	private watchInterval: ReturnType<typeof setInterval> | null = null;
	private isTranscribing = false;

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
		contentEl.createEl('h2', { text: 'Test Transcription' });

		// Info
		const infoEl = contentEl.createEl('p', {
			cls: 'transcription-test-info'
		});
		infoEl.createSpan({ text: `Model: ` });
		infoEl.createEl('strong', { text: this.model });
		infoEl.createSpan({ text: ` | Language: ` });
		infoEl.createEl('strong', { text: this.language === 'auto' ? 'Auto-detect' : this.language });

		// Text area for transcription output
		this.textAreaEl = contentEl.createEl('textarea', {
			cls: 'transcription-test-output',
			attr: {
				readonly: 'true',
				placeholder: 'Transcription will appear here...\n\nSpeak into your microphone.',
				rows: '12'
			}
			// eslint-disable-next-line no-undef
		}) as HTMLTextAreaElement;
		this.textAreaEl.style.width = '100%';
		this.textAreaEl.style.minHeight = '200px';
		this.textAreaEl.style.fontFamily = 'var(--font-monospace)';
		this.textAreaEl.style.fontSize = '14px';
		this.textAreaEl.style.padding = '12px';
		this.textAreaEl.style.resize = 'vertical';

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
		statusDot.style.backgroundColor = '#22c55e';
		statusDot.style.animation = 'pulse 1.5s infinite';

		statusEl.createSpan({ text: 'Listening... Close this modal to stop.' });

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

	async onClose(): Promise<void> {
		// Stop watching file
		if (this.watchInterval) {
			clearInterval(this.watchInterval);
			this.watchInterval = null;
		}

		// Stop transcription
		if (this.isTranscribing) {
			const transcriptionService = getRealtimeTranscriptionService();
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
				console.warn('[TranscriptionTestModal] Failed to clean up temp file:', error);
			}
		}
	}

	private async startTranscription(): Promise<void> {
		const transcriptionService = getRealtimeTranscriptionService();

		// Check if already running
		if (transcriptionService.isRunning()) {
			if (this.textAreaEl) {
				this.textAreaEl.value = 'Error: Transcription is already running elsewhere.\nPlease stop it first.';
			}
			return;
		}

		// Create temp file for transcription output
		const os = require('os');
		const path = require('path');
		const fs = require('fs');

		const tempDir = os.tmpdir();
		const tempFileName = `interbrain-test-${Date.now()}.md`;
		this.tempFilePath = path.join(tempDir, tempFileName);

		// Create empty file
		fs.writeFileSync(this.tempFilePath, '');

			// Start transcription to temp file
		try {
			await transcriptionService.startTranscription(this.tempFilePath!, {
				model: this.model,
				language: this.language
			});
			this.isTranscribing = true;

			// Watch the temp file for changes
			this.startWatchingFile();
		} catch (error) {
			console.error('[TranscriptionTestModal] Failed to start transcription:', error);
			if (this.textAreaEl) {
				this.textAreaEl.value = `Error starting transcription: ${error}`;
			}
		}
	}

	private startWatchingFile(): void {
		if (!this.tempFilePath) return;

		const fs = require('fs');
		let lastContent = '';

		// Poll the file every 500ms for new content
		this.watchInterval = setInterval(() => {
			if (!this.tempFilePath) return;

			try {
				if (fs.existsSync(this.tempFilePath)) {
					const content = fs.readFileSync(this.tempFilePath, 'utf-8');
					if (content !== lastContent) {
						lastContent = content;
						if (this.textAreaEl) {
							this.textAreaEl.value = content;
							// Scroll to bottom
							this.textAreaEl.scrollTop = this.textAreaEl.scrollHeight;
						}
					}
				}
			} catch {
				// File might be locked during write, ignore
			}
		}, 500);
	}
}
