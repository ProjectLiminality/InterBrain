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

**Phase**: Epic 3 Active Development
- ✅ **Epic 1 Complete**: Plugin Infrastructure foundation established
- ✅ **Epic 2 Complete**: 3D Spatial Visualization System with all features implemented
- 🚀 **Epic 3 Active**: DreamNode Management System (branch: epic/3-dreamnode-management)
- 🔮 **Epic 4 Future**: Git Operations Abstraction

### Epic 3 Current Status (July 26, 2025) - READY FOR EPIC COMPLETION
**All Major Features Complete**: #283 Proto-node creation, #284 Universal drag-drop hit detection, #309 Git Template System, #312 Service Layer Integration, #314 Visual Git State Indicators, #310 Auto-stash Creator Mode
- ✅ Epic branch created: `epic/3-dreamnode-management`
- ✅ Service layer architecture defined with mock/real swapping capability
- ✅ **Feature #283 Complete**: In-space proto-node creation with unified animation system
- ✅ **Feature #284 Complete**: Universal scale-aware drag-drop hit detection system
- ✅ **Feature #309 Complete**: Git Template System for DreamNode Creation
- ✅ **Feature #312 Complete**: Service Layer Integration with mock/real switching
- ✅ **Feature #314 Complete**: Visual Git State Indicators for DreamNodes
- ✅ **Feature #310 Complete**: Auto-stash Creator Mode workflow with workspace isolation
- ✅ **Feature #313 Closed**: Development Mode Toggle (subsumed into service layer)
- ✅ **Feature #315 Closed**: DreamTalk Component refinement (moved to Epic 8)
- ✅ Shared styling infrastructure established (dreamNodeStyles.ts)
- ✅ Mock service layer implementation with session storage
- ✅ Native Three.js scene-based raycasting for flawless hit detection
- ✅ Invisible hit spheres traveling as unified objects with visual nodes
- ✅ Complete UI polish and technical debt cleanup
- ✅ Git template with udd.json files and pre-commit hooks
- ✅ Obsidian-compatible coherence checking system
- ✅ 4 command palette commands for template operations
- ✅ DreamNode selection infrastructure with click-to-select and visual feedback
- ✅ Creator Mode pattern with automatic git stash operations
- ✅ Visual git state hierarchy: red (work-in-progress) > blue (unpushed) > clean
- ✅ Robust git status detection with unpushed commit checking
- 🎯 **Epic Status**: ALL FEATURES COMPLETE - Ready for epic completion workflow (CHANGELOG.md + merge to main)

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
- **Epic 4**: #255 - Git Operations Abstraction | Spec: #267

**Epic Scope Clarity** (Updated July 19, 2025):
- **Epic 2**: Visual representation and navigation of DreamNodes in 3D space (the theater) ✅ Complete
- **Epic 3**: Basic CRUD operations and DreamNode creation workflows (minimal scope - foundation)
- **Epic 4**: User-friendly Save/Share paradigm building on Epic 3's service layer (abstractions)
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
- **MANDATORY**: Update CHANGELOG.md before merging epic to main
- Use release branch pattern: `release/vX.Y.Z` from main
- Include comprehensive epic details, features, and technical achievements
- Bump version in package.json as part of release
- Merge release branch to main, then create git tag
- Create GitHub releases with release notes based on changelog

## Key Files

- `README.md`: Comprehensive project documentation with features and vision
- `docs/development/roadmap.md`: 3-month development plan for Obsidian plugin
- `docs/architecture/overview.md`: Architectural guidelines for AI-first development
- `docs/technical-patterns.md`: Proven algorithms and code patterns
- `docs/ux-specifications.md`: Detailed user experience specifications
- `docs/architecture-details.md`: Technical implementation details

## License

GNU AFFERO GENERAL PUBLIC LICENSE - This project is open source with copyleft requirements.