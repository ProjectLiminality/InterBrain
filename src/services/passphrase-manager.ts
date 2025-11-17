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

    const userPassphrase = await this.uiService.promptForText(message, '');

    if (!userPassphrase || userPassphrase.trim() === '') {
      console.log('PassphraseManager: User cancelled passphrase prompt');
      return null;
    }

    // Save to settings (persistent)
    const trimmedPassphrase = userPassphrase.trim();
    (this.plugin as any).settings.radiclePassphrase = trimmedPassphrase;
    await (this.plugin as any).saveSettings();
    console.log('PassphraseManager: Passphrase saved to settings');

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
  }
}
