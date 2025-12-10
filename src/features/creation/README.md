# Creation Feature

**Purpose**: In-space 3D creation UI for DreamNodes with translucent inline editing and state management.

## Key Files

### State Management
- **`store/slice.ts`** - Zustand slice for creation workflow:
  - `ProtoNode` interface: Temporary node data during creation (title, type, position, files, URL metadata)
  - `CreationSlice`: State machine for creation mode (start → update → validate → complete/cancel)
  - Actions: `startCreation`, `startCreationWithData`, `updateProtoNode`, `completeCreation`, `cancelCreation`

### Components

### `ProtoNode3D.tsx` (603 lines)
Main creation component that renders a translucent DreamNode in 3D space for inline editing.

**What it does**:
- Renders editable proto-node at specified 3D position
- Inline title editing with debounced validation (300ms)
- Type toggle between 'dream' and 'dreamer'
- Drag-and-drop or click-to-browse file upload for DreamTalk media
- YouTube URL metadata preview with thumbnail
- Completion animation: slides from z=-25 to z=-75 over 1 second while fading out UI controls
- Keyboard shortcuts: Enter to create, Escape handled by parent DreamspaceCanvas

**Key features**:
- Local state for immediate UI responsiveness + debounced store updates
- Media preview for images, videos, PDFs, YouTube thumbnails
- Validation: title required, <255 chars, no invalid filesystem characters
- Event propagation control to prevent sphere rotation interference
- Unified animation system using `useFrame` for position + opacity

### `index.ts` (3 lines)
Simple barrel export for `ProtoNode3D`.

## Main Exports

```typescript
// Store slice
export { createCreationSlice, ProtoNode, CreationSlice, ValidationErrors } from './store/slice';

// Components
export { default as ProtoNode3D } from './ProtoNode3D';
export { default as CreationModeOverlay } from './CreationModeOverlay';
```

## Dependencies

**Internal** (from this feature's store):
- `creationState`, `updateProtoNode()`, `setValidationErrors()` via `useInterBrainStore`
- `ProtoNode` type: Shape of the proto-node being created

**From dreamnode feature**:
- `dreamNodeStyles`: Shared visual constants (dimensions, colors, transitions)
- `getNodeColors()`: Type-specific color palettes
- `getNodeGlow()`: Type-specific glow effects
- `getMediaContainerStyle()`: Consistent media area styling
- `getMediaOverlayStyle()`: Fade-to-black overlay for media

**External**:
- React Three Fiber: `useFrame` for animation loop
- `@react-three/drei`: `Html` component for DOM-in-3D

## Notes

- **Animation Pattern**: Single `useFrame` hook manages both position (z-axis translation) and opacity (UI fade-out) for clean completion effect
- **Debouncing**: Title validation and store updates debounced at 300ms to avoid performance issues during typing
- **Event Isolation**: Extensive use of `stopPropagation()` to prevent camera/sphere rotation interference
- **Media Support**: Images, videos, PDFs, YouTube URLs via metadata
- **No Dead Code**: Component is actively used, no unused files detected
