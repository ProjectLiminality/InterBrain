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
Main React Three Fiber canvas. Handles:
- 3D scene rendering with all DreamNodes
- Drag-and-drop for file/URL creation
- Keyboard navigation (Escape hierarchy)
- Layout mode switching coordination
- Proto-node and search-node rendering

### SpatialOrchestrator (`components/SpatialOrchestrator.tsx`)
Central hub for spatial layout management:
- Manages DreamNode3D refs for position orchestration
- Calculates and applies ring/honeycomb layouts
- Handles transitions between constellation and liminal-web
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
- DreamspaceCanvas is large (~1600 lines) but well-organized by functionality
