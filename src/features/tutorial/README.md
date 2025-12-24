# Tutorial Feature

Onboarding system with Manim-style text animations and portal entry experience for first-time users.

## Purpose

Provides a guided introduction to InterBrain/DreamSpace with:
- Portal overlay entry screen with Project Liminality logo
- Ambient music during onboarding
- Elegant 3Blue1Brown-style text animations in 3D space
- GoldenDot attention-steering animations between nodes

## Directory Structure

```
tutorial/
├── index.ts                    # Barrel exports
├── types.ts                    # Type definitions (TutorialStep, TutorialState, etc.)
├── store/slice.ts              # Zustand store slice
├── TutorialService.ts          # Legacy service (step progression, callbacks)
├── TutorialCommands.ts         # Obsidian command registrations
├── TutorialRunner.tsx          # Step execution orchestrator
├── TutorialOverlay.tsx         # 3D overlay rendered in DreamSpace
├── TutorialPortalOverlay.tsx   # Full-screen portal entry experience
├── TutorialModal.ts            # Native Obsidian modal alternative
├── ManimText.tsx               # SVG text animation component
├── GoldenDot.tsx               # Attention-steering dot animation
├── settings-section.ts         # Settings tab section (music attribution)
├── components/
│   └── ProjectLiminalityLogo.tsx  # SVG logo with animatable elements
├── services/
│   ├── music-service.ts        # Audio playback with fade in/out
│   └── demo-vault-service.ts   # Demo node management (WIP)
├── utils/
│   ├── projection.ts           # 3D-to-2D projection utilities
│   └── hit-detection.ts        # Raycasting hit detection
├── steps/
│   └── mvp-steps.ts            # Tutorial step definitions
├── assets/
│   └── TutorialMusic.mp3       # Ambient music track
├── fonts/                      # TeX Gyre Termes font files
├── tutorial-styles.css         # Tutorial UI styling
├── TUTORIAL_MVP.md             # MVP specification
└── TUTORIAL_VISION_FULL.md     # Full vision document
```

## Main Exports

### Components
- `TutorialPortalOverlay` - Full-screen portal entry with logo, stars, and animation
- `TutorialOverlay` - 3D space overlay for ManimText and GoldenDot
- `TutorialModal` - Obsidian modal for 2D rendering
- `TutorialRunner` - Step execution orchestrator
- `ManimText` - SVG text animation (stroke draw → fill → stroke fade)
- `GoldenDot` - Attention-steering dot between nodes
- `ProjectLiminalityLogo` - SVG logo with animatable opacity props

### Services
- `tutorialService` - Legacy singleton for state/callbacks
- `musicService` - Audio playback with fade controls
- `demoVaultService` - Demo node symlink management (WIP)

### Store
- `createTutorialSlice` - Zustand slice for tutorial state
- `TutorialSlice` - TypeScript interface

### Utilities
- `registerTutorialCommands(plugin)` - Register Obsidian commands
- `createTutorialSettingsSection()` - Settings tab section
- Projection utilities for 3D positioning

## Commands

| Command | Description |
|---------|-------------|
| `interbrain:start-tutorial` | Start tutorial in 3D DreamSpace |
| `interbrain:start-tutorial-modal` | Start tutorial in Obsidian modal |
| `interbrain:reset-tutorial` | Reset tutorial state (debug) |
| `interbrain:skip-tutorial` | Skip/complete tutorial |

## Portal Overlay

The `TutorialPortalOverlay` provides the entry experience:

### Features
- Project Liminality SVG logo with blue/red circles and white "A" lines
- Logo tilts toward mouse cursor (like DreamNodes)
- Hover: logo straightens, scales slightly, shows "Enter DreamSpace" text
- Click: staggered animation (fade then scale), music starts, reveals DreamSpace
- Star field background with proper masking during portal animation

### Animation Timing
- **Fade-out** (red circle, lines, backing): 0% → 50% of duration
- **Scale-up** (logo, hole): 25% → 100% of duration
- Total duration: 1500ms

## Dependencies

- `framer-motion` - SVG path animations for ManimText
- `opentype.js` - Font parsing for text-to-SVG conversion
- `@react-three/drei` - Billboard and Html for 3D positioning

## Integration Points

- **main.ts**: Commands registered via `registerTutorialCommands()`
- **DreamspaceCanvas.tsx**: `<TutorialOverlay />` and `<TutorialPortalOverlay />` rendered
- **interbrain-store.ts**: Tutorial slice integrated
- **SettingsTab.ts**: Music attribution section

## Current Status

### Completed
- [x] Portal overlay with SVG logo and animations
- [x] Music service with fade in/out
- [x] Music attribution in settings
- [x] Star field with proper masking
- [x] ManimText component
- [x] GoldenDot component
- [x] Tutorial store slice
- [x] Basic step definitions

### In Progress / TODO
- [ ] Connect portal to tutorial flow (currently just animates)
- [ ] First-startup detection (show portal automatically)
- [ ] Demo vault node symlinking
- [ ] Full tutorial step sequence
- [ ] Tutorial completion persistence

## Music Attribution

Tutorial music: "Grant's Etude" by Vincent Rubinetti from "The Music of 3Blue1Brown"
- Bandcamp: https://vincerubinetti.bandcamp.com/album/the-music-of-3blue1brown
- License: Used with attribution per artist guidelines

## Notes

- Uses localStorage for tutorial completion persistence
- Font files (TeX Gyre Termes) bundled for consistent typography
- Portal overlay uses React Portal to escape container constraints
- Star filtering uses constant offset for proper alignment with blue circle
