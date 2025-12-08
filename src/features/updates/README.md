# Updates Feature

Manages checking, summarizing, and applying updates for DreamNodes from git/Radicle remotes.

## Purpose

Automatically fetches updates for all DreamNodes on plugin load, provides user-friendly summaries using LLM, and handles update workflows including submodule synchronization.

## Key Files

### Services
- **update-checker-service.ts** - Background service that fetches updates for all DreamNodes in parallel, stores results in Zustand store
- **update-summary-service.ts** - LLM-powered update summaries (falls back to keyword-based parsing if no API key), translates git commits to user-friendly descriptions
- **updates-slice.ts** - Zustand state slice for storing `FetchResult` status per DreamNode (non-persisted)

### Commands
- **commands.ts** - Core update commands: check for updates, preview with modal, apply updates, handle submodule sync from standalone repos
- **dreamer-update-commands.ts** - Batch check all Dream nodes related to a selected Dreamer node

### UI
- **ui/update-preview-modal.ts** - Modal showing update summary with commit details, grouped by peer/source, accept/reject actions

## Main Exports

```typescript
export { registerUpdateCommands } from './commands';
export { registerDreamerUpdateCommands } from './dreamer-update-commands';
export { UpdateCheckerService } from './update-checker-service';
export { UpdateSummaryService } from './update-summary-service';
```

## Submodule Update Flow

Unique workflow: When a Dream node (e.g., Cylinder) has submodules (e.g., Circle), and the standalone Circle repo gets updated, the commands detect this divergence and allow syncing the submodule from the standalone version.

**Workflow**: Standalone update → network share → submodule check → pull standalone into submodule → commit pointer update

## InterBrain Special Case

When updating the InterBrain DreamNode itself (hardcoded UUID `550e8400-e29b-41d4-a716-446655440000`), automatically runs build and plugin reload after applying updates.

## Notes

- Update checker runs on plugin load (non-blocking background operation)
- Visual indicators: Update status stored in Zustand enables glow effects on nodes with updates
- Read-only repo handling: Warns users about divergent branches, offers hard reset to remote
- Coherence beacon integration: After pulling updates, checks commits for relationship announcements
- Unused code: `generateUpdatePreviewMarkdown()` function kept for potential future use
