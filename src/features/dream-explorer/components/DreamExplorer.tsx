/**
 * Dream Explorer
 *
 * Main React component for the full-screen holarchy file navigator.
 * Reads state from the Zustand slice, scans directories, packs circles,
 * and renders ExplorerCircle components with zoom animations.
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useInterBrainStore } from '../../../core/store/interbrain-store';
import { serviceManager } from '../../../core/services/service-manager';
import { scanDirectory } from '../services/file-scanner-service';
import { packExplorerItems } from '../utils/circle-layout';
import { ExplorerCircle } from './ExplorerCircle';
import { ExplorerBreadcrumb } from './ExplorerBreadcrumb';
import type { ExplorerItem, PositionedItem } from '../types/explorer';

/** Zoom animation states */
type ZoomState = 'idle' | 'zooming-in' | 'zooming-out';

export const DreamExplorer: React.FC = () => {
  const currentPath = useInterBrainStore(s => s.dreamExplorer.currentPath);
  const rootPath = useInterBrainStore(s => s.dreamExplorer.rootPath);
  const rootName = useInterBrainStore(s => s.dreamExplorer.rootName);
  const history = useInterBrainStore(s => s.dreamExplorer.history);
  const selectedItems = useInterBrainStore(s => s.dreamExplorer.selectedItems);
  const sizeWeighted = useInterBrainStore(s => s.dreamExplorer.sizeWeighted);
  const dreamNodesMap = useInterBrainStore(s => s.dreamNodes);

  const explorerNavigateTo = useInterBrainStore(s => s.explorerNavigateTo);
  const explorerGoBack = useInterBrainStore(s => s.explorerGoBack);
  const explorerSelectItem = useInterBrainStore(s => s.explorerSelectItem);
  const explorerToggleSizeWeighted = useInterBrainStore(s => s.explorerToggleSizeWeighted);

  const [items, setItems] = useState<ExplorerItem[]>([]);
  const [positioned, setPositioned] = useState<PositionedItem[]>([]);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [zoomState, setZoomState] = useState<ZoomState>('idle');
  const [zoomTarget, setZoomTarget] = useState<PositionedItem | null>(null);
  const [contentOpacity, setContentOpacity] = useState(1);

  const containerRef = useRef<HTMLDivElement>(null);

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
          setContentOpacity(1);
        }
      } catch (err) {
        console.error('[DreamExplorer] Scan failed:', err);
        if (!cancelled) setItems([]);
      }
    };

    scan();
    return () => { cancelled = true; };
  }, [currentPath, dreamNodesMap]);

  // Pack items when items or container size change
  useEffect(() => {
    if (containerRadius <= 0 || items.length === 0) {
      setPositioned([]);
      return;
    }

    const packed = packExplorerItems(items, containerRadius, sizeWeighted);
    setPositioned(packed);
  }, [items, containerRadius, sizeWeighted]);

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
      if (item.isDirectory) {
        // Find the positioned item for zoom animation
        const target = positioned.find(p => p.item.path === item.path);
        if (target && containerRadius > 0) {
          // Start zoom animation
          setZoomTarget(target);
          setZoomState('zooming-in');

          // After animation completes, navigate
          setTimeout(() => {
            explorerNavigateTo(item.path);
            setZoomState('idle');
            setZoomTarget(null);
            setContentOpacity(0);
            // Fade in new contents
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                setContentOpacity(1);
              });
            });
          }, 350);
        } else {
          explorerNavigateTo(item.path);
        }
      } else if (item.type === 'dream-submodule' || item.type === 'dreamer-submodule') {
        // Navigate into submodule
        const target = positioned.find(p => p.item.path === item.path);
        if (target && containerRadius > 0) {
          setZoomTarget(target);
          setZoomState('zooming-in');
          setTimeout(() => {
            explorerNavigateTo(item.path);
            setZoomState('idle');
            setZoomTarget(null);
            setContentOpacity(0);
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                setContentOpacity(1);
              });
            });
          }, 350);
        } else {
          explorerNavigateTo(item.path);
        }
      } else {
        // File: open in Obsidian or system default
        openFile(item);
      }
    },
    [positioned, containerRadius, explorerNavigateTo]
  );

  // Open a file in Obsidian right pane, or fallback to system default
  const openFile = useCallback(async (item: ExplorerItem) => {
    const leafManager = serviceManager.getLeafManagerService();
    if (leafManager) {
      const opened = await leafManager.openFileInRightPane(item.path);
      if (opened) return;
    }

    // Fallback: open with system default if we have an absolute path
    if (item.absolutePath) {
      try {
        const { shell } = require('electron');
        shell.openPath(item.absolutePath);
      } catch (err) {
        console.error('[DreamExplorer] Failed to open file externally:', err);
      }
    }
  }, []);

  // Handle back
  const handleGoBack = useCallback(() => {
    setContentOpacity(0);
    explorerGoBack();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setContentOpacity(1);
      });
    });
  }, [explorerGoBack]);

  // Calculate zoom transform for animation
  const getZoomTransform = (): React.CSSProperties => {
    if (zoomState !== 'zooming-in' || !zoomTarget || containerRadius <= 0) {
      return {};
    }

    // Scale so the target circle fills the container
    const scale = containerRadius / zoomTarget.r;
    // Translate to center the target
    const tx = -zoomTarget.x * scale;
    const ty = -zoomTarget.y * scale;

    return {
      transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
      transition: 'transform 0.35s ease-in-out',
    };
  };

  return (
    <div
      ref={containerRef}
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
        <ExplorerBreadcrumb
          currentPath={currentPath}
          rootPath={rootPath}
          rootName={rootName}
          canGoBack={history.length > 0}
          sizeWeighted={sizeWeighted}
          onGoBack={handleGoBack}
          onNavigateTo={(path) => {
            if (path !== currentPath) {
              explorerNavigateTo(path);
            }
          }}
          onToggleSizeWeighted={explorerToggleSizeWeighted}
        />
      )}

      {/* Circular boundary indicator */}
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
            border: '1px solid rgba(255,255,255,0.1)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Circle container */}
      {rootPath && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            opacity: contentOpacity,
            transition: 'opacity 0.2s ease',
            ...getZoomTransform(),
          }}
        >
          {positioned.map(pos => (
            <ExplorerCircle
              key={pos.item.path}
              item={pos.item}
              x={pos.x}
              y={pos.y}
              r={pos.r}
              isSelected={selectedItems.includes(pos.item.path)}
              onClick={handleClick}
              onDoubleClick={handleDoubleClick}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {rootPath && items.length === 0 && containerSize.width > 0 && (
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
    </div>
  );
};
