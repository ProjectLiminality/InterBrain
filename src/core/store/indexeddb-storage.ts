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

/**
 * Set the vault identifier for storage namespacing.
 * This creates a unique storage key per vault to prevent cross-vault contamination.
 *
 * @param vaultPath - The absolute path to the vault (e.g., /Users/foo/MyVault)
 */
export function setVaultId(vaultPath: string): void {
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
    console.log('[IndexedDB] Using cached connection');
    return Promise.resolve(cachedDB);
  }

  // Return existing open promise if one is in progress
  if (dbOpenPromise) {
    console.log('[IndexedDB] Waiting for existing open promise');
    return dbOpenPromise;
  }

  console.log('[IndexedDB] Opening new connection...');

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
      clearTimeout(timeout);
      dbOpenPromise = null;
      reject(request.error);
    };

    request.onsuccess = () => {
      console.log('[IndexedDB] Connection opened successfully');
      clearTimeout(timeout);
      cachedDB = request.result;

      // Clear cache on connection close/error
      cachedDB.onclose = () => {
        console.log('[IndexedDB] Connection closed');
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
      console.log('[IndexedDB] Upgrading database schema...');
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
        console.log('[IndexedDB] Created object store:', STORE_NAME);
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

      // Debug: Log what we're getting from IndexedDB
      if (result) {
        const size = result.length;
        console.log(`[IndexedDB] getItem('${vaultKey}'): ${(size / 1024).toFixed(1)}KB`);
        // Parse and log structure for debugging
        try {
          const parsed = JSON.parse(result);
          const nodeCount = parsed.state?.dreamNodes?.length ?? 0;
          const vectorCount = parsed.state?.vectorData?.length ?? 0;
          console.log(`[IndexedDB] Parsed: ${nodeCount} dreamNodes, ${vectorCount} vectors`);
        } catch (e) {
          console.log(`[IndexedDB] Parse error:`, e);
        }
      } else {
        console.log(`[IndexedDB] getItem('${vaultKey}'): null (empty)`);
      }

      // Validate that we can parse the result before returning
      if (result) {
        try {
          JSON.parse(result);
        } catch (parseError) {
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

      // Debug: Log what we're writing
      console.log(`[IndexedDB] setItem('${vaultKey}'): ${(value.length / 1024).toFixed(1)}KB`);

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(value, vaultKey);

        request.onerror = () => {
          console.error(`[IndexedDB] setItem FAILED:`, request.error);
          reject(request.error);
        };
        request.onsuccess = () => {
          console.log(`[IndexedDB] setItem SUCCESS`);
          resolve();
        };
      });
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
 */
export function closeIndexedDBConnection(): void {
  if (cachedDB) {
    cachedDB.close();
    cachedDB = null;
  }
  dbOpenPromise = null;
  // Also reset vaultId so it must be set again on reload
  vaultId = null;
}
