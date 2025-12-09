# Core Module

The foundational infrastructure that all features build upon. **Core defines *how* things work; features define *what* things do.**

## Feature Slices

Core provides the foundation for these feature modules:

| Feature | Purpose |
|---------|---------|
| [dreamnode](../features/dreamnode/README.md) | DreamNode data types, services, and CRUD operations |
| [dreamweaving](../features/dreamweaving/README.md) | Canvas parsing, submodules, DreamSong playback |
| [constellation-layout](../features/constellation-layout/README.md) | Fibonacci sphere distribution of all nodes |
| [liminal-web-layout](../features/liminal-web-layout/README.md) | Focused node with related nodes in rings |
| [conversational-copilot](../features/conversational-copilot/README.md) | AI conversation mode with node invocation |
| [edit-mode](../features/edit-mode/README.md) | Node editing with relationship management |
| [search](../features/search/README.md) | Search overlay and result display |
| [semantic-search](../features/semantic-search/README.md) | Vector embeddings and similarity search |
| [creation](../features/creation/README.md) | ProtoNode3D for new node creation |
| [drag-and-drop](../features/drag-and-drop/README.md) | File and URL drop handling |
| [radial-buttons](../features/radial-buttons/README.md) | Radial action menu around nodes |
| [realtime-transcription](../features/realtime-transcription/README.md) | Voice transcription via Python backend |
| [social-resonance](../features/social-resonance/README.md) | Radicle P2P integration |
| [coherence-beacon](../features/coherence-beacon/README.md) | Node synchronization beacons |
| [video-calling](../features/video-calling/README.md) | WebRTC video call integration |
| [web-link-analyzer](../features/web-link-analyzer/README.md) | AI-powered URL content analysis |
| [github-publishing](../features/github-publishing/README.md) | Publish nodes to GitHub |
| [settings](../features/settings/README.md) | Plugin settings tab |
| [updates](../features/updates/README.md) | Plugin update checking |
| [uri-handler](../features/uri-handler/README.md) | interbrain:// protocol handling |
| [songline](../features/songline/README.md) | Songline navigation feature |

## Core Principles

### 1. All Vault Access Through VaultService

**Features MUST NOT make direct `fs` calls.** All file system operations go through `VaultService`:

```typescript
// WRONG - direct fs in feature code
import fs from 'fs';
fs.readFileSync(path);

// RIGHT - use VaultService
const vaultService = serviceManager.getVaultService();
await vaultService.readFile(relativePath);
```

VaultService handles vault path resolution and provides a consistent interface. Core owns the vault communication boundary.

### 2. Store as Communication Bus

Features declare intent via store state; core reacts. The `spatialLayout` value drives all UI behavior:

```
spatialLayout: 'constellation' | 'liminal-web' | 'copilot' | 'edit' | 'search' | 'creation'
```

Features call `setSpatialLayout()`. They don't need to know about each other.

### 3. Dependency Direction

```
Features → Core → Obsidian/React
```

- Features import from core
- Core does NOT import from features (except slice composition)

## Quick Reference

| Need to... | Use... |
|------------|--------|
| Read/write files | `serviceManager.getVaultService()` |
| CRUD DreamNodes | `serviceManager.getActive()` |
| Open content in leaves | `serviceManager.getLeafManagerService()` |
| Position nodes in 3D | `SpatialOrchestrator` via context |
| Show user feedback | `UIService` |
| Access store state | `useInterBrainStore()` |

## Directory Map

```
core/
├── store/          → Zustand store + slice composition
├── components/     → DreamspaceCanvas, SpatialOrchestrator, DreamspaceView
├── services/       → VaultService, LeafManagerService, UIService, ServiceManager
├── layout/         → ring-layout algorithm (pure function)
├── hooks/          → useEscapeKeyHandler, useOptionKeyHandlers
├── context/        → OrchestratorContext (spatial orchestrator ref)
├── commands/       → camera-commands
├── test-utils/     → Obsidian mocks, Vitest setup
└── types/          → TypeScript declarations
```

## Key Files

**Store**: `store/interbrain-store.ts` - Zustand with slice composition. Core owns `realNodes`, `spatialLayout`, `camera`, `layoutTransition`.

**Canvas**: `components/DreamspaceCanvas.tsx` (~670 lines) - R3F canvas, user input, overlay mounting. Delegates drop logic to `features/drag-and-drop`.

**Orchestrator**: `components/SpatialOrchestrator.tsx` (~935 lines) - Node positioning, layout animations, interrupt-capable movement.

**Ring Layout**: `layout/ring-layout.ts` - Pure algorithm for honeycomb positioning. 3 rings (6/12/18 slots). Used by liminal-web, edit, copilot modes.

## Services

**ServiceManager** (`services/service-manager.ts`) - Central registry. Initialize with plugin, then access all services.

**VaultService** (`services/vault-service.ts`) - Thin fs wrapper with path resolution. All vault file operations go here.

**LeafManagerService** (`services/leaf-manager-service.ts`) - Obsidian workspace leaves, 50/50 splits, tab stacking.

**UIService** (`services/ui-service.ts`) - Notices, modals, user prompts.

## For AI Agents

When working in features:
1. **Never import `fs` directly** - use VaultService
2. **Never manipulate node positions directly** - use SpatialOrchestrator API
3. **Declare intent via store** - don't reach into other features
4. **Extract feature logic from core** - if it's feature-specific, it belongs in `features/`

When working in core:
1. Keep it minimal - resist feature-specific code
2. New layout modes should use `ring-layout` as foundation
3. Test pure logic (ring-layout has 17 tests)
