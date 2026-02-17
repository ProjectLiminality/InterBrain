/**
 * Dream Explorer
 *
 * Main React component for the full-screen holarchy file navigator.
 * Reads state from the Zustand slice, scans directories, drives the
 * CircleLayoutEngine for physics-based packing with animated transitions.
 *
 * Persistent circle map: A single Map<string, SceneCircleEntry> holds ALL
 * circles across three levels (parent, current, child). Circles move between
 * levels during zoom but are never unmounted — React preserves DOM via stable
 * keys, so media stays loaded across transitions.
 *
 * Layout modes:
 * - reduced: submodules + readme only, equal radii (holon view)
 * - equal: all items, equal radii
 * - weighted: all items, size-weighted radii
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useInterBrainStore } from '../../../core/store/interbrain-store';
import { serviceManager } from '../../../core/services/service-manager';
import { scanDirectory } from '../services/file-scanner-service';
import { CircleLayoutEngine } from '../utils/circle-layout';
import { DirectoryCache } from '../services/directory-cache';
import { ExplorerCircle } from './ExplorerCircle';
import { ExplorerBreadcrumb } from './ExplorerBreadcrumb';
import type { ExplorerItem, PositionedItem } from '../types/explorer';

const ZOOM_DURATION = 1000; // ms — matches ExplorerCircle's CSS transition duration

type CircleLevel = 'parent' | 'current' | 'child';

interface SceneCircleEntry {
  item: ExplorerItem;
  sceneX: number;
  sceneY: number;
  sceneR: number;
  level: CircleLevel;
}

/** Compute parent path, respecting root boundary */
function computeParentPath(currentPath: string, rootPath: string): string | null {
  if (currentPath === rootPath) return null;
  const lastSlash = currentPath.lastIndexOf('/');
  if (lastSlash === -1) return rootPath;
  const parent = currentPath.slice(0, lastSlash);
  return parent.length < rootPath.length ? rootPath : parent;
}

export const DreamExplorer: React.FC = () => {
  const currentPath = useInterBrainStore(s => s.dreamExplorer.currentPath);
  const rootPath = useInterBrainStore(s => s.dreamExplorer.rootPath);
  const rootName = useInterBrainStore(s => s.dreamExplorer.rootName);
  const history = useInterBrainStore(s => s.dreamExplorer.history);
  const selectedItems = useInterBrainStore(s => s.dreamExplorer.selectedItems);
  const layoutMode = useInterBrainStore(s => s.dreamExplorer.layoutMode);
  const dreamNodesMap = useInterBrainStore(s => s.dreamNodes);

  const explorerNavigateTo = useInterBrainStore(s => s.explorerNavigateTo);
  const explorerGoBack = useInterBrainStore(s => s.explorerGoBack);
  const explorerSelectItem = useInterBrainStore(s => s.explorerSelectItem);
  const explorerSetLayoutMode = useInterBrainStore(s => s.explorerSetLayoutMode);

  const [items, setItems] = useState<ExplorerItem[]>([]);
  const [positioned, setPositioned] = useState<PositionedItem[]>([]);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Debug mode: replace real items with N placeholder submodules
  const [debugMode, setDebugMode] = useState(false);
  const [debugCount, setDebugCount] = useState(6);

  // Scene transform state
  const [sceneTransform, setSceneTransform] = useState('');
  const [sceneTransition, setSceneTransition] = useState('none');
  const [isZooming, setIsZooming] = useState(false);
  const [zoomTargetPath, setZoomTargetPath] = useState<string | null>(null);
  const [zoomDirection, setZoomDirection] = useState<'in' | 'out' | null>(null);

  // Persistent circle map — single source of truth for all rendered circles
  const [sceneCircles, setSceneCircles] = useState<Map<string, SceneCircleEntry>>(new Map());
  const settlementModeRef = useRef<'zoom-in' | 'zoom-out' | null>(null);
  // Skip the next non-zoom positioned update after settlement — the settlement
  // handlers already built the correct map, so the engine's follow-up emission
  // (same data, new array ref) would cause a redundant rebuildMapFromScratch.
  const skipNextRebuildRef = useRef(false);
  // Suppress ExplorerCircle CSS transitions during settlement so coord updates
  // from child/parent scene coords → identity coords don't animate (the scene
  // transform already handled the visual animation).
  const [suppressTransitions, setSuppressTransitions] = useState(false);
  // Child circles need to mount at opacity 0 first, then fade in on the next
  // frame. This is decoupled from zoomDirection so parent/current opacity
  // transitions aren't delayed.
  const [childFadeIn, setChildFadeIn] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CircleLayoutEngine | null>(null);
  const cacheRef = useRef(new DirectoryCache());
  const zoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingClearRef = useRef<string | null>(null);

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Container radius for circle packing
  const containerRadius = useMemo(
    () => Math.min(containerSize.width, containerSize.height) / 2,
    [containerSize.width, containerSize.height]
  );

  // Clear cache and map when root changes
  useEffect(() => {
    cacheRef.current.clear();
    setSceneCircles(new Map());
  }, [rootPath]);

  // Scan directory when path changes
  useEffect(() => {
    let cancelled = false;

    const scan = async () => {
      try {
        const vaultService = serviceManager.getVaultService();
        if (!vaultService) return;

        const scanned = await scanDirectory(currentPath, vaultService, dreamNodesMap);
        if (!cancelled) {
          setItems(scanned);
        }
      } catch (err) {
        console.error('[DreamExplorer] Scan failed:', err);
        if (!cancelled) setItems([]);
      }
    };

    scan();
    return () => { cancelled = true; };
  }, [currentPath, dreamNodesMap]);

  // Generate placeholder items for debug mode
  const effectiveItems = useMemo(() => {
    if (!debugMode) return items;
    const placeholders: ExplorerItem[] = [];
    placeholders.push({
      name: 'README.md',
      path: `${currentPath}/README.md`,
      type: 'readme',
      size: 1000,
      isDirectory: false,
    });
    for (let i = 0; i < debugCount; i++) {
      placeholders.push({
        name: `Sub${i + 1}`,
        path: `${currentPath}/Sub${i + 1}`,
        type: 'dream-submodule',
        size: 0,
        isDirectory: true,
      });
    }
    return placeholders;
  }, [debugMode, debugCount, items, currentPath]);

  // Create/recreate engine when items or container size change
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.destroy();
      engineRef.current = null;
    }

    if (containerRadius <= 0 || effectiveItems.length === 0) {
      console.log('[DreamExplorer] engine effect: setPositioned([]) (empty items or no radius)');
      setPositioned([]);
      return;
    }

    console.log('[DreamExplorer] engine effect: creating new engine, items=%d, radius=%d', effectiveItems.length, containerRadius);
    const engine = new CircleLayoutEngine(
      effectiveItems,
      containerRadius,
      layoutMode
    );
    engineRef.current = engine;
    engine.onUpdate = (positions) => {
      console.log('[DreamExplorer] engine.onUpdate: %d positions, isZooming=%s, pending=%s, settlement=%s', positions.length, isZooming, pendingClearRef.current, settlementModeRef.current);
      setPositioned(positions);
    };
    engine.setMode(layoutMode, true);

    return () => {
      engine.destroy();
      if (engineRef.current === engine) {
        engineRef.current = null;
      }
    };
  }, [effectiveItems, containerRadius]);

  // When layoutMode changes, tell the engine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setMode(layoutMode);
    }
  }, [layoutMode]);

  // Update engine container radius on resize
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setContainerRadius(containerRadius);
    }
  }, [containerRadius]);

  // Eagerly scan adjacent levels after navigation settles
  useEffect(() => {
    if (!rootPath || containerRadius <= 0 || items.length === 0) return;

    const vaultService = serviceManager.getVaultService();
    if (!vaultService) return;

    cacheRef.current.scanAdjacent(
      currentPath,
      rootPath,
      items,
      containerRadius,
      vaultService,
      dreamNodesMap,
      layoutMode
    );
  }, [items, currentPath, rootPath, containerRadius, dreamNodesMap, layoutMode]);

  // Log render-time state for CSS animation debugging
  console.log('[DreamExplorer] RENDER: transform=%s, transition=%s, zoomDir=%s, mapSize=%d',
    sceneTransform || 'none', sceneTransition, zoomDirection, sceneCircles.size);

  // --- Map management helpers ---

  /** Normal navigation, initial load, layout mode change: rebuild from scratch */
  const rebuildMapFromScratch = useCallback((newPositioned: PositionedItem[]) => {
    const map = new Map<string, SceneCircleEntry>();

    // Current level at identity coords
    for (const p of newPositioned) {
      map.set(p.item.path, {
        item: p.item,
        sceneX: p.x,
        sceneY: p.y,
        sceneR: p.r,
        level: 'current',
      });
    }

    // Populate parent level from cache for zoom-out readiness
    if (rootPath && containerRadius > 0) {
      const parentPath = computeParentPath(currentPath, rootPath);
      if (parentPath) {
        const parentCached = cacheRef.current.get(parentPath, layoutMode);
        if (parentCached && parentCached.positioned.length > 0) {
          const me = parentCached.positioned.find(p => p.item.path === currentPath);
          if (me) {
            const pScale = containerRadius / me.r;
            for (const p of parentCached.positioned) {
              // Don't overwrite current-level entries
              if (!map.has(p.item.path)) {
                map.set(p.item.path, {
                  item: p.item,
                  sceneX: (p.x - me.x) * pScale,
                  sceneY: (p.y - me.y) * pScale,
                  sceneR: p.r * pScale,
                  level: 'parent',
                });
              }
            }
          }
        }
      }
    }

    setSceneCircles(map);
  }, [currentPath, rootPath, containerRadius, layoutMode]);

  /** After zoom-in animation settles: promote child→current, keep parent */
  const handleZoomInSettlement = useCallback((newPositioned: PositionedItem[]) => {
    const oldMap = sceneCircles;
    const map = new Map<string, SceneCircleEntry>();

    // Build a set of paths that were child-level for promotion
    const childPaths = new Set<string>();
    for (const [path, entry] of oldMap) {
      if (entry.level === 'child') childPaths.add(path);
    }

    // Promote child entries → current using new positioned coords
    for (const p of newPositioned) {
      if (childPaths.has(p.item.path)) {
        // Promote: same DOM node, new coords
        map.set(p.item.path, {
          item: p.item,
          sceneX: p.x,
          sceneY: p.y,
          sceneR: p.r,
          level: 'current',
        });
      } else {
        // Fallback: stale cache edge case, create fresh
        map.set(p.item.path, {
          item: p.item,
          sceneX: p.x,
          sceneY: p.y,
          sceneR: p.r,
          level: 'current',
        });
      }
    }

    // Keep parent entries (one level up, media loaded)
    for (const [path, entry] of oldMap) {
      if (entry.level === 'parent' && !map.has(path)) {
        map.set(path, entry);
      }
    }

    // Recompute parent coords — the old parent is now grandparent, we need
    // the old current (now parent) at correct parent scene coords
    if (rootPath && containerRadius > 0) {
      const parentPath = computeParentPath(currentPath, rootPath);
      if (parentPath) {
        const parentCached = cacheRef.current.get(parentPath, layoutMode);
        if (parentCached && parentCached.positioned.length > 0) {
          const me = parentCached.positioned.find(p => p.item.path === currentPath);
          if (me) {
            const pScale = containerRadius / me.r;
            // Remove old parent entries and replace with correctly positioned ones
            for (const [path, entry] of Array.from(map.entries())) {
              if (entry.level === 'parent') map.delete(path);
            }
            for (const p of parentCached.positioned) {
              if (!map.has(p.item.path)) {
                map.set(p.item.path, {
                  item: p.item,
                  sceneX: (p.x - me.x) * pScale,
                  sceneY: (p.y - me.y) * pScale,
                  sceneR: p.r * pScale,
                  level: 'parent',
                });
              }
            }
          }
        }
      }
    }

    setSceneCircles(map);
  }, [sceneCircles, currentPath, rootPath, containerRadius, layoutMode]);

  /** After zoom-out animation settles: promote parent→current, drop child */
  const handleZoomOutSettlement = useCallback((newPositioned: PositionedItem[]) => {
    const oldMap = sceneCircles;
    const map = new Map<string, SceneCircleEntry>();

    // Build a set of paths that were parent-level for promotion
    const parentPaths = new Set<string>();
    for (const [path, entry] of oldMap) {
      if (entry.level === 'parent') parentPaths.add(path);
    }

    // Promote parent entries → current using new positioned coords
    for (const p of newPositioned) {
      if (parentPaths.has(p.item.path)) {
        map.set(p.item.path, {
          item: p.item,
          sceneX: p.x,
          sceneY: p.y,
          sceneR: p.r,
          level: 'current',
        });
      } else {
        // Fallback: create fresh
        map.set(p.item.path, {
          item: p.item,
          sceneX: p.x,
          sceneY: p.y,
          sceneR: p.r,
          level: 'current',
        });
      }
    }

    // Populate new parent from cache (grandparent level)
    if (rootPath && containerRadius > 0) {
      const parentPath = computeParentPath(currentPath, rootPath);
      if (parentPath) {
        const parentCached = cacheRef.current.get(parentPath, layoutMode);
        if (parentCached && parentCached.positioned.length > 0) {
          const me = parentCached.positioned.find(p => p.item.path === currentPath);
          if (me) {
            const pScale = containerRadius / me.r;
            for (const p of parentCached.positioned) {
              if (!map.has(p.item.path)) {
                map.set(p.item.path, {
                  item: p.item,
                  sceneX: (p.x - me.x) * pScale,
                  sceneY: (p.y - me.y) * pScale,
                  sceneR: p.r * pScale,
                  level: 'parent',
                });
              }
            }
          }
        }
      }
    }

    // Child entries (old current) are dropped — not added to new map

    setSceneCircles(map);
  }, [sceneCircles, currentPath, rootPath, containerRadius, layoutMode]);

  // --- Unified positioned effect ---
  useEffect(() => {
    console.log('[DreamExplorer] positioned effect: len=%d, pending=%s, settlement=%s, isZooming=%s, zoomDir=%s, skip=%s',
      positioned.length, pendingClearRef.current, settlementModeRef.current, isZooming, zoomDirection, skipNextRebuildRef.current);

    if (positioned.length === 0 && !pendingClearRef.current) {
      console.log('[DreamExplorer] positioned effect: SKIP (empty + no pending)');
      return;
    }

    const mode = settlementModeRef.current;

    if (pendingClearRef.current && positioned.length > 0) {
      console.log('[DreamExplorer] positioned effect: SETTLEMENT mode=%s', mode);
      // Suppress ExplorerCircle CSS transitions so the coord jump from
      // scene coords → identity coords doesn't animate (scene transform
      // already handled the visual zoom).
      setSuppressTransitions(true);
      // POST-ZOOM SETTLEMENT
      if (mode === 'zoom-in') {
        handleZoomInSettlement(positioned);
      } else if (mode === 'zoom-out') {
        handleZoomOutSettlement(positioned);
      }
      pendingClearRef.current = null;
      settlementModeRef.current = null;
      setSceneTransition('none');
      setSceneTransform('');
      setIsZooming(false);
      setZoomTargetPath(null);
      setZoomDirection(null);
      setChildFadeIn(false);
      // Re-enable transitions after the browser paints the settled coords.
      // Double-rAF ensures the no-transition frame is committed first.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSuppressTransitions(false);
        });
      });
      skipNextRebuildRef.current = true;
    } else if (!isZooming) {
      if (skipNextRebuildRef.current) {
        skipNextRebuildRef.current = false;
        console.log('[DreamExplorer] positioned effect: SKIPPED (post-settlement)');
        return;
      }
      console.log('[DreamExplorer] positioned effect: REBUILD from scratch');
      rebuildMapFromScratch(positioned);
    } else {
      console.log('[DreamExplorer] positioned effect: IGNORED (isZooming=true, no pending)');
    }
  }, [positioned]);

  // Handle single click
  const handleClick = useCallback(
    (item: ExplorerItem, e: React.MouseEvent) => {
      explorerSelectItem(item.path, e.metaKey);

      if (item.isDirectory && !cacheRef.current.get(item.path, layoutMode)) {
        const vs = serviceManager.getVaultService();
        if (vs) cacheRef.current.scan(item.path, containerRadius, vs, dreamNodesMap, layoutMode);
      }
    },
    [explorerSelectItem, layoutMode, containerRadius, dreamNodesMap]
  );

  // Handle double-click: navigate into directories/submodules, open files
  const handleDoubleClick = useCallback(
    (item: ExplorerItem) => {
      if (isZooming) return;

      if (item.isDirectory || item.type === 'dream-submodule' || item.type === 'dreamer-submodule') {
        if (containerRadius <= 0) {
          explorerNavigateTo(item.path);
          return;
        }

        // Find the target circle in positioned data
        const target = positioned.find(p => p.item.path === item.path);
        if (!target) {
          explorerNavigateTo(item.path);
          return;
        }

        // Check cache for child content
        const cached = cacheRef.current.get(item.path, layoutMode);
        if (cached && cached.positioned.length > 0) {
          // Zoom-in: transform scene to center target at full size
          const scale = containerRadius / target.r;
          const tx = -target.x * scale;
          const ty = -target.y * scale;

          // Mutate the map: current→parent, drop old parent, add children
          setSceneCircles(prev => {
            const map = new Map<string, SceneCircleEntry>();

            // Current entries → relabel to parent (keep scene coords at identity)
            for (const [path, entry] of prev) {
              if (entry.level === 'current') {
                map.set(path, { ...entry, level: 'parent' });
              }
              // Drop existing parent entries (grandparent — now 2 levels away)
            }

            // Add child entries from cache at child scene coords
            const childScale = target.r / containerRadius;
            for (const child of cached.positioned) {
              map.set(child.item.path, {
                item: child.item,
                sceneX: target.x + child.x * childScale,
                sceneY: target.y + child.y * childScale,
                sceneR: child.r * childScale,
                level: 'child',
              });
            }

            return map;
          });

          console.log('[DreamExplorer] ZOOM-IN initiated: target=%s, scale=%f', item.path, scale);
          settlementModeRef.current = 'zoom-in';
          setIsZooming(true);
          setZoomTargetPath(item.path);
          setZoomDirection('in');
          setChildFadeIn(false); // children mount at opacity 0 this frame
          setSceneTransition('transform 1s ease-in-out');
          requestAnimationFrame(() => {
            setChildFadeIn(true); // next frame: trigger child opacity 0→1 transition
            setSceneTransform(`translate(${tx}px, ${ty}px) scale(${scale})`);
          });

          zoomTimerRef.current = setTimeout(() => {
            console.log('[DreamExplorer] ZOOM-IN timer fired: navigating to %s', item.path);
            pendingClearRef.current = item.path;
            explorerNavigateTo(item.path);
            zoomTimerRef.current = null;
          }, ZOOM_DURATION);
        } else {
          // No cache — instant navigate
          explorerNavigateTo(item.path);
        }
      } else {
        openFile(item);
      }
    },
    [positioned, containerRadius, explorerNavigateTo, isZooming, layoutMode, currentPath]
  );

  // Open a file in Obsidian right pane, or fallback to system default
  const openFile = useCallback(async (item: ExplorerItem) => {
    const leafManager = serviceManager.getLeafManagerService();
    if (leafManager) {
      const opened = await leafManager.openFileInRightPane(item.path);
      if (opened) return;
    }

    if (item.absolutePath) {
      try {
        const { shell } = require('electron');
        shell.openPath(item.absolutePath);
      } catch (err) {
        console.error('[DreamExplorer] Failed to open file externally:', err);
      }
    }
  }, []);

  // Handle back navigation with zoom-out animation
  const handleGoBack = useCallback(() => {
    if (currentPath === rootPath || isZooming) return;

    const parentPath = computeParentPath(currentPath, rootPath);
    if (!parentPath) {
      explorerGoBack();
      return;
    }

    // Check cache for parent content
    const parentCache = cacheRef.current.get(parentPath, layoutMode);
    if (parentCache && parentCache.positioned.length > 0) {
      const meRaw = parentCache.positioned.find(p => p.item.path === currentPath);
      if (meRaw) {
        // Zoom-out: shrink scene into the position currentPath occupies in parent
        const scale = meRaw.r / containerRadius;

        // Mutate the map: current→child, parent stays as-is
        setSceneCircles(prev => {
          const map = new Map<string, SceneCircleEntry>();

          for (const [path, entry] of prev) {
            if (entry.level === 'current') {
              // Current entries → relabel to child (keep scene coords at identity)
              map.set(path, { ...entry, level: 'child' });
            } else if (entry.level === 'parent') {
              // Parent entries stay as-is (already at parent scene coords, media loaded)
              map.set(path, entry);
            }
          }

          return map;
        });

        console.log('[DreamExplorer] ZOOM-OUT initiated: parent=%s, scale=%f', parentPath, scale);
        settlementModeRef.current = 'zoom-out';
        setIsZooming(true);
        setZoomDirection('out');
        setSceneTransition('transform 1s ease-in-out');
        requestAnimationFrame(() => {
          setSceneTransform(`translate(${meRaw.x}px, ${meRaw.y}px) scale(${scale})`);
        });

        zoomTimerRef.current = setTimeout(() => {
          console.log('[DreamExplorer] ZOOM-OUT timer fired: going back to %s', parentPath);
          pendingClearRef.current = parentPath;
          explorerGoBack();
          zoomTimerRef.current = null;
        }, ZOOM_DURATION);
        return;
      }
    }

    // No cache — instant back
    explorerGoBack();
  }, [currentPath, rootPath, explorerGoBack, isZooming, layoutMode, containerRadius]);

  // Click on empty space — inside enclosing circle = deselect, outside = navigate up
  const handleBackgroundClick = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current || containerRadius <= 0) return;

      const rect = containerRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= containerRadius) {
        explorerSelectItem(null);
      } else {
        if (currentPath !== rootPath) {
          handleGoBack();
        }
      }
    },
    [containerRadius, currentPath, rootPath, explorerSelectItem, handleGoBack]
  );

  // Cleanup zoom timer on unmount
  useEffect(() => {
    return () => {
      if (zoomTimerRef.current) {
        clearTimeout(zoomTimerRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      onClick={handleBackgroundClick}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: '#000000',
        overflow: 'hidden',
      }}
    >
      {/* No root path = no DreamNode selected */}
      {!rootPath && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'rgba(255,255,255,0.4)',
            fontSize: '16px',
            fontFamily: 'TeX Gyre Termes, Georgia, serif',
          }}
        >
          Select a DreamNode first
        </div>
      )}

      {/* Breadcrumb navigation */}
      {rootPath && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'relative', zIndex: 20 }}>
        <ExplorerBreadcrumb
          currentPath={currentPath}
          rootPath={rootPath}
          rootName={rootName}
          canGoBack={history.length > 0}
          layoutMode={layoutMode}
          onGoBack={handleGoBack}
          onNavigateTo={(path) => {
            if (path !== currentPath) {
              explorerNavigateTo(path);
            }
          }}
          onSetLayoutMode={explorerSetLayoutMode}
        />
        </div>
      )}

      {/* Enclosing circle mask — clips everything via overflow:hidden + borderRadius:50% */}
      {rootPath && containerRadius > 0 && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: `${containerRadius * 2}px`,
            height: `${containerRadius * 2}px`,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            overflow: 'hidden',
          }}
        >
          {/* Scene div — transform target for zoom animations.
              overflow:visible is critical: parent circles live at huge coordinates
              outside the scene div's own bounds, and must not be clipped by the
              scene div itself — only by the enclosing circle mask above. */}
          <div
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              overflow: 'visible',
              transform: sceneTransform || 'none',
              transition: sceneTransition,
              transformOrigin: 'center center',
            }}
          >
            {/* All circles from persistent map — flat list, stable keys */}
            {Array.from(sceneCircles.values()).map(entry => {
              let opacity = 0;
              let transition = 'none';

              if (entry.level === 'current') {
                opacity = zoomDirection ? 0 : 1;
                transition = zoomDirection ? 'opacity 1s ease-in-out' : 'none';
              } else if (entry.level === 'parent') {
                opacity = zoomDirection === 'out' ? 1 : 0;
                transition = zoomDirection ? 'opacity 1s ease-in-out' : 'none';
              } else if (entry.level === 'child') {
                opacity = childFadeIn ? 1 : 0;
                transition = zoomDirection === 'in' ? 'opacity 1s ease-in-out' : 'none';
              }

              const interactive = entry.level === 'current' && !isZooming;

              return (
                <div
                  key={entry.item.path}
                  style={{
                    opacity,
                    transition,
                    pointerEvents: interactive ? 'auto' : 'none',
                  }}
                >
                  <ExplorerCircle
                    item={entry.item}
                    x={entry.sceneX}
                    y={entry.sceneY}
                    r={entry.sceneR}
                    isSelected={interactive && selectedItems.includes(entry.item.path)}
                    noTransition={suppressTransitions}
                    onClick={interactive ? handleClick : undefined}
                    onDoubleClick={interactive ? handleDoubleClick : undefined}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Border overlay — separate from mask so it's not affected by scene transform */}
      {rootPath && containerRadius > 0 && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: `${containerRadius * 2}px`,
            height: `${containerRadius * 2}px`,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            border: '10px solid #479FF8',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        />
      )}

      {/* Empty state */}
      {rootPath && items.length === 0 && containerSize.width > 0 && !isZooming && !debugMode && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'rgba(255,255,255,0.3)',
            fontSize: '16px',
            fontFamily: 'TeX Gyre Termes, Georgia, serif',
          }}
        >
          Empty directory
        </div>
      )}

      {/* Debug mode controls */}
      {rootPath && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(0,0,0,0.7)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 6,
            padding: '4px 10px',
            fontFamily: 'monospace',
            fontSize: 12,
            color: 'rgba(255,255,255,0.6)',
            userSelect: 'none',
          }}
        >
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              checked={debugMode}
              onChange={() => setDebugMode(d => !d)}
              style={{ cursor: 'pointer' }}
            />
            debug
          </label>
          {debugMode && (
            <>
              <button
                onClick={() => setDebugCount(c => Math.max(0, c - 1))}
                style={{
                  background: 'none', border: '1px solid rgba(255,255,255,0.3)',
                  color: '#fff', borderRadius: 3, width: 22, height: 22,
                  cursor: 'pointer', fontSize: 14, lineHeight: '20px', padding: 0,
                }}
              >-</button>
              <span style={{ minWidth: 20, textAlign: 'center' }}>{debugCount}</span>
              <button
                onClick={() => setDebugCount(c => c + 1)}
                style={{
                  background: 'none', border: '1px solid rgba(255,255,255,0.3)',
                  color: '#fff', borderRadius: 3, width: 22, height: 22,
                  cursor: 'pointer', fontSize: 14, lineHeight: '20px', padding: 0,
                }}
              >+</button>
              <span style={{ color: 'rgba(255,255,255,0.35)' }}>
                ({debugCount + 1} total)
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
};
