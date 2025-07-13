# Changelog

All notable changes to the InterBrain project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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