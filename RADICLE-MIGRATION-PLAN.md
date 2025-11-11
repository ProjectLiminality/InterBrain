# Radicle-Centric Architecture Migration Plan (AI Context)

**Status**: Planning Phase - Simplified Approach
**Created**: 2025-01-10
**Updated**: 2025-01-10 (Major simplification + roadmap extraction)
**Goal**: Refactor from dual Git/Radicle services to unified RadicleService with Radicle as single source of truth

---

## Document Purpose

**For Humans**: See `MIGRATION-ROADMAP.md` (compact, actionable)
**For AI**: This document (detailed implementation context, code examples, edge cases)

---

## Executive Summary

### The Core Insight
Radicle and Git are inseparable in our architecture. Every collaboration operation involves both. Stop treating them as separate concerns.

### The Breakthrough Simplification 🎯
**UUID is just a string.** Instead of complex schema restructuring, we simply:
1. Replace UUID value with Radicle ID (string swap, not schema change)
2. Keep existing fields (`type`, `radicleId`) for backward compatibility
3. Move relationships to separate `liminal-web.json` in Dreamer nodes only
4. Every node (Dream AND Dreamer) = Radicle repo from creation

**Result**: ~70% reduction in migration complexity!

### The Vision
- **One Service**: `RadicleService` (renamed from current, absorbing GitService)
- **One Source of Truth**: Radicle metadata drives Liminal Web (no parallel UUID graphs)
- **One-Directional Flow**: Radicle → UI (InterBrain adapts to Radicle, never interferes)
- **Organic Emergence**: `followed ∩ delegates` = collaboration edges (automatic)
- **Every Node is Radicle**: Dream AND Dreamer nodes both get `rad init` (local repos, no network needed)

### Current Problem
Three services (GitService, RadicleService, CoherenceBeaconService) with overlapping responsibilities. URIHandlerService duplicates clone logic. Metadata divergence between `.udd` files and Radicle state.

---

## The Simplified Schema (Backward Compatible)

### Before (Complex Migration):
```json
// Planned: Complete restructuring
{
  "id": "rad:z2u..." or "did:key:z6Mks...",  // New field
  "title": "Square",
  // Remove: uuid, radicleId, type, liminalWebRelationships
}
```
❌ **Problem**: Breaking change, all code needs updates

### After (Simple String Swap):
```json
// Actually: Just replace UUID value!
{
  "uuid": "rad:z2u2ABsquare...",         // ← Just swap the string!
  "type": "dream",                       // Keep (doesn't hurt)
  "radicleId": "rad:z2u2ABsquare...",   // Keep (redundant but safe)
  "title": "Square",
  "dreamTalk": "Square.png",
  "submodules": [],
  "supermodules": []
  // NO liminalWebRelationships here (moved to separate file)
}
```
✅ **Result**: All existing code that reads `node.uuid` continues working!

### Dreamer Nodes with Optional DID:
```json
// Historical figure (no network identity)
{
  "uuid": "rad:z2KrishnamurtiABC...",   // Local Radicle repo ID
  "type": "dreamer",
  "title": "Jiddu Krishnamurti",
  "did": null,                           // No peer DID (can't collaborate)
  "email": null,
  "birthYear": 1895
}

// Living peer (has network identity)
{
  "uuid": "rad:z2AliceXYZ...",          // Local Radicle repo ID
  "type": "dreamer",
  "title": "Alice",
  "did": "did:key:z6MksAlice...",       // Peer DID for collaboration
  "email": "alice@example.com"
}
```

### New: Liminal Web Relationships (Separate File)

**Structure for Dreamer nodes ONLY**:
```
DreamerNodes/Alice/
├── .udd                          # Core metadata (no relationships)
├── liminal-web.json              # ← NEW: Relationships only
├── README.md
└── .git/
```

**`liminal-web.json`**:
```json
{
  "relationships": [
    "rad:z2SquareABC...",          // Points to Square Dream
    "rad:z2CircleDEF...",          // Points to Circle Dream
    "rad:z2TriangleGHI..."         // Points to Triangle Dream
  ],
  "lastSyncedFromRadicle": "2025-01-10T12:34:56Z"
}
```

**Why separate file**:
- ✅ Can version control (git tracks changes)
- ✅ Can `.gitignore` when sharing as submodule (privacy)
- ✅ No merge conflicts (private to your perspective)
- ✅ Radicle sync updates non-destructively (only adds, never removes)

---

## Key Architectural Decisions

### 1. Every Node is a Radicle Repo (Dream AND Dreamer)

**Both types get `rad init` on creation**:
- ✅ No network needed (local Radicle repos)
- ✅ Radicle ID = free unique identifier
- ✅ Version control built-in
- ✅ No UUID generation logic needed

**Distinction via behavior, not structure**:
- **Dream nodes**: `git push rad main` (shared via network)
- **Dreamer nodes**: Stay local (private, no push)

### 2. Unidirectional Relationships (No Merge Conflicts)

**Old approach** (bidirectional in Dream nodes):
```
Square/.udd:  liminalWebRelationships: [Alice-UUID, Bob-UUID]
Alice/.udd:   liminalWebRelationships: [Square-UUID]
Bob/.udd:     liminalWebRelationships: [Square-UUID]
```
→ **Problem**: Merge conflicts when both add relationships

**New approach** (unidirectional in Dreamer nodes):
```
Alice/liminal-web.json:  relationships: [Square-RID, Circle-RID]
Bob/liminal-web.json:    relationships: [Square-RID, Triangle-RID]
```
→ **No conflicts**: Each person's relationships are private!

**UI interpretation**:
- If Alice points to Square → Edge appears (Alice ↔ Square)
- No need for Square to "point back"

### 3. Non-Destructive Radicle Sync

**"Sync from Radicle" command**:
- Queries Radicle for peer's delegations
- ADDS newly discovered relationships to `liminal-web.json`
- NEVER removes existing relationships (supports non-networked nodes like Krishnamurti)
- Only processes Dreamer nodes with DIDs

### 4. Support for Non-Networked Dreamer Nodes

**Use cases**:
- Historical figures (Krishnamurti, Alan Watts, etc.)
- Fictional characters
- Concepts personified
- Future contacts (not yet onboarded)

**Behavior**:
- ✅ Appears in constellation
- ✅ Can link to Dream nodes manually
- ❌ Never appears in Radicle queries (no DID)
- ❌ "Sync from Radicle" skips them
- ✅ Relationships preserved (version controlled)

---

## Fundamental Operations (Radicle-Native Ontology)

These are the **atomic operations** that the new RadicleService should expose:

### A. Creation (Step Zero of Collaboration)
```typescript
async createDreamNode(title: string, type: 'dream' | 'dreamer'): Promise<DreamNode> {
  // 1. Create directory
  const repoPath = path.join(vaultPath, title);
  await fs.mkdir(repoPath);

  // 2. rad init (creates both Radicle + git)
  await execAsync(`rad init --name "${title}" --public --default-branch main`, { cwd: repoPath });

  // 3. Get Radicle ID
  const { stdout } = await execAsync('rad .', { cwd: repoPath });
  const radicleId = stdout.trim(); // e.g., "rad:z2u2AB..."

  // 4. Write .udd with RID as UUID
  const udd = {
    uuid: radicleId,        // ← The key change!
    type,
    radicleId,             // Keep for now (redundant but safe)
    title,
    dreamTalk: '',
    submodules: [],
    supermodules: []
  };
  await writeUDD(repoPath, udd);

  // 5. If Dreamer: create liminal-web.json
  if (type === 'dreamer') {
    await fs.writeFile(
      path.join(repoPath, 'liminal-web.json'),
      JSON.stringify({ relationships: [], lastSyncedFromRadicle: null }, null, 2)
    );
  }

  // 6. Initial commit
  await execAsync('git add .', { cwd: repoPath });
  await execAsync(`git commit -m "Initialize ${type} node: ${title}"`, { cwd: repoPath });

  // 7. For Dream nodes: push to network
  //    For Dreamer nodes: stay local
  if (type === 'dream') {
    await execAsync('git push rad main', { cwd: repoPath });
  }

  return { uuid: radicleId, type, title, repoPath };
}
```

**Key Changes**:
- No more `git init` followed by optional `rad init`
- Radicle repos from day one (both types)
- Dreamer nodes stay local (no network push)

### B. Saving Locally (Commit Without Sharing)
```typescript
async save(dreamNodePath: string, message: string): Promise<void> {
  // 1. git add -A
  // 2. git commit -m <message>
  // (Do NOT push - stays local until "Share Changes")
}
```

### C. Sharing (Make Changes Available)
```typescript
async share(dreamNodePath: string): Promise<void> {
  // 1. Check for uncommitted changes → auto-commit if needed
  // 2. git push rad main
  // 3. rad sync --announce (optional, faster propagation)
}
```

### D. Receiving (Clone from Peer)
```typescript
async cloneFromPeer(radicleId: string, peerDID: string, peerName: string): Promise<CloneResult> {
  // 1. rad clone <RID>
  // 2. rad follow <peer-DID> --alias <peerName> (global trust)
  // 3. rad id update --delegate <peer-DID> --threshold 1 (equal authority)
  // 4. rad seed <RID> --scope followed (only followed peers)
  // 5. git remote add <peerName> rad://<RID>/<peer-DID>
  // 6. Create Dreamer node for peer (if not exists)
  // 7. Link cloned Dream → Dreamer (update .udd relationships)
  // 8. Return { repoName, dreamerNode }
}
```

### E. Checking for Updates (Fetch + Preview)
```typescript
async checkForUpdates(dreamNodeRID: string): Promise<Update[]> {
  // 1. Query followed peers: rad follow --list
  // 2. Query delegates: rad id show <RID>
  // 3. Intersection = collaborators (followed ∩ delegates)
  // 4. For each collaborator:
  //    - rad sync (fetch from network)
  //    - git fetch <peer>
  //    - git log HEAD..<peer>/main --oneline
  // 5. Return Update[] with { peerName, commitCount, commits[] }
}
```

**Key Insight**: No custom state needed. Pure Radicle query + git log.

### F. Accepting Updates (Merge)
```typescript
async acceptUpdate(dreamNodePath: string, peerName: string): Promise<MergeResult> {
  // 1. git merge <peer>/main
  // 2. If conflicts: return { success: false, conflicts: [...] }
  // 3. If success: git push rad main && rad sync --announce
  // 4. Return { success: true }
}
```

---

## New RadicleService Structure (Proposed)

```typescript
export class RadicleService {
  // === CREATION & INITIALIZATION ===
  createDreamNode(title: string, type: 'dream' | 'dreamer'): Promise<DreamNode>
  isAvailable(): Promise<boolean>
  getIdentity(): Promise<RadicleIdentity>

  // === LOCAL OPERATIONS ===
  save(path: string, message: string): Promise<void>
  getStatus(path: string): Promise<GitStatus>
  getHistory(path: string, limit?: number): Promise<Commit[]>
  hasUncommittedChanges(path: string): Promise<boolean>
  hasUnpushedCommits(path: string): Promise<boolean>

  // === SHARING (PUSH) ===
  share(path: string): Promise<void>
  hasChangesToShare(path: string): Promise<boolean>

  // === RECEIVING (CLONE) ===
  cloneFromPeer(radicleId: string, peerDID: string, peerName: string): Promise<CloneResult>

  // === UPDATES (FETCH + MERGE) ===
  getCollaborators(radicleId: string): Promise<Peer[]>
  checkForUpdates(radicleId: string): Promise<Update[]>
  acceptUpdate(path: string, peerName: string): Promise<MergeResult>

  // === RADICLE NETWORK QUERIES ===
  getFollowedPeers(): Promise<Peer[]>              // rad follow --list
  getDelegates(radicleId: string): Promise<DID[]>  // rad id show <RID>
  getRadicleId(path: string): Promise<string | null>

  // === INTERNAL HELPERS (PRIVATE) ===
  private radSync(path: string): Promise<void>
  private radInit(path: string, name: string): Promise<void>
  private radClone(radicleId: string, dest: string): Promise<string>
  private followPeer(did: string, name: string): Promise<void>
  private addDelegate(path: string, did: string, name: string): Promise<void>
  private setSeedingScope(path: string, radicleId: string): Promise<void>
  private addPeerRemote(path: string, name: string, rid: string, did: string): Promise<void>
  private gitAdd(path: string, files?: string): Promise<void>
  private gitCommit(path: string, message: string): Promise<void>
  private gitPush(path: string, remote: string, branch: string): Promise<void>
  private gitFetch(path: string, remote: string): Promise<void>
  private gitMerge(path: string, remote: string): Promise<MergeResult>
  private gitLog(path: string, range?: string): Promise<Commit[]>
  private gitStatus(path: string): Promise<GitStatus>
}
```

---

## Code Migration Hot Spots

### Duplication to Eliminate

1. **Clone + Collaboration Handshake**
   - **Current**: URIHandlerService (419-541) + RadicleService (548-725)
   - **Both**: Follow peer, add delegate, seed repo
   - **New**: `RadicleService.cloneFromPeer()` (single implementation)

2. **Git Push**
   - **Current**: GitService.push() + RadicleService.share()
   - **New**: `RadicleService.share()` (combines commit + push rad)

3. **Status Checking**
   - **Current**: GitService (getUnpushedCommits, hasUncommittedChanges) + RadicleService (hasChangesToShare)
   - **New**: `RadicleService.getStatus()` (unified)

4. **Submodule Logic**
   - **Current**: CoherenceBeaconService (331-418) + GitService
   - **New**: Part of `RadicleService.cloneFromPeer()` flow

---

## Critical Migration Considerations

### ⚠️ METADATA SCHEMA CHANGE

**Old Schema** (UUID-based):
```json
{
  "uuid": "9e917053-6405-4e43-8360-efebccac3a00",
  "radicleId": "rad:z2bXt4w83tRJD8WykjQtBm7tjMbBe",
  "type": "dream",
  "liminalWebRelationships": ["caafc13b-..."],
  "submodules": [],
  "supermodules": []
}
```

**New Schema** (Radicle-native):
```json
{
  "id": "rad:z2bXt4w83tRJD8WykjQtBm7tjMbBe",  // Dream node
  // OR
  "id": "did:key:z6MksAEMTumQbRK1...",          // Dreamer node

  "title": "Square",
  "dreamTalk": "Square.png",
  "submodules": [],
  "supermodules": []
  // NO uuid field
  // NO radicleId field (redundant with id)
  // NO type field (inferred from id format)
  // NO liminalWebRelationships (read from Radicle)
}
```

**Migration Strategy**:
- **Phase 1**: Support BOTH schemas (read old, write new)
- **Phase 2**: Migration command to convert all `.udd` files
- **Phase 3**: Remove old schema support

### ⚠️ LIMINAL WEB RELATIONSHIPS

**Old Approach**: Stored in `.udd` → `liminalWebRelationships` array
**New Approach**: Computed from Radicle queries

**Critical Commands Affected**:
1. **"Sync Bidirectional Relationships"** → OBSOLETE or becomes "Sync from Radicle"
2. **"Scan Vault for Relationships"** → Becomes "Query Radicle for Collaborators"
3. **"Add Relationship"** → Becomes "Follow Peer + Add Delegate"

**New Relationship Query**:
```typescript
async getLiminalWebEdges(dreamNodeRID: string): Promise<Edge[]> {
  const followed = await rad.getFollowedPeers();
  const delegates = await rad.getDelegates(dreamNodeRID);

  // Intersection = edges
  return followed
    .filter(peer => delegates.includes(peer.did))
    .map(peer => ({ dreamer: peer.did, dreamNode: dreamNodeRID }));
}
```

### ⚠️ EXISTING DREAMNODES (NON-RADICLE)

**Problem**: Users may have DreamNodes that are git repos but NOT Radicle repos yet.

**Detection**:
```bash
rad . # Returns RID or error
```

**Strategy**:
- **Option A**: Lazy initialization (convert to Radicle on first share)
- **Option B**: Batch migration command ("Initialize all nodes as Radicle repos")
- **Option C**: Show warning badge in UI ("Not yet shareable - initialize Radicle")

**Recommendation**: Option A (lazy) + Option C (visibility)

### ⚠️ COHERENCE BEACON SYSTEM

**Current**: Custom git log parsing + beacon metadata
**Future**: Integrate with `RadicleService.checkForUpdates()`

**Changes Needed**:
- CoherenceBeaconService should USE RadicleService, not duplicate logic
- Beacon detection can stay custom (COHERENCE_BEACON metadata)
- Clone flow should use `RadicleService.cloneFromPeer()`

**Keep**: Beacon accept/reject workflow (still valuable)
**Refactor**: Use RadicleService for underlying operations

### ⚠️ URI HANDLER SERVICE

**Current**: 1041 lines, duplicates clone + handshake logic
**Future**: Thin wrapper around RadicleService

**Before**:
```typescript
// 130 lines of clone logic
const cloneResult = await this.radicleService.clone(...);
await this.radicleService.followPeer(...);
await this.radicleService.addDelegate(...);
// etc.
```

**After**:
```typescript
// 5 lines
const result = await this.radicleService.cloneFromPeer(rid, did, name);
await this.autoFocusNode(result.repoName);
```

### ⚠️ RADIAL BUTTON COMMANDS

**Current Mapping**:
- "Save Changes" → `interbrain:save-dreamnode`
- "Share Changes" → `interbrain:push-to-network`
- "Check for Updates" → `interbrain:preview-updates`

**New Mapping** (same command IDs, new implementations):
- "Save Changes" → `RadicleService.save()`
- "Share Changes" → `RadicleService.share()`
- "Check for Updates" → `RadicleService.checkForUpdates()`

**No UI changes needed** - just rewire command implementations.

---

## Incremental Migration Strategy (Aligned with Roadmap)

**See MIGRATION-ROADMAP.md for high-level overview**

This section provides detailed implementation notes for AI context.

---

### Phase 1: Metadata Foundation (2-3 days)
**Roadmap**: Update creation + migrate existing data

**Step 1.1**: Update `createDreamNode()` in RadicleService
```typescript
async createDreamNode(title: string, type: 'dream' | 'dreamer'): Promise<DreamNode> {
  // 1. Create directory
  const repoPath = path.join(vaultPath, title);
  await fs.mkdir(repoPath);

  // 2. rad init (creates both Radicle + git)
  await execAsync(`rad init --name "${title}" --public --default-branch main`, { cwd: repoPath });

  // 3. Get Radicle ID
  const { stdout } = await execAsync('rad .', { cwd: repoPath });
  const radicleId = stdout.trim(); // e.g., "rad:z2u2AB..."

  // 4. Write .udd with RID as UUID
  const udd = {
    uuid: radicleId,        // ← KEY CHANGE: Use RID as UUID
    type,
    radicleId,             // Keep for backward compat
    title,
    dreamTalk: '',
    submodules: [],
    supermodules: []
  };
  await writeUDD(repoPath, udd);

  // 5. If Dreamer: create liminal-web.json
  if (type === 'dreamer') {
    await fs.writeFile(
      path.join(repoPath, 'liminal-web.json'),
      JSON.stringify({ relationships: [], lastSyncedFromRadicle: null }, null, 2)
    );
  }

  // 6. Initial commit
  await execAsync('git add .', { cwd: repoPath });
  await execAsync(`git commit -m "Initialize ${type} node: ${title}"`, { cwd: repoPath });

  // 7. For Dream nodes: push to network
  //    For Dreamer nodes: stay local
  if (type === 'dream') {
    await execAsync('git push rad main', { cwd: repoPath });
  }

  return { uuid: radicleId, type, title, repoPath };
}
```

**Step 1.2**: Migration script for existing Dreamer nodes
```typescript
async function migrateExistingDreamerNodes(): Promise<void> {
  const dreamNodes = await scanVault();

  for (const node of dreamNodes) {
    if (node.type !== 'dreamer') continue;

    const liminalWebPath = path.join(node.repoPath, 'liminal-web.json');
    const exists = await fs.access(liminalWebPath).then(() => true).catch(() => false);

    if (!exists) {
      // Read old relationships from .udd
      const udd = await readUDD(node.repoPath);
      const oldRelationships = udd.liminalWebRelationships || [];

      // Create new liminal-web.json
      await fs.writeFile(
        liminalWebPath,
        JSON.stringify({
          relationships: oldRelationships,
          lastSyncedFromRadicle: null
        }, null, 2)
      );

      // Commit the change
      await execAsync('git add liminal-web.json', { cwd: node.repoPath });
      await execAsync('git commit -m "Migrate relationships to liminal-web.json"', { cwd: node.repoPath });

      console.log(`Migrated ${node.title}`);
    }
  }
}
```

**Step 1.3**: Add legacy UUID detection
```typescript
function isRadicleId(uuid: string): boolean {
  return uuid.startsWith('rad:') || uuid.startsWith('did:key:');
}

async function getNodeIdentifier(node: DreamNode): Promise<string> {
  if (isRadicleId(node.uuid)) return node.uuid;

  // Legacy: try to get RID from repo
  try {
    const { stdout } = await execAsync('rad .', { cwd: node.repoPath });
    return stdout.trim();
  } catch {
    return node.uuid; // Fallback to old UUID
  }
}
```

**Validation**:
- New nodes have `uuid: "rad:*"` or `uuid: "did:key:*"`
- Existing Dreamer nodes gain `liminal-web.json`
- Old UUID nodes still load without errors

**Checkpoint**: Metadata structure correct for both new and legacy data.

---

### Phase 2: Mock Radicle System (1-2 days)
**Roadmap**: In-codebase simulation for rapid iteration

**Step 2.1**: Create `MockRadicleService`
```typescript
export class MockRadicleService {
  private mockFollowed: Map<string, Peer> = new Map();
  private mockDelegates: Map<string, string[]> = new Map();

  // Simulate rad follow --list
  async getFollowedPeers(): Promise<Peer[]> {
    return Array.from(this.mockFollowed.values());
  }

  // Simulate rad id show <RID>
  async getDelegates(radicleId: string): Promise<string[]> {
    return this.mockDelegates.get(radicleId) || [];
  }

  // Simulate rad init
  async init(path: string, name: string): Promise<string> {
    const fakeRID = `rad:z2${name.substring(0, 8)}MockRID`;
    return fakeRID;
  }

  // Add mock data helpers
  addMockPeer(did: string, name: string): void {
    this.mockFollowed.set(did, { did, alias: name });
  }

  addMockDelegate(radicleId: string, did: string): void {
    const delegates = this.mockDelegates.get(radicleId) || [];
    delegates.push(did);
    this.mockDelegates.set(radicleId, delegates);
  }
}
```

**Step 2.2**: Populate mock data matching real Radicle
```typescript
// In test setup or dev mode initialization
const mock = new MockRadicleService();

// Alice's identity
const aliceDID = 'did:key:z6MksAliceMockDID...';
mock.addMockPeer(aliceDID, 'Alice');

// Bob's identity
const bobDID = 'did:key:z6MksBobMockDID...';
mock.addMockPeer(bobDID, 'Bob');

// Square repo with both as delegates
const squareRID = 'rad:z2SquareMockRID...';
mock.addMockDelegate(squareRID, aliceDID);
mock.addMockDelegate(squareRID, bobDID);
```

**Validation**:
- Mock data structure matches real `rad` CLI output format
- Queries return expected intersection (`followed ∩ delegates`)

**Checkpoint**: Mock system enables fast UI iteration without network.

---

### Phase 3: UI Integration + Legacy Support (2-3 days)
**Roadmap**: Wire UI to mock, handle old data gracefully

**Step 3.1**: Update relationship reading logic
```typescript
async function getLiminalWebEdges(): Promise<Edge[]> {
  const edges: Edge[] = [];
  const dreamNodes = await scanVault();

  for (const dreamer of dreamNodes.filter(n => n.type === 'dreamer')) {
    const liminalWebPath = path.join(dreamer.repoPath, 'liminal-web.json');

    try {
      const data = await fs.readFile(liminalWebPath, 'utf-8');
      const { relationships } = JSON.parse(data);

      for (const dreamRID of relationships) {
        edges.push({
          dreamer: await getNodeIdentifier(dreamer),
          dream: dreamRID
        });
      }
    } catch (error) {
      // Fallback to old .udd format
      const udd = await readUDD(dreamer.repoPath);
      const oldRelationships = udd.liminalWebRelationships || [];

      for (const dreamUUID of oldRelationships) {
        edges.push({
          dreamer: await getNodeIdentifier(dreamer),
          dream: dreamUUID
        });
      }
    }
  }

  return edges;
}
```

**Step 3.2**: Update relationship writing logic
```typescript
async function linkNodes(dreamerNode: DreamNode, dreamNode: DreamNode): Promise<void> {
  const liminalWebPath = path.join(dreamerNode.repoPath, 'liminal-web.json');

  // Read current relationships
  const data = await fs.readFile(liminalWebPath, 'utf-8');
  const liminalWeb = JSON.parse(data);

  // Add new relationship
  const dreamId = await getNodeIdentifier(dreamNode);
  if (!liminalWeb.relationships.includes(dreamId)) {
    liminalWeb.relationships.push(dreamId);

    // Write and commit
    await fs.writeFile(liminalWebPath, JSON.stringify(liminalWeb, null, 2));
    await execAsync('git add liminal-web.json', { cwd: dreamerNode.repoPath });
    await execAsync('git commit -m "Link to dream node"', { cwd: dreamerNode.repoPath });
  }
}
```

**Step 3.3**: Test with old vault data
- Load vault with legacy UUID nodes
- Verify constellation renders correctly
- Test creating new links (should use new format)
- Verify no errors or warnings

**Validation**:
- Mock service returns correct data
- UI shows edges for both new and old formats
- Old vaults load without errors
- New relationships use Radicle IDs

**Checkpoint**: UI works with mock data AND legacy vaults.

---

### Phase 4: Real Radicle Testing (2-3 days)
**Roadmap**: Switch to real `rad` CLI, validate assumptions

**Step 4.1**: Toggle to real RadicleService
```typescript
// Feature flag or environment variable
const useRealRadicle = process.env.RADICLE_REAL === 'true';
const radicleService = useRealRadicle
  ? new RadicleService()
  : new MockRadicleService();
```

**Step 4.2**: Test creation flow
- Create new Dream node → verify `rad init` runs
- Create new Dreamer node → verify local repo only
- Check `.udd` files have `uuid: "rad:*"`

**Step 4.3**: Test collaboration flow
- Share Dream node from vault A
- Clone into vault B via URI
- Verify follow + delegate setup
- Check for updates
- Accept update → verify merge

**Step 4.4**: Test with legacy data
- Load old vault with UUID nodes
- Verify reads work correctly
- Create new node → verify uses new format
- Link old node to new node → verify works

**Validation**:
- Real `rad` commands return expected output
- Mock assumptions were correct (or fix discrepancies)
- End-to-end collaboration works
- Legacy data continues functioning

**Checkpoint**: Real Radicle integration complete, tested with both new and old data.

---

## Timeline

- **Phase 1**: Metadata foundation (2-3 days)
- **Phase 2**: Mock system (1-2 days)
- **Phase 3**: UI integration + legacy (2-3 days)
- **Phase 4**: Real Radicle testing (2-3 days)

**Total: ~7-11 days** (simplified from original 15-18 days)

---

## What This Simplification Avoids

### ❌ Complexity Eliminated (Original Plan):

1. **Schema Restructuring**
   - Renaming `uuid` → `id` field (breaking change)
   - Removing `type` field (needs inference logic)
   - Removing `radicleId` field (redundancy concerns)
   - Removing `liminalWebRelationships` from all nodes
   - → **Impact**: Every file read/write affected

2. **Type Inference System**
   - Parse ID format (`rad:*` vs `did:key:*`)
   - Determine node type from identifier
   - Handle edge cases (malformed IDs)
   - → **Impact**: Complexity in every type check

3. **Bidirectional Sync Complexity**
   - Merge conflicts when both peers add relationships
   - Conflict resolution UI needed
   - Lost updates when perspectives diverge
   - → **Impact**: Complex merge logic

4. **Separate Dream/Dreamer Initialization**
   - Different creation flows per type
   - Conditional Radicle initialization
   - → **Impact**: More code paths to test

### ✅ What We Do Instead (Simplified):

1. **String Value Swap**
   - Just replace UUID value with Radicle ID
   - Keep all existing fields (backward compat)
   - → **Impact**: Minimal (one line change in creation)

2. **Keep Type Field**
   - No inference needed
   - Explicit is better than implicit
   - → **Impact**: Zero (already exists)

3. **Unidirectional Relationships**
   - Only Dreamer nodes hold pointers
   - Separate file (`liminal-web.json`)
   - No merge conflicts possible
   - → **Impact**: Cleaner than bidirectional

4. **Unified Initialization**
   - Both types: `rad init` → get RID → use as UUID
   - Differentiate via behavior (push vs stay local)
   - → **Impact**: Less code, easier to maintain

**Complexity Reduction: ~70%!** 🎯

---

## Testing Strategy

### Unit Tests (Per Phase)
- Test each RadicleService method in isolation
- Mock `execAsync` for git/rad commands
- Verify command construction and output parsing

### Integration Tests (Critical Paths)
1. **Creation Flow**: Create node → verify Radicle init → verify .udd schema
2. **Share Flow**: Create → save → share → verify git push rad
3. **Clone Flow**: Share link → clone → verify follow + delegate
4. **Update Flow**: Peer pushes → check updates → accept → verify merge

### Manual Testing Checklist
- [ ] Create new DreamNode (Dream + Dreamer types)
- [ ] Save changes locally (verify git commit)
- [ ] Share changes (verify rad push)
- [ ] Generate share link and clone on second machine
- [ ] Check for updates from peer
- [ ] Accept update and resolve conflicts (if any)
- [ ] Verify liminal web edges appear automatically
- [ ] Test Coherence Beacon acceptance
- [ ] Test GitHub fallback (if Radicle unavailable)

---

## Rollback Strategy

### If Migration Fails
1. **Revert to v1**: Set `useNewRadicleService = false` in feature flags
2. **Restore old schema**: Run `restoreLegacyUDDSchema()` migration (reverse)
3. **Keep both services**: Leave RadicleService v2 as experimental for future attempt

### Data Safety
- All `.udd` migrations keep `_legacy_uuid` backup field
- Git history preserves pre-migration state
- Migration command requires confirmation + creates backup branch

---

## Open Questions & Decisions Needed

### Q1: Lazy vs Eager Radicle Initialization
**Question**: Should existing git-only DreamNodes be converted immediately or on-demand?

**Options**:
- **A**: Lazy (convert on first share) ← **Recommended**
- **B**: Eager (batch migration command)
- **C**: Manual (user triggers per-node)

**Decision**: Start with A, provide B as optional command for power users.

---

### Q2: UUID Backward Compatibility
**Question**: Keep UUID field for legacy plugins/scripts?

**Options**:
- **A**: Remove entirely (clean break)
- **B**: Keep as `_legacy_uuid` (non-functional, just reference)
- **C**: Maintain dual identifiers (complex)

**Decision**: Use B for 1-2 releases, then A.

---

### Q3: Sync Bidirectional Relationships Command
**Question**: What happens to this command in new architecture?

**Options**:
- **A**: Delete (obsolete) ← **Recommended**
- **B**: Repurpose as "Sync from Radicle" (refresh cache)
- **C**: Keep for GitHub-only nodes (no Radicle)

**Decision**: B for now (useful for debugging), potentially A in future.

---

### Q4: GitHub-Only Nodes (No Radicle)
**Question**: How to handle clones from GitHub without Radicle?

**Current**: GitHub clone creates git repo with UUID in `.udd`
**Future**: Should GitHub clones also be Radicle repos?

**Options**:
- **A**: Yes, auto-initialize Radicle (may fail if user not set up)
- **B**: No, keep as git-only with UUID fallback
- **C**: Hybrid (try Radicle, fallback to git-only)

**Decision**: C (try Radicle, show non-blocking warning if fails).

---

## Success Criteria

### Migration is Complete When:
1. ✅ All radial buttons use RadicleService exclusively
2. ✅ URIHandlerService is <200 lines (thin wrapper)
3. ✅ GitService moved to `/legacy` (only advanced use)
4. ✅ All `.udd` files use new schema (`id` instead of `uuid`)
5. ✅ Liminal web edges computed from Radicle (no local storage)
6. ✅ Zero code duplication for clone/share/update flows
7. ✅ All tests pass (unit + integration + manual)
8. ✅ Documentation updated (README, CLAUDE.md, docs/)
9. ✅ No regressions in core workflows (save/share/clone/update)

---

## Timeline Estimate (Rough)

- **Phase 0**: 1 day (preparation)
- **Phase 1**: 3 days (core operations + tests)
- **Phase 2**: 5 days (clone/collaboration - high complexity)
- **Phase 3**: 2 days (metadata migration + validation)
- **Phase 4**: 2 days (command rewiring)
- **Phase 5**: 2 days (cleanup + documentation)
- **Phase 6**: 3 days (optional - Coherence Beacon)

**Total**: ~15-18 days of focused development + testing

---

## Next Steps (When Resuming)

1. **Review this document** - Fresh eyes, flag any gaps
2. **Create GitHub issue** - "Migrate to Radicle-Centric Architecture"
3. **Create feature branch** - `feature/radicle-service-v2`
4. **Start Phase 0** - Create v2 service file, implement first method
5. **Test incrementally** - Don't move to next phase until current one is solid
6. **Document learnings** - Update this plan as you discover edge cases

---

## References

- **README.md**: Radicle Architecture section (newly added)
- **Current Services**:
  - `src/services/git-service.ts` (1091 lines)
  - `src/services/radicle-service.ts` (929 lines)
  - `src/services/coherence-beacon-service.ts` (610 lines)
  - `src/services/uri-handler-service.ts` (1041 lines)
- **Radial Buttons**: `src/features/radial-buttons/radial-button-config.tsx`
- **Commands**: `src/commands/*.ts`

---

**Remember**: This is a refactor, not a rewrite. The goal is **incremental improvement** with **no regressions**. Move slowly, test thoroughly, keep rollback options open. The system works today - make it better without breaking what exists.

**Philosophy**: Trust Radicle's architecture. Build a beautiful window into the peer-to-peer network, not a replacement for it. Let the UI reflect Radicle reality, don't fight it.

---

*Document Version: 1.0*
*Last Updated: 2025-01-10*
*Status: Ready for Phase 0 execution when resuming work*
