# Git Hooks Test Procedure

## Overview
This document provides a manual test procedure for validating the git hooks system that enables bidirectional supermodule relationship tracking.

## Test Setup

### Prerequisites
- InterBrain plugin installed in Obsidian
- Development vault with at least 3 DreamNodes (A, B, C)
- DreamNode A will be the parent (contains DreamSong canvas)
- DreamNodes B and C will be children (contain DreamTalk media)

### Create Test DreamNodes

1. **Create DreamNode A** (parent):
   - Use InterBrain "Create DreamNode" command
   - Title: "Test Parent Node"
   - Type: dream
   - Note its UUID from `.udd` file

2. **Create DreamNode B** (child 1):
   - Create another DreamNode
   - Title: "Test Child B"
   - Type: dream
   - Add some DreamTalk media (image, video, etc.)
   - Note its UUID

3. **Create DreamNode C** (child 2):
   - Create another DreamNode
   - Title: "Test Child C"
   - Type: dream
   - Add some DreamTalk media
   - Note its UUID

## Test 1: Supermodule Tracking on Submodule Addition

### Steps

1. **Create DreamSong canvas in Node A**:
   - Select DreamNode A
   - Run "Create DreamSong Canvas" command
   - Canvas should open in split view

2. **Add external media to canvas**:
   - Drag DreamTalk media from Node B into the canvas
   - Drag DreamTalk media from Node C into the canvas
   - Save the canvas file

3. **Sync submodules**:
   - Run "Sync Canvas Submodules" command (Ctrl+Shift+S)
   - Verify console logs show submodules imported
   - Verify canvas paths updated to reference submodules

4. **Check git status**:
   - Open terminal in DreamNode A directory
   - Run `git log -1 --oneline`
   - Should see commit: "Sync submodules for canvas DreamSong: +2"

5. **Verify post-commit hook ran**:
   - Run `git log -2 --oneline`
   - Should see TWO commits:
     - First: "Sync submodules for canvas DreamSong: +2"
     - Second: "Update submodule relationships"

6. **Check parent's .udd file**:
   - Open `DreamNode A/.udd`
   - Verify `submodules` array contains UUIDs for B and C
   ```json
   {
     "submodules": ["uuid-of-B", "uuid-of-C"],
     ...
   }
   ```

7. **Check child B's .udd file**:
   - Open `DreamNode B/.udd`
   - Verify `supermodules` array contains UUID of A
   ```json
   {
     "supermodules": ["uuid-of-A"],
     ...
   }
   ```

8. **Check child C's .udd file**:
   - Open `DreamNode C/.udd`
   - Verify `supermodules` array contains UUID of A
   ```json
   {
     "supermodules": ["uuid-of-A"],
     ...
   }
   ```

9. **Verify commits in child repos**:
   - Terminal in DreamNode B: `git log -1 --oneline`
   - Should see: "Add supermodule relationship: Test Parent Node"
   - Repeat for DreamNode C

### Expected Results
✅ Parent's `.udd` tracks children via `submodules` array
✅ Each child's `.udd` tracks parent via `supermodules` array
✅ Bidirectional relationship established automatically
✅ Commits created in both parent and child repos

## Test 2: Supermodule Tracking on Submodule Removal

### Steps

1. **Remove media from canvas**:
   - Open DreamNode A's DreamSong.canvas
   - Delete all nodes that reference DreamNode C
   - Save canvas

2. **Sync submodules**:
   - Run "Sync Canvas Submodules" command
   - Verify console shows "Removed 1 unused submodule(s)"

3. **Check git commits**:
   - Terminal in DreamNode A: `git log -2 --oneline`
   - Should see:
     - First: "Remove 1 unused submodule(s) from DreamSong"
     - Second: "Update submodule relationships"

4. **Check parent's .udd file**:
   - Open `DreamNode A/.udd`
   - Verify `submodules` array no longer contains C's UUID
   - Should only contain B's UUID
   ```json
   {
     "submodules": ["uuid-of-B"],
     ...
   }
   ```

5. **Check child C's .udd file**:
   - Note: Since submodule was removed, we can't update C's repo automatically
   - The relationship will be stale in C until it's used again
   - This is acceptable behavior

### Expected Results
✅ Parent's `.udd` no longer tracks removed child
✅ Submodule properly removed from git
⚠️  Child's `supermodules` array becomes stale (acceptable)

## Test 3: Pre-Commit Hook Validation

### Steps

1. **Create canvas without syncing**:
   - Open DreamNode A's DreamSong.canvas
   - Add more external media references
   - Save canvas

2. **Try to commit without syncing**:
   - Terminal in DreamNode A
   - Run: `git add DreamSong.canvas`
   - Run: `git commit -m "Test commit"`

3. **Check hook warning**:
   - Should see warning message:
     ```
     ⚠️  DreamNode Pre-Commit Hook: Canvas file(s) detected in commit
        If your canvas references external DreamNodes, remember to:
        1. Run 'Sync Canvas Submodules' command BEFORE committing
        2. This ensures submodule relationships are properly tracked
     ```

4. **Verify commit still proceeds**:
   - Commit should succeed (hooks don't block)
   - This is just a reminder, not enforcement

### Expected Results
✅ Warning message appears when committing canvas files
✅ Commit still proceeds (non-blocking reminder)

## Test 4: First Commit Initialization

### Steps

1. **Create a new DreamNode via git template**:
   - Use InterBrain's git template system
   - Terminal: `git init --template=<path-to-InterBrain>/DreamNode-template`
   - Add some initial file: `echo "test" > test.txt`
   - Stage and commit: `git add . && git commit -m "Initial commit"`

2. **Check hook output**:
   - Should see: "DreamNode Pre-Commit Hook: Initial setup - moving template files to working directory"
   - Should see: "✓ Moved .git/udd to .udd"
   - Should see: "✓ DreamNode initialization complete"

3. **Verify .udd file exists**:
   - Check that `.udd` file exists in working directory (not in .git/)
   - File should be committed in initial commit

### Expected Results
✅ Template files moved from `.git/` to working directory
✅ Files automatically staged and committed
✅ DreamNode ready to use

## Troubleshooting

### Hook not running
- Check hook file permissions: `ls -l .git/hooks/`
- Should be executable: `-rwxr-xr-x`
- If not: `chmod +x .git/hooks/post-commit`

### "hook-helper.js not found" error
- Verify `hook-helper.js` exists in `DreamNode-template/hooks/`
- Check it was copied to `.git/hooks/` during git init
- Re-run git template initialization if needed

### Node.js errors in hooks
- Check Node.js is installed: `node --version`
- Check hook-helper script is executable: `chmod +x hook-helper.js`
- Review stderr output for specific error messages

### Submodule changes not detected
- Verify `.gitmodules` file exists and contains submodule entries
- Check git log to confirm submodule commit actually happened
- Try running hook manually: `node .git/hooks/hook-helper.js update-supermodules`

## Success Criteria

All tests passing means:
- ✅ Post-commit hook automatically tracks bidirectional relationships
- ✅ Pre-commit hook provides helpful reminders
- ✅ Template initialization works correctly
- ✅ Supermodule/submodule arrays stay synchronized
- ✅ Coherence Beacon foundation is operational
