import { Notice } from 'obsidian';

export class UIService {
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
}