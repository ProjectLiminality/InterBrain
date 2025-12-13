/**
 * Relationship Graph Utilities
 * 
 * High-performance in-memory graph database for relationship queries
 * Used by liminal web layout system for fast relationship traversal
 */

import { DreamNode } from '../dreamnode';

/**
 * In-memory relationship graph for high-performance queries
 */
export interface RelationshipGraph {
  /** Map of nodeId to DreamNode for fast lookups */
  nodes: Map<string, DreamNode>;
  
  /** Map of nodeId to array of connected nodeIds */
  edges: Map<string, string[]>;
  
  /** Get all connections for a node */
  getConnections: (nodeId: string) => DreamNode[];
  
  /** Get opposite-type connections only (Dreams ↔ Dreamers) */
  getOppositeTypeConnections: (nodeId: string) => DreamNode[];
  
  /** Get second-degree connections (connections of connections) */
  getSecondDegreeConnections: (nodeId: string) => DreamNode[];
}

/**
 * Build relationship graph from array of DreamNodes
 */
export function buildRelationshipGraph(dreamNodes: DreamNode[]): RelationshipGraph {
  const nodes = new Map<string, DreamNode>();
  const edges = new Map<string, string[]>();
  
  // Build nodes map first
  dreamNodes.forEach(node => {
    nodes.set(node.id, node);
  });
  
  // Build edges, filtering out connections to non-existent nodes
  // This prevents "phantom nodes" in layout calculations
  dreamNodes.forEach(node => {
    // Defensive: Handle nodes missing liminalWebConnections property
    const connections = node.liminalWebConnections || [];
    const validConnections = connections.filter(targetId =>
      nodes.has(targetId) // Only include connections to nodes that actually exist
    );
    edges.set(node.id, validConnections);
  });
  
  // Create graph with query methods
  const graph: RelationshipGraph = {
    nodes,
    edges,
    
    getConnections: (nodeId: string): DreamNode[] => {
      const connections = edges.get(nodeId) || [];
      return connections
        .map(connectedId => nodes.get(connectedId))
        .filter((node): node is DreamNode => node !== undefined);
    },
    
    getOppositeTypeConnections: (nodeId: string): DreamNode[] => {
      const sourceNode = nodes.get(nodeId);
      if (!sourceNode) return [];
      
      const connections = edges.get(nodeId) || [];
      return connections
        .map(connectedId => nodes.get(connectedId))
        .filter((node): node is DreamNode => 
          node !== undefined && node.type !== sourceNode.type
        );
    },
    
    getSecondDegreeConnections: (nodeId: string): DreamNode[] => {
      const sourceNode = nodes.get(nodeId);
      if (!sourceNode) return [];
      
      const firstDegreeIds = edges.get(nodeId) || [];
      const secondDegreeNodes = new Set<DreamNode>();
      
      firstDegreeIds.forEach(firstDegreeId => {
        const secondDegreeIds = edges.get(firstDegreeId) || [];
        
        secondDegreeIds.forEach(secondDegreeId => {
          const secondDegreeNode = nodes.get(secondDegreeId);
          
          if (secondDegreeNode && 
              secondDegreeId !== nodeId && // Don't include source
              !firstDegreeIds.includes(secondDegreeId)) { // Don't include first-degree
            secondDegreeNodes.add(secondDegreeNode);
          }
        });
      });
      
      return Array.from(secondDegreeNodes);
    }
  };
  
  return graph;
}

/**
 * Get relationship statistics for debugging
 */
export function getRelationshipStats(graph: RelationshipGraph): {
  totalNodes: number;
  totalEdges: number;
  dreamNodes: number;
  dreamerNodes: number;
  averageConnections: number;
  maxConnections: number;
  nodesWithNoConnections: number;
} {
  const totalNodes = graph.nodes.size;
  let totalEdges = 0;
  let dreamNodes = 0;
  let dreamerNodes = 0;
  let maxConnections = 0;
  let nodesWithNoConnections = 0;
  
  graph.nodes.forEach((node, nodeId) => {
    const connections = graph.edges.get(nodeId) || [];
    totalEdges += connections.length;
    
    if (node.type === 'dream') dreamNodes++;
    else dreamerNodes++;
    
    if (connections.length === 0) nodesWithNoConnections++;
    if (connections.length > maxConnections) maxConnections = connections.length;
  });
  
  return {
    totalNodes,
    totalEdges,
    dreamNodes,
    dreamerNodes,
    averageConnections: totalNodes > 0 ? totalEdges / totalNodes : 0,
    maxConnections,
    nodesWithNoConnections
  };
}

/**
 * Debug helper to log relationships for a specific node
 */
export function logNodeRelationships(graph: RelationshipGraph, nodeId: string): void {
  const node = graph.nodes.get(nodeId);
  if (!node) {
    console.log(`Node ${nodeId} not found in graph`);
    return;
  }
  
  console.log(`\n=== Relationships for ${node.name} (${node.type}) ===`);
  
  const connections = graph.getConnections(nodeId);
  console.log(`Direct connections (${connections.length}):`, 
    connections.map(n => `${n.name} (${n.type})`));
  
  const oppositeType = graph.getOppositeTypeConnections(nodeId);
  console.log(`Opposite-type connections (${oppositeType.length}):`, 
    oppositeType.map(n => `${n.name} (${n.type})`));
  
  const secondDegree = graph.getSecondDegreeConnections(nodeId);
  console.log(`Second-degree connections (${secondDegree.length}):`, 
    secondDegree.map(n => `${n.name} (${n.type})`));
}