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
| `interbrain-clone` | Clone DreamNodes from Radicle/GitHub with Dreamer linking |
| `interbrain-update-contact` | DID backpropagation for collaboration handshakes |

## Integration Flow

```
External Link (email/message)
        ↓
uri-handler (this feature)
        ↓ delegates to
social-resonance-filter (RadicleService.clone)
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
- Network operations → `social-resonance-filter` (RadicleService)
- Vault/node operations → `dreamnode` (GitDreamNodeService, UDDService)
- Relationship persistence → `dreamnode` (addRelationship)
- Semantic indexing → `semantic-search` (indexingService)

## Selection Logic

- **Single clone**: Selects the cloned Dream node
- **Batch clone**: Selects the Dreamer node (shows all shared content)

## Fast Path Optimization

When all nodes already exist, skips full refresh and directly updates relationships in-memory.

## Dependents

- `coherence-beacon` - calls `cloneFromRadicle()` for beacon acceptance
- `dreamweaving` - uses URL generators for sharing
