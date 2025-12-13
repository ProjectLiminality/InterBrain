# Tutorial Design: Shamanic Onboarding

## Core Philosophy
**Depth over breadth. Slow is fast. Less is more.**

The tutorial is an interactive DreamSong teaching sacred relationship with living stories through the Liminal Web.

---

## Phase 0: Philosophical Primer (Pre-Entry)

**Duration**: 2-3 minutes max
**Music**: Maggot Brain by Funkadelic
**Medium**: Video (visual metaphors + narration)

**Narrative Arc**:
1. **The Problem**: Social media isolation despite connectivity — parasitic relationship with stories
2. **Indigenous Wisdom**: Stories are living beings (sacred knowledge forgotten)
3. **The Invitation**: Enter liminal space where stories are free, sovereign, anti-rivalrous
4. **The Posture**: Come as a guest. Be humble. Serve these beings with respect and gratitude.

**Final Frame**: Project Liminality logo on black background
- Logo tilts toward mouse cursor
- Text: "Click to enter liminal space"
- Click triggers portal animation through logo into DreamSpace

---

## Phase 1: Foundation - The Liminal Web

### Step 1.1: Anchor Point
**Visual**: InterBrain DreamNode at center (golden glow)
**Text**: "This is the InterBrain itself. All source code lives inside this DreamNode. Your home position — the space anchors here."

**Concepts Introduced**:
- DreamNodes = ideas (like InterBrain)
- DreamerNodes = people you care about
- This DreamNode anchors your entire space

### Step 1.2: First Relationship
**Prompt**: Create your first DreamerNode

**Flow**:
- If DreamerNode exists → click to select it
- If none → "Drag an image named after someone you care about"
- Golden dot guides attention to new DreamerNode

**Text**: "DreamerNodes represent people you have deep conversations with. Video calls where you explore ideas together."

### Step 1.3: Constellation Emerges
**Visual**: Selected DreamerNode shows related DreamNodes orbiting
**Golden dot**: Moves from InterBrain → edge → related DreamNode
**Text**: "Selecting a dreamer shows all ideas you share with them. Create DreamNodes for what connects you."

---

## Phase 2: Navigation - Existing Liminal Web

**Setup**: Vault pre-populated with Alice, Bob, Charlie + Circle, Square, Cylinder (already woven)

### Step 2.1: Dreamgazing
**Action**: Enter constellation view
**Visual**: Night sky of all nodes without weather (no relationships visible yet)
**Text**: "Constellation view — dreamgaze your entire vault at once."

### Step 2.2: Navigate Relationships
**Golden dot sequence**:
1. Click edge between Circle ↔ Square → invokes Cylinder DreamNode
2. Flip Cylinder to DreamSong side
3. Click media file in DreamSong → invokes Circle
4. Click another reference → invokes Square

**Text**: "References are living connections. Click edges. Click symbols in DreamSongs. Navigate through meaning."

---

## Phase 3: Creation - Your Liminal Web

### Step 3.1: Create DreamNodes
**Methods to demonstrate**:
- Drag image onto space (with DreamerNode selected)
- AI-generated DreamTalk symbol (text description → image)
- Search-to-DreamNode (drag artifact → search node → save as new)

**Text**: "DreamNodes are universal. Projects. Trips. Recipes. Media. Anything meaningful."

### Step 3.2: Edit DreamNodes
**Golden glow**: Highlights action buttons
- Flip to edit
- Add media to DreamTalk
- Edit DreamSong canvas
- Save changes

**AI Integration Teaser**: "Scribbly handwritten recipe? AI agent makes it presentable. (Feature preview)"

### Step 3.3: Semantic Search
**Demo**:
- Drag online artifact onto search node
- Shows closest existing DreamNodes
- Option A: Save as new DreamNode
- Option B: Add to existing close match

**Text**: "Search shows what already resonates with new discoveries."

---

## Phase 4: Dreamweaving - Constellations

### Step 4.1: Canvas Editing
**Golden dot**: Guides through Circle/Square/Cylinder example
**Actions**:
- Flip DreamNode to DreamSong
- Open canvas view
- Add references between nodes
- See constellation form

**Text**: "References create constellations. Weave stories into larger wholes."

---

## Phase 5: Collaboration - Peer-to-Peer

### Step 5.1: Radicle vs GitHub (DreamTalk Explainer)
**Medium**: Animated DreamTalk visuals (GIF/PNG/MP4)

**Key Metaphors**:
- **Radicle**: Liminal space collaboration layer — sovereign versions, invitation-based, transitive trust
- **GitHub**: Publishing layer — broadcast knowledge to internet (free with account)
- **Copyleft License**: Default for all DreamNodes (strongest resemblance to sane relationship with stories)

**Text**: "Stories increase when shared. Anti-rivalrous. Coherence emerges through resonance, not compromise."

### Step 5.2: Share Changes with Peers
**Demo** (if peer DID exists from invite):
1. Make change to shared DreamNode
2. Share with peer
3. Receive peer's changes
4. Merge or review

**Text**: "Updates flow through trust relationships. You see changes from direct peers only."

### Step 5.3: Publish DreamSong to GitHub
**Action**: One-click share to GitHub
**Text**: "Share knowledge freely. Stories belong to no one."

---

## Phase 6: Co-Pilot Mode - Video Calls

### Step 6.1: Simulated Call Flow
**Golden dot**: Guides through UI without actual call

**Actions**:
1. Select DreamerNode
2. Enter co-pilot mode
3. Navigate shared DreamNodes during "call"
4. Show how songlines auto-generate from session

**Text**: "Share your screen. Navigate ideas together. Songlines capture your conversation's topology."

### Step 6.2: The Gift
**Final Invitation**:

"Who are the 1-3 people truly meaningful in your life?
What 1-3 ideas mediate your relationship to them?

Create representations. Give them a call.
Show them what they mean to you.
Share these DreamNodes.

They'll receive an install link — your representation + shared ideas already cloned.

The InterBrain spreads through gratitude and kindness.
Pass on the gift of appreciation."

---

## Implementation Components

### Visual Language
- **Golden glow**: Attention steering (3Blue1Brown style)
- **Golden dot**: Travels between UI elements, emerges from behind nodes
- **ManimText**: 3D space text (already implemented)
- **DreamTalk visuals**: Animated metaphors for abstract concepts
- **Music**: Maggot brain (Phase 0 only)

### Tutorial System Architecture
- **Full flow**: Triggered on first launch (localStorage flag)
- **Restart**: Settings panel option
- **Modular segments**: Each feature has mini-tutorial (re-triggerable)
- **Dummy vault**: Alice/Bob/Charlie + Circle/Square/Cylinder pre-populated
- **User freedom**: Delete placeholder nodes, populate with real relationships

### Feature Coverage (Epic Order)
1. ✅ Liminal Web basics (DreamNodes, DreamerNodes, relationships)
2. ✅ Constellation view
3. ✅ DreamNode creation methods
4. ✅ Semantic search
5. ✅ Dreamweaving (canvas editing)
6. ✅ Co-pilot mode
7. ✅ Radicle/GitHub collaboration
8. 🔮 AI integration (teaser for future)

---

## Open Questions

1. **Single vs Multi-Phase Tutorial?**
   - Option A: One seamless flow (liminal web → dreamweaving → collaboration)
   - Option B: "Soft" intro (liminal web basics) + "Advanced" mode (dreamweaving/collaboration)
   - **Decision pending**: Let implementation reveal natural breakpoints

2. **AI Integration Timing**
   - Placeholder for DreamTalk generation + agent-assisted editing
   - Show early or save for advanced tutorial?

3. **Networking Demo Feasibility**
   - Requires peer DID from invite flow
   - Fallback if no peer available?

---

## Next Steps

1. Create Phase 0 video (maggot brain philosophical primer)
2. Build golden glow system (UI element highlighter + traveling dot)
3. Implement DreamTalk visual explainers (Radicle/GitHub metaphors)
4. Set up dummy vault template (Alice/Bob/Charlie seed data)
5. Expand TutorialService with full step sequence
6. Map tutorial phases to modular segments (for re-triggering)
