import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Obsidian API globally
global.window = global.window || {}

// Mock the Notice class
const g = globalThis as Record<string, unknown>
g.Notice = vi.fn().mockImplementation(() => ({
  hide: vi.fn(),
}))

// Setup console to not spam during tests
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}
