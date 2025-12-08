/**
 * Force-Directed Layout Algorithm (Fruchterman-Reingold)
 *
 * Implementation of the Fruchterman-Reingold algorithm for graph layout in 2D,
 * adapted for constellation clusters. Computes attractive and repulsive forces
 * to create visually pleasing node arrangements within spherical caps.
 */

import { DreamSongNode, DreamSongEdge } from './types';
import { ConstellationCluster, PlanarPosition, ForceVector, ConstellationLayoutConfig } from './LayoutConfig';

/**
 * Result of force-directed layout computation
 */
export interface ForceLayoutResult {
  /** Final positions of nodes in 2D plane */
  positions: Map<string, PlanarPosition>;

  /** Number of iterations actually performed */
  iterations: number;

  /** Whether the layout converged */
  converged: boolean;

  /** Final energy of the system */
  finalEnergy: number;
}

/**
 * Compute force-directed layout for a single cluster
 *
 * Applies the Fruchterman-Reingold algorithm to arrange nodes within a cluster
 * in a 2D tangent plane, which will later be projected to the sphere surface.
 *
 * @param cluster The cluster to layout
 * @param nodes All nodes in the graph
 * @param edges Edges between nodes in this cluster
 * @param config Layout configuration parameters
 * @returns Layout result with 2D positions
 */
export function computeClusterLayout(
  cluster: ConstellationCluster,
  nodes: Map<string, DreamSongNode>,
  edges: DreamSongEdge[],
  config: ConstellationLayoutConfig
): ForceLayoutResult {
  // const _startTime = performance.now(); // For future performance monitoring

  // Get nodes that belong to this cluster
  const clusterNodes = cluster.nodeIds
    .map(id => nodes.get(id))
    .filter((node): node is DreamSongNode => node !== undefined);

  // Get edges within this cluster
  const clusterEdges = edges.filter(edge =>
    cluster.nodeIds.includes(edge.source) && cluster.nodeIds.includes(edge.target)
  );

  if (clusterNodes.length === 0) {
    return {
      positions: new Map(),
      iterations: 0,
      converged: true,
      finalEnergy: 0
    };
  }

  // Handle single node case
  if (clusterNodes.length === 1) {
    const positions = new Map<string, PlanarPosition>();
    positions.set(clusterNodes[0].id, { x: 0, y: 0 });
    return {
      positions,
      iterations: 0,
      converged: true,
      finalEnergy: 0
    };
  }

  // Initialize random positions within cluster radius
  const positions = new Map<string, PlanarPosition>();
  for (const node of clusterNodes) {
    const angle = Math.random() * 2 * Math.PI;
    const radius = Math.random() * 0.3 * cluster.radius;
    positions.set(node.id, {
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle)
    });
  }

  // Calculate optimal edge length based on cluster area
  const area = Math.PI * cluster.radius * cluster.radius;
  const k = 0.8 * Math.sqrt(area / clusterNodes.length);

  let converged = false;
  let iteration = 0;
  let previousEnergy = Infinity;
  const convergenceThreshold = 1e-6;

  // Force-directed iterations
  for (iteration = 0; iteration < config.forceIterations; iteration++) {
    const forces = new Map<string, ForceVector>();

    // Initialize forces to zero
    for (const node of clusterNodes) {
      forces.set(node.id, { x: 0, y: 0 });
    }

    // Calculate repulsive forces (all pairs)
    for (let i = 0; i < clusterNodes.length; i++) {
      for (let j = i + 1; j < clusterNodes.length; j++) {
        const node1 = clusterNodes[i];
        const node2 = clusterNodes[j];
        const pos1 = positions.get(node1.id)!;
        const pos2 = positions.get(node2.id)!;

        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 1e-10) {
          // Fruchterman-Reingold repulsive force: k²/d
          const repulsiveForce = config.repulsionStrength * k * k / distance;
          const fx = (dx / distance) * repulsiveForce;
          const fy = (dy / distance) * repulsiveForce;

          const force1 = forces.get(node1.id)!;
          const force2 = forces.get(node2.id)!;

          force1.x += fx;
          force1.y += fy;
          force2.x -= fx;
          force2.y -= fy;
        }
      }
    }

    // Calculate attractive forces (connected pairs)
    for (const edge of clusterEdges) {
      const pos1 = positions.get(edge.source);
      const pos2 = positions.get(edge.target);

      if (pos1 && pos2) {
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 1e-10) {
          // Fruchterman-Reingold attractive force: d²/k
          const attractiveForce = config.attractionStrength * distance * distance / k;
          const fx = (dx / distance) * attractiveForce;
          const fy = (dy / distance) * attractiveForce;

          const force1 = forces.get(edge.source)!;
          const force2 = forces.get(edge.target)!;

          force1.x -= fx;
          force1.y -= fy;
          force2.x += fx;
          force2.y += fy;
        }
      }
    }

    // Apply forces with simulated annealing (cooling)
    const temperature = config.initialTemperature * (1 - iteration / config.forceIterations);
    // let _totalDisplacement = 0; // For future convergence tracking

    for (const node of clusterNodes) {
      const force = forces.get(node.id)!;
      const magnitude = Math.sqrt(force.x * force.x + force.y * force.y);

      if (magnitude > 1e-10) {
        // Limit displacement by temperature
        const displacement = Math.min(magnitude, temperature);
        const pos = positions.get(node.id)!;

        pos.x += (force.x / magnitude) * displacement;
        pos.y += (force.y / magnitude) * displacement;

        // Constrain to cluster boundary (circular constraint)
        const distance = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
        if (distance > cluster.radius) {
          pos.x = (pos.x / distance) * cluster.radius;
          pos.y = (pos.y / distance) * cluster.radius;
        }

        // _totalDisplacement += displacement; // For future convergence tracking
      }
    }

    // Check for convergence
    const currentEnergy = calculateLayoutEnergy(positions, clusterEdges, k, config);
    if (Math.abs(currentEnergy - previousEnergy) < convergenceThreshold) {
      converged = true;
      break;
    }
    previousEnergy = currentEnergy;
  }

  const finalEnergy = calculateLayoutEnergy(positions, clusterEdges, k, config);

  return {
    positions,
    iterations: iteration,
    converged,
    finalEnergy
  };
}

/**
 * Calculate the total energy of a force-directed layout
 *
 * Lower energy indicates better layout quality. Energy is the sum of
 * potential energy from repulsive and attractive forces.
 *
 * @param positions Current node positions
 * @param edges Edges in the cluster
 * @param k Optimal edge length
 * @param config Layout configuration
 * @returns Total system energy
 */
function calculateLayoutEnergy(
  positions: Map<string, PlanarPosition>,
  edges: DreamSongEdge[],
  k: number,
  config: ConstellationLayoutConfig
): number {
  let energy = 0;

  // Repulsive energy (between all pairs)
  const nodeIds = Array.from(positions.keys());
  for (let i = 0; i < nodeIds.length; i++) {
    for (let j = i + 1; j < nodeIds.length; j++) {
      const pos1 = positions.get(nodeIds[i])!;
      const pos2 = positions.get(nodeIds[j])!;

      const dx = pos1.x - pos2.x;
      const dy = pos1.y - pos2.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 1e-10) {
        // Repulsive potential energy
        energy += config.repulsionStrength * k * k / distance;
      }
    }
  }

  // Attractive energy (between connected pairs)
  for (const edge of edges) {
    const pos1 = positions.get(edge.source);
    const pos2 = positions.get(edge.target);

    if (pos1 && pos2) {
      const dx = pos1.x - pos2.x;
      const dy = pos1.y - pos2.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Attractive potential energy (spring model)
      energy += config.attractionStrength * distance * distance / (2 * k);
    }
  }

  return energy;
}

/**
 * Optimize node positions using gradient descent
 *
 * Alternative optimization method that can be used in addition to
 * or instead of force-directed simulation.
 *
 * @param positions Initial positions
 * @param edges Edges in the cluster
 * @param k Optimal edge length
 * @param config Layout configuration
 * @param maxIterations Maximum gradient descent iterations
 * @returns Optimized positions
 */
export function optimizeWithGradientDescent(
  positions: Map<string, PlanarPosition>,
  edges: DreamSongEdge[],
  k: number,
  config: ConstellationLayoutConfig,
  maxIterations: number = 50
): Map<string, PlanarPosition> {
  const nodeIds = Array.from(positions.keys());
  const learningRate = 0.01;

  for (let iter = 0; iter < maxIterations; iter++) {
    const gradients = new Map<string, ForceVector>();

    // Initialize gradients
    for (const nodeId of nodeIds) {
      gradients.set(nodeId, { x: 0, y: 0 });
    }

    // Calculate gradients (negative forces)
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const id1 = nodeIds[i];
        const id2 = nodeIds[j];
        const pos1 = positions.get(id1)!;
        const pos2 = positions.get(id2)!;

        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 1e-10) {
          // Gradient of repulsive energy
          const repulsiveGrad = config.repulsionStrength * k * k / (distance * distance * distance);
          const gradX = dx * repulsiveGrad;
          const gradY = dy * repulsiveGrad;

          const grad1 = gradients.get(id1)!;
          const grad2 = gradients.get(id2)!;

          grad1.x += gradX;
          grad1.y += gradY;
          grad2.x -= gradX;
          grad2.y -= gradY;
        }
      }
    }

    // Attractive gradients
    for (const edge of edges) {
      const pos1 = positions.get(edge.source);
      const pos2 = positions.get(edge.target);

      if (pos1 && pos2) {
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;

        // Gradient of attractive energy
        const attractiveGrad = config.attractionStrength / k;
        const gradX = dx * attractiveGrad;
        const gradY = dy * attractiveGrad;

        const grad1 = gradients.get(edge.source)!;
        const grad2 = gradients.get(edge.target)!;

        grad1.x += gradX;
        grad1.y += gradY;
        grad2.x -= gradX;
        grad2.y -= gradY;
      }
    }

    // Apply gradients
    for (const nodeId of nodeIds) {
      const pos = positions.get(nodeId)!;
      const grad = gradients.get(nodeId)!;

      pos.x -= learningRate * grad.x;
      pos.y -= learningRate * grad.y;
    }
  }

  return positions;
}