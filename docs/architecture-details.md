# Architecture Details

This document contains detailed technical implementation information for the InterBrain system.

## DreamNode Lifecycle & Git Operations

### Creation & Initialization

- **Immediate git setup**: `git init` + initial commit on DreamNode creation
- **Metadata storage**: `.udd` **single JSON file** (Universal Dream Description) with complete schema
- **Primary identifiers**: UUID-based (either custom generated or Radicle ID)
- **Initial commit**: Includes metadata file + any provided files (DreamTalk symbols)

### Git Workflow Abstraction

**User-Friendly Terminology**:
- "Save" instead of "commit" for everyday users
- "Unsaved changes" indicators in UI
- Stash/Drop/Save options for managing changes

**Target Audience**: Poets, artists, philosophers, grandparents - NOT programmers
**AI-Powered Abstraction**: LLMs handle complex git operations behind simple UI actions

## Service Layer Architecture (Epic 3)

### Interface-Based Design

**Service Abstraction Pattern**:
```typescript
interface DreamNodeService {
  create(title: string, type: NodeType, dreamTalk?: File): Promise<DreamNode>
  update(id: string, changes: Partial<DreamNode>): Promise<void>
  delete(id: string): Promise<void>
  list(): Promise<DreamNode[]>
}
```

**Mock/Real Implementation Switching**:
- `MockDreamNodeService`: Fast UI iteration with session storage persistence
- `GitDreamNodeService`: Real git repository operations
- Runtime switching via command palette for development efficiency

### Git Template System

**DreamNode Template Structure**:
```
DreamNode-template/
├── .udd                  # Single JSON file containing: UUID, title, type, dreamTalk, relationships, email, phone, radicleId
├── hooks/
│   ├── pre-commit        # Coherence beacon updates
│   ├── post-commit       # Relationship tracking
│   └── post-merge        # Submodule sync
└── README.md            # DreamNode documentation
```

**Template Usage**: `git init --template=${pluginPath}/DreamNode-template`

### Creator Mode Pattern

**Auto-stash Workflow**:
- Enter: `git stash pop || true` (restore work-in-progress)
- Exit: `git add -A && git stash push -m "InterBrain creator mode"`
- Save: `git add -A && git commit -m "message"` (clears stash)

**Visual Git States**:
- **Red Glow**: Uncommitted or stashed changes (work-in-progress)
- **Blue Glow**: Committed but unpushed changes (ready to share)
- **Clean**: No glow for synchronized repositories

### DreamWeaving & Submodules

1. **Canvas Creation**: User creates DreamSong in Obsidian canvas with external DreamTalk symbols
2. **File Path Parsing**: System identifies external references by parsing canvas file paths
3. **Commit Trigger**: User "saves" the DreamSong (commit action)
4. **Automatic Submodule Addition**: `git submodule add` for each external reference
5. **Path Updates**: Canvas file paths updated to point inside submodules

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
2. **Storage Location**: Super module tracking in .udd file (single JSON) vs git-native approach?
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

**3-Tier Structure**: Epic → Specification → Feature

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