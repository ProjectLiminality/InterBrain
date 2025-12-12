# GitHub Publishing Feature

**Purpose**: Fallback sharing mechanism for Windows users and public broadcast layer via GitHub + GitHub Pages

## Philosophy
"GitHub for sharing, Radicle for collaboration" - GitHub provides fallback when Radicle unavailable and public broadcast via Pages.

## Directory Structure

```
github-publishing/
├── services/
│   ├── github-service.ts      # Core GitHub CLI + Pages workflow
│   ├── batch-share-service.ts # Multi-node batch publishing
│   └── share-link-service.ts  # Obsidian URI generation
├── dreamsong-standalone/      # React viewer source for Pages
│   ├── index.html             # HTML template with data injection
│   ├── main.tsx               # React entry point
│   └── vite.config.ts         # Vite build config
├── viewer-bundle/             # Built assets (output of build-github-viewer)
├── commands.ts                # Obsidian command registration
├── settings-section.ts        # Feature-owned settings UI
├── index.ts                   # Barrel export
└── README.md
```

## Services

### github-service.ts
Main GitHubService class implementing complete share/unpublish workflow:
- Creates public repos, enables Pages, manages submodules recursively
- Builds static DreamSong sites using viewer bundle
- Link resolver for cross-DreamNode navigation on Pages

### batch-share-service.ts
Ensures multiple nodes have GitHub URLs before email sharing:
- Batch publishing with serialized git operations (prevents race conditions)

### share-link-service.ts
Generates Obsidian URIs for single-node sharing:
- Integrates with Radicle for collaboration handshake

## Commands

Three Obsidian commands registered:
- "Share DreamNode via GitHub" - Creates repo + Pages with recursive submodule handling
- "Unpublish DreamNode from GitHub" - Deletes remote repo + cleans metadata
- "Clone DreamNode from GitHub" - Supports Obsidian URI protocol

## Main Exports

```typescript
// Commands
export { registerGitHubCommands } from './commands';

// Services
export { GitHubService } from './services/github-service';
export { GitHubBatchShareService } from './services/batch-share-service';
export { ShareLinkService } from './services/share-link-service';

// Settings
export { createGitHubSettingsSection, checkGitHubStatus } from './settings-section';
```

## Dependencies
- GitHub CLI (`gh`) for repo operations and API calls
- Obsidian Plugin API for commands and UI
- DreamWeaving feature for canvas parsing and DreamSong rendering
- DreamNode feature for UDDService (canonical .udd operations)
- URI Handler feature for canonical Obsidian URI generation
- Core VaultService for path resolution

## Flags

### Potential Issues
- **Recursive submodule sharing** - Deep hierarchies may cause performance issues or circular dependencies
- **Media file collision handling** - Uses simple counter suffix strategy (may not be robust for large albums)
- **Link resolver scalability** - Builds UUID→URL map by reading all submodule .udd files (could be slow for large networks)

## Architecture Notes
- Commands delegate to services (never direct git operations)
- Service layer handles all GitHub CLI and git operations
- Batch operations serialize to prevent race conditions
- .udd file is source of truth for GitHub URLs (githubRepoUrl, githubPagesUrl)
- Static sites deployed to orphan `gh-pages` branch (no source code pollution)
