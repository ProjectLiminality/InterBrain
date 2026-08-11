# CLAUDE.md

Guidance for AI assistants working with this codebase.

## Project Overview

**InterBrain** is a knowledge gardening system implemented as an Obsidian plugin. It organizes knowledge through social relationships rather than hierarchical categories, using git repositories as the fundamental data structure.

### Core Concepts
- **DreamNode**: Git repository representing an idea (Dream) or person (Dreamer)
- **DreamTalk**: Symbolic thumbnail representation of an idea
- **DreamSong**: Detailed explanation with references to other DreamTalks (Obsidian canvas)
- **Liminal Web**: Self-organizing knowledge graph based on social relationships

### ⚠️ CRITICAL: .udd File Structure
The `.udd` file is a **SINGLE JSON FILE**, NOT a directory.
- **Correct**: `DreamNode/.udd` (single file)
- **Wrong**: `DreamNode/.udd/metadata.json` (OBSOLETE)

### ⚠️ CRITICAL: `interbrain://` vs native git URLs
Two URL forms, never interchangeable:
- **`.gitmodules` submodule URLs** use `interbrain://<uuid>` — portable,
  committed, transport-agnostic. The `git-remote-interbrain` helper
  resolves the UUID at git-invocation time (local UUID index first, then
  parent-origin transitivity, then peer registry).
- **git *remotes*** use native `https://github.com/<owner>/<repo>` —
  local config, concrete, never committed. `origin` = your own outbox;
  peer remotes (named after the peer) = their outboxes, fetch-only.

Writing `interbrain://` into a remote, or a native URL into `.gitmodules`,
breaks resolution. See [docs/specs/rc21-github-transport.md](docs/specs/rc21-github-transport.md).

## Documentation Hierarchy

**Navigate the codebase documentation in this order:**

1. **This file** → Essential patterns and commands
2. **[docs/ROADMAP.md](docs/ROADMAP.md)** → Known issues, polish backlog, planned features — *check here when picking development back up*
3. **[docs/development/operational-context.md](docs/development/operational-context.md)** → Cross-platform dev: Mac↔Windows SSH bridge, Tauri build pipeline, Windows gotchas, file:line maps
4. **[docs/specs/rc21-github-transport.md](docs/specs/rc21-github-transport.md)** → Architecture of the GitHub-as-transport model (the v0.16.0 "Great Simplification")
5. **[src/core/README.md](src/core/README.md)** → Core infrastructure, services, store
6. **[src/features/README.md](src/features/README.md)** → Feature catalog and vertical slice patterns
7. **Individual feature READMEs** → Deep dive into specific features

Each feature README contains: Purpose, Directory Structure, Main Exports, Commands (if any), Dependencies, and Notes.

## Feature Overview

| Feature | Purpose |
|---------|---------|
| **DreamNode Family** | |
| `dreamnode` | Core types, services, git operations, 3D visualization |
| `dreamnode-creator` | Node creation workflow UI |
| `dreamnode-editor` | Node editing workflow UI |
| **Layout & Navigation** | |
| `constellation-layout` | Fibonacci sphere distribution (night sky view) |
| `liminal-web-layout` | Focused node with related nodes in rings |
| `songline` | Audio clip navigation through node history |
| **Content & Canvas** | |
| `dreamweaving` | Canvas parsing, submodules, DreamSong playback |
| `drag-and-drop` | File and URL drop handling |
| `web-link-analyzer` | AI-powered URL content analysis |
| **Search & AI** | |
| `search` | Search overlay UI and result display |
| `semantic-search` | Vector embeddings and similarity search (Ollama) |
| `conversational-copilot` | AI conversation mode with node invocation |
| **Collaboration** | |
| `social-resonance-filter` | GitHub-outbox collaboration: sovereignty, sharing, peer curation |
| `coherence-beacon` | Automatic relationship discovery via git hooks |
| `github-publishing` | GitHub sharing + Pages broadcast |
| `video-calling` | Video call initiation |
| **UI & System** | |
| `action-buttons` | Radial action menu around nodes |
| `realtime-transcription` | Voice transcription via Python backend |
| `settings` | Plugin settings tab |
| `dreamnode-updater` | Update preview and apply workflow |
| `uri-handler` | interbrain:// protocol handling |
| `tutorial` | Onboarding with Manim-style text animations |

## Technology Stack

- **Platform**: Obsidian plugin (TypeScript) + a Tauri desktop companion
  app (Rust daemon) — see *Desktop App Architecture* below
- **3D Rendering**: React Three Fiber (R3F)
- **State Management**: Zustand with slice composition
- **Build**: Vite (plugin) + Tauri (daemon); see *Cross-Platform Release Build*
- **Testing**: Vitest
- **Collaboration transport**: GitHub (HTTPS) — every peer has their own
  GitHub repo per DreamNode ("outbox"); sharing also publishes the node
  via GitHub Pages (#409: sharing is publishing). The retired Radicle P2P
  prototype is preserved on `feature/webrtc-transport`.
- **AI**: Ollama for embeddings, Claude API for summaries

## Desktop App Architecture

As of v0.16.0 InterBrain is **plugin + desktop companion app**, not a
plugin alone.

- **The plugin** (this repo's `src/`) runs inside Obsidian — the 3D
  DreamSpace, DreamNode/DreamSong UI, all the knowledge-gardening UX.
- **The daemon** (`desktop/src-tauri/`, Rust + Tauri) runs in the system
  tray. It owns: the first-run setup flow, the system-level settings
  dashboard, vault registration, the `git-remote-interbrain` helper, the
  UUID index, GitHub identity (via `gh` CLI), and the
  `interbrain://`→`https://github.com/...` resolution.
- **Plugin ↔ daemon** talk over a local WebSocket IPC bridge
  (`src/features/desktop-bridge/`). The plugin discovers the daemon's port
  from a file in the daemon's config dir.
- **Install**: users download a platform installer (`.dmg` / `.exe` /
  `.AppImage`), which drops the daemon in place; first-run installs the
  plugin into a chosen Obsidian vault.

The collaboration model — sovereign outboxes, peer remotes, the
cherry-pick "social resonance filter" — is documented in
[docs/specs/rc21-github-transport.md](docs/specs/rc21-github-transport.md).
Cross-platform dev mechanics (the Mac↔Windows SSH bridge, build pipeline,
Windows gotchas) are in
[docs/development/operational-context.md](docs/development/operational-context.md).

## Architecture Principles

### Layout State Machine (Critical)

The spatial layout system uses an **explicit state machine**, NOT React's reactive system.

**Key Principle:** Event handlers call the orchestrator directly. `useEffect` is NEVER used to trigger layout transitions.

```
Event → deriveIntent() → executeLayoutIntent() → [store updated as side effect]
```

- **DO**: Call `orchestrator.executeLayoutIntent(intent)` directly in event handlers
- **DON'T**: Watch `spatialLayout` in `useEffect` to trigger orchestration

See `docs/architecture/layout-state-machine.md` for the complete state machine specification.

### Vertical Slice Architecture

Features are self-contained folders with everything they need.

```
src/
├── core/           # Shared infrastructure (store, services, components)
└── features/       # Self-contained feature slices
    └── [feature]/
        ├── store/slice.ts      # Feature-specific Zustand slice
        ├── services/           # Business logic
        ├── components/         # UI components
        ├── commands.ts         # Obsidian commands
        ├── index.ts            # Barrel export
        └── README.md           # Feature documentation
```

**Key Rules**:
1. Features own their state, services, and components
2. Commands delegate to services (never direct git operations)
3. UI calls commands via `executeCommandById()`, not services directly
4. **File System Access**:
   - For vault files: Use `VaultService` from `src/core/services/vault-service.ts`
   - For temp files outside vault (e.g., `/tmp/`): Use `require('fs')` directly
   - **Never** use `import('fs')` - dynamic imports don't resolve in Electron
   - VaultService is the canonical wrapper for vault-relative fs operations
5. **Anti-pattern**: Never use CSS transforms for 3D positioning in R3F
6. **AI Integration**: ALL AI functionality MUST use the `ai-magic` feature slice:
   - Import from `src/features/ai-magic/services/inference-service.ts`
   - Use `getInferenceService().generate({ prompt, maxTokens })` for completions
   - Never call AI APIs directly - always go through InferenceService
   - This ensures consistent provider handling (Claude, Ollama, OpenAI, Groq, xAI)

## Essential Commands

```bash
npm run dev          # Start browser dev server (http://localhost:5173)
npm run build        # Build plugin for Obsidian
npm run check-all    # Lint + typecheck + test (run before commits)
```

## Development Workflow

### Branch Strategy

```
main (stable releases — what the release page builds from)
  └── feature/* (active development; fast-forwards into main when shipping)
```

- **`main`**: Stable, tagged releases. The Release CI workflow builds
  installers from tags on main.
- **`feature/*`**: Where work happens. When a feature line is validated
  and ready, fast-forward `main` to it (the branch *is* the work — no
  separate `develop` integration branch).

**Shipping a release** (this is how v0.16.0 went out):
```bash
# on feature/<name>, validated and ready:
# 1. bump version in desktop/src-tauri/{Cargo.toml,tauri.conf.json}
# 2. cargo check (refreshes Cargo.lock), commit the bump
git branch -f main feature/<name>          # fast-forward main
git push origin main
git tag -a vX.Y.Z main -m "..." && git push origin vX.Y.Z   # triggers Release CI
```

During an iteration cycle, cut release-candidate tags (`vX.Y.Z-rc.N`) off
the feature branch to exercise the full CI build + install loop; only the
final validated candidate gets promoted to a clean `vX.Y.Z` on main.

### Cross-Platform Release Build

`vX.Y.Z` (and `vX.Y.Z-rc.N`) tags trigger `.github/workflows/release.yml`,
a 3-OS matrix producing: macOS universal `.dmg` + `.app.tar.gz`, Windows
NSIS `.exe` + WiX `.msi`, Linux `.deb` + `.AppImage`. ~18 min (macOS
universal lipo is the slow leg). The plugin payload + `DreamNode-template`
must be bundled as Tauri *resources* — see operational-context.md §4.

For local daemon iteration use `cd desktop && npm run build:daemon`
(`tauri build --no-bundle`). Never plain `cargo build` — that bakes in
`devUrl` and ships a blank dashboard. Full detail + the macOS↔Windows SSH
dev loop in [docs/development/operational-context.md](docs/development/operational-context.md).

### Slash Commands

For systematic workflow (optional, for larger features):
- `/epic-start` - Begin new epic with branch setup
- `/feature-start` - Start feature with issue refinement
- `/feature-complete` - Complete feature with user testing
- `/epic-complete` - Finalize epic with QA and release

**Issue Hierarchy**: Epic → Features (2-tier, simplified)

## GitHub CLI Reference

**List issues**:
```bash
gh issue list --repo ProjectLiminality/InterBrain --label epic --state open
gh issue list --repo ProjectLiminality/InterBrain --label feature --state open
gh issue view ISSUE_NUMBER
```

**Create issues**:
```bash
gh issue create --repo ProjectLiminality/InterBrain \
  --title "Epic N: Title" \
  --label epic \
  --body "## Vision\n\nDescription\n\n## Success Criteria\n\n- [ ] Criteria"

gh issue create --repo ProjectLiminality/InterBrain \
  --title "Feature Title" \
  --label feature \
  --body "## Description\n\n## Acceptance Criteria\n\n- [ ] Criteria"
```

**Close with summary**:
```bash
gh issue close ISSUE_NUMBER --comment "Session summary here"
```

## Project Board Management (GraphQL)

**Project Board IDs**:
- Project: `PVT_kwHOC0_fLc4A9SR1`
- Status Field: `PVTSSF_lAHOC0_fLc4A9SR1zgxCErc`
- Status Options: `f75ad846` (Planning), `47fc9ee4` (Active), `98236657` (Integration), `e1f23fa9` (Complete)

**Find issue's project item ID**:
```bash
gh api graphql -f query='
{
  repository(owner: "ProjectLiminality", name: "InterBrain") {
    issue(number: ISSUE_NUMBER) {
      projectItems(first: 10) {
        nodes { id }
      }
    }
  }
}'
```

**Move to Complete**:
```bash
gh api graphql -f query='
mutation {
  updateProjectV2ItemFieldValue(
    input: {
      projectId: "PVT_kwHOC0_fLc4A9SR1"
      itemId: "PROJECT_ITEM_ID"
      fieldId: "PVTSSF_lAHOC0_fLc4A9SR1zgxCErc"
      value: { singleSelectOptionId: "e1f23fa9" }
    }
  ) { projectV2Item { id } }
}'
```

## GitHub Links

- **Repository**: [InterBrain](https://github.com/ProjectLiminality/InterBrain)
- **Project Board**: [InterBrain Development](https://github.com/users/ProjectLiminality/projects/2)
- **Issues**: [GitHub Issues](https://github.com/ProjectLiminality/InterBrain/issues)

## License

GNU AFFERO GENERAL PUBLIC LICENSE
