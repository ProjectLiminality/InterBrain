# Changelog

All notable changes to the InterBrain project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
This release establishes the complete DreamNode management foundation for Epic 4 (Git Operations Abstraction), with service layer architecture, visual state management, and robust git integration patterns ready for user-friendly Save/Share paradigm implementation.

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