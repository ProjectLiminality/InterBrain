/**
 * DreamNode Test Utilities
 *
 * Mock factories for DreamNode testing
 */

import type { DreamNode } from './types/dreamnode';

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
});

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
});
