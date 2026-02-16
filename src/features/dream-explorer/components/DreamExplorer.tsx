/**
 * Dream Explorer
 *
 * Main React component for the full-screen holarchy file navigator.
 * Reads state from the Zustand slice, scans directories, drives the
 * CircleLayoutEngine for physics-based packing with animated transitions.
 *
 * 3-level scene zoom: One scene div inside an enclosing circle mask
 * contains ALL circles from 3 levels (parent, current, children).
 * Navigation is a CSS transform on that scene — zoom-in scales the
 * target folder to fill the viewport, zoom-out shrinks current content
 * into its parent position. After the animation, the real navigation
 * fires and the scene resets to identity.
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

/** Parent circle projected into scene coordinates */
interface ParentSceneCircle extends PositionedItem {
  sceneX: number;
  sceneY: number;
  sceneR: number;
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

  // Scene transform state (replaces zoom overrides)
  const [sceneTransform, setSceneTransform] = useState('');
  const [sceneTransition, setSceneTransition] = useState('none');
  const [isZooming, setIsZooming] = useState(false);
  const [zoomTargetPath, setZoomTargetPath] = useState<string | null>(null);
  const [zoomDirection, setZoomDirection] = useState<'in' | 'out' | null>(null);

  // Parent level circles in scene coordinates
  const [parentSceneCircles, setParentSceneCircles] = useState<ParentSceneCircle[]>([]);

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

  // Clear cache when root changes
  useEffect(() => {
    cacheRef.current.clear();
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
    // Always include a readme
    placeholders.push({
      name: 'README.md',
      path: `${currentPath}/README.md`,
      type: 'readme',
      size: 1000,
      isDirectory: false,
    });
    // Add N submodule placeholders
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
      setPositioned([]);
      return;
    }

    const engine = new CircleLayoutEngine(
      effectiveItems,
      containerRadius,
      layoutMode
    );
    engineRef.current = engine;
    engine.onUpdate = (positions) => setPositioned(positions);
    engine.setMode(layoutMode, true);

    return () => {
      engine.destroy();
      if (engineRef.current === engine) {
        engineRef.current = null;
      }
    };
  }, [effectiveItems, containerRadius]);

  // When layoutMode changes, tell the engine — CSS transitions handle animation
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

  // Compute parent scene circles when positioned data or path changes
  useEffect(() => {
    if (!rootPath || containerRadius <= 0) {
      setParentSceneCircles([]);
      return;
    }

    const parentPath = computeParentPath(currentPath, rootPath);
    if (!parentPath) {
      setParentSceneCircles([]);
      return;
    }

    const parentCache = cacheRef.current.get(parentPath, layoutMode);
    if (!parentCache || parentCache.positioned.length === 0) {
      setParentSceneCircles([]);
      return;
    }

    const me = parentCache.positioned.find(p => p.item.path === currentPath);
    if (!me) {
      setParentSceneCircles([]);
      return;
    }

    const pScale = containerRadius / me.r;
    setParentSceneCircles(parentCache.positioned.map(p => ({
      ...p,
      sceneX: (p.x - me.x) * pScale,
      sceneY: (p.y - me.y) * pScale,
      sceneR: p.r * pScale,
    })));
  }, [positioned, currentPath, rootPath, containerRadius, layoutMode]);

  // When new positioned data arrives after a zoom navigation, clear zoom state
  useEffect(() => {
    if (pendingClearRef.current && positioned.length > 0) {
      pendingClearRef.current = null;
      setSceneTransition('none');
      setSceneTransform('');
      setIsZooming(false);
      setZoomTargetPath(null);
      setZoomDirection(null);
    }
  }, [positioned]);

  // Get child data for a directory circle from cache
  const getChildData = useCallback((itemPath: string) => {
    const cached = cacheRef.current.get(itemPath, layoutMode);
    if (!cached?.positioned.length) return undefined;
    return { positioned: cached.positioned, containerRadius };
  }, [layoutMode, containerRadius]);

  // Handle single click: select (with Cmd+click for additive)
  const handleClick = useCallback(
    (item: ExplorerItem, e: React.MouseEvent) => {
      explorerSelectItem(item.path, e.metaKey);
    },
    [explorerSelectItem]
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

        // Check cache for child content (for skeleton preview)
        const cached = cacheRef.current.get(item.path, layoutMode);
        if (cached && cached.positioned.length > 0) {
          // Zoom-in: transform scene to center target at full size
          const scale = containerRadius / target.r;
          const tx = -target.x * scale;
          const ty = -target.y * scale;

          setIsZooming(true);
          setZoomTargetPath(item.path);
          setZoomDirection('in');
          setSceneTransition('transform 1s ease-in-out');
          requestAnimationFrame(() => {
            setSceneTransform(`translate(${tx}px, ${ty}px) scale(${scale})`);
          });

          zoomTimerRef.current = setTimeout(() => {
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
    [positioned, containerRadius, explorerNavigateTo, isZooming, layoutMode]
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

        setIsZooming(true);
        setZoomDirection('out');
        setSceneTransition('transform 1s ease-in-out');
        requestAnimationFrame(() => {
          setSceneTransform(`translate(${meRaw.x}px, ${meRaw.y}px) scale(${scale})`);
        });

        zoomTimerRef.current = setTimeout(() => {
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
            {/* Parent skeleton circles (large coords, clipped by mask).
                Fade in during zoom-out, hidden otherwise. */}
            <div style={{
              opacity: zoomDirection === 'out' ? 1 : 0,
              transition: zoomDirection ? 'opacity 1s ease-in-out' : 'none',
            }}>
              {parentSceneCircles.map(p => (
                <ExplorerCircle
                  key={`parent-${p.item.path}`}
                  item={p.item}
                  x={p.sceneX}
                  y={p.sceneY}
                  r={p.sceneR}
                  isSelected={false}
                  skeleton
                />
              ))}
            </div>

            {/* Current circles — child skeletons only for the zoom target */}
            {positioned.map(pos => {
              const childData = zoomTargetPath === pos.item.path
                ? getChildData(pos.item.path)
                : undefined;

              // Zoom opacity: non-target circles fade out entirely via wrapper.
              // Target circle uses fadeChrome to dissolve border/bg/glow/media
              // while keeping child preview circles visible for seamless transition.
              const isZoomTarget = zoomTargetPath === pos.item.path;
              let circleOpacity = 1;
              if (zoomDirection && !isZoomTarget) circleOpacity = 0;

              return (
                <div
                  key={pos.item.path}
                  style={{
                    opacity: circleOpacity,
                    transition: zoomDirection ? 'opacity 1s ease-in-out' : 'none',
                  }}
                >
                  <ExplorerCircle
                    item={pos.item}
                    x={pos.x}
                    y={pos.y}
                    r={pos.r}
                    isSelected={!isZooming && selectedItems.includes(pos.item.path)}
                    childPositioned={childData?.positioned}
                    childContainerRadius={childData?.containerRadius}
                    fadeChrome={isZoomTarget && !!zoomDirection}
                    onClick={isZooming ? undefined : handleClick}
                    onDoubleClick={isZooming ? undefined : handleDoubleClick}
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
