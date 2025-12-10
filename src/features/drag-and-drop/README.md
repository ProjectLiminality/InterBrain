# Drag-and-Drop Feature

Handles file and URL drops into DreamSpace, converting them into DreamNodes with appropriate media files and README content.

## Purpose

Orchestrates drag-and-drop operations in DreamspaceCanvas:
- File drops create DreamNodes with media attachments
- URL drops create DreamNodes with `.link` files and README content
- Supports drop-on-node to add files/URLs to existing DreamNodes
- Command+drop opens the DreamNode creator with pre-filled data

## Architecture

```
drag-and-drop/
├── store/
│   └── slice.ts           # Zustand slice for isDragging state
├── drop-handlers.ts       # Main orchestration (position calculation, target detection)
├── url-utils.ts           # URL validation, metadata extraction, YouTube detection
├── url-readme-utils.ts    # README generation from URLs, .link file writing
├── link-file-utils.ts     # .link file format handling (create, parse, validate)
├── index.ts               # Barrel exports
└── README.md
```

## Key Files

- **`store/slice.ts`**: Zustand slice managing `isDragging` state
- **`drop-handlers.ts`**: Main drop orchestration - 3D position calculation, target detection, handler dispatch
- **`url-utils.ts`**: URL validation, metadata extraction, YouTube detection
- **`url-readme-utils.ts`**: Creates README content and writes .link files to DreamNode repos
- **`link-file-utils.ts`**: .link file format creation, parsing, and validation

## Main Exports

### State Management
- `createDragAndDropSlice`: Zustand slice factory for drag state
- `DragAndDropSlice`: TypeScript interface for drag state

### Drop Handlers
- `calculateDropPosition(mouseX, mouseY, dreamWorldRef)`: Calculate 3D position from screen coordinates
- `detectDropTarget(mouseX, mouseY, hitSphereRefs, dreamWorldRef)`: Find node under drop position
- `handleNormalDrop(files, position, orchestratorRef)`: Create DreamNode from dropped files
- `handleCommandDrop(files)`: Open creator with pre-filled file data
- `handleDropOnNode(files, node)`: Add files to existing DreamNode
- `handleNormalUrlDrop(urlData, position, orchestratorRef)`: Create DreamNode from dropped URL
- `handleCommandUrlDrop(urlData)`: Open creator with pre-filled URL data
- `handleUrlDropOnNode(urlData, node)`: Add URL to existing DreamNode

### URL Processing
- `getUrlMetadata(url)`: Extract metadata from any URL (async, fetches YouTube titles)
- `processDroppedUrlData(data)`: Parse dropped data and extract first valid URL
- `extractYouTubeVideoId(url)`: Detect and extract YouTube video IDs
- `generateYouTubeIframe(videoId)`: Create Obsidian-compatible iframe markup

### URL README Utilities
- `writeLinkFile(vaultService, repoPath, urlMetadata, title)`: Write .link file and return media info
- `createUrlReadmeContent(urlMetadata, title)`: Generate README markdown for URLs
- `appendUrlToReadme(vaultService, repoPath, urlMetadata)`: Add URL to existing README
- `writeUrlReadme(vaultService, repoPath, urlMetadata, title)`: Create new README with URL

### Link File System
- `createLinkFileContent(urlMetadata)`: Generate `.link` file JSON content
- `parseLinkFileContent(content)`: Parse `.link` file (handles legacy data URLs)
- `getLinkFileName(urlMetadata)`: Generate sanitized filename for `.link` files
- `isLinkFile(path)`: Check if file is a `.link` file
- `getLinkThumbnail(linkMetadata)`: Get thumbnail URL (YouTube only)
- `validateLinkMetadata(metadata)`: Type guard for .link file metadata

## Link File Format

`.link` files are JSON files with this structure:

```json
{
  "url": "https://youtube.com/watch?v=abc123",
  "type": "youtube",
  "title": "Video Title",
  "videoId": "abc123",
  "embedUrl": "https://youtube.com/embed/abc123",
  "thumbnail": "https://img.youtube.com/vi/abc123/maxresdefault.jpg",
  "created": "2025-01-15T10:30:00.000Z"
}
```

## Drop Behavior

### Normal Drop (no modifier)
- **Empty space**: Creates new DreamNode at 3D position
- **On existing node**: Adds files/URL to that node
- **Liminal-web mode**: Auto-creates relationship with focused node

### Command+Drop
- Opens DreamNode creator with pre-filled data
- Files: Title from filename, first media file as dreamTalk
- URLs: Title from URL metadata, .link file prepared

## Notes

- YouTube titles are fetched via oEmbed API (no API key required)
- Legacy `.link` files stored as data URLs are handled gracefully
- Link files are treated as media files in the DreamNode system
- Filename sanitization ensures cross-platform compatibility
- 3D position calculation uses raycasting against a 5000-unit sphere
