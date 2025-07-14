---
allowed-tools: Read, Write, MultiEdit, Edit, TodoWrite, Bash(git:*)
description: Execute comprehensive memory and documentation coherence workflow
---

# Memory & Documentation Coherence Workflow

## Context
You are helping to maintain coherence across memory files and documentation in the InterBrain project following the DreamNode pattern: **Dreamer** (user memory), **Dream** (project memory), and **Private** (local memory).

### Current Project State
- **Current branch**: !`git branch --show-current`
- **Recent commits**: !`git log --oneline -5`
- **Project memory**: @CLAUDE.md
- **User memory**: @~/.claude/CLAUDE.md
- **Local memory**: @CLAUDE.local.md

## Target Outcome
Clean, coherent memory architecture with:
- **User CLAUDE.md**: Personal/universal patterns, ~200 lines
- **Project CLAUDE.md**: Essential AI guidance + doc references, ~400-500 lines  
- **Local CLAUDE.md**: Machine-specific setup only
- **docs/**: Detailed technical content for human + AI reference

## Workflow Steps

### Phase 1: Memory Analysis & Planning
1. **Identify Issues**: 
   - Read all three memory files
   - Note duplications, inconsistencies, and boundary violations
   - Check for outdated content and conflicting sections

2. **Create Plan**: 
   - Use TodoWrite to create detailed task breakdown
   - Prioritize boundary clarity (what belongs where)
   - Plan content extractions to documentation

### Phase 2: User Memory Cleanup
- **Remove duplicates**: Cross-project duplications
- **Add universal patterns**: Git commit philosophy, memory management
- **Ensure boundaries**: Only personal/universal content

### Phase 3: Project Memory Reorganization
- **Consolidate status**: Single "Current Development Status" section
- **Extract technical content**: Move algorithms, code patterns to docs/
- **Create doc references**: Point to detailed docs instead of including content
- **Optimize for AI**: Clear structure for Claude navigation

### Phase 4: Documentation Creation/Update
- **docs/technical-patterns.md**: Algorithms, spatial layouts, code examples
- **docs/ux-specifications.md**: Interaction flows, search functionality
- **docs/architecture-details.md**: DreamNode lifecycle, git operations
- **Update existing docs**: Fix inconsistencies, project name errors

### Phase 5: Cross-Reference Coherence
- **Verify references**: Ensure CLAUDE.md references point to correct docs
- **Remove redundancy**: Clean up remaining overlaps
- **Check README.md**: Update for consistency with memory
- **Validate structure**: AI readability and navigation

### Phase 6: Git Commit
- **Stage changes**: `git add .`
- **Comprehensive commit**: Include summary of what was moved where
- **Follow commit philosophy**: Granular history with meaningful message

## Expected Results
- **Token Efficiency**: Memory files optimized for AI context
- **Clean Boundaries**: DreamNode pattern (Dreamer/Dream/Private) respected
- **Hybrid Architecture**: Memory + docs working together
- **Future-Proof**: Scalable structure for continued development

## Quality Indicators
✅ No duplicate content across memory files  
✅ Project CLAUDE.md under 500 lines with clear structure  
✅ All technical details properly referenced in docs/  
✅ README.md consistent with project memory  
✅ Git commit captures what was moved and why  

Execute this workflow systematically, using TodoWrite to track progress and ensuring each phase completes before moving to the next.