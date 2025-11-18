/**
 * PassphraseManager - Radicle passphrase management
 *
 * Handles Radicle passphrase prompting and persistent storage.
 * Acts as a portal to the settings panel - prompting saves directly to settings.
 */

import { UIService } from './ui-service';
import type { Plugin } from 'obsidian';
import { serviceManager } from './service-manager';

export class PassphraseManager {
  private uiService: UIService;
  private plugin: Plugin;

  constructor(uiService: UIService, plugin: Plugin) {
    this.uiService = uiService;
    this.plugin = plugin;
  }

  /**
   * Get passphrase from settings or show settings redirect if not set
   * IMPORTANT: Only prompts for passphrase if Radicle node is NOT already running
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

    // CRITICAL FIX: Check if node is already running BEFORE prompting for passphrase
    // If node is running, we don't need a passphrase (ssh-agent is handling it)
    const radicleService = serviceManager.getRadicleService();
    if (radicleService) {
      try {
        const isRunning = await radicleService.isNodeRunning();
        if (isRunning) {
          console.log('PassphraseManager: Radicle node already running, no passphrase needed');
          return null; // Return null but don't show prompt (node is running)
        }
      } catch (error) {
        console.warn('PassphraseManager: Could not check node status:', error);
        // Continue to show prompt if check fails
      }
    }

    // Node is NOT running and no passphrase configured - show settings redirect dialog
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
