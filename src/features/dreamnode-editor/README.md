# DreamNode Editor

**Purpose**: In-place editing UI for existing DreamNodes - modify metadata and manage relationships.

**Parent feature**: [`dreamnode/`](../dreamnode/README.md) (core types, services, persistence)

## Directory Structure

```
dreamnode-editor/
├── store/
│   └── slice.ts                    # Edit mode state (Zustand)
├── services/
│   └── editor-service.ts           # Save orchestration using parent service
├── DreamNodeEditor3D.tsx           # Main 3D editing component (self-contained)
├── RelationshipSearchInput.tsx     # Semantic search for relationship candidates
├── commands.ts                     # Obsidian command palette commands
├── index.ts                        # Barrel export
└── README.md
```

## Main Exports

```typescript
// Store (state management)
export * from './store/slice';
// → createEditModeSlice, EditModeSlice, EditModeState, EditModeValidationErrors

// Commands
export { registerEditModeCommands } from './commands';

// Services
export * from './services/editor-service';
// → saveEditModeChanges, getFreshNodeData, cancelEditMode, exitToLiminalWeb

// Components
export { default as DreamNodeEditor3D } from './DreamNodeEditor3D';
export { default as RelationshipSearchInput } from './RelationshipSearchInput';
```

## Workflow

1. **Enter**: User selects node in liminal-web layout, presses `Ctrl+E`
2. **Edit**: DreamNodeEditor3D renders at center with node data
3. **Modify**: User edits title, contact info (dreamer only), uploads media
4. **Relationships**: Toggle search to find/add relationship candidates
5. **Save**: EditorService orchestrates persistence via parent GitDreamNodeService
6. **Exit**: Return to liminal-web layout with updated node

## Key Features

- **DreamNodeEditor3D**: Self-contained editor UI
  - Renders only when `editMode.isActive` is true
  - Title editing, contact fields (dreamer only), media drag/drop
  - Relationship search toggle
  - Note: Node type (dream/dreamer) is immutable - set at creation

- **RelationshipSearchInput**: Semantic search for finding nodes to link
  - Debounced search as user types
  - Searches opposite-type nodes (dream searches dreamers, vice versa)

- **EditorService**: Save orchestration
  - Uses parent `GitDreamNodeService.update()` for metadata
  - Uses parent `GitDreamNodeService.updateRelationships()` for links
  - Smart file deduplication (hash comparison to avoid duplicate copies)

## Architecture: Commands → Services → UI

```
User clicks Save → UI calls handleSave() → calls saveEditModeChanges() (service)
                                                     ↓
                               GitDreamNodeService.update() (parent)
                               GitDreamNodeService.updateRelationships() (parent)
```

Commands registered in `commands.ts` also use the service layer, ensuring
consistent behavior whether triggered via UI or command palette.

## Dependencies

**From `dreamnode/`**:
- `DreamNode` type
- `GitDreamNodeService` (via serviceManager)
- `isValidDreamTalkMedia()` - media file validation
- `dreamNodeStyles`, `getNodeColors()`, `getNodeGlow()` - visual styling

**From `semantic-search/`**:
- `semanticSearchService.searchOppositeTypeNodes()` - relationship discovery
