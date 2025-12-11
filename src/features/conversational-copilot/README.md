# Conversational Copilot Feature

Real-time video call assistant that transcribes conversations, performs semantic search, tracks DreamNode invocations, and generates AI-powered summaries with shareable exports.

## Purpose

Transforms video calls into documented conversations by:
- Real-time speech-to-text transcription (delegates to `realtime-transcription` feature)
- Semantic search as you speak (finds relevant DreamNodes)
- Recording DreamNode invocations during conversation
- AI-powered post-call summaries with Claude Haiku
- Beautiful PDF + email exports with deep links
- Perspective creation (delegates to `songline` feature for audio clips)

## Directory Structure

```
conversational-copilot/
├── store/
│   └── slice.ts                        # Zustand state (copilot mode, shared nodes)
├── services/
│   ├── transcription-service.ts        # Markdown file creation + semantic search monitoring
│   ├── conversation-recording-service.ts  # DreamNode invocation tracking
│   ├── conversation-summary-service.ts    # Claude API for AI summaries
│   ├── email-export-service.ts            # Apple Mail draft generation
│   ├── pdf-generator-service.ts           # PDF document creation
│   └── llm-provider.ts                    # LLM provider abstraction
├── utils/
│   └── open-node-content.ts            # Node content opening logic
├── commands.ts                         # Command palette registration
└── README.md                           # This file
```

## Responsibility Boundaries

### What This Feature Owns
- **Copilot mode state**: Active/inactive, conversation partner, shared node tracking
- **Transcript file management**: Creates markdown file in `conversations/` directory
- **Semantic search during conversation**: Monitors transcript changes, runs FIFO buffer search
- **Invocation tracking**: Records which DreamNodes were clicked during conversation
- **AI summary generation**: Calls Claude API to generate summaries and clip suggestions
- **Export pipeline**: PDF generation, Apple Mail drafts, share link creation

### What This Feature Delegates

**To `realtime-transcription` feature:**
- Actual audio capture and transcription (Python whisper_streaming)
- Audio file recording (MP3 output)

**To `songline` feature:**
- Perspective storage (`perspectives.json` in DreamNodes)
- Audio clip trimming (ffmpeg integration)
- Clip filename generation
- Perspective service (CRUD operations)

**To `social-resonance` feature:**
- Radicle identity operations
- Share link generation

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Start Conversation Mode                       │
├─────────────────────────────────────────────────────────────────┤
│ 1. Create transcript file (this feature)                        │
│ 2. Start Python transcription (realtime-transcription)          │
│ 3. Start invocation recording (this feature)                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      During Conversation                         │
├─────────────────────────────────────────────────────────────────┤
│ • Python writes to transcript.md (realtime-transcription)       │
│ • This feature monitors file changes → semantic search          │
│ • User clicks DreamNodes → invocations recorded (this feature)  │
│ • Invocation markers embedded in transcript (this feature)      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     End Conversation Mode                        │
├─────────────────────────────────────────────────────────────────┤
│ 1. Stop Python transcription (realtime-transcription)           │
│ 2. Generate AI summary + clip suggestions (this feature)        │
│ 3. Create PDF with DreamNode images (this feature)              │
│ 4. Generate share links (social-resonance)                      │
│ 5. Open Apple Mail draft (this feature)                         │
│ 6. Create perspectives from clip suggestions (songline)         │
│ 7. Persist bidirectional relationships (this feature)           │
└─────────────────────────────────────────────────────────────────┘
```

## File Storage

### Where Things Go

| Content Type | Location | Owner |
|--------------|----------|-------|
| Transcript `.md` | `DreamerNode/conversations/` | This feature |
| Full audio `.mp3` | `DreamerNode/conversations/` | realtime-transcription |
| `perspectives.json` | `DreamNode/` (ideas) | songline |
| Trimmed clips `.mp3` | `DreamNode/perspectives/` | songline |

## Main Exports

### Commands
```typescript
registerConversationalCopilotCommands(plugin, uiService)
```

### State Management
```typescript
copilotMode: {
  isActive: boolean
  conversationPartner: DreamNode | null
  sharedNodeIds: string[]
  frozenSearchResults: DreamNode[]
}
```

### Services (Singleton Pattern)
```typescript
getTranscriptionService()           // Markdown file + semantic search
getConversationRecordingService()   // Invocation tracking
getConversationSummaryService()     // AI summary generation
getEmailExportService()             // Apple Mail + PDF creation
getPDFGeneratorService()            // PDF document generation
```

## Prerequisites

### Radicle Authentication
Email export requires Radicle authentication for share link generation:
```bash
rad auth
```
This registers your SSH key with ssh-agent. Without this, the email export will fail with:
```
error: radicle key is not registered; run `rad auth` to register it with ssh-agent
```

### Python Environment
Real-time transcription requires the Python environment from `realtime-transcription` feature.

### ffmpeg
Perspective clip creation requires ffmpeg:
- macOS: `brew install ffmpeg`
- Ubuntu/Debian: `sudo apt install ffmpeg`
- Windows: Download from ffmpeg.org

## Known Limitations

- **macOS Only**: AppleScript for Apple Mail (no cross-platform email yet)
- **Python Dependency**: Requires Whisper transcription service running
- **Claude API Required**: No AI summary fallback if API key missing (graceful degradation in place)

## Architecture Notes

- **Service Layer Pattern**: All business logic in singleton services
- **Zustand State Management**: Copilot mode state integrated with core store
- **Event-Driven**: File monitoring via Obsidian Vault events
- **Throttling**: 5-second cooldown on semantic search
- **FIFO Buffer**: Last 500 chars of transcript for search queries
- **Graceful Degradation**: Works without API key (basic email with no AI summary)
