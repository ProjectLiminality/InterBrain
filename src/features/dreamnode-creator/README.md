# DreamNode Creator

**Purpose**: Creation workflow UI for DreamNodes - translucent inline editing in 3D space.

**Parent feature**: [`dreamnode/`](../dreamnode/README.md) (core types, services, persistence)

## Directory Structure

```
dreamnode-creator/
├── store/
│   └── slice.ts              # Creation workflow state (DraftDreamNode, validation)
├── DreamNodeCreator3D.tsx    # Main 3D creation component (self-contained)
├── index.ts                  # Barrel export
└── README.md
```

## Main Exports

```typescript
// Store (state management)
export * from './store/slice';
// → createCreationSlice, CreationSlice, DraftDreamNode, ValidationErrors

// Components
export { default as DreamNodeCreator3D } from './DreamNodeCreator3D';

// Backward compatibility aliases
export { default as CreationModeOverlay } from './DreamNodeCreator3D';
export { default as ProtoNode3D } from './DreamNodeCreator3D';
```

## Workflow

1. **Start**: `startCreation(position)` or `startCreationWithData(position, initialData)`
2. **Edit**: User modifies title, type, uploads DreamTalk media
3. **Validate**: Title required, <255 chars, no invalid filesystem characters
4. **Complete**: `completeCreation()` triggers `GitDreamNodeService.create()` in parent feature
5. **Cancel**: `cancelCreation()` resets state

## Key Features

- **DreamNodeCreator3D**: Self-contained translucent DreamNode creation UI
  - Renders only when `creationState.isCreating` is true
  - Title input, type toggle (Dream/Dreamer), file upload
  - Media preview: Images, videos, PDFs, YouTube thumbnails
  - Completion animation: Slides z=-25 → z=-75 while fading UI
  - Keyboard: Enter to create

## Dependencies

**From `dreamnode/`**:
- `dreamNodeStyles` - Visual constants (dimensions, colors, glows)
- `getNodeColors()`, `getNodeGlow()` - Type-specific styling
- `isValidDreamTalkMedia()` - Media file validation

**External**:
- React Three Fiber (`useFrame`)
- `@react-three/drei` (`Html`)

## Future Improvements

### Context-Aware Creation in Liminal-Web Mode

When in liminal-web mode (viewing a DreamNode's connections), the creator could:
- Pre-fill relationship data based on current context
- Auto-suggest title based on parent DreamNode's content
- Position new node intelligently within the web layout
- Create with initial link to the focused DreamNode

This would transform creation from "make a thing" to "extend the conversation" - supporting the liminal web's social relationship model.
