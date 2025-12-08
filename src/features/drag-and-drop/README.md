# Drag-and-Drop Feature

Handles URL drops into DreamSpace and creates `.link` files for URL references.

## Purpose

Converts dropped URLs (especially YouTube videos) into trackable `.link` files that behave like media files in the vault.

## Key Files

- **`drag-and-drop-slice.ts`**: Zustand slice managing `isDragging` state (2 exports)
- **`url-utils.ts`**: URL validation, metadata extraction, YouTube detection (11 exports)
- **`link-file-utils.ts`**: `.link` file creation, parsing, and metadata management (9 exports)
- **`index.ts`**: Barrel export for feature

## Main Exports

### State Management
- `createDragAndDropSlice`: Zustand slice factory for drag state
- `DragAndDropSlice`: TypeScript interface for drag state

### URL Processing
- `getUrlMetadata(url)`: Extract metadata from any URL (async, fetches YouTube titles)
- `processDroppedUrlData(data)`: Parse dropped data and extract first valid URL
- `extractYouTubeVideoId(url)`: Detect and extract YouTube video IDs
- `generateYouTubeIframe(videoId)`: Create Obsidian-compatible iframe markup

### Link File System
- `createLinkFileContent(urlMetadata)`: Generate `.link` file JSON content
- `parseLinkFileContent(content)`: Parse `.link` file (handles legacy data URLs)
- `getLinkFileName(urlMetadata)`: Generate sanitized filename for `.link` files
- `isLinkFile(path)`: Check if file is a `.link` file
- `getLinkThumbnail(linkMetadata)`: Get thumbnail URL (YouTube only)

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

## Notes

- YouTube titles are fetched via oEmbed API (no API key required)
- Legacy `.link` files stored as data URLs are handled gracefully
- Link files are treated as media files in the DreamNode system
- Filename sanitization ensures cross-platform compatibility
