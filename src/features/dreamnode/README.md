# DreamNode Feature

**Purpose**: Core DreamNode management system - the fundamental unit of InterBrain's spatial knowledge representation.

## Overview

DreamNodes are git-backed repositories representing either ideas (Dreams) or people (Dreamers). This feature handles their creation, visualization, manipulation, and persistence through both in-memory state (Zustand) and git operations.

## Key Files

### Types & Data Structures
- **`types/dreamnode.ts`** - Core TypeScript interfaces: `DreamNode`, `UDDFile` (Universal Dream Description), `MediaFile`, `CanvasFile`, `GitStatus`, `ObsidianCanvasData`

### State Management
- **`store/slice.ts`** - Zustand slice owning DreamNode data and UI state:
  - `dreamNodes` - The canonical Map of all DreamNode data (moved from core store)
  - Flip animations, creator mode UI state
- **`index.ts`** - Barrel export for all feature exports

### Services (Orchestrators with State)
- **`services/git-dreamnode-service.ts`** - Git-backed CRUD operations (create/read/update/delete nodes)
  - Orchestrates utilities for git, vault scanning, repo initialization
  - Handles store synchronization
  - Radicle P2P initialization
  - Bidirectional relationship management (liminal web connections)
- **`services/udd-service.ts`** - Lightweight read/write for `.udd` files (metadata persistence)
- **`services/media-loading-service.ts`** - Lazy-loading service for DreamTalk media (loads by distance from camera)

### Utilities (Stateless Functions)
- **`utils/git-utils.ts`** - Stateless git command wrappers
  - `getGitStatus(repoPath)` - Get comprehensive git status
  - `stashChanges(repoPath)`, `popStash(repoPath)` - Stash operations
  - `commitAllChanges(repoPath, message)` - Commit operations
  - `initRepo(repoPath, templatePath)` - Repository initialization
  - `openInFinder(repoPath)`, `openInTerminal(repoPath)` - Shell operations
- **`utils/vault-scanner.ts`** - Filesystem discovery utilities
  - `discoverDreamNodes(vaultPath)` - Scan vault for DreamNodes
  - `isValidDreamNode(dirPath)` - Validate DreamNode directory
  - `readUDD(dirPath)`, `readLiminalWeb(dirPath)` - Read metadata files
  - `discoverDreamTalkMedia(dirPath, filename)` - Discover media files
- **`utils/repo-initializer.ts`** - Repository creation utilities
  - `createRepoDirectory(repoPath)` - Create directory
  - `initGitWithTemplate(repoPath, templatePath)` - Initialize git
  - `processUDDTemplate(repoPath, config)` - Process template placeholders
  - `moveTemplateFiles(repoPath)` - Move files from .git to working dir
  - `setupDreamerNode(repoPath)` - Create dreamer-specific files
  - `makeInitialCommit(repoPath, title)` - Make initial commit
- **`utils/title-sanitization.ts`** - Convert titles to PascalCase for folder names
- **`utils/git-operations.ts`** - Legacy class (deprecated, use git-utils)

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
- `DreamNodeData` - Node data with sync metadata (from store/slice)

### Services (Orchestrators)
- `GitDreamNodeService` - Git-backed DreamNode CRUD + store sync
- `UDDService` - .udd file operations
- `MediaLoadingService` + `getMediaLoadingService()` - Lazy media loading

### Utilities (Stateless Functions)
- `gitUtils` namespace - All git operations (`getGitStatus`, `stashChanges`, etc.)
- `vaultScanner` namespace - Discovery functions (`discoverDreamNodes`, etc.)
- `repoInitializer` namespace - Repo creation (`createRepoDirectory`, etc.)
- `sanitizeTitleToPascalCase()` - Title cleaning
- `GitOperationsService` - Legacy class (deprecated)

### Components
- `DreamNode3D` (+ `DreamNode3DRef` type)
- `DreamTalkSide`, `DreamSongSide`, `PDFPreview`

### State & Commands
- `store/slice` exports (Zustand slice with dreamNodes state)
- `registerDreamNodeCommands()` - Command registration function

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
