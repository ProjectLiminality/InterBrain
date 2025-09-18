---
allowed-tools: Bash(git:*), Bash(gh:*), Read, TodoWrite
description: Start a new epic with branch creation, specification clarity, and development setup
---

# Epic Start Workflow

## Usage
Execute: `/epic-start` (automatically detects next epic or processes user context)
Optional: `/epic-start epic-6` or `/epic-start additional context or specific epic`

## Phase 1: Intelligent Epic Detection & Project State Analysis

### Epic Detection
- **Parse user input**: Extract epic number from user context (e.g., "epic-6", "6", "Epic 6")
- **Auto-detect next epic**: If no specific epic mentioned, find next open epic issue
- **Validate epic exists**: Ensure detected epic has corresponding GitHub issue

### Current State Check
- **Current branch**: Run `git branch --show-current`
- **Git status**: Run `git status --short`
- **Recent commits**: Run `git log --oneline -5`
- **Open epics**: Run `gh issue list --label epic --state open`

### Epic Issue Analysis
- **Epic details**: Run `gh issue view DETECTED_EPIC_NUMBER` (from user input or next available epic)
- **Find specification issue**: Run `gh issue list --label specification --search "epic DETECTED_EPIC_NUMBER" --state open`
- **Specification details**: Run `gh issue view SPEC_ISSUE_NUMBER`
- **Epic-Spec relationship validation**: Ensure 1:1 relationship exists and spec is ready for refinement

## Phase 2: Epic Branch Creation

### Branch Setup
- **Create epic branch**: Run `git checkout main && git pull origin main && git checkout -b epic/DETECTED_EPIC_NUMBER-epic-name`
- **Push epic branch**: Run `git push -u origin epic/DETECTED_EPIC_NUMBER-epic-name`

### GitHub Integration
- **Update epic issue**: Move to "Active" status on project board
- **Epic context**: @CLAUDE.md (lines 680-727) for GraphQL project board management

## Phase 3: Specification Clarity Interview

### Critical First Step
**⚠️ MANDATORY - NEVER SKIP SPECIFICATION CLARITY ⚠️**

Before any implementation work begins, conduct specification clarity interview:

### Interview Questions
Present epic and specification issue summary and ask potent questions:
- "Based on the current epic and spec issues, here's what I understand: [SUMMARY]. What specific technical approach have you been considering?"
- "What are the key architectural decisions we need to make for this epic?"
- "What user experience patterns should guide our implementation?"
- "What integration points with existing systems are most critical?"
- "What performance or scalability requirements should we consider?"
- "What are the biggest technical risks or unknowns for this epic?"

### Specification Refinement
1. **Clarification Discussion**: Short conversation to align understanding of rough roadmap
2. **Specification Issue Update**: Refine existing specification issue body with:
   - Detailed technical approach
   - Architecture decisions
   - User experience guidelines
   - Integration requirements
   - Risk mitigation strategies
   - Feature breakdown (prepare for feature issue creation)
3. **User Approval**: Get explicit approval before proceeding to implementation

## Phase 4: Development Environment Setup

### Epic Development Preparation
- **Feature issue creation**: Create first 2-3 feature issues with proper parent spec references
- **Feature prioritization**: Establish logical implementation order based on dependencies
- **TodoWrite setup**: Create epic-level task breakdown for feature sequence
- **Development context**: @CLAUDE.md (lines 355-410) for architecture guidelines

### Quality Standards Review
Reference project memory for:
- **Development Rules**: @CLAUDE.md (lines 382-395)
- **Service Layer Patterns**: @CLAUDE.md (lines 396-409)
- **Testing Standards**: @CLAUDE.md (lines 853-868)

## Epic Development Ready Checklist

- [ ] Epic branch created and pushed
- [ ] Epic issue moved to "Active" status
- [ ] Specification clarity achieved through interview
- [ ] Specification issue body refined with detailed approach
- [ ] User approval obtained for epic direction
- [ ] Initial feature issues created with parent spec references
- [ ] Feature prioritization and sequencing completed
- [ ] TodoWrite epic breakdown created
- [ ] Development environment confirmed ready

## Next Steps

After epic start completion:
1. **Use `/feature-start`** to begin implementing first feature
2. **Follow specification-driven development**: Only implement features that align with clarified epic vision
3. **Maintain epic branch hygiene**: Regular commits, feature integration, documentation updates

## Reference Materials

- **Epic Development Cycle**: @CLAUDE.md (lines 460-483)
- **GitHub CLI Commands**: @CLAUDE.md (lines 610-767)
- **Issue Creation Templates**: @CLAUDE.md (lines 652-676)
- **Quality Standards**: @CLAUDE.md (lines 484-496)

This command ensures systematic epic initiation following the **DEEP PATTERN - ALWAYS FOLLOW** from project memory.