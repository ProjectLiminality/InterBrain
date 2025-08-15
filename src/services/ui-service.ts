import { Notice, App, Modal } from 'obsidian';

export class UIService {
  private app?: App;
  
  constructor(app?: App) {
    this.app = app;
  }
  showSuccess(message: string): void {
    new Notice(message);
  }

  showError(message: string): void {
    new Notice(`Error: ${message}`, 5000);
  }
  
  showWarning(message: string): void {
    new Notice(`⚠️ ${message}`, 4000);
  }

  showPlaceholder(message: string): void {
    new Notice(`🚧 ${message}`, 3000);
  }

  showLoading(message: string): Notice {
    return new Notice(message, 0); // 0 = persistent until dismissed
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
}