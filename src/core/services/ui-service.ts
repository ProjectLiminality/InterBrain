import { Notice, App, Modal } from 'obsidian';

export class UIService {
  private app?: App;
  
  constructor(app?: App) {
    this.app = app;
  }
  showSuccess(message: string, duration: number = 3000): Notice {
    return new Notice(message, duration);
  }

  showError(message: string, duration: number = 5000): Notice {
    return new Notice(`Error: ${message}`, duration);
  }

  showWarning(message: string, duration: number = 4000): Notice {
    return new Notice(`⚠️ ${message}`, duration);
  }

  showPlaceholder(message: string): void {
    new Notice(`🚧 ${message}`, 3000);
  }

  showLoading(message: string): Notice {
    return new Notice(message, 0); // 0 = persistent until dismissed
  }

  showInfo(message: string, duration: number = 3000): Notice {
    return new Notice(message, duration);
  }
  
  showProgress(message: string): Notice {
    return new Notice(`⏳ ${message}`, 0); // 0 = persistent until dismissed
  }
  
  hideProgress(): void {
    // Notice automatically hides when the returned Notice object is not referenced
    // For more complex progress tracking, we could maintain a reference
  }
  
  async promptForText(title: string, placeholder: string): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.app) {
        resolve(null);
        return;
      }
      // Create a simple input modal using Obsidian's modal system
      const modal = new Modal(this.app);
      modal.titleEl.setText(title);

      const inputEl = modal.contentEl.createEl('input', {
        type: 'text',
        placeholder: placeholder
      });

      const buttonContainer = modal.contentEl.createDiv('modal-button-container');

      const submitBtn = buttonContainer.createEl('button', {
        text: 'OK',
        cls: 'mod-cta'
      });

      const cancelBtn = buttonContainer.createEl('button', {
        text: 'Cancel'
      });

      // Focus the input
      inputEl.focus();

      // Handle submit
      const handleSubmit = () => {
        const value = inputEl.value.trim();
        modal.close();
        resolve(value || null);
      };

      // Handle cancel
      const handleCancel = () => {
        modal.close();
        resolve(null);
      };

      // Event listeners
      submitBtn.onclick = handleSubmit;
      cancelBtn.onclick = handleCancel;
      inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSubmit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel();
        }
      };

      modal.open();
    });
  }

  async promptForPassword(title: string, placeholder: string = ''): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.app) {
        resolve(null);
        return;
      }
      // Create a password input modal using Obsidian's modal system
      const modal = new Modal(this.app);
      modal.titleEl.setText(title);

      const inputEl = modal.contentEl.createEl('input', {
        type: 'password',
        placeholder: placeholder
      });

      const buttonContainer = modal.contentEl.createDiv('modal-button-container');

      const submitBtn = buttonContainer.createEl('button', {
        text: 'OK',
        cls: 'mod-cta'
      });

      const cancelBtn = buttonContainer.createEl('button', {
        text: 'Cancel'
      });

      // Focus the input
      inputEl.focus();

      // Handle submit
      const handleSubmit = () => {
        const value = inputEl.value.trim();
        modal.close();
        resolve(value || null);
      };

      // Handle cancel
      const handleCancel = () => {
        modal.close();
        resolve(null);
      };

      // Event listeners
      submitBtn.onclick = handleSubmit;
      cancelBtn.onclick = handleCancel;
      inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSubmit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel();
        }
      };

      modal.open();
    });
  }

  async getUserInput(prompt: string): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.app) {
        resolve(null);
        return;
      }
      // Create a simple input modal using Obsidian's modal system
      const modal = new Modal(this.app);
      modal.titleEl.setText(prompt);
      
      const inputEl = modal.contentEl.createEl('input', {
        type: 'text',
        placeholder: 'Enter your search query...'
      });
      
      const buttonContainer = modal.contentEl.createDiv('modal-button-container');
      
      const submitBtn = buttonContainer.createEl('button', {
        text: 'Search',
        cls: 'mod-cta'
      });
      
      const cancelBtn = buttonContainer.createEl('button', {
        text: 'Cancel'
      });
      
      // Focus the input
      inputEl.focus();
      
      // Handle submit
      const handleSubmit = () => {
        const value = inputEl.value.trim();
        modal.close();
        resolve(value || null);
      };
      
      // Handle cancel
      const handleCancel = () => {
        modal.close();
        resolve(null);
      };
      
      // Event listeners
      submitBtn.onclick = handleSubmit;
      cancelBtn.onclick = handleCancel;
      inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSubmit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel();
        }
      };
      
      modal.open();
    });
  }

  async showConfirmDialog(
    title: string,
    message: string,
    confirmText: string = 'Continue',
    cancelText: string = 'Cancel'
  ): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.app) {
        resolve(false);
        return;
      }

      const modal = new Modal(this.app);
      modal.titleEl.setText(title);

      // Add message with preserved newlines
      const messageEl = modal.contentEl.createDiv();
      messageEl.style.whiteSpace = 'pre-wrap';
      messageEl.style.marginBottom = '20px';
      messageEl.setText(message);

      const buttonContainer = modal.contentEl.createDiv('modal-button-container');

      const confirmBtn = buttonContainer.createEl('button', {
        text: confirmText,
        cls: 'mod-warning' // Warning style for destructive actions
      });

      const cancelBtn = buttonContainer.createEl('button', {
        text: cancelText,
        cls: 'mod-cta' // Primary style for safe option
      });

      // Handle confirm
      const handleConfirm = () => {
        modal.close();
        resolve(true);
      };

      // Handle cancel
      const handleCancel = () => {
        modal.close();
        resolve(false);
      };

      // Event listeners
      confirmBtn.onclick = handleConfirm;
      cancelBtn.onclick = handleCancel;

      // Escape key cancels
      modal.scope.register([], 'Escape', () => {
        handleCancel();
        return false;
      });

      modal.open();
    });
  }

  /**
   * Show a dialog prompting user to configure settings with button to open settings panel
   * @param message The message to display
   * @param onOpenSettings Callback to open settings panel
   * @returns Promise resolving to true if user clicked "Open Settings", false if "Not Now"
   */
  async showSettingsPrompt(
    message: string,
    onOpenSettings: () => void
  ): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.app) {
        resolve(false);
        return;
      }

      const modal = new Modal(this.app);
      modal.titleEl.setText('Passphrase Required');

      // Add message
      const messageEl = modal.contentEl.createDiv();
      messageEl.style.whiteSpace = 'pre-wrap';
      messageEl.style.marginBottom = '20px';
      messageEl.setText(message);

      const buttonContainer = modal.contentEl.createDiv('modal-button-container');

      const openSettingsBtn = buttonContainer.createEl('button', {
        text: 'Open Settings',
        cls: 'mod-cta'
      });

      const notNowBtn = buttonContainer.createEl('button', {
        text: 'Not Now'
      });

      // Handle open settings
      const handleOpenSettings = () => {
        modal.close();
        onOpenSettings();
        resolve(true);
      };

      // Handle not now
      const handleNotNow = () => {
        modal.close();
        resolve(false);
      };

      // Event listeners
      openSettingsBtn.onclick = handleOpenSettings;
      notNowBtn.onclick = handleNotNow;

      // Escape key closes with "Not Now"
      modal.scope.register([], 'Escape', () => {
        handleNotNow();
        return false;
      });

      modal.open();
    });
  }
}