import { App, PluginSettingTab, Setting } from 'obsidian';
import type InterBrainPlugin from '../main';

export interface InterBrainSettings {
	claudeApiKey: string;
}

export const DEFAULT_SETTINGS: InterBrainSettings = {
	claudeApiKey: ''
};

export class InterBrainSettingTab extends PluginSettingTab {
	plugin: InterBrainPlugin;

	constructor(app: App, plugin: InterBrainPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'InterBrain Settings' });

		// AI Settings Section
		containerEl.createEl('h3', { text: 'AI Integration' });

		new Setting(containerEl)
			.setName('Claude API Key')
			.setDesc('Your Anthropic API key for conversation summaries')
			.addText(text => text
				.setPlaceholder('sk-ant-...')
				.setValue(this.plugin.settings.claudeApiKey)
				.onChange(async (value) => {
					this.plugin.settings.claudeApiKey = value;
					await this.plugin.saveSettings();
				})
				.inputEl.type = 'password');
	}
}
