---
allowed-tools: Bash(git:*), Read, Write, Edit, Glob, Grep, TodoWrite, AskUserQuestion
description: Refactor a feature slice with conceptual review and architectural alignment
---

# Feature Slice Refactoring: $ARGUMENTS

You are refactoring the feature slice `$ARGUMENTS` through a collaborative process that ensures conceptual clarity before structural changes.

## Process Overview

This refactoring follows a **Music-First** approach:
1. **Understand** - Read and analyze the current state
2. **Present Understanding** - Share your interpretation of the feature's purpose
3. **Clarify with User** - Get conceptual corrections and insights
4. **Review Chunking** - Identify opportunities for better organization
5. **Implement** - Make structural changes
6. **Clean Up** - Remove obsolete logging, enforce UI→Commands pattern
7. **Implementation Review** - Identify low-risk, high-reward code improvements
8. **Test Coverage** - Ensure meaningful tests for pure utilities
9. **Document** - Update README
10. **Validate** - Ensure everything works

---

## Core Architectural Principles

### 1. UI → Commands → Services Pattern
**All UI interactions must go through Obsidian commands.**

```
User clicks button → executeCommandById('interbrain:do-thing')
                              ↓
                     Command handler calls service
                              ↓
                     Service performs operation
```

- UI components should NEVER call services directly
- Every meaningful user action should have a corresponding command
- Commands provide: keyboard shortcuts, command palette access, consistent behavior

**Check for violations:**
- Search for `serviceManager.getActive()` in component files - should only be in commands/services
- Search for direct store mutations from onClick handlers

### 2. Console Logging Discipline
**Remove all non-essential console.log statements.**

❌ **Remove:**
- Per-node logging that scales with data (e.g., "Processing node X" for each node)
- Debug logging left over from development
- Redundant state logging on every render
- Success confirmations for routine operations

✅ **Keep:**
- Error logging (`console.error`)
- One-time initialization logging (startup, config loaded)
- User-initiated action confirmations (sparse)
- Warnings for edge cases

**Search patterns:**
```bash
grep -n "console.log" src/features/[feature-name]/
```

### 3. Hook Hygiene
**All React hooks must be called before any early returns.**

React's Rules of Hooks require hooks to be called in the same order every render.
When consolidating components, ensure `useCallback`, `useEffect`, `useState` etc.
are all placed before any conditional `return null` statements.

---

## Phase 1: Discovery

Read the feature to understand its current state:

1. Read README.md (if exists)
2. List all files in the feature directory
3. Read each file to understand what it does
4. Note the current structure and any existing patterns

---

## Phase 2: Present Your Understanding

⚠️ **STOP AND INTERACT** ⚠️

After reading the code, present to the user:

### Your Understanding
Write a brief summary:
- **Purpose**: What you believe this feature does (1-2 sentences)
- **Core Responsibility**: What problem does it solve?
- **Relationship to Other Features**: How does it fit in the ecosystem?

### Current File Analysis
For each file, describe:
- What it does
- Its role in the feature
- Any concerns or questions you have

Example:
```
**ProtoNode3D.tsx** (603 lines)
- Role: 3D component for node creation UI
- Does: Renders translucent preview, handles input, manages animations
- Question: Should the animation logic be separate from the input handling?
```

Then ask the user: **"Is my understanding correct? Please clarify the vision for this feature."**

---

## Phase 3: Conceptual Clarification

Wait for user input. They will clarify:
- The true purpose and vision for the feature
- Corrections to your understanding
- Important context you may have missed

---

## Phase 4: Chunking Review

⚠️ **STOP AND INTERACT** ⚠️

Based on your understanding and user clarification, analyze the chunking:

### Questions to Consider
- Are there components that do too many things?
- Are there components that should be merged?
- Is there logic that should be extracted to utilities?
- Is there state management that should be consolidated?
- Are the file names clear about what each file does?

### Present Opportunities
Share your analysis:
```
**Chunking Observations:**

1. **[File A] and [File B]**: These seem to [overlap/be tightly coupled/etc.]
   - Option A: Merge into single file because...
   - Option B: Keep separate because...
   - Recommendation: [your suggestion]

2. **[File C]**: This file does [multiple things]
   - Could extract [X] into a utility
   - Could extract [Y] into a separate component
   - Recommendation: [your suggestion]
```

Ask the user: **"Do you want to adjust how this feature is chunked before we proceed with structural changes?"**

---

## Phase 5: Structural Implementation

After conceptual alignment, apply architectural patterns:

### Reference Architecture
Use `src/features/dreamnode/` as the gold standard:

```
feature-name/
├── store/
│   └── slice.ts              # Zustand state (if feature has state)
├── types/
│   └── *.ts                  # TypeScript interfaces (if 2+ type files)
├── services/
│   └── *-service.ts          # Orchestrators with state/side-effects
├── utils/
│   └── *.ts                  # Stateless pure functions
├── components/
│   └── *.tsx                 # React/R3F components
├── styles/
│   └── *.ts, *.css           # Style constants and CSS
├── commands.ts               # Obsidian command palette (if applicable)
├── index.ts                  # Barrel export
└── README.md                 # Feature documentation
```

### Structural Checklist
- [ ] Move slice file to `store/slice.ts` if needed
- [ ] Apply any chunking changes agreed with user
- [ ] Fix import paths after moves
- [ ] Update barrel export in `index.ts`
- [ ] Update external imports (grep for old paths)

### Subdirectory Rules

| Category | Create when... |
|----------|----------------|
| `store/` | Feature has Zustand state |
| `services/` | 2+ service files OR 1 complex service |
| `utils/` | 2+ utility files |
| `components/` | 2+ React components |
| `types/` | 2+ type definition files |

---

## Phase 6: Clean Up

### 6a. Enforce UI → Commands Pattern

Check that UI components don't call services directly:

```bash
# Find potential violations in component files
grep -n "serviceManager" src/features/[feature-name]/*.tsx
grep -n "dreamNodeService" src/features/[feature-name]/*.tsx
```

**If violations found:**
1. Ensure corresponding command exists in `commands.ts`
2. Replace direct service call with `app.commands.executeCommandById()`
3. Or if the operation is internal (not user-triggered), move to a service

### 6b. Remove Excessive Console Logging

```bash
# Find all console.log statements
grep -n "console.log" src/features/[feature-name]/
```

**For each log statement, ask:**
1. Does this scale with data? (per-node, per-render) → REMOVE
2. Is this debug leftover? → REMOVE
3. Is this a one-time init or error? → KEEP

### 6c. Verify Hook Order

For components with early returns (`if (!x) return null`):
- Ensure ALL hooks (useState, useEffect, useCallback, useRef, useMemo) are BEFORE the return
- Add comment `// must be before early return - rules of hooks` for clarity

---

## Phase 7: Implementation Review

⚠️ **STOP AND INTERACT** ⚠️

Review the actual implementation for **low-risk, high-reward** improvements. This is NOT about changing architecture - it's about polishing the code within its current structure.

### What to Look For

**✅ Low-Risk Improvements (propose these):**

| Category | Examples |
|----------|----------|
| **Duplicated logic** | Same validation in multiple places → extract to shared function |
| **Missing error handling** | Unhandled promise rejections, missing try/catch for I/O |
| **Type safety gaps** | `any` types that could be specific, missing null checks |
| **Dead code** | Unused imports, unreachable branches, commented-out code |
| **Simplifications** | Overly complex conditionals, nested ternaries, verbose patterns |
| **Consistency** | Mixed naming conventions, inconsistent error message formats |
| **Performance quick wins** | Obvious re-computations, missing early returns |

**❌ Out of Scope (do NOT propose):**

- Architectural changes (different state management, new abstractions)
- Behavior changes (unless fixing obvious bugs)
- Speculative optimizations without evidence of problems
- Stylistic preferences that don't improve clarity
- Changes that would require extensive testing

### Risk Assessment Framework

For each potential improvement, assess:

```
[IMPROVEMENT]: Brief description
[RISK]: Low / Medium / High
[REWARD]: Code clarity / Error handling / Type safety / Performance / Maintainability
[SCOPE]: Number of files/lines affected
[RECOMMENDATION]: Implement / Skip / Ask user
```

**Only propose improvements where Risk=Low and Reward is clear.**

### Present Findings

Share your analysis:

```markdown
### Implementation Review Findings

**1. [Category]: [Brief description]**
- Current: [what exists now]
- Proposed: [what it would become]
- Risk: Low | Reward: [benefit]
- Files: [affected files]

**2. [Category]: [Brief description]**
...

**Skip List** (noted but not recommending):
- [Item]: [reason for skipping - too risky, uncertain benefit, etc.]
```

Then ask: **"Would you like me to implement any of these improvements?"**

### Implementation Guidelines

When implementing approved improvements:
1. Make one logical change at a time
2. Run tests after each change
3. Keep changes minimal and focused
4. Preserve existing behavior exactly (unless fixing bugs)

---

## Phase 8: Test Coverage

Ensure meaningful test coverage for **pure utility functions**. Tests should verify behavior, not implementation.

### What to Test

**Test these (pure functions, easily testable):**
- Utility functions in `utils/` directories
- Pure data transformation functions
- Validation/parsing logic
- Type guards
- String formatting/sanitization

**Skip these (complex dependencies, integration territory):**
- React components (require render testing setup)
- Functions that depend on Obsidian API
- Functions that make network requests (unless mocked)
- Service layer orchestration (better as integration tests)

### Test Quality Guidelines

1. **Test behavior, not implementation**
   - Test what the function returns/does, not how it does it
   - Focus on edge cases and error conditions

2. **Use meaningful test names**
   ```typescript
   // ✅ Good
   it('should return null when URL is invalid')

   // ❌ Bad
   it('test case 1')
   ```

3. **Cover edge cases**
   - Empty inputs
   - Invalid inputs
   - Boundary conditions
   - Error states

4. **Mock external dependencies**
   - Use `vi.mock()` for modules
   - Use `vi.stubGlobal()` for globals like `fetch`
   - Use `vi.useFakeTimers()` for date/time dependent code

### Test File Location

Place test files adjacent to the code they test:
```
feature/
├── utils/
│   ├── parser.ts
│   └── parser.test.ts    # Adjacent to source
├── services/
│   └── my-service.ts     # Skip testing - service layer
└── components/
    └── MyComponent.tsx   # Skip testing - React components
```

### Minimum Coverage Checklist

For each utility file, ensure tests cover:
- [ ] Happy path (expected inputs)
- [ ] Edge cases (empty, null, undefined)
- [ ] Error conditions (invalid inputs)
- [ ] Boundary conditions (min/max values)

---

## Phase 9: Documentation

Write/update README.md with:

```markdown
# Feature Name

**Purpose**: One-line description of what this feature does.

**Parent feature**: [link if derivative]

## Directory Structure

```
feature-name/
├── [actual structure]
```

## Main Exports

```typescript
// [categorized exports with comments]
```

## [Feature-specific sections]
- Workflow (for UI features)
- Architecture (for complex features)
- Dependencies
- Notes
```

---

## Phase 10: Validation & Commit

1. Run `npm run check-all` - must pass with 0 errors
2. Review changes with user if significant restructuring occurred
3. Commit with descriptive message:

```
Refactor [feature-name] feature slice

- [Conceptual changes if any]
- [Structural changes]
- [Clean up: logging, UI→Commands pattern]
- [Test coverage for utilities]
- [Documentation updates]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

---

## Quick Reference

### Naming Conventions

| File Type | Pattern | Example |
|-----------|---------|---------|
| Store slice | `store/slice.ts` | `store/slice.ts` |
| Service | `*-service.ts` | `git-dreamnode-service.ts` |
| Utility | `*-utils.ts` or descriptive | `vault-scanner.ts` |
| Component | `PascalCase.tsx` | `DreamNode3D.tsx` |

### Service vs Utility

**Services**: Stateful orchestrators with side effects
**Utilities**: Pure functions, stateless, easily testable

### UI → Commands Quick Check

```typescript
// ❌ BAD: Component calls service directly
const handleSave = async () => {
  await serviceManager.getActive().update(node.id, changes);
};

// ✅ GOOD: Component executes command
const handleSave = () => {
  app.commands.executeCommandById('interbrain:save-edit-mode-changes');
};
```

---

## Begin

Now read the feature `$ARGUMENTS` and proceed through Phase 1 (Discovery).
