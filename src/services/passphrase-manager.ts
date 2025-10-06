/**
 * PassphraseManager - Secure in-memory Radicle passphrase management
 *
 * Handles Radicle passphrase prompting and session-based caching.
 * Passphrase is stored only in memory and cleared on plugin unload.
 */

import { UIService } from './ui-service';

export class PassphraseManager {
  private passphrase: string | null = null;
  private uiService: UIService;

  constructor(uiService: UIService) {
    this.uiService = uiService;
  }

  /**
   * Get the cached passphrase or prompt user if not set
   * @param prompt Optional custom prompt message
   * @returns Passphrase string or null if user cancels
   */
  async getPassphrase(prompt?: string): Promise<string | null> {
    // Return cached passphrase if available
    if (this.passphrase !== null) {
      console.log('PassphraseManager: Using cached passphrase');
      return this.passphrase;
    }

    // Prompt user for passphrase
    const message = prompt || 'Enter your Radicle passphrase (stored in memory for this session only)';
    console.log('PassphraseManager: Prompting user for passphrase');

    const userPassphrase = await this.uiService.promptForText(message, '');

    if (!userPassphrase || userPassphrase.trim() === '') {
      console.log('PassphraseManager: User cancelled passphrase prompt');
      return null;
    }

    // Cache for this session
    this.passphrase = userPassphrase.trim();
    console.log('PassphraseManager: Passphrase cached for session');

    return this.passphrase;
  }

  /**
   * Check if passphrase is currently cached
   */
  isPassphraseSet(): boolean {
    return this.passphrase !== null;
  }

  /**
   * Clear the cached passphrase from memory
   * Should be called on plugin unload for security
   */
  clearPassphrase(): void {
    if (this.passphrase !== null) {
      console.log('PassphraseManager: Clearing cached passphrase');
      this.passphrase = null;
    }
  }

  /**
   * Set passphrase directly (for testing or manual configuration)
   */
  setPassphrase(passphrase: string): void {
    console.log('PassphraseManager: Passphrase set manually');
    this.passphrase = passphrase;
  }
}
