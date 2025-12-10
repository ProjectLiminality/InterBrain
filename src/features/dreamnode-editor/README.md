# DreamNode Editor

**Purpose**: Editing workflow UI for DreamNodes - metadata editing and relationship management in 3D space.

**Parent feature**: [`dreamnode/`](../dreamnode/README.md) (core types, services, persistence)

## Directory Structure

```
dreamnode-editor/
├── store/
│   └── slice.ts              # Edit mode state (session, pending relationships, validation)
├── EditModeOverlay.tsx       # Main coordinator component
├── EditNode3D.tsx            # Central metadata editing interface
├── EditModeSearchNode3D.tsx  # Relationship search interface
├── commands.ts               # Obsidian command palette (enter, exit, save, cancel)
├── index.ts                  # Barrel export
└── README.md
```

## Main Exports

```typescript
// Store (state management)
export * from './store/slice';
// → createEditModeSlice, EditModeSlice, EditModeState, EditModeValidationErrors

// Components
export { default as EditModeOverlay } from './EditModeOverlay';
export { default as EditNode3D } from './EditNode3D';
export { default as EditModeSearchNode3D } from './EditModeSearchNode3D';

// Commands
export { registerEditModeCommands } from './commands';
```

## Workflow

1. **Enter**: `Ctrl+E` on selected node → shows existing relationships in ring
2. **Edit metadata**: Title, type, contact info (dreamer only), DreamTalk media
3. **Manage relationships**: Toggle nodes to add/remove connections
4. **Search relationships**: Semantic search for compatible nodes
5. **Save/Cancel**: Persist changes or revert

## Key Features

- **EditNode3D**: Central editing interface (extends ProtoNode3D patterns)
- **Relationship toggle**: Click ring nodes to add/remove from pending changes
- **Semantic search**: AI-powered discovery of related nodes
- **Type switching**: Warnings when changing node type affects relationships
- **Contact fields**: Email, phone, DID, Radicle ID for dreamer nodes

## Layout States

```
liminal-web → edit-mode (enter editing)
edit-mode → edit-search (relationship search active)
edit-search → edit-mode (search toggle off)
edit-mode → liminal-web (save or cancel)
```

## Dependencies

**From `dreamnode/`**:
- `GitDreamNodeService` - Persistence operations
- `dreamNodeStyles` - Visual constants

**From `semantic-search/`**:
- `semanticSearchService` - AI-powered relationship discovery

## Notes

- **File deduplication**: SHA-256 hash comparison prevents duplicate media copies
- **Escape key**: Centralized in `DreamspaceCanvas` for stability
- **Contact info**: Automatically hidden/cleared when switching to dream type
