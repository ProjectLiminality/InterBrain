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

**Phase**: Epic 2 Development (Epic 1 Complete)
- ✅ **Epic 1 Complete**: Plugin Infrastructure foundation established
- 🚀 **Epic 2 Active**: 3D Spatial Visualization System
- 🔮 **Epic 3 Next**: DreamNode Management System
- 🔮 **Epic 4 Future**: Git Operations Abstraction

### Epic 1 Achievements (July 13, 2025)
- ✅ Obsidian plugin boilerplate with Vite dual workflow
- ✅ Zustand state management with 6 core commands
- ✅ Service layer abstraction (UI, Git, DreamNode, Vault)
- ✅ Vitest testing framework (47 tests passing)
- ✅ Command palette infrastructure established

### Epic 2: 3D Spatial Visualization System
**Current Priority**: #253 - 3D Spatial Visualization System | Spec: #265

**✅ Completed Features**:
- ✅ #308 Rotatable Sphere Interaction (Google Earth style virtual trackball with physics momentum)

**🚀 Next Features** (Ready for Implementation):
- #306 DreamNode 3D Component 
- #307 Layout State Management
- #279 Fibonacci Sphere Layout
- #281 Dynamic View Scaling

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
3. **Default to Feature Slice**: New components go inside their feature folder first
4. **Promote to Shared Only on Second Use**: Move to `/components` only when needed by multiple features
5. **Dreamspace is Core Engine**: `/dreamspace` contains fundamental 3D/spatial logic only
6. **UI Calls Commands**: UI components use `executeCommandById()`, never call services directly
7. **Document for AI**: Every feature folder needs a `README.md` with high-level summary
8. **Testing Before Commits**: Use Playwright MCP to validate features work in browser before any git operations

## Technology Stack

### Current Implementation (Epic 1 Complete)
- **Build System**: Vite with dual workflow (browser dev + plugin build)
- **Plugin Architecture**: Obsidian Plugin API with TypeScript
- **State Management**: Zustand reactive store
- **Testing**: Vitest with comprehensive mocking
- **Services**: UI, Git, DreamNode, and Vault service layers
- **Commands**: 6 core commands via Obsidian command palette

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
- Tag release if appropriate
- Epic represents coherent functionality unit

### Core Workflow Pattern: Issue Clarity Before Implementation

**DEEP PATTERN - ALWAYS FOLLOW**:
1. **Epic Branch Creation**: Start every epic by creating the epic branch
2. **Specification Clarity**: BEFORE any coding, flesh out specification issue
3. **Feature Branch Creation**: Only after specification is clear
4. **Feature Clarity**: BEFORE coding each feature, flesh out feature issue
5. **Implementation**: Only after both specification and feature issues are detailed

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

## Epic Quick Reference

**Core Epics (Sequential Implementation Required)**:
- **Epic 2**: #253 - 3D Spatial Visualization System | Spec: #265
- **Epic 3**: #254 - DreamNode Management System | Spec: #266  
- **Epic 4**: #255 - Git Operations Abstraction | Spec: #267

**Epic Scope Clarity**:
- **Epic 2**: Visual representation and navigation of DreamNodes in 3D space (the theater)
- **Epic 3**: Creating, editing, and organizing DreamNodes as data entities (the content management)
- **Epic 4**: User-friendly Save/Share paradigm hiding git complexity (the backend)

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

## Key Files

- `README.md`: Comprehensive project documentation with features and vision
- `docs/development/roadmap.md`: 3-month development plan for Obsidian plugin
- `docs/architecture/overview.md`: Architectural guidelines for AI-first development
- `docs/technical-patterns.md`: Proven algorithms and code patterns
- `docs/ux-specifications.md`: Detailed user experience specifications
- `docs/architecture-details.md`: Technical implementation details

## License

GNU AFFERO GENERAL PUBLIC LICENSE - This project is open source with copyleft requirements.