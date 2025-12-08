# Search Feature Slice

**Purpose**: Semantic search interface with multi-modal query support (text + media) and 1-second periodic query polling.

## Key Files

### `SearchNode3D.tsx` (500 lines)
3D search interface styled as a Dream-type DreamNode. Handles:
- Text search query input with 300ms debounced store updates
- Drag-and-drop media attachment for multi-modal search
- Spawn animation (5000→50 units, easeOutQuart, 1s)
- Save animation (50→75 units, easeInOut, 1s) with parallel constellation return
- Keyboard shortcuts (Enter to save, Escape handled by DreamspaceCanvas)

### `SearchOrchestrator.tsx` (113 lines)
Pure orchestration component (no render). Implements:
- 1-second interval polling for search query changes
- Significant change detection (ignores whitespace-only changes)
- Dynamic import of `semanticSearchService.searchByText()`
- Performance optimization: only triggers search when query meaningfully changes
- Passes search results via callback prop

### `commands.ts` (58 lines)
Command palette integration:
- **Toggle Search Mode** (`Ctrl+F`): Activates/dismisses search
- **Liminal-web special case**: Two-phase transition (liminal-web → constellation → search) with 1.1s delay
- **Search dismissal**: Returns to constellation layout

### `index.ts`
Exports: `registerSearchCommands`, `SearchNode3D`, `SearchOrchestrator`

## Architecture Notes

**Debouncing Strategy**:
- Local UI state updates immediately (responsive typing)
- Store query updates after 300ms idle (reduces re-renders)
- SearchOrchestrator polls store every 1s (avoids overwhelming Ollama)

**Animation Coordination**:
- Spawn animation uses `easeOutQuart` to match spatial orchestration
- Save animation runs in parallel with constellation return (temporal overlap pattern)
- 200ms extended overlap prevents SearchNode unmount flicker

**Multi-modal Search**:
- Supports text query + optional media file (DreamTalk) + additional files
- Media file validation: images, videos, PDFs, `.link` files
- File selection via drag-and-drop or click-to-browse

## Dependencies
- `semanticSearchService` (dynamic import)
- `useInterBrainStore` (search interface state)
- `dreamNodeStyles` (visual consistency with DreamNode)

## Issues/Notes
- ✅ Clean implementation, no obvious dead code
- SearchOrchestrator's 1s polling + 300ms debounce = efficient semantic search throttling
- Animation timing carefully tuned to prevent visual glitches during transitions
