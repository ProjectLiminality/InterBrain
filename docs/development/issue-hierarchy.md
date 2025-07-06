# InterBrain Issue Hierarchy & Relationships

## Visual Structure

```
🎯 Epic #1: Plugin Infrastructure
├── 📋 Spec #101: Technical Architecture
│   ├── 🔨 Feature #201: Plugin boilerplate
│   │   ├── ✅ Task #301: Setup environment
│   │   └── ✅ Task #302: Configure esbuild
│   └── 🔨 Feature #202: Modular architecture  
│       ├── ✅ Task #303: TypeScript interfaces
│       └── ✅ Task #304: Proof-of-concept

🎯 Epic #2: 3D Spatial Visualization
├── 📋 Spec #102: Spatial Algorithms
│   ├── 🔨 Feature #203: R3F integration
│   │   └── ✅ Task #305: Obsidian view setup
│   ├── 🔨 Feature #204: Fibonacci sphere
│   │   └── ✅ Task #306: Algorithm implementation
│   ├── 🔨 Feature #205: Honeycomb layout
│   │   └── ✅ Task #307: Hexagonal math
│   └── 🔨 Feature #206: Dynamic scaling
│       └── ✅ Task #308: Distance calculations

🎯 Epic #3: DreamNode Management
├── 📋 Spec #103: Lifecycle & Creation
│   ├── 🔨 Feature #207: Command+N panel
│   │   └── ✅ Task #309: Modal UI
│   ├── 🔨 Feature #208: Drag-and-drop
│   │   └── ✅ Task #310: Drop handlers
│   ├── 🔨 Feature #209: DreamTalk component
│   │   └── ✅ Task #311: Media renderer
│   └── 🔨 Feature #210: Canvas integration
│       └── ✅ Task #312: Canvas parser

🎯 Epic #4: Git Operations
├── 📋 Spec #104: Abstraction Layer
│   ├── 🔨 Feature #211: Git wrapper
│   │   └── ✅ Task #313: Shell commands
│   ├── 🔨 Feature #212: Error handling
│   │   └── ✅ Task #314: Friendly messages
│   └── 🔨 Feature #213: Time Machine
│       └── ✅ Task #315: History UI

🎯 Epic #5: Semantic Search
└── 📋 Spec #105: Search Architecture
    └── 🔨 Feature #214: Search implementation
        └── ✅ Task #316: USE integration

🎯 Epic #6: DreamWalk Video
├── 📋 Spec #106: WebRTC & Transcription
│   ├── 🔨 Feature #215: Video chat
│   │   └── ✅ Task #317: WebRTC setup
│   ├── 🔨 Feature #216: P2P networking
│   │   └── ✅ Task #318: Protocol design
│   ├── 🔨 Feature #217: Transcription
│   │   └── ✅ Task #319: Whisper integration
│   └── 🔨 Feature #218: Songlines
│       └── ✅ Task #320: Clip generation

🎯 Epic #7: Coherence Beacon
└── 📋 Spec #107: Radicle Integration
    ├── 🔨 Feature #219: Beacon triggers
    │   └── ✅ Task #321: Git hooks
    └── 🔨 Feature #220: Inbox UI
        └── ✅ Task #322: Queue interface

🎯 Epic #8: DreamOS Foundational Operations
└── 📋 Spec #108: DreamOS Operations
    ├── 🔨 Feature #221: Pop-out operation
    │   ├── ✅ Task #323: Pop-out algorithm
    │   └── ✅ Task #324: Pop-out UI
    ├── 🔨 Feature #222: Merge operation
    │   ├── ✅ Task #325: Merge logic
    │   └── ✅ Task #326: Merge UI
    └── 🔨 Feature #223: Process/Substance categorization
        └── ✅ Task #327: Categorization system

🎯 Epic #9: Shamanic Onboarding Experience
└── 📋 Spec #109: Onboarding Experience
    ├── 🔨 Feature #224: Introduction video system
    │   ├── ✅ Task #328: Video player
    │   └── ✅ Task #329: Video creation tools
    ├── 🔨 Feature #225: Tutorial flow engine
    │   └── ✅ Task #330: Tutorial engine
    └── 🔨 Feature #226: Heart-based invitation system
        └── ✅ Task #331: Invitation system

🎯 Epic #10: Testing & Quality Infrastructure
└── 📋 Spec #110: Testing & Distribution
    ├── 🔨 Feature #227: 3D testing framework
    │   └── ✅ Task #332: Testing framework
    ├── 🔨 Feature #228: Plugin distribution
    │   └── ✅ Task #333: Distribution pipeline
    └── 🔨 Feature #229: Auto-update mechanism
        └── ✅ Task #334: Update system

🎯 Epic #11: Relationship Buffer System
└── 📋 Spec #111: Relationship Buffer
    ├── 🔨 Feature #230: Queue management
    │   ├── ✅ Task #335: Queue data structure
    │   └── ✅ Task #336: Buffer UI
    └── 🔨 Feature #231: Surprise mechanics
        └── ✅ Task #337: Surprise implementation

🎯 Epic #12: AI Integration & Self-Healing
└── 📋 Spec #112: AI Integration
    ├── 🔨 Feature #232: Bug fixing pipeline
    │   ├── ✅ Task #338: GitHub integration
    │   └── ✅ Task #339: Error analysis pipeline
    └── 🔨 Feature #233: Conversational copilot
        └── ✅ Task #340: Copilot implementation
```

## Dependency Flow

### Critical Path (Must Complete First):
1. **Epic #1** → Foundation for everything
2. **Epic #3** → Core DreamNode operations  
3. **Epic #4** → Git backing for all features

### Parallel Development Possible:
- **Epic #2** (Visualization) 
- **Epic #5** (Search)
- **Epic #6** (Video)
- **Epic #7** (Beacon)
- **Epic #9** (Onboarding - can develop alongside core)
- **Epic #10** (Testing - develops with features)
- **Epic #11** (Relationship Buffer)
- **Epic #12** (AI Integration)

### Feature Dependencies:
- Feature #210 (Canvas) depends on → Feature #209 (DreamTalk)
- Feature #219 (Beacon) depends on → Feature #211 (Git wrapper)
- Feature #217 (Transcription) depends on → Feature #215 (Video)
- Feature #221 (Pop-out) depends on → Feature #211 (Git wrapper)
- Feature #222 (Merge) depends on → Feature #211 (Git wrapper)
- Feature #232 (Bug fixing) depends on → Feature #211 (Git wrapper)
- Feature #233 (Copilot) depends on → Feature #217 (Transcription)

## Updated Implementation Waves (2025)

### Wave 1: Foundation (Month 1) - Full Detail Ready 🌊1
- **Epic #1**: Plugin Infrastructure (Ready for implementation)
- **Epic #2**: 3D Spatial Visualization (Algorithms proven)
- **Epic #3**: DreamNode Management (Core workflows defined)
- **Epic #4**: Git Operations Abstraction (Error handling complete)

### Wave 2: Core Features (Month 2) - Structural Placeholders 🌊2
- **Epic #5**: Semantic Search System (Framework defined)
- **Epic #6**: DreamWalk Video System (Partial - basics in Wave 2)

### Wave 3: Advanced Features (Month 3) - High-Level Structure 🌊3
- **Epic #6**: Complete DreamWalk functionality
- **Epic #7**: Coherence Beacon System
- **Epic #8**: DreamOS Foundational Operations
- **Epic #11**: Relationship Buffer System
- **Epic #12**: AI Integration & Self-Healing

### Wave 4: Polish & Launch (Beyond Month 3) - Vision Level 🌊4
- **Epic #9**: Shamanic Onboarding Experience
- **Epic #10**: Testing & Quality Infrastructure

## Updated Final Count (January 2025)

- **12 Epics** (comprehensive vision coverage)
- **12 Specifications** (detailed design documents)
- **33 Features** (implementation chunks)
- **106 Tasks** (atomic work items including testing & documentation)

**Total: 163 organized development items** with full parent-child relationships and dependency mapping.

### Professional Development Integration ✅
- **Testing Integration**: Every Feature includes "Write unit tests" task
- **Documentation Integration**: Every Feature includes "Update documentation" task
- **Wave-Based Detail**: Wave 1 ready for full specification, later waves have structural placeholders
- **GitHub Templates**: Complete issue template system in `.github/ISSUE_TEMPLATE/`

## GitHub Issue Creation Strategy

### Phase 1: Wave 1 Full Detail (Immediate)
1. **Create Wave 1 Epics** (#1-4) with comprehensive detail
2. **Create Wave 1 Specs** (#101-104) with full architectural detail
3. **Create Wave 1 Features** with complete implementation plans
4. **Create Wave 1 Tasks** with specific work descriptions

### Phase 2: Later Waves Structural (As Needed)
1. **Create Wave 2+ Epics** with vision-level detail
2. **Create Wave 2+ Specs** as structural placeholders
3. **Detail during specification waves** as implementation approaches
4. **Maintain flexibility** for emergent requirements

### GitHub Template Usage
- **Epic Template**: `.github/ISSUE_TEMPLATE/epic.yml` - High-level vision
- **Specification Template**: `.github/ISSUE_TEMPLATE/specification.yml` - Technical design
- **Feature Template**: `.github/ISSUE_TEMPLATE/feature.yml` - Implementation chunks
- **Task Template**: `.github/ISSUE_TEMPLATE/task.yml` - Atomic work units

This ensures proper parent-child linking while maintaining the wave-like development philosophy of emergent detail.