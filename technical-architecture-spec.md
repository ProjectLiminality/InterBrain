## Overview

Obsidian plugin with vertical slice architecture designed for seamless evolution into DreamOS. Each user-facing feature exists as a self-contained folder that can later become a standalone git repository (DreamNode) without refactoring.

## Architecture

**Core Principles:**
- **Vertical Slice Architecture**: Organize by user-facing features, not technical layers
- **Git-Native Modularity**: Folders designed to become git repositories  
- **Zero-Refactor Evolution**: Growth path to DreamOS through additive changes only
- **Component Self-Containment**: Each feature defines its own types, tests, and logic

**Technology Stack:**
- **Build System**: Vite (replaces esbuild for instant hot reload + dual development workflow)
- **Frontend**: React + React Three Fiber + TypeScript
- **State Management**: Zustand (centralized store initially, distributed slices in DreamOS phase)
- **Plugin Integration**: Obsidian API + Command Palette as primary abstraction layer

**Project Structure Evolution:**
```
Phase 1 (Current): Centralized state, feature folders
src/
├── main.ts (Obsidian entry + centralized Zustand store)
├── stores/interBrainStore.ts (centralized state management)
├── semantic-search/
│   ├── SemanticSearch.tsx (interface + logic + types)
│   └── SemanticSearch.test.ts
└── spatial-viz/
    ├── SpatialViz.tsx (interface + logic + types)
    └── SpatialViz.test.ts

Phase 2 (Future DreamOS): Git submodules, distributed slices
semantic-search/ (git submodule)
├── SemanticSearch.tsx (unchanged)
├── searchSlice.ts (extracted from main store)
├── main.tsx (new standalone entry)
└── SemanticSearch.test.ts (unchanged)
```

**Component Interface Pattern:**
Each component defines TypeScript interfaces within the same .tsx file:
```typescript
interface SearchProps {
  vaultPath: string;
  maxResults: number;
}
interface SearchResult {
  nodeName: string;
  relevanceScore: number;
}
export type { SearchProps, SearchResult };
```

**State Communication Strategy:**
Centralized Zustand store accessible by all components:
```typescript
export const useInterBrainStore = create((set) => ({
  dreamNodes: [],
  searchResults: [],
  selectedNode: null,
  setSearchResults: (results) => set({ searchResults: results }),
  selectNode: (node) => set({ selectedNode: node })
}));
```

## Implementation Plan

1. **Vite Build System Setup** - Configure Vite for dual workflow (browser development + Obsidian plugin builds)
2. **Folder Structure Creation** - Establish vertical slice architecture with feature directories
3. **Zustand Store Implementation** - Create centralized state management accessible by all components
4. **Component Interface Patterns** - Implement TypeScript interface definitions within component files
5. **Testing Framework Integration** - Set up Jest with tests co-located in feature directories
6. **Command Palette Architecture** - Register all commands in main.ts with executeCommandById pattern

## User Experience

**Development Workflow:**
- **Browser Development**: `npm run dev` → Vite development server with instant hot reload for React 3 Fiber components
- **Obsidian Integration Testing**: `npm run plugin-build` → Plugin Reloader hotkey workflow unchanged
- **State Preservation**: 3D scene state maintained during component edits (transformative for spatial development)
- **Enhanced Debugging**: Browser DevTools for React component inspection and 3D scene debugging

**Cross-Component Communication:**
- **Centralized State**: Zustand store provides single source of truth for all component interactions
- **Interface Definitions**: TypeScript interfaces defined within component files, exported for type sharing
- **Asset Management**: Each feature manages its own resources (ML models, 3D assets, configurations)

## Feature Breakdown

**Current Features Identified:**
- **#276: Obsidian plugin boilerplate** - manifest.json, main.ts entry point, Vite configuration, basic plugin structure
- **#277: Modular DreamNode architecture** - vertical slice folder structure, TypeScript interfaces, component patterns

**Features to Consider Adding:**
- **Vite Build System Setup** - Replace esbuild configuration, dual development workflow, browser entry point
- **Zustand State Management** - Centralized store implementation, cross-component communication patterns
- **React Three Fiber Foundation** - 3D rendering setup, canvas integration, basic spatial components
- **Command Palette Infrastructure** - Command registration system, executeCommandById patterns
- **Testing Framework Setup** - Jest configuration, co-located test patterns, integration testing approach
- **Development Workflow Documentation** - Browser development patterns, Obsidian testing workflow

**Integration Considerations:**
- How do features communicate through the centralized store?
- Which components need access to Obsidian Vault API?
- What shared types/interfaces are needed across features?
- How do we handle asset loading (ML models, 3D resources) in each feature?

## Definition of Done

- [ ] Vite build system configured and working
- [ ] React Three Fiber integration tested
- [ ] Zustand store architecture implemented
- [ ] Vertical slice folder structure established
- [ ] Command palette integration functional
- [ ] Development workflow documented
- [ ] Testing framework configured
- [ ] Epic integration testing complete