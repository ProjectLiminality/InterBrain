# Songline Feature

**Purpose**: Living definitions through conversation audio clips - capture organic explanations of DreamNodes from real conversations.

## Core Concept

Instead of static text definitions, Songlines preserve authentic voice and context by extracting audio clips from conversations that define/describe DreamNodes. Each "perspective" is a sovereign audio clip stored directly in the DreamNode's repository.

## Directory Structure

```
songline/
├── services/                           # Service layer
│   ├── perspective-service.ts          # Manages perspectives.json files
│   ├── conversations-service.ts        # Manages conversation history
│   ├── audio-recording-service.ts      # Recording path coordination
│   └── audio-trimming-service.ts       # ffmpeg integration for clip extraction
├── components/                         # React components
│   ├── PerspectivesSection.tsx         # Perspectives collection UI
│   ├── AudioClipPlayer.tsx             # Individual clip playback
│   └── ConversationsSection.tsx        # Full conversation history UI
├── index.ts                            # Barrel export
└── README.md                           # This file
```

## Main Exports

### Services
- `PerspectiveService` - Read/write perspectives, timestamp conversion utilities
- `ConversationsService` - Load conversations and transcripts with caching
- `AudioRecordingService` - Path generation and directory management for recordings
- `AudioTrimmingService` - ffmpeg wrapper for temporal slicing

### Components
- `PerspectivesSection` - Displays collection of perspective audio clips
- `AudioClipPlayer` - Playback UI with transcript toggle
- `ConversationsSection` - Full conversation history with lazy loading

## Data Structure

### Dream Nodes (Ideas)
```
DreamNode/
├── .udd                    # UUID, title, type, dreamTalk, relationships
├── perspectives.json       # Perspectives from conversations about this idea
└── perspectives/           # Trimmed audio clips (sovereign storage)
    └── {peer}~{me}-{timestamp}.mp3
```

### Dreamer Nodes (People)
```
DreamerNode/
├── .udd                    # UUID, name, type, contact info
└── conversations/          # Full conversation recordings
    ├── conversation-{date}-{time}.mp3   # Full audio recording
    └── transcript-{date}-{time}.md      # Whisper transcription
```

### Storage Philosophy
- **Full recordings** stored in the **DreamerNode** (who you talked to)
- **Trimmed clips** stored in the **DreamNode** (what you talked about)
- Each perspective clip is sovereign - physically trimmed, not temporally masked

## Architecture Notes

- **Sovereign Storage**: Each perspective clip is physically trimmed and stored directly in the relevant DreamNode's repository
- **Temporal Slicing**: Uses ffmpeg to create independent audio files (not temporal masking)
- **Lazy Loading**: Perspectives only load when node is selected in liminal-web layout
- **Caching**: Services implement in-memory caching to avoid redundant file I/O
- **Singleton Pattern**: All services use singleton instances initialized at plugin startup
