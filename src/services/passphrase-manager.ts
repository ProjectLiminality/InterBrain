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
   * Get passphrase from settings or prompt user if not set
   * When user enters passphrase via prompt, it's saved to settings (persistent)
   * @param prompt Optional custom prompt message
   * @returns Passphrase string or null if user cancels
   */
  async getPassphrase(prompt?: string): Promise<string | null> {
    // Check settings first (persistent storage)
    const settingsPassphrase = (this.plugin as any).settings?.radiclePassphrase;
    if (settingsPassphrase) {
      console.log('PassphraseManager: Using passphrase from settings');
      return settingsPassphrase;
    }

    // Prompt user for passphrase (will save to settings)
    const message = prompt || 'Enter your Radicle passphrase (will be saved to settings for future use)';
    console.log('PassphraseManager: Prompting user for passphrase');

    const userPassphrase = await this.uiService.promptForPassword(message, '');

    if (!userPassphrase || userPassphrase.trim() === '') {
      console.log('PassphraseManager: User cancelled passphrase prompt');
      return null;
    }

    // Save to settings (persistent)
    const trimmedPassphrase = userPassphrase.trim();
    (this.plugin as any).settings.radiclePassphrase = trimmedPassphrase;
    await (this.plugin as any).saveSettings();
    console.log('PassphraseManager: Passphrase saved to settings');

    // Update the settings UI input field if the settings tab is currently open
    this.updateSettingsUIField(trimmedPassphrase);

    return trimmedPassphrase;
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
    this.updateSettingsUIField(passphrase);
  }

  /**
   * Update the passphrase input field in the settings UI if it's currently displayed
   * This ensures the settings panel shows the passphrase immediately after it's entered via prompt
   */
  private updateSettingsUIField(passphrase: string): void {
    // Access the settings tab through the plugin instance
    const settingTab = (this.plugin as any).settingTab;
    if (settingTab && typeof settingTab.updatePassphraseField === 'function') {
      settingTab.updatePassphraseField(passphrase);
      console.log('PassphraseManager: Updated settings UI via settings tab component reference');
    } else {
      console.log('PassphraseManager: Settings tab not available (may not be open)');
    }
  }
}
