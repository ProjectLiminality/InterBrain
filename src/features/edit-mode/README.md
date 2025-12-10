# Edit Mode Feature

**Purpose**: In-space unified editing interface for DreamNodes with relationship management in liminal web layout.

## Key Files

### `commands.ts`
Command palette integration for edit mode workflow:
- **Enter Edit Mode** (`Ctrl+E`) - Activates editing for selected node, shows existing relationships
- **Exit Edit Mode** - Leaves edit mode without saving
- **Save Edit Mode Changes** - Persists metadata and relationship changes
- **Cancel Edit Mode Changes** - Reverts changes and returns to liminal-web
- **Search Related Nodes** - Semantic search for relationship discovery
- **Find Similar Related Nodes** - Auto-suggest similar opposite-type nodes

### `edit-slice.ts`
Zustand store slice managing edit mode state:
- Edit session lifecycle (start/exit)
- Pending relationship tracking (toggle, save)
- Search result management for relationship editing
- Validation errors for metadata fields
- New DreamTalk file handling

### `EditModeOverlay.tsx`
Main coordinator component that orchestrates:
- Renders `EditNode3D` for metadata editing at center position
- Manages `EditModeSearchNode3D` visibility when relationship search is active
- Handles save/cancel actions with DreamTalk media file deduplication
- Triggers spatial layout transitions via custom events
- Integrates with existing `SpatialOrchestrator` for relationship node positioning

### `EditNode3D.tsx`
Central metadata editing interface (extends ProtoNode3D patterns):
- Title editing with validation
- Type toggle (dream/dreamer) with relationship impact warnings
- Contact fields (email, phone, DID, Radicle ID) for dreamer nodes
- DreamTalk media drag-drop and file selection
- Relationship search toggle button
- Save/cancel/search controls

### `EditModeSearchNode3D.tsx`
Relationship search interface that renders on top of EditNode3D:
- Real-time semantic search with 500ms debounce
- Searches opposite-type nodes for relationship compatibility
- Displays elegant spinning ring loading indicator
- Integrates with `semanticSearchService` for AI-powered discovery
- Escape key handling via global `DreamspaceCanvas` handler

## Main Exports

```typescript
export { EditModeOverlay } from './EditModeOverlay'
export { EditNode3D } from './EditNode3D'
export { registerEditModeCommands } from './commands'
```

## Integration Points

- **Store**: Uses `useInterBrainStore` edit-mode slice for state
- **Services**: Delegates to `GitDreamNodeService` via `serviceManager` for persistence
- **Spatial Layout**: Communicates with `SpatialOrchestrator` via custom DOM events:
  - `edit-mode-search-layout` - Positions relationship nodes in search mode
  - `edit-mode-save-transition` - Animates transition back to liminal-web
  - `clear-edit-mode-data` - Cleans up stale orchestrator state
- **Commands**: Registered in plugin's main command palette

## Layout States

Edit mode operates across multiple spatial layouts:
- **liminal-web** → **edit-mode** (enter editing)
- **edit-mode** → **edit-search** (relationship search active)
- **edit-search** → **edit-mode** (search toggle off, filter to pending)
- **edit-mode** → **liminal-web** (save or cancel)

## Notes

- **No unit tests for VaultService** - Deliberate decision (see CLAUDE.md testing section)
- **Contact info only for dreamer nodes** - Automatically hidden/cleared for dream type
- **File deduplication** - SHA-256 hash comparison prevents duplicate media copies
- **Escape key handling** - Centralized in `DreamspaceCanvas` for stability across layouts
- **Focus persistence** - Title input maintains focus through type changes for seamless editing