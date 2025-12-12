# DreamNode Feature

**Purpose**: Core DreamNode management - the fundamental unit of InterBrain's spatial knowledge representation.

## Overview

DreamNodes are git-backed repositories representing either ideas (Dreams) or people (Dreamers). This feature owns their complete lifecycle: types, state, persistence, git operations, and 3D visualization.

**Derivative features** build on this foundation:
- `dreamnode-creator/` - Creation workflow UI
- `dreamnode-editor/` - Editing workflow UI

## Directory Structure

```
dreamnode/
├── store/
│   └── slice.ts              # Zustand state (dreamNodes Map, flip state)
├── types/
│   └── dreamnode.ts          # Core interfaces (DreamNode, UDDFile, GitStatus, etc.)
├── services/
│   ├── git-dreamnode-service.ts   # CRUD orchestrator with git + store sync
│   ├── udd-service.ts             # .udd file read/write
│   ├── media-loading-service.ts   # Lazy media loading by camera distance
│   └── dreamnode-conversion-service.ts # Convert existing folders to DreamNodes
├── utils/
│   ├── git-utils.ts          # Stateless git commands (status, stash, commit)
│   ├── vault-scanner.ts      # Filesystem discovery (scan, validate, read)
│   ├── repo-initializer.ts   # Repository creation (init, template, commit)
│   ├── title-sanitization.ts # Title → PascalCase folder name
│   └── git-operations.ts     # Legacy class (deprecated)
├── components/
│   ├── DreamNode3D.tsx       # Main 3D component with flip animations
│   ├── DreamTalkSide.tsx     # Front face (symbolic media)
│   ├── DreamSongSide.tsx     # Back face (canvas content)
│   └── PDFPreview.tsx        # PDF rendering
├── styles/
│   ├── dreamNodeStyles.ts    # Colors, dimensions, glows
│   └── dreamNodeAnimations.css
├── DreamNode-template/       # Git template for new DreamNode repos
│   ├── hooks/                # Git hooks (pre-commit, post-commit)
│   ├── udd                   # Template .udd file
│   ├── LICENSE               # AGPL license
│   └── README.md             # Template README
├── commands.ts               # Obsidian command palette (flip, fullscreen)
├── test-utils.ts             # Mock factories for testing
├── index.ts                  # Barrel export
└── README.md
```

## Main Exports

```typescript
// Store (state management)
export * from './store/slice';
// → DreamNodeSlice, DreamNodeData, createDreamNodeSlice

// Types
export * from './types/dreamnode';
// → DreamNode, UDDFile, MediaFile, CanvasFile, GitStatus

// Services
export { GitDreamNodeService } from './services/git-dreamnode-service';
export { UDDService } from './services/udd-service';
export { MediaLoadingService, getMediaLoadingService } from './services/media-loading-service';

// Utilities (namespaced)
export * as gitUtils from './utils/git-utils';
export * as vaultScanner from './utils/vault-scanner';
export * as repoInitializer from './utils/repo-initializer';
export { sanitizeTitleToPascalCase } from './utils/title-sanitization';

// Components
export { default as DreamNode3D } from './components/DreamNode3D';
export type { DreamNode3DRef } from './components/DreamNode3D';
export { DreamTalkSide } from './components/DreamTalkSide';
export { DreamSongSide } from './components/DreamSongSide';

// Commands
export { registerDreamNodeCommands } from './commands';
```

## Commands

| Command | Hotkey | Description |
|---------|--------|-------------|
| Flip Selected DreamNode | `Ctrl+J` | Toggle between DreamTalk and DreamSong |
| Flip DreamNode to Front | - | Show DreamTalk side |
| Flip DreamNode to Back | - | Show DreamSong side |
| Open DreamTalk Full-Screen | - | Full-screen DreamTalk media |
| Open DreamSong Full-Screen | - | Open DreamSong in Obsidian tab |
| Reveal Containing DreamNode | - | Focus DreamNode containing current file |
| Convert Folder to DreamNode | - | Initialize folder as DreamNode repository |

## Architecture

### Two-Tier Type System

| Layer | Type | Purpose |
|-------|------|---------|
| Disk | `UDDFile` | JSON persisted in `.udd` file |
| Runtime | `DreamNode` | Includes resolved media, position, connections |

### Service vs Utility Pattern

**Services** (stateful orchestrators):
- `GitDreamNodeService` - Coordinates git operations + store updates
- `MediaLoadingService` - Singleton with camera-distance loading queue

**Utilities** (stateless functions):
- `gitUtils.*` - Pure git command wrappers
- `vaultScanner.*` - Pure filesystem discovery
- `repoInitializer.*` - Pure repo creation steps

### Git-Native Storage

- Each DreamNode = git repository in vault root
- `.udd` file = single JSON with all metadata (UUID, title, type, relationships)
- `DreamNode-template/` provides hooks for bidirectional relationship tracking
- Git hooks maintain `submodules` ↔ `supermodules` consistency

### Relationship Storage

| Node Type | Storage | Reason |
|-----------|---------|--------|
| Dreamer | `liminal-web.json` (gitignored) | Private social connections |
| Dream | Discovered via git submodules | Bidirectional during vault scan |

### Visual Git State

| Glow | Meaning |
|------|---------|
| Red | Uncommitted or stashed (work-in-progress) |
| Blue | Committed but unpushed (ready to share) |
| None | Clean and synchronized |

## Notes

- **Media loading**: Eager metadata, lazy data (by camera distance)
- **Radicle failures**: Don't block node creation (graceful degradation)
- **Legacy `git-operations.ts`**: Deprecated, use `gitUtils` namespace
- **⚠️ Creator Mode**: DEPRECATED - The `creatorMode` state in the store slice is leftover from an early UX experiment and will be removed in a future update. Do not build new features on this pattern.
