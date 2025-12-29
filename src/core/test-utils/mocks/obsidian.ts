import { vi } from 'vitest'

// Mock App class
export class App {
  vault = {
    getAbstractFileByPath: vi.fn(),
    read: vi.fn(),
    create: vi.fn(),
    modify: vi.fn(),
    delete: vi.fn(),
    createFolder: vi.fn(),
    adapter: {
      basePath: '/mock/vault',
      getResourcePath: vi.fn().mockReturnValue('/mock/resource'),
    },
  }
  workspace = {
    getActiveFile: vi.fn(),
    getLeavesOfType: vi.fn().mockReturnValue([]),
  }
  commands = {
    executeCommandById: vi.fn(),
  }
}

// Mock Modal class
export class Modal {
  app: App
  contentEl: HTMLElement
  modalEl: HTMLElement

  constructor(app: App) {
    this.app = app
    this.contentEl = document.createElement('div')
    this.modalEl = document.createElement('div')
  }

  open = vi.fn()
  close = vi.fn()
  onOpen(): void {}
  onClose(): void {}
}

// Mock Setting class
export class Setting {
  settingEl: HTMLElement

  constructor(_containerEl: HTMLElement) {
    this.settingEl = document.createElement('div')
  }

  setName = vi.fn().mockReturnThis()
  setDesc = vi.fn().mockReturnThis()
  addText = vi.fn().mockReturnThis()
  addToggle = vi.fn().mockReturnThis()
  addDropdown = vi.fn().mockReturnThis()
  addButton = vi.fn().mockReturnThis()
  addTextArea = vi.fn().mockReturnThis()
}

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

// Mock PluginSettingTab class
export class PluginSettingTab {
  app: App
  plugin: Plugin
  containerEl: HTMLElement

  constructor(app: App, plugin: Plugin) {
    this.app = app
    this.plugin = plugin
    this.containerEl = document.createElement('div')
  }

  display(): void {}
  hide(): void {}
}

// Set globals for backward compatibility
const g = globalThis as Record<string, unknown>
g.App = App
g.Modal = Modal
g.Setting = Setting
g.Notice = Notice
g.TFile = TFile
g.TFolder = TFolder
g.PluginSettingTab = PluginSettingTab