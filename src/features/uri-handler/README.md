# URI Handler

**Purpose**: Deep linking entry point for receiving shared content via `obsidian://` protocol.

## Directory Structure

```
uri-handler/
├── uri-handler-service.ts  # Protocol registration and clone orchestration
├── index.ts                # Barrel export
└── README.md
```

## Main Exports

```typescript
// Service
export { URIHandlerService } from './uri-handler-service';
export { initializeURIHandlerService, getURIHandlerService } from './uri-handler-service';

// Static URL generators (for email sharing)
URIHandlerService.generateSingleNodeLink()
URIHandlerService.generateBatchNodeLink()
URIHandlerService.generateGitHubCloneLink()
URIHandlerService.generateUpdateContactLink()
```

## Protocol Actions

| Protocol | Purpose |
|----------|---------|
| `interbrain-clone` | Clone DreamNodes from a peer's GitHub outbox, with Dreamer linking |
| `interbrain-update-contact` | Legacy contact backpropagation (accepts `did=` for old links; identity is `githubUsername` per #392) |
| `interbrain` | Universal command runner: `?command=<cmd>&uuid=<uuid>` (selects node, executes) |
| `interbrain-activity` | Activity-feed deep link from the daemon dashboard: `?vault=<name>&uuid=<uuid>&mode=inbox\|outbox` → selects the node and opens Check-for-Updates or Share-Changes (#393) |

## Integration Flow

```
External Link (email/message)
        ↓
uri-handler (this feature)
        ↓ delegates to
cloneFromGitHub (native git clone of the peer's outbox)
        ↓ creates via
dreamnode (GitDreamNodeService.create, addRelationship)
        ↓ uses
dreamnode (UDDService for .udd operations)
```

## Responsibility Boundaries

### What This Feature Owns
- Protocol handler registration
- Clone orchestration (parallel batch clones)
- Dreamer node discovery/creation for senders
- URL generation for sharing

### What This Feature Does NOT Own
- Sharing/outbox operations → `social-resonance-filter` (sovereignty-service)
- Vault/node operations → `dreamnode` (GitDreamNodeService, UDDService)
- Relationship persistence → `dreamnode` (addRelationship)
- Semantic indexing → `semantic-search` (indexingService)

## Selection Logic

- **Single clone**: Selects the cloned Dream node
- **Batch clone**: Selects the Dreamer node (shows all shared content)

## Fast Path Optimization

When all nodes already exist, skips full refresh and directly updates relationships in-memory.

## Dependents

- `coherence-beacon` - calls `cloneFromGitHub()` for beacon acceptance
- `dreamweaving` - uses URL generators for sharing
