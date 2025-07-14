---
allowed-tools: Bash(gh:*), Read, TodoWrite
description: Create comprehensive plan for implementing a specific feature
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

## Planning Framework

### Phase 1: Feature Analysis
Based on the feature requirements:

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
   - Validate UI interactions
   - Check integration with existing features

6. **Documentation & Integration**:
   - Update feature issue with completion notes
   - Document any new patterns or learnings
   - Prepare for epic integration

### Phase 4: Quality Checklist
Ensure implementation follows project patterns:

- [ ] **Commands Before UI**: Commands implemented first
- [ ] **Service Layer Abstraction**: No direct git operations from UI
- [ ] **Feature Slice**: Components in appropriate feature folder
- [ ] **AI Documentation**: Feature folder has README.md
- [ ] **Zustand Integration**: State management properly integrated
- [ ] **Testing**: Comprehensive test coverage
- [ ] **Git Philosophy**: Frequent, granular commits

## Execution Readiness
After planning:

1. **Branch Management**: Create feature branch if needed
2. **Issue Updates**: Update GitHub feature issue with detailed plan
3. **TodoWrite**: Comprehensive task breakdown ready
4. **Context**: All development rules and patterns clear
5. **Begin**: Start with command implementation following plan

This planning approach ensures systematic, architecture-compliant feature development that integrates seamlessly with the existing codebase and follows established patterns.