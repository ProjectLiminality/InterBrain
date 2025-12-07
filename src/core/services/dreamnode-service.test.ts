import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DreamNodeService } from './dreamnode-service'
import { createMockDreamNode } from '../../../tests/utils/test-utils'

// Mock the store
const mockSetSelectedNode = vi.fn()
const mockSetSearchResults = vi.fn()
const mockSetSpatialLayout = vi.fn()

vi.mock('../store/interbrain-store', () => ({
  useInterBrainStore: {
    getState: () => ({
      setSelectedNode: mockSetSelectedNode,
      setSearchResults: mockSetSearchResults,
      setSpatialLayout: mockSetSpatialLayout,
    }),
  },
}))

describe('DreamNodeService', () => {
  let service: DreamNodeService

  beforeEach(() => {
    service = new DreamNodeService()
    vi.clearAllMocks()
  })

  describe('getCurrentNode', () => {
    it('should return null when no node is set', () => {
      expect(service.getCurrentNode()).toBeNull()
    })

    it('should return the current node when set', () => {
      const mockNode = createMockDreamNode()
      service.setCurrentNode(mockNode)
      
      expect(service.getCurrentNode()).toBe(mockNode)
    })
  })

  describe('setCurrentNode', () => {
    it('should set the current node', () => {
      const mockNode = createMockDreamNode()
      service.setCurrentNode(mockNode)
      
      expect(service.getCurrentNode()).toBe(mockNode)
    })

    it('should clear the current node when set to null', () => {
      const mockNode = createMockDreamNode()
      service.setCurrentNode(mockNode)
      service.setCurrentNode(null)
      
      expect(service.getCurrentNode()).toBeNull()
    })

    it('should sync with Zustand store', () => {
      const mockNode = createMockDreamNode()
      service.setCurrentNode(mockNode)
      
      expect(mockSetSelectedNode).toHaveBeenCalledWith(mockNode)
    })
  })

  describe('selection management', () => {
    it('should toggle node selection', () => {
      const nodeId = 'test-node-123'
      
      expect(service.isSelected(nodeId)).toBe(false)
      
      service.toggleNodeSelection(nodeId)
      expect(service.isSelected(nodeId)).toBe(true)
      
      service.toggleNodeSelection(nodeId)
      expect(service.isSelected(nodeId)).toBe(false)
    })

    it('should clear all selections', () => {
      service.toggleNodeSelection('node-1')
      service.toggleNodeSelection('node-2')
      
      expect(service.isSelected('node-1')).toBe(true)
      expect(service.isSelected('node-2')).toBe(true)
      
      service.clearSelection()
      
      expect(service.isSelected('node-1')).toBe(false)
      expect(service.isSelected('node-2')).toBe(false)
    })

    it('should handle multiple selections', () => {
      service.toggleNodeSelection('node-1')
      service.toggleNodeSelection('node-2')
      service.toggleNodeSelection('node-3')
      
      expect(service.isSelected('node-1')).toBe(true)
      expect(service.isSelected('node-2')).toBe(true)
      expect(service.isSelected('node-3')).toBe(true)
    })
  })

  describe('getSelectedNodes', () => {
    it('should return empty array initially', () => {
      const selectedNodes = service.getSelectedNodes()
      expect(selectedNodes).toEqual([])
    })

    it('should log selected node IDs', () => {
      const consoleSpy = vi.spyOn(console, 'log')
      
      service.toggleNodeSelection('node-1')
      service.toggleNodeSelection('node-2')
      service.getSelectedNodes()
      
      expect(consoleSpy).toHaveBeenCalledWith('Selected node IDs:', ['node-1', 'node-2'])
    })
  })
})