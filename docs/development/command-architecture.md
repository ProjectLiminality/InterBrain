# Command Architecture

The InterBrain plugin uses Obsidian's command palette as the primary abstraction layer between UI interactions and backend operations. All functionality is accessible via keyboard shortcuts (Cmd/Ctrl+P) and can be triggered programmatically.

## Available Commands

All commands are prefixed with `InterBrain:` in the command palette:

- **Open DreamSpace** - Opens the 3D spatial visualization view
- **Save DreamNode (commit changes)** - Commits current changes with AI assistance
- **Create new DreamNode** - Creates a new Dream or Dreamer node
- **Weave Dreams into higher-order node** - Combines selected nodes via git submodules
- **Toggle DreamNode selection** - Select/deselect nodes for bulk operations
- **Share DreamNode via Coherence Beacon** - Share nodes through the social resonance network

## Service Layer Architecture

The plugin implements a clean separation of concerns through dedicated services:

- **UIService** - User notifications and feedback (success, error, loading states)
- **GitService** - Git operations abstraction (commit, create, weave)
- **DreamNodeService** - DreamNode state management and selection
- **VaultService** - Obsidian Vault API wrapper for file operations

## Programmatic Access

UI components can trigger commands programmatically:

```typescript
this.app.commands.executeCommandById('interbrain:save-dreamnode');
```

This architecture ensures all functionality remains accessible to both power users (via command palette) and regular users (via UI buttons), while maintaining a clean separation between presentation and business logic.

## State Management with Zustand

The plugin uses Zustand for centralized, reactive state management that integrates seamlessly with the command-driven architecture.

### Store Structure

```typescript
interface InterBrainState {
  selectedNode: DreamNode | null;        // Currently selected node
  searchResults: DreamNode[];            // Search/filter results
  spatialLayout: 'constellation' | 'search' | 'focused'; // 3D layout mode
}
```

### Integration Pattern

**Commands → Services → Zustand State → UI Reactivity**

```typescript
// 1. Command executes
this.addCommand({
  id: 'save-dreamnode',
  callback: async () => {
    const currentNode = this.dreamNodeService.getCurrentNode(); // 2. Service provides state
    // ... business logic
  }
});

// 3. Service updates both internal and reactive state
setCurrentNode(node: DreamNode | null): void {
  this.currentNode = node; // Internal state
  useInterBrainStore.getState().setSelectedNode(node); // Reactive state
}

// 4. Future UI components read reactively
const selectedNode = useInterBrainStore(state => state.selectedNode);
```

### Testing Commands

The plugin includes test commands to verify state synchronization:
- `[TEST] Select Mock DreamNode` - Creates a test node and updates state
- `[TEST] Clear DreamNode Selection` - Clears selection and updates state

These demonstrate the complete flow from command execution to state updates that future UI components can react to.

## Testing Framework

The plugin uses Vitest for comprehensive testing with co-located test patterns following our vertical slice architecture.

### Test Organization

Tests are co-located with the code they test:
```
src/
├── services/
│   ├── dreamnode-service.ts
│   ├── dreamnode-service.test.ts    # Co-located tests
│   └── ui-service.test.ts
├── store/
│   ├── interbrain-store.ts
│   └── interbrain-store.test.ts
└── features/                        # Future vertical slices
    └── dream-weaving/
        ├── DreamWeaving.tsx
        └── DreamWeaving.test.tsx
```

### Test Categories

**Unit Tests**: Service methods, store actions, pure functions
**Integration Tests**: Command → Service → State flow
**Component Tests**: React components with user interactions (future)

### Running Tests

```bash
npm run test          # Run all tests
npm run test:watch    # Watch mode for development
npm run test:coverage # Generate coverage reports
npm run check-all     # Lint + typecheck + test
```

### Test Utilities

**Mock Factories**:
```typescript
const mockNode = createMockDreamNode({ name: 'Custom Name' })
const mockService = createMockUIService()
```

**Store Testing**:
```typescript
// Store tests verify reactive state management
expect(useInterBrainStore.getState().selectedNode).toBe(mockNode)
```

**Obsidian Mocking**: All Obsidian APIs are mocked for isolated testing without dependencies on the Obsidian environment.
