# DreamNode Creator

**Purpose**: Creation workflow UI for DreamNodes - translucent inline editing in 3D space.

**Parent feature**: [`dreamnode/`](../dreamnode/README.md) (core types, services, persistence)

## Directory Structure

```
dreamnode-creator/
├── store/
│   └── slice.ts              # Creation workflow state (ProtoNode, validation)
├── ProtoNode3D.tsx           # Main 3D creation component
├── CreationModeOverlay.tsx   # 2D overlay controls
├── index.ts                  # Barrel export
└── README.md
```

## Main Exports

```typescript
// Store (state management)
export * from './store/slice';
// → createCreationSlice, CreationSlice, ProtoNode, ValidationErrors

// Components
export { default as ProtoNode3D } from './ProtoNode3D';
export { default as CreationModeOverlay } from './CreationModeOverlay';
```

## Workflow

1. **Start**: `startCreation(position)` or `startCreationWithData(position, initialData)`
2. **Edit**: User modifies title, type, uploads DreamTalk media
3. **Validate**: Title required, <255 chars, no invalid filesystem characters
4. **Complete**: `completeCreation()` triggers `GitDreamNodeService.create()` in parent feature
5. **Cancel**: `cancelCreation()` resets state

## Key Features

- **ProtoNode3D**: Translucent DreamNode preview at 3D position
- **Inline editing**: Title, type toggle, file upload
- **Media preview**: Images, videos, PDFs, YouTube thumbnails
- **Completion animation**: Slides z=-25 → z=-75 while fading UI
- **Keyboard**: Enter to create, Escape to cancel

## Dependencies

**From `dreamnode/`**:
- `dreamNodeStyles` - Visual constants (dimensions, colors, glows)
- `getNodeColors()`, `getNodeGlow()` - Type-specific styling

**External**:
- React Three Fiber (`useFrame`)
- `@react-three/drei` (`Html`)
