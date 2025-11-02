import { App, PluginSettingTab, Setting } from 'obsidian';
import type InterBrainPlugin from '../main';

export interface InterBrainSettings {
	claudeApiKey: string;
	radiclePassphrase: string;
	hasLaunchedBefore: boolean;
}

export const DEFAULT_SETTINGS: InterBrainSettings = {
	claudeApiKey: '',
	radiclePassphrase: '',
	hasLaunchedBefore: false
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

		// Radicle Settings Section
		containerEl.createEl('h3', { text: 'Radicle Peer-to-Peer' });

		new Setting(containerEl)
			.setName('Radicle Passphrase')
			.setDesc('Your Radicle passphrase for non-interactive operations (rad init, rad clone)')
			.addText(text => text
				.setPlaceholder('Enter passphrase...')
				.setValue(this.plugin.settings.radiclePassphrase)
				.onChange(async (value) => {
					this.plugin.settings.radiclePassphrase = value;
					await this.plugin.saveSettings();
				})
				.inputEl.type = 'password');
	}
}
