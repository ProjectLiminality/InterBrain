import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Obsidian API globally
global.window = global.window || {}

// Mock the Notice class
const g = globalThis as Record<string, unknown>
g.Notice = vi.fn().mockImplementation(() => ({
  hide: vi.fn(),
}))

// Mock IndexedDB for tests (Zustand persist middleware needs this)
const mockIndexedDB = {
  open: vi.fn(() => ({
    result: {
      transaction: vi.fn(() => ({
        objectStore: vi.fn(() => ({
          get: vi.fn(() => ({ onsuccess: null, onerror: null, result: null })),
          put: vi.fn(() => ({ onsuccess: null, onerror: null })),
          delete: vi.fn(() => ({ onsuccess: null, onerror: null })),
        })),
      })),
      objectStoreNames: { contains: vi.fn(() => false) },
      createObjectStore: vi.fn(),
    },
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  })),
};
g.indexedDB = mockIndexedDB;

// Setup console to not spam during tests
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}
