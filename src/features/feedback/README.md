# Feedback Feature

Bug reporting system enabling collective intelligence through automated issue collection and submission.

## Purpose

This feature provides a comprehensive bug reporting system that:
- Captures errors automatically (uncaught exceptions, unhandled rejections)
- Allows manual bug reports via command
- Collects contextual data (logs, state, navigation history)
- Submits issues to GitHub via `gh` CLI
- Optionally uses AI to refine reports before submission

## Vision: Collective Intelligence Foundation

```
COMPUTE CONTRIBUTION AXIS (horizontal)
────────────────────────────────────────────────────►
Raw Report → Refined Issue → PR with Fix → Tested PR
   (0%)         (diagnosis)    (solution)    (validated)

COMPLEXITY AXIS (vertical)
│
│  Bug Fix → Minor Change → Feature → Applet → DreamNode
│
▼
```

This system starts simple (bug reports) and can organically scale toward full collective development.

## Directory Structure

```
src/features/feedback/
├── store/
│   └── slice.ts              # FeedbackSlice - preferences, modal state
├── services/
│   ├── error-capture-service.ts  # Console capture, error handlers
│   ├── feedback-service.ts       # Data collection, sanitization, gh CLI
│   └── issue-formatter-service.ts # Issue markdown formatting
├── components/
│   └── FeedbackModal.tsx     # Obsidian Modal for submission
├── settings-section.ts       # Settings panel UI
├── commands.ts               # Report bug command
├── index.ts                  # Barrel export
└── README.md                 # This file
```

## Main Exports

```typescript
import {
  // Store
  createFeedbackSlice,
  FeedbackSlice,
  CapturedError,

  // Services
  errorCaptureService,
  feedbackService,
  issueFormatterService,

  // Components
  showFeedbackModal,

  // Commands
  registerFeedbackCommands,

  // Settings
  createFeedbackSettingsSection,
  checkFeedbackStatus,
} from '../features/feedback';
```

## Commands

| Command ID | Name | Description |
|------------|------|-------------|
| `interbrain:report-bug` | Report a Bug | Opens the feedback modal for manual bug reporting |

## Data Collection

| Data | Source | Purpose |
|------|--------|---------|
| Error stack trace | Error object | Locate the bug |
| Console logs (last 50) | Ring buffer capture | Context |
| Store state snapshot | Zustand `.getState()` | Reproduction state |
| System info | Obsidian API + navigator | Environment |
| Navigation history | Store's navHistory | User journey |
| Plugin version | manifest.json | Version tracking |
| User description | Manual input | Intent/expectation |

## Privacy & Sanitization

The following data is **never** included in reports:
- `claudeApiKey` - removed from state snapshot
- `radiclePassphrase` - removed from state snapshot
- File paths beyond vault root - redacted
- User email - not collected

## User Preferences

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Auto-report | enum | `'ask'` | `'always'` / `'ask'` / `'never'` |
| Include logs | bool | `true` | Include console logs |
| Include state | bool | `true` | Include store snapshot |

## Trigger Mechanisms

### Automatic Trigger

Captures and optionally reports:
- `window.onerror` - uncaught exceptions
- `unhandledrejection` - promise rejections

Ignores:
- User cancellations
- Network retries
- Validation errors
- ResizeObserver errors

### Manual Trigger

Command: `interbrain:report-bug`

Opens modal with pre-collected context.

## Rate Limiting

- Max 1 auto-report per 30 seconds
- Max 10 reports per session
- Resets on plugin reload

## Deduplication

- Errors are hashed by message + first stack line
- Duplicate errors within 1 minute are ignored
- If issue exists on GitHub, adds comment instead of new issue

## Dependencies

- **Required**: `gh` CLI (GitHub CLI) - authenticated
- **Optional**: Claude API key - for AI-refined reports

## Architecture Notes

### Error Capture Flow

```
Error occurs
    ↓
ErrorCaptureService detects
    ↓
Check: shouldIgnoreError?
    ↓ (no)
Check: isDuplicate?
    ↓ (no)
Check: userPreference
    ↓
'always' → FeedbackService.submitReport()
'ask'    → openFeedbackModal()
'never'  → (log only)
```

### Issue Submission Flow

```
FeedbackModal.submitReport()
    ↓
FeedbackService.collectFeedbackData()
    ↓
Check: duplicateIssue?
    ↓ (no)
IssueFormatterService.format[Raw|WithAi]()
    ↓
gh issue create --repo ProjectLiminality/InterBrain
    ↓
Return issue URL
```

## Integration Points

- **Store**: FeedbackSlice integrated into InterBrainState
- **Settings**: Section registered in settings-tab.ts
- **Main**: Error handlers registered on plugin load
- **Commands**: Report bug command registered
