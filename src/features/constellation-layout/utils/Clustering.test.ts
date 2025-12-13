import { describe, it, expect } from 'vitest';
import {
  detectConnectedComponents,
  getClusterColor,
  areNodesInSameCluster
} from './Clustering';
import { DreamSongRelationshipGraph, DreamSongNode, DreamSongEdge } from '../types';

/**
 * Helper to create a test graph
 */
function createTestGraph(
  nodeIds: string[],
  edges: Array<{ source: string; target: string }>
): DreamSongRelationshipGraph {
  const nodes = new Map<string, DreamSongNode>();
  for (const id of nodeIds) {
    nodes.set(id, {
      id,
      name: `Node ${id}`,
      type: 'dream'
    });
  }

  const graphEdges: DreamSongEdge[] = edges.map((edge, index) => ({
    source: edge.source,
    target: edge.target,
    dreamSongId: `dreamsong-${index}`,
    dreamSongPath: `path/to/dreamsong-${index}.canvas`,
    sequenceIndex: index
  }));

  return { nodes, edges: graphEdges };
}

describe('Clustering', () => {
  describe('detectConnectedComponents', () => {
    it('should detect single cluster when all nodes connected', () => {
      const graph = createTestGraph(
        ['a', 'b', 'c'],
        [
          { source: 'a', target: 'b' },
          { source: 'b', target: 'c' }
        ]
      );

      const result = detectConnectedComponents(graph);

      expect(result.clusters).toHaveLength(1);
      expect(result.clusters[0].nodeIds).toContain('a');
      expect(result.clusters[0].nodeIds).toContain('b');
      expect(result.clusters[0].nodeIds).toContain('c');
      expect(result.clusters[0].size).toBe(3);
    });

    it('should detect multiple clusters when nodes are disconnected', () => {
      const graph = createTestGraph(
        ['a', 'b', 'c', 'd'],
        [
          { source: 'a', target: 'b' },
          { source: 'c', target: 'd' }
        ]
      );

      const result = detectConnectedComponents(graph);

      expect(result.clusters).toHaveLength(2);
      expect(result.stats.totalClusters).toBe(2);
    });

    it('should handle singleton nodes (no edges)', () => {
      const graph = createTestGraph(['a', 'b', 'c'], []);

      const result = detectConnectedComponents(graph);

      expect(result.clusters).toHaveLength(3);
      expect(result.stats.singletonClusters).toBe(3);
      result.clusters.forEach(cluster => {
        expect(cluster.size).toBe(1);
      });
    });

    it('should treat edges as undirected', () => {
      const graph = createTestGraph(
        ['a', 'b', 'c'],
        [{ source: 'a', target: 'b' }]
      );

      const result = detectConnectedComponents(graph);

      // a and b should be in same cluster regardless of edge direction
      const clusterA = result.nodeToCluster.get('a');
      const clusterB = result.nodeToCluster.get('b');
      expect(clusterA).toBe(clusterB);
    });

    it('should handle empty graph', () => {
      const graph = createTestGraph([], []);

      const result = detectConnectedComponents(graph);

      expect(result.clusters).toHaveLength(0);
      expect(result.stats.totalClusters).toBe(0);
    });

    it('should correctly populate nodeToCluster map', () => {
      const graph = createTestGraph(
        ['a', 'b', 'c', 'd'],
        [
          { source: 'a', target: 'b' },
          { source: 'c', target: 'd' }
        ]
      );

      const result = detectConnectedComponents(graph);

      // All nodes should be in the map
      expect(result.nodeToCluster.has('a')).toBe(true);
      expect(result.nodeToCluster.has('b')).toBe(true);
      expect(result.nodeToCluster.has('c')).toBe(true);
      expect(result.nodeToCluster.has('d')).toBe(true);

      // a and b should have same cluster id
      expect(result.nodeToCluster.get('a')).toBe(result.nodeToCluster.get('b'));
      // c and d should have same cluster id
      expect(result.nodeToCluster.get('c')).toBe(result.nodeToCluster.get('d'));
      // but different from a/b
      expect(result.nodeToCluster.get('a')).not.toBe(result.nodeToCluster.get('c'));
    });

    it('should assign unique colors to each cluster', () => {
      const graph = createTestGraph(
        ['a', 'b', 'c', 'd'],
        [
          { source: 'a', target: 'b' },
          { source: 'c', target: 'd' }
        ]
      );

      const result = detectConnectedComponents(graph);

      const colors = result.clusters.map(c => c.color);
      expect(colors[0]).not.toBe(colors[1]);
    });

    it('should calculate correct statistics', () => {
      const graph = createTestGraph(
        ['a', 'b', 'c', 'd', 'e'],
        [
          { source: 'a', target: 'b' },
          { source: 'b', target: 'c' } // cluster of 3
          // d and e are singletons
        ]
      );

      const result = detectConnectedComponents(graph);

      expect(result.stats.totalClusters).toBe(3); // 1 cluster of 3, 2 singletons
      expect(result.stats.largestClusterSize).toBe(3);
      expect(result.stats.singletonClusters).toBe(2);
    });

    it('should handle cycles in graph', () => {
      const graph = createTestGraph(
        ['a', 'b', 'c'],
        [
          { source: 'a', target: 'b' },
          { source: 'b', target: 'c' },
          { source: 'c', target: 'a' } // cycle
        ]
      );

      const result = detectConnectedComponents(graph);

      expect(result.clusters).toHaveLength(1);
      expect(result.clusters[0].size).toBe(3);
    });
  });

  describe('getClusterColor', () => {
    it('should return cluster color for clustered node', () => {
      const graph = createTestGraph(
        ['a', 'b'],
        [{ source: 'a', target: 'b' }]
      );

      const result = detectConnectedComponents(graph);
      const color = getClusterColor('a', result);

      expect(color).toBe(result.clusters[0].color);
    });

    it('should return default color for unknown node', () => {
      const graph = createTestGraph(['a'], []);
      const result = detectConnectedComponents(graph);

      const color = getClusterColor('unknown', result);

      expect(color).toBe('#888888');
    });
  });

  describe('areNodesInSameCluster', () => {
    it('should return true for nodes in same cluster', () => {
      const graph = createTestGraph(
        ['a', 'b', 'c'],
        [
          { source: 'a', target: 'b' },
          { source: 'b', target: 'c' }
        ]
      );

      const result = detectConnectedComponents(graph);

      expect(areNodesInSameCluster('a', 'b', result)).toBe(true);
      expect(areNodesInSameCluster('a', 'c', result)).toBe(true);
      expect(areNodesInSameCluster('b', 'c', result)).toBe(true);
    });

    it('should return false for nodes in different clusters', () => {
      const graph = createTestGraph(
        ['a', 'b', 'c', 'd'],
        [
          { source: 'a', target: 'b' },
          { source: 'c', target: 'd' }
        ]
      );

      const result = detectConnectedComponents(graph);

      expect(areNodesInSameCluster('a', 'c', result)).toBe(false);
      expect(areNodesInSameCluster('b', 'd', result)).toBe(false);
    });

    it('should return false for unknown nodes', () => {
      const graph = createTestGraph(['a'], []);
      const result = detectConnectedComponents(graph);

      expect(areNodesInSameCluster('a', 'unknown', result)).toBe(false);
      expect(areNodesInSameCluster('unknown1', 'unknown2', result)).toBe(false);
    });
  });
});
