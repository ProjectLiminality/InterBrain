# Coherence Beacon System Complete 🌐✨

**Published on 22 November 2025 by David Rug**

Since the last update, Epic 8 has been completed, bringing peer-to-peer collaboration to the heart of InterBrain. This release streamlines the onboarding process through a comprehensive install script and implements the Coherence Beacon - allowing for collaborative synthesis of ideas through collective intelligence.

## Peer-to-Peer Onboarding

**[VIDEO 1: Onboarding Experience]**

Onboarding someone new to InterBrain is now as simple as having a call with them!

Example scenario:

Alice has the InterBrain set up on her machine and uses it to enhance her communication with charlie during a video call with Charlie through copilot mode.

During the conversation she invokes the Circle DreamNode.

Charlie receives an email with two installation options: minimal (just InterBrain) or comprehensive (InterBrain + all shared DreamNodes + automatic Dreamer representation of Alice). He chooses comprehensive and pastes one command into his terminal.

The install script guides Charlie through the complete setup - Obsidian vault creation, dependency installation, Radicle identity generation, and plugin configuration. After setting up his Radicle identity, his new DID is automatically packaged into a clickable email link and sent back to Alice.

Alice clicks the link, which automatically populates her DreamerNode for Charlie with his DID, email, and alias - completing the collaboration handshake.

Charlie finishes installation and enters his DreamSpace for the first time, already populated with familiar context: the InterBrain itself, Alice's DreamerNode with full contact info, and the Circle DreamNode they just discussed - all properly related in his liminal web.

Note: the InterBrain repo itself is yet another DreamNode in the system and is being treated as such. Installing it translates to cloning the DreamNode into your obsidian vault and creating a symlink into the plugin directory (all handled by the install script). The minimal setup thus constitutes the InterBrain looking at itself as the root DreamNode, acting as the anchor of the space.


## Coherence Beacon: Healing Ideas and Networks

**[VIDEO 2: Coherence Beacon Demo]**

Now that Alice and Charlie can collaborate, the real magic begins. Alice creates a new DreamNode called Cylinder and weaves a DreamSong showing how Circle and Square fit together into a larger synthesis. She saves her changes to Cylinder, which automatically creates a "coherence beacon" commit in both Circle and Square - marking them as submodules and announcing the supermodule relationship.

Alice shares the updated Circle with the network. When Charlie checks for updates on his Circle DreamNode, InterBrain detects the coherence beacon commit and explains what accepting means: he'll receive not just Alice's refinements to Circle, but also an invitation into a larger story that transcends but includes what he already holds.

Charlie accepts. The Square and Cylinder DreamNodes are cloned into his vault, automatically related to Alice in his liminal web. His initial seed of one shared idea (Circle) is now completed by two complementary pieces, giving him the full picture of how Alice sees them fitting together.

Finally, Alice runs the peer discovery command. InterBrain queries the Radicle network and discovers that Charlie has accepted the beacon and cloned both repositories. Her liminal web automatically updates to show Charlie collaborating on all three ideas - Circle, Square, and Cylinder. Both vaults are now perfectly in sync, ready to continue co-evolving these ideas together.

**The Limitless Potential**: This demo uses abstract geometric shapes, but the mechanism is universal. Cylinder could be breakthrough physics synthesizing quantum mechanics and relativity. It could be medicine weaving together Eastern and Western healing traditions. It could be art, music, philosophy, scientific theory - literally anything. The pattern is the same: complementary pieces held by different people, woven into larger wholes that honor and celebrate what came before. We'll only see how powerful this becomes when people use it for ideas that truly matter.


## Settings Panel: System Health and Identity

A new settings panel gives you visibility into the infrastructure powering InterBrain. Check the status of Ollama (local semantic search), Radicle node (peer collaboration), and Python environment (transcription). Your Radicle alias, DID, and email are displayed and editable - this becomes your "fingerprint" when sharing Dreamer nodes with others.

**Note on AI Providers**: Currently, conversation summaries and commit summaries use Claude's cloud API for ease of development. This is temporary - future releases will expand to support multiple providers including fully local LLM options.


## What's Next

All fundamental features are now complete. The core user experience - onboarding peers, sharing ideas, discovering syntheses, and collaborating through resonance - works in its basic form.

The next phase focuses on housekeeping: refactoring codebase architecture, cleaning up technical debt, polishing documentation, and creating comprehensive user guides. This refinement work prepares InterBrain for a **private beta launch** - inviting the community to test with real ideas, provide feedback, and help identify edge cases.

Stay tuned for that in the coming weeks!

## Getting Started

Installation is now simpler than ever - just run the one-command installer:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/ProjectLiminality/InterBrain/main/install.sh)
```

**Note:** InterBrain is work-in-progress software built transparently in public. The system requires macOS or Linux, Python 3.10+, and Radicle CLI for peer collaboration features. Rough edges remain - this is proof-of-concept stage, not production-ready.

---

🙏 **Thank You**

Your ongoing support makes this journey possible. Every contribution helps me dedicate more time and energy toward bringing this vision into the world.

Stay tuned for private beta announcements coming soon!
