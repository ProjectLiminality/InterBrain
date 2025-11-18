/**
 * PassphraseManager - Radicle passphrase management
 *
 * Handles Radicle passphrase prompting and persistent storage.
 * Acts as a portal to the settings panel - prompting saves directly to settings.
 */

import { UIService } from './ui-service';
import type { Plugin } from 'obsidian';

export class PassphraseManager {
  private uiService: UIService;
  private plugin: Plugin;

  constructor(uiService: UIService, plugin: Plugin) {
    this.uiService = uiService;
    this.plugin = plugin;
  }

  /**
   * Get passphrase from settings or show settings redirect if not set
   * @param prompt Optional custom prompt message
   * @returns Passphrase string or null if not configured
   */
  async getPassphrase(prompt?: string): Promise<string | null> {
    // Check settings first (persistent storage)
    const settingsPassphrase = (this.plugin as any).settings?.radiclePassphrase;
    if (settingsPassphrase) {
      console.log('PassphraseManager: Using passphrase from settings');
      return settingsPassphrase;
    }

    // Show settings redirect dialog
    const message = 'Please configure your Radicle passphrase in the settings panel to enable Radicle operations.';
    console.log('PassphraseManager: Passphrase not configured, showing settings redirect');

    await this.uiService.showSettingsPrompt(message, () => {
      // Open settings panel
      (this.plugin.app as any).setting.open();
      // Try to focus the InterBrain tab (Obsidian will show it if it exists)
      (this.plugin.app as any).setting.openTabById?.('interbrain-plugin');
    });

    // Return null - user needs to configure and retry the operation
    console.log('PassphraseManager: User needs to configure passphrase in settings');
    return null;
  }

  /**
   * Check if passphrase is set in settings
   */
  isPassphraseSet(): boolean {
    return !!(this.plugin as any).settings?.radiclePassphrase;
  }

  /**
   * Clear the passphrase from settings
   * Should be called when user wants to remove stored passphrase
   */
  async clearPassphrase(): Promise<void> {
    if ((this.plugin as any).settings?.radiclePassphrase) {
      console.log('PassphraseManager: Clearing passphrase from settings');
      (this.plugin as any).settings.radiclePassphrase = '';
      await (this.plugin as any).saveSettings();
    }
  }

  /**
   * Set passphrase directly and save to settings
   */
  async setPassphrase(passphrase: string): Promise<void> {
    console.log('PassphraseManager: Setting passphrase in settings');
    (this.plugin as any).settings.radiclePassphrase = passphrase;
    await (this.plugin as any).saveSettings();
  }
}
