# Conversational Copilot Feature

Real-time video call assistant that transcribes conversations, performs semantic search, and generates AI-powered summaries with shareable DreamNode exports.

## Purpose

Transforms video calls into documented conversations by:
- Real-time speech-to-text transcription (Python service integration)
- Semantic search as you speak (finds relevant DreamNodes)
- Recording DreamNode invocations during conversation
- AI-powered post-call summaries with Claude Haiku
- Beautiful PDF + email exports with deep links
- Songline perspective creation (audio clips for shared nodes)

## Directory Structure

```
conversational-copilot/
├── store/
│   └── slice.ts              # Zustand state slice (copilot mode state)
├── services/
│   ├── transcription-service.ts       # Markdown monitoring, semantic search
│   ├── conversation-recording-service.ts  # DreamNode invocation tracking
│   ├── conversation-summary-service.ts    # Claude API integration
│   ├── email-export-service.ts           # Apple Mail draft generation
│   ├── pdf-generator-service.ts          # PDF document creation
│   └── llm-provider.ts                   # LLM provider abstraction
├── utils/
│   └── open-node-content.ts  # Node content opening logic
├── commands.ts               # Command palette registration
├── CopilotModeOverlay.tsx    # Minimal React component (architectural consistency)
└── README.md                 # This file
```

## Main Exports

### Commands
```typescript
registerConversationalCopilotCommands(plugin, uiService) // Called from main.ts
```

### State Management
```typescript
copilotMode: {
  isActive: boolean
  conversationPartner: DreamNode | null
  sharedNodeIds: string[] // Tracked invocations
  frozenSearchResults: DreamNode[] // Snapshot for Option key
}
```

### Services (Singleton Pattern)
```typescript
getTranscriptionService()           // Markdown monitoring + semantic search
getConversationRecordingService()   // Invocation tracking
getConversationSummaryService()     // AI summary generation
getEmailExportService()             // Apple Mail + PDF creation
getPDFGeneratorService()            // PDF document generation
```

## Integration Points

- **Python Transcription**: `/src/features/realtime-transcription` (Whisper model, audio recording)
- **Semantic Search**: `/src/features/semantic-search` (opposite-type node search, 35 results max)
- **Songline**: `/src/features/songline` (audio trimming, perspective creation with clips)
- **GitHub Publishing**: `/src/features/github-publishing` (share link generation, Radicle delegation)
- **URI Handler**: `/src/features/uri-handler` (batch node links, install script URIs)

## Workflow

1. **Start**: Select dreamer node → "Start Conversation Mode"
   - Creates transcript file in `DreamNode/conversations/`
   - Starts Python Whisper transcription + audio recording
   - Pre-populates search results with conversation partner's related nodes
   - Hides Obsidian ribbon for cleaner video interface

2. **During Call**:
   - Transcription appears in markdown file (real-time)
   - Semantic search runs every 5s on last 500 chars
   - User clicks DreamNodes to "invoke" (shares in conversation)
   - Invocations embedded as markers: `[MM:SS] 🔮 Invoked: NodeName`

3. **End**: "End Conversation Mode"
   - Stops transcription (preserves file)
   - Claude AI generates summary + clip suggestions
   - Creates PDF with DreamNode images + deep links
   - Opens Apple Mail draft with PDF attachment
   - Creates Songline perspectives (trimmed audio clips)
   - Persists bidirectional relationships to disk
   - Restores Obsidian ribbon

## Flags

### Working Well
- End-to-end workflow tested and functional
- AI summaries coherent and useful (Claude Haiku)
- PDF generation beautiful (black theme, clickable images)
- Bidirectional relationship tracking solid
- Songline integration smooth (audio clips + perspectives)

### Known Limitations
- **macOS Only**: AppleScript for Apple Mail (no cross-platform email yet)
- **Python Dependency**: Requires Whisper transcription service running
- **Claude API Required**: No AI summary fallback if API key missing (graceful degradation in place)
- **No OpenRouter**: LLM provider abstraction exists but only Claude implemented

### Prerequisites
- **Radicle Authentication**: Email export requires Radicle authentication. Before using the conversational copilot feature, run:
  ```bash
  rad auth
  ```
  This registers your SSH key with ssh-agent, enabling Radicle identity operations for email delegation and share link generation. Without this, the email export may fail with authentication errors.

### Technical Debt
- CopilotModeOverlay.tsx is essentially unused (returns null)
- transcription-service.ts has extensive unused pane resizing code (workspace split logic disabled)
- Some console.log verbosity could be reduced for production
- Window focus listeners somewhat fragile (Electron windowed mode issues)

## Architecture Notes

- **Service Layer Pattern**: All business logic in singleton services (testable, mockable)
- **Zustand State Management**: Copilot mode state integrated with core store
- **Event-Driven**: File monitoring via Obsidian Vault events
- **Throttling**: 5-second cooldown on semantic search (prevents API spam)
- **FIFO Buffer**: Last 500 chars of transcript for search (balances recency vs context)
- **Graceful Degradation**: Works without API key (basic email with no AI summary)
