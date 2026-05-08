/**
 * Constellation Layout Settings Section
 *
 * Plugin-local UX preferences for the constellation (night sky) view.
 * Changes auto-apply — no explicit Apply button.
 */

import { Setting } from 'obsidian';
import type InterBrainPlugin from '../../main';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { CONSTELLATION_DEFAULTS } from './constants';

export function createConstellationSettingsSection(
	containerEl: HTMLElement,
	plugin: InterBrainPlugin
): void {
	const header = containerEl.createEl('h2', { text: 'Constellation View' });
	header.id = 'constellation-section';

	const maxNodes = plugin.settings.constellationMaxNodes ?? CONSTELLATION_DEFAULTS.MAX_NODES;
	const prioritizeClusters = plugin.settings.constellationPrioritizeClusters ?? CONSTELLATION_DEFAULTS.PRIORITIZE_CLUSTERS;

	const requestRelayout = () => {
		useInterBrainStore.getState().requestNavigation({ type: 'applyLayout' });
	};

	new Setting(containerEl)
		.setName('Maximum mounted nodes')
		.setDesc('Lower values improve performance for large vaults.')
		.addText(text => {
			text.inputEl.type = 'number';
			text.inputEl.min = '50';
			text.inputEl.max = '500';
			text.inputEl.style.width = '80px';
			text.setValue(maxNodes.toString());
			// Apply on blur (avoid recomputing on every keystroke).
			text.inputEl.addEventListener('blur', async () => {
				const numValue = parseInt(text.inputEl.value, 10);
				if (isNaN(numValue)) return;
				const clamped = Math.max(50, Math.min(500, numValue));
				if (clamped !== plugin.settings.constellationMaxNodes) {
					plugin.settings.constellationMaxNodes = clamped;
					await plugin.saveSettings();
					useInterBrainStore.getState().setConstellationConfig({ maxNodes: clamped });
					requestRelayout();
				}
				if (clamped.toString() !== text.inputEl.value) {
					text.inputEl.value = clamped.toString();
				}
			});
		});

	new Setting(containerEl)
		.setName('Prioritize clusters')
		.setDesc('Prefer nodes that are part of larger relationship clusters when sampling.')
		.addToggle(toggle => toggle
			.setValue(prioritizeClusters)
			.onChange(async (value) => {
				plugin.settings.constellationPrioritizeClusters = value;
				await plugin.saveSettings();
				useInterBrainStore.getState().setConstellationConfig({ prioritizeClusters: value });
				requestRelayout();
			}));
}
