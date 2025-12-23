# Platform Support

## Overview

InterBrain runs on macOS, Linux, and Windows. The core experience—creating DreamNodes, weaving DreamSongs, and exploring your knowledge garden—works fully on all platforms.

**Peer-to-peer collaboration** (sharing DreamNodes directly with friends via Radicle) is currently available on macOS and Linux. Windows support for collaboration is coming soon, pending native Radicle support.

## Feature Matrix

| Feature | macOS | Linux | Windows |
|---------|-------|-------|---------|
| Create DreamNodes | ✅ | ✅ | ✅ |
| Edit & save DreamNodes | ✅ | ✅ | ✅ |
| DreamSong canvas playback | ✅ | ✅ | ✅ |
| Submodule import (dreamweaving) | ✅ | ✅ | ✅ |
| Semantic search (Ollama) | ✅ | ✅ | ✅ |
| GitHub publishing | ✅ | ✅ | ✅ |
| **P2P sharing (Radicle)** | ✅ | ✅ | 🔜 Coming soon |
| **Receive from peers** | ✅ | ✅ | 🔜 Coming soon |
| **Coherence beacons** | ✅ | ✅ | 🔜 Coming soon |

## Windows: What Works Now

Windows users can:
- Create and edit DreamNodes with full git versioning
- Import other DreamNodes as submodules for dreamweaving
- Play DreamSong canvases with all media
- Use semantic search via Ollama
- Publish to GitHub Pages for sharing

Windows users cannot yet:
- Share DreamNodes directly with peers via Radicle
- Receive updates from peers in real-time
- Participate in coherence beacon discovery

## Windows: What's Coming

[Radicle](https://radicle.xyz) is actively working on Windows support. As of version 1.3.0 (August 2025), the `rad` CLI works natively on Windows. The remaining blockers are:

- `git-remote-rad` - Git helper for `rad://` URLs
- `radicle-node` - P2P daemon for network connectivity

Once these ship, InterBrain will automatically enable full collaboration on Windows.

### Express Interest in Windows Support

If Windows P2P collaboration is important to you, consider letting the Radicle team know:

- **Radicle Zulip**: [radicle.zulipchat.com](https://radicle.zulipchat.com) - Join the community chat
- **Radicle on Radicle**: Clone `rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5` and submit a patch

The Radicle team builds based on community demand. Your voice matters!

## Technical Details

### Submodule URL Strategy

On macOS/Linux, submodules use Radicle URLs for network portability:
```
rad://z1234.../z6Mk...
```

On Windows, submodules use relative filesystem paths:
```
../SubmoduleName
```

### Migration Path

When Windows gains full Radicle support, a migration script will convert local paths to Radicle URLs:

```bash
# Future migration (when Windows Radicle is ready)
interbrain migrate-submodules
```

This will:
1. Read each submodule's `.udd` file to get its `radicleId`
2. Update `.gitmodules` to use `rad://` URLs
3. Commit the changes

**Your data is safe** - the DreamNode content and relationships are preserved regardless of URL format.

### How It Works

The `SubmoduleManagerService` detects the platform and chooses the appropriate URL strategy:

```typescript
// Simplified logic
if (isWindows && !hasRadicleNodeSupport) {
  // Use relative path for local-only operation
  submoduleUrl = `../${submoduleName}`;
} else {
  // Use Radicle URL for network portability
  submoduleUrl = `rad://${radicleId}`;
}
```

Both formats work identically for local editing. The Radicle URL enables network sync when available.

## Private Beta Notes

InterBrain is currently in **private beta**. We're gathering feedback from early users before public release.

### Known Limitations

1. **Windows collaboration** - P2P features await Radicle Windows support
2. **Ollama required** - Semantic search needs local Ollama installation
3. **Git knowledge helpful** - Power users benefit from understanding git

### Reporting Issues

- GitHub Issues: [github.com/ProjectLiminality/InterBrain/issues](https://github.com/ProjectLiminality/InterBrain/issues)
- For collaboration features: Note your platform in the issue

---

*Last updated: December 2025*
