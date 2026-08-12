# GitHub Publishing

**Purpose**: The GitHub Pages build & broadcast pipeline. Turns a DreamNode's
DreamSong (or DreamTalk) into a static site and deploys it to the node's
outbox repo, so the world can see what you share.

**Where it sits after #409 (sharing is publishing):** there is no separate
"Publish" verb anymore. Repo creation and pushing live in
`social-resonance-filter`'s sovereignty-service (`origin` = your outbox);
*this* feature owns only the Pages artifact — building the static site and
deploying it to the `gh-pages` branch of that same repo. Share Changes
drives it automatically: DreamSong present → build + deploy `gh-pages`;
README-only → Pages serves `main` directly (GitHub renders the README).
The radial button is **"View Published Page"**.

## Directory Structure

```
github-publishing/
├── services/
│   ├── github-service.ts        # Pages pipeline: content blocks →
│   │                            #   static site → gh-pages deploy (origin)
│   └── batch-share-service.ts   # Batch sharing across multiple nodes
├── dreamsong-standalone/        # Standalone DreamSong player for Pages
├── viewer-bundle/               # Prebuilt viewer assets embedded in sites
├── commands.ts                  # Obsidian commands (see below)
└── index.ts
```

## Key Flows

- `rebuildGitHubPages(dreamNodePath)` — parse the DreamSong canvas into
  content blocks (DreamTalk fallback when no canvas), build the static site,
  commit to a local `gh-pages` worktree, push **`origin`** (the outbox).
- Pages *enablement* + source selection (`main` vs `gh-pages`) is
  sovereignty-service's `ensurePages` — invoked from the Share flow.

## Commands

| Command | Purpose |
|---|---|
| `update-github-pages` | Rebuild + redeploy the Pages site for the selected node |
| `open-github-repo` | Open the node's GitHub repo in the browser |
| `clone-dreamnode-github` | Clone a DreamNode from a GitHub URL |
| `publish-dreamnode-github` / `unpublish-dreamnode-github` | Legacy entry points (superseded by Share Changes / View Published Page; retained for the palette) |

## Dependencies

- `social-resonance-filter` (sovereignty-service) — owns the outbox repo,
  pushing, and Pages enablement
- `dreamweaving` (canvas parsing for content blocks)
- `gh` CLI + git

## Notes

- gh-pages deploys go through **`origin`** — the legacy `github` remote
  convention is retired (migrate with `interbrain:migrate-legacy-remotes`).
- `.udd.githubPagesUrl` may be written for convenience, but the source of
  truth for "is this shared/published" is always the `origin` remote.
