/**
 * Transcription Settings Section
 *
 * Plugin-local UX preferences for the realtime transcription feature.
 * Whisper model + language live in the InterBrain companion app; this
 * section only exposes the search-buffer size, which shapes how much
 * recent speech feeds the semantic-search rolling buffer.
 */

import { Setting } from 'obsidian';
import type InterBrainPlugin from '../../main';

export function createTranscriptionSettingsSection(
	containerEl: HTMLElement,
	plugin: InterBrainPlugin
): void {
	const header = containerEl.createEl('h2', { text: 'Transcription' });
	header.id = 'transcription-section';

	const bufferSize = plugin.settings.transcriptionSearchBufferSize || 500;

	new Setting(containerEl)
		.setName('Search buffer size')
		.setDesc('Characters of recent speech that influence semantic search. Larger values keep more conversational context in scope.')
		.addText(text => {
			text.inputEl.type = 'number';
			text.inputEl.min = '50';
			text.inputEl.max = '2000';
			text.inputEl.style.width = '80px';
			text.setValue(bufferSize.toString());
			text.inputEl.addEventListener('blur', async () => {
				const numValue = parseInt(text.inputEl.value, 10);
				if (isNaN(numValue)) return;
				const clamped = Math.max(50, Math.min(2000, numValue));
				plugin.settings.transcriptionSearchBufferSize = clamped;
				await plugin.saveSettings();
				if (clamped.toString() !== text.inputEl.value) {
					text.inputEl.value = clamped.toString();
				}
			});
		});
}
