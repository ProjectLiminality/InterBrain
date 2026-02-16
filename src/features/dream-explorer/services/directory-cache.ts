/**
 * Directory Cache
 *
 * Pre-scans adjacent directory levels so content is ready before zoom
 * animations start. Circle skeletons (border + name + icon) are trivially
 * cheap — media loading is the only expensive part, which skeleton mode skips.
 *
 * Lifecycle:
 * - On navigation, cache: parent, current, and each child directory
 * - Each cached directory gets its own CircleLayoutEngine at full container resolution
 * - Cache is invalidated when layoutMode changes or DreamNode root changes
 */

import { scanDirectory } from './file-scanner-service';
import { CircleLayoutEngine } from '../utils/circle-layout';
import type { ExplorerItem, PositionedItem, ExplorerLayoutMode } from '../types/explorer';
import type { VaultService } from '../../../core/services/vault-service';
import type { DreamNodeData } from '../../../core/store/interbrain-store';

export interface CacheEntry {
  items: ExplorerItem[];
  positioned: PositionedItem[];
  layoutMode: ExplorerLayoutMode;
}

export class DirectoryCache {
  private cache = new Map<string, CacheEntry>();
  private pending = new Map<string, Promise<CacheEntry>>();

  clear(): void {
    this.cache.clear();
    this.pending.clear();
  }

  has(path: string): boolean {
    return this.cache.has(path);
  }

  /**
   * Get a cache entry, but only if it matches the current layoutMode.
   * Returns undefined if the entry exists but was computed with a different mode.
   */
  get(path: string, layoutMode: ExplorerLayoutMode): CacheEntry | undefined {
    const entry = this.cache.get(path);
    if (entry && entry.layoutMode !== layoutMode) {
      // Stale — computed with different mode
      this.cache.delete(path);
      return undefined;
    }
    return entry;
  }

  /**
   * Scan and layout a single directory path. Returns cached result if available.
   */
  async scan(
    path: string,
    containerRadius: number,
    vaultService: VaultService,
    dreamNodesMap: Map<string, DreamNodeData>,
    layoutMode: ExplorerLayoutMode
  ): Promise<CacheEntry> {
    // Return cached if available and matching mode
    const cached = this.get(path, layoutMode);
    if (cached) return cached;

    // Return pending if already scanning
    const pending = this.pending.get(path);
    if (pending) return pending;

    const promise = this._doScan(path, containerRadius, vaultService, dreamNodesMap, layoutMode);
    this.pending.set(path, promise);

    try {
      const entry = await promise;
      this.cache.set(path, entry);
      return entry;
    } finally {
      this.pending.delete(path);
    }
  }

  /**
   * Eagerly scan adjacent levels (parent + children) in the background.
   * Does not block — fire and forget.
   */
  scanAdjacent(
    currentPath: string,
    rootPath: string,
    currentItems: ExplorerItem[],
    containerRadius: number,
    vaultService: VaultService,
    dreamNodesMap: Map<string, DreamNodeData>,
    layoutMode: ExplorerLayoutMode
  ): void {
    // Scan parent (one level up) if not at root
    if (currentPath !== rootPath) {
      const parentPath = this._parentPath(currentPath, rootPath);
      if (parentPath !== null && !this.get(parentPath, layoutMode)) {
        this.scan(parentPath, containerRadius, vaultService, dreamNodesMap, layoutMode).catch(() => {});
      }
    }

    // Scan each child directory (use unfiltered items — directories might be filtered out in reduced mode
    // but we still need to scan submodules which are directories)
    for (const item of currentItems) {
      if (item.isDirectory && !this.get(item.path, layoutMode)) {
        this.scan(item.path, containerRadius, vaultService, dreamNodesMap, layoutMode).catch(() => {});
      }
    }
  }

  /**
   * Get parent path, respecting root boundary.
   * Returns null if currentPath === rootPath.
   */
  private _parentPath(currentPath: string, rootPath: string): string | null {
    if (currentPath === rootPath) return null;
    const lastSlash = currentPath.lastIndexOf('/');
    if (lastSlash === -1) return rootPath;
    const parent = currentPath.slice(0, lastSlash);
    // Ensure parent is at or below root
    if (parent.length < rootPath.length) return rootPath;
    return parent;
  }

  private async _doScan(
    path: string,
    containerRadius: number,
    vaultService: VaultService,
    dreamNodesMap: Map<string, DreamNodeData>,
    layoutMode: ExplorerLayoutMode
  ): Promise<CacheEntry> {
    const items = await scanDirectory(path, vaultService, dreamNodesMap);

    if (items.length === 0 || containerRadius <= 0) {
      return { items, positioned: [], layoutMode };
    }

    const engine = new CircleLayoutEngine(items, containerRadius, layoutMode);

    // Extract the positioned items from the engine
    let positioned: PositionedItem[] = [];
    engine.onUpdate = (positions) => { positioned = positions; };
    engine.setMode(layoutMode, true);
    engine.destroy();

    return { items, positioned, layoutMode };
  }
}
