# InterBrain Lifecycle Audit

## Overview

This document maps all async operations, their triggers, initialization order, and identifies race conditions.

## Async Operations Map

### Phase 1: Module Load (T=0ms)
| Operation | Trigger | Cost | Status |
|-----------|---------|------|--------|
| Zustand store creation | Module import | <1ms | Immediate |
| IndexedDB hydration | `skipHydration: true` prevents auto | 0ms | **DEFERRED** |

### Phase 2: Plugin.onload() (T=0-100ms)
| Operation | Trigger | Cost | Race Risk |
|-----------|---------|------|-----------|
| `setVaultId(vaultPath)` | First action | <1ms | None |
| `useInterBrainStore.persist.rehydrate()` | Manual trigger | 5-50ms | **HIGH** - blocks but IndexedDB may fail |
| `loadSettings()` | After hydration | 5-10ms | None |
| `initializeInferenceService()` | After settings | <1ms | None |
| `initializeErrorCapture()` | After store ready | <1ms | None |
| `initializeServices()` → `serviceManager.initialize()` | Sync | <1ms | Triggers vault scan |
| `initializeMediaLoadingService()` | After services | <1ms | None |
| URI/Radicle/GitHub batch init | After services | 1-5ms | None |
| `initializeBackgroundServices()` | setTimeout(100ms) | Deferred | None |
| View registration | Sync | <1ms | None |
| Command registration | Sync | <1ms | None |
| `autoSelectNode()` | onLayoutReady + setTimeout(1000ms) | Deferred | **HIGH** - node may not exist |

### Phase 3: serviceManager.initialize() (T=100ms)
| Operation | Trigger | Cost | Race Risk |
|-----------|---------|------|-----------|
| Service construction | Sync | <1ms | None |
| `GitDreamNodeService.scanVault()` | **FIRE AND FORGET** | 800-1500ms | **CRITICAL** - async with no await |

### Phase 4: Vault Scan (T=100-1500ms)
| Operation | Trigger | Cost | Race Risk |
|-----------|---------|------|-----------|
| Read all directories | fs.readdir | 10-50ms | None |
| Check each .udd file | fs.readFile per node | 5ms × N | Linear with node count |
| Parse UDD JSON | JSON.parse | <1ms per node | None |
| Build relationships | In-memory | 5-20ms | None |
| **store.setDreamNodes()** | End of scan | <1ms | **SINGLE ATOMIC UPDATE** |
| Trigger media loading | setTimeout(50ms) | Deferred | None |

### Phase 5: Background Services (T=200ms+)
| Operation | Trigger | Cost | Race Risk |
|-----------|---------|------|-----------|
| Copilot services init | setTimeout(100ms) | 10-50ms | None - deferred |
| DreamSong relationship scan | setTimeout(600ms) | 1-2s | None - deferred |

### Phase 6: Refresh Command (Cmd+R)
| Operation | Trigger | Cost | Race Risk |
|-----------|---------|------|-----------|
| Store reload target UUID | Immediate | <1ms | None |
| `clean-dangling-relationships` | **AWAIT** | 200-400ms | None |
| `sync-radicle-peer-following` | **FIRE AND FORGET** | Variable | None |
| `indexingService.ensureAllIndexed()` | **AWAIT** | 17s for 167 nodes | **CRITICAL** |
| Wait for IndexedDB settle | setTimeout(1000ms) | 1s | **ARBITRARY DELAY** |
| `closeIndexedDBConnection()` | Sync | <1ms | None |
| Plugin disable/enable | **AWAIT** | 100-500ms | Triggers full reload |

## IndexedDB Write Operations

All these write to IndexedDB via Zustand persist middleware:

1. `store.setDreamNodes()` - After vault scan
2. `store.updateRealNode()` - Any node update
3. `store.updateVectorData()` - During indexing
4. `store.deleteRealNode()` - Node deletion
5. `store.setConstellationFilter()` - Layout changes
6. Any slice state update that touches persisted state

**Problem**: Writes are async but not awaited. Plugin reload can interrupt in-flight writes.

## Race Condition Timeline (167-node vault)

```
T=0ms     onload() starts
T=1ms     setVaultId() - OK
T=2ms     rehydrate() STARTS - reading from IndexedDB
T=50ms    rehydrate() COMPLETES - store has PERSISTED data (may be stale)
T=51ms    initializeServices() - starts vault scan
T=52ms    scanVault() STARTS - reading .udd files (ASYNC, NO AWAIT)
T=100ms   React renders DreamSpace - uses PERSISTED data (stale)
T=850ms   scanVault() COMPLETES - store.setDreamNodes() with FRESH data
T=851ms   React re-renders - FLICKER as data updates
T=1050ms  autoSelectNode() runs - node should exist now (1000ms delay)
```

**The 799ms window (T=51ms to T=850ms) shows stale/conflicting data.**

## Cmd+R Race Conditions

```
T=0ms     Cmd+R pressed
T=1ms     Store reload target UUID
T=2ms     clean-dangling-relationships STARTS (await)
T=200ms   clean-dangling-relationships COMPLETES
T=201ms   sync-radicle-peer-following (fire-and-forget)
T=202ms   ensureAllIndexed() STARTS
T=17200ms ensureAllIndexed() COMPLETES (17 seconds!)
T=17201ms Wait for IndexedDB (1 second)
T=18201ms closeIndexedDBConnection()
T=18202ms Plugin disable STARTS
T=18300ms Plugin disable COMPLETES
T=18301ms Plugin enable STARTS (full reload)
```

**User waits 18+ seconds for a "refresh" that should be instant.**

## Root Causes

### 1. No Lifecycle Coordination
- `scanVault()` is called but not awaited in `serviceManager.initialize()`
- No central coordinator to sequence: hydrate → validate → scan (if needed) → ready

### 2. No Vault State Tracking
- Every startup does a full vault scan (800-1500ms for 167 nodes)
- No persistence of "last scan timestamp" to skip unchanged vaults
- No incremental scan capability

### 3. Cmd+R Does Too Much
- Runs full indexing (17 seconds) on every refresh
- Should only reload plugin, not re-index everything

### 4. IndexedDB Transaction Races
- Writes are async via Zustand middleware
- No waiting for pending transactions before plugin unload
- Can cause "open timeout" on next load

## Recommended Architecture

### ServiceLifecycleManager Phases

```typescript
enum LifecyclePhase {
  BOOTSTRAP = 'bootstrap',  // Set vault ID, load settings
  HYDRATE = 'hydrate',      // Read IndexedDB, validate data
  SCAN = 'scan',            // Scan vault (only if needed)
  READY = 'ready',          // UI can interact, emit events
  BACKGROUND = 'background' // Heavy operations (indexing, sync)
}
```

### Vault State Tracking

```typescript
interface VaultState {
  vaultId: string;           // Hash of vault path
  lastScanTimestamp: number; // When we last scanned
  nodeCount: number;         // Expected node count
  schemaVersion: number;     // For migrations
}
```

### Graceful Shutdown

```typescript
interface ShutdownState {
  isShuttingDown: boolean;
  pendingWrites: Promise<void>[];
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/core/services/service-lifecycle-manager.ts` | **NEW** - Central lifecycle coordinator |
| `src/core/services/vault-state-service.ts` | **NEW** - Vault state tracking |
| `src/main.ts` | Wire up lifecycle manager |
| `src/core/store/indexeddb-storage.ts` | Add shutdown-aware writes |
| `src/core/services/service-manager.ts` | Remove ad-hoc initialization |
| `src/features/dreamnode/services/git-dreamnode-service.ts` | Incremental scan support |
