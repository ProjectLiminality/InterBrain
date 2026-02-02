/**
 * IndexedDB Storage Adapter for Zustand Persist
 *
 * Provides a localStorage-compatible interface backed by IndexedDB.
 * This allows us to store much larger datasets (GB instead of 10MB).
 *
 * Includes error recovery to prevent corrupted data from crashing the app.
 *
 * IMPORTANT: Storage is vault-specific using a vault ID suffix.
 * Call setVaultId() during plugin initialization before any store operations.
 *
 * SHUTDOWN AWARE: Tracks pending writes and can wait for them during shutdown.
 */

import { StateStorage } from 'zustand/middleware';

const DB_NAME = 'interbrain-db';
const STORE_NAME = 'state';
const DB_VERSION = 1;

// Maximum size for stored data (50MB) - if exceeded, skip vector data
const MAX_STORAGE_SIZE = 50 * 1024 * 1024;

// Connection pool - reuse connections to avoid exhausting IndexedDB
let cachedDB: IDBDatabase | null = null;
let dbOpenPromise: Promise<IDBDatabase> | null = null;

// Vault identifier for namespacing storage keys
// This MUST be set before any store operations via setVaultId()
let vaultId: string | null = null;

// Shutdown state - prevents new writes during shutdown
let isShuttingDown = false;

// Hydration state - prevents writes until hydration is complete
// This prevents the empty initial state from overwriting persisted data
let hydrationComplete = false;

// Track pending write operations for graceful shutdown
const pendingWrites = new Set<Promise<void>>();

/**
 * Set the vault identifier for storage namespacing.
 * This creates a unique storage key per vault to prevent cross-vault contamination.
 *
 * Also resets the shutdown flag since this is called at the start of a new plugin lifecycle.
 *
 * @param vaultPath - The absolute path to the vault (e.g., /Users/foo/MyVault)
 */
export function setVaultId(vaultPath: string): void {
  // Reset shutdown flag for new plugin instance
  // This allows the new instance to write to IndexedDB
  isShuttingDown = false;

  // Create a simple hash of the vault path for the storage key
  // Using a hash keeps the key short while being unique per vault
  vaultId = simpleHash(vaultPath);
  console.log(`[IndexedDB] Vault ID set: ${vaultId} (from ${vaultPath})`);
}

/**
 * Get the current vault ID (for debugging)
 */
export function getVaultId(): string | null {
  return vaultId;
}

/**
 * Simple hash function for creating vault identifiers
 * Uses djb2 algorithm - fast and produces good distribution
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to hex string, ensure positive
  return Math.abs(hash).toString(16);
}

/**
 * Transform a storage key to be vault-specific
 * If vaultId is not set, returns the key unchanged (with a warning)
 */
function getVaultSpecificKey(key: string): string {
  if (!vaultId) {
    console.warn(`[IndexedDB] WARNING: vaultId not set! Using unnamespaced key '${key}'. Call setVaultId() first.`);
    return key;
  }
  return `${key}-${vaultId}`;
}

/**
 * Open IndexedDB connection with connection reuse
 * Prevents connection pool exhaustion during rapid writes
 */
function openDB(): Promise<IDBDatabase> {
  // Return cached connection if still valid
  if (cachedDB) {
    return Promise.resolve(cachedDB);
  }

  // Return existing open promise if one is in progress
  if (dbOpenPromise) {
    return dbOpenPromise;
  }

  // Create new connection
  dbOpenPromise = new Promise((resolve, reject) => {
    // Timeout for this connection attempt
    const timeout = setTimeout(() => {
      console.error('[IndexedDB] Connection timeout after 30s - database may be blocked');
      dbOpenPromise = null;
      reject(new Error('IndexedDB open timeout'));
    }, 30000);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onblocked = () => {
      console.warn('[IndexedDB] Database open blocked - close other tabs/windows using this database');
    };

    request.onerror = () => {
      console.error('[IndexedDB] Open error:', request.error);
      globalThis.clearTimeout(timeout);
      dbOpenPromise = null;
      reject(request.error);
    };

    request.onsuccess = () => {
      globalThis.clearTimeout(timeout);
      cachedDB = request.result;

      // Clear cache on connection close/error
      cachedDB.onclose = () => {
        cachedDB = null;
        dbOpenPromise = null;
      };
      cachedDB.onerror = (event) => {
        console.error('[IndexedDB] Database error:', event);
        cachedDB = null;
        dbOpenPromise = null;
      };

      dbOpenPromise = null;
      resolve(cachedDB);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });

  return dbOpenPromise;
}

/**
 * IndexedDB storage adapter compatible with Zustand persist middleware
 *
 * Keys are automatically namespaced by vault ID to prevent cross-vault contamination.
 */
export const indexedDBStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const vaultKey = getVaultSpecificKey(name);
    try {
      const db = await openDB();
      const result = await new Promise<string | null>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(vaultKey);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result ?? null);
      });

      // Validate that we can parse the result before returning
      if (result) {
        try {
          JSON.parse(result);
        } catch {
          console.error('IndexedDB: Corrupted data detected, clearing storage');
          await indexedDBStorage.removeItem(name);
          return null;
        }
      }

      return result;
    } catch (error) {
      console.error('IndexedDB getItem error:', error);
      // Return null instead of crashing - allows app to start fresh
      return null;
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    // Reject writes during shutdown
    if (isShuttingDown) {
      return;
    }

    // Reject writes before hydration is complete
    // This prevents the empty initial state from overwriting persisted data
    if (!hydrationComplete) {
      return;
    }

    const vaultKey = getVaultSpecificKey(name);
    try {
      // Check size before storing
      if (value.length > MAX_STORAGE_SIZE) {
        console.warn(`IndexedDB: Data too large (${(value.length / 1024 / 1024).toFixed(1)}MB), trimming vector data`);
        // Parse, remove vectorData to reduce size, re-serialize
        try {
          const parsed = JSON.parse(value);
          if (parsed.state && parsed.state.vectorData) {
            // Keep only the last 100 vectors to prevent unbounded growth
            const vectorArray = parsed.state.vectorData;
            if (Array.isArray(vectorArray) && vectorArray.length > 100) {
              parsed.state.vectorData = vectorArray.slice(-100);
              console.warn(`IndexedDB: Trimmed vectorData from ${vectorArray.length} to 100 entries`);
            }
          }
          value = JSON.stringify(parsed);
        } catch {
          // If we can't parse/trim, skip storage entirely
          console.error('IndexedDB: Cannot trim data, skipping storage');
          return;
        }
      }

      const db = await openDB();

      // Create tracked promise for graceful shutdown
      const writePromise = new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(value, vaultKey);

        request.onerror = () => {
          console.error(`[IndexedDB] setItem FAILED:`, request.error);
          reject(request.error);
        };
        request.onsuccess = () => {
          resolve();
        };
      });

      // Track this write for graceful shutdown
      pendingWrites.add(writePromise);
      writePromise.finally(() => {
        pendingWrites.delete(writePromise);
      });

      return writePromise;
    } catch (error) {
      console.error('IndexedDB setItem error:', error);
      // Don't throw - allow app to continue even if persistence fails
    }
  },

  removeItem: async (name: string): Promise<void> => {
    const vaultKey = getVaultSpecificKey(name);
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(vaultKey);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.error('IndexedDB removeItem error:', error);
      // Don't throw - allow app to continue
    }
  },
};

/**
 * Close and clear the cached database connection
 * Call this before plugin reload to ensure clean state
 *
 * NOTE: We do NOT reset isShuttingDown here because writes may still be
 * attempted by Zustand after the connection is closed. The flag is reset
 * when the NEW plugin instance calls setVaultId() during BOOTSTRAP.
 */
export function closeIndexedDBConnection(): void {
  if (cachedDB) {
    cachedDB.close();
    cachedDB = null;
  }
  dbOpenPromise = null;
  // Reset vaultId so it must be set again on reload
  vaultId = null;
  // NOTE: Keep isShuttingDown=true to block any late writes from the old plugin instance
}

/**
 * Initiate graceful shutdown - waits for pending writes to complete
 * Call this BEFORE closeIndexedDBConnection()
 *
 * @param timeoutMs Maximum time to wait for pending writes (default 5000ms)
 */
export async function gracefulShutdown(timeoutMs: number = 5000): Promise<void> {
  isShuttingDown = true;

  if (pendingWrites.size === 0) {
    return;
  }

  // Create timeout promise
  const timeout = new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, timeoutMs);
  });

  // Wait for all pending writes or timeout
  await Promise.race([
    Promise.allSettled(Array.from(pendingWrites)),
    timeout,
  ]);
}

/**
 * Get count of pending writes (for debugging)
 */
export function getPendingWriteCount(): number {
  return pendingWrites.size;
}

/**
 * Check if shutdown is in progress
 */
export function isShutdownInProgress(): boolean {
  return isShuttingDown;
}

/**
 * Mark hydration as complete - enables writes to IndexedDB
 * Call this AFTER store.persist.rehydrate() completes
 */
export function markHydrationComplete(): void {
  hydrationComplete = true;
}

/**
 * Check if hydration is complete
 */
export function isHydrationComplete(): boolean {
  return hydrationComplete;
}
