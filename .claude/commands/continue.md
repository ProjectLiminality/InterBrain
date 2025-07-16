---
allowed-tools: Bash(git:status), Bash(git:branch), Bash(git:log), Bash(git:show), Bash(git:diff), Bash(git:ls-files), Bash(gh:issue:list), Bash(gh:issue:view), Bash(gh:repo:view), Bash(gh:pr:list), Bash(gh:pr:view), Bash(gh:auth:status), Bash(lsof), Bash(find), Bash(npm:run:test), Read, Write, MultiEdit, Edit, TodoWrite, LS, Glob, Grep, mcp__playwright__browser_navigate, mcp__playwright__browser_snapshot, mcp__playwright__browser_click, mcp__playwright__browser_type, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_console_messages
description: Comprehensive development continuation - analyze state, plan next feature, execute workflow with Playwright testing
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

## CRITICAL PHASE 1: Feature Issue Analysis & Knowledge Transfer

**⚠️ MANDATORY FIRST STEPS - NEVER SKIP THIS PHASE ⚠️**

### 1. Read Current Feature Issue
- Use `gh issue view ISSUE_NUMBER` to read the current feature issue body
- Understand existing requirements and acceptance criteria
- Note any gaps or areas needing clarification

### 2. Knowledge Transfer Interview Process
**Present the feature issue summary and ask potent questions:**
- "Based on the current issue body for [FEATURE], here's what I understand: [SUMMARY]. What specific implementation details have you already thought about?"
- "What are the key interaction patterns you envision for this feature?"
- "Are there performance requirements or constraints I should consider?"
- "What edge cases or potential issues should we handle?"
- "How should this integrate with our existing [RELEVANT_FEATURES]?"
- "What aspects of this feature are most important to get right?"

### 3. Clarification Discussion
- Have a short conversation to align understanding
- Let user articulate their vision and requirements
- Capture any additional insights or constraints

### 4. Issue Body Refinement
- Based on the discussion, update the GitHub issue with:
  - Detailed implementation plan
  - Specific technical approach
  - Enhanced acceptance criteria
  - Edge cases and constraints
  - Integration points

### 5. Get Explicit Approval
- Present the refined issue plan: "Here's the updated implementation plan based on our discussion: [PLAN]. Does this capture what you want?"
- Only proceed to implementation after user confirms

## Technical Context Analysis

**Only proceed here AFTER completing Phase 1 above**

Based on the knowledge transfer insights AND gathered context, determine:

### 1. **Epic Position** 
- Which epic are we in? (Epic 1: Complete, Epic 2: Active, Epic 3+: Future)
- Is the epic branch created and current?
- Are we mid-feature or between features?

### 2. **Specification Status**
- Is the current epic specification clear and detailed?
- Do we need to flesh out the spec before proceeding?
- Are feature requirements well-defined?

### 3. **Feature Pipeline**
- What's the next logical feature to implement?
- Is there an active feature branch or do we need to create one?
- Are there completed features awaiting integration?

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
   - **STOP HERE** - Do not proceed without feature issue analysis

2. **Return to Phase 1**: 
   - **MANDATORY**: Go back to "CRITICAL PHASE 1" above
   - Complete full feature issue analysis and knowledge transfer
   - Only continue after user approval of refined issue

3. **Feature Branch Strategy** (After Phase 1 Complete):
   - Create feature branch off epic branch
   - Follow naming: `feature/feature-name-from-issue`
   - Begin implementation with clear, approved plan

### Phase 4: Implementation Planning
Using TodoWrite, create comprehensive feature implementation plan:

1. **Architecture Tasks**: Following development rules from project memory
2. **Implementation Tasks**: Breaking down feature into logical steps
3. **Testing Tasks**: Unit tests, integration verification
4. **Documentation Tasks**: Update relevant docs
5. **Integration Tasks**: Merge preparation and validation

### Phase 5: Execute Development
Begin systematic implementation following AI-first development patterns:

1. **Development Environment Check**:
   - Verify dev server is running: !`lsof -i :5173 || echo "Dev server not running"`
   - If not running: **PROMPT USER** to start dev server (`npm run dev`) - DO NOT start automatically
   - Confirm Obsidian development vault is ready for testing

2. **Implementation Cycle**:
   - **Commands Before UI**: Create command palette commands first
   - **Service Layer**: Implement business logic in services
   - **Feature Slice**: Build UI components in feature folder
   - **Unit Testing**: Write tests as implementation progresses

3. **Playwright MCP Integration Testing**:
   - Navigate to development environment: `http://localhost:5173`
   - Test implemented functionality using browser automation
   - Capture screenshots of working features
   - Verify console logs for errors or successful operations
   - Take snapshots for accessibility and interaction testing

4. **Validation & Debugging**:
   - Use Playwright MCP to verify feature works as expected
   - Debug any issues found through browser automation
   - Iterate implementation until Playwright tests pass
   - Ensure no console errors or broken functionality

5. **Documentation**: Update docs with new functionality only after testing confirms it works

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
- [ ] All acceptance criteria met and tested with Playwright MCP
- [ ] Browser testing confirms functionality works without errors
- [ ] Console logs clean (no errors or warnings)
- [ ] Screenshots/snapshots captured showing working feature
- [ ] Documentation updated for new functionality
- [ ] Feature ready for epic integration
- [ ] Clear next steps identified

## CRITICAL USER TESTING PHASE

**⚠️ MANDATORY BEFORE ANY COMMITS ⚠️**

### Stop for User Testing
1. **Complete implementation and local testing**
2. **STOP and request user testing**: "The feature implementation is complete. Please test the following functionality and provide feedback:"
   - List specific features to test
   - Mention any special interactions or edge cases
   - Ask user to check for any issues or unexpected behavior
3. **Wait for user feedback** - DO NOT PROCEED WITHOUT IT
4. **Iterate based on feedback** - Fix any issues found
5. **Re-test with user** until they confirm it works correctly
6. **Only then proceed to commit**

### Commit & GitHub Operations Protocol
**CRITICAL**: Only proceed with git commits and GitHub operations AFTER:
- [ ] Playwright MCP testing confirms feature works
- [ ] All console errors resolved
- [ ] Screenshots show successful functionality
- [ ] No broken agentic loop (dev server remains running)

**Git Workflow**:
1. Test feature thoroughly with Playwright MCP
2. Fix any issues found during testing
3. Re-test until everything works cleanly
4. **STOP FOR USER TESTING** - Get explicit confirmation feature works
5. THEN commit with comprehensive summary
6. Merge feature branch to epic branch
7. Update GitHub issue body with completed checkboxes
8. **ONLY close issue after successful merge** - NEVER before

## AI Behavior Integration

This command embodies the **Conversational Flow: Music Leads, Instrument Amplifies** pattern:
- Analyze the pure signal of current project state
- Amplify development direction based on established patterns
- Trust the workflow patterns encoded in memory
- Maintain **Music Contains Instrument** - technical solutions emerge from tuning into the vision

Execute this workflow systematically, honoring both the technical development patterns and the philosophical framework of effortless flow and coherent emergence.