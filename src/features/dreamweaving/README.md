# Dreamweaving Feature

Canvas-to-DreamSong transformation system with git submodule management for DreamNode composition.

## Purpose

Transforms Obsidian canvas files into linear "DreamSong" story flows by analyzing dependencies, importing external DreamNodes as git submodules, and rendering content blocks with flip-flop media-text layouts.

## Key Files

### Core Components
- **`DreamSong.tsx`** - Pure canvas content renderer (browser-safe, no Node.js deps)
- **`DreamSongWithExtensions.tsx`** - Wrapper adding Perspectives, Conversations, README sections (Obsidian-only)
- **`DreamSongFullScreenView.ts`** - Fullscreen leaf view for DreamSongs
- **`LinkFileView.ts`** - Custom view for `.link` files (YouTube thumbnails, etc.)
- **`ReadmeSection.tsx`** - Displays DreamNode README.md in DreamSong UI

### Commands
- **`commands.ts`** - 9 main commands (Create DreamSong, Sync Canvas Submodules, Auto-layout, etc.)
- **`link-file-commands.ts`** - Commands for `.link` file suggestions in canvas

### Services
- **`services/canvas-parser-service.ts`** - Parse canvas JSON, find DreamNode boundaries, analyze dependencies
- **`services/submodule-manager-service.ts`** - Import/sync git submodules using Radicle URLs, bidirectional .udd relationship tracking
- **`services/canvas-layout-service.ts`** - Auto-layout canvas nodes in top-to-bottom flow
- **`services/canvas-observer-service.ts`** - Watch for canvas file changes
- **`services/audio-streaming-service.ts`** - Stream audio from submodule files

### Data Layer
- **`dreamweaving-slice.ts`** - Zustand store slice for DreamSong cache and scroll position
- **`types/dreamsong.ts`** - TypeScript interfaces for DreamSong blocks, media, parsing config
- **`dreamsong/`** - Parser utilities (hasher, media resolver, topological sort)
- **`dreamsong-parser-service.ts`** - Core DreamSong data generation from canvas
- **`dreamsong-relationship-service.ts`** - Track DreamNode relationships via canvas links

### Hooks
- **`useDreamSongData.ts`** - React hook for loading/caching DreamSong data

## Main Exports

```typescript
// State
export { createDreamweavingSlice } from './dreamweaving-slice'
export { useDreamSongData } from './useDreamSongData'

// Commands
export { registerDreamweavingCommands } from './commands'
export { registerLinkFileCommands } from './link-file-commands'

// Components
export { DreamSong } from './DreamSong'
export { DreamSongWithExtensions } from './DreamSongWithExtensions'
export { ReadmeSection } from './ReadmeSection'

// Views
export { DreamSongFullScreenView, DREAMSONG_FULLSCREEN_VIEW_TYPE } from './DreamSongFullScreenView'
export { LinkFileView, LINK_FILE_VIEW_TYPE } from './LinkFileView'

// Types
export * from './types/dreamsong'
```

## Key Commands (Ctrl/Cmd+P)

- **Create DreamSong Canvas** (`Ctrl+D`) - Creates `DreamSong.canvas` in selected DreamNode
- **Sync Canvas Submodules** (`Ctrl+Shift+S`) - Import external dependencies as git submodules with Radicle URLs
- **Auto-layout Canvas** - Arrange canvas nodes in linear flow
- **Parse Canvas Dependencies** - Debug command for dependency analysis
- **Commit All Changes** - Recursively commit all changes in DreamNode + submodules
- **Remove All Submodules** - Cleanup command for development

## Architecture Notes

### Git Submodule Workflow
1. **Canvas Analysis** - Detect external DreamNode references via canvas file nodes
2. **Submodule Import** - Add external DreamNodes as git submodules using `rad://...` URLs from Radicle
3. **Bidirectional Tracking** - Update `.udd` files: parent tracks children (submodules), children track parents (supermodules)
4. **Coherence Beacons** - Commit messages with `COHERENCE_BEACON` metadata for network discovery
5. **Path Rewriting** - Update canvas file paths to point to submodule locations

### DreamSong Rendering
1. **Topological Sort** - Order canvas nodes based on edge dependencies (directed graph)
2. **Media-Text Pairing** - Detect media+text pairs connected by edges
3. **Flip-Flop Layout** - Alternate left/right alignment for media-text blocks
4. **Browser-Safe** - `DreamSong.tsx` has ZERO Node.js dependencies (works in GitHub Pages)

### Coherence Beacon System (Foundation)
- **Purpose**: Enable decentralized DreamNode discovery across network
- **Implementation**: Git commits with `COHERENCE_BEACON: {...}` metadata
- **Workflow**:
  - Submodule sync creates beacon commits in sovereign repos
  - "Check for Updates" command scans commit history for beacons
  - Beacons contain Radicle IDs for network-based DreamNode relationships

## Flags

### Potential Issues
- **Heavy git operations** - Commands like "Commit All DreamNodes" can be slow
- **Radicle PATH handling** - Requires `~/.radicle/bin` in PATH for `git-remote-rad` helper
- **Submodule complexity** - Bidirectional relationship tracking can fail partway through (has idempotent recovery)

### Unused/Dead Code
- **Canvas Observer Service** - Created but not actively used (file watching infrastructure for future)

### Migration Notes
- **Songline extraction** - AudioClipPlayer, ConversationsSection, PerspectivesSection moved to `features/songline/` (see comment in index.ts)
- **DreamSong vs DreamSongWithExtensions** - Split browser-safe vs Obsidian-specific rendering

## Related Features
- **dreamnode** - DreamNode CRUD operations, git integration
- **songline** - Audio clips, conversations, perspectives (extracted from dreamweaving)
- **social-resonance** - Radicle integration for submodule URLs
- **drag-and-drop** - .link file metadata handling
