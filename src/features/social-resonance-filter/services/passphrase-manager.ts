/**
 * PassphraseManager - Radicle passphrase management
 *
 * Handles Radicle passphrase prompting and persistent storage.
 * Acts as a portal to the settings panel - prompting saves directly to settings.
 */

import { UIService } from '../../../core/services/ui-service';
import type { Plugin } from 'obsidian';
import { serviceManager } from '../../../core/services/service-manager';

export class PassphraseManager {
  private uiService: UIService;
  private plugin: Plugin;

  constructor(uiService: UIService, plugin: Plugin) {
    this.uiService = uiService;
    this.plugin = plugin;
  }

  /**
   * Get passphrase from settings or gracefully abort if not configured
   * IMPORTANT: Only prompts for passphrase if Radicle node is NOT already running
   * @returns Passphrase string, empty string if node is running, or null if not configured
   */
  async getPassphrase(): Promise<string | null> {
    // STEP 1: Check if node is already running FIRST
    // If running, we don't need a passphrase at all
    const radicleService = serviceManager.getRadicleService();
    if (radicleService) {
      try {
        const isRunning = await radicleService.isNodeRunning();
        if (isRunning) {
          console.log('PassphraseManager: Radicle node already running, no passphrase needed');
          return ''; // Return empty string to indicate "node running, proceed"
        }
      } catch (error) {
        console.warn('PassphraseManager: Could not check node status:', error);
        // Continue to check settings
      }
    }

    // STEP 2: Node is NOT running - check if passphrase is configured in settings
    const settingsPassphrase = (this.plugin as any).settings?.radiclePassphrase;
    if (settingsPassphrase) {
      console.log('PassphraseManager: Using passphrase from settings to start node');
      return settingsPassphrase;
    }

    // STEP 3: No passphrase configured - show settings redirect and abort gracefully
    const message = 'Please configure your Radicle passphrase in the settings panel and try again.';
    console.log('PassphraseManager: Passphrase not configured, showing settings redirect');

    await this.uiService.showSettingsPrompt(message, () => {
      // Open settings panel
      (this.plugin.app as any).setting.open();
      // Try to focus the InterBrain tab (Obsidian will show it if it exists)
      (this.plugin.app as any).setting.openTabById?.('interbrain-plugin');
    });

    // Return null to indicate operation should abort
    console.log('PassphraseManager: Operation aborted - user needs to configure passphrase in settings');
    return null;
  }

  /**
   * Check if passphrase is set in settings
   */
  isPassphraseSet(): boolean {
    return !!(this.plugin as any).settings?.radiclePassphrase;
  }
}
