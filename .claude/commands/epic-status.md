---
allowed-tools: Bash(git:*), Bash(gh:*)
description: Get comprehensive status of current epic development
---

# Epic Development Status Check

## Context
Check the current status of epic development including git branches, GitHub issues, and progress tracking.

### Git Status
- **Current branch**: !`git branch --show-current`
- **Branch ahead/behind**: !`git status -b --porcelain`
- **Recent commits**: !`git log --oneline -5`
- **Uncommitted changes**: !`git status --short`

### GitHub Issue Status
- **Assigned issues**: !`gh issue list --assignee @me --state open`
- **Current epic issues**: !`gh issue list --label epic --state open`
- **Current spec issues**: !`gh issue list --label specification --state open`
- **Active features**: !`gh issue list --label feature --state open`

### Project Memory Context
- **Current development status**: @CLAUDE.md (lines 15-50)

## Analysis Questions

### Epic Progress
1. **Which epic are we currently working on?**
2. **What features are complete vs in progress?**
3. **Are there any blocked or stalled issues?**
4. **Is the specification clear for current work?**

### Branch Hygiene
1. **Are we on the correct epic branch?**
2. **Do we need to merge completed features?**
3. **Are there uncommitted changes that should be saved?**
4. **Is the branch up to date with main?**

### Next Actions
Based on status, recommend:
- **Continue current feature**: If actively working on something
- **Start new feature**: If current work is complete
- **Merge and integrate**: If features are ready for epic integration
- **Plan next epic**: If current epic is complete

## Epic Development Workflow Reminder
1. **Epic Branch**: Create/switch to epic branch
2. **Specification**: Ensure spec issue is clear before coding
3. **Feature Branches**: Create feature branches off epic branch
4. **Feature Clarity**: Flesh out feature issues before implementation
5. **Integration**: Merge features to epic branch when complete
6. **Epic Completion**: Test, document, merge to main

Use this status to determine the most productive next step in the development workflow.