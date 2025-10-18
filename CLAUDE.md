# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**The InterBrain** is an innovative knowledge management system that transcends traditional "Second Brain" paradigms. It's evolving from a standalone Electron app to a native Obsidian plugin, ultimately forming the foundation for DreamOS - a decentralized, AI-powered operating system for collective sensemaking.

### Core Concepts
- **Dream Nodes**: Git repositories representing either ideas (Dreams) or people (Dreamers)
- **Dream Talk**: Concise, symbolic representations of ideas
- **Dream Song**: Elaborate explanations with references to other Dream Talks
- **Liminal Web**: Self-organizing knowledge based on social relationships

### ⚠️ CRITICAL: .udd File Structure
**IMPORTANT**: The `.udd` file is a **SINGLE JSON FILE**, NOT a directory.
- **Correct**: `DreamNode/.udd` (single file containing all metadata)
- **Wrong**: `DreamNode/.udd/metadata.json` (directory structure - OBSOLETE)

This file contains the complete UDD (Universal Dream Description) schema including:
- `uuid`, `title`, `type`, `dreamTalk`
- `liminalWebRelationships`, `submodules`, `supermodules`
- `email`, `phone`, `radicleId` (contact fields for dreamer-type nodes)

## Current Development Status

**Current Branch**: `main`
**Phase**: Epic 8 Planning - Next Development Cycle

**Epic Progress Summary**:
- ✅ **Epics 1-7 Complete**: Foundation through Conversational Copilot System (see CHANGELOG.md for details)
- 📋 **Epic 8 Next**: Ready for specification and feature planning

**Note**: For detailed achievement history of completed epics, see CHANGELOG.md

## Known Issues & Technical Debt

### Edit Mode Layout Issues
**Status**: Deferred - Requires architectural analysis
**Issue**: When exiting edit-search mode, all search results remain in ring layout instead of intelligently differentiating between:
- **Glowing nodes** (pending relationships) - Should stay in ring
- **Non-glowing nodes** (unrelated search results) - Should fly away to sphere

**Context**: 
- Escape navigation system works correctly (edit-search → edit → liminal-web)
- Store correctly filters `searchResults` to only pending relationships when exiting edit-search
- SpatialOrchestrator maintains separate `relatedNodesList` and `unrelatedSearchResultsList`
- Canvas attempts to call `reorderEditModeSearchResults()` fail due to state coordination issues

**Attempted Solutions** (August 26, 2025):
- Direct filtering in canvas layout handler
- Detection logic for edit-search transitions  
- Multiple `showEditModeSearchResults` vs `reorderEditModeSearchResults` approaches

**Next Steps**: 
- Consider orchestrator state management refactor
- May require unified layout state coordination between store and orchestrator
- Alternative: Accept current behavior as "close enough" for MVP

### Liminal-Web Mode Toggle Issues
**Status**: Deferred - Command queuing complexity  
**Issue**: Quality-of-life toggles from liminal-web mode are unreliable:
- **Search mode toggle**: Sometimes stops at constellation, doesn't complete transition to search
- **Animation conflicts**: Dream node scaling and other effects interrupted by rushed transitions

**Attempted Solutions** (August 26, 2025):
- Sequential command queuing with 300ms delay
- Proper animation timing with 1100ms delay (1000ms + 100ms buffer)
- Fresh store references to prevent stale state

**Root Cause**: Complex interaction between constellation settlement timing, animation states, and command queuing. The transitions work sometimes but are not consistently reliable.

**Next Steps**: 
- Consider simpler approach: disable toggles from liminal-web, require manual constellation return
- Or: Deeper investigation into animation state coordination
- Current workaround: Users can manually go constellation → search/creation

### Copilot Mode Transcript Refocus Polish
**Status**: Deferred - Works but needs reliability improvement (October 3, 2025)
**Issue**: After closing DreamSong/DreamTalk overlay with X button in copilot mode, transcript refocus is not 100% reliable in windowed mode (works fine in fullscreen):
- **Current behavior**: Multiple refocus mechanisms trigger (event-driven, periodic check, overlay close handler)
- **Expected**: Transcript should regain focus immediately for seamless dictation
- **Workaround**: User can click anywhere in dreamspace or on transcript pane to restore focus

**Attempted Solutions**:
- Window focus listeners (browser window.focus())
- Electron BrowserWindow.focus() via remote API
- Programmatic click simulation on editor element
- Multiple timing delays and refocus strategies

**Root Cause**: In windowed mode, clicking X button causes Electron window to lose focus. Multiple refocus attempts trigger but dictation doesn't immediately resume. Likely macOS-specific input activation state issue.

**Next Steps**:
- Consider accepting current behavior as "good enough" - foundation works
- Or: Investigate macOS accessibility APIs for input state activation
- Current workaround is acceptable for MVP

### Progressive Loading for URI Clones
**Status**: Deferred - Future enhancement (October 17, 2025)
**Issue**: GitHub/Radicle clone links block UI during clone operation instead of showing immediate placeholder

**Conceptual Design - Disk-Based Placeholder Approach**:
The key insight is to use **disk as single source of truth** rather than coordinating store-only placeholders:

1. **Immediate Placeholder Creation**:
   - Create directory + minimal `.udd` file BEFORE clone operation
   - Trigger `scanVault()` immediately → shows placeholder in DreamSpace
   - `.udd` contains: uuid, title (normalized from repo name), type, source URL/ID, empty relationships

2. **Background Clone**:
   - Use `git init + remote + fetch + reset --hard` instead of `git clone` (merge-friendly)
   - Allows existing `.udd` file to persist during git operations
   - Clone completes in background without blocking UI

3. **Observation-First Approach**:
   - Test what happens automatically when clone completes (existing code may handle it)
   - Only add custom refresh logic if needed based on observation
   - Simpler than coordinating complex state updates

**Benefits**:
- Single source of truth (disk) eliminates state coordination complexity
- Leverages existing `scanVault()` infrastructure
- Git-native workflow with merge-friendly operations
- No React state synchronization issues

**Implementation Notes**:
- `createMinimalUDD(destinationPath, repoName, sourceUrl, sourceType)` helper method
- Apply to both GitHub and Radicle clone flows
- Revert all store-only placeholder attempts (too complex)

**Next Steps** (when prioritized):
- Implement for GitHub first, then map to Radicle
- Test placeholder appearance and clone completion behavior
- Document what automatic behavior occurs vs custom logic needed

### Incomplete DreamNode Metadata
**Status**: Known Limitation - Not a Bug (October 18, 2025)
**Issue**: DreamNodes cloned from repositories not fully initialized for InterBrain may exhibit constellation positioning issues:
- **Symptom**: Node may not return to proper constellation position when deselected after auto-focus
- **Root Cause**: Repository missing `.udd` file or has incomplete InterBrain metadata
- **Occurs**: When cloning external/legacy repositories not created through InterBrain
- **Both Radicle and GitHub**: Not specific to one clone method

**Workaround**: Run "Scan vault for dream song relationships" command to refresh constellation layout

**Fixes Applied**:
- ✅ File system timing issue for GitHub clones (async `.udd` write - commit 34658da)
- ✅ Branch selection optimization (clone only `main`, not `gh-pages` - commit 7a7fa2f)

**Resolution**: Acceptable for MVP
- InterBrain-created DreamNodes work correctly out of the box
- Legacy/external repos have simple manual workaround
- Future: Consider auto-detection and repair of incomplete DreamNode metadata

### Proto Node Fly-In Animation Issues
**Status**: Deferred - Animation system complexity (August 26, 2025)
**Issue**: Proto node creation animation system needs refinement:
- **Desired behavior**: Fly-in animation when entering creation mode (like SearchNode3D)
- **Cancel/Escape**: Fly-out animation when canceling creation
- **Save**: Preserve existing save animation (move to final position, fade UI)

**Attempted Solutions**:
- Multiple animation state system with spawn/save/cancel types
- Component mount animation triggers
- Animation timing coordination with useFrame hooks

**Root Cause**: Complex interaction between component lifecycle, animation state management, and useFrame timing. Animation states conflict and create unwanted side effects.

**Next Steps**:
- Consider simpler animation approach focusing only on essential transitions
- May require rethinking animation architecture for creation components
- Alternative: Accept current immediate appearance/disappearance as sufficient for MVP
- **Current Status**: Reverted to stable state (commit 3402622) with working core functionality

### Epic 1 Achievements (July 13, 2025)
- ✅ Obsidian plugin boilerplate with Vite dual workflow
- ✅ Zustand state management with 6 core commands
- ✅ Service layer abstraction (UI, Git, DreamNode, Vault)
- ✅ Vitest testing framework (47 tests passing)
- ✅ Command palette infrastructure established

### Epic 2 Achievements (July 18, 2025)
**All Features Complete**: #253 - 3D Spatial Visualization System | Spec: #265

**✅ Completed Features**:
- ✅ #278 React Three Fiber Integration - Canvas in Obsidian workspace
- ✅ #306 DreamNode 3D Component - Star rendering with decoupled architecture
- ✅ #307 Layout State Management - Integrated with Zustand store
- ✅ #308 Rotatable Sphere Interaction - Google Earth style virtual trackball
- ✅ #279 Fibonacci Sphere Layout - Golden ratio node distribution
- ✅ #281 Dynamic View Scaling - Apple Watch style distance-based scaling

**✅ Integration Complete**:
- 84 unit tests passing (100% coverage for new components)
- Zero lint warnings or errors
- Full TypeScript type safety
- Documentation updated

### ✅ Major Technical Achievement: Google Earth Style Rotation

**Implementation**: `/src/dreamspace/SphereRotationControls.tsx`
**Documentation**: `/docs/technical-patterns.md` - Complete virtual trackball documentation with academic attribution
**Key Innovation**: Unified rotation mathematics eliminates momentum distortion while maintaining natural physics feel

**Foundation Established**: Epic 2 now has solid foundation for all remaining features. The rotatable sphere interaction provides the core architecture for:
- Static camera + rotatable world pattern
- Unified layout management system 
- Performance-optimized Group transformations
- Debug tooling infrastructure via Obsidian commands

### GitHub Infrastructure
- **Repository**: [InterBrain](https://github.com/ProjectLiminality/InterBrain)
- **Project Board**: [InterBrain Development](https://github.com/users/ProjectLiminality/projects/2)
- **Issue Tracking**: [GitHub Issues](https://github.com/ProjectLiminality/InterBrain/issues)
- **Prototype Archive**: [InterBrain-Prototype](https://github.com/ProjectLiminality/InterBrain-Prototype)

## Architecture Philosophy: AI-First Development

This project follows a **Pragmatic Hybrid Architecture** designed for optimal AI collaboration:

### Core Principle
**AI Readability >= Human Readability** - Code organization prioritizes context locality for AI assistants over traditional human-centric patterns.

### Architectural Pattern
Combines **Vertical Slice Architecture** (organize by feature) with **Atomic Design Principles** (shared UI components).

### Recommended Project Structure

```
interbrain-plugin/
├── main.ts                     # Plugin entry point - registers all commands
├── manifest.json               # Plugin metadata for Obsidian
├── package.json               # Dependencies and build scripts
├── src/
│   ├── commands/               # Command palette command definitions
│   ├── services/               # Service layer for business logic
│   ├── dreamspace/             # Core 3D/spatial domain logic
│   ├── features/               # Self-contained features (Vertical Slices)
│   ├── components/             # Shared UI (Atomic Design)
│   └── types/                  # TypeScript type definitions
└── styles.css                  # Plugin-specific styles
```

### Development Rules

1. **Commands Before UI**: Create command palette commands before building UI components
2. **Service Layer Abstraction**: Commands delegate to services, never direct git operations
3. **Mock/Real Service Swapping**: Use service interface pattern with MockDreamNodeService and GitDreamNodeService for fast UI iteration
4. **Default to Feature Slice**: New components go inside their feature folder first
5. **Promote to Shared Only on Second Use**: Move to `/components` only when needed by multiple features
6. **Dreamspace is Core Engine**: `/dreamspace` contains fundamental 3D/spatial logic only
7. **UI Calls Commands**: UI components use `executeCommandById()`, never call services directly
8. **Document for AI**: Every feature folder needs a `README.md` with high-level summary
9. **Testing Before Commits**: Use Playwright MCP to validate features work in browser before any git operations
10. **Node.js fs Preferred**: Use Node.js fs API directly for file operations, with VaultService as thin wrapper for path resolution
11. **❌ ANTI-PATTERN: Never use CSS transforms for 3D positioning** - Always use native React Three Fiber 3D positioning (groups, position props, rotation props) instead of CSS 2D hacks like `translateZ()` or `rotateY()`. CSS transforms are fundamentally 2D and break true 3D depth in R3F space.

### Epic 3 Service Layer Pattern
```typescript
interface DreamNodeService {
  create(title: string, type: NodeType, dreamTalk?: File): Promise<DreamNode>
  update(id: string, changes: Partial<DreamNode>): Promise<void>
  delete(id: string): Promise<void>
  list(): Promise<DreamNode[]>
}

// Runtime switching for development:
// - MockDreamNodeService: Fast UI iteration, no file system
// - GitDreamNodeService: Real git operations with DreamNode template
// - Command palette toggle: "Switch to Mock Data" / "Switch to Real Data"
```

## Technology Stack

### Current Implementation (Epic 1 Complete)
- **Build System**: Vite with dual workflow (browser dev + plugin build)
- **Plugin Architecture**: Obsidian Plugin API with TypeScript
- **State Management**: Zustand reactive store
- **Testing**: Vitest with comprehensive mocking
- **Services**: UI, Git, DreamNode, and Vault service layers
- **Commands**: 6 core commands via Obsidian command palette
- **File System**: Node.js fs API (preferred) with VaultService as thin wrapper

### Epic 3 Implementation (COMPLETE - Ready for Main Merge)
- **Service Layer**: Interface-based architecture with mock/real implementations ✅
- **DreamNode Template**: Git template system stored in plugin directory with hooks ✅
- **Creator Mode Pattern**: Workspace isolation via automatic git stash operations ✅
- **DreamNode Selection**: Click-to-select infrastructure with visual feedback ✅
- **Visual Git States**: Red (work-in-progress), blue (unpushed), clean state indicators ✅
- **Mock Development**: Dynamic Zustand store for fast UI iteration without git complexity ✅
- **Git Operations**: `git init --template` for clean DreamNode repo creation ✅

### Planned Technologies (Future Epics)
- **Frontend**: React + React Three Fiber (R3F) for 3D visualization
- **File System**: Obsidian Vault API + shell git commands
- **Storage**: Git repositories as data structure
- **UI**: Atomic Design with shared component library
- **AI Integration**: Aider, Claude, and other AI pair-programming tools

## Development Workflow

**Core Development Commands**: Use slash commands for systematic workflow execution:
- `/epic-start` - Begin new epic with specification clarity and branch setup
- `/feature-start` - Start feature with knowledge transfer and issue refinement
- `/feature-complete` - Complete feature with mandatory user testing and integration
- `/epic-complete` - Finalize epic with quality assurance, documentation, and release

**Key Principles**:
- **Issue Clarity Before Implementation**: Always refine issues through knowledge transfer interviews
- **User Testing Protocol**: Never commit without user validation
- **3-Tier Hierarchy**: Epic → Specification → Features
- **Branch Strategy**: `main → epic/N-name → feature/name-from-issue`

## Epic Quick Reference

**Completed Epics**:
- **Epic 1**: #252 - Plugin Infrastructure ✅ Complete
- **Epic 2**: #253 - 3D Spatial Visualization System ✅ Complete
- **Epic 3**: #254 - DreamNode Management System ✅ Complete
- **Epic 4**: #255 - Liminal Web Layout System ✅ Complete
- **Epic 5**: #256 - Semantic Search System ✅ Complete
- **Epic 6**: #259 - DreamWeaving Operations ✅ Complete
- **Epic 7**: Spec #269 - Conversational Copilot System ✅ Complete

**Next Epic**:
- **Epic 8**: Ready for specification and feature planning

**Current Project Status**:
- **7 major epics completed** with comprehensive feature sets
- **Foundation established** for conversational AI-powered knowledge work
- **Next development cycle** ready for community input and prioritization

## Technical Documentation References

For detailed technical information, see:

- **[Technical Patterns](docs/technical-patterns.md)**: Proven algorithms, spatial layouts, and code patterns from prototype
- **[UX Specifications](docs/ux-specifications.md)**: Detailed interaction flows, search functionality, and user experience design
- **[Architecture Details](docs/architecture-details.md)**: DreamNode lifecycle, git operations, coherence beacon system, and technical implementation

## GitHub CLI Commands Reference

**List All Open Epics**:
```bash
gh issue list --repo ProjectLiminality/InterBrain --label epic --state open
```

**List All Open Specifications**:
```bash
gh issue list --repo ProjectLiminality/InterBrain --label specification --state open
```

**List All Open Features**:
```bash
gh issue list --repo ProjectLiminality/InterBrain --label feature --state open
```

**View Issue Details**:
```bash
gh issue view ISSUE_NUMBER
```

**Check Your Assigned Issues**:
```bash
gh issue list --assignee @me --state open
```

**Feature Branch Completion Workflow** (NOT Epic Completion):
1. **Complete Implementation**: All acceptance criteria met (no version bumping or CHANGELOG updates)
2. **Update Issue Body**: Edit issue to check off `[x]` all completed criteria  
3. **Close with Session Summary**: `gh issue close ISSUE_NUMBER --comment "session summary"`
4. **Merge to Epic Branch**: Merge feature branch to epic branch
5. **Clean Up**: Delete feature branch after epic integration

**CRITICAL**: Feature branch completion does NOT include:
- Version bumping (happens in Epic completion only)
- CHANGELOG updates (happens in Epic completion only)  
- Documentation updates (happens in Epic completion only)
- Release creation (happens in Epic completion only)

## Advanced GitHub CLI & Project Board Management

### Issue Creation Commands

**Create Epic Issue**:
```bash
gh issue create --repo ProjectLiminality/InterBrain \
  --title "Epic N: Title" \
  --label epic \
  --body "## Vision\n\nDescription\n\n## Success Criteria\n\n- [ ] All child specifications completed\n- [ ] Features integrated and tested\n- [ ] Epic goals achieved\n\n## Development Status\n\nReady for specification"
```

**Create Specification Issue**:
```bash
gh issue create --repo ProjectLiminality/InterBrain \
  --title "Title Specification" \
  --label specification \
  --body "## Overview\n\nTechnical specification\n\n## Architecture\n\nDetails\n\n## Implementation Plan\n\nPlan\n\n## User Experience\n\nUX details\n\n## Feature Breakdown\n\nWill be populated as features are created\n\n## Definition of Done\n\n- [ ] All child Features completed\n- [ ] Integration tested\n- [ ] Documentation complete"
```

**Create Feature Issue**:
```bash
gh issue create --repo ProjectLiminality/InterBrain \
  --title "Feature Title" \
  --label feature \
  --body "## Description\n\nFeature description\n\n## Acceptance Criteria\n\n- [ ] Feature implementation meets specification requirements\n- [ ] User interactions work as designed\n- [ ] Performance meets expected thresholds\n\n## Dependencies\n\n- Parent specification must be approved\n- Any prerequisite features completed\n\n## Definition of Done\n\n- [ ] Implementation complete\n- [ ] Tests passing\n- [ ] Documentation updated\n- [ ] Code reviewed and merged"
```

### Project Board Management (GraphQL API)

**CRITICAL**: Parent-child relationships and project board status are managed via GraphQL API, not basic GitHub CLI.

**Project Board IDs**:
- InterBrain Development: `PVT_kwHOC0_fLc4A9SR1`
- Status Field ID: `PVTSSF_lAHOC0_fLc4A9SR1zgxCErc`
- Status Options: `f75ad846` (Planning), `47fc9ee4` (Active), `98236657` (Integration), `e1f23fa9` (Complete)

**Find Issue Project Item ID**:
```bash
gh api graphql -f query='
{
  repository(owner: "ProjectLiminality", name: "InterBrain") {
    issue(number: ISSUE_NUMBER) {
      id
      projectItems(first: 10) {
        nodes {
          id
          project {
            id
            title
          }
        }
      }
    }
  }
}'
```

**Move Issue to Complete Status**:
```bash
gh api graphql -f query='
mutation {
  updateProjectV2ItemFieldValue(
    input: {
      projectId: "PVT_kwHOC0_fLc4A9SR1"
      itemId: "PROJECT_ITEM_ID_FROM_ABOVE"
      fieldId: "PVTSSF_lAHOC0_fLc4A9SR1zgxCErc"
      value: {
        singleSelectOptionId: "e1f23fa9"
      }
    }
  ) {
    projectV2Item {
      id
    }
  }
}'
```

### Parent-Child Issue Relationships

**IMPORTANT**: GitHub CLI does not directly support parent-child relationships. These are managed through:

1. **Issue Body References**: Include in issue body:
   ```markdown
   **Parent Epic**: #255
   **Parent Specification**: #267
   **Child Features**: #287, #288, #289
   ```

2. **GitHub's Web Interface**: Use "Development" section in issue sidebar to link related issues

3. **Project Board Hierarchy**: Use custom fields in project board to track relationships

### Issue Management Workflow

**Standard Epic Creation Workflow**:
1. Create Epic issue with basic template
2. Add Epic to project board (auto-assigned to Planning status)
3. Create Specification issue with parent reference in body
4. Create Feature issues with parent spec reference
5. Use GraphQL to move issues through project board states as work progresses

**Epic Completion Protocol** (3-Tier Issue Hierarchy):
1. **Complete ALL Implementation Work First**: Code, tests, documentation, merge to main, cleanup
2. **ONLY AFTER Work is Complete**: Update and close issues (Specification first, then Epic)
3. **CHANGELOG Analysis**: Review relevant git commit history (not just project memory) for precise documentation
4. **Pristine Code Requirement**: `npm run check-all` must show zero warnings/errors at any level

**CRITICAL: Never update issue bodies or close issues until all work is merged and complete**

### Critical Commands Reference

**When creating issues**: ALWAYS use the templates above to maintain consistency
**When managing project board**: ALWAYS use GraphQL API for status changes
**When closing epics**: ALWAYS update project board status first, then close issue

**If unsure about any GitHub CLI commands**: Refer to this section FIRST, then use `gh help <command>` for detailed syntax.

## AI Assistant Integration

This project is designed for AI-first development:

### Workflow
- Use AI assistants (Claude, Aider) as primary development partners
- Maintain high context locality for token efficiency
- Document features with AI-readable summaries
- Leverage git-based architecture for AI tool integration

### Context Management
- Each feature slice contains complete context for AI understanding
- Avoid scattering related functionality across multiple directories
- Use descriptive folder and file names for AI comprehension

### Playwright MCP Testing Integration
- **Dev Server Management**: User starts dev server (`npm run dev`) - AI never starts it to avoid breaking agentic loop
- **Browser Testing**: Use Playwright MCP to validate functionality at `http://localhost:5173`
- **Validation Protocol**: Test features in actual browser environment before commits
- **Console Monitoring**: Ensure clean console logs (no errors/warnings)
- **Screenshot Documentation**: Capture visual proof of working features
- **Testing-First Completion**: No git operations until browser testing confirms functionality works

## Obsidian Plugin Integration Approach

**Custom View Type Registration**:
- Register "dreamspace" as a new view type in Obsidian
- Implement WorkspaceLeaf with React Three Fiber canvas
- Support fullscreen mode via CSS transforms

**File System Integration**:
- Use Obsidian's Vault API for file operations
- Shell out to git commands for repository management
- Parse .canvas files using Obsidian's built-in canvas functionality

**Canvas Integration**:
- Leverage existing Obsidian canvas files for DreamSong content
- Watch for changes to .canvas files via Obsidian's file events
- Parse canvas topology on git commits to update DreamSong UI

## Epic 3 Git Workflow Patterns

### DreamNode Template System
```bash
# Template stored in plugin directory (outside vault)
DreamNode-template/
├── .udd                  # Single JSON file: UUID, title, type, dreamTalk, relationships
├── hooks/
│   ├── pre-commit        # Template initialization + canvas validation
│   ├── post-commit       # Bidirectional supermodule tracking
│   └── hook-helper.js    # Node.js utilities for hook operations
└── README.md            # DreamNode documentation

# DreamNode creation:
git init --template=${pluginPath}/DreamNode-template
```

### Git Hooks System (Coherence Beacon Foundation)

**Pre-Commit Hook** - Initialization & Validation:
- **First commit only**: Moves template files (.udd, README.md, LICENSE) from `.git/` to working directory
- **Canvas validation**: Warns when committing `.canvas` files, reminds user to run "Sync Canvas Submodules"
- **Non-blocking**: Always allows commit to proceed (just provides helpful reminders)

**Post-Commit Hook** - Bidirectional Relationship Tracking:
- **Detects submodule changes**: Compares `.gitmodules` between HEAD and HEAD~1
- **Added submodules**:
  - Initializes submodule to ensure `.udd` is readable
  - Adds child UUID to parent's `submodules` array
  - Adds parent UUID to child's `supermodules` array
  - Commits relationship in child repo
- **Removed submodules**:
  - Removes child UUID from parent's `submodules` array
  - Child's `supermodules` becomes stale (acceptable - will sync on next use)
- **Automatic commits**: Creates "Update submodule relationships" commit in parent repo

**Hook Helper Script** (`hook-helper.js`):
- **UDD operations**: Read, write, add/remove supermodule/submodule relationships
- **Git operations**: Parse `.gitmodules`, compare commits, execute git commands
- **Callable from shell**: Provides CLI interface for hook scripts
- **Reusable logic**: Shared utilities for both pre-commit and post-commit hooks

**Key Design Decisions**:
- Git natively tracks submodules via `.gitmodules`, BUT `.udd` also tracks them for:
  - UUID-based relationships (git uses paths, we use UUIDs)
  - Coherence Beacon discovery (who uses this DreamNode?)
  - Symmetry with `supermodules` array
- Bidirectional tracking: Parent tracks children (`submodules`), children track parents (`supermodules`)
- Hooks use Node.js for complex logic (JSON parsing, file I/O)
- All hook output goes to stderr (keeps stdout clean for git)
- Hooks never fail - log errors but allow operations to complete

### Creator Mode Workflow (Feature #310 Complete)
```bash
# Enter Creator Mode (restore work-in-progress):
git stash pop || true  # Handle empty stash gracefully

# Exit Creator Mode (preserve work-in-progress):
git add -A && git stash push -m "InterBrain creator mode"

# Save Action (commit and exit creator mode):
git add -A && git commit -m "User commit message"
```

**Visual Git State Hierarchy**:
- **Red Glow**: Uncommitted OR stashed changes (work-in-progress takes priority)
- **Blue Glow**: Committed but unpushed changes (ready to share)
- **Clean**: No glow for synchronized repositories
- **Detection**: `git status --porcelain=v1 --branch` with regex parsing for unpushed commits

### Development Mode Switching
```typescript
// Command palette commands for development:
// "InterBrain: Switch to Mock Data" - Fast UI iteration
// "InterBrain: Switch to Real Data" - Full git integration
// "InterBrain: Reset Mock Store" - Clean slate for testing
```

## Testing Best Practices

**Comprehensive Validation Command**:
- Always use `npm run check-all` for complete code validation
- This single command runs tests, linting, and type checking
- Replaces the need to run separate npm commands
- Run this before committing changes or completing features

**VaultService Testing Decision**:
- **DO NOT create unit tests for VaultService** - Deliberate architectural decision
- **Rationale**: VaultService is a thin wrapper around Node.js fs operations (migrated from hybrid Obsidian API in commit 753c260)
- **Why no tests**: Testing direct filesystem operations in unit tests is complex, brittle, and provides little value
- **Coverage strategy**: Integration tests and real-world usage provide sufficient validation
- **Previous attempt**: Epic 6 cleanup revealed obsolete tests testing non-existent hybrid API - removed entirely
- **Future**: If VaultService grows business logic beyond fs wrappers, add tests for that logic only, not fs operations

**Epic Completion Workflow**:
- **MANDATORY**: Comprehensive quality assurance and documentation updates before merging to main
- **NO RELEASE BRANCHES**: All updates happen directly on the epic branch
- **Philosophy**: Bring work to completion with all quality housekeeping addressed

### Phase 1: Quality Assurance & Testing
1. Fix any lint errors, warnings, or type errors
2. Run `npm run check-all` to ensure all tests pass
3. Review test coverage - ensure all new functions have appropriate tests
4. Write any missing tests for edge cases or uncovered code paths

### Phase 2: Documentation Updates
**Follow Documentation Architecture Pattern**:
- **Root level files** (README.md, CHANGELOG.md): High-level updates and cross-references
- **docs/ directory**: Detailed technical documentation updates

**Required Updates**:
1. **README.md**: Update project status, roadmap checkmarks, epic completion notes
2. **CHANGELOG.md**: Add new version section with comprehensive epic details:
   - All completed features with issue numbers
   - Technical achievements and innovations
   - Architecture changes and patterns introduced
   - Any breaking changes or migration notes
3. **Technical Documentation** (docs/):
   - Update relevant files in docs/technical-patterns.md, docs/architecture-details.md, etc.
   - Add new patterns discovered during epic implementation
   - Document any new architectural decisions or patterns
   - Ensure cross-references between docs are accurate
4. **Project CLAUDE.md**: Update epic status, current development phase, any new patterns

### Phase 3: Version Release
1. On epic branch: Bump version in package.json
2. On epic branch: Commit all changes with message "Release vX.Y.Z: Epic N - Title"
3. Final `npm run check-all` to ensure everything still passes

### Phase 4: Merge to Main
1. Switch to main branch locally
2. Merge epic branch locally (no GitHub PR)
3. Push main to remote

### Phase 5: Release & Cleanup
1. Create and push git tag vX.Y.Z
2. Create GitHub release with comprehensive notes from CHANGELOG.md
3. Close epic issue with completion summary
4. Delete epic branch (local and remote)
5. Update CLAUDE.md to reflect next epic as active

## Key Files

- `README.md`: Comprehensive project documentation with features and vision
- `docs/development/roadmap.md`: 3-month development plan for Obsidian plugin
- `docs/architecture/overview.md`: Architectural guidelines for AI-first development
- `docs/technical-patterns.md`: Proven algorithms and code patterns
- `docs/ux-specifications.md`: Detailed user experience specifications
- `docs/architecture-details.md`: Technical implementation details

## Media Storage Architecture (Future Implementation)

### Problem: localStorage Quota Exceeded with Large Media Files
When dropping large media files (videos, podcasts) into DreamNodes, the app stores entire file content in localStorage via dreamTalkMedia field, quickly exceeding the 5-10MB browser limit.

### Solution: Obsidian-Native File Streaming
**Path of Least Resistance**: Store only file paths in localStorage, use Obsidian's file:// protocol for instant streaming.

**Key Insights**:
- Obsidian provides direct file:// URL access to vault files
- Browsers handle local files with near-zero latency (10-50ms to first frame)
- HTML5 video element supports byte-range requests for instant playback without full load
- Local SSD performance (3-7 GB/s) makes streaming seamless

**Implementation Strategy**:
1. **Immediate**: Store only vault paths in `dreamTalkMedia`, not file content
2. **Lazy Loading**: Use Intersection Observer to preload media as nodes approach viewport
3. **Progressive Enhancement**: Show thumbnail instantly, stream full media on interaction
4. **Optional Future**: IndexedDB for generated thumbnails/preview clips

**Performance Approach**:
```typescript
// Instant playback pattern
videoElement.src = vault.adapter.getResourcePath(file); // file:// URL
videoElement.preload = "metadata"; // Load just headers
videoElement.play(); // Starts in <50ms
```

This achieves the desired immediate, responsive preview experience without storage limitations.

## License

GNU AFFERO GENERAL PUBLIC LICENSE - This project is open source with copyleft requirements.