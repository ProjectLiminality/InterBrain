/**
 * Mock Obsidian APIs for browser development
 * Provides minimal stubs to allow DreamSpace to run outside Obsidian
 */

// Mock basic types that components might expect
export interface MockVault {
  adapter: {
    fs: {
      promises: {
        readFile: (path: string) => Promise<Uint8Array>;
        writeFile: (path: string, data: string) => Promise<void>;
        mkdir: (path: string) => Promise<void>;
      };
    };
  };
}

export interface MockApp {
  vault: MockVault;
  workspace: {
    getLeaf: (newLeaf?: boolean) => MockWorkspaceLeaf;
    revealLeaf: (leaf: MockWorkspaceLeaf) => void;
  };
  commands: {
    executeCommandById: (id: string) => void;
  };
}

export interface MockWorkspaceLeaf {
  setViewState: (state: { type: string; active: boolean }) => Promise<void>;
}

export class ItemView {
  containerEl: HTMLElement | Record<string, never>;
  
  constructor(_leaf: MockWorkspaceLeaf) {
    this.containerEl = (globalThis as typeof window).document?.createElement('div') || {};
  }
  
  getViewType(): string { return 'mock-view'; }
  getDisplayText(): string { return 'Mock View'; }
  getIcon(): string { return 'document'; }
  
  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}
}

export class Plugin {
  app: MockApp;
  
  constructor() {
    this.app = {} as MockApp;
  }
  
  async onload() {}
  onunload() {}
  
  addCommand(command: { name: string; [key: string]: unknown }) {
    console.log('Mock addCommand:', command.name);
  }
  
  addRibbonIcon(icon: string, title: string, _callback: () => void) {
    console.log('Mock addRibbonIcon:', title);
  }
  
  registerView(type: string, _viewCreator: (leaf: MockWorkspaceLeaf) => ItemView) {
    console.log('Mock registerView:', type);
  }
}

export class Notice {
  message: string;
  
  constructor(message: string, _timeout?: number) {
    this.message = message;
    console.log('Mock Notice:', message);
  }
  
  hide() {
    console.log('Mock Notice hidden:', this.message);
  }
}

export class Modal {
  app: MockApp;
  containerEl: HTMLElement;
  
  constructor(_app: MockApp) {
    this.app = _app;
    this.containerEl = (globalThis as typeof window).document?.createElement('div') || {} as HTMLElement;
  }
  
  open() {
    console.log('Mock Modal opened');
  }
  
  close() {
    console.log('Mock Modal closed');
  }
  
  onOpen() {}
  onClose() {}
}

// Export App as a reference to MockApp class
export { MockApp as App };

export interface WorkspaceLeaf extends MockWorkspaceLeaf {}

// Console logging for debugging
console.log('Obsidian mocks loaded for browser development');