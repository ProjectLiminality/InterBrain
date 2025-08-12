# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**The InterBrain** is an innovative knowledge management system that transcends traditional "Second Brain" paradigms. It's evolving from a standalone Electron app to a native Obsidian plugin, ultimately forming the foundation for DreamOS - a decentralized, AI-powered operating system for collective sensemaking.

### Core Concepts
- **Dream Nodes**: Git repositories representing either ideas (Dreams) or people (Dreamers)
- **Dream Talk**: Concise, symbolic representations of ideas
- **Dream Song**: Elaborate explanations with references to other Dream Talks
- **Liminal Web**: Self-organizing knowledge based on social relationships

## Current Development Status

**Phase**: Epic 5 Semantic Search Development (Epic 4 Foundation Merged)
- ✅ **Epic 1 Complete**: Plugin Infrastructure foundation established
- ✅ **Epic 2 Complete**: 3D Spatial Visualization System with all features implemented
- ✅ **Epic 3 Complete**: DreamNode Management System with service layer architecture
- 🔄 **Epic 4 PARTIAL**: Liminal Web Layout System - Foundation merged, Edit Mode pending
- 🚀 **Epic 5 Active**: Semantic Search System (branch: epic/5-semantic-search)

### ⚠️ CRITICAL: Epic 4 Partial Merge Status (December 17, 2024)
**WORKFLOW EXCEPTION - PARTIAL EPIC MERGE**
- **Reason**: Circular dependency - Edit Mode (#321) needs Semantic Search, Semantic Search needs Spatial Orchestration
- **Completed & Merged**: Features #316 (Spatial Orchestration) and #320 (Undo/Redo Navigation)
- **Pending Feature**: #321 (Unified Edit Mode) - Will implement in `epic/4-continued` branch after Epic 5
- **Continuation Plan**: After Epic 5 completion, branch `epic/4-continued` from main to implement Edit Mode with semantic search integration
- **Documentation**: See `PARTIAL_EPIC_MERGE.md` for complete workflow exception documentation

### Epic 4 Current Status (December 17, 2024)
- ✅ **Feature #316 MERGED**: Focused Layout Engine & Spatial Orchestration System (foundation for Epic 5)
- ✅ **Feature #320 MERGED**: Undo/Redo Navigation with Mid-Flight Animation Interruption
- 📋 **Feature #321 DEFERRED**: Edit Mode - Awaiting Epic 5 Semantic Search for optimal implementation
- ⚠️ **IMPORTANT**: Epic 4 housekeeping (full docs update, CHANGELOG) deferred until epic/4-continued completion

### Epic 4 Achievements (August 12, 2025)
**Feature #316 Complete**: Focused Layout Engine & Spatial Orchestration System
**Feature #320 Complete**: Undo/Redo Navigation with Mid-Flight Animation Interruption

**✅ Major Technical Achievements**:
- ✅ Universal Movement API with advanced easing (easeInQuart, easeOutQuart, easeOutCubic)
- ✅ SpatialOrchestrator - centralizes all spatial interactions and layout management
- ✅ Focused Layout Engine with perfect circle positioning and world-space correction
- ✅ Sphere Rotation Integration ensuring accurate positioning on rotated sphere
- ✅ Role-based easing system creating consistent movement philosophy
- ✅ Unified liminal web UX flow with active/inactive node management
- ✅ Navigation History System - Command+Z/Shift+Z for layout change tracking
- ✅ Mid-Flight Animation Interruption - seamless rapid undo/redo with smooth redirections

**✅ Key Innovations**:
- **Differentiated easing**: Slower movement near center, faster at periphery for pleasant UX
- **World-space quaternion mathematics**: Rotation-aware positioning using inverse transforms
- **Dual-mode positioning system**: Constellation (continuous) vs active (discrete) modes
- **Ultra-lightweight history storage**: Only node IDs and layout states (150+ entries)
- **Seamless animation interruption**: Mid-flight position capture for smooth transitions
- **Performance optimization**: 101 tests passing with zero technical debt

### Epic 3 Achievements (July 26, 2025)
**All Features Complete**: #254 - DreamNode Management System | Spec: #266

**✅ Completed Features**:
- ✅ #283 Proto-node Creation - In-space node creation with unified animation system
- ✅ #284 Universal Drag-Drop Hit Detection - Scale-aware interaction at any zoom level
- ✅ #309 Git Template System - Complete DreamNode template with hooks
- ✅ #312 Service Layer Integration - Mock/real switching for development efficiency
- ✅ #314 Visual Git State Indicators - Red/blue/clean state hierarchy
- ✅ #310 Auto-stash Creator Mode - Workspace isolation with git stash operations
- ✅ #313 Development Mode Toggle - Subsumed into service layer architecture
- ✅ #315 DreamTalk Component - Moved to Epic 8 for future refinement

**✅ Integration Complete**:
- 101 unit tests passing (100% coverage for new services)
- Zero lint warnings or errors
- Full TypeScript type safety
- Service layer architecture established
- Documentation updated

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

### Epic + Feature Branch Architecture

**Core Strategy**: 3-tier GitHub Issues + Dynamic AI Task Management + Epic-Level Testing/Documentation

### GitHub Issue Structure (3-Tier)
- **Epic**: High-level functionality units (stable structure)
- **Specification**: Detailed implementation plans (explicated when development wave hits)
- **Feature**: User-facing functionality (concrete enough to test)
- **Tasks**: AI handles dynamically via TodoWrite (no GitHub task issues needed)

### Git Branch Strategy
```
main → epic/2-spatial-visualization
         ├── feature/dreamnode-3d-component
         ├── feature/layout-state-management  
         └── feature/advanced-camera-controls
```

### Epic Development Cycle

**Phase 1: Epic Planning & Specification**
- Create epic branch off main for complete epic scope
- **CRITICAL FIRST STEP**: Flesh out specification issue through conversational clarity
- Only proceed to implementation after specification is clear

**Phase 2: Feature Implementation**
- Create feature branches off epic branch for individual features
- **CRITICAL FIRST STEP**: Flesh out feature issue before coding
- Implement features using TodoWrite for task management
- Merge completed features back to epic branch

**Phase 3: Epic Integration**
- Test complete epic functionality on epic branch
- Write documentation for integrated capabilities  
- Final integration testing and polish

**Phase 4: Epic Completion**
- Merge tested, documented epic to main branch
- **MANDATORY**: Update CHANGELOG.md with epic details via release branch
- Tag release if appropriate
- Epic represents coherent functionality unit

### Workflow Exception: Partial Epic Merge Pattern

**When to Use**: Only when circular dependencies exist between epics at the architectural level
**Documentation Required**: PARTIAL_EPIC_MERGE.md file and clear CLAUDE.md updates
**Process**:
1. Complete and test foundational features within the epic
2. Document partial completion status extensively
3. Merge foundational features to main
4. Create continuation plan with specific branch name (epic/N-continued)
5. Defer housekeeping tasks (CHANGELOG, final docs) until continuation completes
6. Track deferred features in GitHub issues with clear continuation requirements

**Critical Requirements**:
- Must document WHY the exception is necessary
- Must specify EXACTLY which features are merged vs deferred
- Must create clear continuation plan BEFORE merging
- Must update all project memory and GitHub issues

### Core Workflow Pattern: Issue Clarity Before Implementation

**DEEP PATTERN - ALWAYS FOLLOW**:
1. **Epic Branch Creation**: Start every epic by creating the epic branch
2. **Specification Clarity**: BEFORE any coding, flesh out specification issue
3. **Feature Branch Creation**: Only after specification is clear
4. **Feature Issue Analysis**: Read current GitHub issue body to understand requirements
5. **Knowledge Transfer Interview**: Conduct interview with potent questions to gain clarity
6. **Feature Issue Planning**: Flesh out refined issue body with detailed implementation plan
7. **Implementation**: Only after feature issue is properly planned and detailed
8. **User Testing Protocol**: ALWAYS stop for user feedback before committing
9. **Issue Closing**: Only close after successful merge to epic branch - NEVER before

### Cross-Session Memory Pattern
- **Strategic Planning**: GitHub Issues (Epic/Spec/Feature) 
- **Tactical Execution**: Claude's native TodoWrite for in-session tasks
- **Persistent Memory**: Incomplete tasks written to CLAUDE.md at session end
- **Historical Record**: Git commits document actual work completed

### Session Restart Protocol
1. Read project CLAUDE.md for incomplete tasks from previous session
2. `gh issue list --assignee @me --state open` - Check GitHub issue status
3. `git branch --show-current` - Confirm current branch context
4. Recreate TodoWrite tasks based on session goals
5. `git log --oneline -10` - Review recent progress

## CRITICAL FEATURE DEVELOPMENT WORKFLOW

### Phase 1: Issue Analysis & Knowledge Transfer
**MANDATORY FIRST STEPS - NEVER SKIP**:
1. **Read Feature Issue**: Use `gh issue view ISSUE_NUMBER` to understand current requirements
2. **Interview Process**: Ask potent questions to transfer knowledge and gain clarity:
   - What specific functionality is needed?
   - What are the key interaction patterns?
   - What are the performance requirements?
   - What are potential edge cases or constraints?
   - How should this integrate with existing features?
3. **Clarification Discussion**: Short conversation to align understanding
4. **Issue Body Refinement**: Update GitHub issue with detailed implementation plan
5. **User Approval**: Get explicit approval before proceeding to implementation

### Phase 2: Implementation
**AFTER ISSUE CLARITY ACHIEVED**:
1. **Feature Branch Creation**: Create feature branch off epic branch
2. **TodoWrite Planning**: Create comprehensive task breakdown
3. **Implementation**: Follow development rules and patterns
4. **Unit Tests**: Ensure all tests pass
5. **Lint & Type Check**: Clean code validation

### Phase 3: User Testing & Validation
**MANDATORY BEFORE COMMITTING**:
1. **Stop Implementation**: Never commit without user feedback
2. **Request User Testing**: Ask user to test the feature and provide feedback
3. **Iterate Based on Feedback**: Address any issues found during testing
4. **Commit Only After Validation**: Only commit when user confirms feature works

### Phase 4: Feature Completion
**FINAL STEPS**:
1. **Merge to Epic Branch**: Merge feature branch to epic branch
2. **Update Issue**: Mark all acceptance criteria as complete
3. **Close Issue**: ONLY close after successful merge - never before
4. **Clean Up**: Delete feature branch after epic integration

## WORKFLOW ANTI-PATTERNS TO AVOID

### ❌ Never Do These:
- Skip issue analysis and jump straight to implementation
- Commit changes without user testing and feedback
- Close issues before merging to epic branch
- Assume changes work without validation
- Plan implementation without understanding requirements

### ✅ Always Do These:
- Start with issue analysis and knowledge transfer interview
- Flesh out issue body with detailed planning
- Stop for user testing before any commits
- Only close issues after successful merge
- Validate that features actually work as intended

## Epic Quick Reference

**Core Epics (Sequential Implementation Required)**:
- **Epic 2**: #253 - 3D Spatial Visualization System | Spec: #265
- **Epic 3**: #254 - DreamNode Management System | Spec: #266  
- **Epic 4**: #255 - Liminal Web Layout System | Spec: #267

**Epic Scope Clarity** (Updated July 19, 2025):
- **Epic 2**: Visual representation and navigation of DreamNodes in 3D space (the theater) ✅ Complete
- **Epic 3**: Basic CRUD operations and DreamNode creation workflows (minimal scope - foundation)
- **Epic 4**: Dynamic spatial layouts that orchestrate DreamNode positioning based on relationships
- **Epic 8**: Advanced DreamNode operations (Pop-out, Merge, Process/Substance categorization)

**Feature Reorganization**:
- **Honeycomb search (#280)** → Epic 5 (Semantic Search System)
- **Constellation view (#282)** → Epic 5+ (Advanced visualization)
- **Advanced operations (#296-298)** → Epic 8 (DreamOS Foundational Operations)

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

**Feature Completion Workflow**:
1. **Complete Implementation**: All acceptance criteria met
2. **Update Issue Body**: Edit issue to check off `[x]` all completed criteria
3. **Close with Session Summary**: `gh issue close ISSUE_NUMBER --comment "session summary"`
4. **Clean Up**: Delete feature branch after epic integration

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

**Epic Completion Workflow**:
1. Update Epic issue body with completed checkboxes
2. Move Epic to Complete status via GraphQL
3. Close Epic issue with completion summary
4. Clean up any remaining child issues

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
├── .udd/
│   └── metadata.json     # UUID, title, type, dreamTalk, relationships
├── hooks/
│   ├── pre-commit        # Coherence beacon updates
│   ├── post-commit       # Relationship tracking
│   └── post-merge        # Submodule sync for DreamSong integration
└── README.md            # DreamNode documentation

# DreamNode creation:
git init --template=${pluginPath}/DreamNode-template
```

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

## License

GNU AFFERO GENERAL PUBLIC LICENSE - This project is open source with copyleft requirements.