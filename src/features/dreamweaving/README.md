# Dreamweaving Feature

**Purpose**: Transforms Obsidian canvas files into linear DreamSong story flows and manages git submodule relationships between DreamNodes, enabling compositional knowledge weaving through canvas-based storytelling.

## Directory Structure

```
dreamweaving/
├── store/
│   └── slice.ts                    # Zustand slice (cache, scroll position, relationship state)
├── components/
│   ├── DreamSong.tsx               # Pure React renderer for DreamSong content (browser-safe)
│   ├── DreamSongWithExtensions.tsx # Wrapper with Obsidian-only extensions (perspectives, conversations)
│   ├── DreamSongFullScreenView.ts  # Obsidian ItemView for fullscreen DreamSong display
│   ├── LinkFileView.ts             # Custom view for .link files with YouTube thumbnails
│   └── ReadmeSection.tsx           # Clickable README link in DreamSong UI
├── hooks/
│   └── useDreamSongData.ts         # React hook with hash-based change detection
├── services/
│   ├── audio-streaming-service.ts  # Load audio files as base64 data URLs
│   ├── canvas-layout-service.ts    # Auto-arrange canvas elements in linear flow
│   ├── canvas-observer-service.ts  # MutationObserver for .link file thumbnail replacement
│   ├── canvas-parser-service.ts    # Parse canvas JSON, find DreamNode boundaries
│   ├── canvas-parser-service.test.ts
│   ├── dreamsong-parser-service.ts # L1/L2 caching parser (used by relationship extraction)
│   ├── dreamsong-relationship-service.ts # Extract relationship graphs from DreamSong sequences
│   ├── submodule-manager-service.ts # Git submodule operations with bidirectional tracking
│   └── submodule-manager-service.test.ts
├── dreamsong/                      # Pure parsing functions (Layer 1 architecture)
│   ├── parser.ts                   # Canvas → blocks transformation, topological sort
│   ├── hasher.ts                   # Structure hash generation for change detection
│   ├── media-resolver.ts           # Resolve media paths to data URLs
│   └── index.ts                    # Barrel export with convenience functions
├── types/
│   ├── dreamsong.ts                # DreamSong blocks, media, parsing types
│   └── relationship.ts             # Relationship graph types (source of truth for constellation-layout)
├── styles/
│   └── dreamsong.module.css        # DreamSong component styles
├── assets/
│   └── Separator.png               # Visual separator for DreamSong sections
├── commands.ts                     # All Obsidian commands (canvas, submodule, sync, layout, link files)
├── index.ts                        # Barrel export
└── README.md
```

## Main Exports

```typescript
// Store (state management)
export { createDreamweavingSlice, DreamweavingSlice, ... } from './store/slice';

// Commands (includes link file commands)
export { registerDreamweavingCommands, registerLinkFileCommands, enhanceFileSuggestions } from './commands';

// Types
export * from './types/dreamsong';
export * from './types/relationship';

// Services
export { DreamSongRelationshipService } from './services/dreamsong-relationship-service';
export { DreamSongParserService } from './services/dreamsong-parser-service';
export { CanvasParserService } from './services/canvas-parser-service';
export { CanvasLayoutService } from './services/canvas-layout-service';
export { SubmoduleManagerService } from './services/submodule-manager-service';
export { CanvasObserverService } from './services/canvas-observer-service';
export { AudioStreamingServiceImpl, initializeAudioStreamingService, getAudioStreamingService } from './services/audio-streaming-service';

// Components
export { DreamSong } from './components/DreamSong';
export { DreamSongWithExtensions } from './components/DreamSongWithExtensions';
export { ReadmeSection } from './components/ReadmeSection';

// Views
export { DreamSongFullScreenView, DREAMSONG_FULLSCREEN_VIEW_TYPE } from './components/DreamSongFullScreenView';
export { LinkFileView, LINK_FILE_VIEW_TYPE } from './components/LinkFileView';

// Hooks
export { useDreamSongData, useDreamSongExists } from './hooks/useDreamSongData';

// Pure functions (parser, hasher, media-resolver)
export { parseCanvasToBlocks, parseAndResolveCanvas, resolveMediaPaths, ... } from './dreamsong/index';
```

## Core Concepts

### DreamSong Canvas Transformation
1. **Canvas Parsing**: Extract nodes and edges from Obsidian canvas JSON
2. **Topological Sort**: Order nodes by dependency graph (respecting directed edges)
3. **Media-Text Pairing**: Detect undirected edges linking file nodes to text nodes
4. **Block Creation**: Generate linear DreamSong blocks with flip-flop media-text layout
5. **Media Resolution**: Convert file paths to data URLs for rendering

### Git Submodule Management
1. **Dependency Detection**: Parse canvas for external DreamNode references
2. **Submodule Import**: Add referenced DreamNodes as git submodules via Radicle URLs
3. **Bidirectional Tracking**: Update parent's `submodules` and child's `supermodules` in .udd files
4. **Coherence Beacons**: Commit metadata for network-based relationship discovery

### Relationship Graph (Source of Truth)
Dreamweaving owns the DreamSong relationship data because relationships are created through the act of weaving DreamTalks into DreamSongs on the canvas.

- **constellation-layout** reads this data for visualization
- Stored in `dreamSongRelationships` state in dreamweaving slice
- Serialized/deserialized for persistence in localStorage

## Commands

| Command | Description |
|---------|-------------|
| `create-dreamsong-canvas` | Create DreamSong.canvas in selected DreamNode |
| `commit-dreamsong-changes` | Commit pending changes to selected DreamNode |
| `auto-save-and-commit-dreamsong` | Auto-save with submodule sync |
| `sync-canvas-submodules` | Import/remove submodules based on canvas dependencies |
| `auto-layout-dreamsong-canvas` | Arrange canvas elements in linear flow |
| `scan-dreamsong-relationships` | Scan vault and update relationship graph |
| `open-dreamsong-fullscreen` | Open DreamSong in fullscreen Obsidian view |
| `show-link-files` | Fuzzy search all .link files in vault |
| `add-link-file-to-canvas` | Add .link file to active canvas |

## Architecture Layers

### Layer 1: Pure Functions (`dreamsong/`)
Stateless, easily testable functions:
- `parser.ts`: Canvas → blocks transformation
- `hasher.ts`: Structure hash for change detection
- `media-resolver.ts`: Path → data URL resolution

### Layer 2: React Hook (`hooks/useDreamSongData.ts`)
Minimal state management with hash-based optimization:
- Memoized parsing
- File change watching
- Songline feature detection

### Layer 3: Services (`services/`)
Stateful orchestrators with side effects:
- Canvas parsing and analysis
- Git submodule operations
- Relationship extraction

### Layer 4: Store (`store/slice.ts`)
Zustand state slice for:
- DreamSong cache entries
- Relationship graph state
- Persistence serialization

## Integration Points

- **dreamnode**: Provides UDD service, git operations
- **constellation-layout**: Consumes relationship graph for visualization
- **songline**: Provides perspective/conversation components
- **social-resonance**: Provides RadicleService for submodule URLs
- **drag-and-drop**: Provides .link file parsing utilities

## .link File Rendering Pipeline

InterBrain provides custom rendering for `.link` files (URL bookmarks stored as JSON) across multiple contexts:

### File Format
```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "type": "youtube",
  "title": "Video Title",
  "videoId": "VIDEO_ID",
  "embedUrl": "https://www.youtube.com/embed/VIDEO_ID",
  "thumbnail": "https://img.youtube.com/vi/VIDEO_ID/maxresdefault.jpg",
  "created": "2025-01-01T00:00:00.000Z"
}
```

### Rendering Contexts

| Context | Component | Behavior |
|---------|-----------|----------|
| **Editor View** | `LinkFileView.ts` | Full preview with thumbnail, metadata, and action buttons |
| **Canvas Card** | `CanvasObserverService` | Thumbnail with play button → expands to iframe on click |
| **DreamSong UI** | `DreamSong.tsx` | Embedded YouTube iframe (16:9 aspect ratio) |
| **DreamTalk Node** | `DreamTalkSide.tsx` | Circular thumbnail with play icon overlay |

### Data Flow
```
.link file on disk (JSON)
    ↓
parseLinkFileContent() → LinkFileMetadata
    ↓
Four Rendering Paths:

1. EDITOR VIEW (when .link file is opened in Obsidian)
   → LinkFileView extends TextFileView
   → renderYouTubePreview() / renderWebsitePreview()
   → Click opens URL in browser

2. CANVAS CARD (file node on Obsidian canvas)
   → CanvasObserverService (MutationObserver)
   → Replaces canvas-node-content innerHTML
   → Click play button → replaces with iframe (autoplay)

3. DREAMSONG PLAYBACK (canvas story flow in DreamSong UI)
   → media-resolver.ts resolveLinkFileInfo()
   → DreamSong.tsx renderMediaElement()
   → Embedded iframe with youtube-nocookie.com

4. DREAMTALK THUMBNAIL (3D sphere node front face)
   → DreamTalkSide.tsx MediaRenderer()
   → Circular thumbnail with red play button overlay
   → Click navigates to node
```

### YouTube Embedding Notes
- Uses `youtube-nocookie.com` for privacy-enhanced embedding
- Some videos have embedding disabled by uploaders (shows "Video unavailable")
- Autoplay enabled when expanding from thumbnail on canvas
- 16:9 aspect ratio maintained in DreamSong UI

### Key Files
- `components/LinkFileView.ts` - Obsidian editor view registration
- `services/canvas-observer-service.ts` - Canvas thumbnail replacement
- `dreamsong/media-resolver.ts` - Media path resolution for DreamSong
- `../../drag-and-drop/link-file-utils.ts` - Parsing utilities

## Technical Notes

- **Two Parsing Systems**: `dreamsong/` (pure functions for UI) and `dreamsong-parser-service.ts` (with caching for relationship extraction)
- **macOS Case Sensitivity**: Directory is `dreamsong/` (lowercase) - avoid imports with `DreamSong/`
- **Flip-Flop Layout**: Media-text pairs alternate left/right alignment
- **Hash-Based Updates**: Only re-render when canvas structure actually changes

## Future Improvements

### Image Clusters / Grid Elements
Support undirected edges between multiple media nodes (without text nodes) to create image clusters rendered as grid layouts in DreamSong:

```
Canvas layout:               DreamSong output:
┌───────┐   ┌───────┐       ┌─────────────────┐
│ img1  │───│ img2  │       │ ┌─────┬─────┐   │
└───────┘   └───────┘       │ │img1 │img2 │   │
    │           │           │ ├─────┼─────┤   │
    └─────┬─────┘           │ │img3 │img4 │   │
          │                 │ └─────┴─────┘   │
      ┌───┴───┐             └─────────────────┘
      │       │
┌───────┐ ┌───────┐
│ img3  │─│ img4  │
└───────┘ └───────┘
```

**Implementation approach:**
1. Detect connected components of file nodes linked only by undirected edges
2. Group into cluster if no text nodes are connected
3. Render as responsive CSS grid (auto-fill columns)
4. Maintain aspect ratios, handle mixed media types
