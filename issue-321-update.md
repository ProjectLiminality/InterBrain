## Description

Create a unified editing interface that integrates the existing ProtoNode creation system with relationship editing capabilities in the focused view. This provides a single, consistent interface for editing all DreamNode metadata including relationships, accessible when a node is centered in the liminal web layout.

**EPIC 4 CONTINUATION - POST EPIC 5 INTEGRATION**
Now that Epic 5's semantic search system is complete, this feature integrates semantic search capabilities for intelligent relationship discovery and management.

## User Experience

**Edit Mode Activation**:
- Available when any DreamNode is centered in focused view
- Triggered via keyboard shortcut, context menu, or UI affordance
- Seamless transition from viewing to editing without layout disruption

**Unified Interface Elements**:
- **Metadata Editor**: Extend existing ProtoNode UI for title, type, DreamTalk
- **Relationship Editor**: Visual interface for adding/removing connections with semantic search integration
- **Real-time Preview**: Spatial layout updates as relationships change
- **Validation**: Leverage existing validation patterns from ProtoNode system

**Enhanced Relationship Editing Workflow with Semantic Search**:
1. Enter edit mode with node centered
2. Honeycomb layout shows existing relationships with gold glow indicators
3. Use semantic search to populate remaining honeycomb slots with opposite-type nodes
4. Click search results to toggle gold glow and establish relationships
5. Edit metadata using familiar ProtoNode interface
6. Preview changes in real-time spatial arrangement
7. Save/cancel with existing Epic 3 git workflow integration

## Technical Implementation

**Integration Points**:
- **ProtoNode System**: Extend existing creation UI for metadata editing
- **Focused Layout**: Use centered position as editing context
- **Service Layer**: Leverage Epic 3's DreamNodeService for persistence
- **Semantic Search**: Integrate Epic 5's semantic search with opposite-type filtering
- **Store Integration**: Extend creation state for relationship editing mode

**Key Components**:
- EditModeOverlay: UI component extending ProtoNode interface
- RelationshipEditor: Visual interface for connection management with semantic search
- EditModeOrchestrator: State management for edit mode lifecycle
- RelationshipValidator: Validation logic for relationship constraints
- SemanticSearchService: Extended with opposite-type filtering for relationship discovery

**State Management**:
- Extend creationState in Zustand store for edit mode
- Track original vs modified relationships for preview
- Handle edit mode lifecycle (enter/exit/save/cancel)
- Preserve undo/redo capability during editing
- Integrate with existing semantic search store slices

**Semantic Search Integration**:
- **Type Filtering**: Only show nodes of opposite type (Dream ↔ Dreamer)
- **Honeycomb Population**: Fill remaining slots with semantically relevant suggestions
- **Visual Distinction**: Gold glow for confirmed relationships, no glow for search results
- **Click-to-Toggle**: Transform search results into relationships via click interaction
- **Search Command**: "InterBrain: Search Related Nodes" for relationship discovery

## Acceptance Criteria

- [ ] Edit mode accessible when DreamNode is centered in focused view
- [ ] Unified interface for editing title, type, DreamTalk, and relationships
- [ ] Semantic search integration for opposite-type relationship discovery
- [ ] Visual relationship editing with add/remove capabilities via glow indicators
- [ ] Honeycomb layout population with semantic search results
- [ ] Click-to-toggle workflow for establishing relationships
- [ ] Real-time preview of spatial changes during relationship editing
- [ ] Integration with existing ProtoNode validation and error handling
- [ ] Save/cancel workflow using Epic 3's service layer architecture
- [ ] Bidirectional relationship persistence and synchronization
- [ ] Compatibility with both mock and real data modes
- [ ] Smooth transitions between view and edit modes
- [ ] Undo/redo support for relationship changes
- [ ] Type-change warning placeholder for relationship implications

## Dependencies

- **Parent specification**: #267 must be approved ✅
- **Epic 3 Foundation**: Service layer and ProtoNode system must be stable ✅
- **Epic 4 Spatial Foundation**: Features #316 and #320 merged to main ✅
- **Epic 5 Semantic Search**: Complete semantic search system required ✅

## Technical Notes

**Post-Epic 5 Implementation Priority**:
This feature represents the culmination of Epic 4, integrating spatial orchestration, relationship management, and semantic search into a unified editing experience. The semantic search integration enables intelligent relationship discovery while maintaining the focused spatial context.

**ProtoNode Integration Strategy**:
- Reuse existing validation logic and UI patterns
- Extend creation workflow for modification of existing nodes
- Maintain separation between creation and editing while sharing components
- Preserve Epic 3's git workflow patterns for metadata persistence
- Add edit mode context with pre-populated node data

**Semantic Search Enhancement**:
- Opposite-type filtering ensures Dream nodes only see Dreamer suggestions and vice versa
- Honeycomb layout integration provides spatial context for relationship decisions
- Click-based interaction model maintains consistency with spatial navigation patterns
- Real-time search population enhances relationship discovery workflow

## Definition of Done

- [ ] Implementation complete with unified editing interface
- [ ] Semantic search integration with opposite-type filtering functional
- [ ] Honeycomb relationship editing with glow indicators working
- [ ] All user interactions work as designed in focused view context
- [ ] Integration testing with existing ProtoNode and service layer systems
- [ ] Real data relationship editing functional and tested
- [ ] Bidirectional relationship persistence working correctly
- [ ] Performance meets expected thresholds for large relationship sets
- [ ] Code reviewed and merged to epic branch