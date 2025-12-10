# Features Directory

Self-contained feature slices following **Vertical Slice Architecture**. Each feature owns its domain logic, state, services, and components.

## Feature Slice Architecture

### Directory Structure Pattern

Features organize code by **category subdirectories** when complexity warrants it:

```
features/
├── dreamnode/              # Complex feature - full structure
│   ├── store/
│   │   └── slice.ts        # Zustand slice for feature state
│   ├── services/           # Orchestrators with state/side-effects
│   │   ├── git-dreamnode-service.ts
│   │   ├── udd-service.ts
│   │   └── media-loading-service.ts
│   ├── utils/              # Stateless pure functions
│   │   ├── git-utils.ts
│   │   ├── vault-scanner.ts
│   │   └── repo-initializer.ts
│   ├── components/         # React/R3F components
│   │   ├── DreamNode3D.tsx
│   │   └── ...
│   ├── types/              # TypeScript interfaces
│   │   └── dreamnode.ts
│   ├── styles/             # CSS and style constants
│   ├── commands.ts         # Obsidian command registrations
│   ├── test-utils.ts       # Mock factories for testing
│   ├── README.md           # Feature documentation
│   └── index.ts            # Barrel export
│
├── settings/               # Simple feature - flat structure
│   ├── settings-tab.ts     # Single service file (no services/ needed)
│   ├── settings-status-service.ts
│   ├── README.md
│   └── index.ts
```

### When to Use Subdirectories

| Category | Create subdirectory when... |
|----------|---------------------------|
| `store/` | Feature has Zustand state (always use for slices) |
| `services/` | 2+ service files, or 1 complex service |
| `utils/` | 2+ utility files |
| `components/` | 2+ React components |
| `types/` | 2+ type definition files |
| `styles/` | 2+ style files |

**Guidance**: Use subdirectories for **semantic clarity**, not just file count. A single `store/slice.ts` is clearer than `feature-slice.ts` at the root.

### File Naming Conventions

| File Type | Naming Pattern | Example |
|-----------|---------------|---------|
| Store slice | `store/slice.ts` | `dreamnode/store/slice.ts` |
| Service | `*-service.ts` | `git-dreamnode-service.ts` |
| Utility | `*-utils.ts` or descriptive | `git-utils.ts`, `vault-scanner.ts` |
| Component | `PascalCase.tsx` | `DreamNode3D.tsx` |
| Types | `*.ts` (descriptive) | `dreamnode.ts` |
| Commands | `commands.ts` | `commands.ts` |
| Barrel | `index.ts` | `index.ts` |

### Service vs Utility Distinction

**Services** (in `services/`):
- Have state or manage side effects
- Orchestrate multiple operations
- May hold references (singletons, caches)
- Example: `GitDreamNodeService` - manages node CRUD with store updates

**Utilities** (in `utils/`):
- Pure functions, stateless
- Single-purpose operations
- Easily testable in isolation
- Example: `gitUtils.getGitStatus(repoPath)` - runs git command, returns result

### Barrel Export Pattern

Every feature has an `index.ts` that exports its public API:

```typescript
// features/dreamnode/index.ts

// Store (state management)
export * from './store/slice';

// Types
export * from './types/dreamnode';

// Services (orchestrators)
export { GitDreamNodeService } from './services/git-dreamnode-service';

// Utilities (namespaced to avoid collisions)
export * as gitUtils from './utils/git-utils';
export * as vaultScanner from './utils/vault-scanner';

// Components
export { default as DreamNode3D } from './components/DreamNode3D';

// Commands
export { registerDreamNodeCommands } from './commands';
```

**Namespace exports** (`export * as gitUtils`) prevent naming collisions between features.

## Feature Catalog

| Feature | Purpose | Complexity |
|---------|---------|------------|
| [dreamnode](./dreamnode/README.md) | Core DreamNode data, git operations, 3D visualization | High |
| [dreamweaving](./dreamweaving/README.md) | Canvas parsing, submodules, DreamSong playback | High |
| [constellation-layout](./constellation-layout/README.md) | Fibonacci sphere distribution of all nodes | Medium |
| [liminal-web-layout](./liminal-web-layout/README.md) | Focused node with related nodes in rings | Medium |
| [conversational-copilot](./conversational-copilot/README.md) | AI conversation mode with node invocation | Medium |
| [semantic-search](./semantic-search/README.md) | Vector embeddings and similarity search | High |
| [edit-mode](./edit-mode/README.md) | Node editing with relationship management | Medium |
| [search](./search/README.md) | Search overlay and result display | Low |
| [creation](./creation/README.md) | Node creation UI and state management | Medium |
| [drag-and-drop](./drag-and-drop/README.md) | File and URL drop handling | Medium |
| [radial-buttons](./radial-buttons/README.md) | Radial action menu around nodes | Low |
| [realtime-transcription](./realtime-transcription/README.md) | Voice transcription via Python backend | Medium |
| [social-resonance](./social-resonance/README.md) | Radicle P2P integration | Medium |
| [coherence-beacon](./coherence-beacon/README.md) | Node synchronization beacons | Medium |
| [video-calling](./video-calling/README.md) | WebRTC video call integration | Medium |
| [web-link-analyzer](./web-link-analyzer/README.md) | AI-powered URL content analysis | Low |
| [github-publishing](./github-publishing/README.md) | Publish nodes to GitHub | Medium |
| [settings](./settings/README.md) | Plugin settings tab | Low |
| [updates](./updates/README.md) | Plugin update checking | Low |
| [uri-handler](./uri-handler/README.md) | interbrain:// protocol handling | Low |
| [songline](./songline/README.md) | Songline navigation feature | Low |

## Creating a New Feature

1. **Create the directory**: `src/features/my-feature/`

2. **Add README.md** with:
   - Purpose (1-2 sentences)
   - Key files description
   - Main exports
   - Architecture notes (if complex)

3. **Add index.ts** barrel export

4. **Choose structure based on complexity**:
   - Simple (1-3 files): Flat structure
   - Medium (4-8 files): Add subdirectories as needed
   - Complex (9+ files): Full subdirectory structure

5. **Register with core** (if needed):
   - Add slice to `core/store/interbrain-store.ts`
   - Add to core README feature table
   - Add to this README feature catalog

## For AI Agents

When working in features:

1. **Read the feature README first** - understand the domain before making changes
2. **Follow existing patterns** - if the feature uses `services/`, add services there
3. **Use barrel exports** - import from `features/X` not `features/X/services/thing`
4. **Keep features isolated** - features should not import from each other (use core as intermediary)
5. **Services orchestrate, utils compute** - put stateful logic in services, pure functions in utils
