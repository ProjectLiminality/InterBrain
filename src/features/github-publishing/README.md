# GitHub Publishing Feature

**Purpose**: Fallback sharing mechanism for Windows users and public broadcast layer via GitHub + GitHub Pages

## Philosophy
"GitHub for sharing, Radicle for collaboration" - GitHub provides fallback when Radicle unavailable and public broadcast via Pages.

## Key Files

### Core Service Layer
- **`service.ts`** - Main GitHubService class implementing complete share/unpublish workflow
  - Creates public repos, enables Pages, manages submodules recursively
  - Builds static DreamSong sites using viewer bundle
  - Link resolver for cross-DreamNode navigation on Pages
  - Exports: `GitHubService`, `githubService` singleton

### Batch Operations
- **`batch-share-service.ts`** - Ensures multiple nodes have GitHub URLs before email sharing
  - Batch publishing with serialized git operations (prevents race conditions)
  - Exports: `GitHubBatchShareService`, `initializeGitHubBatchShareService()`, `getGitHubBatchShareService()`

- **`share-link-service.ts`** - Generates Obsidian URIs for single-node sharing
  - Integrates with Radicle for collaboration handshake
  - Exports: `ShareLinkService`

### Command Registration
- **`commands.ts`** - Registers 3 Obsidian commands:
  - "Share DreamNode via GitHub" - Creates repo + Pages with recursive submodule handling
  - "Unpublish DreamNode from GitHub" - Deletes remote repo + cleans metadata
  - "Clone DreamNode from GitHub" - Supports Obsidian URI protocol
  - Exports: `registerGitHubCommands()`

### Standalone Viewer
- **`dreamsong-standalone/`** - Pre-built React app for GitHub Pages
  - `main.tsx` - Renders DreamSong from embedded JSON data
  - `vite.config.ts` - Builds static site with relative paths
  - Built bundle lives in plugin root at `viewer-bundle/`

### Future Implementation
- **`network-service.ts`** - Placeholder for Windows peer-to-peer alternative
  - Will mirror RadicleService API with GitHub backend
  - Currently returns "coming soon" errors

### Feature Exports
- **`index.ts`** - Central exports for GitHub publishing functionality

## Main Exports
```typescript
import { registerGitHubCommands } from './commands';
import { GitHubService, githubService } from './service';
import { GitHubBatchShareService, initializeGitHubBatchShareService } from './batch-share-service';
import { ShareLinkService } from './share-link-service';
```

## Dependencies
- GitHub CLI (`gh`) for repo operations and API calls
- Node.js fs/path/child_process for file operations and git commands
- Obsidian Plugin API for commands and UI
- DreamWeaving feature for canvas parsing and DreamSong rendering

## Flags

### Technical Debt
- **Static site building inside Obsidian** - `service.ts` builds Vite sites in plugin context (non-ideal, works but brittle)
- **Missing viewer bundle validation** - No check if `viewer-bundle/` is up-to-date with source code
- **network-service.ts is stub** - Placeholder implementation with no functionality

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
