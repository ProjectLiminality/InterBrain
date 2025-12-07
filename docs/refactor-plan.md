# InterBrain Feature Architecture Refactor Plan

This document outlines the complete refactoring plan to reorganize the InterBrain codebase into a clean Core + Features architecture.

## Architecture Overview

### Target Structure
```
src/
├── core/                    # Foundational code (horizontal layers)
│   ├── commands/            # Core navigation commands
│   ├── components/          # Core React components
│   ├── layouts/             # Spatial layout algorithms
│   ├── services/            # Core services
│   ├── settings/            # Plugin settings
│   ├── store/               # Zustand store
│   ├── types/               # Core TypeScript types
│   └── utils/               # Shared utilities
│
├── features/                # Self-contained features (vertical slices)
│   ├── coherence-beacon/
│   ├── constellation/
│   ├── conversational-copilot/
│   ├── dreamweaving/
│   ├── edit-mode/
│   ├── github-publishing/
│   ├── realtime-transcription/
│   ├── search/
│   ├── semantic-search/
│   ├── social-resonance/
│   ├── updates/
│   └── video-calling/
│
└── main.ts                  # Plugin entry point
```

### Execution Strategy
- Each phase is executed by a Task agent
- Each phase ends with `npm run check-all` validation
- Each successful phase is committed
- Checkboxes track progress

---

## Phase 0: Cleanup - Remove Obsolete Code

**Goal:** Delete files that are no longer needed before reorganizing.

### Files to Delete
- [ ] `src/mock/dreamnode-mock-data.ts` - Obsolete mock data
- [ ] `src/mock/obsidian.ts` - Obsolete mock
- [ ] `src/services/mock-dreamnode-service.ts` - Obsolete mock service
- [ ] `src/services/dreamnode-migration-service.ts` - One-time migration complete
- [ ] `src/commands/migration-commands.ts` - One-time migration complete
- [ ] `src/commands/radial-button-commands.ts` - Debug command only
- [ ] `src/features/semantic-search/commands/test-search-commands.ts` - Test commands

### Commands to Remove from Files
- [ ] Remove `debug-dreamsong-detection` from `dreamweaving-commands.ts`
- [ ] Remove `debug-flip-state` from `dreamweaving-commands.ts`
- [ ] Remove `clear-dreamsong-cache` from `dreamweaving-commands.ts`
- [ ] Remove `debug-constellation-data` from `constellation-commands.ts`
- [ ] Remove `mock-email-export` from `conversational-copilot/commands.ts`

### Store Cleanup
- [ ] Remove mock-related methods from `interbrain-store.ts`:
  - `mockRelationshipData`
  - `generateMockRelationships`
  - Any mock node generation code

### Main.ts Cleanup
- [ ] Remove imports for deleted files
- [ ] Remove mock data initialization code
- [ ] Remove registration of deleted command files

**Checkpoint:** `npm run check-all` → Commit "Phase 0: Remove obsolete mock and migration code"

---

## Phase 1: Create Core Structure

**Goal:** Establish the `src/core/` directory with foundational code.

### 1.1 Create Core Types
- [ ] Create `src/core/types/` directory
- [ ] Move `src/types/dreamnode.ts` → `src/core/types/dreamnode.ts`
- [ ] Move `src/types/dreamsong.ts` → `src/core/types/dreamsong.ts`
- [ ] Move `src/types/constellation.ts` → `src/core/types/constellation.ts`
- [ ] Move `src/types/assets.d.ts` → `src/core/types/assets.d.ts`
- [ ] Move `src/types/obsidian.d.ts` → `src/core/types/obsidian.d.ts`
- [ ] Move `src/types/obsidian-extensions.d.ts` → `src/core/types/obsidian-extensions.d.ts`
- [ ] Create `src/core/types/index.ts` (barrel export)
- [ ] Delete empty `src/types/` directory

### 1.2 Create Core Store
- [ ] Create `src/core/store/` directory
- [ ] Move `src/store/interbrain-store.ts` → `src/core/store/interbrain-store.ts`
- [ ] Move `src/store/interbrain-store.test.ts` → `src/core/store/interbrain-store.test.ts`
- [ ] Create `src/core/store/index.ts` (barrel export)
- [ ] Delete empty `src/store/` directory

### 1.3 Create Core Utils
- [ ] Create `src/core/utils/` directory
- [ ] Move `src/utils/relationship-graph.ts` → `src/core/utils/relationship-graph.ts`
- [ ] Move `src/utils/title-sanitization.ts` → `src/core/utils/title-sanitization.ts`
- [ ] Move `src/utils/title-sanitization.test.ts` → `src/core/utils/title-sanitization.test.ts`
- [ ] Move `src/utils/url-utils.ts` → `src/core/utils/url-utils.ts`
- [ ] Move `src/utils/link-file-utils.ts` → `src/core/utils/link-file-utils.ts`
- [ ] Create `src/core/utils/index.ts` (barrel export)
- [ ] Delete empty `src/utils/` directory

### 1.4 Create Core Settings
- [ ] Create `src/core/settings/` directory
- [ ] Move `src/settings/InterBrainSettings.ts` → `src/core/settings/InterBrainSettings.ts`
- [ ] Create `src/core/settings/index.ts` (barrel export)
- [ ] Delete empty `src/settings/` directory

### 1.5 Create Core Services
- [ ] Create `src/core/services/` directory
- [ ] Move core services (keep feature-specific services for later):
  - [ ] `src/services/ui-service.ts` → `src/core/services/ui-service.ts`
  - [ ] `src/services/ui-service.test.ts` → `src/core/services/ui-service.test.ts`
  - [ ] `src/services/git-service.ts` → `src/core/services/git-service.ts`
  - [ ] `src/services/vault-service.ts` → `src/core/services/vault-service.ts`
  - [ ] `src/services/udd-service.ts` → `src/core/services/udd-service.ts`
  - [ ] `src/services/dreamnode-service.ts` → `src/core/services/dreamnode-service.ts`
  - [ ] `src/services/dreamnode-service.test.ts` → `src/core/services/dreamnode-service.test.ts`
  - [ ] `src/services/git-dreamnode-service.ts` → `src/core/services/git-dreamnode-service.ts`
  - [ ] `src/services/git-template-service.ts` → `src/core/services/git-template-service.ts`
  - [ ] `src/services/git-template-service.test.ts` → `src/core/services/git-template-service.test.ts`
  - [ ] `src/services/service-manager.ts` → `src/core/services/service-manager.ts`
  - [ ] `src/services/leaf-manager-service.ts` → `src/core/services/leaf-manager-service.ts`
  - [ ] `src/services/passphrase-manager.ts` → `src/core/services/passphrase-manager.ts`
  - [ ] `src/services/media-loading-service.ts` → `src/core/services/media-loading-service.ts`
  - [ ] `src/services/settings-status-service.ts` → `src/core/services/settings-status-service.ts`
- [ ] Create `src/core/services/index.ts` (barrel export)

### 1.6 Create Core Layouts
- [ ] Create `src/core/layouts/` directory
- [ ] Move `src/dreamspace/FibonacciSphereLayout.ts` → `src/core/layouts/FibonacciSphereLayout.ts`
- [ ] Move `src/dreamspace/FibonacciSphereLayout.test.ts` → `src/core/layouts/FibonacciSphereLayout.test.ts`
- [ ] Move `src/dreamspace/layouts/RingLayout.ts` → `src/core/layouts/RingLayout.ts`
- [ ] Move `src/dreamspace/DynamicViewScaling.ts` → `src/core/layouts/DynamicViewScaling.ts`
- [ ] Move `src/dreamspace/DynamicViewScaling.test.ts` → `src/core/layouts/DynamicViewScaling.test.ts`
- [ ] Create `src/core/layouts/index.ts` (barrel export)
- [ ] Delete empty `src/dreamspace/layouts/` directory

### 1.7 Create Core Components (Dreamspace)
- [ ] Create `src/core/components/` directory
- [ ] Move `src/dreamspace/DreamspaceView.ts` → `src/core/components/DreamspaceView.ts`
- [ ] Move `src/dreamspace/DreamspaceView.test.ts` → `src/core/components/DreamspaceView.test.ts`
- [ ] Move `src/dreamspace/DreamspaceCanvas.tsx` → `src/core/components/DreamspaceCanvas.tsx`
- [ ] Move `src/dreamspace/DreamNode3D.tsx` → `src/core/components/DreamNode3D.tsx`
- [ ] Move `src/dreamspace/DreamTalkSide.tsx` → `src/core/components/DreamTalkSide.tsx`
- [ ] Move `src/dreamspace/DreamSongSide.tsx` → `src/core/components/DreamSongSide.tsx`
- [ ] Move `src/dreamspace/DreamSongFullScreenView.ts` → `src/core/components/DreamSongFullScreenView.ts`
- [ ] Move `src/dreamspace/SpatialOrchestrator.tsx` → `src/core/components/SpatialOrchestrator.tsx`
- [ ] Move `src/dreamspace/SpatialOrchestrator.test.ts` → `src/core/components/SpatialOrchestrator.test.ts`
- [ ] Move `src/dreamspace/SphereRotationControls.tsx` → `src/core/components/SphereRotationControls.tsx`
- [ ] Move `src/dreamspace/Star3D.tsx` → `src/core/components/Star3D.tsx`
- [ ] Move `src/dreamspace/dreamNodeStyles.ts` → `src/core/components/dreamNodeStyles.ts`
- [ ] Move `src/views/LinkFileView.ts` → `src/core/components/LinkFileView.ts`
- [ ] Move `src/components/PDFPreview.tsx` → `src/core/components/PDFPreview.tsx`
- [ ] Move `src/InterBrainApp.tsx` → `src/core/components/InterBrainApp.tsx`
- [ ] Move `src/hooks/useDreamSongData.ts` → `src/core/hooks/useDreamSongData.ts`
- [ ] Create `src/core/components/index.ts` (barrel export)
- [ ] Delete empty `src/dreamspace/` (after constellation moved)
- [ ] Delete empty `src/views/` directory
- [ ] Delete empty `src/components/` directory

### 1.8 Create Core Commands (Navigation)
- [ ] Create `src/core/commands/` directory
- [ ] Create `src/core/commands/navigation-commands.ts` with:
  - Extract `flip-selected-dreamnode` from dreamweaving-commands.ts
  - Extract `flip-dreamnode-to-front` from dreamweaving-commands.ts
  - Extract `flip-dreamnode-to-back` from dreamweaving-commands.ts
  - Move `open-dreamtalk-fullscreen` from fullscreen-commands.ts
  - Move `open-dreamsong-fullscreen` from fullscreen-commands.ts
  - Move `toggle-search-mode` from search-interface-commands.ts
- [ ] Create `src/core/commands/relationship-commands.ts` with:
  - Move `sync-bidirectional-relationships` from relationship-commands.ts
  - Move `clean-dangling-relationships` from relationship-commands.ts
- [ ] Delete `src/commands/fullscreen-commands.ts`
- [ ] Delete `src/commands/search-interface-commands.ts`
- [ ] Delete `src/commands/relationship-commands.ts`
- [ ] Create `src/core/commands/index.ts` (barrel export)

### 1.9 Create Core UI
- [ ] Create `src/core/ui/` directory
- [ ] Move `src/ui/coherence-beacon-modal.ts` → `src/core/ui/coherence-beacon-modal.ts`
- [ ] Move `src/ui/update-preview-modal.ts` → `src/core/ui/update-preview-modal.ts`
- [ ] Create `src/core/ui/index.ts` (barrel export)
- [ ] Delete empty `src/ui/` directory

### 1.10 Create Core Index
- [ ] Create `src/core/index.ts` (master barrel export for all core modules)

**Checkpoint:** `npm run check-all` → Commit "Phase 1: Create core structure"

---

## Phase 2: Organize Existing Features

**Goal:** Clean up features that already exist in `src/features/`.

### 2.1 Semantic Search (already well-structured)
- [ ] Delete `src/features/semantic-search/commands/test-search-commands.ts` (if not done in Phase 0)
- [ ] Update `src/features/semantic-search/commands/index.ts` to remove test command registration
- [ ] Update imports to use `@core/` or relative paths to core

### 2.2 Conversational Copilot
- [ ] Remove `mock-email-export` command from `commands.ts` (if not done in Phase 0)
- [ ] Flatten structure if desired (services/ can stay as-is since it has many files)
- [ ] Update imports to use core paths
- [ ] Create/update `index.ts` barrel export

### 2.3 Realtime Transcription (already well-structured)
- [ ] Update imports to use core paths
- [ ] Verify `index.ts` exports correctly

### 2.4 Edit Mode
- [ ] Move `src/commands/edit-mode-commands.ts` → `src/features/edit-mode/commands.ts`
- [ ] Verify existing components are correct:
  - `EditModeOverlay.tsx`
  - `EditModeSearchNode3D.tsx`
  - `EditNode3D.tsx`
- [ ] Update imports to use core paths
- [ ] Update `index.ts` to export commands

### 2.5 Dreamweaving
- [ ] Move `src/commands/dreamweaving-commands.ts` → `src/features/dreamweaving/commands.ts`
  - Remove flip commands (moved to core in Phase 1)
  - Remove debug commands (deleted in Phase 0)
- [ ] Move `src/commands/link-file-commands.ts` → `src/features/dreamweaving/link-file-commands.ts`
- [ ] Move canvas services:
  - [ ] `src/services/canvas-parser-service.ts` → `src/features/dreamweaving/services/canvas-parser-service.ts`
  - [ ] `src/services/canvas-parser-service.test.ts` → `src/features/dreamweaving/services/canvas-parser-service.test.ts`
  - [ ] `src/services/canvas-layout-service.ts` → `src/features/dreamweaving/services/canvas-layout-service.ts`
  - [ ] `src/services/canvas-observer-service.ts` → `src/features/dreamweaving/services/canvas-observer-service.ts`
  - [ ] `src/services/submodule-manager-service.ts` → `src/features/dreamweaving/services/submodule-manager-service.ts`
  - [ ] `src/services/submodule-manager-service.test.ts` → `src/features/dreamweaving/services/submodule-manager-service.test.ts`
- [ ] Move DreamSong services:
  - [ ] `src/services/dreamsong/` → `src/features/dreamweaving/dreamsong/`
  - [ ] `src/services/dreamsong-parser-service.ts` → `src/features/dreamweaving/dreamsong-parser-service.ts`
  - [ ] `src/services/dreamsong-relationship-service.ts` → `src/features/dreamweaving/dreamsong-relationship-service.ts`
- [ ] Verify existing components:
  - `AudioClipPlayer.tsx`
  - `ConversationsSection.tsx`
  - `DreamSong.tsx`
  - `DreamSongWithExtensions.tsx`
  - `PerspectivesSection.tsx`
  - `ReadmeSection.tsx`
- [ ] Update imports to use core paths
- [ ] Create `index.ts` barrel export

### 2.6 Search (UI components)
- [ ] Verify `SearchNode3D.tsx` and `SearchOrchestrator.tsx` are in correct location
- [ ] Update imports to use core paths
- [ ] Create `index.ts` barrel export

### 2.7 Creation
- [ ] Verify `ProtoNode3D.tsx` location
- [ ] Update imports to use core paths
- [ ] Create `index.ts` barrel export

### 2.8 Radial Buttons
- [ ] Verify components location
- [ ] Update imports to use core paths
- [ ] Create `index.ts` barrel export

**Checkpoint:** `npm run check-all` → Commit "Phase 2: Organize existing features"

---

## Phase 3: Extract New Features

**Goal:** Create new feature directories from scattered code.

### 3.1 Video Calling
- [ ] Create `src/features/video-calling/` directory
- [ ] Move `src/commands/facetime-commands.ts` → `src/features/video-calling/commands.ts`
- [ ] Move `src/services/facetime-service.ts` → `src/features/video-calling/service.ts`
- [ ] Update imports to use core paths
- [ ] Create `index.ts` barrel export

### 3.2 GitHub Publishing
- [ ] Create `src/features/github-publishing/` directory
- [ ] Move `src/commands/github-commands.ts` → `src/features/github-publishing/commands.ts`
- [ ] Move `src/features/github-sharing/GitHubService.ts` → `src/features/github-publishing/service.ts`
- [ ] Move `src/features/github-sharing/dreamsong-standalone/` → `src/features/github-publishing/dreamsong-standalone/`
- [ ] Move `src/features/github-sharing/viewer-bundle/` → `src/features/github-publishing/viewer-bundle/` (if exists)
- [ ] Move `src/services/github-batch-share-service.ts` → `src/features/github-publishing/batch-share-service.ts`
- [ ] Move `src/services/github-network-service.ts` → `src/features/github-publishing/network-service.ts`
- [ ] Move `src/services/share-link-service.ts` → `src/features/github-publishing/share-link-service.ts`
- [ ] Delete empty `src/features/github-sharing/` directory
- [ ] Update imports to use core paths
- [ ] Create `index.ts` barrel export

### 3.3 Constellation
- [ ] Create `src/features/constellation/` directory
- [ ] Move `src/commands/constellation-commands.ts` → `src/features/constellation/commands.ts`
  - Remove `debug-constellation-data` command
- [ ] Move `src/dreamspace/constellation/` → `src/features/constellation/`
  - `ClusterRefinement.ts`
  - `ConstellationEdges.tsx`
  - `ConstellationLayout.ts`
  - `DreamSongThread3D.tsx`
  - `Edge3D.tsx`
  - `ForceDirected.ts`
  - `LayoutConfig.ts`
  - `SphericalProjection.ts`
  - `clustering.ts`
- [ ] Update imports to use core paths
- [ ] Create `index.ts` barrel export

### 3.4 Updates
- [ ] Create `src/features/updates/` directory
- [ ] Move `src/commands/update-commands.ts` → `src/features/updates/commands.ts`
- [ ] Move `src/commands/dreamer-update-commands.ts` → `src/features/updates/dreamer-update-commands.ts`
- [ ] Move `src/services/update-checker-service.ts` → `src/features/updates/update-checker-service.ts`
- [ ] Move `src/services/update-summary-service.ts` → `src/features/updates/update-summary-service.ts`
- [ ] Update imports to use core paths
- [ ] Create `index.ts` barrel export

### 3.5 Coherence Beacon
- [ ] Create `src/features/coherence-beacon/` directory
- [ ] Move `src/commands/coherence-beacon-commands.ts` → `src/features/coherence-beacon/commands.ts`
- [ ] Move `src/services/coherence-beacon-service.ts` → `src/features/coherence-beacon/service.ts`
- [ ] Update imports to use core paths
- [ ] Create `index.ts` barrel export

### 3.6 Social Resonance (Radicle P2P)
- [ ] Create `src/features/social-resonance/` directory
- [ ] Move `src/commands/radicle-commands.ts` → `src/features/social-resonance/commands.ts`
- [ ] Move `src/commands/housekeeping-commands.ts` → `src/features/social-resonance/housekeeping-commands.ts`
- [ ] Move `src/services/radicle-service.ts` → `src/features/social-resonance/radicle-service.ts`
- [ ] Move `src/services/radicle-batch-init-service.ts` → `src/features/social-resonance/batch-init-service.ts`
- [ ] Move `src/services/uri-handler-service.ts` → `src/features/social-resonance/uri-handler-service.ts`
- [ ] Update imports to use core paths
- [ ] Create `index.ts` barrel export

### 3.7 Web Link Analyzer (already in features)
- [ ] Update imports to use core paths
- [ ] Move `src/services/web-link-analyzer-service.ts` → `src/features/web-link-analyzer/service.ts`
- [ ] Create `index.ts` barrel export

**Checkpoint:** `npm run check-all` → Commit "Phase 3: Extract new features"

---

## Phase 4: Update Main Entry Point

**Goal:** Update `src/main.ts` to use new paths.

### 4.1 Update Imports
- [ ] Update all import paths in `main.ts` to use new core/ and features/ locations
- [ ] Update command registration to use new paths
- [ ] Update service initialization to use new paths

### 4.2 Update Browser Entry Points
- [ ] Update `src/browser-main.tsx` imports
- [ ] Update `src/dev/browser-demo.tsx` imports

**Checkpoint:** `npm run check-all` → Commit "Phase 4: Update main entry point"

---

## Phase 5: Final Cleanup

**Goal:** Remove empty directories and verify structure.

### 5.1 Delete Empty Directories
- [ ] Delete `src/commands/` (should be empty)
- [ ] Delete `src/services/` (should be empty)
- [ ] Delete `src/mock/` (should be empty)
- [ ] Delete any other empty directories

### 5.2 Verify Structure
- [ ] Run `find src -type d -empty` to check for empty directories
- [ ] Verify all features have `index.ts` exports
- [ ] Verify core has proper barrel exports

### 5.3 Final Validation
- [ ] Run `npm run check-all`
- [ ] Open Obsidian and verify:
  - [ ] DreamSpace opens correctly
  - [ ] Command palette shows expected commands
  - [ ] Test one command from each feature category

**Checkpoint:** `npm run check-all` → Commit "Phase 5: Final cleanup and verification"

---

## Post-Refactor

### Update Documentation
- [ ] Update CLAUDE.md with new directory structure
- [ ] Update any README references to old paths
- [ ] Consider adding path aliases to tsconfig.json (optional)

### Delete This Plan
- [ ] Once refactor is complete and verified, this file can be deleted or archived

---

## Quick Reference: Feature → Files Mapping

| Feature | Commands | Services | Components |
|---------|----------|----------|------------|
| coherence-beacon | coherence-beacon-commands.ts | coherence-beacon-service.ts | (modal in core) |
| constellation | constellation-commands.ts | - | Edge3D, ConstellationEdges, etc. |
| conversational-copilot | commands.ts | 10 services | CopilotModeOverlay |
| dreamweaving | dreamweaving-commands.ts, link-file-commands.ts | canvas-*, submodule-*, dreamsong/* | DreamSong, AudioClipPlayer, etc. |
| edit-mode | edit-mode-commands.ts | - | EditModeOverlay, EditNode3D, etc. |
| github-publishing | github-commands.ts | GitHubService, batch-share, network, share-link | dreamsong-standalone |
| realtime-transcription | transcription-commands.ts | transcription-service.ts | - |
| search | - | - | SearchNode3D, SearchOrchestrator |
| semantic-search | 4 command files | 5 services | - |
| social-resonance | radicle-commands.ts, housekeeping-commands.ts | radicle-service, batch-init, uri-handler | - |
| updates | update-commands.ts, dreamer-update-commands.ts | update-checker, update-summary | - |
| video-calling | facetime-commands.ts | facetime-service.ts | - |
