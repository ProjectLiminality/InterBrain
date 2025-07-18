import { vi } from 'vitest'

// Mock Notice class
export class Notice {
  constructor(public message: string, public timeout?: number) {}
  hide = vi.fn()
}

// Mock TFile class
export class TFile {
  constructor(public path: string) {}
  name = this.path.split('/').pop() || ''
}

// Mock TFolder class  
export class TFolder {
  constructor(public path: string) {}
  name = this.path.split('/').pop() || ''
}

// Mock WorkspaceLeaf class
export class WorkspaceLeaf {
  view: any = null
  app: any = {}
}

// Mock ItemView class
export class ItemView {
  containerEl = {
    children: [{}, {}]
  }
  
  constructor(public leaf: WorkspaceLeaf) {}
  
  getViewType(): string {
    return ''
  }
  
  getDisplayText(): string {
    return ''
  }
  
  getIcon(): string {
    return ''
  }
  
  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}
}

// Mock Plugin class
export class Plugin {
  app = {
    vault: {
      getAbstractFileByPath: vi.fn(),
      read: vi.fn(),
      create: vi.fn(),
      modify: vi.fn(),
      delete: vi.fn(),
      createFolder: vi.fn(),
    },
    commands: {
      executeCommandById: vi.fn(),
    }
  }
  
  addCommand = vi.fn()
  addRibbonIcon = vi.fn()
}

// Set globals for backward compatibility
global.Notice = Notice
global.TFile = TFile
global.TFolder = TFolder