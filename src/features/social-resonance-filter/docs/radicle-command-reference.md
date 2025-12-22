# Radicle Command Reference for InterBrain

**Version**: Radicle CLI 1.5.0
**Last Updated**: 2025-12-22
**Purpose**: Document the exact Radicle commands used by InterBrain and verify they align with the privacy-first direct P2P model.

## Privacy Model Summary

InterBrain uses **direct P2P** mode where:
- Repos are cloned from **known peers** (via `--seed` flag or routing table)
- Changes propagate only to **connected peers**, not public seeds
- Scope is set to `followed` for privacy, `all` for public sharing

| Mode | Command Pattern | Privacy | Availability |
|------|-----------------|---------|--------------|
| **Private/Direct** | `rad clone RID --seed <nid>` | High | Peer must be online |
| **Public/Seeds** | `rad clone RID --scope all` | Low | Always via seeds |

---

## Commands Used by InterBrain

### 1. Repository Initialization

**File**: `radicle-service.ts:init()`

```bash
rad init <path> --private --default-branch main --no-confirm --no-seed --name <name>
```

**Flags**:
- `--private`: Repository not announced to network (stays local until shared)
- `--no-seed`: Don't replicate to public seeds
- `--name`: Required for non-TTY mode

**Privacy**: ✅ Correct - private by default

---

### 2. Repository Cloning

**File**: `radicle-service.ts:clone()`

```bash
rad clone <rid> --scope all
```

**Current Behavior**: Uses `--scope all` which subscribes to ALL peers' content.

**Analysis**:
- `--scope all` is appropriate for public DreamNodes
- For private collaboration, should use `--scope followed` + `--seed <nid>`

**CLI Options** (from `rad clone --help`):
```
--scope <scope>     Follow scope: `followed` or `all` (default: all)
-s, --seed <nid>    Clone from this seed (may be specified multiple times)
```

**Recommendation**: The current implementation is correct for InterBrain's public sharing model. Private repos would need additional UI to specify seed nodes.

---

### 3. Sharing/Publishing

**File**: `radicle-service.ts:share()`

**Step 1: Push commits to Radicle storage**
```bash
git push rad main
```

**Step 2: Convert to public (if needed)**
```bash
rad publish
```

**Step 3: Announce to network**
```bash
rad sync --inventory
```

**Privacy Analysis**:
- `rad publish` makes repo visible on network
- `rad sync --inventory` announces availability to peers
- This is the **intentional transition** from private to public

---

### 4. Fetching Updates

**File**: `coherence-beacon/service.ts:checkForBeacons()`

```bash
rad sync --fetch
```

**CLI Options** (from `rad sync --help`):
```
-f, --fetch                   Turn on fetching (default: true)
    --seed          <nid>     Sync with the given node (may be specified multiple times)
-r, --replicas      <count>   Sync with a specific number of seeds
```

**Note**: There is NO `--peer` flag. To fetch from specific peers, use `--seed <nid>`.

---

### 5. Peer Following

**File**: `radicle-service.ts:followPeer()`

```bash
rad follow <did>
```

**Purpose**: Subscribe to updates from a specific peer's Node ID (NID).

**Note**: Accepts both raw NID (`z6Mk...`) and DID format (`did:key:z6Mk...`).

---

### 6. Adding Delegates

**File**: `radicle-service.ts:addDelegate()`

```bash
rad id update --delegate "<did>" --threshold 1 --title "..." --description "..."
```

**Purpose**: Add peer as equal collaborator with threshold=1 (single signature required).

---

### 7. Seeding Configuration

**File**: `radicle-service.ts:setSeedingScope()` and `seedInBackground()`

```bash
# Set scope (with no-fetch to avoid blocking)
rad seed "<rid>" --scope followed --no-fetch

# Full seed operation (background)
rad seed <rid> --scope all
```

**CLI Options** (from `rad seed --help`):
```
--[no-]fetch           Fetch repository after updating seeding policy
--from <nid>           Fetch from the given node (may be specified multiple times)
--scope <scope>        Peer follow scope for this repository
```

**Scopes**:
- `all`: Replicate content from ALL remote nodes
- `followed`: Only replicate from delegates + explicitly followed nodes

---

### 8. Peer Discovery (Routing Table)

**File**: `radicle-service.ts:getSeeders()`

```bash
rad node routing --rid <rid> --json
```

**Output Format** (JSON lines):
```json
{"rid":"rad:z...","nid":"z6Mk..."}
```

**Purpose**: Discover which peers are seeding a repository.

---

### 9. Node Management

**Files**: Various

```bash
# Check if node is running
rad node
# Output: "✓ Node is running with Node ID z6Mk..."

# Start node
rad node start

# Get status with only NID
rad node status --only nid
```

---

### 10. Git Remote Management

**File**: `radicle-service.ts:addPeerRemote()`

Git remotes for Radicle use the format:
```
rad://<rid>/<nid>
```

Example:
```bash
git remote add alice rad://z1234.../z6Mk...
```

**Note**: Both RID and NID should be stripped of prefixes (`rad:` and `did:key:`).

---

## Key Findings from Audit

### 1. No `--peer` Flag Exists

The `rad sync` command does NOT have a `--peer` flag. To fetch from specific peers:
- Use `--seed <nid>` on `rad sync` or `rad clone`
- Or use `--from <nid>` on `rad seed`

### 2. Scope Terminology

| Scope | Meaning |
|-------|---------|
| `all` | Subscribe to content from ALL nodes (public) |
| `followed` | Only delegates + explicitly followed nodes (private) |

### 3. Push Destination

`git push rad main` pushes to local Radicle storage. Network propagation happens via:
- `rad sync --announce` (announce refs to peers)
- `rad sync --inventory` (announce repository existence)

---

## Code Locations

| Operation | File | Method |
|-----------|------|--------|
| Initialize | `radicle-service.ts` | `init()` |
| Clone | `radicle-service.ts` | `clone()` |
| Share/Publish | `radicle-service.ts` | `share()` |
| Follow Peer | `radicle-service.ts` | `followPeer()` |
| Add Delegate | `radicle-service.ts` | `addDelegate()` |
| Set Scope | `radicle-service.ts` | `setSeedingScope()` |
| Get Seeders | `radicle-service.ts` | `getSeeders()` |
| Background Seed | `radicle-service.ts` | `seedInBackground()` |
| Fetch (beacon) | `coherence-beacon/service.ts` | `checkForBeacons()` |
| Clone (URI) | `uri-handler-service.ts` | `cloneFromRadicle()` |
| Sync Peers | `peer-sync-service.ts` | `syncPeerFollowing()` |

---

## Verification Checklist

- [x] `rad init --private` used for initial creation
- [x] `rad clone --scope all` used for public cloning
- [x] `git push rad main` for local storage
- [x] `rad sync --inventory` for network announcement
- [x] `rad follow` for peer subscription
- [x] `rad id update --delegate` for collaboration
- [x] `rad seed --scope` for replication policy
- [x] `rad node routing --json` for peer discovery

---

## Sources

- [Radicle User Guide](https://radicle.xyz/guides/user)
- [Radicle 1.5.0 Release Notes](https://radicle.xyz/2025/09/30/radicle-1.5.0)
- Local CLI help: `rad <command> --help` (v1.5.0)
