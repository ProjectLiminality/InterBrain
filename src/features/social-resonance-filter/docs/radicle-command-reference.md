# Radicle Command Reference for InterBrain

**Version**: Radicle CLI 1.5.0
**Last Updated**: 2025-12-22
**Purpose**: Document the exact Radicle commands used by InterBrain for the privacy-first direct P2P model.

## Privacy Model: Direct P2P Only

InterBrain uses **direct peer-to-peer** mode exclusively:
- Repos are cloned **directly from known peers** (via `--seed <nid>` flag)
- Changes propagate only to **direct peers who are online**
- Scope is always `followed` (never `all`) for privacy
- **No public seeds. No gossip. Just peer-to-peer.**

| Aspect | Our Model | What We Avoid |
|--------|-----------|---------------|
| **Clone** | `rad clone RID --scope followed --seed <peer-nid>` | `--scope all` (public seeds) |
| **Seed** | `--scope followed` (trusted peers only) | `--scope all` (everyone) |
| **Discovery** | Direct link sharing (RID + peer NID) | Network announcement |

---

## Commands Used by InterBrain

### 1. Repository Initialization

**File**: `radicle-service.ts:init()`

```bash
rad init <path> --private --default-branch main --no-confirm --name <name>
```

**Flags**:
- `--private`: Repository not announced to network (hidden from discovery)
- No `--no-seed`: Repo IS seeded locally so direct peers can fetch

**What this means**:
- The repo is **not advertised** on the network (private)
- But if a peer knows the RID + your NID, they **can** fetch it (auto-seeded)
- Privacy through obscurity, not through refusing to serve

---

### 2. Repository Cloning

**File**: `radicle-service.ts:clone()`

```bash
rad clone <rid> --scope followed --seed <peer-nid>
```

**Flags**:
- `--scope followed`: Only trust delegates + explicitly followed peers
- `--seed <nid>`: Clone directly from this specific peer (bypasses routing table)

**How it works**:
1. Your node connects directly to the peer's node
2. Fetches the repo from their local Radicle storage
3. No intermediary seeds involved

**Note**: The `peerNid` comes from the share link (`senderDid` parameter).

---

### 3. Sharing (Local Storage)

**File**: `radicle-service.ts:share()`

**Step 1: Push to local Radicle storage**
```bash
git push rad main
```

This pushes commits to **your local** `~/.radicle/storage/` - NOT to the network.

**Step 2: Make discoverable (publish)**
```bash
rad publish
```

Converts private → public (announces existence to network).
**Note**: For direct P2P only, this may not be needed if peers have your NID.

---

### 4. Seeding Policy

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

### 5. Fetching Updates

**File**: `coherence-beacon/service.ts:checkForBeacons()`

```bash
rad sync --fetch
```

Fetches from peers in your routing table. For direct P2P, you need to have the peer followed.

**To fetch from a specific peer**:
```bash
rad sync --fetch --seed <nid>
```

---

### 6. Peer Following

**File**: `radicle-service.ts:followPeer()`

```bash
rad follow <nid>
```

Adds peer to your trusted list. Their content will be fetched when available.

**Note**: Accepts both raw NID (`z6Mk...`) and DID format (`did:key:z6Mk...`).

---

### 7. Adding Delegates

**File**: `radicle-service.ts:addDelegate()`

```bash
rad id update --delegate "<did>" --threshold 1
```

Makes peer an equal collaborator (can push to your repo).

---

### 8. Git Remote Format

Radicle git remotes use this format:
```
rad://<rid>/<nid>
```

Example:
```bash
git remote add alice rad://z1234.../z6Mk...
```

When Alice fetches from this remote, git talks to Radicle which connects to that peer.

---

## The Complete Flow

### David creates a DreamNode:
```
rad init --private           # Creates in local storage, auto-seeded
git add . && git commit       # Normal git workflow
git push rad main             # Pushes to LOCAL Radicle storage
```

### David shares with Alice:
```
# David gives Alice a link containing:
# - radicleId: rad:z1234...
# - senderDid: did:key:z6Mk... (David's NID)
```

### Alice clones from David:
```
rad clone rad:z1234... --scope followed --seed z6Mk...
#                       ↑ only trust followed    ↑ fetch from David directly
```

### Later, Alice checks for updates:
```
git fetch david              # Fetches from David's node (if online)
# or
rad sync --fetch             # Fetches from all followed peers
```

---

## Key Differences from "Public" Radicle

| Aspect | InterBrain (Private) | Public Radicle |
|--------|---------------------|----------------|
| Init | `--private` (not announced) | Default (announced) |
| Clone | `--scope followed --seed <nid>` | `--scope all` (any seed) |
| Seed | `--scope followed` | `--scope all` |
| Discovery | Direct link sharing | Network gossip |
| Availability | Peer must be online | Always via seeds |

---

## Code Locations

| Operation | File | Method |
|-----------|------|--------|
| Initialize | `radicle-service.ts` | `init()` |
| Clone | `radicle-service.ts` | `clone()` |
| Clone (URI) | `uri-handler-service.ts` | `cloneFromRadicle()` |
| Share | `radicle-service.ts` | `share()` |
| Follow Peer | `radicle-service.ts` | `followPeer()` |
| Add Delegate | `radicle-service.ts` | `addDelegate()` |
| Set Scope | `radicle-service.ts` | `setSeedingScope()` |
| Background Seed | `radicle-service.ts` | `seedInBackground()` |

---

## Verification Checklist

- [x] `rad init --private` used (no `--no-seed`)
- [x] `rad clone --scope followed --seed <nid>` used
- [x] `git push rad main` for local storage
- [x] `rad seed --scope followed` for seeding policy
- [x] `rad follow` for peer subscription
- [x] `rad id update --delegate` for collaboration
- [x] No `--scope all` anywhere in the codebase

---

## Sources

- [Radicle User Guide](https://radicle.xyz/guides/user)
- [Radicle 1.5.0 Release Notes](https://radicle.xyz/2025/09/30/radicle-1.5.0)
- Local CLI help: `rad <command> --help` (v1.5.0)
