import { vi } from 'vitest'

// Mock Notice class
export const mockNotice = vi.fn().mockImplementation(() => ({
  hide: vi.fn(),
}))

// Mock TFile and TFolder classes
export class MockTFile {
  path: string
  name: string
  
  constructor(path: string) {
    this.path = path
    this.name = path.split('/').pop() || ''
  }
}

export class MockTFolder {
  path: string
  name: string
  
  constructor(path: string) {
    this.path = path
    this.name = path.split('/').pop() || ''
  }
}

// Mock Vault
export const mockVault = {
  getAbstractFileByPath: vi.fn(),
  read: vi.fn(),
  create: vi.fn(),
  modify: vi.fn(),
  delete: vi.fn(),
  createFolder: vi.fn(),
}

// Mock App
export const mockApp = {
  vault: mockVault,
  commands: {
    executeCommandById: vi.fn(),
    addCommand: vi.fn(),
  },
}

// Mock Plugin
export const mockPlugin = {
  app: mockApp,
  addCommand: vi.fn(),
  addRibbonIcon: vi.fn(),
}

// Export for global use
export const ObsidianMocks = {
  Notice: mockNotice,
  TFile: MockTFile,
  TFolder: MockTFolder,
  Vault: mockVault,
  App: mockApp,
  Plugin: mockPlugin,
}