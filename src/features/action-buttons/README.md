# Action Buttons Feature

**Purpose**: Option-key triggered circular button menu around selected DreamNodes in 3D space.

## Overview

Displays configurable action buttons in an elegant ring pattern around the selected DreamNode when Option/Alt key is held. Each button executes an Obsidian command and can be conditionally shown/disabled based on node state.

## Directory Structure

```
action-buttons/
├── store/
│   └── slice.ts               # Zustand state slice
├── radial-button-config.tsx   # Button configuration array with icons, commands, conditional logic
├── RadialButtonRing3D.tsx     # Main 3D ring component with animations
├── ActiveVideoCallButton.tsx  # Persistent "end call" button during copilot mode
├── index.ts                   # Barrel export
└── README.md
```

## Main Exports

```typescript
export { ActiveVideoCallButton } from './ActiveVideoCallButton';
export { RadialButtonRing3D } from './RadialButtonRing3D';
export * from './radial-button-config'; // RADIAL_BUTTON_CONFIGS, RadialButtonConfig, createIconElement
```

## Architecture

- **Button Configuration**: Declarative config array maps Lucide icons to Obsidian commands
- **Dynamic Properties**: Buttons support conditional visibility (`shouldShow`), dynamic labels/commands (`getDynamicLabel`/`getDynamicCommand`), and disabled states with tooltips (`shouldDisable`)
- **3D Positioning**: Equidistant spacing on ring (18 units radius, Z=-51), buttons use HTML/Billboard pattern from EditNode3D
- **Animations**: 500ms easeOutCubic bidirectional slide animations (center ↔ ring) with mid-flight interruption support
- **Access Control**: GitHub-only repos without push access show disabled "Share Changes" button with tooltip
- **Copilot Integration**: ActiveVideoCallButton persists during video calls at radius=11, phi=-45° position

## Current Button Set

1. **Edit Metadata** (pencil icon) and **Edit Relationships** (link icon) — two separate configs
2. **Video Call** - Initiate Digital Campfire (flame icon, dreamer-type only)
3. **Create Canvas** - DreamSong canvas creation (grid icon)
4. **View Published Page** - opens the node's GitHub Pages site (GitHub icon; "View on GitHub" for the InterBrain node) — the Publish/Unpublish verb dissolved into Share (#409)
5. **Save Changes** (save icon)
6. **Share Changes** - push origin + republish Pages (upload cloud icon, disabled for follow-only GitHub repos)
7. **Invite Collaborators** - copy an invite link to your outbox (link icon)
8. **Check Updates** - opens the cherry-pick preview (refresh icon)
9. **Open Finder** (folder icon)
10. **Coding Agent** - Open terminal (terminal icon)
11. **Report Bug** (InterBrain node only)
12. **Delete Node** (trash icon)

## Notes

- **gh CLI Caching**: GitHub username check uses session-level cache to avoid repeated CLI calls, falls back to `git push --dry-run` if unavailable
- **GitHub Access Cache**: 1-minute TTL cache for GitHub-only repo access checks to reduce git command overhead
- **No Dead Code**: All files actively used in production
