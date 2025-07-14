# UX/UI Specifications

This document contains detailed user experience specifications and interaction flows for the InterBrain system.

## Core Interaction Flow

### Initial Constellation View

- Camera positioned at origin of 3D space
- DreamNodes arranged on Fibonacci sphere (night sky appearance)
- Distance-based scaling: nodes scale from points at edges to ~1/5 screen height when centered
- Smooth scaling based on distance from center of field of view
- Color coding: Dreams (blue, abstract ideas) vs Dreamers (red, people)

### Node Selection & Liminal Web

1. Click any DreamNode → smooth animation to center position
2. Camera resets to fixed distance facing selected node
3. **Related nodes** → inner circle arrangement (equidistant placement)
4. **Unrelated nodes** → outer circle (outside field of view)
5. **Liminal Web Logic**: 
   - Click Dream → shows related Dreamers (people who share this idea)
   - Click Dreamer → shows related Dreams (ideas shared with this person)

### DreamNode Flip Interaction

- Hover over centered node → flip arrows appear at bottom
- Smooth Y-axis rotation between DreamTalk (front) and DreamSong (back)
- DreamSong side: fully interactive scrollable content on circular surface
- Hover → fullscreen button appears
- Fullscreen → opens new Obsidian tab with complete DreamSong view

### Navigation

- Escape key → return to constellation view (smooth animation back to Fibonacci sphere)
- Future setting: option to randomize positions vs return to original constellation

## Search Functionality

### Search Activation

- Command+F → opens custom search overlay within DreamSpace
- Search bar appears at center-top of 3D view

### Real-time Semantic Search

- Universal Sentence Encoder running locally (Apple Silicon optimized)
- Real-time updates as user types
- Shared backend pipeline for both UI search and conversational copilot
- Search scope (progressive expansion):
  1. **Phase 1**: DreamNode folder names only
  2. **Phase 2**: Include README content (condensed)
  3. **Phase 3**: Multi-modal (image search, symbol semantic matching)

### Search Results Layout

- Relevant nodes → honeycomb pattern arrangement
- Irrelevant nodes → distant circle (outside view)
- Maintain color coding (Dreams blue, Dreamers red)
- Future: filtering options (Dreams only, Dreamers only)
- Escape → return to constellation view

### Conversational Copilot Integration

- Context buffer tracks conversation keywords (≤10 words)
- Automatically updates search query based on real-time transcription
- Uses same semantic search backend (hidden UI component)
- Surfaces relevant DreamNodes during conversation without interruption

## DreamNode Creation Workflows

### Method 1: Command+N Panel

- **Trigger**: Command+N keyboard shortcut
- **Fields**: Name, Type (Dream/Dreamer), DreamTalk media file, Related nodes
- **Related Nodes**: Dropdown with type-to-filter from existing DreamNodes
- **Instant Creation**: Creates git repo + commits metadata + files

### Method 2: Drag & Drop

- **Default Behavior**: Drag file → create Dream-type DreamNode
- **File Name**: Inferred from dropped file (e.g., "vector-equilibrium.png")
- **DreamTalk Symbol**: Dropped file becomes the symbol
- **Enhanced Flow**: Command+Drag opens creation panel with pre-filled data

### DreamTalk Symbol Detection

- **Naming Convention**: Symbol files must match DreamNode folder name
- **File Type Hierarchy**: GIF preferred over PNG, etc.
- **Multiple Symbols**: Carousel component for cycling through variants
- **Multiple DreamSongs**: Carousel for different perspectives on same idea

## Video Calling & DreamWalk Features

### Call Initiation

- **Campfire Button**: Appears on hover over Dreamer nodes (indigenous metaphor)
- **Trust-Based Network**: Calls among known peers, not strangers

### Real-Time Transcription & Context Buffer

- **Continuous Transcription**: Local models processing speech
- **Keyword Extraction**: ML model identifies information-dense keywords
- **Context Buffer**: Rolling window of ~10 relevant keywords
- **Duplicate Handling**: Move repeated keywords to front vs append

### Manual Sharing System

**User-Controlled Flow**:
- **Space Bar Trigger**: User prompts system when wanting to reference something
- **Honeycomb UI**: Most relevant nodes appear in familiar search layout
- **No Interruption**: System never interrupts conversation flow
- **Signal Over Noise**: 3-5 high-quality shares vs 100 adjacent suggestions

### Relationship Buffer System

**Queued Sharing Architecture**:
- **Relationship-Specific Buffers**: Each Dreamer connection maintains its own queue of DreamNodes to share
- **Buffer Fullness Indicator**: Visual signal when enough content is queued for a meaningful conversation
- **Temporal Coordination**: Share DreamNodes at optimal moments rather than immediately
- **Surprise Planning Workflow**: Queue content for future reveal (birthdays, gifts, projects)
- **Collaborative Transition**: Recipients become collaborators after surprise is revealed

**Core Use Cases**:
- **Gift Coordination**: Create surprise birthday collages with multiple collaborators, reveal to recipient on their birthday
- **Project Planning**: Build up context for complex discussions before initiating the conversation
- **Relationship Maintenance**: Queue interesting content to share during next natural conversation
- **Context-Rich Sharing**: Deliver multiple related items in one focused exchange

**Technical Implementation**:
- **Per-Relationship Queues**: Each Dreamer node maintains a buffer of pending DreamNodes to share
- **Queue Visualization**: UI shows buffer fullness and content preview for each relationship
- **Timing Controls**: Manual trigger for sharing buffered content during video calls
- **Surprise Mechanics**: Special handling for content that shouldn't be visible to specific recipients until reveal

### Songlines Generation

- **Timestamp Capture**: Record when DreamNode was shared
- **LLM Clip Generation**: Analyze surrounding conversation for coherent context
- **Fuzzy Boundaries**: Handle cases where explanation comes before/after sharing
- **Automatic Attachment**: Clips become part of DreamNode's story

**DreamWalk Philosophy**: Conversations as walking through each other's dream gardens, explicitly encountering and sharing specific nodes with full context.

## Staging Area & Sharing System

### Inbox/Preview System

**Shared Purpose**: Used for both DreamWalk sharing and Coherence Beacon notifications

**Preview-Only Approach**:
- Only DreamTalk symbol transmitted initially (security + efficiency)
- Full context: who shared, when, conversation clip reference
- Accept/Reject interface for each shared node
- Clone only happens after explicit acceptance

**Security Philosophy**:
- Trust-based network among friends/family
- Industry-standard security without paranoia
- Preview before clone prevents malicious code execution

### Post-Call Workflow

1. **Loading Dock**: Inbox shows nodes shared during conversation
2. **Context Preservation**: Links to conversation clips (Songlines)
3. **Selective Cloning**: User chooses which nodes to add to dream garden
4. **Direct Integration**: Accepted nodes clone directly to dream garden root

## Technical Architecture

### Local-First Design

- Universal Sentence Encoder: local inference on Apple Silicon
- Real-time transcription: local models
- macOS restriction: Radical networking layer requirement
- Target: M1+ chips with sufficient unified memory
- Fallback: API solutions for less performant machines

### Platform Integration

- Obsidian Plugin API with TypeScript
- Custom "dreamspace" view type registration
- Access via ribbon icon + command palette ("Open DreamSpace")
- Git operations via shell commands
- File system access through Obsidian Vault API
- Canvas integration: leverage existing .canvas file parsing

### Performance Considerations

- Selective node spawning/despawning for large dream gardens
- Efficient dynamic scaling based on viewport
- Smooth animations using animation libraries
- Offline-capable operation (works without internet)