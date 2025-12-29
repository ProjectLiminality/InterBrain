# Radicle Command Reference for InterBrain

**Version**: Radicle CLI 1.5.0
**Last Updated**: 2025-12-29
**Purpose**: Document the exact Radicle commands used by InterBrain.

## Network Modes

InterBrain supports two network modes. Currently using **Seed-Relayed Mode** until Radicle ships NAT hole-punching.

### Mode Comparison

| Aspect | Seed-Relayed (Current) | Direct P2P (Future) |
|--------|------------------------|---------------------|
| **Clone** | `rad clone RID --scope followed` | `rad clone RID --scope followed --seed <nid>` |
| **Announce** | `rad sync --announce` (required) | Not needed |
| **Availability** | Depends on seed propagation | Depends on peer being online |
| **Privacy** | Good (`--scope followed` protects) | Maximum (no intermediaries) |

### What Stays The Same

Both modes use identical commands for:
- Repository initialization (`rad init --private`)
- Seeding policy (`rad seed --scope followed`)
- Following peers (`rad follow`)
- Adding delegates (`rad id update --delegate`)
- Pushing changes (`git push rad`)

---

## Commands Used by InterBrain

### 1. Repository Initialization

**File**: `radicle-service.ts:init()`

```bash
rad init <path> --private --default-branch main --no-confirm --name <name>
```

**Flags**:
- `--private`: Repository not announced to network (hidden from discovery)
- No `--no-seed`: Repo IS seeded locally so peers can fetch once announced

**What this means**:
- The repo is **not advertised** on the network initially (private)
- After `rad sync --announce`, seeds learn about it
- Peers with correct permissions can then fetch via seeds

---

### 2. Repository Cloning

**File**: `radicle-service.ts:clone()`

#### Seed-Relayed Mode (Current)

```bash
rad clone <rid> --scope followed
```

**How it works**:
1. Your node queries the routing table (populated via seed connections)
2. Finds which seeds have the repo
3. Fetches from available seeds
4. Only succeeds if repo has been announced (`rad sync --announce` by owner)

#### Direct P2P Mode (Future)

```bash
rad clone <rid> --scope followed --seed <peer-nid>
```

**How it will work**:
1. Your node connects directly to peer's node via NAT hole-punching
2. Fetches repo directly from peer
3. No seed intermediary needed

**Flags (both modes)**:
- `--scope followed`: Only trust delegates + explicitly followed peers

---

### 3. Announcing to Network (Seed-Relayed Mode)

**File**: `radicle-service.ts:share()`, `seedInBackground()`

```bash
rad sync --announce
```

**Critical for Seed-Relayed Mode**: This command tells seeds about your repo so peers can discover and clone it.

**When to call**:
- After `rad init` (make repo discoverable)
- After `git push rad` (announce new commits)
- Before sharing a link (ensure repo is available)

---

### 4. Sharing (Local Storage)

**File**: `radicle-service.ts:share()`

**Step 1: Push to local Radicle storage**
```bash
git push rad main
```

This pushes commits to **your local** `~/.radicle/storage/` - NOT directly to the network.

**Step 2: Announce to seeds**
```bash
rad sync --announce
```

Makes the repo available via seed nodes for peers to clone.

**Step 3 (optional): Publish if still private**
```bash
rad publish
```

Converts private → public (if you want network-wide discovery). For InterBrain's trust-based model, we typically keep repos in the routing table but rely on direct link sharing.

---

### 5. Seeding Policy

**File**: `radicle-service.ts:setSeedingScope()`, `seedInBackground()`

```bash
rad seed <rid> --scope followed
```

**Scopes**:
- `followed`: Serve to delegates + explicitly followed peers only (PRIVACY)
- `all`: Serve to anyone (PUBLIC - we don't use this)

**When is a repo "seeded"?**
- `rad init` auto-seeds (unless `--no-seed`)
- `rad clone --scope followed` auto-seeds with that scope
- `rad seed` changes the policy later

---

### 6. Fetching Updates

**File**: `coherence-beacon/service.ts:checkForBeacons()`

#### Seed-Relayed Mode

```bash
rad sync --fetch
```

Fetches from seeds in your routing table for all seeded repos.

#### Fetch from specific peer (after clone)

```bash
git fetch <peer-alias>
```

Uses the git remote set up during clone to fetch from that peer's fork.

---

### 7. Peer Following

**File**: `radicle-service.ts:followPeer()`

```bash
rad follow <nid>
```

Adds peer to your trusted list. Their content will be fetched when available.

**Note**: Accepts both raw NID (`z6Mk...`) and DID format (`did:key:z6Mk...`).

---

### 8. Adding Delegates

**File**: `radicle-service.ts:addDelegate()`

```bash
rad id update --delegate "<did>" --threshold 1
```

Makes peer an equal collaborator (can push to your repo).

---

### 9. Git Remote Format

Radicle git remotes use this format:
```
rad://<rid>/<nid>
```

Example:
```bash
git remote add alice rad://z1234.../z6Mk...
```

When you fetch from this remote, git talks to Radicle which routes to that peer (via seeds currently, direct in future).

---

## The Complete Flow (Seed-Relayed Mode)

### David creates a DreamNode:
```bash
rad init --private           # Creates in local storage, auto-seeded
git add . && git commit       # Normal git workflow
git push rad main             # Pushes to LOCAL Radicle storage
rad sync --announce           # CRITICAL: Tell seeds about this repo
```

### David shares with Alice:
```
# David gives Alice a link containing:
# - radicleId: rad:z1234...
# - senderDid: did:key:z6Mk... (David's NID - kept for future direct P2P)
# - senderName: David
# - senderEmail: david@example.com
```

### Alice clones from David (via seeds):
```bash
rad clone rad:z1234... --scope followed
#                       ↑ only trust followed peers
# Fetches from seeds that have the repo (David must have announced)
```

### Later, Alice checks for updates:
```bash
rad sync --fetch             # Fetches from seeds
git fetch david              # Fetches from David's fork specifically
```

---

## Error Handling

### "No seeds found" / "Target not met"

**Cause**: The repo hasn't been announced to seeds yet, or seeds haven't propagated it.

**Solution**:
1. Owner runs `rad sync --announce`
2. Wait a moment for propagation
3. Recipient retries clone

**User-facing message**: "DreamNode not yet available on network. The sender may need to sync, or try again shortly."

### Future: "Peer offline" (Direct P2P Mode)

**Cause**: The peer's Radicle node is not running.

**Solution**: Wait for peer to come online, or use seed-relayed fallback.

---

## Key Differences from "Public" Radicle

| Aspect | InterBrain (Trust-Based) | Public Radicle |
|--------|--------------------------|----------------|
| Init | `--private` (not auto-announced) | Default (announced) |
| Clone | `--scope followed` | `--scope all` (any seed) |
| Seed | `--scope followed` | `--scope all` |
| Discovery | Direct link sharing + `rad sync --announce` | Network gossip |
| Availability | Requires announce + seed propagation | Always via public seeds |

---

## Code Locations

| Operation | File | Method |
|-----------|------|--------|
| Initialize | `radicle-service.ts` | `init()` |
| Clone | `radicle-service.ts` | `clone()` |
| Clone (URI) | `uri-handler-service.ts` | `cloneFromRadicle()` |
| Share/Announce | `radicle-service.ts` | `share()` |
| Follow Peer | `radicle-service.ts` | `followPeer()` |
| Add Delegate | `radicle-service.ts` | `addDelegate()` |
| Set Scope | `radicle-service.ts` | `setSeedingScope()` |
| Background Seed | `radicle-service.ts` | `seedInBackground()` |

---

## Verification Checklist

### Seed-Relayed Mode (Current)
- [x] `rad init --private` used
- [x] `rad clone --scope followed` (no `--seed` flag)
- [x] `rad sync --announce` after init and push
- [x] `git push rad main` for local storage
- [x] `rad seed --scope followed` for seeding policy
- [x] `rad follow` for peer subscription
- [x] `rad id update --delegate` for collaboration
- [x] No `--scope all` anywhere in the codebase

### Future Direct P2P Mode
- [ ] `rad clone --scope followed --seed <nid>` (re-enable `--seed` flag)
- [ ] Remove `rad sync --announce` requirement
- [ ] Keep all other commands identical

---

## Sources

- [Radicle User Guide](https://radicle.xyz/guides/user)
- [Radicle FAQ](https://radicle.xyz/faq) - NAT traversal status
- Local CLI help: `rad <command> --help` (v1.5.0)
