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
6. **Document** - Update README
7. **Validate** - Ensure everything works

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

## Phase 6: Documentation

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

## Phase 7: Validation & Commit

1. Run `npm run check-all` - must pass with 0 errors
2. Review changes with user if significant restructuring occurred
3. Commit with descriptive message:

```
Refactor [feature-name] feature slice

- [Conceptual changes if any]
- [Structural changes]
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

---

## Begin

Now read the feature `$ARGUMENTS` and proceed through Phase 1 (Discovery).
