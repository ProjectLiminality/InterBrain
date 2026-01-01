# InterBrain Private Beta Launches

**Published on [DATE] by David Rug**

The private beta is here.

After months of building in public, InterBrain is ready for its first real field test. This post marks the beginning of 2026 - and the beginning of a new chapter for this project.

**What this means**: The core system works. You can create DreamNodes, weave DreamSongs, collaborate peer-to-peer, and grow your liminal web through conversation. But many edge cases remain undiscovered. Many bugs hide in corners we haven't looked. This is why private beta exists - to find what only real usage reveals.

**Expectations**: This is the very first iteration. Rough edges are expected, especially on platforms other than macOS. Your patience and feedback will shape what InterBrain becomes.

To everyone who has supported this journey: from the bottom of my heart, thank you. Every donation has translated directly into development time. The fact that InterBrain has reached this milestone at all is because of your generous contributions.

Now, let's walk through what's new and how to get started.

---

## 1. Installation & Setup

**[VIDEO: Installation & Setup]**

- **Where to start**: Open **Terminal** (macOS), **Terminal** (Linux), or **PowerShell** (Windows)
- Full instructions: [Installation Guide](https://github.com/ProjectLiminality/InterBrain#installation)

**macOS/Linux**:
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/ProjectLiminality/InterBrain/main/install.sh)
```

**Windows (PowerShell as Admin)**:
```powershell
irm https://raw.githubusercontent.com/ProjectLiminality/InterBrain/main/install.ps1 | iex
```

- Script handles everything: Obsidian, Git, GitHub CLI, Radicle, Ollama
- **Recommended**: Don't skip GitHub CLI setup - enables automated feedback system (explained below)
- **AI Providers**: At least one must be active for AI features. Settings panel includes links to obtain API keys for each provider. Anthropic recommended (most tested during development)
- **Settings panel after install**:
  - Anthropic API key (or other provider)
  - Radicle passphrase (enables P2P collaboration)
- Windows: P2P features pending Radicle native support; core features work fully

**Installation troubleshooting**: Installation has been validated on all platforms through automated VM testing, but every machine is different. Permission quirks, existing software conflicts, and platform-specific edge cases can cause issues - especially on Windows. Your feedback helps cover these cases.

Common solutions are gathered in dedicated tracking issues:
- [macOS (#374)](https://github.com/ProjectLiminality/InterBrain/issues/374)
- [Linux (#375)](https://github.com/ProjectLiminality/InterBrain/issues/375)
- [Windows (#363)](https://github.com/ProjectLiminality/InterBrain/issues/363)

If installation fails, check the relevant issue for known solutions before reporting.

---

## 2. Growing Liminal Web

**[VIDEO: Growing Liminal Web]**

- First launch: portal overlay → Enter DreamSpace → InterBrain alone
- **Drag-drop creation**: Images, PDFs, videos all supported
  - File name becomes DreamNode name (rename files before dropping)
- **Auto-relationship**: Dropping while focused on a node connects them automatically
- Create Dreamers (people) and Dreams (ideas) by dropping files
- Navigate by clicking nodes → liminal web recenters around selection
- Click empty space → enter **Constellation View** (DreamNodes arranged like stars in the night sky)

---

## 3. Editing Liminal Web

**[VIDEO: Editing Liminal Web]**

- **Access**: Press and hold **Option** (macOS) / **Alt** (Linux/Windows) to reveal action buttons
- Click **Edit Relationships** button
- Select a Dreamer → edit which Dreams are related to it
- Select a Dream → edit which Dreamers are related to it

---

## 4. Feedback System

**[VIDEO: Feedback System]**

- **Access**: Hold **Option/Alt** on the InterBrain node → click **Report Bug** button
- **Two trigger modes**:
  - **Manual**: Click Report Bug anytime to describe an issue
  - **Automatic**: When an error is caught, a modal appears to add context to the error
- **Submission options**:
  - **Send Report**: Creates GitHub issue directly
  - **AI Refine**: Polishes your description and enables intelligent deduplication (prevents flooding with duplicate issues)
- **Smart deduplication**: If describing a known issue, appends to existing issue rather than creating new one

**Private beta expectations**:
- Many bugs expected, especially on platforms other than macOS
- Better descriptions = higher value feedback
- This is the crux of private beta: catching edge cases only discoverable through real user testing
- The fundamental essence works, but many edge cases remain to be found

---

## 5. DreamWeaving

**[VIDEO: DreamWeaving]**

- **Access**: Hold **Option/Alt** → click **Create DreamSong Canvas** button
- Canvas panel opens on the right
- **Adding media**: Right-click canvas → Add Media from Vault → search for files
- **Visual syntax**:
  - **Directed edges**: Connect media files to create linear flow (orders the sequence)
  - **Undirected edges**: Connect text to media to create media-text pairs (annotations)
- While weaving, flip the DreamNode to see real-time translation into refined DreamSong UI
- **Full screen**: Click full screen button to preview the final DreamSong
- **Save changes**: Imports all referenced external DreamNodes as submodules
- After saving, click media in DreamSong UI → selects the source DreamNode

**Pro tips** (not shown in video):
- **Auto-layout**: Open command palette (Cmd+P) → run "AutoLayoutCanvas" to organize complex canvases
- **Messy start**: InterBrain ignores unconnected elements - throw everything on canvas, connect what matters, only connected elements appear in DreamSong UI
- **Edit shortcut**: In DreamSong UI, click small Edit button under title (top right) to reopen canvas

**Sharing**:
- If GitHub CLI configured: Hold Option/Alt → click **Publish to GitHub Pages**
- Turns DreamSong into shareable website (looks identical to local view)
- After publishing: GitHub button appears in DreamSong UI → opens hosted page
- Share the URL to share your sensemaking with the world

**Constellation edges**:
- After saving, Constellation View shows nodes connected by edges
- Click an edge → reveals the DreamNode containing the DreamSong that connects them
- **Coherence beacon**: When you share changes on a DreamNode with a DreamSong, this triggers a coherence beacon (handled via Social Resonance Filter below)

---

## 6. Copilot Mode

**[VIDEO: Copilot Mode]**

- Activate Copilot Mode for a video call (or face-to-face conversation)
- **Default view**: Only the Dreamer node of your peer is visible
- **Reveal context**: Hold **Option/Alt** → shows relevant DreamNodes based on current conversation
  - Glowing nodes = already connected to your peer
- **Invoke a Dream**: Click a DreamNode while holding Option/Alt → opens full screen, reveals content
- **Screen sharing**: If on video call, share your InterBrain window - invoking a Dream shows it full screen to augment your conversation
- Invoked Dreams auto-connect to that Dreamer in your liminal web
- **Post-call email**:
  - **macOS**: Opens email draft pre-filled - just click send
  - **Linux/Windows**: Modal with email content to copy-paste
  - Email includes: conversation summary, links to clone referenced DreamNodes, installation instructions for peers who haven't installed InterBrain

---

## 7. Social Resonance Filter

**[VIDEO: Social Resonance Filter]**

- **Access**: On any DreamNode, check for updates
- See all commits/updates from peers, **grouped by peer**
- **Granular control**:
  - Preview, accept, or reject each update individually
  - Or batch: all commits from one peer, or all commits from all peers
- **AI summaries**: If AI enabled, summarize all updates to quickly see what's changed
- **Rejected commits**: Not lost - moved to rejected list, can unreject anytime
- **Coherence beacon commits**: Highlighted in **red**
  - Accepting clones the parent DreamNode (containing the DreamSong) plus all sibling submodule dependencies
  - Discover new DreamNodes outside of video calls

**Private beta note**: This is one of the most advanced systems in InterBrain. The pattern - accept what resonates, extend to your peers - has many edge cases. Simple updates (new media, README changes) work smoothly. Complex scenarios need field testing. This is where private beta feedback is most valuable.

---

## The Road Ahead

2026 begins with the private beta. This will transition into a public beta once core features are stable, and eventually into a full stable release.

But stability is just the beginning. Once the foundation is solid, InterBrain will evolve into something far more profound: **DreamOS** - an agentic operating system for the age of digital shamanism. More on that when the time comes.

Beyond the software: Project Liminality's mission is to heal the fragmentation of the human family and catalyze our collective journey toward the more beautiful world our hearts know is possible. InterBrain is the incorruptible communication medium - but so much depends on what flows through it. Powerful visions for addressing the most pressing challenges facing our species will also be a focus of 2026. Stay tuned.

All of this is made possible by ongoing community support. With your help, 2026 will be something truly special - a year to actualize vast untapped potential on this journey together.

Thank you for being here.
