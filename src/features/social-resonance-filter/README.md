# Social Resonance Feature

**Purpose**: Peer-to-peer DreamNode sharing via Radicle network integration with "Save & Share" paradigm hiding technical complexity.

## Key Files

### Core Services
- **`radicle-service.ts`** - Full Radicle CLI integration: init, clone, share, peer following, delegates, seeding scope, git remote management, routing table queries
- **`services/git-sync-service.ts`** - Git synchronization operations: fetch/pull/push with peer support, cherry-picking, divergence detection, dual remote mode (Radicle + GitHub)
- **`passphrase-manager.ts`** - Radicle passphrase management with smart node detection (returns empty string if node already running)
- **`batch-init-service.ts`** - Batch Radicle initialization with race condition prevention and gap detection (syncs .udd ↔ git state)

### Commands
- **`commands.ts`** - User-facing commands: Initialize DreamNode with Radicle, Share DreamNode, Clone from Network, Discover Peer Acceptances, Sync Peer Following
- **`housekeeping-commands.ts`** - Maintenance command: Sync Radicle Follow Relationships (ensures collaboration handshakes complete)

### Entry Point
- **`index.ts`** - Feature slice exports

## Main Exports

```typescript
// Commands
registerRadicleCommands(plugin, uiService, passphraseManager)
registerHousekeepingCommands(plugin)

// Services
RadicleService: isAvailable, init, clone, share, getSeeders, followPeer, addDelegate, setSeedingScope, reconcileRemotes
GitSyncService: fetchUpdates, pullUpdates, pushToAvailableRemote, checkDivergentBranches
PassphraseManager: getPassphrase, isPassphraseSet
getRadicleBatchInitService(): RadicleBatchInitService
```

## Architecture Notes

### Radicle Integration Strategy
- **Platform Support**: macOS/Linux only (Windows uses GitHub fallback, testable via `SIMULATE_WINDOWS=true`)
- **Passphrase Flow**: Checks if node running first → uses settings passphrase → prompts user to configure
- **Command Discovery**: Searches `rad` in PATH, `~/.radicle/bin/rad`, `/usr/local/bin/rad`, `/opt/homebrew/bin/rad`
- **Git Helper PATH**: Enhances PATH with `~/.radicle/bin` for `git-remote-rad` helper

### Pure P2P Collaboration Pattern
- **Delegates**: All peers added as equal delegates (threshold=1, revisions auto-accepted)
- **Peer Following**: Both node-level (`rad follow <DID>`) and repository-specific following
- **Git Remotes**: Declarative reconciliation via `reconcileRemotes()` - adds/updates/removes peer remotes to match liminal-web.json
- **Seeding Scope**: `'all'` for public infrastructure, `'followed'` for private collaboration
- **Routing Table Discovery**: `getSeeders()` enables transitive discovery (Alice discovers Bob/Charlie accepted beacon)

### Dual Remote Mode
- **GitHub + Radicle**: When both exist, pushes to BOTH (GitHub for publishing, Radicle for collaboration)
- **Priority**: Radicle → GitHub → origin → first available

### Gap Detection & Repair
- **Batch Init Service**: Detects when .udd lacks radicleId but git repo is initialized → writes ID to .udd
- **Clone Operation**: Normalizes titles (kebab/snake/PascalCase → "Spaced Title"), saves radicleId to .udd for instant future lookups
- **Init Command**: Three-step check: .udd file → git repo → full initialization

## Testing Patterns

### Windows Fallback Testing
Set `SIMULATE_WINDOWS=true` environment variable to test GitHub fallback on macOS/Linux

### Command Testing Protocol
All commands check `radicleService.isAvailable()` first, show user-friendly errors with installation link

## Known Issues
None flagged for removal - all files actively used.
