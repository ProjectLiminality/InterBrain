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

## Key Files

### Commands & State
- **commands.ts** - Command palette registration (`start-conversation-mode`, `end-conversation-mode`)
- **copilot-slice.ts** - Zustand state slice (copilot mode state, bidirectional relationship tracking)
- **CopilotModeOverlay.tsx** - Minimal React component (mostly empty, exists for consistency)

### Services
- **transcription-service.ts** - Markdown file monitoring, semantic search triggering (500-char FIFO buffer, 5s throttle)
- **conversation-recording-service.ts** - Tracks DreamNode invocations, embeds markers in transcript
- **conversation-summary-service.ts** - Claude API integration for AI summaries + clip suggestions
- **email-export-service.ts** - Generates Apple Mail drafts with PDFs, deep links, install scripts
- **pdf-generator-service.ts** - Creates beautiful black-themed PDFs with clickable DreamNode images
- **llm-provider.ts** - Provider abstraction layer (Claude Haiku, future OpenRouter support)

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
