# Known Issues & Technical Debt

This document tracks deferred issues and technical debt for the InterBrain project.

## Edit Mode Layout Issues
**Status**: Deferred - Requires architectural analysis
**Issue**: When exiting edit-search mode, all search results remain in ring layout instead of intelligently differentiating between:
- **Glowing nodes** (pending relationships) - Should stay in ring
- **Non-glowing nodes** (unrelated search results) - Should fly away to sphere

**Context**:
- Escape navigation system works correctly (edit-search → edit → liminal-web)
- Store correctly filters `searchResults` to only pending relationships when exiting edit-search
- SpatialOrchestrator maintains separate `relatedNodesList` and `unrelatedSearchResultsList`
- Canvas attempts to call `reorderEditModeSearchResults()` fail due to state coordination issues

**Attempted Solutions** (August 26, 2025):
- Direct filtering in canvas layout handler
- Detection logic for edit-search transitions
- Multiple `showEditModeSearchResults` vs `reorderEditModeSearchResults` approaches

**Next Steps**:
- Consider orchestrator state management refactor
- May require unified layout state coordination between store and orchestrator
- Alternative: Accept current behavior as "close enough" for MVP

## Liminal-Web Mode Toggle Issues
**Status**: Deferred - Command queuing complexity
**Issue**: Quality-of-life toggles from liminal-web mode are unreliable:
- **Search mode toggle**: Sometimes stops at constellation, doesn't complete transition to search
- **Animation conflicts**: Dream node scaling and other effects interrupted by rushed transitions

**Attempted Solutions** (August 26, 2025):
- Sequential command queuing with 300ms delay
- Proper animation timing with 1100ms delay (1000ms + 100ms buffer)
- Fresh store references to prevent stale state

**Root Cause**: Complex interaction between constellation settlement timing, animation states, and command queuing. The transitions work sometimes but are not consistently reliable.

**Next Steps**:
- Consider simpler approach: disable toggles from liminal-web, require manual constellation return
- Or: Deeper investigation into animation state coordination
- Current workaround: Users can manually go constellation → search/creation

## Copilot Mode Transcript Refocus Polish
**Status**: Deferred - Works but needs reliability improvement (October 3, 2025)
**Issue**: After closing DreamSong/DreamTalk overlay with X button in copilot mode, transcript refocus is not 100% reliable in windowed mode (works fine in fullscreen):
- **Current behavior**: Multiple refocus mechanisms trigger (event-driven, periodic check, overlay close handler)
- **Expected**: Transcript should regain focus immediately for seamless dictation
- **Workaround**: User can click anywhere in dreamspace or on transcript pane to restore focus

**Attempted Solutions**:
- Window focus listeners (browser window.focus())
- Electron BrowserWindow.focus() via remote API
- Programmatic click simulation on editor element
- Multiple timing delays and refocus strategies

**Root Cause**: In windowed mode, clicking X button causes Electron window to lose focus. Multiple refocus attempts trigger but dictation doesn't immediately resume. Likely macOS-specific input activation state issue.

**Next Steps**:
- Consider accepting current behavior as "good enough" - foundation works
- Or: Investigate macOS accessibility APIs for input state activation
- Current workaround is acceptable for MVP

## Progressive Loading for URI Clones
**Status**: Deferred - Future enhancement (October 17, 2025)
**Issue**: GitHub/Radicle clone links block UI during clone operation instead of showing immediate placeholder

**Conceptual Design - Disk-Based Placeholder Approach**:
The key insight is to use **disk as single source of truth** rather than coordinating store-only placeholders:

1. **Immediate Placeholder Creation**:
   - Create directory + minimal `.udd` file BEFORE clone operation
   - Trigger `scanVault()` immediately → shows placeholder in DreamSpace
   - `.udd` contains: uuid, title (normalized from repo name), type, source URL/ID, empty relationships

2. **Background Clone**:
   - Use `git init + remote + fetch + reset --hard` instead of `git clone` (merge-friendly)
   - Allows existing `.udd` file to persist during git operations
   - Clone completes in background without blocking UI

3. **Observation-First Approach**:
   - Test what happens automatically when clone completes (existing code may handle it)
   - Only add custom refresh logic if needed based on observation
   - Simpler than coordinating complex state updates

**Benefits**:
- Single source of truth (disk) eliminates state coordination complexity
- Leverages existing `scanVault()` infrastructure
- Git-native workflow with merge-friendly operations
- No React state synchronization issues

**Implementation Notes**:
- `createMinimalUDD(destinationPath, repoName, sourceUrl, sourceType)` helper method
- Apply to both GitHub and Radicle clone flows
- Revert all store-only placeholder attempts (too complex)

**Next Steps** (when prioritized):
- Implement for GitHub first, then map to Radicle
- Test placeholder appearance and clone completion behavior
- Document what automatic behavior occurs vs custom logic needed

## Incomplete DreamNode Metadata
**Status**: Known Limitation - Not a Bug (October 18, 2025)
**Issue**: DreamNodes cloned from repositories not fully initialized for InterBrain may exhibit constellation positioning issues:
- **Symptom**: Node may not return to proper constellation position when deselected after auto-focus
- **Root Cause**: Repository missing `.udd` file or has incomplete InterBrain metadata
- **Occurs**: When cloning external/legacy repositories not created through InterBrain
- **Both Radicle and GitHub**: Not specific to one clone method

**Workaround**: Run "Scan vault for dream song relationships" command to refresh constellation layout

**Fixes Applied**:
- File system timing issue for GitHub clones (async `.udd` write - commit 34658da)
- Branch selection optimization (clone only `main`, not `gh-pages` - commit 7a7fa2f)

**Resolution**: Acceptable for MVP
- InterBrain-created DreamNodes work correctly out of the box
- Legacy/external repos have simple manual workaround
- Future: Consider auto-detection and repair of incomplete DreamNode metadata

## Proto Node Fly-In Animation Issues
**Status**: Deferred - Animation system complexity (August 26, 2025)
**Issue**: Proto node creation animation system needs refinement:
- **Desired behavior**: Fly-in animation when entering creation mode (like SearchNode3D)
- **Cancel/Escape**: Fly-out animation when canceling creation
- **Save**: Preserve existing save animation (move to final position, fade UI)

**Attempted Solutions**:
- Multiple animation state system with spawn/save/cancel types
- Component mount animation triggers
- Animation timing coordination with useFrame hooks

**Root Cause**: Complex interaction between component lifecycle, animation state management, and useFrame timing. Animation states conflict and create unwanted side effects.

**Next Steps**:
- Consider simpler animation approach focusing only on essential transitions
- May require rethinking animation architecture for creation components
- Alternative: Accept current immediate appearance/disappearance as sufficient for MVP
- **Current Status**: Reverted to stable state (commit 3402622) with working core functionality
