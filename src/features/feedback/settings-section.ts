/**
 * Feedback Settings Section
 *
 * Feature-owned settings UI for bug reporting and feedback.
 * Rendered within the main settings panel.
 */

import { Setting } from 'obsidian';
import type InterBrainPlugin from '../../main';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { AutoReportPreference } from './store/slice';

/**
 * Create the feedback settings section
 */
export function createFeedbackSettingsSection(
  containerEl: HTMLElement,
  plugin: InterBrainPlugin
): void {
  const header = containerEl.createEl('h2', { text: '🐛 Bug Reporting' });
  header.id = 'feedback-section';

  // Auto-report preference
  const state = useInterBrainStore.getState();

  new Setting(containerEl)
    .setName('Automatic Error Reporting')
    .setDesc('When InterBrain encounters an error:')
    .addDropdown((dropdown) => {
      dropdown
        .addOption('always', 'Always send automatically')
        .addOption('ask', 'Ask me each time (default)')
        .addOption('never', 'Never send')
        .setValue(state.feedback.autoReportPreference)
        .onChange((value) => {
          useInterBrainStore
            .getState()
            .setAutoReportPreference(value as AutoReportPreference);
        });
    });

  containerEl.createEl('hr');

  // Data inclusion section
  containerEl.createEl('h3', { text: 'Data Included in Reports' });

  new Setting(containerEl)
    .setName('Console logs')
    .setDesc('Include last 50 log entries (helps understand context)')
    .addToggle((toggle) => {
      toggle.setValue(state.feedback.includeLogs).onChange((value) => {
        useInterBrainStore.getState().setIncludeLogs(value);
      });
    });

  new Setting(containerEl)
    .setName('App state snapshot')
    .setDesc('Include current DreamSpace state (sanitized, no secrets)')
    .addToggle((toggle) => {
      toggle.setValue(state.feedback.includeState).onChange((value) => {
        useInterBrainStore.getState().setIncludeState(value);
      });
    });

  containerEl.createEl('hr');

  // Action buttons
  const buttonSetting = new Setting(containerEl)
    .setName('Actions')
    .setDesc('Report issues or view existing ones');

  buttonSetting.addButton((button) =>
    button.setButtonText('Report a Bug').onClick(() => {
      plugin.app.commands.executeCommandById('interbrain:report-bug');
    })
  );

  buttonSetting.addButton((button) =>
    button.setButtonText('View Issues').onClick(() => {
      window.open(
        'https://github.com/ProjectLiminality/InterBrain/issues',
        '_blank'
      );
    })
  );

  }
