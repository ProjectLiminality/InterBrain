/**
 * Layout Snapshot Storage
 *
 * Handles persistence of layout snapshots to IndexedDB for instant restoration on reload.
 * Uses the same IndexedDB infrastructure as the main store but with a separate key.
 *
 * Key principles:
 * - Snapshots are vault-specific (uses vaultId from indexeddb-storage)
 * - Saves are fire-and-forget (non-blocking)
 * - Loads are synchronous-feeling via cached promise
 */

import { LayoutSnapshot, isValidSnapshot } from './types';
import { getVaultId } from '../store/indexeddb-storage';

const DB_NAME = 'interbrain-db';
const STORE_NAME = 'state';
const SNAPSHOT_KEY_PREFIX = 'layout-snapshot';

// Cached snapshot for synchronous access after initial load
let cachedSnapshot: LayoutSnapshot | null = null;
let loadPromise: Promise<LayoutSnapshot | null> | null = null;

/**
 * Get the vault-specific storage key for the snapshot
 */
function getSnapshotKey(): string {
  const vaultId = getVaultId();
  if (!vaultId) {
    console.warn('[SnapshotStorage] vaultId not set, using default key');
    return SNAPSHOT_KEY_PREFIX;
  }
  return `${SNAPSHOT_KEY_PREFIX}-${vaultId}`;
}

/**
 * Open IndexedDB connection (reuses existing DB)
 */
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Save a layout snapshot to IndexedDB.
 * This is fire-and-forget - errors are logged but don't block.
 */
export async function saveLayoutSnapshot(snapshot: LayoutSnapshot): Promise<void> {
  try {
    // Update cache immediately
    cachedSnapshot = snapshot;

    const db = await openDB();
    const key = getSnapshotKey();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(JSON.stringify(snapshot), key);

      request.onerror = () => {
        console.error('[SnapshotStorage] Save failed:', request.error);
        reject(request.error);
      };
      request.onsuccess = () => {
        console.log(`[SnapshotStorage] Saved snapshot: ${snapshot.layoutState}, ${Object.keys(snapshot.activeNodes).length} active nodes`);
        resolve();
      };
    });
  } catch (error) {
    console.error('[SnapshotStorage] Save error:', error);
    // Don't throw - saving is non-critical
  }
}

/**
 * Load the layout snapshot from IndexedDB.
 * Returns null if no valid snapshot exists.
 */
export async function loadLayoutSnapshot(): Promise<LayoutSnapshot | null> {
  // Return cached if available
  if (cachedSnapshot) {
    return cachedSnapshot;
  }

  // Dedupe concurrent loads
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    try {
      const db = await openDB();
      const key = getSnapshotKey();

      const result = await new Promise<string | null>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result ?? null);
      });

      if (!result) {
        console.log('[SnapshotStorage] No snapshot found');
        return null;
      }

      const snapshot = JSON.parse(result) as LayoutSnapshot;

      // Validate version and structure
      if (!isValidSnapshot(snapshot)) {
        console.warn('[SnapshotStorage] Invalid or outdated snapshot, clearing');
        await clearLayoutSnapshot();
        return null;
      }

      console.log(`[SnapshotStorage] Loaded snapshot: ${snapshot.layoutState}, ${Object.keys(snapshot.activeNodes).length} active nodes`);
      cachedSnapshot = snapshot;
      return snapshot;
    } catch (error) {
      console.error('[SnapshotStorage] Load error:', error);
      return null;
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

/**
 * Clear the layout snapshot (e.g., when returning to constellation).
 */
export async function clearLayoutSnapshot(): Promise<void> {
  try {
    cachedSnapshot = null;

    const db = await openDB();
    const key = getSnapshotKey();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log('[SnapshotStorage] Snapshot cleared');
        resolve();
      };
    });
  } catch (error) {
    console.error('[SnapshotStorage] Clear error:', error);
  }
}

/**
 * Get the cached snapshot synchronously (returns null if not loaded yet).
 * Use this after loadLayoutSnapshot() has completed.
 */
export function getCachedSnapshot(): LayoutSnapshot | null {
  return cachedSnapshot;
}

/**
 * Reset the cache (call on plugin unload)
 */
export function resetSnapshotCache(): void {
  cachedSnapshot = null;
  loadPromise = null;
}
