/**
 * Constellation Layout Settings Section
 *
 * Feature-owned settings UI for constellation filtering and node limits.
 * Rendered within the main settings panel.
 */

import { Setting } from 'obsidian';
import type InterBrainPlugin from '../../main';
import { useInterBrainStore } from '../../core/store/interbrain-store';

/**
 * Create the constellation layout settings section
 */
export function createConstellationSettingsSection(
	containerEl: HTMLElement,
	_plugin: InterBrainPlugin
): void {
	const header = containerEl.createEl('h2', { text: '🌌 Constellation View' });
	header.id = 'constellation-section';

	containerEl.createEl('p', {
		text: 'Configure how DreamNodes are displayed in the constellation (night sky) view. Limiting the number of mounted nodes improves performance for large vaults.',
		cls: 'setting-item-description'
	});

	const store = useInterBrainStore.getState();
	const config = store.constellationConfig;

	// Max Nodes setting
	new Setting(containerEl)
		.setName('Maximum Mounted Nodes')
		.setDesc('Maximum number of DreamNodes to render in the constellation. Nodes beyond this limit are loaded on-demand. Lower values improve performance. (Requires re-applying constellation layout)')
		.addSlider(slider => slider
			.setLimits(50, 500, 10)
			.setValue(config.maxNodes)
			.setDynamicTooltip()
			.onChange((value) => {
				useInterBrainStore.getState().setConstellationConfig({ maxNodes: value });
			}))
		.addExtraButton(button => button
			.setIcon('reset')
			.setTooltip('Reset to default (150)')
			.onClick(() => {
				useInterBrainStore.getState().setConstellationConfig({ maxNodes: 150 });
				// Refresh display by triggering re-render
				const sliderEl = containerEl.querySelector('.constellation-maxnodes-slider input[type="range"]') as HTMLInputElement;
				if (sliderEl) {
					sliderEl.value = '150';
					sliderEl.dispatchEvent(new Event('input'));
				}
			}));

	// Prioritize Clusters toggle
	new Setting(containerEl)
		.setName('Prioritize Clusters')
		.setDesc('When sampling nodes to display, prefer nodes that are part of larger relationship clusters. This keeps constellations more intact.')
		.addToggle(toggle => toggle
			.setValue(config.prioritizeClusters)
			.onChange((value) => {
				useInterBrainStore.getState().setConstellationConfig({ prioritizeClusters: value });
			}));

	// Current filter stats
	const filter = store.constellationFilter;
	if (filter.mountedNodes.size > 0) {
		const statsDiv = containerEl.createDiv({ cls: 'constellation-filter-stats' });
		statsDiv.style.marginTop = '12px';
		statsDiv.style.padding = '12px';
		statsDiv.style.borderRadius = '4px';
		statsDiv.style.fontSize = '12px';

		statsDiv.createEl('h4', { text: 'Current Filter Stats:' });
		const statsList = statsDiv.createEl('ul');
		statsList.style.margin = '8px 0';
		statsList.style.paddingLeft = '20px';

		const stats = [
			{ label: 'VIP Nodes (edge members)', value: filter.vipNodes.size },
			{ label: 'Parent Nodes (DreamSong owners)', value: filter.parentNodes.size },
			{ label: 'Sampled Nodes', value: filter.sampledNodes.size },
			{ label: 'Ephemeral Nodes (on-demand)', value: filter.ephemeralNodes.size },
			{ label: 'Total Mounted', value: filter.mountedNodes.size }
		];

		stats.forEach(stat => {
			const li = statsList.createEl('li');
			li.createEl('strong', { text: `${stat.value}` });
			li.appendText(` ${stat.label}`);
		});
	} else {
		containerEl.createEl('p', {
			text: 'Filter not yet computed. Run "Apply Constellation Layout" to see stats.',
			cls: 'setting-item-description'
		});
	}

	// Apply layout button
	new Setting(containerEl)
		.setName('Apply Layout')
		.setDesc('Recompute constellation layout and filter with current settings')
		.addButton(button => button
			.setButtonText('Apply Constellation Layout')
			.setCta()
			.onClick(() => {
				useInterBrainStore.getState().requestNavigation({ type: 'applyLayout' });
			}));
}
