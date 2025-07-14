---
allowed-tools: Read, Grep, LS
description: Quick audit of memory file coherence and boundaries
---

# Memory Coherence Audit

## Context
Perform a quick assessment of memory file coherence across the DreamNode memory pattern.

### Memory Files Analysis
- **User Memory**: @~/.claude/CLAUDE.md
- **Project Memory**: @CLAUDE.md  
- **Local Memory**: @CLAUDE.local.md

## Audit Checklist

### Boundary Violations
- [ ] Check for project-specific content in user memory
- [ ] Check for personal patterns in project memory  
- [ ] Check for non-local content in local memory

### Content Duplications
- [ ] Git commit philosophy mentioned in multiple files
- [ ] Memory management instructions repeated
- [ ] Development workflow duplicated
- [ ] Documentation patterns overlapping

### Outdated Information
- [ ] Repository migration content (already completed)
- [ ] Incorrect status information
- [ ] Wrong command counts or feature lists
- [ ] Conflicting roadmap information

### Structure Issues  
- [ ] Multiple "Current Status" sections
- [ ] Technical patterns in memory vs docs
- [ ] Missing cross-references to documentation
- [ ] Inconsistent terminology or naming

## Quick Fixes Needed
Based on audit findings, identify:
1. **Immediate boundary fixes**: What content needs to move between files
2. **Documentation extractions**: Technical content that should live in docs/
3. **Reference updates**: Links that need to point to correct locations
4. **Consistency improvements**: Naming, status, and terminology alignment

## Recommendation
If significant issues are found, run `/memory-coherence` for comprehensive cleanup.
If minor issues, proceed with targeted fixes using specific file edits.