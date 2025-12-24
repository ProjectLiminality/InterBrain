# Tutorial MVP: Quick Start Onboarding

## Purpose

Minimal viable tutorial for private beta. Delivers foundational concepts clearly and beautifully without the full shamanic immersion of the comprehensive vision. Think "elegant demo" rather than "transformative journey."

**Scope**: Everything except Songlines. Based on live demo flow that successfully introduced InterBrain in ~5 minutes.

---

## Visual Toolkit

Three decoupled primitives (can be synchronized but not coupled):

1. **ManimText** - 3D text that fades in/out in space
2. **GoldenDot** - Attention-steering animated dot (Bezier curves through 3D)
3. **GoldenGlow** - Unified hover/focus highlight on UI elements

---

## Tutorial Flow

### Segment 1: Anchor Point

**Start State**: InterBrain DreamNode at center (liminal-web view)

**Narration** (ManimText):
> "This blue circle is the InterBrain looking at itself."
> "It anchors your DreamSpace."

**Visual**:
- GoldenGlow pulses on InterBrain node
- GoldenDot circles the node once

**Concept**: DreamNode = idea (blue border)

---

### Segment 2: Dreamer Nodes

**Action**: Click through to show connected DreamerNodes

**Narration**:
> "Red circles are Dreamers - people you care about."

**Visual**:
- GoldenDot travels from InterBrain → edge → DreamerNode
- GoldenGlow on DreamerNode

**Concept**: DreamerNode = person (red border), edges = shared relationships

---

### Segment 3: DreamTalk Symbol

**Action**: Show DreamTalk side of InterBrain node (logo visible)

**Narration**:
> "Every DreamNode has a DreamTalk - a symbolic representation."
> "This is the InterBrain's logo."

**Visual**:
- Node flips to DreamTalk side
- GoldenGlow on the symbol

**Concept**: DreamTalk = thumbnail/symbol representing the idea

---

### Segment 4: Navigate the Web

**Action**: Click through existing liminal web (pre-populated nodes)

**Narration**:
> "Click any node to explore its connections."
> "Navigate through meaning."

**Visual**:
- GoldenDot traces path through 2-3 node transitions
- Show ring layout with related nodes

**Concept**: Liminal web = self-organizing knowledge graph

---

### Segment 5: DreamSong Canvas

**Action**: Flip node to DreamSong side, show canvas

**Narration**:
> "The other side is the DreamSong."
> "A canvas where you weave references to other ideas."

**Visual**:
- Node flips to DreamSong side
- GoldenDot points to embedded references

**Concept**: DreamSong = detailed explanation with references (Obsidian canvas)

---

### Segment 6: Edit Canvas

**Action**: Enter canvas edit mode

**Narration**:
> "Edit the canvas to add new connections."

**Visual**:
- Show canvas with existing nodes
- GoldenGlow on editable elements

**Concept**: Canvas editing = manual relationship building

---

### Segment 7: Add Relationships

**Action**: Add DreamerNode to DreamNode's liminal web

**Narration**:
> "Connect people to ideas they share."

**Visual**:
- GoldenDot guides to relationship editor
- Show toggle interaction
- Edge appears between nodes

**Concept**: Relationships are bidirectional (Dream ↔ Dreamer)

---

### Segment 8: Create New Node

**Action**: Create a new DreamNode

**Narration**:
> "Create new ideas by dragging images into space."
> "Or use the search node."

**Visual**:
- GoldenGlow on creation zone or search node
- New node appears with DreamTalk

**Concept**: DreamNodes can be created multiple ways

---

### Segment 9: Weave References

**Action**: Add references to DreamSong canvas

**Narration**:
> "Weave other DreamTalks into your DreamSong."
> "These become navigable connections."

**Visual**:
- Show adding a reference in canvas
- GoldenDot traces: DreamSong reference → invokes that DreamNode

**Concept**: References in canvas = edges in liminal web

---

### Segment 10: Co-Pilot Mode

**Action**: Enter co-pilot mode with DreamerNode

**Narration**:
> "Video call a Dreamer."
> "Navigate ideas together while you talk."

**Visual**:
- GoldenGlow on video call button
- Show co-pilot interface
- Transcription preview

**Concept**: Co-pilot = shared navigation during video calls

---

### Segment 11: The Invitation

**Narration** (final):
> "Who are 1-3 people meaningful to you?"
> "What ideas connect you to them?"
> "Create. Call. Share."
> "Pass on the gift."

**Visual**:
- Fade to constellation view
- All nodes visible as night sky

---

## Pre-Populated Demo Vault

Nodes needed for tutorial:
- **InterBrain** (Dream) - anchor point, has logo DreamTalk
- **Alice** (Dreamer) - example person
- **Bob** (Dreamer) - example person
- **Circle** (Dream) - simple shape idea
- **Square** (Dream) - simple shape idea
- **Cylinder** (Dream) - composite idea with Circle+Square woven in DreamSong

Relationships:
- InterBrain ↔ Alice, Bob
- Circle ↔ Alice
- Square ↔ Bob
- Cylinder ↔ Circle, Square (demonstrated in DreamSong weaving)

---

## Implementation Notes

### What's Included (MVP)
- Liminal web navigation
- DreamNode/DreamerNode distinction
- DreamTalk/DreamSong duality
- Relationship editing
- Node creation
- Canvas editing
- Co-pilot mode (brief)

### What's Deferred (Full Vision)
- Phase 0 philosophical video (Maggot Brain)
- Radicle vs GitHub explainer
- Semantic search deep dive
- Songlines
- AI integration preview
- Peer sharing demo

### Timing
- Target: ~3-5 minutes total
- Each segment: 15-30 seconds
- User can skip/replay segments

---

## Open Questions

1. **Interactivity level**: Does user perform actions, or watch guided demo?
   - Option A: Fully guided (golden dot shows, text explains)
   - Option B: Semi-interactive (user clicks when prompted)
   - Option C: Hybrid (some segments guided, some interactive)

2. **Skip/replay**: Per-segment or whole tutorial?

3. **Trigger**: First launch only, or available from settings?

---

## Relationship to Full Vision

This MVP covers **Phases 1-2 and partial Phase 6** of `TUTORIAL_VISION_FULL.md`:
- Phase 1: Foundation (Segments 1-5)
- Phase 2: Navigation (Segments 4-6)
- Phase 6: Co-Pilot (Segment 10)

The full vision adds:
- Phase 0: Philosophical primer video
- Phase 3: Deep creation workflows
- Phase 4: Dreamweaving details
- Phase 5: Collaboration/sharing
