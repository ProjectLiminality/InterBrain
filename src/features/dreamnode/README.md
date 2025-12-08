# DreamNode Feature

**Purpose**: Core DreamNode management system - the fundamental unit of InterBrain's spatial knowledge representation.

## Overview

DreamNodes are git-backed repositories representing either ideas (Dreams) or people (Dreamers). This feature handles their creation, visualization, manipulation, and persistence through both in-memory state (Zustand) and git operations.

## Key Files

### Types & Data Structures
- **`types/dreamnode.ts`** - Core TypeScript interfaces: `DreamNode`, `UDDFile` (Universal Dream Description), `MediaFile`, `CanvasFile`, `GitStatus`, `ObsidianCanvasData`

### State Management
- **`dreamnode-slice.ts`** - Zustand slice for DreamNode UI state (flip animations, creator mode)
- **`index.ts`** - Barrel export for all feature exports

### Services (Business Logic)
- **`services/dreamnode-service.ts`** - Base service for node selection, layout management, camera control
- **`services/git-dreamnode-service.ts`** - Real git-backed CRUD operations (create/read/update/delete nodes)
  - Handles git repository creation with template
  - Vault scanning for existing nodes
  - Radicle P2P initialization
  - Bidirectional relationship management (liminal web connections)
  - Git status checking (uncommitted/stashed/unpushed changes)
- **`services/udd-service.ts`** - Lightweight read/write for `.udd` files (metadata persistence)
- **`services/git-operations.ts`** - Low-level git command utilities
- **`services/git-template-service.ts`** - DreamNode template initialization and hook setup
- **`services/media-loading-service.ts`** - Lazy-loading service for DreamTalk media (loads by distance from camera)

### 3D Visualization Components
- **`components/DreamNode3D.tsx`** - Main 3D component with Billboard → RotatableGroup → [DreamTalk, DreamSong] hierarchy
  - Implements Universal Movement API (`DreamNode3DRef`) for animations
  - Dynamic view scaling based on distance from camera
  - Flip animations between front (DreamTalk) and back (DreamSong)
- **`components/DreamTalkSide.tsx`** - Front face displaying symbolic media (images, videos, PDFs, .link files)
- **`components/DreamSongSide.tsx`** - Back face displaying detailed canvas content blocks
- **`components/PDFPreview.tsx`** - PDF rendering for DreamTalk media
- **`styles/dreamNodeStyles.ts`** - Shared style constants (colors, dimensions, glows)
- **`styles/dreamNodeAnimations.css`** - CSS animations for flip transitions

### Commands
- **`commands.ts`** - Obsidian command palette integrations:
  - Flip animations (toggle, to-front, to-back)
  - Full-screen views (DreamTalk, DreamSong)

### Utilities
- **`utils/title-sanitization.ts`** - Convert titles to PascalCase for folder names
- **`test-utils.ts`** - Mock factories for testing

## Main Exports

### Types
- `DreamNode`, `UDDFile`, `MediaFile`, `CanvasFile`, `GitStatus`, `ObsidianCanvasData`

### Services
- `DreamNodeService` - Base service
- `GitDreamNodeService` - Git-backed implementation
- `UDDService` - .udd file operations
- `GitOperationsService`, `GitTemplateService`
- `MediaLoadingService` + `getMediaLoadingService()`

### Components
- `DreamNode3D` (+ `DreamNode3DRef` type)
- `DreamTalkSide`, `DreamSongSide`, `PDFPreview`

### State & Commands
- `dreamnode-slice` exports (Zustand slice creator)
- `registerDreamNodeCommands()` - Command registration function

### Utilities
- `sanitizeTitleToPascalCase()` - Title cleaning

## Architecture Notes

### Git-Native Storage
- Each DreamNode is a git repository in the vault root
- `.udd` file contains metadata (UUID, title, type, relationships)
- `DreamNode-template/` provides initial structure (hooks, README, LICENSE)
- Git hooks handle bidirectional relationship tracking (submodules ↔ supermodules)

### Two-Tier Type System
- **`UDDFile`** - Disk representation (persisted as JSON in `.udd`)
- **`DreamNode`** - Runtime representation (includes resolved media, position, connections)

### Relationship Storage
- **Dreamer nodes**: Store relationships in `liminal-web.json` (excluded from git via .gitignore)
- **Dream nodes**: Relationships discovered bidirectionally during vault scan (no storage needed)

### Media Loading Strategy
- **Eager**: Metadata only (path, size, type)
- **Lazy**: Actual media data loaded on-demand by `MediaLoadingService` based on camera distance
- Prevents memory bloat on large vaults

### Git Status Visual Indicators
- **Red glow**: Uncommitted or stashed changes (work-in-progress)
- **Blue glow**: Committed but unpushed (ready to share)
- **No glow**: Clean and synchronized

## Flags & Issues

### Potential Cleanup
- **`test-utils.ts`** - Only used in tests, could move to test directory
- **`PDFPreview.tsx`** - Could be extracted to shared components if needed by other features

### Known Limitations
- No unit tests for `VaultService` operations (deliberate - relies on integration tests)
- Radicle initialization failures don't block node creation (graceful degradation)
- Folder renames on node updates check for collisions but don't handle edge cases perfectly

### Dependencies
- Requires Node.js modules: `fs`, `path`, `crypto`, `child_process`
- Obsidian Plugin API for vault access
- React Three Fiber for 3D rendering
- Zustand for state management
