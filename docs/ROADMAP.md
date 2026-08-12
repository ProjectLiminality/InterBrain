# Roadmap & Known Issues

The living backlog for InterBrain. Edit freely — this is the single place
to look when picking development back up. Two sections: **Known Issues /
Polish** (things that work but have rough edges or bugs) and **Planned
Features** (things not built yet).

Each entry is dated with when it was logged. When something ships, move it
to `CHANGELOG.md` and delete it here.

---

## Known Issues / Polish

### Reciprocal-invite breaks origin ownership *(2026-05-14)*

After the full bidirectional collaboration handshake — Bob invites Alice,
Alice accepts, Alice invites Bob back, Bob accepts the return invite —
Bob's DreamNode becomes perceived as read-only ("origin not owned by
you"), so he can no longer Share Changes on it.

The *forward* path is fine (Dreamer nodes auto-connect both ways). The bug
is in the reciprocal-accept path corrupting Bob's `origin` so it no longer
reads as his own outbox.

**Suspects** (in `src/features/uri-handler/uri-handler-service.ts` +
`src/features/social-resonance-filter/services/sovereignty-service.ts`):
- `ensurePeerRemote` — the "skip if `owner === me`" guard depends on
  `getCurrentUser()` (`gh api user`). If that call transiently fails, the
  `catch` just "proceeds" — could mis-wire a remote.
- The Dreamer-handshake block in `handleClone` runs on the reciprocal
  accept too — verify none of that path shells out to `git remote set-url`
  / `rename`.
- `sovereignty-service` `ensureRemote` does `git remote set-url` when a
  remote with that name exists at a different URL. If `ensureOwnOutbox`
  runs during the reciprocal accept and `getCurrentUser()` returns
  empty/wrong, the `parsed.owner === me` guard could fail to match and
  `origin` gets renamed away.

**Diagnosis plan**: reproduce the full 6-step handshake on fresh installs,
then after step 5 capture `git remote -v` on the affected DreamNode +
`gh api user` + the accept's console log. That state shows definitively
which remote got clobbered. Likely a focused one-line guard fix.

**User workaround**: `git remote set-url origin https://github.com/<you>/<repo>`
in the affected DreamNode dir.

**Re-verify after #409 (2026-08-12):** Phase A/D reworked exactly the
suspect surface — `ensureOwnOutbox` now verifies the repo exists before
trusting an origin URL (and restores origin if creation fails), adopts
legacy `github` remotes, and peer classification is by declared URL owner.
The failure mode described above may already be fixed; reproduce before
acting on the old diagnosis.

### Cloned DreamNode not auto-linked to sender Dreamer in liminal web *(2026-05-13)*

When you accept an invite, both the cloned DreamNode and the sender's
Dreamer node appear, but the *edge* between them in the liminal web isn't
always drawn. Cosmetic — the relationship exists, the visualization just
misses it. (Tracked previously as task #76; partially addressed but worth
re-verifying.)

### LeafManager Windows path separators *(2026-05-13)*

`getAbstractFileByPath` wants forward-slash vault-relative paths; Windows
`dreamNode.repoPath` can carry backslashes. The four LeafManager call
sites were normalized in v0.16.0 — but audit other vault-API call sites
elsewhere for the same latent bug.

### Windows local cargo build blocked by Application Control *(pre-v0.16.0)*

`cargo build` directly on the Windows dev box is blocked by Windows
Application Control. Only affects local iteration speed for the
developer — end users install the bundled `.exe`, which is fine. The dev
loop uses the CI tag-build path instead (see operational-context.md §2).

### Empty install dir lingers after Windows uninstall *(2026-05-14)*

After the NSIS uninstaller runs, an empty `%LOCALAPPDATA%\InterBrain\`
directory shell sometimes can't be deleted (Defender/Explorer transient
handle). Harmless — NSIS reinstalls over it cleanly; clears on reboot.

### Dev-environment housekeeping after v0.16.0 validation *(2026-05-14)*

Loose ends from the cross-platform validation push, safe to clear
whenever convenient — none of it blocks anything:

- **Dev snapshots / backups**: Mac has `~/interbrain-dev-snapshot-20260514-092808`
  (config dir + app bundle + obsidian.json from before the clean-install
  test). Windows has `*.dev-backup-<stamp>` siblings of the install dir,
  config dir, and dev vaults. Discard once confident the CI-installed
  build is healthy.
- **Orphaned GitHub test repos**: the Square/Circle/Cylinder iterations
  created throwaway repos under the test accounts. Bulk-delete via
  `gh repo list` + `gh repo delete`.
- **gh accounts**: if any were logged out during clean-slate testing,
  re-add them with `gh auth login`.

---

## Planned Features

### Private-by-default DreamNodes

Outboxes are created public for now (simplest for the first ship). Next
step: private repos with explicit collaborator invites (`gh api ...
collaborators`).

### Linux end-to-end validation

The CI Release build already produces `.deb` + `.AppImage` Linux
artifacts. They need the same Mac↔Windows shakedown the other two
platforms got before Linux is announced as supported.

### Tray icon duplication

The colored tray icon shipped, but the duplicate-icon glitch may still
surface in some Tauri states. Flagged as post-validation polish — revisit
with a websearch on Tauri `TrayIconBuilder` vs `tauri.conf.json` `trayIcon`
interaction.

### Revive the P2P collaboration E2E workflow

`.github/workflows-disabled/p2p-collaboration.yml.bak` is the Radicle-era
end-to-end test, parked because every `rad` call has been removed. The job
*structure* (single-runner localhost mode, two-peer fixtures) is still a
good skeleton — rewrite the transport calls against GitHub
(`gh repo create`, `git clone`/`fetch` over HTTPS, the sovereignty
handover, beacon propagation) and move it back into `.github/workflows/`.
See that file's sibling `README.md` for details.
