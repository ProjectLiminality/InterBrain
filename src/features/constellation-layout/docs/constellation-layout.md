# Constellation Layout Algorithm

The InterBrain constellation layout system transforms relationship graphs into precise 3D positioned networks using sophisticated force-directed algorithms. This creates an intuitive visual representation of knowledge relationships, automatically clustering related concepts and positioning them on a spherical surface.

## Overview

The constellation layout is a **5-phase mathematical pipeline** that converts relationship data into optimal 3D positions:

1. **Connected Components Detection** - Automatic clustering using graph theory
2. **Global Cluster Positioning** - Fibonacci sphere distribution for cluster centers
3. **Local Force-Directed Layout** - Fruchterman-Reingold algorithm within clusters
4. **Spherical Projection** - Exponential mapping from planar to curved space
5. **Cluster Refinement** - Iterative overlap elimination

## Interactive Demonstrations

**[🎯 Local Cluster Layout](./local-cluster-layout.html)**
Demonstrates force-directed positioning within individual clusters using the Fruchterman-Reingold algorithm.

**[🌍 Global Cluster Positioning](./global-cluster-positioning.html)**
Shows how cluster centers are distributed across the sphere using Fibonacci distribution.

**[🌌 Full Constellation System](./full-constellation-system.html)**
Complete integrated system with all phases working together. Supports custom JSON data input.

## Algorithm Phases

### Phase 1: Connected Components Detection

Identifies natural clusters in the relationship graph using depth-first search (DFS):

```typescript
function detectConnectedComponents(graph: RelationshipGraph): ClusteringResult {
  const visited = new Set<string>();
  const clusters: Cluster[] = [];

  for (const nodeId of graph.nodes.keys()) {
    if (!visited.has(nodeId)) {
      const cluster = exploreComponent(nodeId, graph, visited);
      clusters.push(cluster);
    }
  }

  return { clusters, stats: calculateStats(clusters) };
}
```

**Key Features:**
- Automatic cluster discovery from relationship data
- No predefined cluster count required
- Handles disconnected components gracefully

### Phase 2: Global Cluster Positioning

Places cluster centers on the sphere using Fibonacci distribution for optimal spacing:

```typescript
function fibonacciSphere(n: number): Vector3[] {
  const points: Vector3[] = [];
  const goldenRatio = (1 + Math.sqrt(5)) / 2;

  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * i) / (n - 1);
    const radius = Math.sqrt(1 - y * y);
    const theta = 2 * Math.PI * i / goldenRatio;

    // Generate point then rotate to camera-facing orientation
    const point = new Vector3(
      radius * Math.cos(theta),
      y,
      radius * Math.sin(theta)
    );

    // 90° rotation around X-axis: (x, y, z) → (x, z, -y)
    const rotatedPoint = new Vector3(point.x, point.z, -point.y);
    points.push(rotatedPoint);
  }

  return points;
}
```

**Key Features:**
- Mathematically optimal point distribution
- Camera-facing orientation (largest cluster appears in view)
- Proportional area allocation based on cluster size

### Phase 3: Local Force-Directed Layout

Applies the Fruchterman-Reingold algorithm within each cluster in 2D tangent space:

```typescript
function computeClusterLayout(cluster: Cluster, config: LayoutConfig): LayoutResult {
  // Initialize random positions within cluster boundary
  const positions = initializeRandomPositions(cluster);

  for (let iteration = 0; iteration < config.forceIterations; iteration++) {
    const forces = calculateForces(positions, cluster.edges, config);

    // Apply forces with simulated annealing
    const temperature = config.initialTemperature * (1 - iteration / config.forceIterations);
    applyForces(positions, forces, temperature, cluster.radius);
  }

  return { positions, converged: true };
}
```

**Force Calculations:**
- **Repulsive forces**: `k²/d` between all node pairs
- **Attractive forces**: `d²/k` between connected nodes
- **Simulated annealing**: Temperature cooling for convergence

### Phase 4: Spherical Projection

Maps 2D force-directed layouts onto the sphere surface using exponential mapping:

```typescript
function exponentialMap(center: Vector3, tangentVector: PlanarPosition, basis: TangentBasis): Vector3 {
  // Convert 2D tangent vector to 3D
  const tangent3D = basis.e1.clone()
    .multiplyScalar(tangentVector.x)
    .add(basis.e2.clone().multiplyScalar(tangentVector.y));

  const theta = tangent3D.length();
  if (theta < 1e-10) return center.clone();

  // Apply exponential map formula: exp_p(v) = cos(|v|) * p + sin(|v|) * (v / |v|)
  const result = center.clone().multiplyScalar(Math.cos(theta));
  const normalizedTangent = tangent3D.clone().divideScalar(theta);
  result.add(normalizedTangent.multiplyScalar(Math.sin(theta)));

  return result.normalize();
}
```

**Mathematical Foundation:**
- Preserves local distances and angles
- Maps planar layouts to curved space
- Maintains cluster coherence on sphere surface

### Phase 5: Cluster Refinement

Eliminates overlaps between clusters using iterative spring-mass simulation:

```typescript
function refineClusterPositions(clusters: Cluster[], config: LayoutConfig): RefinementResult {
  for (let iteration = 0; iteration < config.refinementIterations; iteration++) {
    const forces = calculateRepulsiveForces(clusters, config);

    if (!hasOverlaps(clusters)) break;

    // Apply forces with damping
    applyClusterForces(clusters, forces, 0.8);

    // Project back to unit sphere
    clusters.forEach(cluster => cluster.center.normalize());
  }

  return { clusters, success: !hasOverlaps(clusters) };
}
```

**Overlap Detection:**
- Geodesic distance calculations on sphere surface
- Spherical cap intersection tests
- Margin-based separation requirements

## JSON Data Format

The constellation system accepts relationship data in this format:

```json
{
  "nodes": [
    {
      "id": "node-1",
      "title": "Node Title",
      "isStandalone": false
    }
  ],
  "edges": [
    {
      "source": "node-1",
      "target": "node-2",
      "weight": 1.0
    }
  ],
  "metadata": {
    "totalNodes": 10,
    "totalEdges": 15,
    "totalDreamSongs": 5,
    "standaloneNodes": 2
  }
}
```

### Field Descriptions

**Node Fields:**
- `id`: Unique identifier (required)
- `title`: Display name (optional, defaults to ID)
- `isStandalone`: Whether node has no connections (optional, auto-detected)

**Edge Fields:**
- `source`: Source node ID (required)
- `target`: Target node ID (required)
- `weight`: Connection strength (optional, defaults to 1.0)

**Metadata Fields:**
- Statistical information about the graph
- Used for validation and display
- All fields optional but recommended

## Configuration Parameters

The algorithm behavior can be tuned via configuration object:

```typescript
interface ConstellationLayoutConfig {
  // Global positioning
  coverageFactor: number;      // 0.7 - sphere surface coverage
  minRadius: number;           // 0.1 - minimum cluster radius
  sphereRadius: number;        // 5000 - world space radius

  // Force-directed layout
  forceIterations: number;     // 100 - simulation steps
  repulsionStrength: number;   // 1.0 - node repulsion force
  attractionStrength: number;  // 1.0 - edge attraction force
  initialTemperature: number;  // 0.1 - annealing start temperature

  // Cluster refinement
  refinementIterations: number; // 50 - overlap elimination steps
  refinementMargin: number;     // 0.02 - required separation margin
}
```

## Performance Characteristics

- **Time Complexity**: O(n² + e) where n = nodes, e = edges
- **Space Complexity**: O(n + e) for graph storage
- **Scalability**: Tested with 100+ nodes, 500+ edges
- **Convergence**: Typically converges in 50-100 iterations

## Integration Points

### Command Palette
- `Scan Vault for DreamSong Relationships` - Auto-applies layout after scanning
- `Apply Constellation Layout` - Manual positioning trigger
- `Show DreamSong Relationship Statistics` - Graph analysis

### Zustand Store
```typescript
interface ConstellationData {
  relationshipGraph: DreamSongRelationshipGraph | null;
  positions: Map<string, [number, number, number]> | null;
  lastLayoutTimestamp: number | null;
  lastScanTimestamp: number | null;
  isScanning: boolean;
}
```

### SpatialOrchestrator Integration
```typescript
applyConstellationLayout(): void {
  const layoutResult = computeConstellationLayout(relationshipGraph, dreamNodes);
  const completePositions = createFallbackLayout(dreamNodes, layoutResult.nodePositions);

  // Store positions and animate nodes
  store.setConstellationPositions(completePositions);
  this.animateNodesToPositions(completePositions);
}
```

## Technical Innovation

The constellation layout system represents several key innovations:

1. **Spherical Force-Direction**: First implementation of Fruchterman-Reingold on curved surfaces
2. **Automatic Clustering**: No manual cluster definition required
3. **Camera-Aware Orientation**: Largest clusters appear in user's field of view
4. **Relationship Preservation**: Visual connections maintained across all layout modes
5. **Real-time Interaction**: 12x thicker invisible hit detection for precise edge clicking

This creates an intuitive, mathematically sound, and visually appealing way to explore complex knowledge relationships in 3D space.