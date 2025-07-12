import { vi } from 'vitest'
import type { DreamNode } from '../../src/services/dreamnode-service'

// Test data factories
export const createMockDreamNode = (overrides: Partial<DreamNode> = {}): DreamNode => ({
  id: 'test-123',
  name: 'Test DreamNode',
  type: 'dream',
  path: '/test/path',
  hasUnsavedChanges: false,
  ...overrides,
})

export const createMockDreamerNode = (overrides: Partial<DreamNode> = {}): DreamNode => ({
  id: 'dreamer-456',
  name: 'Test Dreamer',
  type: 'dreamer',
  path: '/dreamers/test-dreamer',
  hasUnsavedChanges: false,
  ...overrides,
})

// Mock service factories
export const createMockUIService = () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showPlaceholder: vi.fn(),
  showLoading: vi.fn(() => ({ hide: vi.fn() })),
})

export const createMockGitService = () => ({
  commitWithAI: vi.fn(),
  createDreamNode: vi.fn(),
  weaveDreams: vi.fn(),
})

export const createMockVaultService = () => ({
  createFolder: vi.fn(),
  fileExists: vi.fn(),
  folderExists: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
})

// Store test utilities
export const resetStore = async () => {
  const { useInterBrainStore } = await import('../../src/store/interbrain-store')
  useInterBrainStore.getState().setSelectedNode(null)
  useInterBrainStore.getState().setSearchResults([])
  useInterBrainStore.getState().setSpatialLayout('constellation')
}

// Async test helpers
export const waitFor = (condition: () => boolean, timeout = 1000): Promise<void> => {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    
    const check = () => {
      if (condition()) {
        resolve()
      } else if (Date.now() - start > timeout) {
        reject(new Error('Timeout waiting for condition'))
      } else {
        setTimeout(check, 10)
      }
    }
    
    check()
  })
}