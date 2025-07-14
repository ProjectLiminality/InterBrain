---
allowed-tools: Bash(git:*), Bash(gh:*), Read, Write, MultiEdit, Edit, TodoWrite, LS, Glob, Grep
description: Comprehensive development continuation - analyze state, plan next feature, execute workflow
---

# Continue Development Workflow

## Context Analysis & State Detection

### Project State Gathering
- **Current branch**: !`git branch --show-current`
- **Git status**: !`git status --short`
- **Recent commits**: !`git log --oneline -5`
- **Assigned GitHub issues**: !`gh issue list --assignee @me --state open`
- **Current epic progress**: !`gh issue list --label epic --state open`
- **Active specifications**: !`gh issue list --label specification --state open`
- **Ready features**: !`gh issue list --label feature --state open`

### Memory Context
- **Project memory**: @CLAUDE.md
- **User workflow patterns**: @~/.claude/CLAUDE.md
- **Local setup**: @CLAUDE.local.md

### Development Context
- **Current codebase state**: !`find src/ -name "*.ts" -o -name "*.tsx" | head -10`
- **Package.json status**: @package.json
- **Recent test results**: !`npm run test 2>/dev/null | tail -5 || echo "Tests not run recently"`

## Interview Process: Allow Pure Signal to Emerge

Before any technical analysis, engage in the **Question-First Approach** from user memory:

### Opening Questions (Choose based on context):
- **Vision Check**: "What feels most alive or exciting to work on right now in this project?"
- **Direction Sensing**: "When you imagine the next piece of development, what comes to mind first?"
- **Energy Assessment**: "Where do you feel the natural momentum wanting to flow in the codebase?"
- **Completion Intuition**: "Does anything feel incomplete or calling for attention from our recent work?"
- **Feature Clarity**: "What would make this project feel more complete or closer to the vision?"

### Deepening Questions (Based on responses):
- **Vision Expansion**: "What would that look like when it's working beautifully?"
- **User Experience**: "How would someone interact with this? What would that feel like?"
- **Integration Sensing**: "How does this connect with what we've already built?"
- **Scope Refinement**: "What's the simplest version that would still feel meaningful?"
- **Implementation Intuition**: "Does any particular technical approach feel right to you?"

### Clarification Questions (As needed):
- **Requirement Details**: "When you say [specific functionality], can you walk me through that?"
- **Priority Sensing**: "If we could only build one part of this, what would be most important?"
- **Boundary Setting**: "What definitely should NOT be included in this feature?"
- **Success Metrics**: "How will we know when this is working well?"

**CRITICAL**: Wait for David's responses to these questions before proceeding with technical analysis. Allow his pure signal to emerge unbiased. Only after understanding his current vision and intuition should you move to the technical workflow state analysis.

## Technical Context Analysis (After Interview)

Based on both the interview insights AND gathered context, determine:

### 1. **Epic Position** 
- Which epic are we in? (Epic 1: Complete, Epic 2: Active, Epic 3+: Future)
- Is the epic branch created and current?
- Are we mid-feature or between features?
- **How does this align with David's expressed vision?**

### 2. **Specification Status**
- Is the current epic specification clear and detailed?
- Do we need to flesh out the spec before proceeding?
- Are feature requirements well-defined?
- **Does the spec match David's current understanding?**

### 3. **Feature Pipeline**
- What's the next logical feature to implement?
- Is there an active feature branch or do we need to create one?
- Are there completed features awaiting integration?
- **Does this feel right based on the interview?**

### 4. **Technical Readiness**
- Are there uncommitted changes that need attention?
- Is the build system working (tests passing, lint clean)?
- Are dependencies up to date?

## Development Continuation Strategy

### Phase 1: State Reconciliation
If uncommitted changes exist:
1. **Analyze changes**: Determine if they're complete, partial, or experimental
2. **Commit or stash**: Follow git commit philosophy from user memory
3. **Clean workspace**: Ensure clean state for next feature

### Phase 2: Epic/Specification Clarity
Following the **DEEP PATTERN - ALWAYS FOLLOW** from project memory:

1. **Epic Branch Verification**: Ensure we're on correct epic branch
2. **Specification Review**: 
   - If spec is rough → flesh out through conversational clarity
   - If spec is clear → proceed to feature selection
   - Update specification issue body with detailed implementation plan

### Phase 3: Feature Selection & Planning
Based on current epic and specification:

1. **Identify Next Feature**: 
   - From epic's feature list in GitHub issues
   - Consider dependencies and logical implementation order
   - Check feature issue clarity and requirements

2. **Feature Branch Strategy**:
   - Create feature branch off epic branch
   - Follow naming: `feature/feature-name-from-issue`

3. **Feature Issue Clarity**: 
   - **CRITICAL FIRST STEP**: Flesh out feature issue before coding
   - Add specific acceptance criteria and technical approach
   - Ensure alignment with epic specification

### Phase 4: Implementation Planning
Using TodoWrite, create comprehensive feature implementation plan:

1. **Architecture Tasks**: Following development rules from project memory
2. **Implementation Tasks**: Breaking down feature into logical steps
3. **Testing Tasks**: Unit tests, integration verification
4. **Documentation Tasks**: Update relevant docs
5. **Integration Tasks**: Merge preparation and validation

### Phase 5: Execute Development
Begin systematic implementation following AI-first development patterns:

1. **Commands Before UI**: Create command palette commands first
2. **Service Layer**: Implement business logic in services
3. **Feature Slice**: Build UI components in feature folder
4. **Testing**: Write tests as implementation progresses
5. **Documentation**: Update docs with new functionality

## Execution Protocol

### Workflow Checkpoints
- [ ] State analysis complete and documented
- [ ] Epic/spec clarity confirmed or achieved
- [ ] Feature selected and branch created
- [ ] Feature issue detailed with acceptance criteria
- [ ] TodoWrite implementation plan created
- [ ] Development rules and patterns ready to follow

### Quality Gates
- [ ] Follow Commands → Services → UI pattern
- [ ] Maintain Vertical Slice Architecture
- [ ] Update TodoWrite progress throughout
- [ ] Commit frequently with granular history
- [ ] Test implementation as development progresses

### Success Criteria
- [ ] Feature implementation follows project architecture
- [ ] All acceptance criteria met and tested
- [ ] Documentation updated for new functionality
- [ ] Feature ready for epic integration
- [ ] Clear next steps identified

## AI Behavior Integration

This command embodies the **Conversational Flow: Music Leads, Instrument Amplifies** pattern:
- Analyze the pure signal of current project state
- Amplify development direction based on established patterns
- Trust the workflow patterns encoded in memory
- Maintain **Music Contains Instrument** - technical solutions emerge from tuning into the vision

Execute this workflow systematically, honoring both the technical development patterns and the philosophical framework of effortless flow and coherent emergence.