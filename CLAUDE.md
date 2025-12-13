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

## Documentation Hierarchy

**Navigate the codebase documentation in this order:**

1. **This file** → Essential patterns and commands
2. **[src/core/README.md](src/core/README.md)** → Core infrastructure, services, store
3. **[src/features/README.md](src/features/README.md)** → Feature catalog and vertical slice patterns
4. **Individual feature READMEs** → Deep dive into specific features

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
| `social-resonance-filter` | Radicle P2P integration & commit propagation |
| `coherence-beacon` | Automatic relationship discovery via git hooks |
| `github-publishing` | GitHub sharing + Pages broadcast |
| `video-calling` | Video call initiation |
| **UI & System** | |
| `action-buttons` | Radial action menu around nodes |
| `realtime-transcription` | Voice transcription via Python backend |
| `settings` | Plugin settings tab |
| `dreamnode-updater` | Update preview and apply workflow |
| `uri-handler` | interbrain:// protocol handling |

## Technology Stack

- **Platform**: Obsidian Plugin (TypeScript)
- **3D Rendering**: React Three Fiber (R3F)
- **State Management**: Zustand with slice composition
- **Build**: Vite (dual workflow: browser dev + plugin build)
- **Testing**: Vitest
- **P2P**: Radicle (macOS/Linux), GitHub fallback (Windows)
- **AI**: Ollama for embeddings, Claude API for summaries

## Architecture Principles

**Vertical Slice Architecture**: Features are self-contained folders with everything they need.

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
4. Node.js `fs` API preferred (VaultService is thin wrapper)
5. **Anti-pattern**: Never use CSS transforms for 3D positioning in R3F

## Essential Commands

```bash
npm run dev          # Start browser dev server (http://localhost:5173)
npm run build        # Build plugin for Obsidian
npm run check-all    # Lint + typecheck + test (run before commits)
```

## Development Workflow

**Slash commands** for systematic workflow:
- `/epic-start` - Begin new epic with branch setup
- `/feature-start` - Start feature with issue refinement
- `/feature-complete` - Complete feature with user testing
- `/epic-complete` - Finalize epic with QA and release

**Branch Strategy**: `main → epic/N-name → feature/name-from-issue`

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
