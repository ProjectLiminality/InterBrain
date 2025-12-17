# Tutorial Feature

Onboarding system with Manim-style text animations for first-time user experience.

## Purpose

Provides a guided introduction to InterBrain/DreamSpace with elegant 3Blue1Brown-style text animations that draw and fill in 3D space.

## Directory Structure

```
tutorial/
├── index.ts              # Barrel exports
├── TutorialService.ts    # State management & step progression
├── TutorialCommands.ts   # Obsidian command registrations
├── TutorialOverlay.tsx   # 3D overlay rendered in DreamSpace
├── TutorialModal.ts      # Native Obsidian modal alternative
├── ManimText.tsx         # SVG text animation component
├── tutorial-styles.css   # Styling for tutorial UI
├── fonts/                # TeX Gyre Termes font files
└── TUTORIAL_DESIGN.md    # Design vision document
```

## Main Exports

- `registerTutorialCommands(plugin, uiService)` - Register Obsidian commands
- `TutorialOverlay` - React component for 3D space rendering
- `TutorialModal` - Obsidian modal for 2D rendering
- `tutorialService` - Singleton service for state management
- `ManimText` - Reusable SVG text animation component

## Commands

| Command | Description |
|---------|-------------|
| `interbrain:start-tutorial` | Start tutorial in 3D DreamSpace |
| `interbrain:start-tutorial-modal` | Start tutorial in Obsidian modal |
| `interbrain:reset-tutorial` | Reset tutorial state (debug) |
| `interbrain:skip-tutorial` | Skip/complete tutorial |

## Dependencies

- `framer-motion` - Animation library for SVG path animations
- `opentype.js` - Font parsing to convert text to SVG paths
- `@react-three/drei` - Billboard and Html components for 3D positioning

## Integration Points

- **main.ts**: Commands registered via `registerTutorialCommands()`
- **DreamspaceCanvas.tsx**: `<TutorialOverlay />` rendered inside Canvas

## Notes

- Uses localStorage for tutorial completion persistence
- ManimText creates three-phase animation: stroke draw → fill reveal → stroke fade
- Tutorial steps auto-advance based on duration property
- Font files (TeX Gyre Termes) bundled for consistent typography

## GoldenDot Animation System

The GoldenDot component provides attention-steering animations between DreamNodes.

### Current Implementation

- **Hit detection**: Uses raycasting (same as cursor hover) to detect when the dot enters/exits node hit spheres
- **Glow handoff**: Dot opacity tied to hit detection - fades out when inside a hit sphere, triggering node glow
- **Edge positioning**: Dot starts/ends at node edges (not centers) via `calculateProjectedEdgePositions()`
- **Perspective projection**: 3D positions projected to Z=-30 plane for correct visual alignment

### Known Limitations

The hit detection approach introduces slight input lag on hover state transitions. For production-quality animations, consider:

1. **Hardcoded timing**: Pre-calculate when glow states should trigger based on animation progress (t value) rather than runtime hit detection
2. **Synchronous glow/opacity**: Drive both dot opacity and node glow from the same animation progress value
3. **CSS-only transitions**: Remove hit detection entirely and use pure CSS keyframe animations for guaranteed smoothness

The current system is good for prototyping and works well enough for tutorial purposes, but a hardcoded approach would give full control over timing and eliminate any responsiveness issues.
