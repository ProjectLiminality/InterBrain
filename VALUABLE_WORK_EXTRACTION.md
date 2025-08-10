# Valuable Work Extraction from feature/focused-layout-engine

This document preserves the key algorithms, patterns, and insights from the `feature/focused-layout-engine` branch before starting fresh. These are the **gems worth preserving** from our complex animation journey.

## 🎯 Core Insights Learned

### 1. **Position Sovereignty Principle** (from `dff915e`)
**Key Discovery**: DreamNode components must own their position state completely after initialization.

```typescript
// ❌ BROKEN: External position syncing
useEffect(() => {
  if (!isMoving) {
    setCurrentPosition(dreamNode.position); // Causes interference!
  }
}, [dreamNode.position, isMoving]);

// ✅ WORKING: Position sovereignty
// currentPosition is only updated by moveToPosition calls
// No external syncing after initialization
```

**Why This Matters**: External position syncing causes nodes to "remember" old positions and animate from wrong starting points.

### 2. **Animation Interpolation Fix** (from `ad147d0`)
**Key Discovery**: Use startPosition, not currentPosition, for interpolation.

```typescript
// ❌ BROKEN: Exponential decay (most movement in first frame)
const newPosition = [
  currentPosition[0] + (targetPosition[0] - currentPosition[0]) * progress,
  // ... results in 99% movement in first 100ms
];

// ✅ WORKING: Linear interpolation
const newPosition = [
  startPosition[0] + (targetPosition[0] - startPosition[0]) * progress,
  // ... smooth progression over full duration
];
```

**Why This Matters**: The broken version creates exponential decay where 99% of movement happens immediately.

## 🧮 Core Algorithms Worth Preserving

### 3. **Liminal Web Layout Algorithm**
**Perfect positioning math** for center + inner circle + outer circle:

```typescript
export interface FocusedLayoutConfig {
  centerDistance: number;        // 50 - Distance from camera for focused node
  innerCircleDistance: number;   // 100 - Distance for first-degree relationships  
  outerCircleDistance: number;   // 600 - Distance for second-degree relationships
  maxInnerConnections: number;   // 12 - Maximum in inner circle
  maxOuterConnections: number;   // 50 - Maximum in outer circle
}

// Center positioning
positions.set(focusedNode.id, [0, 0, -config.centerDistance]);

// Inner circle positioning  
const innerRadius = 60; // CONSTANT radius
limitedInnerNodes.forEach((node, index) => {
  const angle = (index / limitedInnerNodes.length) * 2 * Math.PI;
  const x = innerRadius * Math.cos(angle);
  const y = innerRadius * Math.sin(angle);
  const z = -config.innerCircleDistance;
  positions.set(node.id, [x, y, z]);
});

// Outer circle positioning
const outerRadius = 600;
limitedOuterNodes.forEach((node, index) => {
  const angle = (index / limitedOuterNodes.length) * 2 * Math.PI;
  const x = outerRadius * Math.cos(angle);
  const y = outerRadius * Math.sin(angle);
  const z = -config.outerCircleDistance;
  positions.set(node.id, [x, y, z]);
});
```

### 4. **Relationship Query System** 
**High-performance relationship graph** for complex queries:

```typescript
export interface RelationshipGraph {
  nodes: Map<string, DreamNode>;
  edges: Map<string, string[]>; // nodeId -> array of connected nodeIds
  getConnections: (nodeId: string) => DreamNode[];
  getOppositeTypeConnections: (nodeId: string) => DreamNode[];
  getSecondDegreeConnections: (nodeId: string) => DreamNode[];
}

// Opposite type connections (Dreams ↔ Dreamers)
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

// Second-degree connections for orbital circle
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
```

### 5. **Universal Movement API Pattern**
**Clean animation interface** for DreamNode components:

```typescript
export interface DreamNode3DRef {
  moveToPosition: (targetPosition: [number, number, number], duration?: number, easing?: string) => void;
  getCurrentPosition: () => [number, number, number];
  isMoving: () => boolean;
}

// Implementation with position sovereignty
useImperativeHandle(ref, () => ({
  moveToPosition: (newTargetPosition, duration = 1000, easing = 'easeOutCubic') => {
    setStartPosition([...currentPosition]); // Snapshot start position
    setTargetPosition(newTargetPosition);
    setMovementDuration(duration);
    setMovementStartTime(globalThis.performance.now());
    setIsMoving(true);
  },
  getCurrentPosition: () => currentPosition,
  isMoving: () => isMoving
}), [currentPosition, isMoving]);
```

## 🚫 Anti-Patterns to Avoid

### 6. **Don't Mix Animation with Component Mounting**
**The Root Cause of Our Issues**: Trying to mount/unmount components during animations.

```typescript
// ❌ BROKEN: Conditional rendering based on active nodes
{spatialLayout === 'constellation' && renderConstellationNodes()}
{spatialLayout === 'liminalWeb' && renderLiminalWebNodes()}
// ^ This causes mounting/unmounting during transitions

// ✅ WORKING: Same persistent components, just repositioned
{renderAllNodes()} // Always same components
// Animation system just calls moveToPosition() on existing refs
```

### 7. **Don't Update Store During Animation**
**State synchronization bugs**: Store updates cause React re-renders during animation.

```typescript
// ❌ BROKEN: Store updates during animation
onClick(node) → updateStore(newActiveNodes) → ReactRemount → animate

// ✅ WORKING: Pure animation like test command  
onClick(node) → calculateNewPositions → animateExistingNodes
```

## 🎛️ Proven Working Patterns

### 8. **Test Command Pattern** (The Gold Standard)
**Why the "move to center" command works perfectly**:

```typescript
// Simple, direct animation without React complexity
const testMoveAllNodesToCenter = (centerPosition) => {
  const currentNodes = store.liminalWebActiveNodes;
  
  globalThis.requestAnimationFrame(() => {
    currentNodes.forEach(node => {
      const nodeRef = nodeRefs.get(node.id);
      if (nodeRef?.current) {
        nodeRef.current.moveToPosition(centerPosition, 2000, 'easeOutCubic');
      }
    });
  });
};
```

**Key Elements**:
- No store updates
- No component mounting/unmounting  
- Direct animation calls on existing refs
- Uses requestAnimationFrame for timing
- Same nodes stay rendered throughout

### 9. **Batched State Updates Pattern**
**Prevent double useEffect triggering**:

```typescript
// ❌ BROKEN: Separate updates trigger useEffect twice
useInterBrainStore.setState({ selectedNode: node });
useInterBrainStore.setState({ spatialLayout: 'liminalWeb' });

// ✅ WORKING: Batched update triggers useEffect once
useInterBrainStore.setState({ 
  selectedNode: node,
  spatialLayout: 'liminalWeb'
});
```

## 🔄 Implementation Strategy for Fresh Start

### Phase 1: Foundation (Copy Constellation Pattern)
1. Use same persistent node rendering as constellation
2. No conditional rendering - all nodes always mounted
3. Same ref system - no dynamic ref creation/deletion

### Phase 2: Pure Positioning
1. Add position calculation functions (use algorithms above)
2. No animation yet - just snap to positions to verify logic
3. Use test command pattern for position dispatch

### Phase 3: Animation Layer
1. Add moveToPosition calls with working interpolation math
2. Ensure position sovereignty in DreamNode components
3. No store updates during animation phase

### Phase 4: Interaction
1. Add click handlers that only calculate + animate
2. Use batched store updates if needed
3. Keep same node set throughout - no mounting/unmounting

## 📝 Specific Code Snippets to Copy

The relationship graph implementation, focused layout algorithm, and universal movement API are production-ready and should be copied directly to the new branch.

The position sovereignty fix and interpolation math are crucial bug fixes that must be included from the start.

The test command pattern should be the template for all animation dispatch logic.

---

**Branch to Create From**: `f23715f` (Release v0.3.0: Epic 3 Complete)  
**Reference Branch**: `feature/focused-layout-engine` (keep for reference)  
**New Branch Name**: `feature/liminal-web-simple` (suggested)

This extraction ensures we don't lose the valuable algorithmic work while avoiding the architectural complexity that caused our issues.