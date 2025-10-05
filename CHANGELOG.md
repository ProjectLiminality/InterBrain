# Changelog

All notable changes to the InterBrain project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2025-10-05 - Epic 7: Conversational Copilot System (Complete)

### Added

**Complete Copilot System with Real-time Search (Feature #327)**
- Person-centered conversational mode with semantic search-driven UX
- Real-time transcription with 500-character context window for semantic search
- Option key press-and-hold to show/hide search results honeycomb
- Fullscreen DreamTalk/DreamSong overlays on dreamspace canvas
- Shared nodes tracking with bidirectional relationship management
- README and docs/ directory indexing for documentation-aware search

**FaceTime Integration & Call Automation (Feature #333)**
- AppleScript-based FaceTime call initiation from Obsidian commands
- Contact metadata system (email/phone) for person DreamNodes
- Automatic copilot mode activation on call start
- Integrated end-call command with automatic cleanup
- Seamless conversation workflow from call to copilot mode

**Real-Time Transcription System (Feature #335)**
- whisper_streaming integration with LocalAgreement-2 for duplicate prevention
- Python CLI with sub-5-second latency speech-to-text
- Self-contained virtual environment with automatic dependency management
- Obsidian process management via command palette
- Timestamped markdown output with instant file updates
- Cross-platform support (macOS, Windows, Linux)

**Conversation Recording & Export System (Feature #331)**
- DreamNode invocation tracking during conversations
- Real-time transcript embedding of invoked nodes
- AI-powered conversation summaries via Claude API
- Email export with pre-filled Apple Mail drafts
- Obsidian URI deep links for one-click node cloning
- Batch clone links for sharing multiple DreamNodes
- Graceful fallback when AI API unavailable

### Technical Achievements

**Conversational Architecture**
- Copilot spatial mode with person node at center
- Semantic search integration driving real-time node discovery
- 500-char rolling context window for focused search relevance
- Auto-hide/show ribbon for cleaner video call interface
- Multi-window transcript refocus with focus restoration mechanisms

**Python Integration Innovation**
- Virtual environment isolation with pip dependency management
- Symlink-aware script path resolution for development workflow
- Python 3.13 compatibility with cross-platform dependency handling
- Process lifecycle management with graceful cleanup
- stdout/stderr monitoring for real-time feedback

**AI & LLM Integration**
- Provider abstraction layer supporting multiple LLM backends
- Claude API integration via Obsidian's requestUrl (CORS workaround)
- Conversation summarization with invocation context awareness
- Plugin settings tab for API key configuration
- Future-ready architecture for OpenRouter and open-source models

**Deep Linking System**
- Custom Obsidian URI protocol handlers (`obsidian://interbrain-clone`)
- Single node and batch clone URI support
- Proof-of-concept implementation with console logging
- Foundation for future peer-to-peer DreamNode sharing
- Plain text email format with clickable deep links

**macOS System Integration**
- AppleScript execution via Node.js child_process
- Apple Mail draft generation with pre-filled content
- FaceTime automation with contact resolution
- Electron window focus management for dictation continuity
- System-level integration without external dependencies

### Enhanced

**Spatial Orchestrator**
- Immediate fly-out animation on empty search results
- Copilot-aware layout state management
- Enhanced global API for scaled position restoration
- Proper animation timing for video call transitions

**Transcription UX Polish**
- Relative timestamps ("Just now", "1 minute ago")
- Improved invocation formatting with single blank lines
- Blocking mode to prevent transcription duplication
- Comprehensive debug logging for troubleshooting
- Focus restoration mechanisms for seamless dictation

**Code Quality**
- Disabled `no-explicit-any` ESLint rule for undocumented Obsidian APIs
- 208 tests passing with zero TypeScript errors
- Clean separation of concerns across service layers
- Singleton pattern for transcription service lifecycle

### Fixed

- CORS issues with Claude API using Obsidian's `requestUrl()`
- Email export transcript capture timing (read before deletion)
- Click-based invocation tracking (decoupled from hotkey selection)
- Python virtual environment path resolution across platforms
- RealtimeSTT log file writing to read-only directories
- Transcription duplication through blocking mode implementation
- Invocation formatting consistency with blank line normalization
- Electron environment detection for email export
- URI handler graceful fallback registration
- FaceTime call responsiveness by exiting copilot mode first

## [0.6.0] - 2025-09-18 - Epic 6: DreamWeaving Operations (Complete)

### Added

**DreamNode Flip Animation System (Feature #324)**
- Seamless 3D flip animation revealing DreamSong content on node backside
- Professional flip button with 3x larger hit area and cursor feedback
- Bidirectional flipping with proper animation timing and state management
- Integrated with Obsidian's canvas parsing system for real content display
- Surgical precision fixes for billboard distortion and hit detection

**Full-Screen DreamSong Experience (Feature #325)**
- Dedicated full-screen leaf for immersive DreamSong exploration
- Ctrl+D hotkey integration with smart split-screen detection
- Real-time file change monitoring with automatic content updates
- Comprehensive PDF support and enhanced undo-redo functionality
- Command integration with leaf manager for consistent navigation

**DreamWeaving Canvas Integration (Feature #286)**
- Complete .canvas and .link file support across the system
- Canvas-to-DreamSong parsing with three-layer architecture
- Media path resolution using data URLs for instant playback
- Topological ordering preservation for logical content flow
- Terminal command access with Ctrl+C hotkey for DreamNodes

**Constellation Layout System (Feature #326)**
- Force-directed graph clustering for relationship visualization
- Mathematical precision positioning for 1-36 node layouts
- Complete edge rendering system with relationship mapping
- Interactive demonstrations with comprehensive documentation
- Spherical graph clustering with constellation threads

### Technical Achievements

**DreamSong Architecture Revolution**
- Three-layer DreamSong system: DreamTalk → Canvas → README fallback
- Intelligent caching with L1/L2 cache architecture for performance
- Service layer consolidation with unified parsing infrastructure
- Real-time synchronization between 3D view and full-screen experience

**Canvas Parser Enhancement**
- Complete rewrite of canvas parsing with structural hash caching
- Support for complex canvas topologies with media-text pair handling
- .link file metadata extraction with YouTube and website support
- Robust error handling and graceful degradation patterns

**Developer Experience Infrastructure**
- Comprehensive slash command system (/epic-start, /feature-complete, etc.)
- Systematic workflow automation for development lifecycle
- Quality assurance integration with mandatory testing protocols
- GitHub CLI integration for seamless project management

**Performance Optimizations**
- Background indexing system with git integration
- Intelligent file change detection with selective re-parsing
- Memory-efficient caching strategies across component hierarchy
- Optimized animation systems with proper cleanup patterns

### Enhanced

**Spatial Navigation System**
- Improved transition animations between spatial modes
- Enhanced escape key navigation with proper state isolation
- Consolidated layout state management across all view modes
- Quality-of-life navigation toggles for fluid user experience

**File System Integration**
- Node.js FileSystem API migration for improved reliability
- Obsidian-native file streaming for instant media playback
- Path resolution improvements across service architecture
- Robust error handling for file operations and git integration

### Fixed

- TypeScript errors across 11 files with comprehensive type safety
- Service method access patterns with proper null safety
- Event listener type casting for Obsidian API compatibility
- Property access on adapter objects with defensive programming
- Animation state coordination for consistent user experience
- Billboard distortion in 3D flip animations with surgical precision

## [0.5.0] - 2025-08-26 - Epic 4: Liminal Web Layout System (Complete)

### Added

**Unified Edit Mode (Feature #321)**
- Complete ProtoNode integration with focused view for relationship and metadata editing
- Seamless transition between search, edit, and liminal-web spatial modes
- Real-time visual feedback during editing with semantic search integration
- Save animation system with scale/opacity transitions for natural UX flow
- Context-aware edit activation with proper spatial layout state management

**Edit Mode Refinements**
- Comprehensive escape key navigation system with proper state isolation
- Visual state management for edit mode overlays and UI components
- DreamTalk media file support with display and editing capabilities in EditNode3D
- Ring ordering system with priority-based positioning and smooth animations
- Center node positioning stability during edit mode transitions

**Transition System Improvements**
- Liminal-web transition animations with proper command queuing
- Quality-of-life navigation toggles between spatial modes
- Animation duration respect system for seamless user experience
- Mid-flight animation interruption handling for responsive interactions
- Proper state management for complex spatial mode transitions

**Layout State Unification**
- Unified spatialLayout state management across all modes including edit
- Enhanced escape navigation flow with debouncing and state coordination
- Single-layer escape navigation system with optimized user experience
- Elegant spinning loading indicators for async operations
- Visual feedback systems for edit mode state changes

**Bug Fixes and Polish**
- Fixed UI blocking issues by removing unnecessary 3D geometry from EditModeSearchNode3D
- React Hooks order violation resolution in EditModeOverlay component
- Gradient direction fixes and escape event propagation priority handling
- Ring ordering logic improvements with proper position swapping
- Center node fly-out prevention during edit mode entry

### Technical Achievements

**Architecture Completion**
- Epic 4 foundation features (#316, #320) integrated with edit mode (#321)
- Complete spatial relationship orchestration system operational
- Unified edit interface supporting both metadata and relationship modifications
- Service layer architecture maintained throughout edit mode implementation

**Code Quality Excellence**
- 179 unit tests passing with comprehensive coverage maintained
- Zero lint warnings and zero TypeScript compilation errors
- Clean git state with systematic commit organization
- Performance optimization for complex spatial transitions

**Key Technical Innovations**
- Spatial layout state coordination between store and orchestrator systems
- Edit mode lifecycle management with proper component mounting/unmounting
- DreamTalk media file persistence and display integration
- Animation state management for complex multi-component interactions

### Known Issues

**Proto Node Animation System** (Documented for Future Resolution)
- Proto node fly-in animations deferred due to animation system complexity
- Current implementation provides stable core functionality without visual transitions
- Animation states conflict with component lifecycle and useFrame timing
- Requires architectural rethinking of animation coordination for creation components

**Edit Mode Layout Edge Cases** (Documented for Future Resolution)
- Search results differentiation between related vs unrelated nodes in ring layout
- Complex state coordination between spatial orchestrator and store systems
- Alternative approach consideration: simpler behavior acceptance for MVP

### Breaking Changes

None. All changes are backward compatible with existing Epic 1-5 functionality.

### Migration Notes

No migration required. Epic 4 completion enhances existing spatial navigation workflows without disrupting current functionality.

## [0.4.0] - 2025-08-19 - Epic 5: Semantic Search System

### Added

**Intelligent Indexing System (Feature #322)**
- Complete IIndexingService interface with IndexingService implementation
- Vector data persistence across sessions via Zustand store with Map serialization
- Command palette integration with three indexing commands and async operation patterns
- Git-based change detection: automatic indexing on creation + commit-hash delta detection
- Intelligent delta updates: only index changed/new nodes, cleanup deleted nodes
- Background processing with non-blocking operations and progress indicators (20% intervals)
- Service layer integration with mock/real mode compatibility and unified node access
- Comprehensive testing: 22 IndexingService tests (179 total tests passing)

**Semantic Search Implementation (Feature #290)**
- Ollama Local Embedding API integration: sovereign AI solution using local models
- Modular feature architecture: complete vertical slice at `src/features/semantic-search/`
- Zustand store slice pattern: OllamaConfigSlice with clean state management
- Service layer integration: factory pattern with app context for semantic operations
- Command organization: 8 semantic search commands across 3 organized command files
- Auto-indexing pipeline: nodes automatically indexed on creation and git commit changes

**Search-as-DreamNode Interface (Feature #323)**
- Unified search/creation UX paradigm with seamless query-to-node transformation
- SearchNode3D component with real-time visual feedback during query typing
- Save animation system with scale/opacity transitions for natural UX flow
- Command palette integration: "Activate Search Interface" with proper state management
- Context-aware search activation: spatial layout switching with clean state transitions
- Intelligent query change detection: only trigger re-search when query content changes

**Honeycomb Search Layout (Feature #280)**
- Mathematical precision for 1-36 node positioning with perfect hexagonal grid
- Adaptive ring distribution: dynamic optimization based on node count
- Scale progression system: center → ring 1 → ring 2 with optimal spacing ratios
- Integration with semantic search: honeycomb layout activated in search spatial mode
- Performance optimization: efficient position calculation with mathematical constants

### Technical Achievements

**Architecture Innovations**
- Experimental branch archiving strategy: preserving alternative approaches with comprehensive documentation
- Vertical slice architecture: complete self-contained features ready for npm package extraction
- Local AI sovereignty: no cloud dependencies, all processing local via Ollama
- Robust error handling: graceful degradation when semantic search unavailable
- Cross-session persistence: vector data survives plugin reloads via persistent store middleware

**Code Quality Excellence**
- Zero lint warnings and zero TypeScript compilation errors across entire codebase
- 179 unit tests passing with comprehensive coverage for new services
- Type safety improvements: systematic replacement of 'any' types with proper TypeScript typing
- Git integration hooks: automatic re-indexing on `GitDreamNodeService.create()` and commit detection

**Key Technical Innovations**
- Character frequency embeddings: placeholder system for future Qwen3 integration
- Command palette UX: setTimeout pattern prevents palette freezing during async operations
- Delta algorithm: uses git commit hashes for intelligent change detection
- Progress notifications: real-time UI feedback for long-running background operations
- Error resilience: graceful handling of indexing failures with detailed error reporting

### Files Delivered

**Core Implementation**
- `src/services/indexing-service.ts` (446 lines): Complete indexing infrastructure
- `tests/services/indexing-service.test.ts` (483 lines): Comprehensive test coverage
- `src/features/semantic-search/` (complete vertical slice): 2,500+ lines of semantic search functionality
- Enhanced 6 existing files with indexing integrations and vector storage

### Architecture Foundation

Epic 5 establishes the foundation for advanced semantic capabilities:
- Ready for semantic search interface, query processing, and similarity calculations
- Modular architecture supports future AI model integrations
- Local-first approach ensures data sovereignty and privacy
- Scalable indexing system handles growing knowledge graphs efficiently

### Breaking Changes

None. All changes are backward compatible with existing Epic 1-4 functionality.

### Migration Notes

No migration required. Semantic search features are opt-in and enhance existing workflows without disrupting current functionality.

## [0.3.0] - 2025-07-26 - Epic 3: DreamNode Management System

### Added

**Service Layer Architecture**
- Interface-based service pattern with runtime switching capability
- MockDreamNodeService for fast UI iteration without file system operations
- GitDreamNodeService for real git repository management
- Command palette commands for switching between mock and real data modes
- Session storage persistence for mock data development

**Git Template System**
- Complete DreamNode template stored in plugin directory
- Automatic git repository initialization with `git init --template`
- Pre-configured git hooks for coherence beacon updates
- UDD metadata system with JSON-based node information
- 4 new command palette commands for template operations

**Visual Git State Indicators**
- Three-tier visual state hierarchy for DreamNodes
- Red glow for uncommitted or stashed changes (work-in-progress)
- Blue glow for committed but unpushed changes (ready to share)
- Clean state (no glow) for synchronized repositories
- Robust detection using `git status --porcelain=v1 --branch`

**Creator Mode Workflow**
- Auto-stash pattern for workspace isolation
- Seamless entry/exit from work-in-progress states
- Git stash integration for preserving uncommitted changes
- Safe commit workflow with automatic stash clearing
- Protection against losing work during mode transitions

**Proto-node Creation System**
- In-space node creation with unified animation system
- Smooth transitions from proto-nodes to full DreamNodes
- Integration with drag-drop system for DreamTalk assignment
- Visual feedback during creation process

**Universal Drag-Drop Hit Detection**
- Native Three.js scene-based raycasting system
- Scale-aware hit detection across all zoom levels
- Invisible hit spheres that travel with visual nodes
- Flawless interaction at any viewing distance
- Support for both click selection and drag operations

### Technical Achievements

**Code Quality**
- 101 unit tests passing (up from 84 in Epic 2)
- Comprehensive test coverage for all new services
- Mock implementations for all service interfaces
- Zero lint warnings or type errors

**Architecture Innovations**
- Service layer abstraction enabling clean separation of concerns
- Dynamic runtime service swapping for development efficiency
- Unified animation system for consistent visual transitions
- Shared styling infrastructure (dreamNodeStyles.ts)
- Command-driven architecture with service delegation

**Development Infrastructure**
- Enhanced testing patterns for service layer
- Mock git operations for reliable testing
- Improved TypeScript interfaces and type safety
- Professional git workflow patterns documented

### Changed
- **State Management**: Extended Zustand store with service layer integration
- **Testing**: Expanded coverage to include service layer patterns
- **Commands**: Added 6 new commands for DreamNode operations
- **Documentation**: Updated with service patterns and git workflows

### Foundation for Epic 4
This release establishes the complete DreamNode management foundation for Epic 4 (Liminal Web Layout System), with service layer architecture, visual state management, and robust git integration patterns ready for dynamic spatial layout implementation based on relationships.

## [0.2.0] - 2025-07-18 - Epic 2: 3D Spatial Visualization System

### Added

**React Three Fiber Integration**
- Custom Obsidian WorkspaceLeaf with React Three Fiber Canvas
- DreamSpace view accessible via command palette and ribbon icon
- Seamless integration between Obsidian and 3D rendering engine

**3D Spatial Components**
- DreamNode 3D Component with star rendering architecture
- Star3D component for lightweight constellation visualization
- Decoupled rendering system for performance optimization
- Support for circular media display with proper aspect ratio handling

**Advanced Interaction Controls**
- Google Earth-style virtual trackball rotation without gimbal lock
- Static camera + rotatable world architecture for natural interaction
- Physics-based momentum with smooth damping
- Unified rotation mathematics eliminating momentum distortion

**Spatial Layout Algorithms**
- Fibonacci Sphere Layout using golden ratio distribution
- Perfect spherical distribution for constellation-like appearance
- Scalable algorithm supporting thousands of nodes
- Mathematical precision with proven positioning algorithms

**Dynamic View Scaling**
- Apple Watch-style distance-based scaling system
- Smooth interpolation between minimum and maximum distances
- Perspective-corrected scaling for linear perceived size changes
- Configurable scaling zones with smooth transitions

**State Management Integration**
- Extended Zustand store with spatial state management
- Layout switching between Fibonacci sphere and other patterns
- Persistent camera state across sessions
- Integrated with existing command palette architecture

### Technical Achievements

**Code Quality**
- 84 unit tests passing (up from 47 in Epic 1)
- Zero lint warnings or errors
- Full TypeScript type safety throughout
- Comprehensive test coverage for all new components

**Architecture Innovations**
- Static camera approach eliminates gimbal lock issues
- Dream Graph Orchestrator pattern for unified layout management
- Performance-optimized Group transformations
- Scalable foundation for future 3D features

**Development Infrastructure**
- Enhanced ESLint configuration with browser globals
- Comprehensive testing for React Three Fiber components
- Mock infrastructure for 3D rendering testing
- Professional development workflows with npm run check-all

### Changed
- **Build System**: Enhanced Vite configuration for 3D development
- **Dependencies**: Added React Three Fiber and Three.js support
- **Testing**: Expanded test coverage to include 3D components
- **Documentation**: Updated with spatial algorithms and patterns

### Foundation for Epic 3
This release establishes the complete 3D spatial visualization foundation for Epic 3 (DreamNode Management System), with all core spatial algorithms, interaction patterns, and rendering systems in place.

## [0.1.0] - 2025-07-13 - Epic 1: Plugin Infrastructure

### Added

**Obsidian Plugin Foundation**
- Complete Obsidian plugin boilerplate with manifest.json and main.ts
- Plugin loads successfully in Obsidian with ribbon icon
- Development vault integration with symlink support

**Modern Build System**
- Vite build system replacing esbuild for superior development experience
- Dual development workflow: browser development + Obsidian plugin builds
- Hot reload support for React development
- TypeScript configuration optimized for both environments

**Command Palette Architecture**
- 8 core commands accessible via Obsidian command palette (Cmd/Ctrl+P)
- Command-driven design pattern for all plugin functionality
- Test commands for development and verification

**Service Layer Implementation**
- UIService: User notifications and feedback system
- GitService: Git operations abstraction with AI assistance
- DreamNodeService: Node selection and state management  
- VaultService: Obsidian file system operations wrapper

**State Management**
- Zustand reactive store for centralized state management
- Cross-service state synchronization patterns
- Preparation for complex React UI components

**Comprehensive Testing**
- Vitest testing framework with 47 tests passing
- Complete Obsidian API mocking infrastructure
- Co-located test patterns following vertical slice architecture
- Integration tests for command → service → state flow

### Changed
- **Build System**: Migrated from esbuild to Vite
- **Development Workflow**: Added browser development capability
- **Architecture**: Established service layer pattern

### Technical Details

**Build Process**
- `npm run dev` - Browser development with hot reload
- `npm run plugin-build` - Obsidian plugin build (dist/main.js → main.js)
- `npm run check-all` - Complete quality checks (lint + typecheck + test)

**Commands Implemented**
- `InterBrain: Open DreamSpace` - Opens 3D spatial visualization
- `InterBrain: Save DreamNode (commit changes)` - AI-assisted git commits
- `InterBrain: Create new DreamNode` - Dream/Dreamer node creation
- `InterBrain: Weave Dreams into higher-order node` - Git submodule composition
- `InterBrain: Toggle DreamNode selection` - Multi-select operations
- `InterBrain: Share DreamNode via Coherence Beacon` - Social sharing
- `[TEST] Select Mock DreamNode` - Development state testing
- `[TEST] Clear DreamNode Selection` - Development state clearing

**Development Infrastructure**
- ESLint configuration with TypeScript support
- Vitest with jsdom environment for DOM testing
- Comprehensive mock utilities for Obsidian APIs
- Git workflow with epic/feature branch strategy

### Foundation for Future Development
This release establishes the complete foundation for Epic 2 (3D Spatial Visualization) and beyond, with clean architecture patterns and comprehensive testing coverage ensuring sustainable development.