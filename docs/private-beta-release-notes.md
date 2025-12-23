# InterBrain Private Beta Release Notes

*Draft for Open Collective update posts - December 2025*

---

## Post 1: Technical Achievements (For the curious)

### CI Infrastructure Complete

We now have comprehensive automated testing that runs on every commit:

**Always runs (~2 min):**
- TypeScript linting, type checking, unit tests
- Runs on Linux, macOS, AND Windows

**Runs when install scripts change (~25 min):**
- Full installation verification on all 3 platforms
- Verifies Git, GitHub CLI, Radicle CLI, Ollama install correctly
- Tests Radicle identity creation

**P2P Collaboration Tests:**
- Two separate VMs communicate via Tailscale VPN
- Tests the complete "DreamWeaving" flow:
  - Alice creates DreamNodes (Square, Circle, Cylinder)
  - Bob clones from Alice over the P2P network
  - Commit propagation works
  - Coherence Beacons (relationship discovery) work
  - Submodule auto-cloning works

### What This Means

Before private beta, we wanted high confidence that:
1. Installation works on all platforms
2. The P2P collaboration actually works between machines
3. Code changes don't break existing functionality

Users should only report UX issues (things humans catch), not installation failures or platform bugs we could have caught ourselves.

---

## Post 2: Private Beta Launch Announcement

### InterBrain Private Beta is Live! 🎉

After months of development, InterBrain is ready for private beta testing.

### What is InterBrain?

A knowledge gardening system that organizes ideas through social relationships rather than folders. Built as an Obsidian plugin, it turns your notes into a living, interconnected web of ideas that can be shared peer-to-peer.

### Platform Support

| Feature | macOS | Linux | Windows |
|---------|-------|-------|---------|
| Install script | ✅ | ✅ | ✅ |
| DreamNode creation | ✅ | ✅ | ✅ |
| 3D visualization | ✅ | ✅ | ✅ |
| Semantic search (AI) | ✅ | ✅ | ✅ |
| GitHub publishing | ✅ | ✅ | ✅ |
| **P2P collaboration** | ✅ | ✅ | ❌ * |

*\* Windows P2P pending Radicle native support. Local features work great!*

### How to Install

**macOS/Linux:**
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/ProjectLiminality/InterBrain/main/install.sh)
```

**Windows (PowerShell as Admin):**
```powershell
irm https://raw.githubusercontent.com/ProjectLiminality/InterBrain/main/install.ps1 | iex
```

The install script automatically sets up everything:
- **Obsidian** (via Homebrew/Flatpak/Snap/Winget)
- Git (if not present)
- GitHub CLI
- Radicle CLI (P2P infrastructure)
- Ollama (local AI for semantic search)

No prerequisites needed - just run the script!

### What to Expect

**Works well:**
- Creating and organizing DreamNodes
- 3D constellation view of your knowledge
- Semantic search across your notes
- Publishing to GitHub Pages
- P2P sharing (macOS/Linux)

**Still rough:**
- Onboarding tutorial (coming soon)
- Some UI polish needed
- Error messages could be clearer

### How to Give Feedback

- GitHub Issues: [ProjectLiminality/InterBrain](https://github.com/ProjectLiminality/InterBrain/issues)
- Or reply to this post!

### Version

`0.X.0` - Private Beta

*(Version number TBD - discuss semantic versioning)*

---

## Notes for David

### Versioning Discussion

Current version in package.json needs to be checked. Options:
- `0.1.0` - First public-ish release
- `1.0.0-beta.1` - If we want to signal "feature complete but testing"

Semantic versioning recommendation: `0.1.0` since we're not yet at stable 1.0.

### Things NOT covered by CI

1. Obsidian plugin integration (requires human testing)
2. Visual/UX bugs (requires human eyes)
3. The onboarding tutorial (not yet complete)
4. Real-world P2P with firewalls/NAT (Tailscale helps but isn't identical)

### Open Questions

1. Should we create a separate "known issues" document?
2. Do we want a Discord/community channel for beta feedback?
3. Timeline for addressing Windows P2P? (Depends on Radicle team)
