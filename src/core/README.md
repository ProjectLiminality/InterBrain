# Core Module

The Obsidian plugin infrastructure layer. Contains foundational services, components, and state management that features build upon.

## Purpose

Core provides the minimal foundational layer that is too close to the Obsidian plugin architecture to extract into a standalone feature. Features depend on core, but core should not depend on features (except through the store's slice composition).

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
