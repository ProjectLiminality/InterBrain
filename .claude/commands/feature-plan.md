---
allowed-tools: Bash(gh:*), Read, TodoWrite, mcp__playwright__browser_navigate, mcp__playwright__browser_snapshot, mcp__playwright__browser_click, mcp__playwright__browser_type, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_console_messages
description: Create comprehensive plan for implementing a specific feature with Playwright testing validation
---

# Feature Implementation Planning

## Usage
Execute this command with a specific feature: `/feature-plan #ISSUE_NUMBER` or `/feature-plan FEATURE_NAME`

## Context Gathering
- **Target feature**: $ARGUMENTS
- **Feature details**: !`gh issue view $ARGUMENTS 2>/dev/null || echo "Feature: $ARGUMENTS"`
- **Current epic context**: @CLAUDE.md (lines 30-50)
- **Development rules**: @CLAUDE.md (lines 75-85)
- **Current branch**: !`git branch --show-current`

## Implementation Clarity Check

Quick assessment of feature requirements before technical planning:

### Clarification Questions (Only if needed):
- **Feature Scope**: "Is the scope of this feature clear from the issue, or should we clarify anything?"
- **User Interaction**: "Any specific user experience requirements I should know about?"
- **Technical Constraints**: "Any implementation preferences or technical approaches to consider?"
- **Integration Points**: "How should this integrate with existing functionality?"

**Note**: If the feature requirements are clear from the GitHub issue and context, proceed directly to technical planning.

## Planning Framework

### Phase 1: Feature Analysis
Based on feature requirements and technical context:

1. **Scope Definition**:
   - What exactly does this feature do for users?
   - How does it integrate with existing functionality?
   - What are the clear acceptance criteria?

2. **Architecture Mapping**:
   - Which services need to be created/modified?
   - What command palette commands are needed?
   - Where does the UI fit in the feature slice structure?
   - Any shared components required?

3. **Dependencies Assessment**:
   - Does this feature depend on other incomplete features?
   - Are there any technical prerequisites?
   - Do we need to update specifications first?

### Phase 2: Implementation Strategy
Following the **Commands Before UI** and **Service Layer Abstraction** rules:

1. **Command Design**:
   - What Obsidian commands will this feature expose?
   - How do users access this functionality?
   - What's the command naming convention?

2. **Service Architecture**:
   - Which existing services need extension?
   - Any new services required?
   - How does this integrate with git operations?

3. **UI Strategy**:
   - Feature slice location and structure
   - Integration with existing 3D space/components
   - State management requirements

### Phase 3: Development Breakdown
Create TodoWrite task list with specific, actionable items:

1. **Setup Tasks**:
   - Create feature branch
   - Update feature issue with detailed plan
   - Set up development environment

2. **Command Implementation**:
   - Define command interfaces
   - Implement command handlers
   - Register commands in main plugin

3. **Service Layer**:
   - Create/extend service classes
   - Implement business logic
   - Add error handling and validation

4. **UI Implementation**:
   - Create feature slice components
   - Integrate with command system
   - Add to appropriate UI locations

5. **Testing & Validation**:
   - Write unit tests for services
   - Test command functionality
   - **Playwright MCP Browser Testing**:
     - Verify dev server is running: !`lsof -i :5173 || echo "Dev server not running"`
     - If not running: **PROMPT USER** to start dev server - DO NOT start automatically
     - Navigate to `http://localhost:5173` for testing
     - Test feature interactions using browser automation
     - Capture screenshots of working functionality
     - Verify console logs are clean (no errors)
     - Take accessibility snapshots
   - Debug and fix any issues found through browser testing
   - Re-test until feature works perfectly in browser

6. **Documentation & Integration**:
   - Update feature issue with completion notes only AFTER browser testing passes
   - Document any new patterns or learnings
   - Include Playwright test results and screenshots
   - Prepare for epic integration with confirmed working feature

### Phase 4: Quality Checklist
Ensure implementation follows project patterns:

- [ ] **Commands Before UI**: Commands implemented first
- [ ] **Service Layer Abstraction**: No direct git operations from UI
- [ ] **Feature Slice**: Components in appropriate feature folder
- [ ] **AI Documentation**: Feature folder has README.md
- [ ] **Zustand Integration**: State management properly integrated
- [ ] **Unit Testing**: Comprehensive test coverage
- [ ] **Playwright Browser Testing**: Feature validated in actual browser environment
- [ ] **Console Clean**: No errors or warnings in browser console
- [ ] **Screenshots Captured**: Visual proof of working functionality
- [ ] **Git Philosophy**: Frequent, granular commits (only AFTER testing passes)

## Execution Readiness
After planning:

1. **Environment Setup**: 
   - Ensure dev server is running (`npm run dev`) - prompt user if not
   - Confirm Playwright MCP access for browser testing
2. **Branch Management**: Create feature branch if needed
3. **Issue Updates**: Update GitHub feature issue with detailed plan
4. **TodoWrite**: Comprehensive task breakdown ready including Playwright testing steps
5. **Context**: All development rules and patterns clear
6. **Begin**: Start with command implementation following plan

## Testing-First Completion Protocol
**CRITICAL**: Feature is NOT complete until:
- [ ] Playwright MCP browser testing confirms functionality works
- [ ] Screenshots captured showing successful operation
- [ ] Console logs are clean (no errors/warnings)
- [ ] All user interactions work as expected in actual browser
- [ ] No broken agentic loop (dev server keeps running)

Only AFTER successful browser testing:
- [ ] Commit changes with test results summary
- [ ] Update GitHub issues with completion status
- [ ] Mark TodoWrite tasks as complete

This planning approach ensures systematic, architecture-compliant feature development that is thoroughly tested and validated before any git or GitHub operations.