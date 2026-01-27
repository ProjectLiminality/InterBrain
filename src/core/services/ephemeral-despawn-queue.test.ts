import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { queueEphemeralDespawn, cancelEphemeralDespawn, flushDespawnQueue } from './ephemeral-despawn-queue'

// Mock the store
const mockDespawnEphemeralNode = vi.fn()
const mockEphemeralNodes = new Map<string, unknown>()

vi.mock('../store/interbrain-store', () => ({
  useInterBrainStore: {
    getState: () => ({
      ephemeralNodes: mockEphemeralNodes,
      despawnEphemeralNode: mockDespawnEphemeralNode,
    }),
  },
}))

describe('EphemeralDespawnQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockDespawnEphemeralNode.mockClear()
    mockEphemeralNodes.clear()
    // Flush any leftover state from previous tests
    flushDespawnQueue()
    mockDespawnEphemeralNode.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('queueEphemeralDespawn', () => {
    it('should not despawn immediately', () => {
      mockEphemeralNodes.set('node-1', {})
      queueEphemeralDespawn('node-1')

      expect(mockDespawnEphemeralNode).not.toHaveBeenCalled()
    })

    it('should despawn after initial delay', () => {
      mockEphemeralNodes.set('node-1', {})
      queueEphemeralDespawn('node-1')

      // Advance past the 500ms initial delay
      vi.advanceTimersByTime(500)

      expect(mockDespawnEphemeralNode).toHaveBeenCalledWith('node-1')
      expect(mockDespawnEphemeralNode).toHaveBeenCalledTimes(1)
    })

    it('should drain multiple nodes with 40ms interval between each', () => {
      mockEphemeralNodes.set('node-1', {})
      mockEphemeralNodes.set('node-2', {})
      mockEphemeralNodes.set('node-3', {})

      queueEphemeralDespawn('node-1')
      queueEphemeralDespawn('node-2')
      queueEphemeralDespawn('node-3')

      // After 500ms: first node drained
      vi.advanceTimersByTime(500)
      expect(mockDespawnEphemeralNode).toHaveBeenCalledTimes(1)
      expect(mockDespawnEphemeralNode).toHaveBeenCalledWith('node-1')

      // After 540ms: second node drained
      vi.advanceTimersByTime(40)
      expect(mockDespawnEphemeralNode).toHaveBeenCalledTimes(2)
      expect(mockDespawnEphemeralNode).toHaveBeenCalledWith('node-2')

      // After 580ms: third node drained
      vi.advanceTimersByTime(40)
      expect(mockDespawnEphemeralNode).toHaveBeenCalledTimes(3)
      expect(mockDespawnEphemeralNode).toHaveBeenCalledWith('node-3')
    })

    it('should skip nodes no longer in ephemeralNodes map', () => {
      // node-1 is in the map, node-2 was already cleaned up
      mockEphemeralNodes.set('node-1', {})

      queueEphemeralDespawn('node-1')
      queueEphemeralDespawn('node-2') // not in map

      vi.advanceTimersByTime(500) // drains node-1
      expect(mockDespawnEphemeralNode).toHaveBeenCalledWith('node-1')

      vi.advanceTimersByTime(40) // tries node-2, skips it
      expect(mockDespawnEphemeralNode).toHaveBeenCalledTimes(1) // still only 1 call
    })
  })

  describe('cancelEphemeralDespawn', () => {
    it('should return true and remove node from queue', () => {
      mockEphemeralNodes.set('node-1', {})
      queueEphemeralDespawn('node-1')

      const result = cancelEphemeralDespawn('node-1')
      expect(result).toBe(true)

      // Even after full drain time, node should not be despawned
      vi.advanceTimersByTime(600)
      expect(mockDespawnEphemeralNode).not.toHaveBeenCalledWith('node-1')
    })

    it('should return false for node not in queue', () => {
      const result = cancelEphemeralDespawn('nonexistent')
      expect(result).toBe(false)
    })

    it('should only cancel the specified node, leaving others', () => {
      mockEphemeralNodes.set('node-1', {})
      mockEphemeralNodes.set('node-2', {})

      queueEphemeralDespawn('node-1')
      queueEphemeralDespawn('node-2')

      cancelEphemeralDespawn('node-1')

      // After drain, only node-2 should be despawned
      vi.advanceTimersByTime(500)
      expect(mockDespawnEphemeralNode).toHaveBeenCalledWith('node-2')
      expect(mockDespawnEphemeralNode).not.toHaveBeenCalledWith('node-1')
    })
  })

  describe('flushDespawnQueue', () => {
    it('should despawn all queued nodes immediately', () => {
      mockEphemeralNodes.set('node-1', {})
      mockEphemeralNodes.set('node-2', {})

      queueEphemeralDespawn('node-1')
      queueEphemeralDespawn('node-2')

      // Flush before the initial delay
      flushDespawnQueue()

      expect(mockDespawnEphemeralNode).toHaveBeenCalledWith('node-1')
      expect(mockDespawnEphemeralNode).toHaveBeenCalledWith('node-2')
      expect(mockDespawnEphemeralNode).toHaveBeenCalledTimes(2)
    })

    it('should cancel pending drain timer', () => {
      mockEphemeralNodes.set('node-1', {})
      queueEphemeralDespawn('node-1')

      flushDespawnQueue()
      mockDespawnEphemeralNode.mockClear()

      // Advancing time should not trigger additional despawns
      vi.advanceTimersByTime(1000)
      expect(mockDespawnEphemeralNode).not.toHaveBeenCalled()
    })

    it('should skip nodes no longer in ephemeralNodes during flush', () => {
      mockEphemeralNodes.set('node-1', {})
      // node-2 not in map

      queueEphemeralDespawn('node-1')
      queueEphemeralDespawn('node-2')

      flushDespawnQueue()

      expect(mockDespawnEphemeralNode).toHaveBeenCalledWith('node-1')
      expect(mockDespawnEphemeralNode).toHaveBeenCalledTimes(1)
    })

    it('should handle empty queue gracefully', () => {
      flushDespawnQueue()
      expect(mockDespawnEphemeralNode).not.toHaveBeenCalled()
    })
  })
})
