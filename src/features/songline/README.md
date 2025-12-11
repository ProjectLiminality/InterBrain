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

```
DreamNode/
├── .udd (contains perspectives array)
├── conversations/
│   ├── conversation-{timestamp}.mp3  # Full recordings
│   └── {speaker}~{speaker}-{timestamp}.mp3  # Trimmed clips
└── perspectives.json  # Legacy - being phased out in favor of .udd
```

## Architecture Notes

- **Sovereign Storage**: Each perspective is fully contained within relevant DreamNode's repo (no external references)
- **Temporal Slicing**: Uses ffmpeg to physically trim audio files instead of temporal masking
- **Lazy Loading**: Conversations/perspectives only load when node is selected in liminal-web layout
- **Caching**: Both services implement in-memory caching to avoid redundant file I/O
- **Singleton Pattern**: All services use singleton instances initialized at plugin startup

## Migration Note

Legacy `perspectives.json` format is being phased out in favor of storing perspectives directly in `.udd` file's perspectives array.
