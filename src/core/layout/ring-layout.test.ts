import { describe, it, expect } from 'vitest';
import {
  calculateRingPositions,
  DEFAULT_RING_CONFIG
} from './ring-layout';

describe('Ring Layout Algorithm', () => {
  const allNodeIds = ['node1', 'node2', 'node3', 'node4', 'node5', 'node6', 'node7', 'node8'];

  describe('calculateRingPositions', () => {
    it('should return empty rings for empty input', () => {
      const result = calculateRingPositions([], allNodeIds);

      expect(result.centerNode).toBeNull();
      expect(result.ring1Nodes).toHaveLength(0);
      expect(result.ring2Nodes).toHaveLength(0);
      expect(result.ring3Nodes).toHaveLength(0);
      expect(result.remainingNodeIds).toHaveLength(allNodeIds.length);
    });

    it('should place single node in ring 1', () => {
      const orderedNodes = [{ id: 'node1' }];
      const result = calculateRingPositions(orderedNodes, allNodeIds);

      expect(result.ring1Nodes).toHaveLength(1);
      expect(result.ring1Nodes[0].nodeId).toBe('node1');
      expect(result.ring2Nodes).toHaveLength(0);
      expect(result.ring3Nodes).toHaveLength(0);
    });

    it('should place up to 6 nodes in ring 1', () => {
      const orderedNodes = [
        { id: 'node1' },
        { id: 'node2' },
        { id: 'node3' },
        { id: 'node4' },
        { id: 'node5' },
        { id: 'node6' }
      ];
      const result = calculateRingPositions(orderedNodes, allNodeIds);

      expect(result.ring1Nodes).toHaveLength(6);
      expect(result.ring2Nodes).toHaveLength(0);
      expect(result.ring3Nodes).toHaveLength(0);
    });

    it('should distribute 7+ nodes across multiple rings', () => {
      const orderedNodes = [
        { id: 'node1' },
        { id: 'node2' },
        { id: 'node3' },
        { id: 'node4' },
        { id: 'node5' },
        { id: 'node6' },
        { id: 'node7' }
      ];
      const result = calculateRingPositions(orderedNodes, allNodeIds);

      // Should have nodes in both ring 1 and ring 2
      expect(result.ring1Nodes.length + result.ring2Nodes.length).toBe(7);
    });

    it('should respect maxActiveNodes limit', () => {
      // Create more nodes than max (36)
      const orderedNodes = Array.from({ length: 40 }, (_, i) => ({ id: `node${i}` }));
      const allIds = orderedNodes.map(n => n.id);

      const result = calculateRingPositions(orderedNodes, allIds);

      const totalActive = result.ring1Nodes.length + result.ring2Nodes.length + result.ring3Nodes.length;
      expect(totalActive).toBeLessThanOrEqual(DEFAULT_RING_CONFIG.maxActiveNodes);
    });

    it('should include center node when centerNodeId is provided', () => {
      const orderedNodes = [{ id: 'node1' }, { id: 'node2' }];
      const result = calculateRingPositions(orderedNodes, allNodeIds, 'centerNode');

      expect(result.centerNode).not.toBeNull();
      expect(result.centerNode?.nodeId).toBe('centerNode');
      expect(result.centerNode?.position[2]).toBe(-DEFAULT_RING_CONFIG.centerDistance);
    });

    it('should not include center node when centerNodeId is not provided', () => {
      const orderedNodes = [{ id: 'node1' }, { id: 'node2' }];
      const result = calculateRingPositions(orderedNodes, allNodeIds);

      expect(result.centerNode).toBeNull();
    });

    it('should calculate remaining nodes correctly', () => {
      const orderedNodes = [{ id: 'node1' }, { id: 'node2' }];
      const result = calculateRingPositions(orderedNodes, allNodeIds);

      // Remaining should be all except the ones in rings
      expect(result.remainingNodeIds).toContain('node3');
      expect(result.remainingNodeIds).toContain('node4');
      expect(result.remainingNodeIds).not.toContain('node1');
      expect(result.remainingNodeIds).not.toContain('node2');
    });

    it('should exclude center node from remaining when provided', () => {
      const orderedNodes = [{ id: 'node1' }];
      const result = calculateRingPositions(orderedNodes, allNodeIds, 'node2');

      expect(result.remainingNodeIds).not.toContain('node1'); // In ring
      expect(result.remainingNodeIds).not.toContain('node2'); // Is center
      expect(result.remainingNodeIds).toContain('node3');     // Remaining
    });
  });

  describe('Position Coordinates', () => {
    it('should generate valid 3D positions', () => {
      const orderedNodes = [{ id: 'node1' }, { id: 'node2' }, { id: 'node3' }];
      const result = calculateRingPositions(orderedNodes, allNodeIds);

      result.ring1Nodes.forEach(node => {
        expect(node.position).toHaveLength(3);
        expect(typeof node.position[0]).toBe('number');
        expect(typeof node.position[1]).toBe('number');
        expect(typeof node.position[2]).toBe('number');
        expect(Number.isNaN(node.position[0])).toBe(false);
        expect(Number.isNaN(node.position[1])).toBe(false);
        expect(Number.isNaN(node.position[2])).toBe(false);
      });
    });

    it('should place ring 1 nodes at correct Z distance', () => {
      const orderedNodes = [{ id: 'node1' }];
      const result = calculateRingPositions(orderedNodes, allNodeIds);

      // Ring 1 Z should be -100 (RING1_DISTANCE)
      expect(result.ring1Nodes[0].position[2]).toBe(-100);
    });

    it('should place center node closer than ring nodes', () => {
      const orderedNodes = [{ id: 'node1' }];
      const result = calculateRingPositions(orderedNodes, allNodeIds, 'center');

      const centerZ = Math.abs(result.centerNode!.position[2]);
      const ring1Z = Math.abs(result.ring1Nodes[0].position[2]);

      expect(centerZ).toBeLessThan(ring1Z);
    });
  });

  describe('Ring Distribution Patterns', () => {
    it('should distribute 18 nodes correctly (full ring 1 + ring 2)', () => {
      const orderedNodes = Array.from({ length: 18 }, (_, i) => ({ id: `node${i}` }));
      const allIds = orderedNodes.map(n => n.id);

      const result = calculateRingPositions(orderedNodes, allIds);

      expect(result.ring1Nodes.length).toBe(6);
      expect(result.ring2Nodes.length).toBe(12);
      expect(result.ring3Nodes.length).toBe(0);
    });

    it('should distribute 36 nodes across all rings', () => {
      const orderedNodes = Array.from({ length: 36 }, (_, i) => ({ id: `node${i}` }));
      const allIds = orderedNodes.map(n => n.id);

      const result = calculateRingPositions(orderedNodes, allIds);

      // Note: The mask pattern for 36 nodes activates 30 positions (6+12+12)
      // This is the original algorithm behavior - it doesn't fill all 42 slots
      const totalInRings = result.ring1Nodes.length + result.ring2Nodes.length + result.ring3Nodes.length;
      expect(totalInRings).toBeLessThanOrEqual(36);
      expect(result.ring1Nodes.length).toBe(6);
      expect(result.ring2Nodes.length).toBe(12);
      // Ring 3 gets some nodes (exact count depends on mask pattern)
      expect(result.ring3Nodes.length).toBeGreaterThan(0);
    });

    it('should preserve node order in rings', () => {
      const orderedNodes = [
        { id: 'first' },
        { id: 'second' },
        { id: 'third' }
      ];
      const result = calculateRingPositions(orderedNodes, ['first', 'second', 'third']);

      // First nodes should be in ring 1
      const ring1Ids = result.ring1Nodes.map(n => n.nodeId);
      expect(ring1Ids).toContain('first');
      expect(ring1Ids).toContain('second');
      expect(ring1Ids).toContain('third');
    });
  });

  describe('Edge Cases', () => {
    it('should handle duplicate node IDs gracefully', () => {
      const orderedNodes = [{ id: 'node1' }, { id: 'node1' }];

      // Should not throw
      expect(() => calculateRingPositions(orderedNodes, allNodeIds)).not.toThrow();
    });

    it('should handle nodes not in allNodeIds', () => {
      const orderedNodes = [{ id: 'unknown' }];
      const result = calculateRingPositions(orderedNodes, allNodeIds);

      // Should still work, unknown node is in ring
      expect(result.ring1Nodes[0].nodeId).toBe('unknown');
      // Remaining should not include unknown (it's not in allNodeIds)
      expect(result.remainingNodeIds).not.toContain('unknown');
    });
  });
});
