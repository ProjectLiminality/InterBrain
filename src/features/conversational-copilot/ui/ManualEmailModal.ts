/**
 * Manual Email Modal
 *
 * Displays email content in a modal with copyable fields for platforms
 * where automatic email creation is not supported (Windows/Linux).
 *
 * Shows: To, Subject, Body - each with a copy button
 */

/* eslint-disable no-undef */

import { App, Modal } from 'obsidian';

export interface EmailContent {
	to: string;
	subject: string;
	body: string;
}

export class ManualEmailModal extends Modal {
	private emailContent: EmailContent;

	constructor(app: App, emailContent: EmailContent) {
		super(app);
		this.emailContent = emailContent;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('manual-email-modal');

		// Header
		contentEl.createEl('h2', {
			text: 'Post-Call Summary Email',
			cls: 'manual-email-title'
		});

		contentEl.createEl('p', {
			text: 'Automatic email creation is only supported on macOS. Please copy the fields below into your email client.',
			cls: 'manual-email-description'
		});

		// To field
		this.createCopyableField(contentEl, 'To', this.emailContent.to);

		// Subject field
		this.createCopyableField(contentEl, 'Subject', this.emailContent.subject);

		// Body field (larger)
		this.createCopyableField(contentEl, 'Body', this.emailContent.body, true);

		// Close button
		const closeBtn = contentEl.createEl('button', {
			text: 'Done',
			cls: 'manual-email-close-btn'
		});
		closeBtn.addEventListener('click', () => this.close());

		this.addStyles();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private createCopyableField(
		container: HTMLElement,
		label: string,
		value: string,
		isMultiline = false
	) {
		const fieldEl = container.createDiv({ cls: 'manual-email-field' });

		// Label row with copy button
		const labelRow = fieldEl.createDiv({ cls: 'manual-email-label-row' });
		labelRow.createEl('span', { text: label, cls: 'manual-email-label' });

		const copyBtn = labelRow.createEl('button', {
			text: 'Copy',
			cls: 'manual-email-copy-btn'
		});
		copyBtn.addEventListener('click', async () => {
			await navigator.clipboard.writeText(value);
			copyBtn.textContent = 'Copied!';
			copyBtn.addClass('copied');
			setTimeout(() => {
				copyBtn.textContent = 'Copy';
				copyBtn.removeClass('copied');
			}, 2000);
		});

		// Value display
		if (isMultiline) {
			const textArea = fieldEl.createEl('textarea', {
				cls: 'manual-email-value manual-email-body',
				text: value
			});
			textArea.readOnly = true;
			textArea.rows = 12;
		} else {
			const input = fieldEl.createEl('input', {
				cls: 'manual-email-value',
				type: 'text',
				value: value
			}) as HTMLInputElement;
			input.readOnly = true;
		}
	}

	private addStyles() {
		const styleId = 'manual-email-modal-styles';
		if (document.getElementById(styleId)) return;

		const style = document.createElement('style');
		style.id = styleId;
		style.textContent = `
			.manual-email-modal {
				max-width: 600px;
			}

			.manual-email-title {
				margin-bottom: 0.5em;
			}

			.manual-email-description {
				color: var(--text-muted);
				margin-bottom: 1.5em;
				font-size: 0.95em;
			}

			.manual-email-field {
				margin-bottom: 1.25em;
			}

			.manual-email-label-row {
				display: flex;
				justify-content: space-between;
				align-items: center;
				margin-bottom: 0.5em;
			}

			.manual-email-label {
				font-weight: 600;
				font-size: 0.9em;
				color: var(--text-normal);
			}

			.manual-email-copy-btn {
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				padding: 0.25em 0.75em;
				background: var(--background-secondary);
				cursor: pointer;
				font-size: 0.85em;
				transition: background 0.15s, border-color 0.15s;
			}

			.manual-email-copy-btn:hover {
				background: var(--background-modifier-hover);
				border-color: var(--interactive-accent);
			}

			.manual-email-copy-btn.copied {
				background: var(--interactive-accent);
				color: var(--text-on-accent);
				border-color: var(--interactive-accent);
			}

			.manual-email-value {
				width: 100%;
				padding: 0.5em 0.75em;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-primary);
				font-family: var(--font-monospace);
				font-size: 0.9em;
				color: var(--text-normal);
			}

			.manual-email-value:focus {
				outline: none;
				border-color: var(--interactive-accent);
			}

			.manual-email-body {
				resize: vertical;
				min-height: 200px;
				line-height: 1.5;
				white-space: pre-wrap;
			}

			.manual-email-close-btn {
				display: block;
				margin: 1.5em auto 0;
				padding: 0.5em 2em;
				background: var(--interactive-accent);
				color: var(--text-on-accent);
				border: none;
				border-radius: 4px;
				cursor: pointer;
				font-size: 1em;
				transition: opacity 0.15s;
			}

			.manual-email-close-btn:hover {
				opacity: 0.9;
			}
		`;
		document.head.appendChild(style);
	}
}
