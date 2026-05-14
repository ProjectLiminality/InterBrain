# 🖥️ The InterBrain Desktop App + Full Windows Support

Hey friends! Quick update on InterBrain development. This one is a big structural shift — the InterBrain now ships as a proper desktop app, and Windows support is finally complete.

## The Desktop Companion App

Until now, getting InterBrain set up meant running an install script in your terminal — fine for the technically inclined, rough for everyone else. That whole experience has been replaced.

InterBrain now installs as a regular desktop application. You download it, double-click, and a friendly setup screen walks you through everything: checking for prerequisites, installing what's missing, connecting your GitHub account, and dropping the plugin into an Obsidian vault. No terminal, no copy-pasting commands.

The app itself lives quietly in your system tray. Behind it runs a small background **daemon** — the piece that handles all the git plumbing, peer resolution, and collaboration transport — plus a **dashboard** for managing your vaults and settings. The Obsidian plugin talks to the daemon over a local connection; together they form the complete InterBrain.

This is the foundation everything else now sits on. It also means updates can flow much more smoothly from here on.

## Removing the Radicle Dependency

The bigger change is under the hood. Previous versions used Radicle — a peer-to-peer protocol — as the collaboration transport. It worked, but it carried a lot of weight: NAT traversal, a custom signaling layer, identity keypairs, and a dependency that simply didn't have native Windows support yet. That last point was the blocker holding back full cross-platform parity.

So I made a decision I'm calling **the Great Simplification**: GitHub becomes the transport layer.

To be clear about what this does and doesn't change. The InterBrain's whole *concept* of collaboration — the social resonance filter, the sovereign-outbox model where everyone keeps their own copy of every DreamNode, the cherry-pick flow where you choose what to integrate — all of that is untouched. What changed is purely the pipes underneath. GitHub is now the always-online relay that carries commits between peers, while InterBrain keeps its own `interbrain://` URL namespace layered on top, so the conceptual model stays transport-agnostic. The plugin never even sees a GitHub URL — a small helper translates everything at the moment git needs it.

The sovereignty pattern still holds exactly as before: you don't collaborate *on* someone else's repo. When Alice shares her Square DreamNode with Bob, Bob doesn't clone *into* Alice's repository — he creates his own sovereign copy, his own outbox, and tracks Alice's version as a peer remote he can pull from when something resonates. Everyone stays the author of their own version. GitHub is just the post office.

The Radicle-based peer-to-peer transport isn't gone forever — that work is preserved on a branch for a future release, once the user base grows beyond what GitHub comfortably handles. For now, simplicity wins.

**The result: Windows support is finally full.** The entire flow — install, setup, create DreamNodes, weave DreamSongs, share changes, receive a peer's coherence beacon, recursively clone a supermodule and its submodules — has been validated end-to-end, Mac ↔ Windows, on real hardware with real GitHub accounts.

## Next Up

A few things on the near horizon:

- **Activity feed** — a dashboard view that scans all your DreamNodes across all vaults and surfaces what your peers have shared, in one place.
- **Private-by-default DreamNodes** — outboxes are public for now; the next step is private repos with explicit collaborator invites.
- **Linux support validation** — the build already produces Linux artifacts; they need the same end-to-end shakedown the other two platforms just got.

## 🙏 Thank You

Your ongoing support makes this journey possible. If you'd like to support continued development, consider becoming a backer on Open Collective. Every contribution directly funds development time.
