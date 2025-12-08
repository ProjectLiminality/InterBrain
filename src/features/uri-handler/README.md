# URI Handler Feature

**Purpose**: Deep linking system for one-click DreamNode cloning and collaboration handshakes via `obsidian://` protocol.

## Key Files

### `uri-handler-service.ts`
Core service implementing Obsidian protocol handlers for DreamNode cloning and contact exchange.

**Main protocols**:
- `obsidian://interbrain-clone` - Clone DreamNodes from Radicle/GitHub with auto-linking to Dreamer nodes
- `obsidian://interbrain-update-contact` - DID backpropagation for completing collaboration handshakes

**Key methods**:
- `registerHandlers()` - Registers protocol handlers with Obsidian
- `handleClone()` - Unified handler supporting single/batch clones with parallelization
- `handleUpdateContact()` - Updates Dreamer nodes with DID info and triggers auto-sync
- `cloneFromRadicle()` - Public method for Radicle network cloning (used by CoherenceBeaconService)
- `cloneFromGitHub()` - GitHub repository cloning with auto `.udd` generation
- Static generators: `generateSingleNodeLink()`, `generateBatchNodeLink()`, `generateGitHubCloneLink()`, `generateUpdateContactLink()`

**Integration points**:
- RadicleService - Network cloning operations
- GitDreamNodeService - Vault scanning and node creation
- DreamSongRelationshipService - Relationship scanning after clones
- IndexingService - Semantic search indexing of new nodes
- PassphraseManager - Radicle node startup with passphrase handling

**Selection logic**:
- Single clone: Selects the cloned Dream node
- Batch clone: Selects the Dreamer node (shows all shared DreamNodes)

**Fast path optimization**: When all nodes already exist, skips full refresh and directly updates relationships in-memory.

### `index.ts`
Barrel export for service.

## Main Exports

- `URIHandlerService` - Main service class
- `initializeURIHandlerService()` - Singleton initialization
- `getURIHandlerService()` - Singleton accessor

## Notes

- Supports mixed identifier types: Radicle IDs (`rad:z...`), GitHub URLs, UUIDs
- Parallel clone execution for batch operations (significant performance improvement)
- Auto-creates Dreamer nodes for senders with DID/email metadata
- Bidirectional relationship linking (Dreamer <-> DreamNode via `liminal-web.json`)
- Smart UI refresh with constellation layout updates
- Handles duplicate detection (shows "already cloned" instead of re-cloning)
- Network propagation delay handling with user-friendly messaging
- Auto-focus newly cloned nodes in DreamSpace view
