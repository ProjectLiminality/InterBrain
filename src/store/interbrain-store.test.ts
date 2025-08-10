import { describe, it, expect, beforeEach } from 'vitest'
import { useInterBrainStore } from './interbrain-store'
import { createMockDreamNode, createMockDreamerNode } from '../../tests/utils/test-utils'

describe('InterBrainStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    const store = useInterBrainStore.getState()
    store.setSelectedNode(null)
    store.setSearchResults([])
    store.setSpatialLayout('constellation')
    store.setCreatorMode(false)
  })

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useInterBrainStore.getState()
      
      expect(state.selectedNode).toBeNull()
      expect(state.searchResults).toEqual([])
      expect(state.spatialLayout).toBe('constellation')
    })
  })

  describe('selectedNode', () => {
    it('should set selected node', () => {
      const mockNode = createMockDreamNode()
      
      useInterBrainStore.getState().setSelectedNode(mockNode)
      
      expect(useInterBrainStore.getState().selectedNode).toBe(mockNode)
    })

    it('should clear selected node when set to null', () => {
      const mockNode = createMockDreamNode()
      
      // First set a node
      useInterBrainStore.getState().setSelectedNode(mockNode)
      expect(useInterBrainStore.getState().selectedNode).toBe(mockNode)
      
      // Then clear it
      useInterBrainStore.getState().setSelectedNode(null)
      expect(useInterBrainStore.getState().selectedNode).toBeNull()
    })

    it('should handle different node types', () => {
      const dreamNode = createMockDreamNode()
      const dreamerNode = createMockDreamerNode()
      
      // Test dream node
      useInterBrainStore.getState().setSelectedNode(dreamNode)
      expect(useInterBrainStore.getState().selectedNode?.type).toBe('dream')
      
      // Test dreamer node
      useInterBrainStore.getState().setSelectedNode(dreamerNode)
      expect(useInterBrainStore.getState().selectedNode?.type).toBe('dreamer')
    })
  })

  describe('searchResults', () => {
    it('should set search results', () => {
      const mockResults = [
        createMockDreamNode({ id: '1', name: 'Result 1' }),
        createMockDreamNode({ id: '2', name: 'Result 2' }),
      ]
      
      useInterBrainStore.getState().setSearchResults(mockResults)
      
      expect(useInterBrainStore.getState().searchResults).toEqual(mockResults)
      expect(useInterBrainStore.getState().searchResults).toHaveLength(2)
    })

    it('should clear search results', () => {
      const mockResults = [createMockDreamNode()]
      
      // First set results
      useInterBrainStore.getState().setSearchResults(mockResults)
      expect(useInterBrainStore.getState().searchResults).toHaveLength(1)
      
      // Then clear them
      useInterBrainStore.getState().setSearchResults([])
      expect(useInterBrainStore.getState().searchResults).toEqual([])
    })

    it('should handle mixed node types in search results', () => {
      const mockResults = [
        createMockDreamNode({ id: '1', type: 'dream' }),
        createMockDreamerNode({ id: '2', type: 'dreamer' }),
      ]
      
      useInterBrainStore.getState().setSearchResults(mockResults)
      
      const results = useInterBrainStore.getState().searchResults
      expect(results[0].type).toBe('dream')
      expect(results[1].type).toBe('dreamer')
    })
  })

  describe('spatialLayout', () => {
    it('should set spatial layout to constellation', () => {
      useInterBrainStore.getState().setSpatialLayout('constellation')
      
      expect(useInterBrainStore.getState().spatialLayout).toBe('constellation')
    })

    it('should set spatial layout to search', () => {
      useInterBrainStore.getState().setSpatialLayout('search')
      
      expect(useInterBrainStore.getState().spatialLayout).toBe('search')
    })

    it('should set spatial layout to liminal-web', () => {
      useInterBrainStore.getState().setSpatialLayout('liminal-web')
      
      expect(useInterBrainStore.getState().spatialLayout).toBe('liminal-web')
    })

    it('should transition between different layouts', () => {
      // Start with constellation
      expect(useInterBrainStore.getState().spatialLayout).toBe('constellation')
      
      // Change to search
      useInterBrainStore.getState().setSpatialLayout('search')
      expect(useInterBrainStore.getState().spatialLayout).toBe('search')
      
      // Change to liminal-web
      useInterBrainStore.getState().setSpatialLayout('liminal-web')
      expect(useInterBrainStore.getState().spatialLayout).toBe('liminal-web')
      
      // Back to constellation
      useInterBrainStore.getState().setSpatialLayout('constellation')
      expect(useInterBrainStore.getState().spatialLayout).toBe('constellation')
    })
  })

  describe('creatorMode', () => {
    it('should set creator mode active state', () => {
      const nodeId = 'test-node-123'
      
      // Activate creator mode
      useInterBrainStore.getState().setCreatorMode(true, nodeId)
      const state = useInterBrainStore.getState()
      expect(state.creatorMode.isActive).toBe(true)
      expect(state.creatorMode.nodeId).toBe(nodeId)
    })
    
    it('should deactivate creator mode', () => {
      const nodeId = 'test-node-123'
      
      // First activate
      useInterBrainStore.getState().setCreatorMode(true, nodeId)
      
      // Then deactivate
      useInterBrainStore.getState().setCreatorMode(false)
      const state = useInterBrainStore.getState()
      expect(state.creatorMode.isActive).toBe(false)
      expect(state.creatorMode.nodeId).toBeNull()
    })
    
    it('should handle switching between nodes in creator mode', () => {
      const nodeId1 = 'test-node-1'
      const nodeId2 = 'test-node-2'
      
      // Activate for first node
      useInterBrainStore.getState().setCreatorMode(true, nodeId1)
      expect(useInterBrainStore.getState().creatorMode.nodeId).toBe(nodeId1)
      
      // Switch to second node
      useInterBrainStore.getState().setCreatorMode(true, nodeId2)
      expect(useInterBrainStore.getState().creatorMode.nodeId).toBe(nodeId2)
    })
  })

  describe('store integration', () => {
    it('should handle multiple state updates', () => {
      const store = useInterBrainStore.getState()
      const mockNode = createMockDreamNode()
      const mockResults = [createMockDreamNode({ id: 'search-1' })]
      
      // Update multiple pieces of state
      store.setSelectedNode(mockNode)
      store.setSearchResults(mockResults)
      store.setSpatialLayout('search')
      
      // Verify all state is updated correctly
      const finalState = useInterBrainStore.getState()
      expect(finalState.selectedNode).toBe(mockNode)
      expect(finalState.searchResults).toEqual(mockResults)
      expect(finalState.spatialLayout).toBe('search')
    })

    it('should maintain independent state pieces', () => {
      const mockNode = createMockDreamNode()
      
      // Set only selected node
      useInterBrainStore.getState().setSelectedNode(mockNode)
      
      // Other state should remain unchanged
      const finalState = useInterBrainStore.getState()
      expect(finalState.selectedNode).toBe(mockNode)
      expect(finalState.searchResults).toEqual([])
      expect(finalState.spatialLayout).toBe('constellation')
    })
  })

  describe('store subscription', () => {
    it('should notify subscribers of state changes', () => {
      const store = useInterBrainStore
      let stateUpdates = 0
      
      const unsubscribe = store.subscribe(() => {
        stateUpdates++
      })
      
      // Make some state changes
      store.getState().setSelectedNode(createMockDreamNode())
      store.getState().setSpatialLayout('search')
      
      expect(stateUpdates).toBe(2)
      
      unsubscribe()
    })
  })
})