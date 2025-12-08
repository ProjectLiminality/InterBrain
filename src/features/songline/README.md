# Songline Feature

**Purpose**: Living definitions through conversation audio clips - capture organic explanations of DreamNodes from real conversations.

## Core Concept

Instead of static text definitions, Songlines preserve authentic voice and context by extracting audio clips from conversations that define/describe DreamNodes. Each "perspective" is a sovereign audio clip stored directly in the DreamNode's repository.

## Key Files

### Services

- **`services/perspective-service.ts`** - Manages `perspectives.json` files (read/write perspectives, UUID generation, timestamp conversion)
- **`services/conversations-service.ts`** - Manages full conversation recordings and transcripts (loads from `conversations/` directories with caching)
- **`services/audio-recording-service.ts`** - Coordinates recording during conversations (generates output paths, ensures directories exist)
- **`services/audio-trimming-service.ts`** - Extracts sovereign clips from full conversations using ffmpeg (temporal slicing, not masking)

### Components

- **`components/PerspectivesSection.tsx`** - UI section displaying collection of perspectives for a DreamNode
- **`components/AudioClipPlayer.tsx`** - Playback UI for individual sovereign clips (play/pause, transcript toggle)
- **`components/ConversationsSection.tsx`** - UI section displaying full conversation history with lazy loading

### Exports

- **`index.ts`** - Central export file for all services and components

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
