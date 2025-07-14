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

**Phase**: Active Development (Planning Complete)
- ✅ **Completed**: Electron MVP prototype ([InterBrain-Prototype](https://github.com/ProjectLiminality/InterBrain-Prototype))
- ✅ **Completed**: GitHub migration and clean development infrastructure
- 🚀 **Active**: Obsidian Plugin implementation (this repository)
- 🔮 **Future**: Evolution into DreamOS system

**GitHub Migration Completed** (July 11, 2025):
- ✅ **51 Issues Created**: 12 epics, 12 specifications, 27 features with clean formatting
- ✅ **Native Sub-Issue Relationships**: GitHub parent-child relationships established
- ✅ **Project Board Setup**: Strategic Epic-level workflow tracking
- ✅ **Repository Reorganization**: Clean naming structure with prototype preserved
- ✅ **Development Workflow**: GitHub-native issue tracking as single source of truth

## Epic Development Order

**Sequential Implementation Required (Epics 1-4)**:
The following epics must be completed in order due to technical dependencies:

1. ✅ **Epic 1: Plugin Infrastructure** - Foundation for everything else **[COMPLETE]**
2. **Epic 2: 3D Spatial Visualization System** - Core UI framework
3. **Epic 3: DreamNode Management System** - Data layer and operations
4. **Epic 4: Git Operations Abstraction** - Backend for all git interactions

After Epic 4, development can branch out based on priorities and opportunities.

**Current Infrastructure**:
- **Repository**: [InterBrain](https://github.com/ProjectLiminality/InterBrain) (renamed from InterBrainMVP)
- **Project Board**: [InterBrain Development](https://github.com/users/ProjectLiminality/projects/2)
- **Issue Tracking**: [GitHub Issues](https://github.com/ProjectLiminality/InterBrain/issues)
- **Prototype Archive**: [InterBrain-Prototype](https://github.com/ProjectLiminality/InterBrain-Prototype)

**Development Workflow Philosophy - Key Insights**:

*Problem*: Current issue structure may be over-specified for AI-integrated development workflow. Predicting Epic 7 tasks when starting Epic 1 is not optimal.

*Wave-Based Development Vision*:
- **Epics**: Stable, high-level structure that remains mostly unchanged
- **Features**: Can be explicated early (UI/UX visible from distance) 
- **Specifications**: Should start rough, then explicate when development wave hits that area
- **Tasks**: Created dynamically just-in-time based on:
  - Rough specification content
  - Feature issue definitions  
  - Current codebase context
  - Past design choices made
  - Real-world development constraints

*Dynamic Task Creation Workflow*:
```
Development Wave Hits Area → 
Rough Spec + Features + Current Codebase Context + Past Decisions → 
Explicate Specification Issue → 
Generate Specific Tasks
```

*Balance Questions to Explore*:
- How much structure is too much vs too little for AI-assisted development?
- When to create granular tasks vs when to rely on AI pair-programming?
- How to evolve issue structure as understanding deepens?
- Role of specifications: planning documents vs living architecture decisions?

*Issue Quality Assessment*:
- Epics and Features are "by and large excellent" 
- Some tasks show misunderstandings or over-emphasis on minor roadmap comments
- Issue set will naturally evolve - perfection not expected initially
- Focus on creating usable structure that can adapt over time

**Meta-Learning**: The issue creation process revealed important insights about development workflow design. Current structure provides good foundation but may need refinement for optimal AI collaboration patterns.

**Ready for Development**: Build system and issue infrastructure established.

**Chapter Complete**: Foundation phase finished. Migration artifacts cleaned up. All development tracking now happens through GitHub Issues and Project Board. OpenCollective community updated. Ready to begin active Obsidian plugin development.

## Architecture Philosophy: AI-First Development

This project follows a **Pragmatic Hybrid Architecture** designed for optimal AI collaboration:

### Core Principle
**AI Readability >= Human Readability** - Code organization prioritizes context locality for AI assistants over traditional human-centric patterns.

### Architectural Pattern
Combines **Vertical Slice Architecture** (organize by feature) with **Atomic Design Principles** (shared UI components).

## Recommended Project Structure

When development begins, follow this structure with command palette integration:

```
interbrain-plugin/
├── main.ts                     # Plugin entry point - registers all commands
├── manifest.json               # Plugin metadata for Obsidian
├── package.json               # Dependencies and build scripts
├── src/
│   ├── commands/               # Command palette command definitions
│   │   ├── dreamnode-commands.ts # DreamNode operations (save, create, delete)
│   │   ├── spatial-commands.ts   # 3D space navigation and layout
│   │   └── git-commands.ts       # Git operations (weave, share, sync)
│   ├── services/               # Service layer for business logic
│   │   ├── git-service.ts        # Git operations with AI assistance
│   │   ├── dreamnode-service.ts  # DreamNode management
│   │   ├── vault-service.ts      # Obsidian Vault API wrappers
│   │   └── ui-service.ts         # User feedback and notifications
│   ├── dreamspace/             # Core 3D/spatial domain logic
│   │   ├── nodes/              # DreamNode "game objects"
│   │   ├── DreamspaceCanvas.tsx # Main R3F Canvas component
│   │   └── DreamspaceView.ts   # Obsidian WorkspaceLeaf integration
│   ├── features/               # Self-contained features (Vertical Slices)
│   │   ├── repo-management/    # Creating, renaming, bundling nodes
│   │   └── dream-talk/         # Media viewing for selected nodes
│   ├── components/             # Shared UI (Atomic Design)
│   │   ├── atoms/              # Basic building blocks
│   │   └── molecules/          # Composed components
│   └── types/                  # TypeScript type definitions
└── styles.css                  # Plugin-specific styles
```

## Development Rules

Follow these rules to maintain architectural coherence:

1. **Commands Before UI**: Create command palette commands before building UI components
2. **Service Layer Abstraction**: Commands delegate to services, never direct git operations
3. **Default to Feature Slice**: New components go inside their feature folder first
4. **Promote to Shared Only on Second Use**: Move to `/components` only when needed by multiple features
5. **Dreamspace is Core Engine**: `/dreamspace` contains fundamental 3D/spatial logic only
6. **UI Calls Commands**: UI components use `executeCommandById()`, never call services directly
7. **Document for AI**: Every feature folder needs a `README.md` with high-level summary

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

## Development Workflow

### Epic + Feature Branch Architecture ✅

**Core Strategy**: 3-tier GitHub Issues + Dynamic AI Task Management + Epic-Level Testing/Documentation

### GitHub Issue Structure (3-Tier, Not 4-Tier)
- **Epic**: High-level functionality units (stable structure)
- **Specification**: Detailed implementation plans (explicated when development wave hits)
- **Feature**: User-facing functionality (concrete enough to test)
- **Tasks**: AI handles dynamically via TodoWrite (no GitHub task issues needed)

### Git Branch Strategy
```
main → epic/1-plugin-infrastructure
         ├── feature/dreamspace-view-registration
         ├── feature/command-palette-setup  
         ├── feature/ribbon-icon-integration
         └── feature/basic-ui-framework
```

### Epic Development Cycle

**Phase 1: Epic Planning & Specification**
- Create epic branch off main for complete epic scope
- **CRITICAL FIRST STEP**: Flesh out specification issue through conversational clarity
  - Review existing features for coherence (add/remove/modify as needed)
  - Ask potent questions to understand requirements deeply
  - Update specification issue body with detailed implementation plan
  - Ensure alignment between specification and refined feature list
- Only proceed to implementation after specification is clear

**Phase 2: Feature Implementation**
- Create feature branches off epic branch for individual features
- **CRITICAL FIRST STEP**: Flesh out feature issue before coding
  - Conversationally arrive at clarity on implementation details
  - Update feature issue body while respecting existing structure
  - Add specific acceptance criteria and technical approach
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

### Epic-by-Epic Development Flow

**Epic Selection & Planning**:
1. `gh issue view [epic-number]` - Review epic scope and requirements
2. `gh issue view [spec-number]` - Explicate specification with current context
3. `gh issue list --label "epic-X"` - Review and refine feature set
4. Update spec issue with detailed implementation plan

**Feature Development**:
1. `git checkout epic/X-name && git checkout -b feature/feature-name`
2. `gh issue view [feature-number]` - Read feature requirements  
3. Use TodoWrite to break feature into implementation tasks dynamically
4. Implement with frequent commits and TodoWrite progress tracking
5. `git checkout epic/X-name && git merge feature/feature-name`

**Epic Integration & Completion**:
1. Test complete epic functionality (all features working together)
2. Write epic-level documentation covering integrated capabilities
3. Update CHANGELOG.md with epic-level changes
4. `git checkout main && git merge epic/X-name`
5. **GitHub Issue Completion**:
   - Add detailed completion summary to Specification issue
   - Close Specification issue (architectural reference complete)
   - Close Epic issue (work delivery complete)
6. **Release Process**:
   - Update package.json version (semantic versioning)
   - Create release commit with comprehensive summary
   - Tag release: `git tag -a vX.Y.Z -m "release notes"`

### Core Workflow Pattern: Issue Clarity Before Implementation

**DEEP PATTERN - ALWAYS FOLLOW**:
1. **Epic Branch Creation**: Start every epic by creating the epic branch
2. **Specification Clarity**: BEFORE any coding, flesh out specification issue through:
   - Conversational interview to understand requirements
   - Review/refine feature list (add/remove/modify for coherence)
   - Update specification issue body with detailed plan
   - Ensure alignment between specification and features
3. **Feature Branch Creation**: Only after specification is clear
4. **Feature Clarity**: BEFORE coding each feature, flesh out feature issue through:
   - Conversational clarity on implementation details
   - Update feature issue body while respecting existing structure
   - Add specific acceptance criteria and technical approach
5. **Implementation**: Only after both specification and feature issues are detailed

**Key Principle**: Always start with fleshing out issues before diving into implementation. Use potent questions and conversational clarity to arrive at understanding effortlessly.

### Why Epic-Level Testing/Documentation
- **Coherent Functionality**: Epics represent complete user capabilities
- **Integration Testing**: Features work together as intended
- **Complete User Story**: Documentation covers end-to-end workflows
- **Clean Main Branch**: Only fully tested, documented functionality
- **Efficient Process**: Avoid premature documentation of incomplete features

### Benefits of This Workflow
✅ **Right-sized Planning**: Strategic on GitHub, tactical with AI  
✅ **Sustainable Development**: No redundant task creation overhead  
✅ **Cross-Session Continuity**: Multiple memory layers working together  
✅ **GitHub-Native**: Leverages existing issue structure effectively  
✅ **Professional Integration**: Clean testing and documentation cycles
✅ **AI-Optimized**: Leverages Claude's dynamic task breakdown capabilities

### GitHub CLI Commands Reference

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

**Get Sub-Issues of Any Issue** (Epic → Spec or Spec → Features):
```bash
gh api graphql -H "GraphQL-Features: sub_issues" -f query='
{
  repository(owner: "ProjectLiminality", name: "InterBrain") {
    issue(number: ISSUE_NUMBER) {
      title
      number
      subIssues(first: 20) {
        nodes {
          title
          number
          labels(first: 5) {
            nodes {
              name
            }
          }
        }
      }
    }
  }
}'
```

**Assign Yourself to an Issue**:
```bash
gh issue edit ISSUE_NUMBER --add-assignee @me
```

**View Issue Details**:
```bash
gh issue view ISSUE_NUMBER
```

**Update Issue Body** (for specification explication):
```bash
gh issue edit ISSUE_NUMBER --body-file specification.md
```

**Create Pull Request**:
```bash
gh pr create --title "Epic X: Title" --body "Description"
```

**Check Your Assigned Issues**:
```bash
gh issue list --assignee @me --state open
```

**Create New Feature Issue**:
```bash
gh issue create --title "Feature Title" --label feature --body "## Description

Feature description here

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Dependencies

- Parent specification must be approved

## Definition of Done

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
- [ ] Code reviewed and merged"
```

**Get Issue IDs for Sub-Issue Linking**:
```bash
gh api graphql -f query='
{
  repository(owner: "ProjectLiminality", name: "InterBrain") {
    issues(last: 5, states: OPEN) {
      nodes {
        number
        title
        id
      }
    }
  }
}' | jq -r '.data.repository.issues.nodes[] | "#\(.number): \(.title) -> \(.id)"'
```

**Link Feature as Sub-Issue to Specification**:
```bash
gh api graphql -H "GraphQL-Features: sub_issues" -f query='
mutation {
  addSubIssue(input: { 
    issueId: "PARENT_ISSUE_ID", 
    subIssueId: "CHILD_ISSUE_ID" 
  }) {
    issue { title }
    subIssue { title }
  }
}'
```

**Get Project Status and IDs for Updates**:
```bash
gh api graphql -f query='
{
  repository(owner: "ProjectLiminality", name: "InterBrain") {
    issue(number: ISSUE_NUMBER) {
      projectItems(first: 5) {
        nodes {
          id
          project { id title }
          fieldValues(first: 10) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field {
                  ... on ProjectV2SingleSelectField {
                    id name
                    options { id name }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}'
```

**Update Project Status** (Planning → Active → Integration → Complete):
```bash
gh api graphql -f query='
mutation {
  updateProjectV2ItemFieldValue(input: {
    projectId: "PROJECT_ID"
    itemId: "ITEM_ID"
    fieldId: "FIELD_ID"
    value: {
      singleSelectOptionId: "STATUS_OPTION_ID"
    }
  }) {
    projectV2Item { id }
  }
}'
```

**Project Status Workflow**:
- **Planning → Active**: When starting implementation (create first feature branch)
- **Active → Integration**: When all features complete, begin epic-level testing
- **Integration → Complete**: When epic fully tested and merged to main

**Feature Completion Workflow**:
1. **Complete Implementation**: All acceptance criteria met
2. **Merge to Epic Branch**: Professional merge with clean history
3. **Update Acceptance Criteria**: Check off all completed items in issue body
4. **Close Feature Issue**: `gh issue close ISSUE_NUMBER --comment "completion summary"`
5. **Clean Up**: Delete feature branch, update project memory

### Current Status
- Project uses AI-assisted development (Claude Code as primary partner)
- Epic + Feature branch workflow established and tested
- Professional workflow with testing and documentation at Epic level
- GitHub CLI commands documented for clean workflow execution
- **Epic 1 Foundation Complete**: Vite dual development workflow operational

**Epic 1 Complete** (July 13, 2025):
- ✅ All Epic 1 features implemented and tested
- ✅ #276: Obsidian plugin boilerplate with Vite
- ✅ #303: Zustand state management 
- ✅ #304: Command palette infrastructure
- ✅ #305: Testing framework setup (Vitest, 47 tests)
- ✅ Clean architecture with service layers
- 🎯 **Next**: Epic 2 - 3D Spatial Visualization System

**GitHub App Integration Decision**:
- **Status**: Deferred until Epic 4+ (Git Operations, AI Integration phase)
- **Rationale**: Current GitHub CLI workflow is smooth for active development
- **Trigger Point**: When we begin self-healing codebase features and production monitoring
- **Reminder**: Suggest GitHub App installation at Epic 4 start for automated workflows and AI-powered issue management

## GitHub Issue Quick Reference

**Core Epics (Sequential Implementation Required)**:
- **Epic 2**: #253 - 3D Spatial Visualization System | Spec: #265
- **Epic 3**: #254 - DreamNode Management System | Spec: #266  
- **Epic 4**: #255 - Git Operations Abstraction | Spec: #267

**Epic 2: 3D Spatial Visualization Features**:
- #278 ✅ React Three Fiber integration (CLOSED - completed)
- #306 DreamNode 3D Component (current work)
- #307 Layout State Management (next priority)
- #308 Advanced Camera Controls (smooth navigation)
- #279 Fibonacci Sphere Layout (mathematical positioning)
- #281 Dynamic View Scaling (attention-based scaling + LOD - later in Epic 2)

**Epic 3: DreamNode Management Features**:
- #285 DreamTalk component (media upload/editing)
- #286 DreamWeaving canvas integration (.canvas file parsing)
- #296 Pop-out operation (content extraction)

**Future Epics**:
- #256 Semantic Search System
- #257 DreamWalk Co-pilot System  
- #258 Coherence Beacon System
- #259 DreamOS Foundational Operations
- #260 Shamanic Onboarding Experience
- #261 Testing & Quality Infrastructure
- #262 Relationship Buffer System  
- #263 AI Integration & Self-Healing

**Epic Scope Clarity**:
- **Epic 2**: Visual representation and navigation of DreamNodes in 3D space (the theater)
- **Epic 3**: Creating, editing, and organizing DreamNodes as data entities (the content management)
- **Epic 4**: User-friendly Save/Share paradigm hiding git complexity (the backend)

### Next Steps (Per ROADMAP.md)
1. **Month 1**: Create Obsidian plugin foundation, implement custom view type for 3D space
2. **Month 2**: Add AI features (transcription, semantic search, video calls)
3. **Month 3**: Visualization, GitHub publishing, final testing

### Git Commit Philosophy
- **Commit frequently**: Make local commits after every meaningful change
- **Granular history**: Every file modification, documentation update, or feature addition
- **Clean before push**: Use feature branches and squash merge to main
- **Persistent memory**: Commits serve as development checkpoints

### Obsidian Plugin Integration Approach

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

## Submodule Strategy

The project includes conceptual submodules:
- `ProjectLiminality/`: Core DreamNode principles
- `SecondBrain/`: Traditional PKM paradigm integration
- `DreamSong.canvas`: Visual relationship mapping in Obsidian Canvas format

## Key Files

- `README.md`: Comprehensive project documentation with features and vision
- `ROADMAP.md`: 3-month development plan for Obsidian plugin
- `Architecture.md`: Detailed architectural guidelines for AI-first development
- `DreamSong.canvas`: Visual representation of project components

## Extracted Patterns from Prototype

### Spatial Algorithms (Proven Working)

**Fibonacci Sphere Distribution**:
```javascript
const goldenRatio = (1 + Math.sqrt(5)) / 2;
const SPHERE_RADIUS = 1000;

// For each node at index i:
const phi = Math.acos(1 - 2 * i / (totalNodes + 1));
const theta = 2 * Math.PI * i / goldenRatio;
const x = SPHERE_RADIUS * Math.sin(phi) * Math.cos(theta);
const y = SPHERE_RADIUS * Math.sin(phi) * Math.sin(theta);
const z = SPHERE_RADIUS * Math.cos(phi);
```

**Honeycomb Layout for Search Results**:
```javascript
const calculateHoneycombPosition = (index, totalNodes) => {
  if (index === 0) return [0, 0, 0]; // Center position
  
  // Calculate ring and position within ring
  let ring = 1;
  let indexInRing = index;
  let totalNodesInRing = 6 * ring;
  
  while (indexInRing > totalNodesInRing) {
    indexInRing -= totalNodesInRing;
    ring += 1;
    totalNodesInRing = 6 * ring;
  }
  
  // Convert to hexagonal coordinates
  const x = 1.5 * q;
  const y = Math.sqrt(3) * (r + q / 2);
  
  return [x, y, ring];
};

const calculateNodeScale = (ring) => {
  return Math.max(0.25, 2 / (2 ** ring));
};
```

**Dynamic View Scaling**:
```javascript
const MAX_SCALE = 50;
const MIN_SCALE = 1;

// Scale based on distance from screen center
const calculateViewScaleFactor = (node, camera, size) => {
  const screenPosition = projectToScreen(node.position, camera, size);
  const distanceFromCenter = calculateDistanceFromCenter(screenPosition, size);
  const normalizedDistance = distanceFromCenter / maxDistance;
  const scale = MAX_SCALE * (1 - Math.min(1, normalizedDistance * 2));
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
};
```

### Visual Design System

**Color Palette**:
```javascript
const COLORS = {
  PRIMARY_RED: "#FF644E",
  PRIMARY_BLUE: "#00a2ff", 
  SPACE_BLACK: "#000000",
  TEXT_WHITE: "#FFFFFF",
  SCROLLBAR_GRAY: "#4a4a4a"
};
```

**Layout Constants**:
- Full viewport immersion: `100vw × 100vh`
- Fixed positioning with `overflow: hidden`
- Black space background for cosmic feel
- Custom dark scrollbars

### Layout State Management

**Three Primary States**:
1. **Spherical Layout**: Default constellation view using Fibonacci distribution
2. **Search Results**: Honeycomb pattern for relevant nodes, distant circle for others
3. **Focused Node**: Centered node with related nodes in close circle, unrelated in distant circle

**Animation Patterns**:
- Smooth transitions between layout states
- Camera reset on layout changes
- Scale interpolation based on screen position

## Detailed UX/UI Specifications

### Core Interaction Flow

**Initial Constellation View**:
- Camera positioned at origin of 3D space
- DreamNodes arranged on Fibonacci sphere (night sky appearance)
- Distance-based scaling: nodes scale from points at edges to ~1/5 screen height when centered
- Smooth scaling based on distance from center of field of view
- Color coding: Dreams (blue, abstract ideas) vs Dreamers (red, people)

**Node Selection & Liminal Web**:
1. Click any DreamNode → smooth animation to center position
2. Camera resets to fixed distance facing selected node
3. **Related nodes** → inner circle arrangement (equidistant placement)
4. **Unrelated nodes** → outer circle (outside field of view)
5. **Liminal Web Logic**: 
   - Click Dream → shows related Dreamers (people who share this idea)
   - Click Dreamer → shows related Dreams (ideas shared with this person)

**DreamNode Flip Interaction**:
- Hover over centered node → flip arrows appear at bottom
- Smooth Y-axis rotation between DreamTalk (front) and DreamSong (back)
- DreamSong side: fully interactive scrollable content on circular surface
- Hover → fullscreen button appears
- Fullscreen → opens new Obsidian tab with complete DreamSong view

**Navigation**:
- Escape key → return to constellation view (smooth animation back to Fibonacci sphere)
- Future setting: option to randomize positions vs return to original constellation

### Search Functionality

**Search Activation**:
- Command+F → opens custom search overlay within DreamSpace
- Search bar appears at center-top of 3D view

**Real-time Semantic Search**:
- Universal Sentence Encoder running locally (Apple Silicon optimized)
- Real-time updates as user types
- Shared backend pipeline for both UI search and conversational copilot
- Search scope (progressive expansion):
  1. **Phase 1**: DreamNode folder names only
  2. **Phase 2**: Include README content (condensed)
  3. **Phase 3**: Multi-modal (image search, symbol semantic matching)

**Search Results Layout**:
- Relevant nodes → honeycomb pattern arrangement
- Irrelevant nodes → distant circle (outside view)
- Maintain color coding (Dreams blue, Dreamers red)
- Future: filtering options (Dreams only, Dreamers only)
- Escape → return to constellation view

**Conversational Copilot Integration**:
- Context buffer tracks conversation keywords (≤10 words)
- Automatically updates search query based on real-time transcription
- Uses same semantic search backend (hidden UI component)
- Surfaces relevant DreamNodes during conversation without interruption

### Technical Architecture

**Local-First Design**:
- Universal Sentence Encoder: local inference on Apple Silicon
- Real-time transcription: local models
- macOS restriction: Radical networking layer requirement
- Target: M1+ chips with sufficient unified memory
- Fallback: API solutions for less performant machines

**Platform Integration**:
- Obsidian Plugin API with TypeScript
- Custom "dreamspace" view type registration
- Access via ribbon icon + command palette ("Open DreamSpace")
- Git operations via shell commands
- File system access through Obsidian Vault API
- Canvas integration: leverage existing .canvas file parsing

**Performance Considerations**:
- Selective node spawning/despawning for large dream gardens
- Efficient dynamic scaling based on viewport
- Smooth animations using animation libraries
- Offline-capable operation (works without internet)

## DreamNode Lifecycle & Git Operations

### Creation & Initialization
- **Immediate git setup**: `git init` + initial commit on DreamNode creation
- **Metadata storage**: `.udd` file (Universal Dream Description) with JSON schema
- **Primary identifiers**: UUID-based (either custom generated or Radicle ID)
- **Initial commit**: Includes metadata file + any provided files (DreamTalk symbols)

### Git Workflow Abstraction
**User-Friendly Terminology**:
- "Save" instead of "commit" for everyday users
- "Unsaved changes" indicators in UI
- Stash/Drop/Save options for managing changes

**Target Audience**: Poets, artists, philosophers, grandparents - NOT programmers
**AI-Powered Abstraction**: LLMs handle complex git operations behind simple UI actions

### DreamWeaving & Submodules
1. **Canvas Creation**: User creates DreamSong in Obsidian canvas with external DreamTalk symbols
2. **File Path Parsing**: System identifies external references by parsing canvas file paths
3. **Commit Trigger**: User "saves" the DreamSong (commit action)
4. **Automatic Submodule Addition**: `git submodule add` for each external reference
5. **Path Updates**: Canvas file paths updated to point inside submodules

## DreamNode Creation Workflows

### Method 1: Command+N Panel
- **Trigger**: Command+N keyboard shortcut
- **Fields**: Name, Type (Dream/Dreamer), DreamTalk media file, Related nodes
- **Related Nodes**: Dropdown with type-to-filter from existing DreamNodes
- **Instant Creation**: Creates git repo + commits metadata + files

### Method 2: Drag & Drop
- **Default Behavior**: Drag file → create Dream-type DreamNode
- **File Name**: Inferred from dropped file (e.g., "vector-equilibrium.png")
- **DreamTalk Symbol**: Dropped file becomes the symbol
- **Enhanced Flow**: Command+Drag opens creation panel with pre-filled data

### DreamTalk Symbol Detection
- **Naming Convention**: Symbol files must match DreamNode folder name
- **File Type Hierarchy**: GIF preferred over PNG, etc.
- **Multiple Symbols**: Carousel component for cycling through variants
- **Multiple DreamSongs**: Carousel for different perspectives on same idea

## Staging Area & Sharing System

### Inbox/Preview System
**Shared Purpose**: Used for both DreamWalk sharing and Coherence Beacon notifications

**Preview-Only Approach**:
- Only DreamTalk symbol transmitted initially (security + efficiency)
- Full context: who shared, when, conversation clip reference
- Accept/Reject interface for each shared node
- Clone only happens after explicit acceptance

**Security Philosophy**:
- Trust-based network among friends/family
- Industry-standard security without paranoia
- Preview before clone prevents malicious code execution

### Post-Call Workflow
1. **Loading Dock**: Inbox shows nodes shared during conversation
2. **Context Preservation**: Links to conversation clips (Songlines)
3. **Selective Cloning**: User chooses which nodes to add to dream garden
4. **Direct Integration**: Accepted nodes clone directly to dream garden root

## Video Calling & DreamWalk Features

### Call Initiation
- **Campfire Button**: Appears on hover over Dreamer nodes (indigenous metaphor)
- **Trust-Based Network**: Calls among known peers, not strangers

### Real-Time Transcription & Context Buffer
- **Continuous Transcription**: Local models processing speech
- **Keyword Extraction**: ML model identifies information-dense keywords
- **Context Buffer**: Rolling window of ~10 relevant keywords
- **Duplicate Handling**: Move repeated keywords to front vs append

### Manual Sharing System
**User-Controlled Flow**:
- **Space Bar Trigger**: User prompts system when wanting to reference something
- **Honeycomb UI**: Most relevant nodes appear in familiar search layout
- **No Interruption**: System never interrupts conversation flow
- **Signal Over Noise**: 3-5 high-quality shares vs 100 adjacent suggestions

### Relationship Buffer System
**Queued Sharing Architecture**:
- **Relationship-Specific Buffers**: Each Dreamer connection maintains its own queue of DreamNodes to share
- **Buffer Fullness Indicator**: Visual signal when enough content is queued for a meaningful conversation
- **Temporal Coordination**: Share DreamNodes at optimal moments rather than immediately
- **Surprise Planning Workflow**: Queue content for future reveal (birthdays, gifts, projects)
- **Collaborative Transition**: Recipients become collaborators after surprise is revealed

**Core Use Cases**:
- **Gift Coordination**: Create surprise birthday collages with multiple collaborators, reveal to recipient on their birthday
- **Project Planning**: Build up context for complex discussions before initiating the conversation
- **Relationship Maintenance**: Queue interesting content to share during next natural conversation
- **Context-Rich Sharing**: Deliver multiple related items in one focused exchange

**Technical Implementation**:
- **Per-Relationship Queues**: Each Dreamer node maintains a buffer of pending DreamNodes to share
- **Queue Visualization**: UI shows buffer fullness and content preview for each relationship
- **Timing Controls**: Manual trigger for sharing buffered content during video calls
- **Surprise Mechanics**: Special handling for content that shouldn't be visible to specific recipients until reveal

### Songlines Generation
- **Timestamp Capture**: Record when DreamNode was shared
- **LLM Clip Generation**: Analyze surrounding conversation for coherent context
- **Fuzzy Boundaries**: Handle cases where explanation comes before/after sharing
- **Automatic Attachment**: Clips become part of DreamNode's story

**DreamWalk Philosophy**: Conversations as walking through each other's dream gardens, explicitly encountering and sharing specific nodes with full context.

## Coherence Beacon System

### Core Philosophy
**Social Resonance Filter**: "You cannot accept something without offering it to your friends, and you cannot offer something without accepting it for yourself." This creates a natural quality filter where coherent ideas spread based on genuine resonance.

### Technical Implementation
**Radicle Integration**: Leverages Radicle's peer-to-peer commit spreading mechanism
**Custom Git Hooks**: Add super module tracking capability (excluded from traditional software development for good reasons, but perfect for this system)

### Workflow Example (Alice, Bob, Charlie)
1. **Initial State**: Alice has Circle + Square DreamNodes, shared with Bob (Circle) and Charlie (Square)
2. **DreamWeaving**: Alice weaves Circle + Square into higher-order Cylinder DreamNode
3. **Submodule Addition**: Circle and Square become submodules of Cylinder
4. **Super Module Tracking**: Custom git hooks automatically add super module references to Circle and Square repos
5. **Beacon Trigger**: Alice manually triggers Coherence Beacon (separate from "Save")
6. **Commit Spreading**: Super module commits propagate through Radicle network
7. **Offers**: Bob (holding Circle) and Charlie (holding Square) receive offers for Cylinder DreamNode
8. **Acceptance**: Recipients can accept/reject via same inbox system as DreamWalk sharing

### User Control
- **Save vs Share**: Users can iterate and build DreamSongs privately
- **Manual Trigger**: "Trigger Coherence Beacon" as separate action from saving
- **Quality Gate**: Only share when reaching coherent, complete state
- **Natural Meritocracy**: Ideas spread based on resonance, not virality

### Technical Questions (To Be Resolved)
1. **Git Hook Type**: Post-commit hooks for detecting submodule additions?
2. **Storage Location**: Super module tracking in .udd metadata vs git-native approach?
3. **UI Implementation**: Beacon trigger as separate button or "Save & Share" checkbox?
4. **Acceptance Flow**: Same inbox as DreamWalk or separate UI for Radicle-based offers?

## DreamOS Foundational Operations

### Core Philosophy: Emergent Structure Over Planned Architecture
**Bottom-Up Organization**: Start by throwing everything into one DreamNode, then let structure emerge naturally from actual use patterns and storytelling needs. File structure becomes implicit from actions rather than predetermined.

### Analysis: Pop-Out Operation
**Submodularization of Content**:
- **Select & Extract**: Choose any subset of DreamNode content and pop it out as standalone DreamNode
- **Automatic Submodule Import**: Original DreamNode automatically re-imports extracted content as submodule
- **Path Adjustment**: All references and paths updated automatically to maintain integrity
- **Sovereign Pieces**: Transform any content into independent, reusable DreamNode
- **Emergent Modularization**: Structure emerges from actual usage patterns, not upfront planning

**Use Case Example**: Start with comprehensive DreamNode containing mixed content. When telling a new story that needs specific PDF, pop out PDF as standalone DreamNode. Original DreamNode remains intact with submodule reference, new story can import same content.

### Synthesis: Dream Weaving
**Compositional Assembly**:
- **Multi-Node Weaving**: Combine multiple DreamNodes into higher-order compositions
- **Automatic Submodule Integration**: System handles git submodule operations transparently
- **Story-Driven Structure**: Choose DreamTalk symbols for storytelling; system handles underlying file organization
- **Source Agnostic**: Whether symbols come from one DreamNode or multiple, system adapts seamlessly

### Merge: Unified Representation
**Consolidation of Equivalent Ideas**:
- **Same Idea, Different Forms**: Merge DreamNodes representing identical concepts with different representations
- **Social Propagation**: Merged representation propagates through Coherence Beacon system
- **Unified Thought Forms**: Prevent division by superficial technical differences between equivalent ideas
- **Collaborative Convergence**: Invite entire network to hold more complete, unified representation

**Use Case Example**: Alice shares book DreamNode, Bob independently creates DreamNode for same book. Merge operation creates unified representation incorporating both perspectives, propagates to all holders.

### Process/Substance Meme Duality
**Relative Categorization System**:
- **Substance Memes**: DreamNodes containing products/content (photos, documents, artifacts)
- **Process Memes**: DreamNodes containing transformative functions (AI agents, generators, processors)
- **Contextual Relativity**: Same DreamNode can be substance in one context, process in another
- **Enzyme Metaphor**: Process memes transform substance memes into new substance memes

**Example Chain**:
1. **Substance Meme**: Party photos DreamNode
2. **Process Meme**: Photo album generator DreamNode (transforms photos → album)
3. **New Substance Meme**: Generated photo album DreamNode
4. **Another Process Meme**: README generator DreamNode (transforms album → documentation)

### Digital Spirits: Meta-Ontology
**Universal Container Concept**:
- **Shamanic Computing**: DreamNodes as digital spirits containing functional essences
- **Meta-Ontological Wrapper**: Any graspable unit (AI agent, post, function) becomes DreamNode
- **Everything-as-Function**: All content expressible as git repository falls under "digital spirit" category
- **Universal Processing**: Right-click any DreamNode to process it with any compatible processor DreamNode

### Universal Processing Interface
**Context-Aware Operations**:
- **Right-Click Processing**: Process any DreamNode with any other DreamNode that qualifies as meaningful processor
- **Automatic Qualification**: System identifies which DreamNodes can meaningfully process others
- **Output Handling**: TBD whether processing creates new DreamNode or commits to existing repository
- **Contextual Intelligence**: System understands process/substance relationships dynamically

### DreamOS Vision: Convergent System
**Unified Platform Properties**:
- **Operating System**: File management and process execution
- **AI Agent Framework**: Digital spirits as functional units
- **Social Network**: Coherence Beacon propagation
- **Knowledge Management**: Emergent structure from actual usage
- **Creative Tool**: Story-driven content organization

**Philosophical Foundation**: Structure emerges from use, not planning. Users focus on creative expression while system handles technical complexity transparently.

## Technical Implementation Research Completed ✅

### Comprehensive Technical Foundation (January 2025)
**Phase**: Complete technical architecture research and planning
**Status**: Ready for GitHub issue creation and development planning
**Next Phase**: Begin plugin implementation following researched patterns

### Technical Research Completed ✅
- **Obsidian Plugin Architecture**: Custom view types, WorkspaceLeaf integration, React Three Fiber rendering within Obsidian
- **File Watching Strategy**: Comprehensive file system monitoring with debounced batch processing for .canvas files and git operations
- **Git LFS + Decentralization**: git-annex with IPFS backend recommended over traditional Git LFS for true peer-to-peer architecture
- **Error Handling Patterns**: Complete user-friendly error handling system with AI-powered automatic bug fixing pipeline

### Vision Completeness Assessment ✅
**Core Systems Fully Specified**:
- Heart-based network effect through relationship-centered onboarding
- Holographic echo chamber solution via connection-over-separation emphasis  
- Dream weaving mechanism that dissolves filter bubbles into constituent parts
- AI-driven self-healing codebase with automatic GitHub issue resolution
- Coherence Beacon system for social resonance filtering

### Key Technical Decisions Made ✅
1. **Storage**: git-annex + IPFS for decentralized media storage (not Git LFS)
2. **Plugin Architecture**: ItemView with React Three Fiber canvas, esbuild bundling
3. **File Watching**: Obsidian vault events with debounced batch processing
4. **Error Handling**: User-friendly abstractions with AI-powered recovery
5. **Development Approach**: Modular DreamNode features as standalone repositories

### Social & Community Considerations Identified 🔄
**Areas for Future Exploration** (when needed):
- Community governance and economics at scale
- Accessibility and inclusive design patterns  
- Data portability and digital inheritance planning
- Integration with existing user workflows and tools

### Ready for Implementation Phase 🚀
**Technical architecture is complete and coherent**. Vision has reached sufficient depth for practical implementation. All major technical challenges have clear solutions.

**Next Session Goal**: Generate GitHub issues and development roadmap based on completed research.

## Extracted Technical Patterns from Prototype

### DreamTalk Component Implementation (Proven Working)

**Core Image Fitting Algorithm**:
```javascript
// Proven circular image fitting solution
const containerDimensions = { width: size, height: size }; // Square container
const mediaContainer = {
  width: `${dimensions.width * 0.8}px`,    // 80% of container
  height: `${dimensions.height * 0.8}px`,  // 80% of container
  position: 'absolute',
  top: '50%', left: '50%',
  transform: 'translate(-50%, -50%)',      // Perfect center
  borderRadius: '50%',                     // Circular crop
  overflow: 'hidden'
};

const mediaStyle = {
  width: '100%', height: '100%',
  objectFit: 'cover'                       // Crop to fill circle
};

// Radial gradient overlay for smooth circular fade
const circularFadeOverlay = {
  background: 'radial-gradient(circle, rgba(0,0,0,0) 50%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,1) 70%)',
  borderRadius: '49%'  // Slightly smaller for smooth edge
};
```

**Multi-Media Support Pattern**:
```javascript
const renderMedia = (mediaData) => {
  const commonStyle = { width: '100%', height: '100%', objectFit: 'cover' };
  
  switch (mediaData.type) {
    case 'image/jpeg': case 'image/png': case 'image/gif': case 'image/webp':
      return <img src={mediaData.data} style={commonStyle} />;
    case 'audio/mpeg': case 'audio/wav':
      return <div style={{...commonStyle, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <audio controls src={mediaData.data} style={{width: '90%', maxWidth: '200px'}} />
      </div>;
    case 'video/mp4': case 'video/webm':
      return <video controls src={mediaData.data} style={commonStyle} />;
    default: return null;
  }
};
```

**Carousel Navigation Logic**:
```javascript
// Multiple DreamTalk symbols per DreamNode
const [currentMediaIndex, setCurrentMediaIndex] = useState(0);

const handlePrevMedia = () => {
  setCurrentMediaIndex(prev => prev > 0 ? prev - 1 : mediaArray.length - 1);
};

const handleNextMedia = () => {
  setCurrentMediaIndex(prev => prev < mediaArray.length - 1 ? prev + 1 : 0);
};
```

**Visual Design Patterns**:
```javascript
// Color scheme from constants
const COLORS = { BLACK: '#000000', WHITE: '#FFFFFF', BLUE: '#00a2ff' };

// Circular container with border
const dreamNodeStyle = {
  borderRadius: '50%',
  border: `5px solid ${borderColor}`,  // Blue for Dreams, Red for Dreamers
  background: BLACK,
  overflow: 'hidden'
};

// Hover states with smooth transitions
const hoverOverlay = {
  background: 'rgba(0, 0, 0, 0.7)',
  transition: 'opacity 0.3s ease'
};
```

**Responsive Sizing Pattern**:
```javascript
// Dynamic container sizing
useEffect(() => {
  const updateDimensions = () => {
    const container = containerRef.current;
    const size = Math.min(container.offsetWidth, container.offsetHeight);
    setDimensions({ width: size, height: size });
  };
  
  updateDimensions();
  window.addEventListener('resize', updateDimensions);
  return () => window.removeEventListener('resize', updateDimensions);
}, []);
```

**Empty State Handling**:
```javascript
// Fallback when no media exists
const emptyState = {
  background: 'rgba(0, 0, 0, 0.7)',
  display: 'flex', flexDirection: 'column', 
  justifyContent: 'center', alignItems: 'center',
  opacity: !hasMedia ? 1 : 0,
  transition: 'opacity 0.3s ease'
};
```

## DreamOS Architecture Paradigm

### The Ontological Inversion Vision

**Phase 1: InterBrain Inside Obsidian**
- Start as Obsidian plugin with modular architecture
- Each major feature developed as standalone DreamNode (independent git repo)
- Plugin composes these DreamNodes into unified InterBrain experience

**Phase 2: The Switch - Obsidian Inside DreamOS**
- Reframing moment where container becomes contained
- Obsidian itself becomes a DreamSong within DreamOS ecosystem
- InterBrain transcends plugin status, becomes operating system foundation

### Modular DreamNode Architecture

Every major feature should be designed as **standalone DreamNodes**:

**Semantic Search DreamNode**:
- Independent git repository with own UI mockup
- Can be installed standalone for any Obsidian vault
- Also serves as DreamTalk symbol within InterBrain DreamSong

**Video Chat DreamNode**:
- Standalone Obsidian plugin for peer-to-peer video calling
- Independently useful for any Obsidian user
- Integrates as component within InterBrain's DreamWalk system

**3D Visualization DreamNode**:
- Independent spatial renderer for git repository networks
- Can visualize any collection of linked git repos
- Becomes InterBrain's core spatial interface when composed

**Git Operations DreamNode**:
- Standalone git abstraction layer for everyday users
- Translates "Save/Share" to git operations
- Reusable across any git-based knowledge management system

### Universal Pattern Recognition

**DreamTalk Symbol Generalization**:
- Traditional: Image/media file representing an idea
- Universal: Any UI component (search bar, button, widget, interactive element)

**DreamSong Generalization**:
- Traditional: Linear explanation with references to DreamTalk symbols
- Universal: Any interactive interface (apps, websites, UIs, non-linear experiences)

**Core Principle**: Frontend and backend travel together as complete functional units

### AI-Enabled Future Vision

**Paradigm Shift Timeline**:
- **Current**: Monolithic applications built by software companies
- **Transition**: AI models can one-shot create basic applications
- **Future**: Micro-projects shared between communities, composable DreamSongs spoken into existence

**Implications for Architecture**:
- Design for composability from day one
- Each DreamNode must be independently valuable
- Plugin serves as bootloader for broader DreamOS ecosystem
- Community-driven development over corporate software monopolies

### Development Strategy

**Modular Independence**: Each feature repo should:
1. **Stand Alone**: Provide value as independent Obsidian plugin
2. **Compose Together**: Integrate seamlessly into full InterBrain experience  
3. **Bootstrap DreamOS**: Enable the ontological inversion to operating system

**Git Submodule Strategy**: Use git submodules extensively for:
- Linking independent DreamNode repositories
- Enabling fine-grained version control across components
- Creating proof-of-concept for DreamOS git-based architecture
- Testing AI pair-programming paradigm at scale

**AI Collaboration**: Leverage git-based architecture for optimal AI assistance:
- Each DreamNode provides complete context for AI understanding
- AI tools (Aider, Claude) can work on isolated features
- Natural boundaries prevent AI context pollution
- Enables distributed AI-human collaborative development


### Git Commit Philosophy
**Commit Early, Commit Often**:
- Make local commits after every meaningful change
- Commit after each file modification, documentation update, or feature implementation
- Create granular history that can be squashed into meaningful commits later
- This prevents work loss and maintains a clear development trail
- Every logical checkpoint in conversation deserves a commit
- Think of commits as persistent memory checkpoints

### Future Community Issue Templates
Need to create user-focused templates when project goes public:
- Bug Report template (reproduction steps, environment info)
- Feature Request template (user story format)
- Documentation Issue template
- Consider hiding Epic/Spec templates from community (internal development planning)
- Task template could work for community contributions but needs simplification
- Config.yml file creation deferred until community engagement phase

## Repository Migration Strategy

### Approach: Relaxed Two-Stage Migration
1. **Create new repository** with temporary name (e.g., "interbrain-obsidian-plugin")
2. **Set up everything properly** in the new repo without time pressure
3. **When ready**: Use GitHub's rename feature to swap names
   - Old repo → "InterBrain-Legacy-Prototype"
   - New repo → "InterBrain"
4. **GitHub handles redirects** automatically for all links

### Migration Checklist
- Transfer vision files (CLAUDE.md, README.md, ROADMAP.md, Architecture.md)
- Create proper Obsidian plugin structure
- Set up GitHub issue templates for 4-tier hierarchy
- Generate all 97 GitHub issues with proper linking
- Configure branch protection and CI/CD
- Update old repo README with redirect notice

## Professional Development Workflow

### 80/20 Approach
Focus on the 20% of professional practices that provide 80% of the value:

**MUST HAVE (80% value):**
1. **Testing** - Jest unit tests at Feature level
2. **Linting** - ESLint via GitHub Actions
3. **Type Checking** - TypeScript strict mode
4. **Changelog** - Updated with each GitHub Release
5. **Branch Protection** - Clean main branch history
6. **Documentation** - Generated from closed Specification issues

**SKIP FOR NOW (20% value):**
1. **Performance Benchmarks** - Premature optimization
2. **Complex CI/CD** - Start simple, add as needed
3. **Security Scanning** - GitHub Dependabot handles automatically

### Issue Hierarchy & Testing/Documentation
**4-Tier Structure**: Epic → Specification → Feature → Task

**Testing & Documentation at Feature Level**:
- Each Feature includes standard sub-tasks:
  1. Implementation tasks
  2. Write unit tests
  3. Update documentation
  4. Code review
- Features are concrete enough to test but not overly granular

## CI/CD and Testing Strategy

### Unified Pipeline Approach
**One source of truth** - Commands defined in `package.json`:
```json
{
  "scripts": {
    "test": "jest",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "check-all": "npm run lint && npm run typecheck && npm run test"
  }
}
```

### Local Development Flow
1. **Feature branches** for all development
2. **Before pushing**: Run `npm run check-all` locally
3. **Fix any issues** and amend commits
4. **Push to feature branch** when all checks pass

### GitHub Actions Configuration
```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run check-all  # Same command as local!
```

### Branch Protection Rules
- **Required checks** must pass before merging
- **Squash and merge** to keep main branch history clean
- **Delete feature branches** after merge

## Changelog and Release Management

### Release vs Commit
- **Commits**: Regular development checkpoints (can be messy locally)
- **Releases**: Tagged commits with version number, changelog, and plugin .zip

### Changelog Update Rhythm
- **When**: Update CHANGELOG.md with each GitHub Release (not each commit)
- **Frequency**: At completion of each Feature or Epic
- **Format**: Follow [Keep a Changelog](https://keepachangelog.com/) standard
- **Categories**: Added, Changed, Fixed, Removed

### Creating Releases
1. Complete feature/epic development
2. Update CHANGELOG.md with changes
3. Create git tag: `git tag v0.1.0`
4. Push tag: `git push --tags`
5. Create GitHub Release from tag
6. Attach plugin .zip file

## Command Palette Architecture

### Core Abstraction Pattern
The InterBrain plugin uses **Obsidian's command palette as the primary abstraction layer** between UI interactions and backend git operations. This creates a clean separation of concerns and dual access patterns.

### Architecture Flow
```
UI Component → Command Palette → Service Layer → Git Operations
     ↓              ↓               ↓              ↓
Button Click → executeCommandById → GitService → shell commands
```

### Dual Access Pattern
**Power Users**: Access all operations via Cmd+P command palette
**Regular Users**: Use UI buttons that trigger identical command palette commands

### Command Registration Pattern
```typescript
// Register commands in main plugin file
this.addCommand({
  id: 'save-dreamnode',
  name: 'Save DreamNode',
  callback: async () => {
    const currentNode = this.getCurrentDreamNode();
    await this.gitService.commitWithAI(currentNode);
    this.ui.showSuccess('DreamNode saved');
  }
});

// Call from UI components
this.app.commands.executeCommandById('interbrain:save-dreamnode');
```

### Service Layer Architecture
Commands delegate to service classes for actual operations:
- **GitService**: Handles all git operations with AI assistance
- **DreamNodeService**: Manages DreamNode creation and manipulation
- **VaultService**: Handles Obsidian vault operations
- **UIService**: Manages notifications and user feedback

### Development Approach: Frontend-First with Placeholders

### Phase 1: Command Stubs
Create placeholder commands that log what would happen:
```typescript
this.addCommand({
  id: 'weave-dreams',
  name: 'Weave Dreams into Higher-Order Node',
  callback: () => {
    const selectedNodes = this.getSelectedDreamNodes();
    console.log('Would weave:', selectedNodes.map(n => n.name));
    this.ui.showPlaceholder('Dream weaving coming soon!');
  }
});
```

### Phase 2: Frontend Development
Build UI components that call placeholder commands:
- Perfect user interactions and workflows
- Test state management and context passing
- Validate user experience flows
- Get feedback on interface design

### Phase 3: Backend Implementation
Replace command stubs with real implementations:
- Service layer handles complex git operations
- AI assistance for user-friendly abstractions
- Error handling and user feedback
- Integration testing

### Technical Considerations (All Manageable)

**Context Passing**: 
- Plugin maintains current DreamNode state
- Commands access state via `this.getCurrentDreamNode()`
- UI updates trigger state changes

**Async Handling**:
- All commands are async by default
- UI shows loading states during operations
- Standard async/await patterns throughout

**Error Handling**:
- Centralized error handling in service layer
- User-friendly error messages via UI service
- Consistent error patterns across all commands

### Command Naming Convention
- **Namespace**: All commands prefixed with `interbrain:`
- **Verbs**: Use action words (save, create, weave, share)
- **Context**: Include object being acted upon (dreamnode, dreams)
- **Examples**: `interbrain:save-dreamnode`, `interbrain:weave-dreams`

### Benefits of This Architecture
1. **Clean Separation**: UI, commands, and services have distinct responsibilities
2. **Testability**: Commands can be tested in isolation
3. **Maintainability**: Changes to git operations don't affect UI
4. **User Experience**: Power users get command palette access
5. **Development Speed**: Frontend and backend can be developed in parallel
6. **Error Isolation**: Easy to determine if issues are in UI or backend

## Obsidian Plugin Submission

### Process Overview
- **No formal namespace reservation** - ID claimed on submission
- **Submit via PR** to [obsidian-releases](https://github.com/obsidianmd/obsidian-releases) repo
- **Plugin ID** doesn't need to match repository name
- **Forum announcement** optional but builds community presence

### When to Submit
- After core functionality is stable
- When ready for community use
- No rush - "interbrain" namespace unlikely to be taken

## License

GNU AFFERO GENERAL PUBLIC LICENSE - This project is open source with copyleft requirements.