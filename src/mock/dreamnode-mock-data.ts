import { DreamNode, MediaFile, CanvasFile } from '../types/dreamnode';
import { calculateFibonacciSpherePositions } from '../dreamspace/FibonacciSphereLayout';

/**
 * Mock DreamNode data for testing the 3D visualization
 * 
 * This provides sample data that follows the UDD structure
 * without requiring actual Git repositories or file parsing.
 */

// Mock media files for testing
const mockMediaFiles: MediaFile[] = [
  {
    path: 'symbols/fibonacci.png',
    absolutePath: '/mock/symbols/fibonacci.png',
    type: 'image/png',
    data: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
      <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="40" fill="#00a2ff" stroke="#ffffff" stroke-width="2"/>
        <text x="50" y="55" font-family="Arial" font-size="12" fill="white" text-anchor="middle">∞</text>
      </svg>
    `),
    size: 1024
  },
  {
    path: 'symbols/dreamer.png',
    absolutePath: '/mock/symbols/dreamer.png',
    type: 'image/png',
    data: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
      <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="40" fill="#FF644E" stroke="#ffffff" stroke-width="2"/>
        <text x="50" y="55" font-family="Arial" font-size="12" fill="white" text-anchor="middle">🧠</text>
      </svg>
    `),
    size: 1024
  },
  {
    path: 'symbols/geometry.png',
    absolutePath: '/mock/symbols/geometry.png',
    type: 'image/png',
    data: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
      <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <polygon points="50,10 85,75 15,75" fill="#00a2ff" stroke="#ffffff" stroke-width="2"/>
      </svg>
    `),
    size: 1024
  },
  {
    path: 'symbols/pattern.png',
    absolutePath: '/mock/symbols/pattern.png',
    type: 'image/png',
    data: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
      <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <rect x="25" y="25" width="50" height="50" fill="#00a2ff" stroke="#ffffff" stroke-width="2"/>
        <circle cx="50" cy="50" r="15" fill="#ffffff"/>
      </svg>
    `),
    size: 1024
  }
];

// Mock canvas files (simplified for testing)
const mockCanvasFiles: CanvasFile[] = [
  {
    path: 'canvas/overview.canvas',
    absolutePath: '/mock/canvas/overview.canvas',
    content: {
      nodes: [
        {
          id: 'node1',
          type: 'text',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          text: 'This is a DreamSong about sacred geometry...'
        }
      ],
      edges: []
    }
  }
];

/**
 * Generate mock DreamNode data using Fibonacci sphere distribution
 * Now uses persistent relationships from store if available
 */
export function generateMockDreamNodes(count: number = 12, relationshipData?: Map<string, string[]>): DreamNode[] {
  const spherePositions = calculateFibonacciSpherePositions({
    radius: 5000, // Updated to match night sky sphere radius
    nodeCount: count,
    center: [0, 0, 0]
  });
  
  const dreamNodes: DreamNode[] = [];
  
  for (let i = 0; i < count; i++) {
    const [x, y, z] = spherePositions[i].position;
    
    // Alternate between dreams and dreamers
    const isDream = i % 3 !== 0; // More dreams than dreamers
    const type = isDream ? 'dream' : 'dreamer';
    
    // Select appropriate media
    const mediaIndex = isDream ? i % 3 : 1; // Dreamers use index 1 (brain emoji)
    const media = [mockMediaFiles[mediaIndex]];
    
    const nodeId = `mock-${type}-${i}`;
    
    // Use persistent relationships if available, otherwise generate
    const connections = relationshipData?.get(nodeId) || generateLiminalConnections(i, count, type);
    
    dreamNodes.push({
      id: nodeId,
      type,
      name: isDream ? `Dream ${i + 1}` : `Dreamer ${Math.floor(i / 3) + 1}`,
      position: [x, y, z],
      dreamTalkMedia: media,
      dreamSongContent: mockCanvasFiles,
      liminalWebConnections: connections,
      repoPath: `/mock/repos/${type}-${i}`,
      hasUnsavedChanges: false
    });
  }
  
  return dreamNodes;
}

/**
 * Generate liminal web connections for a node
 * Dreams connect to Dreamers and vice versa (opposite-type only)
 * Creates rich networks with 10-30 relationships for testing ring layouts
 */
function generateLiminalConnections(index: number, totalCount: number, type: 'dream' | 'dreamer'): string[] {
  const connections: string[] = [];
  
  // Generate 10-30 connections based on graph size for ring layout testing
  const baseConnections = Math.min(10, Math.floor(totalCount / 3)); // At least 10 if possible
  const maxConnections = Math.min(30, Math.floor(totalCount * 0.6)); // Up to 60% of opposite-type nodes
  const targetConnections = baseConnections + Math.floor(Math.random() * (maxConnections - baseConnections + 1));
  
  // Generate deterministic but varied connections using multiple strategies
  const strategies = [
    // Strategy 1: Regular intervals with prime steps
    () => {
      const stepSizes = [1, 3, 5, 7, 11, 13, 17, 19]; // Prime numbers for good distribution
      for (let i = 0; i < Math.ceil(targetConnections / 2) && connections.length < targetConnections; i++) {
        const stepSize = stepSizes[i % stepSizes.length];
        const targetIndex = (index + stepSize * (i + 1)) % totalCount;
        const targetType = targetIndex % 3 !== 0 ? 'dream' : 'dreamer';
        
        if (type !== targetType) {
          const targetId = `mock-${targetType}-${targetIndex}`;
          if (!connections.includes(targetId)) {
            connections.push(targetId);
          }
        }
      }
    },
    
    // Strategy 2: Backwards connections for variety
    () => {
      const stepSizes = [2, 4, 6, 8, 12, 16, 20];
      for (let i = 0; i < Math.ceil(targetConnections / 3) && connections.length < targetConnections; i++) {
        const stepSize = stepSizes[i % stepSizes.length];
        const targetIndex = (index - stepSize * (i + 1) + totalCount) % totalCount;
        const targetType = targetIndex % 3 !== 0 ? 'dream' : 'dreamer';
        
        if (type !== targetType) {
          const targetId = `mock-${targetType}-${targetIndex}`;
          if (!connections.includes(targetId)) {
            connections.push(targetId);
          }
        }
      }
    },
    
    // Strategy 3: Fibonacci-based connections for natural patterns
    () => {
      const fibSequence = [1, 1, 2, 3, 5, 8, 13, 21, 34];
      for (let i = 0; i < fibSequence.length && connections.length < targetConnections; i++) {
        const targetIndex = (index + fibSequence[i]) % totalCount;
        const targetType = targetIndex % 3 !== 0 ? 'dream' : 'dreamer';
        
        if (type !== targetType) {
          const targetId = `mock-${targetType}-${targetIndex}`;
          if (!connections.includes(targetId)) {
            connections.push(targetId);
          }
        }
      }
    }
  ];
  
  // Apply all strategies to build rich connection set
  strategies.forEach(strategy => strategy());
  
  // Fill remaining slots with nearby connections if needed
  if (connections.length < targetConnections) {
    for (let offset = 1; offset < totalCount && connections.length < targetConnections; offset++) {
      // Try both directions
      for (const direction of [1, -1]) {
        const targetIndex = (index + offset * direction + totalCount) % totalCount;
        const targetType = targetIndex % 3 !== 0 ? 'dream' : 'dreamer';
        
        if (type !== targetType) {
          const targetId = `mock-${targetType}-${targetIndex}`;
          if (!connections.includes(targetId)) {
            connections.push(targetId);
            if (connections.length >= targetConnections) break;
          }
        }
      }
    }
  }
  
  // Ensure every node has at least one connection if possible
  if (connections.length === 0 && totalCount > 1) {
    for (let offset = 1; offset < totalCount; offset++) {
      const targetIndex = (index + offset) % totalCount;
      const targetType = targetIndex % 3 !== 0 ? 'dream' : 'dreamer';
      
      if (type !== targetType) {
        connections.push(`mock-${targetType}-${targetIndex}`);
        break;
      }
    }
  }
  
  return connections.slice(0, targetConnections); // Ensure we don't exceed target
}

/**
 * Mock data configuration types
 */
export type MockDataConfig = 'single-node' | 'fibonacci-12' | 'fibonacci-50' | 'fibonacci-100';

/**
 * Get mock data based on configuration with optional relationship data
 */
export function getMockDataForConfig(config: MockDataConfig, relationshipData?: Map<string, string[]>): DreamNode[] {
  switch (config) {
    case 'single-node':
      return [getSingleTestNode()];
    case 'fibonacci-12':
      return generateMockDreamNodes(12, relationshipData);
    case 'fibonacci-50':
      return generateMockDreamNodes(50, relationshipData);
    case 'fibonacci-100':
      return generateMockDreamNodes(100, relationshipData);
    default:
      return [getSingleTestNode()];
  }
}

/**
 * Get a single mock DreamNode on sphere surface for focused testing
 */
export function getSingleTestNode(): DreamNode {
  // Position on sphere surface - using sphere radius 5000
  // Place at 90 degrees from intersection point for clear scaling test
  return {
    id: 'mock-test-dream',
    type: 'dream',
    name: 'Test Dream',
    position: [5000, 0, 0], // On sphere surface, perpendicular to intersection point
    dreamTalkMedia: [mockMediaFiles[0]],
    dreamSongContent: mockCanvasFiles,
    liminalWebConnections: [],
    repoPath: '/mock/repos/test-dream',
    hasUnsavedChanges: false
  };
}

/**
 * Mock DreamNode with no media (test empty state)
 */
export function getEmptyMockDreamNode(): DreamNode {
  return {
    id: 'mock-empty-dream',
    type: 'dream',
    name: 'Empty Dream',
    position: [200, 0, 0],
    dreamTalkMedia: [],
    dreamSongContent: [],
    liminalWebConnections: [],
    repoPath: '/mock/repos/empty-dream',
    hasUnsavedChanges: false
  };
}