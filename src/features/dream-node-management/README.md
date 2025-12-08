# Dream Node Management

**Purpose**: Zustand state slice for managing DreamNode creation workflow (proto-node state, validation, lifecycle).

## Key Files

- **creation-slice.ts**: Creation state slice with proto-node management
  - ProtoNode interface: Temporary node data during creation (title, type, position, files, URL metadata)
  - CreationSlice: State machine for creation mode (start → update → validate → complete/cancel)
  - Exports: `createCreationSlice`, `ProtoNode`, `CreationSlice`, `ValidationErrors`

## Main Exports

```typescript
// State slice creator (integrated into InterbrainStore)
createCreationSlice: StateCreator<CreationSlice>

// Core types
ProtoNode: Temporary node before git repo creation
CreationSlice: State + actions for creation workflow
ValidationErrors: Title/dreamTalk validation feedback

// Actions
startCreation(position): Begin creation at 3D position
startCreationWithData(position, initialData): Begin with pre-filled data (drag-drop)
updateProtoNode(updates): Update proto-node fields
setValidationErrors(errors): Set validation feedback
completeCreation(): Finalize and reset state
cancelCreation(): Abort and reset state
```

## Integration

- **Store**: Merged into `/src/core/store/interbrain-store.ts` via Zustand slice pattern
- **Used by**:
  - `/src/features/creation/ProtoNode3D.tsx` - Visual proto-node representation
  - `/src/features/creation/` - Creation UI components
  - `/src/features/drag-and-drop/` - File/URL drop initialization

## Notes

- **No index.ts**: Direct imports from `creation-slice.ts` only
- **Feature complete**: Creation workflow stable since Epic 3
- **State lifecycle**: Proto-node exists only during creation, destroyed on complete/cancel
