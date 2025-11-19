# Radicle Architecture: Pure Peer-to-Peer Dreamweaving

InterBrain is fundamentally a **specialized GUI client for Radicle**, implementing a constrained, extremely peer-to-peer subset of Radicle's capabilities optimized for trust-based knowledge sharing.

## Core Design Principle: Radicle as Single Source of Truth

**The Collapse**: Instead of maintaining parallel relationship graphs (UUID-based `.udd` files + Radicle network state), we collapse to a single source of truth: **Radicle IS the Liminal Web**.

**Identity System**:
- **Dream Nodes**: Identified by Radicle Repository ID (`rad:z2u...`)
- **Dreamer Nodes**: Identified by Radicle DID (`did:key:z6Mks...`)
- **Type Inference**: Format determines type (no mutable `type` field needed)
- **No UUIDs**: Radicle identifiers replace all UUID-based tracking

**Minimal `.udd` Schema**:
```json
{
  "id": "rad:z2u2AB..." or "did:key:z6Mks...",
  "title": "Square",
  "dreamTalk": "Square.png",
  "submodules": [],
  "supermodules": []
}
```

## The Three Constraints: Pure P2P Configuration

Every InterBrain DreamNode is configured with these mandatory Radicle settings:

1. **Equal Delegates** (`--threshold 1`):
   - Every peer is equally authoritative
   - Any delegate can push changes
   - No hierarchy, pure peer-to-peer
   - Command: `rad id update --delegate <DID> --threshold 1`

2. **Followed Scope** (`--scope followed`):
   - Only fetch from peers you explicitly trust
   - Changes flow through social relationships
   - No stranger contributions
   - Command: `rad seed <RID> --scope followed`

3. **Bidirectional Trust**:
   - When Alice shares with Bob, both follow each other
   - Mutual delegation (both can push)
   - Symmetric collaboration by default
   - Commands: `rad follow <DID>` (both directions)

## Two-Layer Architecture: Global Trust + Organic Collaboration

**Layer 1: Global Following** (Radicle node config):
```bash
rad follow did:key:z6MksBob... --alias Bob
rad follow did:key:z6MksCharlie... --alias Charlie
```
- Who you trust across ALL projects
- Visible via: `rad follow --list`
- Maps to: Dreamer nodes in DreamSpace (ring around InterBrain)

**Layer 2: Per-Repo Delegation** (repo metadata):
```bash
rad id update --delegate did:key:z6MksBob... --threshold 1
```
- Who holds THIS specific DreamNode (can push)
- Visible via: `rad id show <RID>`
- **Share = Delegate** (one action, not separate concepts)

**Liminal Web Edges = Pure Intersection:**
```typescript
// Collaboration edges emerge automatically from Radicle state
const followed = await rad.getFollowedPeers();      // Global trust
const delegates = await rad.getDelegates(dreamNodeRID); // Who holds this idea

// Edges appear/disappear automatically
const collaborators = followed.filter(p => delegates.includes(p.did));
```

**Zero custom state needed** - UI reflects Radicle reality directly.

## Data Flow: One-Directional (Radicle → UI)

**Core Principle**: Radicle does what it does. InterBrain UI adapts to Radicle, never interferes.

**Radicle → InterBrain** (read only):
- `rad follow --list` → Populate Dreamer nodes in DreamSpace
- `rad id show <RID>` → Discover who holds this DreamNode
- Intersection → Collaboration edges appear automatically in Liminal Web
- `rad sync` + `git fetch <peer>` → Get updates from all followed delegates

**InterBrain Performance Cache** (ephemeral, not source of truth):
```typescript
// Cache Radicle queries for UI performance only
interface CachedRadicleState {
  followedPeers: Map<DID, DreamerMetadata>;     // from rad follow --list
  delegatesByRepo: Map<RID, DID[]>;             // from rad id show
  lastSyncTime: timestamp;
}
// Refresh periodically or on user action
// Always treat Radicle CLI output as authoritative
```

**User Actions That Modify Radicle** (via standard rad/git commands):
- Share DreamNode → `rad clone` + `rad follow` + `rad id update --delegate`
- Accept update → `git merge <peer>/main` + `git push rad main`
- Follow peer → `rad follow <DID>`

**Emergent Behavior Example**:
1. Alice follows Bob, Charlie, Diana (global trust)
2. Alice shares Square with Bob → Bob becomes delegate
3. Bob shares Square with Charlie → Charlie becomes delegate
4. **Automatically**: Alice sees Square edge to Charlie in UI (she follows Charlie, Charlie is delegate)
5. Diana is NOT delegate → No edge appears (even though Alice follows her)

## Transitive Trust: Social Resonance Filter

**Scenario**: Alice ↔ Bob ↔ Charlie (Alice doesn't follow Charlie)

**How Changes Flow**:
1. Charlie edits Square → `git push rad main`
2. Bob fetches Charlie → `git fetch charlie`
3. Bob reviews and merges → `git merge charlie/main`
4. Bob pushes merged state → `git push rad main`
5. Alice fetches Bob → `git fetch bob` (includes Charlie's work transitively)
6. Alice merges Bob → Gets Charlie's ideas through Bob's curation

**Key Insight**: Alice receives Charlie's contributions WITHOUT directly following Charlie. Bob acts as curator/bridge. Changes propagate through trust relationships, not broadcast.

## Intentional Divergence: Curation as Feature

**Rejection is Silent**:
- Alice fetches Bob's changes: `git fetch bob`
- Alice reviews: `git log HEAD..bob/main` (sees Bob added `controversial.pdf`)
- Alice decides: "Not merging this" (no `git merge` command)
- Result: Alice's fork doesn't include the file
- Consequence: Alice's peers won't see it (transitive filtering)

**Perspectives Coexist**:
- Bob's fork: Has controversial.pdf ✅
- Alice's fork: Doesn't have it ❌
- Different truths coexist, filtered by social curation
- No global consensus needed

## Merge Conflicts: Rare and Manageable

**Dreamweaving Conflict Reality**:
- 🟢 **90%+ auto-merge**: Different files or different sections
- 🟡 **5% trivial**: Canvas JSON (keep both nodes via union)
- 🔴 **5% real**: Same text rewritten (requires human judgment)

**Conflict Resolution Strategy**:
1. **Preview First**: Show diff before merging (`git diff <peer>/main`)
2. **Auto-Merge Safe Cases**: Different files, different sections
3. **Canvas-Aware Merging**: Union of nodes/edges (structural merge)
4. **LLM Assistance**: Future feature for synthesizing conflicting edits
5. **User Approval**: Always human-in-loop for ambiguous cases

**Git Remembers**: Merge commits establish "integrated up to this point." Same conflict never re-appears.

## Scalability: O(1) Complexity Per Person

**The Induction Proof**:
- **Base case**: Alice ↔ Bob (2 people) = O(1) fetches each ✅
- **Inductive step**: Add Charlie → Each person still O(1) fetches ✅
- **Result**: Scales from 3 to 3 million people

**Why It Scales**:
- **Local Coherence**: Each person manages ~5-10 direct peers
- **Transitive Integration**: Bob curates Charlie + Diana → Alice merges Bob once
- **Git DAG**: Distributed by design (Linux kernel: 1000+ contributors, decades)
- **No Global Consensus**: Different perspectives coexist peacefully

**What Would Break Scalability**:
- ❌ `--scope all` (fetch from everyone) → O(N) complexity
- ❌ No curation (merge all peers directly) → O(N) operations
- ❌ Single shared canvas (1000 people editing) → Frequent conflicts

**InterBrain Avoids All Anti-Patterns** ✅

## Implementation Patterns

**DreamNode Creation** (Alice):
```bash
rad init --name "Square" --default-branch main
git add . && git commit -m "Initial commit"
git push rad main
rad seed <RID> --scope followed
```

**Sharing via Obsidian URI** (Alice → Bob):
```
obsidian://interbrain-share?
  rid=rad:z2u2ABsquare...&
  did=did:key:z6MksAlice...&
  name=Alice&
  title=Square
```

**Receiving Share** (Bob, automatic):
```bash
rad clone <RID>                                  # Clone repo
rad follow <Alice-DID> --alias Alice             # Global trust
rad id update --delegate <Alice-DID> --threshold 1  # Alice can push
rad seed <RID> --scope followed                  # Only followed peers
git remote add alice rad://<RID>/<Alice-DID>    # Track Alice's fork
# Create Alice Dreamer node in vault
```

**Check for Updates** (Bob from Alice):
```bash
rad sync                      # Fetch from seed nodes (all followed delegates)
git fetch alice               # Get Alice's specific fork
git log HEAD..alice/main      # Preview new commits
git merge alice/main          # Accept changes (user approval)
git push rad main             # Share merged state
```

**Discover Collaborators** (pure Radicle query):
```typescript
// Who collaborates on Square? (intersection query)
async function getCollaboratorsForDreamNode(dreamNodeRID: string) {
  const followed = await rad.getFollowedPeers();      // Global trust
  const delegates = await rad.getDelegates(dreamNodeRID); // Who holds Square

  // Collaboration edges = intersection (automatic)
  return followed.filter(peer => delegates.includes(peer.did));
  // These edges appear in Liminal Web UI automatically
}
```

## Key Architectural Insights

1. **Identity Collapse**: rad:* + did:key:* replaces UUIDs entirely
2. **Single Source of Truth**: Radicle IS the Liminal Web (no parallel graphs)
3. **One-Directional Flow**: Radicle → UI (InterBrain adapts, never interferes)
4. **Share = Delegate**: One action creates collaboration (not separate concepts)
5. **Organic Emergence**: Edges appear automatically from `followed ∩ delegates`
6. **Transitive Curation**: Changes flow through social graph, not broadcast
7. **Intentional Divergence**: Forks coexist, consensus unnecessary
8. **O(1) Scalability**: Local coherence scales globally
9. **Git Native**: All merge/conflict resolution via standard git
10. **Performance Cache Only**: InterBrain caches queries but Radicle CLI is authoritative

**InterBrain = Radicle GUI client for trust-based knowledge gardening** 🌱

**Design Philosophy**: Trust Radicle's architecture. Build a beautiful window into the peer-to-peer network, not a replacement for it.
