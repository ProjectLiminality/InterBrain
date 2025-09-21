# Conversational Copilot Feature

Real-time transcription and semantic search system for conversation-driven knowledge discovery. This feature creates a distinct copilot mode that reuses existing edit mode infrastructure while providing a conversation-focused user experience.

## Architecture

### Code Reuse Strategy
- **Fork existing edit mode**: Reuses ~80% of edit mode infrastructure
- **Leverages relationship edit search**: Uses existing search field and honeycomb layout
- **Reuses proven animations**: Fly-in/out patterns from edit-search mode
- **Minimal new components**: Focus on transcription buffer and copilot-specific logic

### Core Components

#### Commands (`commands.ts`)
- **Start Conversation Mode**: Enter copilot from selected person in liminal-web
- **End Conversation Mode**: Exit copilot back to liminal-web
- **Toggle Copilot Search Field**: Debug command for search field visibility

#### Transcription Buffer (planned)
- 500-character FIFO buffer with Web Speech API integration
- 5-second debounced semantic search updates
- Manual dictation activation (Fn key twice)

#### Layout Integration (planned)
- Person node at center (static positioning like edit mode)
- Honeycomb search results around person
- Spacebar press-and-hold for show/hide results
- Reuses existing SpatialOrchestrator animations

## User Workflow

1. **Select person** in liminal-web mode (must be dreamer type)
2. **Run command**: "Start Conversation Mode"
3. **Auto-focus**: Search field ready for dictation input
4. **Start dictation**: User presses Fn key twice (macOS native)
5. **Real-time updates**: Search results update every 5 seconds when speech changes buffer
6. **View results**: Hold spacebar to show frozen snapshot of results
7. **Navigate**: Release spacebar to hide, click result to open DreamSong
8. **Exit**: Run "End Conversation Mode" or use escape key

## Integration Points

- **Store State**: Uses `copilotMode` state in Zustand store
- **Spatial Layout**: Extends SpatialOrchestrator with 'copilot' layout
- **Semantic Search**: Leverages existing semantic search service
- **Edit Mode Patterns**: Reuses search field, animations, and layout logic

## Development Features

- **Debug Toggle**: Show/hide search field for development/testing
- **Visual Indicators**: Listening status using Obsidian Notice system
- **Error Handling**: Graceful fallbacks for speech recognition failures

## Performance Targets

- **Search Latency**: <500ms consistently
- **Animation Performance**: 60fps during layout transitions
- **Buffer Updates**: 5-second debounced semantic search
- **Buffer Size**: 500 characters (FIFO rolling window)

## Future Extensions

- **Advanced Speech Recognition**: Explore automated dictation activation
- **Enhanced Visual Feedback**: Custom listening indicators
- **Search Result Filtering**: Person-specific relationship weighting
- **Export Functionality**: Save conversation transcripts as DreamNodes