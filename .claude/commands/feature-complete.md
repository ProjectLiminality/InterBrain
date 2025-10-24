---
allowed-tools: Bash(git:*), Bash(gh:*), Read, TodoWrite, Bash(npm:*)
description: Complete feature development with mandatory user testing, validation, and epic integration
---

# Feature Complete Workflow

## Usage
Execute: `/feature-complete` (automatically detects current feature from branch or context)
Optional: `/feature-complete #287` or `/feature-complete additional context or instructions`

## CRITICAL USER TESTING PHASE

**⚠️ MANDATORY BEFORE ANY COMMITS ⚠️**

### Phase 1: Intelligent Feature Detection & Pre-Testing Validation

#### Feature Detection
- **Current branch**: Run `git branch --show-current`
- **Extract feature number**: Parse feature number from branch name (e.g., feature/287-something → #287)
- **Process user context**: Handle any additional context provided after command
- **Git status**: Run `git status --short`
- **Feature issue**: Run `gh issue view DETECTED_FEATURE_NUMBER` (from branch name or user context)

#### Implementation Completeness Check
- [ ] All TodoWrite tasks marked complete
- [ ] All acceptance criteria addressed in code
- [ ] Unit tests written and passing
- [ ] No obvious bugs or incomplete functionality

### Phase 2: Quality Assurance

#### Code Quality Validation
- **Run all checks**: Run `npm run check-all`
- **Verify zero warnings**: Ensure clean lint, tests, and type checking
- **Fix any issues**: Address all errors before proceeding

#### Development Environment Check
- **Obsidian ready**: Confirm development vault accessible for testing

### Phase 3: Stop for User Testing

#### **MANDATORY USER TESTING REQUEST**

**STOP IMPLEMENTATION** - Never proceed without user feedback

Present to user:
```
The feature implementation is complete and ready for testing.

**Please test the following functionality:**
[List specific features to test based on acceptance criteria]

**Key interactions to verify:**
[Mention any special interactions or edge cases]

**Please check for:**
- Feature works as expected
- No console errors or broken functionality
- User experience feels smooth and intuitive
- Any unexpected behavior or issues

Please provide feedback on anything that needs adjustment.
```

#### Wait for User Feedback
- **DO NOT PROCEED** until user provides testing feedback
- **Document any issues** found during user testing
- **Iterate implementation** based on feedback if needed

#### Re-test Cycle (if needed)
- **Fix reported issues** based on user feedback
- **Re-run quality checks**: Run `npm run check-all`
- **Request re-testing**: Ask user to verify fixes
- **Repeat until user confirms** feature works correctly

## Phase 4: Feature Integration

**Only proceed here AFTER user confirms feature works correctly**

### Git Operations

#### Commit Feature Work
- **Stage all changes**: Run `git add -A`
- **Commit with summary**: Run `git commit -m "$(cat <<'EOF'
Feature #DETECTED_FEATURE_NUMBER: [FEATURE_TITLE]

[Brief summary of implementation]
- [Key changes made]
- [User testing completed successfully]

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"`

#### Epic Branch Integration

**⚠️ CRITICAL: LOCAL-ONLY WORKFLOW ⚠️**
- **Epic and feature branches are NEVER pushed to remote**
- **ONLY main branch gets pushed to remote (during epic completion)**

- **Switch to epic branch**: Run `git checkout epic/EPIC_NUMBER-epic-name`
- **Merge feature**: Run `git merge feature/FEATURE_NAME-from-issue --no-ff`
- **NO PUSH**: Epic branch stays local until epic completion (merges to main)

### GitHub Issue Management

#### Update Issue Body
Mark all acceptance criteria as complete:
```markdown
## Acceptance Criteria
- [x] [Completed criterion 1]
- [x] [Completed criterion 2]
- [x] [Completed criterion 3]

## Implementation Summary
[Brief summary of what was built]

## User Testing Results
✅ User testing completed successfully
✅ All functionality verified working
✅ No outstanding issues identified

## Technical Notes
[Any important implementation details]
```

#### Close Feature Issue
- **Update issue**: Run `gh issue edit DETECTED_FEATURE_NUMBER --body "COMPLETED_ISSUE_BODY"`
- **Close with summary**: Run `gh issue close DETECTED_FEATURE_NUMBER --comment "Feature implementation complete. User testing passed. Merged to epic branch."` (using detected feature number)

### Project Board Management
- **Move to Complete**: Reference @CLAUDE.md (lines 680-727) for GraphQL project board updates
- **Update epic progress**: Note feature completion in epic tracking

## Phase 5: Cleanup & Next Steps

### Branch Cleanup
- **Delete local feature branch**: Run `git branch -d feature/FEATURE_NAME-from-issue`
- **NO remote cleanup needed**: Feature branches never pushed to remote

### TodoWrite Cleanup
- **Mark all feature todos complete**: Update any remaining TodoWrite tasks
- **Clear completed tasks**: Clean up task list for next feature

### Epic Progress Assessment
- **Check epic status**: Review remaining features in current epic
- **Identify next feature**: Prepare for next development cycle
- **Epic completion check**: Assess if epic is ready for completion

## Feature Completion Checklist

- [ ] **Implementation Complete**: All acceptance criteria met
- [ ] **Quality Validated**: `npm run check-all` passes with zero warnings
- [ ] **User Testing Completed**: User confirmed feature works correctly
- [ ] **Issues Addressed**: All user feedback incorporated
- [ ] **Code Committed**: Proper commit message with testing confirmation
- [ ] **Epic Integration**: Feature merged to epic branch
- [ ] **GitHub Updated**: Issue body updated with completion status
- [ ] **Issue Closed**: Closed with completion summary
- [ ] **Project Board**: Moved to Complete status
- [ ] **Cleanup Done**: Feature branch deleted
- [ ] **TodoWrite Clean**: Task list updated

## Next Steps Options

### Continue Epic Development
If more features remain in epic:
1. **Use `/feature-start`** for next feature
2. **Follow epic roadmap** for feature prioritization
3. **Maintain epic branch hygiene**

### Complete Epic
If all epic features done:
1. **Use `/epic-complete`** for epic finalization
2. **Prepare for main branch merge**
3. **Plan next epic development**

## Reference Materials

- **Testing Protocols**: @CLAUDE.md (lines 784-790)
- **Git Commit Philosophy**: User memory for commit patterns
- **GitHub CLI Commands**: @CLAUDE.md (lines 610-767)
- **Quality Standards**: @CLAUDE.md (lines 484-496)
- **Epic Integration**: @CLAUDE.md (lines 470-483)

## Critical Success Factors

**✅ User Testing is Non-Negotiable**
- Never commit without user validation
- User feedback drives iteration cycles
- Feature is not complete until user confirms

**✅ Quality Before Integration**
- All checks must pass before merge
- Zero warnings policy maintained
- Clean git history preserved

**✅ Proper Epic Integration**
- Feature branch merged to epic branch
- Epic branch maintains clean state
- All GitHub tracking updated correctly

This command ensures systematic feature completion following the **User Testing Protocol** from project memory.