# Core Module

The foundational infrastructure that all features build upon. Core defines *how* things work; features define *what* things do.

## Purpose

Core provides three essential capabilities:

1. **State Management** - The Zustand store acts as a universal communication bus. Features declare intent by updating store state; core reacts by orchestrating the UI.

2. **Spatial Orchestration** - The SpatialOrchestrator is the conductor that positions DreamNodes in 3D space. Since our UI consists entirely of DreamNodes that move, all visual behavior flows through orchestrated position changes.

3. **Plugin Infrastructure** - Services and commands that interface with Obsidian, providing the bridge between our React/R3F canvas and the host application.

## Architectural Patterns

### Store as Universal Communication Bus

The store's `spatialLayout` is the single source of truth for what mode the UI is in:

```
spatialLayout: 'constellation' | 'liminal-web' | 'copilot' | 'edit' | 'search' | 'creation'
```

This single value determines:
- How clicks on DreamNodes are interpreted
- How keyboard shortcuts behave (Option key shows radial buttons vs search results)
- How the SpatialOrchestrator positions nodes
- What UI overlays are visible

**Features declare intent** by calling `setSpatialLayout()`. **Core reacts** by rendering appropriate behaviors. This creates clean separation: features don't need to know about each other's existence.

### Commands-First Development

Obsidian commands are the fundamental interface between frontend and backend:

1. **Build the command first** - Implement logic as an Obsidian command
2. **Iterate on the command** - Test via command palette
3. **Bind to UI** - Connect user interactions (clicks, buttons) to command execution

This pattern ensures every action is testable via command palette and creates a clear boundary between "what happens" (command logic) and "how it's triggered" (UI binding).

### DreamspaceCanvas and SpatialOrchestrator

These two components divide the 3D rendering responsibilities:

**DreamspaceCanvas** - The "what": Owns the React Three Fiber canvas, renders all DreamNodes, handles user input events (clicks, drags, keyboard), and mounts overlay components.

**SpatialOrchestrator** - The "where": Holds refs to all DreamNode3D instances, calculates target positions for each layout mode, and animates nodes between positions.

The flow:
```
User interaction → Canvas handles event → Store updates → Orchestrator reacts → Nodes animate
```

Layout modes the orchestrator manages:
- **Constellation**: Fibonacci sphere distribution of all nodes
- **Liminal-web**: Selected node centered, related nodes in rings
- **Copilot**: Conversation partner centered, search results at periphery
- **Edit/Search/Creation**: Context-specific overlays with specialized arrangements

Features interact with the orchestrator through its public API, never by directly manipulating node positions.

### Dependency Direction

```
Features → Core → Obsidian/React
```

- Features depend on core (import store, services, orchestrator)
- Core does NOT depend on features (except slice composition in the store)
- This allows features to be developed independently

## Directory Structure

```
core/
├── commands/         # Plugin command registrations
├── components/       # React/R3F canvas infrastructure
├── context/          # React context providers (OrchestratorContext)
├── hooks/            # Shared React hooks (Escape key, Option key handlers)
├── layout/           # Fundamental positioning algorithms (ring layout)
├── services/         # Plugin-level services
├── store/            # Zustand store with slice composition
├── test-utils/       # Test infrastructure and mocks
└── types/            # TypeScript declarations
```

## Key Components

### Store (`store/interbrain-store.ts`)
Zustand store with slice composition pattern. Core state includes:
- `realNodes` - Map of all DreamNode data
- `spatialLayout` - Active view mode (`constellation`, `liminal-web`, `search`, etc.)
- `camera` - 3D camera position/target
- `layoutTransition` - Animation state between layouts
- `debugFlyingControls` - Camera debug flag

Feature slices are composed in via `createXxxSlice()` pattern.

### DreamspaceCanvas (`components/DreamspaceCanvas.tsx`)
Main React Three Fiber canvas (~680 lines). Handles:
- 3D scene rendering with all DreamNodes
- Drag-and-drop events (logic delegated to `features/drag-and-drop`)
- Keyboard navigation via extracted hooks
- Layout mode switching coordination
- Mounting overlay components for each mode

### SpatialOrchestrator (`components/SpatialOrchestrator.tsx`)
Central hub for spatial layout management (~935 lines):
- Manages DreamNode3D refs for position orchestration
- Uses `ring-layout` algorithm for honeycomb positioning
- Helper functions for common operations (moveNode, returnNodeToConstellation)
- Interrupt-capable animations (mid-flight direction changes)
- Coordinates edit mode and copilot mode search layouts

### DreamspaceView (`components/DreamspaceView.ts`)
Obsidian ItemView wrapper that mounts the React canvas.

## Services

### ServiceManager (`services/service-manager.ts`)
Central service registry. Provides access to:
- `DreamNodeService` - Node CRUD operations
- `VaultService` - File system operations
- `CanvasParserService` - Canvas file parsing
- `LeafManagerService` - Obsidian workspace leaves
- `IndexingService` - Semantic search indexing
- `RadicleService` - P2P collaboration

### LeafManagerService (`services/leaf-manager-service.ts`)
Manages Obsidian workspace leaves for content viewing:
- 50/50 split layout (DreamSpace left, content right)
- Tab stacking for multiple open nodes
- Copilot mode overlay handling
- Cleanup on leaf close

### VaultService (`services/vault-service.ts`)
Thin wrapper for Node.js fs operations with vault path resolution.

### UIService (`services/ui-service.ts`)
Obsidian Notice/Modal wrappers for user feedback.

## Layout Algorithms

### Ring Layout (`layout/ring-layout.ts`)
Pure algorithm that converts an ordered list of nodes into honeycomb positions:

```typescript
calculateRingPositions(
  orderedNodes: Array<{ id: string }>,
  allNodeIds: string[],
  centerNodeId?: string,
  config?: RingLayoutConfig
): RingLayoutPositions
```

This is the fundamental positioning pattern used by the SpatialOrchestrator for liminal-web, edit mode, and copilot layouts. It distributes nodes across three concentric rings:
- **Ring 1**: 6 slots, closest to camera (Z = -100)
- **Ring 2**: 12 slots, middle distance (Z = -200)
- **Ring 3**: 18 slots, furthest (Z = -300)

The algorithm is stateless and testable - features pass ordered nodes, core returns positions.

## Hooks

### useEscapeKeyHandler
Manages the escape key hierarchy across modes:
1. Copilot mode → exit to liminal-web
2. Edit mode → exit to liminal-web
3. Search mode → exit to constellation
4. Liminal-web → exit to constellation

### useOptionKeyHandlers
Two hooks for Option key behavior:
- `useCopilotOptionKeyHandler` - Toggle search results visibility in copilot mode
- `useLiminalWebOptionKeyHandler` - Toggle radial button ring in liminal-web mode

## Commands

### camera-commands.ts
- `toggle-debug-flying-controls` - Enable/disable flying camera
- `camera-reset` - Reset camera to origin

## Test Utilities

### `test-utils/mocks/obsidian.ts`
Mock implementations of Obsidian API for testing.

### `test-utils/setup.ts`
Vitest setup with global mocks.

## Exports

The main barrel (`index.ts`) exports:
- Store and all state types
- DreamspaceView and DreamspaceCanvas
- All core services
- Camera commands
- Re-exports from `dreamnode` and `dreamweaving` features for convenience

## Notes for AI Agents

- Core should remain minimal - resist adding feature-specific code here
- The store composes feature slices but owns only fundamental state
- ServiceManager is the main integration point for plugin services
- SpatialOrchestrator manages all node positioning - features should use its API
- When adding new layout modes, use the `ring-layout` algorithm as the foundation
- Extract feature-specific logic to feature slices (see `drag-and-drop/drop-handlers.ts` as example)

## Refactoring Log

### Phase 2 Refactoring (December 2024)
- **SpatialOrchestrator**: 1237 → 935 lines (24% reduction)
  - Extracted helper functions (moveNode, returnNodeToConstellation, etc.)
  - Unified interrupt-capable movement (removed legacy interruptAndXxx variants)
- **DreamspaceCanvas**: 1156 → 679 lines (41% reduction)
  - Extracted drop handlers to `features/drag-and-drop/drop-handlers.ts`
  - Extracted openNodeContent to `features/conversational-copilot/utils/`
  - Removed unused handleNodeDoubleClick stub
- **Ring Layout**: Extracted from liminal-web feature to `core/layout/ring-layout.ts`
  - Pure function with comprehensive test coverage (17 tests)
