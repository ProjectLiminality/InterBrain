/**
 * IndexedDB Storage Adapter for Zustand Persist
 *
 * Provides a localStorage-compatible interface backed by IndexedDB.
 * This allows us to store much larger datasets (GB instead of 10MB).
 *
 * Includes error recovery to prevent corrupted data from crashing the app.
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
    // Increased timeout (30s) for large vaults with many concurrent operations
    const timeout = setTimeout(() => {
      dbOpenPromise = null;
      reject(new Error('IndexedDB open timeout'));
    }, 30000);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      clearTimeout(timeout);
      dbOpenPromise = null;
      reject(request.error);
    };

    request.onsuccess = () => {
      clearTimeout(timeout);
      cachedDB = request.result;

      // Clear cache on connection close/error
      cachedDB.onclose = () => {
        cachedDB = null;
        dbOpenPromise = null;
      };
      cachedDB.onerror = () => {
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
 */
export const indexedDBStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const db = await openDB();
      const result = await new Promise<string | null>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(name);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result ?? null);
      });

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
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(value, name);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.error('IndexedDB setItem error:', error);
      // Don't throw - allow app to continue even if persistence fails
    }
  },

  removeItem: async (name: string): Promise<void> => {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(name);

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
}
