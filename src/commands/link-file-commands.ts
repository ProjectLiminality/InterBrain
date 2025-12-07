import { Plugin, FuzzySuggestModal, TFile, App } from 'obsidian';
import { UIService } from '../core/services/ui-service';
import { isLinkFile } from '../core/utils/link-file-utils';

/**
 * Link File Commands - Add support for .link files in various contexts
 */
export function registerLinkFileCommands(plugin: Plugin, uiService: UIService): void {
  // Command to show all .link files in a fuzzy search modal
  plugin.addCommand({
    id: 'show-link-files',
    name: 'Show Link Files',
    callback: () => {
      new LinkFileModal(plugin.app, (file) => {
        // Open the selected .link file
        plugin.app.workspace.openLinkText(file.path, '', false);
      }).open();
    }
  });

  // Command specifically for adding .link files to canvas
  plugin.addCommand({
    id: 'add-link-file-to-canvas',
    name: 'Add Link File to Canvas',
    callback: () => {
      new LinkFileModal(plugin.app, (file) => {
        // Try to get the active canvas view and add the file
        const activeView = plugin.app.workspace.getActiveViewOfType(require('obsidian').ItemView);
        if (activeView && activeView.getViewType() === 'canvas') {
          // Add file to canvas at center position
          const canvas = (activeView as { canvas?: { addNode?: (node: unknown) => void } }).canvas;
          if (canvas && canvas.addNode) {
            canvas.addNode({
              type: 'file',
              file: file.path,
              x: 0,
              y: 0,
              width: 400,
              height: 400
            });
            uiService.showSuccess(`Added ${file.basename} to canvas`);
          } else {
            uiService.showError('Unable to add file to canvas - canvas API not available');
          }
        } else {
          uiService.showError('No active canvas view found. Please open a canvas first.');
        }
      }).open();
    }
  });
}

/**
 * Modal for fuzzy searching and selecting .link files
 */
class LinkFileModal extends FuzzySuggestModal<TFile> {
  private onSelectCallback: (file: TFile) => void;

  constructor(app: App, onSelect: (file: TFile) => void) {
    super(app);
    this.onSelectCallback = onSelect;
    this.setPlaceholder('Type to search for link files...');
  }

  getItems(): TFile[] {
    // Get all files in the vault and filter for .link files
    const allFiles = this.app.vault.getFiles();
    return allFiles.filter(file => isLinkFile(file.path));
  }

  getItemText(file: TFile): string {
    // Return the file name without extension for display
    return file.basename;
  }

  renderSuggestion(match: { item: TFile }, el: HTMLElement): void {
    const file = match.item;
    // Create custom rendering for .link files
    el.createDiv({ cls: 'suggestion-content' }, (contentEl) => {
      contentEl.createDiv({ cls: 'suggestion-title', text: file.basename });
      contentEl.createDiv({
        cls: 'suggestion-note',
        text: `${file.parent?.path || ''} • Link File`
      });
    });

    // Add link file icon
    el.createDiv({ cls: 'suggestion-aux' }, (auxEl) => {
      auxEl.createDiv({
        cls: 'suggestion-flair',
        text: '🔗'
      });
    });
  }

  onChooseItem(file: TFile): void {
    this.onSelectCallback(file);
  }
}

/**
 * Enhanced file suggestion that includes .link files
 * This can be used to monkey-patch Obsidian's built-in file suggestions
 */
export class EnhancedFileSuggest {
  static isMediaFile(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const mediaExtensions = [
      // Images
      'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp',
      // Videos
      'mp4', 'webm', 'ogg', 'mov', 'avi',
      // Audio
      'mp3', 'wav', 'm4a', 'aac', 'flac',
      // Documents
      'pdf',
      // Link files
      'link'
    ];

    return mediaExtensions.includes(ext);
  }

  static getMediaFiles(app: App): TFile[] {
    const allFiles = app.vault.getFiles();
    return allFiles.filter((file: TFile) => this.isMediaFile(file.path));
  }
}

/**
 * Monkey-patch to enhance Obsidian's file suggestions
 * This is an experimental approach to include .link files in native modals
 */
export function enhanceFileSuggestions(plugin: Plugin): void {
  // Store original method if it exists
  const originalIsMediaFile = (window as { isMediaFile?: (filename: string) => boolean }).isMediaFile;

  // Override global isMediaFile function if it exists
  (window as { isMediaFile?: (filename: string) => boolean }).isMediaFile = (filename: string) => {
    // Call original implementation first if it exists
    if (originalIsMediaFile && originalIsMediaFile(filename)) {
      return true;
    }

    // Add our custom logic for .link files
    return EnhancedFileSuggest.isMediaFile(filename);
  };

  // Cleanup on unload
  plugin.register(() => {
    if (originalIsMediaFile) {
      (window as { isMediaFile?: (filename: string) => boolean }).isMediaFile = originalIsMediaFile;
    } else {
      delete (window as { isMediaFile?: (filename: string) => boolean }).isMediaFile;
    }
  });
}