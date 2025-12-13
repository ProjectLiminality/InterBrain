import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { computeClusterLayout } from './ForceDirected';
import { DreamSongNode, DreamSongEdge } from '../types';
import { ConstellationCluster, DEFAULT_CONSTELLATION_CONFIG } from '../LayoutConfig';

/**
 * Helper to create test nodes
 */
function createTestNodes(ids: string[]): Map<string, DreamSongNode> {
  const nodes = new Map<string, DreamSongNode>();
  for (const id of ids) {
    nodes.set(id, {
      id,
      name: `Node ${id}`,
      type: 'dream'
    });
  }
  return nodes;
}

/**
 * Helper to create test edges
 */
function createTestEdges(
  connections: Array<{ source: string; target: string }>
): DreamSongEdge[] {
  return connections.map((conn, index) => ({
    source: conn.source,
    target: conn.target,
    dreamSongId: `dreamsong-${index}`,
    dreamSongPath: `path/to/dreamsong-${index}.canvas`,
    sequenceIndex: index
  }));
}

/**
 * Helper to create test cluster
 */
function createTestCluster(nodeIds: string[]): ConstellationCluster {
  return {
    id: 0,
    nodeIds,
    center: new Vector3(0, 0, 1),
    radius: 0.5,
    color: '#ff6b6b',
    size: nodeIds.length
  };
}

describe('ForceDirected', () => {
  describe('computeClusterLayout', () => {
    it('should handle empty cluster', () => {
      const cluster = createTestCluster([]);
      const nodes = createTestNodes([]);
      const edges: DreamSongEdge[] = [];

      const result = computeClusterLayout(cluster, nodes, edges, DEFAULT_CONSTELLATION_CONFIG);

      expect(result.positions.size).toBe(0);
      expect(result.converged).toBe(true);
      expect(result.finalEnergy).toBe(0);
    });

    it('should handle single node cluster', () => {
      const cluster = createTestCluster(['a']);
      const nodes = createTestNodes(['a']);
      const edges: DreamSongEdge[] = [];

      const result = computeClusterLayout(cluster, nodes, edges, DEFAULT_CONSTELLATION_CONFIG);

      expect(result.positions.size).toBe(1);
      expect(result.positions.has('a')).toBe(true);

      const pos = result.positions.get('a')!;
      expect(pos.x).toBe(0);
      expect(pos.y).toBe(0);
      expect(result.converged).toBe(true);
    });

    it('should position all nodes in cluster', () => {
      const nodeIds = ['a', 'b', 'c', 'd'];
      const cluster = createTestCluster(nodeIds);
      const nodes = createTestNodes(nodeIds);
      const edges = createTestEdges([
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
        { source: 'c', target: 'd' }
      ]);

      const result = computeClusterLayout(cluster, nodes, edges, DEFAULT_CONSTELLATION_CONFIG);

      expect(result.positions.size).toBe(4);
      nodeIds.forEach(id => {
        expect(result.positions.has(id)).toBe(true);
      });
    });

    it('should constrain positions within cluster radius', () => {
      const nodeIds = ['a', 'b', 'c', 'd', 'e'];
      const cluster = createTestCluster(nodeIds);
      cluster.radius = 1.0;
      const nodes = createTestNodes(nodeIds);
      const edges = createTestEdges([
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
        { source: 'c', target: 'd' },
        { source: 'd', target: 'e' }
      ]);

      const result = computeClusterLayout(cluster, nodes, edges, DEFAULT_CONSTELLATION_CONFIG);

      for (const [, pos] of result.positions) {
        const distance = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
        expect(distance).toBeLessThanOrEqual(cluster.radius + 0.001); // Small tolerance
      }
    });

    it('should bring connected nodes closer together', () => {
      const nodeIds = ['a', 'b'];
      const cluster = createTestCluster(nodeIds);
      cluster.radius = 2.0;
      const nodes = createTestNodes(nodeIds);

      // With edge: nodes should be attracted
      const edgesConnected = createTestEdges([{ source: 'a', target: 'b' }]);
      const resultConnected = computeClusterLayout(
        cluster,
        nodes,
        edgesConnected,
        DEFAULT_CONSTELLATION_CONFIG
      );

      // Without edge: nodes should only repel
      const edgesDisconnected: DreamSongEdge[] = [];
      const resultDisconnected = computeClusterLayout(
        cluster,
        nodes,
        edgesDisconnected,
        DEFAULT_CONSTELLATION_CONFIG
      );

      // Calculate distances
      const posA_conn = resultConnected.positions.get('a')!;
      const posB_conn = resultConnected.positions.get('b')!;
      const distConnected = Math.sqrt(
        (posA_conn.x - posB_conn.x) ** 2 + (posA_conn.y - posB_conn.y) ** 2
      );

      const posA_disc = resultDisconnected.positions.get('a')!;
      const posB_disc = resultDisconnected.positions.get('b')!;
      const distDisconnected = Math.sqrt(
        (posA_disc.x - posB_disc.x) ** 2 + (posA_disc.y - posB_disc.y) ** 2
      );

      // Connected nodes should be closer than disconnected ones
      expect(distConnected).toBeLessThan(distDisconnected);
    });

    it('should generate unique positions for each node', () => {
      const nodeIds = ['a', 'b', 'c', 'd', 'e', 'f'];
      const cluster = createTestCluster(nodeIds);
      cluster.radius = 2.0;
      const nodes = createTestNodes(nodeIds);
      const edges = createTestEdges([
        { source: 'a', target: 'b' },
        { source: 'c', target: 'd' },
        { source: 'e', target: 'f' }
      ]);

      const result = computeClusterLayout(cluster, nodes, edges, DEFAULT_CONSTELLATION_CONFIG);

      // Check that all positions are unique
      const positionStrings = Array.from(result.positions.values()).map(
        pos => `${pos.x.toFixed(6)},${pos.y.toFixed(6)}`
      );
      const uniquePositions = new Set(positionStrings);

      expect(uniquePositions.size).toBe(nodeIds.length);
    });

    it('should report iteration count', () => {
      const nodeIds = ['a', 'b', 'c'];
      const cluster = createTestCluster(nodeIds);
      const nodes = createTestNodes(nodeIds);
      const edges = createTestEdges([
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' }
      ]);

      const result = computeClusterLayout(cluster, nodes, edges, DEFAULT_CONSTELLATION_CONFIG);

      expect(result.iterations).toBeGreaterThanOrEqual(0);
      expect(result.iterations).toBeLessThanOrEqual(DEFAULT_CONSTELLATION_CONFIG.forceIterations);
    });

    it('should calculate final energy', () => {
      const nodeIds = ['a', 'b', 'c'];
      const cluster = createTestCluster(nodeIds);
      const nodes = createTestNodes(nodeIds);
      const edges = createTestEdges([
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' }
      ]);

      const result = computeClusterLayout(cluster, nodes, edges, DEFAULT_CONSTELLATION_CONFIG);

      expect(typeof result.finalEnergy).toBe('number');
      expect(result.finalEnergy).toBeGreaterThanOrEqual(0);
    });

    it('should handle fully connected graph (clique)', () => {
      const nodeIds = ['a', 'b', 'c', 'd'];
      const cluster = createTestCluster(nodeIds);
      const nodes = createTestNodes(nodeIds);

      // Create all possible edges
      const edges = createTestEdges([
        { source: 'a', target: 'b' },
        { source: 'a', target: 'c' },
        { source: 'a', target: 'd' },
        { source: 'b', target: 'c' },
        { source: 'b', target: 'd' },
        { source: 'c', target: 'd' }
      ]);

      const result = computeClusterLayout(cluster, nodes, edges, DEFAULT_CONSTELLATION_CONFIG);

      expect(result.positions.size).toBe(4);
      // In a clique, all nodes should be relatively close together
    });
  });
});
