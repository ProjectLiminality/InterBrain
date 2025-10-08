---
allowed-tools: Bash(git:*), Bash(gh:*), Read, TodoWrite
description: Start feature development with issue analysis, knowledge transfer, and branch setup
---

# Feature Start Workflow

## Usage
Execute: `/feature-start` (automatically detects available features or processes user context)
Optional: `/feature-start #287` or `/feature-start feature about XYZ` or `/feature-start additional context`

## CRITICAL PHASE 1: Feature Issue Analysis & Knowledge Transfer

**⚠️ MANDATORY FIRST STEPS - NEVER SKIP THIS PHASE ⚠️**

### 1. Current Context Check
- **Current branch**: Run `git branch --show-current`
- **Verify epic branch**: Ensure we're on correct epic branch before feature work
- **Git status**: Run `git status --short`

### 2. Intelligent Feature Detection
- **Parse user input**: Extract feature number from user context (e.g., "#287", "287", "feature 287")
- **Auto-detect ready features**: If no specific feature mentioned, find open features in current epic
- **Feature details**: Run `gh issue view DETECTED_FEATURE_NUMBER` (using detected or selected feature)
- **Understand existing requirements**: Parse current issue body for:
  - Feature description and scope
  - Existing acceptance criteria
  - Dependencies and constraints
  - Any prior discussion or decisions

### 3. Knowledge Transfer Interview Process

**Present feature issue summary and ask potent questions:**

#### Core Understanding Questions
- "Based on the current issue body for $ARGUMENTS, here's what I understand: [SUMMARY]. What specific implementation details have you already thought about?"
- "What are the key interaction patterns you envision for this feature?"
- "How should this feature integrate with our existing [RELEVANT_SYSTEMS]?"

#### Technical Deep-Dive Questions
- "Are there performance requirements or constraints I should consider?"
- "What edge cases or potential issues should we handle?"
- "What aspects of this feature are most important to get right?"
- "Any specific technical approaches or patterns you'd prefer?"

#### User Experience Questions
- "What's the ideal user workflow for this feature?"
- "How should this feel to use - any UX inspiration or references?"
- "What should happen when things go wrong (error states)?"

### 4. Clarification Discussion
- **Short conversation** to align understanding
- **Let user articulate** their vision and requirements
- **Capture additional insights** or constraints not in original issue
- **Identify any missing context** or assumptions

### 5. Issue Body Refinement
Based on the discussion, update the GitHub issue with:

```markdown
## Enhanced Description
[Refined feature description based on discussion]

## Technical Approach
[Specific implementation strategy]

## Enhanced Acceptance Criteria
- [ ] [Original criteria plus refined details]
- [ ] [Additional criteria from discussion]
- [ ] [Edge cases and error handling]

## Integration Points
[How this connects to existing features]

## Implementation Notes
[Key decisions and constraints from discussion]
```

### 6. Get Explicit Approval
- **Present refined plan**: "Here's the updated implementation plan based on our discussion: [PLAN]. Does this capture what you want?"
- **Only proceed after user confirms** the direction is correct
- **STOP here if approval not obtained**

## Phase 2: Feature Branch Setup

**Only proceed here AFTER completing Phase 1 above**

**⚠️ CRITICAL: LOCAL-ONLY WORKFLOW ⚠️**
- **Feature branches are NEVER pushed to remote**
- **ONLY main branch gets pushed (during epic completion)**

### Branch Creation
- **Ensure on epic branch**: Run `git checkout epic/EPIC_NUMBER-epic-name`
- **Create feature branch**: Run `git checkout -b feature/FEATURE_NAME-from-issue`
- **NO PUSH**: Feature branch stays local, merges to epic branch when complete

### GitHub Integration
- **Update feature issue**: Run `gh issue edit DETECTED_FEATURE_NUMBER --body "REFINED_ISSUE_BODY"`
- **Move to Active**: Reference @CLAUDE.md (lines 680-727) for project board GraphQL

## Phase 3: Implementation Planning

### TodoWrite Task Breakdown
Create comprehensive task breakdown following project patterns:

#### 1. Setup Tasks
- [ ] Verify development environment ready
- [ ] Confirm feature branch created and current
- [ ] Review integration points with existing code

#### 2. Command Implementation (Commands Before UI)
- [ ] Define command interfaces
- [ ] Implement command handlers
- [ ] Register commands in main plugin
- [ ] Test command functionality

#### 3. Service Layer (Service Layer Abstraction)
- [ ] Create/extend service classes
- [ ] Implement business logic
- [ ] Add error handling and validation
- [ ] Write service unit tests

#### 4. UI Implementation (Feature Slice Architecture)
- [ ] Create feature slice components
- [ ] Integrate with command system
- [ ] Add to appropriate UI locations
- [ ] Implement user interactions

#### 5. Testing & Validation
- [ ] Write comprehensive unit tests
- [ ] Manual testing in Obsidian development vault
- [ ] Verify all acceptance criteria met
- [ ] **STOP FOR USER TESTING** - Get explicit feedback

### Development Environment Check
- **Plugin reloader ready**: Confirm Obsidian development workflow
- **Testing protocols**: @CLAUDE.md (lines 784-790)

## Implementation Readiness Checklist

- [ ] **Phase 1 Complete**: Feature issue analyzed and refined
- [ ] **Knowledge Transfer**: User interview conducted and insights captured
- [ ] **Issue Approval**: User confirmed refined implementation plan
- [ ] **Feature Branch**: Created off epic branch and pushed
- [ ] **GitHub Updated**: Issue body refined and project board updated
- [ ] **TodoWrite Ready**: Comprehensive task breakdown created
- [ ] **Environment Ready**: Development setup confirmed

## Next Steps

After feature start completion:
1. **Begin Implementation**: Follow TodoWrite task breakdown
2. **Follow Architecture Patterns**: @CLAUDE.md (lines 382-395)
3. **Maintain Quality**: Regular testing and validation
4. **Use `/feature-complete`** when implementation ready for user testing

## Reference Materials

- **Development Rules**: @CLAUDE.md (lines 382-395)
- **Critical Feature Workflow**: @CLAUDE.md (lines 523-575)
- **Service Layer Patterns**: @CLAUDE.md (lines 396-409)
- **GitHub CLI Commands**: @CLAUDE.md (lines 610-767)
- **Testing Standards**: @CLAUDE.md (lines 853-868)

## Workflow Anti-Patterns to Avoid

**❌ Never Do These:**
- Skip issue analysis and jump straight to implementation
- Assume requirements without knowledge transfer interview
- Create feature branch without refining issue body
- Start coding before user approves direction

**✅ Always Do These:**
- Conduct thorough knowledge transfer interview first
- Refine issue body with detailed implementation plan
- Get explicit user approval before any coding
- Create proper feature branch off epic branch

This command embodies the **CRITICAL FEATURE DEVELOPMENT WORKFLOW** from project memory.