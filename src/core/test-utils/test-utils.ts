import { vi } from 'vitest'
import type { DreamNode } from '../types/dreamnode'

// Test data factories
export const createMockDreamNode = (overrides: Partial<DreamNode> = {}): DreamNode => ({
  id: 'test-123',
  name: 'Test DreamNode',
  type: 'dream',
  position: [0, 0, 0],
  repoPath: '/test/path',
  dreamTalkMedia: [],
  dreamSongContent: [],
  liminalWebConnections: [],
  hasUnsavedChanges: false,
  ...overrides,
})

export const createMockDreamerNode = (overrides: Partial<DreamNode> = {}): DreamNode => ({
  id: 'dreamer-456',
  name: 'Test Dreamer',
  type: 'dreamer',
  position: [0, 0, 0],
  repoPath: '/dreamers/test-dreamer',
  dreamTalkMedia: [],
  dreamSongContent: [],
  liminalWebConnections: [],
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
  const { useInterBrainStore } = await import('../store/interbrain-store')
  const state = useInterBrainStore.getState()
  state.setSelectedNode(null)
  state.setSearchResults([])
  state.setSpatialLayout('constellation')
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