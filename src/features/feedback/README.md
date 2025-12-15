# Feedback Feature

Bug reporting system enabling collective intelligence through automated issue collection, deduplication, and submission.

## Purpose

This feature provides a comprehensive bug reporting system that:
- Captures errors automatically (uncaught exceptions, unhandled rejections)
- Allows manual bug reports via command
- Collects contextual data (logs, state, navigation history)
- Deduplicates reports across users (hash-based and AI semantic)
- Submits issues to GitHub via `gh` CLI
- Optionally uses AI to refine reports before submission

## Vision: Distributed Compute for Issue Management

The feedback system distributes the cognitive load of issue management:

```
USER COMPUTE CONTRIBUTION
─────────────────────────────────────────────────────────────►
Raw Report    →    AI-Refined Report    →    Deduplicated Report
  (minimal)         (user's API key)         (prevents duplicates)
```

**Design Philosophy**: Users who opt into AI refinement contribute their own compute to maintain a clean issue tracker. This follows the cultural norm of "search before posting" but automates it.

## Directory Structure

```
src/features/feedback/
├── store/
│   └── slice.ts                  # FeedbackSlice - preferences, modal state, rate limiting
├── services/
│   ├── error-capture-service.ts  # Console capture, error handlers, local dedup
│   ├── feedback-service.ts       # Orchestration, submission, cross-user dedup
│   └── issue-formatter-service.ts # Issue markdown formatting, hash computation
├── components/
│   └── FeedbackModal.tsx         # Obsidian Modal for submission
├── settings-section.ts           # Feature-owned settings panel UI
├── commands.ts                   # Report bug + test commands
├── index.ts                      # Barrel export
└── README.md                     # This file
```

## Main Exports

```typescript
import {
  // Store
  createFeedbackSlice,
  FeedbackSlice,
  FeedbackState,
  CapturedError,
  AutoReportPreference,

  // Services
  errorCaptureService,
  feedbackService,
  issueFormatterService,

  // Components
  FeedbackModal,
  showFeedbackModal,

  // Commands
  registerFeedbackCommands,

  // Settings
  createFeedbackSettingsSection,
} from '../features/feedback';
```

## Commands

| Command ID | Name | Description |
|------------|------|-------------|
| `interbrain:report-bug` | Report a Bug | Opens the feedback modal |
| `interbrain:test-feedback-*` | [Test] * | Debug commands for development |

## Deduplication System

### Two-Strategy Approach

The system uses two complementary deduplication strategies:

| Strategy | Trigger | Reliability | Use Case |
|----------|---------|-------------|----------|
| **Hash-based** | Automatic (has stack trace) | High (deterministic) | Errors with programmatic context |
| **AI Semantic** | Manual + AI refinement enabled | Medium (probabilistic) | User-described issues without stack trace |

### Strategy 1: Hash-Based Deduplication

For errors with stack traces, a stable hash (`IB-ERR-XXXXXXXX`) is computed from:
- Error message
- First meaningful stack frame (file:line:col, path-normalized)

**Flow**:
```
Error with stack trace
    ↓
Compute hash: IB-ERR-a1b2c3d4
    ↓
Search GitHub for existing issue with this hash
    ↓
Found? → Add comment to existing issue
Not found? → Create new issue with hash in body
```

**Cross-user example**:
1. Alice hits bug → hash `IB-ERR-a1b2c3d4` computed
2. Issue #42 created with `**Error ID:** \`IB-ERR-a1b2c3d4\`` in body
3. Bob hits same bug → same hash computed
4. GitHub search finds issue #42 by hash
5. Bob's report added as comment to #42

### Strategy 2: AI Semantic Deduplication

For manual reports (no stack trace), when AI refinement is enabled:

**Flow**:
```
Manual report + AI refinement enabled
    ↓
Step 1: Generate AI title + summary for new report
    ↓
Step 2: Fetch 20 recent open bug issues from GitHub
    ↓
Step 3: Extract title + summary from existing issues
        (AI-refined issues have "**Summary:**", raw issues use description)
    ↓
Step 4: AI compares refined report against existing issues
    ↓
Duplicate? → Add comment to existing issue
Novel? → Create new issue
```

**Key Design Decisions**:
- **AI refines new report first**: Ensures consistent semantic representation for comparison
- **Handles mixed formats**: Works whether existing issues are AI-refined or raw
- **Conservative matching**: Only matches clearly same bug, not vaguely related
- **User opt-in**: Only runs when AI refinement enabled (user's API key, user's compute)
- **Uses Haiku**: Fast and cost-efficient for dedup checks

### Local Deduplication

Separate from cross-user dedup, local deduplication prevents modal spam:
- Same error hash within 60 seconds → silently ignored (no `onError` callback)
- Modal throttle: 30 seconds between modal appearances

## Rate Limiting

| Mechanism | Cooldown | Purpose |
|-----------|----------|---------|
| **Modal throttle** | 30s after modal shown | Prevents error loop spam |
| **Session limit** | Max 10 submissions | Prevents GitHub API abuse |
| **Local dedup** | 60s per error hash | Prevents duplicate modals |

All limits reset on plugin reload.

## Data Collection

| Data | Source | Purpose |
|------|--------|---------|
| Error stack trace | Error object | Bug location, hash computation |
| Console logs (last 50) | Ring buffer | Execution context |
| Store state snapshot | Zustand | Reproduction state |
| System info | navigator + manifest | Environment |
| Navigation history | Store | User journey |
| Error hash | Computed | Cross-user dedup |
| User description | Manual input | Intent/expectation |
| Reproduction steps | Manual input (optional) | How to reproduce |

## Privacy & Sanitization

**Never included in reports**:
- `claudeApiKey` - redacted from state
- `radiclePassphrase` - redacted from state
- Absolute file paths - only vault-relative paths
- User email - not collected

**Sanitized store state includes**:
- Layout mode, selected node (id/name/type only)
- Copilot mode (active status, partner redacted)
- Creation/edit/search state (active status only)
- Node count (not node contents)

## User Preferences

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Auto-report | `'always'` \| `'ask'` \| `'never'` | `'ask'` | When to show modal |
| Include logs | boolean | `true` | Include console buffer |
| Include state | boolean | `true` | Include sanitized store |

## Submission Modes

### Raw Submission
- Structured markdown with all collected data
- No API key required
- Fast, deterministic output
- User-provided reproduction steps included (if any)

### AI-Refined Submission
- Claude generates concise title and summary
- Categorizes issue (Bug/UX Issue/Performance/Crash)
- Estimates complexity (Trivial/Minor/Moderate/Complex)
- **Enables AI semantic deduplication**
- Requires Claude API key

**AI Refinement Principles**:
1. **AI enhances, never fabricates**: Raw data always preserved in collapsible section
2. **No invented reproduction steps**: Only user-provided steps are included
3. **No investigation suggestions**: Maintainer has codebase context, AI doesn't
4. **Focused output**: Title, summary, category, complexity only

## Modal UI

The feedback modal collects:
1. **What happened?** (required) - User description textarea
2. **Steps to reproduce** (optional) - How to reproduce the issue
3. **Data toggles** - Console logs, app state inclusion
4. **Submit options** - Raw or AI-refined

## Architecture

### Error Capture Flow

```
Error occurs (uncaught/unhandled)
    ↓
ErrorCaptureService.handleCapturedError()
    ↓
shouldIgnoreError? → (yes) → silent ignore
    ↓ (no)
Track hash for local dedup
    ↓
Call onError callback (always - let modal throttle decide)
    ↓
Main.ts: Check user preference
    ↓
'never' → log only
'always'/'ask' → Check modal throttle
    ↓
Throttled? → Show notice once, then silent
    ↓ (not throttled)
Open FeedbackModal + record modal timestamp
```

### Submission Flow

```
FeedbackModal.submitReport(useAi)
    ↓
FeedbackService.submitReport()
    ↓
Collect feedback data (logs, state, system info, hash, repro steps)
    ↓
Check session limit
    ↓
checkForDuplicateByHash() → (found) → addCommentToIssue()
    ↓ (not found)
useAi && !hash? → checkForDuplicateByAi() → (found) → addCommentToIssue()
    ↓ (not found)
useAi? → formatWithAi() : formatRaw()
    ↓
createIssue()
    ↓
Return { success, issueUrl, wasDuplicate }
```

### AI Semantic Dedup Flow

```
checkForDuplicateByAi(data)
    ↓
generateAiTitleAndSummary(data) → { title, summary }
    ↓
Fetch 20 open bug issues from GitHub
    ↓
For each issue: extract title + (summary OR first 200 chars of body)
    ↓
Send to Claude: "Is new report same problem as any existing?"
    ↓
AI responds: issue number OR "NEW"
    ↓
Match found? → return issue URL
No match? → return null (create new issue)
```

## Dependencies

| Dependency | Required | Purpose |
|------------|----------|---------|
| `gh` CLI | Yes | GitHub issue creation/search |
| `gh auth login` | Yes | Authentication |
| Claude API key | No | AI refinement + semantic dedup |

## Integration Points

| System | Integration |
|--------|-------------|
| **Store** | FeedbackSlice in InterBrainState |
| **Settings** | `createFeedbackSettingsSection()` in settings-tab.ts |
| **Main** | Error handlers in `initializeErrorCapture()` |
| **Commands** | `registerFeedbackCommands()` in main.ts |

## Test Commands

Development commands (always registered, useful for debugging):

| Command | Purpose |
|---------|---------|
| `[Test] Trigger Error Capture` | Throw test error |
| `[Test] Manual Error Capture` | Capture without throwing |
| `[Test] Check Rate Limit Status` | Show throttle states |
| `[Test] Reset Rate Limits` | Clear all throttles |
| `[Test] View Captured Logs` | Show log buffer |
| `[Test] Debug Environment Detection` | Trace system info |

## Design Decisions Log

### Why no AI-generated reproduction steps?
AI doesn't have context about what actions trigger bugs. Only the user knows what they did. Fabricated steps add noise and waste maintainer time verifying invalid reproductions.

### Why no AI-generated investigation suggestions?
AI lacks codebase knowledge. Generic suggestions ("check rendering pipeline") are less useful than maintainer's domain expertise. Removed to reduce noise.

### Why separate title/summary generation for dedup?
Full AI refinement includes category, complexity, formatting. For dedup comparison, we only need title + summary. Separate lightweight call is faster and cheaper.

### Why compare against both AI-refined and raw issues?
Early adopters use AI refinement, but raw issues from before exist. System extracts "**Summary:**" from AI-refined issues OR falls back to body text. This ensures Bob's AI-refined report matches Alice's raw issue.

### Why 20 issue limit for semantic dedup?
Balances context size vs. token cost. Most duplicates are recent. Older issues likely have different underlying causes even if superficially similar.

### Why strip line numbers from plugin stack traces for hashing?
Bundled code line numbers change with every build (`plugin:interbrain:5954` vs `plugin:interbrain:5980`). This would defeat cross-version deduplication. We strip line numbers but keep function names, which are stable.

**Known limitation:** If two different bugs have identical error messages AND occur in anonymous functions (like `eval`), they may incorrectly deduplicate. In practice, real errors usually have named functions in the stack trace that provide differentiation. This is an acceptable trade-off for version-independent deduplication.

## Future Considerations

The feedback system is designed as a foundation for broader collective intelligence:

- **Contribution axis**: Raw → Refined → PR → Tested PR
- **Complexity axis**: Bug fix → Feature → Applet → DreamNode

Current implementation covers the leftmost point (bug reports). Architecture supports organic growth toward more sophisticated collaboration patterns.
