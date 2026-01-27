import { describe, it, expect } from 'vitest'
import { computeConstellationFilter, isNodeMounted, getNodeCategory } from './constellation-filter-service'
import type { DreamSongRelationshipGraph, DreamSongNode, DreamSongEdge } from '../../dreamweaving/types/relationship'
import type { ConstellationFilterResult } from '../../../core/store/interbrain-store'

// Helper to build a minimal relationship graph
function createGraph(
  nodesData: Array<{ id: string; path: string }>,
  edgesData: Array<{ source: string; target: string; dreamSongPath: string }>
): DreamSongRelationshipGraph {
  const nodes = new Map<string, DreamSongNode>()
  for (const n of nodesData) {
    nodes.set(n.id, {
      id: n.id,
      dreamNodePath: n.path,
      title: n.path,
      incomingReferences: 0,
      outgoingDreamSongs: 0,
    } as DreamSongNode)
  }
  // Count references for connected nodes
  for (const e of edgesData) {
    const src = nodes.get(e.source)
    const tgt = nodes.get(e.target)
    if (src) (src as any).outgoingDreamSongs++
    if (tgt) (tgt as any).incomingReferences++
  }
  const edges: DreamSongEdge[] = edgesData.map(e => ({
    source: e.source,
    target: e.target,
    dreamSongId: `ds-${e.source}`,
    dreamSongPath: e.dreamSongPath,
    sourcePosition: 0,
    targetPosition: 1,
  } as DreamSongEdge))

  return {
    nodes,
    edges,
    metadata: {
      totalNodes: nodesData.length,
      totalDreamSongs: edgesData.length,
      totalEdges: edgesData.length,
      standaloneNodes: 0,
      lastScanned: Date.now(),
    },
  }
}

describe('computeConstellationFilter', () => {
  describe('with no relationship graph', () => {
    it('should sample up to maxNodes from all node IDs', () => {
      const allIds = ['a', 'b', 'c', 'd', 'e']
      const result = computeConstellationFilter(null, allIds, 3)

      expect(result.mountedNodes.size).toBe(3)
      expect(result.ephemeralNodes.size).toBe(2)
      expect(result.vipNodes.size).toBe(0)
      expect(result.parentNodes.size).toBe(0)
      // Every node is either mounted or ephemeral
      for (const id of allIds) {
        expect(result.mountedNodes.has(id) || result.ephemeralNodes.has(id)).toBe(true)
      }
    })

    it('should mount all nodes when fewer than maxNodes', () => {
      const allIds = ['a', 'b']
      const result = computeConstellationFilter(null, allIds, 10)

      expect(result.mountedNodes.size).toBe(2)
      expect(result.ephemeralNodes.size).toBe(0)
    })
  })

  describe('with empty edges', () => {
    it('should treat graph with no edges like null graph', () => {
      const graph = createGraph(
        [{ id: 'a', path: 'A' }, { id: 'b', path: 'B' }],
        []
      )
      const allIds = ['a', 'b']
      const result = computeConstellationFilter(graph, allIds, 10)

      expect(result.mountedNodes.size).toBe(2)
      expect(result.vipNodes.size).toBe(0)
    })
  })

  describe('VIP node extraction', () => {
    it('should mark edge source and target as VIP', () => {
      const graph = createGraph(
        [
          { id: 'a', path: 'NodeA' },
          { id: 'b', path: 'NodeB' },
          { id: 'c', path: 'NodeC' },
        ],
        [{ source: 'a', target: 'b', dreamSongPath: 'NodeA/DreamSong.canvas' }]
      )
      const result = computeConstellationFilter(graph, ['a', 'b', 'c'], 10)

      expect(result.vipNodes.has('a')).toBe(true)
      expect(result.vipNodes.has('b')).toBe(true)
      expect(result.vipNodes.has('c')).toBe(false)
    })
  })

  describe('parent node extraction', () => {
    it('should identify DreamSong owners as parent nodes', () => {
      const graph = createGraph(
        [
          { id: 'a', path: 'NodeA' },
          { id: 'b', path: 'NodeB' },
          { id: 'parent', path: 'ParentNode' },
        ],
        [{ source: 'a', target: 'b', dreamSongPath: 'ParentNode/DreamSong.canvas' }]
      )
      const result = computeConstellationFilter(graph, ['a', 'b', 'parent'], 10)

      expect(result.parentNodes.has('parent')).toBe(true)
    })
  })

  describe('maxNodes enforcement', () => {
    it('should not mount more than maxNodes', () => {
      const ids = Array.from({ length: 20 }, (_, i) => `node-${i}`)
      const nodes = ids.map(id => ({ id, path: id }))
      // Create edges so first 4 nodes are VIP
      const edges = [
        { source: 'node-0', target: 'node-1', dreamSongPath: 'node-0/DreamSong.canvas' },
        { source: 'node-2', target: 'node-3', dreamSongPath: 'node-2/DreamSong.canvas' },
      ]
      const graph = createGraph(nodes, edges)

      const result = computeConstellationFilter(graph, ids, 6)

      // VIP nodes (4) are always mounted, plus up to 2 sampled
      expect(result.mountedNodes.size).toBeLessThanOrEqual(6)
      // All VIP nodes must be mounted regardless
      expect(result.mountedNodes.has('node-0')).toBe(true)
      expect(result.mountedNodes.has('node-1')).toBe(true)
      expect(result.mountedNodes.has('node-2')).toBe(true)
      expect(result.mountedNodes.has('node-3')).toBe(true)
    })

    it('should mark excess nodes as ephemeral', () => {
      const ids = Array.from({ length: 50 }, (_, i) => `n-${i}`)
      const result = computeConstellationFilter(null, ids, 10)

      expect(result.ephemeralNodes.size).toBe(40)
      // No overlap between mounted and ephemeral
      for (const id of result.mountedNodes) {
        expect(result.ephemeralNodes.has(id)).toBe(false)
      }
    })
  })

  describe('every node is accounted for', () => {
    it('should categorize every node as either mounted or ephemeral', () => {
      const ids = Array.from({ length: 30 }, (_, i) => `n-${i}`)
      const nodes = ids.map(id => ({ id, path: id }))
      const edges = [
        { source: 'n-0', target: 'n-1', dreamSongPath: 'n-0/DreamSong.canvas' },
      ]
      const graph = createGraph(nodes, edges)
      const result = computeConstellationFilter(graph, ids, 10)

      for (const id of ids) {
        const isMounted = result.mountedNodes.has(id)
        const isEphemeral = result.ephemeralNodes.has(id)
        expect(isMounted || isEphemeral).toBe(true)
        // Must not be both
        expect(isMounted && isEphemeral).toBe(false)
      }
    })
  })
})

describe('isNodeMounted', () => {
  it('should return true for constellation-mounted nodes', () => {
    const filter: ConstellationFilterResult = {
      vipNodes: new Set(),
      parentNodes: new Set(),
      sampledNodes: new Set(),
      ephemeralNodes: new Set(),
      mountedNodes: new Set(['node-1']),
    }
    expect(isNodeMounted('node-1', filter, new Map())).toBe(true)
  })

  it('should return true for ephemeral nodes', () => {
    const filter: ConstellationFilterResult = {
      vipNodes: new Set(),
      parentNodes: new Set(),
      sampledNodes: new Set(),
      ephemeralNodes: new Set(),
      mountedNodes: new Set(),
    }
    const ephemeralNodes = new Map<string, unknown>([['node-1', {}]])
    expect(isNodeMounted('node-1', filter, ephemeralNodes)).toBe(true)
  })

  it('should return false for unmounted, non-ephemeral nodes', () => {
    const filter: ConstellationFilterResult = {
      vipNodes: new Set(),
      parentNodes: new Set(),
      sampledNodes: new Set(),
      ephemeralNodes: new Set(['node-1']),
      mountedNodes: new Set(),
    }
    expect(isNodeMounted('node-1', filter, new Map())).toBe(false)
  })
})

describe('getNodeCategory', () => {
  const filter: ConstellationFilterResult = {
    vipNodes: new Set(['v1']),
    parentNodes: new Set(['p1']),
    sampledNodes: new Set(['s1']),
    ephemeralNodes: new Set(['e1']),
    mountedNodes: new Set(['v1', 'p1', 's1']),
  }

  it('should return vip for VIP nodes', () => {
    expect(getNodeCategory('v1', filter)).toBe('vip')
  })

  it('should return parent for parent nodes', () => {
    expect(getNodeCategory('p1', filter)).toBe('parent')
  })

  it('should return sampled for sampled nodes', () => {
    expect(getNodeCategory('s1', filter)).toBe('sampled')
  })

  it('should return ephemeral for unknown nodes', () => {
    expect(getNodeCategory('e1', filter)).toBe('ephemeral')
    expect(getNodeCategory('unknown', filter)).toBe('ephemeral')
  })
})
