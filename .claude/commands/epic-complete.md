---
allowed-tools: Bash(git:*), Bash(gh:*), Bash(npm:*), Read, Write, MultiEdit, Edit
description: Complete epic development with quality assurance, documentation, versioning, and release
---

# Epic Complete Workflow

## Usage
Execute: `/epic-complete` (automatically detects current epic from branch)
Optional: `/epic-complete additional context or instructions`

## Phase 1: Intelligent Epic Detection & Validation

### Epic Detection from Branch
- **Current branch**: Run `git branch --show-current`
- **Extract epic number**: Parse epic number from branch name (e.g., epic/6-dreamweaving-operations → 6)
- **Additional context**: Process any user-provided context after command
- **Git status**: Run `git status --short`
- **Epic issue status**: Run `gh issue view DETECTED_EPIC_NUMBER` (using extracted number)

### Feature Completion Verification
- **Epic features**: Run `gh issue list --label feature --search "epic DETECTED_EPIC_NUMBER" --state all`
- **Verify all features closed**: Ensure no open features remain for this epic
- **Epic specification status**: Confirm specification issue is complete

### Quality Gate Check
- **Uncommitted changes**: Ensure clean git state before proceeding
- **Epic branch sync**: Verify all feature merges complete

## Phase 2: Quality Assurance & Testing

### Comprehensive Code Validation
- **Run all checks**: Run `npm run check-all`
- **Zero warnings requirement**: Fix any lint errors, test failures, or type errors
- **Test coverage review**: Ensure all new functions have appropriate tests

#### If Quality Issues Found:
1. **Stop epic completion** until issues resolved
2. **Address each issue** systematically
3. **Re-run checks**: Run `npm run check-all`
4. **Commit fixes**: Run `git add -A && git commit -m "Fix quality issues for epic completion"`

### Epic Integration Testing
- **Manual testing**: Verify epic functionality works end-to-end
- **Integration points**: Test epic features work together correctly
- **Performance check**: Ensure no regressions introduced

## Phase 3: Documentation Updates

**Follow Documentation Architecture Pattern**: Root files + docs/ directory

### Required Documentation Updates

#### 1. Project Memory (CLAUDE.md)
- **Update epic status**: Mark epic as COMPLETE in Current Development Status
- **Add epic achievements**: Document key technical innovations
- **Update next epic status**: If applicable, mark next epic as active
- **Update architecture notes**: Document any new patterns introduced

#### 2. CHANGELOG.md Analysis & Update
**Critical**: Review git commit history for precise documentation

- **Analyze commits**: Run `git log main..HEAD --oneline` (current epic branch)
- **Review detailed changes**: Run `git log main..HEAD --stat` (current epic branch)
- **Create new version section**:
  ```markdown
  ## [X.Y.Z] - YYYY-MM-DD - Epic $ARGUMENTS: [EPIC_TITLE]

  ### Added
  - [List new features with issue numbers]

  ### Technical Achievements
  - [Key innovations and architecture changes]

  ### Enhanced
  - [Improvements to existing functionality]

  ### Fixed
  - [Bug fixes and technical debt resolution]
  ```

#### 3. README.md Updates
- **Update project status**: Reflect epic completion
- **Update roadmap checkmarks**: Mark completed milestones
- **Add epic completion notes**: Brief summary of achievements

#### 4. Technical Documentation (docs/)
- **Update docs/technical-patterns.md**: Add new algorithms/patterns discovered
- **Update docs/architecture-details.md**: Document architectural changes
- **Update docs/ux-specifications.md**: Document UX patterns and flows
- **Ensure cross-references**: Verify all doc links remain accurate

## Phase 4: Version Release

### Version Bumping
- **Read current version**: Run `cat package.json | grep '"version"'`
- **Determine version increment**:
  - Major (X.0.0): Breaking changes or major new functionality
  - Minor (X.Y.0): New features, backwards compatible
  - Patch (X.Y.Z): Bug fixes, minor improvements

#### Update Version
- **Bump package.json**: Update version field to new version
- **Commit version bump**: Run `git add package.json && git commit -m "Release vX.Y.Z: Epic DETECTED_EPIC_NUMBER - [EPIC_TITLE]"` (detect epic from branch)

### Final Quality Check
- **Final validation**: Run `npm run check-all`
- **Ensure all changes committed**: Run `git status --short`

## Phase 5: Main Branch Integration

### Merge to Main
- **Switch to main**: Run `git checkout main`
- **Pull latest main**: Run `git pull origin main`
- **Merge epic branch**: Run `git merge CURRENT_EPIC_BRANCH --no-ff -m "Complete Epic DETECTED_EPIC_NUMBER: [EPIC_TITLE]"` (merge current epic branch)
- **Push main**: Run `git push origin main`

### Create Git Tag
- **Create tag**: Run `git tag vX.Y.Z`
- **Push tag**: Run `git push origin vX.Y.Z`

## Phase 6: GitHub Release & Project Management

### Create GitHub Release
- **Create release**: Run `gh release create vX.Y.Z --title "Epic $ARGUMENTS: [EPIC_TITLE]" --notes-from-tag`
- **Reference CHANGELOG**: Include comprehensive notes from CHANGELOG.md section

### Epic Issue Management
- **Update epic issue**: Mark all success criteria as complete
- **Close epic issue**: Run `gh issue close DETECTED_EPIC_NUMBER --comment "Epic DETECTED_EPIC_NUMBER complete. All features implemented, tested, and released as vX.Y.Z."`
- **Update project board**: Reference @CLAUDE.md (lines 680-727) for GraphQL status update

### Specification Issue Closure
- **Close specification**: Close related specification issue with completion summary
- **Update parent-child links**: Ensure GitHub issue relationships properly closed

## Phase 7: Cleanup & Next Epic Preparation

### Branch Cleanup
- **Delete epic branch**: Run `git branch -d CURRENT_EPIC_BRANCH` (delete current epic branch)
- **Delete remote epic branch**: Run `git push origin --delete CURRENT_EPIC_BRANCH`

### Project Memory Updates
- **Final CLAUDE.md update**: Reflect current project state post-epic
- **Update epic quick reference**: Mark epic complete, update active epic
- **Commit memory updates**: Run `git add CLAUDE.md && git commit -m "Update project memory after Epic DETECTED_EPIC_NUMBER completion"`

### Next Epic Planning
- **Identify next epic**: Review epic roadmap and priorities
- **Update development status**: Prepare for next development cycle
- **Archive lessons learned**: Document key insights for future epics

## Epic Completion Checklist

### Quality Standards
- [ ] **All tests passing**: `npm run check-all` shows zero warnings/errors
- [ ] **Zero lint warnings**: Clean code validation complete
- [ ] **Zero TypeScript errors**: Full type safety maintained
- [ ] **Clean git state**: No uncommitted changes

### Documentation Standards
- [ ] **CHANGELOG updated**: Comprehensive epic details from git history
- [ ] **README updated**: Project status and roadmap reflect completion
- [ ] **Technical docs updated**: New patterns and architectures documented
- [ ] **Project memory updated**: Epic status and achievements captured

### Release Standards
- [ ] **Version bumped**: Appropriate semantic version increment
- [ ] **Main branch merged**: Epic integrated to main with clean history
- [ ] **Git tag created**: Release tagged and pushed
- [ ] **GitHub release**: Comprehensive release notes published

### Project Management
- [ ] **Epic issue closed**: All success criteria marked complete
- [ ] **Specification closed**: Related spec issue properly closed
- [ ] **Project board updated**: All issues moved to Complete status
- [ ] **Branch cleanup**: Epic branch deleted from local and remote

### Next Cycle Preparation
- [ ] **Memory updated**: Current state accurately reflected
- [ ] **Next epic identified**: Development roadmap updated
- [ ] **Lessons documented**: Key insights preserved for future

## Success Criteria

**Epic is complete when:**
✅ All code quality standards met
✅ Comprehensive documentation updated
✅ Version released and tagged
✅ GitHub project management complete
✅ Clean development environment for next epic

## Reference Materials

- **Epic Completion Requirements**: @CLAUDE.md (lines 484-496)
- **Documentation Architecture**: @CLAUDE.md (lines 881-897)
- **GitHub CLI Commands**: @CLAUDE.md (lines 610-767)
- **Quality Standards**: @CLAUDE.md (lines 853-868)
- **Version Release Process**: @CLAUDE.md (lines 899-914)

## Critical Success Factors

**🎯 Quality Before Release**
- Never merge to main with failing tests or warnings
- Documentation must reflect actual implementation
- All acceptance criteria verified complete

**🎯 Comprehensive Documentation**
- CHANGELOG based on actual git history, not just memory
- Technical patterns properly documented for future reference
- Project memory accurately reflects current state

**🎯 Clean Project Management**
- All GitHub issues properly closed with summaries
- Project board reflects accurate completion status
- Development environment ready for next epic

This command ensures systematic epic completion following the **Epic Completion Workflow** from project memory.