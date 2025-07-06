# Interbrain MVP – 3-Month Roadmap

---

## 🟢 Month 1: Core Migration & Infrastructure Setup

### 🎯 Milestone 1: Port Existing Functionality to Obsidian
- Migrate front end from standalone Electron app to Obsidian plugin.
- Reimplement IPC handlers for Git-based DreamNode operations.
- Enable creation/modification of DreamNodes (as Git repositories) inside Obsidian.
- Implement basic UI for managing DreamNodes.

### 🎯 Milestone 2: Git & Radical Integration (Initial)
- Rework Git commands to function natively within the Obsidian plugin.
- Integrate Radical for peer-to-peer sync and collaboration.
- Implement basic DreamNode push/pull behavior using Radical.

### 🎯 Milestone 3: UX Foundation & Initial Testing
- Ensure stability of DreamNode creation and interaction.
- Conduct preliminary UX testing.
- Begin defining design language for upcoming features.

---

## 🟡 Month 2: Advanced Features & AI-Powered Enhancements

### 🎯 Milestone 4: Live Transcription & Semantic Search (DreamWalk)
- Integrate live transcription (e.g., using Whisper).
- Implement semantic search based on transcript context.
- Build dynamic UI feed surfacing relevant DreamNodes.

### 🎯 Milestone 5: Video Call Integration
- Integrate video calling via WebRTC (e.g., Jitsi).
- Enable DreamNodes representing people to initiate calls.
- Add call invite button in DreamNode UI.

### 🎯 Milestone 6: Automated Clip Generation
- Track timestamps when DreamNodes are shared in conversation.
- Use LLMs to generate and attach clips based on context.
- Enrich DreamNodes with multiple contextual explanations.

---

## 🔵 Month 3: Visualization, Polishing & Web Publishing

### 🎯 Milestone 7: DreamNode Relationships & Visualization
- Visualize DreamSongs as constellations in a "night sky" view.
- Show edges/links between DreamNodes based on narrative connections.

### 🎯 Milestone 8: GitHub as a Publishing Layer
- Integrate GitHub for one-way public publishing.
- Host DreamSongs as GitHub Pages.
- Add workflows for publishing DreamNodes to social platforms.

### 🎯 Milestone 9: Final Testing & Refinement
- Refine Radical syncing, resolve edge cases.
- Polish UI/UX across all features.
- Conduct user testing and demo MVP.

---

## 💡 Bonus / Stretch Goals
- Implement Git hooks:
  - Auto-update parent references when DreamNodes are submoduled.
  - Maintain coherence and avoid conflicts across linked DreamNodes.
- Enable seamless GitHub + Radical workflows for private collaboration + public sharing.