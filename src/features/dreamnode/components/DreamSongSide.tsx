import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DreamNode } from '../types/dreamnode';
import { dreamNodeStyles, getNodeColors, getGoldenGlow, getMediaOverlayStyle } from '../styles/dreamNodeStyles';
import { DreamSong } from '../../dreamweaving/components/DreamSong';
import { useInterBrainStore } from '../../../core/store/interbrain-store';
import { useDreamSongData } from '../../dreamweaving/hooks/useDreamSongData';
import { CanvasParserService } from '../../dreamweaving/services/canvas-parser-service';
import { serviceManager } from '../../../core/services/service-manager';
import { NodeActionButton } from './NodeActionButton';
import { useCanvasFiles, BacksideContentItem } from '../hooks/useCanvasFiles';
import { HolonView } from './HolonView';
import { createHtmlBlobUrl, revokeHtmlBlobUrl } from '../utils/html-loader';

interface DreamSongSideProps {
  dreamNode: DreamNode;
  isHovered: boolean;
  isEditModeActive: boolean;
  isPendingRelationship: boolean;
  isRelationshipEditMode?: boolean;
  isTutorialHighlighted?: boolean;
  shouldShowFlipButton: boolean;
  shouldShowFullscreenButton: boolean;
  nodeSize: number;
  borderWidth: number;
  glowIntensity?: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  onFlipClick: (e: React.MouseEvent) => void;
  onFullScreenClick?: (e: React.MouseEvent) => void;
}

/**
 * Carousel view types:
 * - Index 0: Holarchy view (submodules)
 * - Index 1+: Individual .canvas files (DreamSongs)
 */
const HOLARCHY_VIEW_INDEX = 0;

export const DreamSongSide: React.FC<DreamSongSideProps> = ({
  dreamNode,
  isHovered,
  isEditModeActive: _isEditModeActive,
  isPendingRelationship,
  isRelationshipEditMode = false,
  isTutorialHighlighted = false,
  shouldShowFlipButton,
  shouldShowFullscreenButton,
  nodeSize,
  borderWidth,
  glowIntensity = dreamNodeStyles.states.hover.glowIntensity,
  onMouseEnter,
  onMouseLeave,
  onClick,
  onDoubleClick,
  onFlipClick,
  onFullScreenClick
}) => {
  // Get service instances
  const canvasParser = useMemo(() => {
    const vaultService = serviceManager.getVaultService();
    if (!vaultService) {
      throw new Error('Vault service not available');
    }
    return new CanvasParserService(vaultService);
  }, []);

  const vaultService = useMemo(() => {
    const service = serviceManager.getVaultService();
    if (!service) {
      throw new Error('Vault service not available');
    }
    return service;
  }, []);

  // Scan for all backside content (index.html + .canvas files)
  const { backsideItems, isLoading: isLoadingCanvasFiles } = useCanvasFiles(
    dreamNode.repoPath,
    vaultService
  );

  // Total carousel items: 1 (holarchy view) + backside items (html + canvas)
  const totalItems = 1 + backsideItems.length;

  // Get carousel state from store
  const carouselIndex = useInterBrainStore(state => state.getCarouselIndex(dreamNode.id));
  const cycleCarousel = useInterBrainStore(state => state.cycleCarousel);

  // Determine if currently showing holarchy view or a content item
  const isHolarchyView = carouselIndex === HOLARCHY_VIEW_INDEX;

  // Get current backside item (could be canvas or html)
  const currentItem: BacksideContentItem | null = !isHolarchyView && backsideItems.length > 0
    ? backsideItems[carouselIndex - 1] // -1 because index 0 is holarchy
    : null;

  // Convenience booleans for current view type
  const isCustomUIView = currentItem?.type === 'html';
  const isCanvasView = currentItem?.type === 'canvas';

  // Load HTML content as blob URL for custom UI views (file:// blocked by Chromium)
  const [customUIBlobUrl, setCustomUIBlobUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!isCustomUIView || !currentItem) {
      setCustomUIBlobUrl(null);
      return;
    }
    let revoked = false;
    const app = serviceManager.getApp();
    if (!app) return;

    createHtmlBlobUrl(app, currentItem.path).then(url => {
      if (!revoked) setCustomUIBlobUrl(url);
    });

    return () => {
      revoked = true;
      setCustomUIBlobUrl(prev => { revokeHtmlBlobUrl(prev); return null; });
    };
  }, [isCustomUIView, currentItem?.path]);

  // PRISM Bridge — start hybrid WebTorrent when a DreamNode has bridge.js
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<any>(null);

  useEffect(() => {
    if (!isCustomUIView || !dreamNode.repoPath) return;

    // Check if this DreamNode has a bridge.js (PRISM pattern)
    const fs = require('fs');
    const path = require('path');
    const adapter = serviceManager.getApp()?.vault.adapter as any;
    if (!adapter?.basePath) return;

    const bridgePath = path.join(adapter.basePath, dreamNode.repoPath, 'bridge.js');
    if (!fs.existsSync(bridgePath)) return;

    // Check if node_modules/webtorrent exists
    const wtPath = path.join(adapter.basePath, dreamNode.repoPath, 'node_modules', 'webtorrent');
    if (!fs.existsSync(wtPath)) {
      console.warn('[PRISM Bridge] webtorrent not installed in', dreamNode.repoPath, '— run npm install');
      return;
    }

    let destroyed = false;

    // Start the bridge
    try {
      const { PRISMBridge } = require(bridgePath);
      const bridge = new PRISMBridge();
      bridgeRef.current = bridge;

      bridge.start().then((port: number) => {
        if (destroyed) { bridge.destroy(); return; }
        console.log(`[PRISM Bridge] started for ${dreamNode.name} on port ${port}`);

        // Listen for probe messages from the iframe and respond with port
        const handleMessage = (e: MessageEvent) => {
          if (e.data?.type === 'prism-bridge-probe' && iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage({ type: 'prism-bridge', port }, '*');
          }
        };
        window.addEventListener('message', handleMessage);

        // Also send immediately in case iframe already loaded
        const sendPort = () => {
          if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage({ type: 'prism-bridge', port }, '*');
          }
        };
        // Small delay to let iframe initialize
        setTimeout(sendPort, 200);
        setTimeout(sendPort, 600);

        // Store cleanup
        (bridge as any)._messageHandler = handleMessage;
      }).catch((err: Error) => {
        console.error('[PRISM Bridge] failed to start:', err);
      });
    } catch (err) {
      console.error('[PRISM Bridge] failed to load:', err);
    }

    return () => {
      destroyed = true;
      if (bridgeRef.current) {
        const handler = (bridgeRef.current as any)._messageHandler;
        if (handler) window.removeEventListener('message', handler);
        bridgeRef.current.destroy();
        bridgeRef.current = null;
      }
    };
  }, [isCustomUIView, dreamNode.repoPath, dreamNode.name]);

  // Determine canvas path for the hook (only used when showing a canvas)
  const canvasPath = isCanvasView && currentItem
    ? currentItem.path
    : `${dreamNode.repoPath}/DreamSong.canvas`; // Fallback for hook, won't be used if not canvas view

  // Use DreamSong data hook (only used when showing a canvas)
  const { blocks, isLoading: isLoadingDreamSong, error } = useDreamSongData(
    canvasPath,
    dreamNode.repoPath,
    { canvasParser, vaultService, dreamNode },
    dreamNode.id
  );

  const nodeColors = getNodeColors(dreamNode.type);

  // Glow conditions
  const shouldShowGlow = isPendingRelationship || isTutorialHighlighted || (isHovered && isRelationshipEditMode);

  // Connect to store for media click navigation
  const dreamNodesMap = useInterBrainStore(state => state.dreamNodes);
  const requestNavigation = useInterBrainStore(state => state.requestNavigation);

  // Convert dreamNodes Map to array
  const dreamNodes = Array.from(dreamNodesMap.values()).map(data => data.node);

  // Handler for media click navigation — routes through unified orchestration
  // sourceDreamNodeId is a folder name extracted from the canvas file path (e.g., "OtherDreamNode")
  // We match against repoPath (folder name), id (UUID), radicleId, and name (display title)
  const handleMediaClick = useCallback((sourceDreamNodeId: string) => {
    const targetNode = dreamNodes?.find(node =>
      node.repoPath === sourceDreamNodeId ||
      node.id === sourceDreamNodeId ||
      node.radicleId === sourceDreamNodeId ||
      node.name === sourceDreamNodeId
    );

    if (targetNode) {
      requestNavigation({ type: 'liminal-web-focus', nodeId: targetNode.id });
    } else {
      console.warn(`DreamSongSide: No matching DreamNode found for "${sourceDreamNodeId}"`);
    }
  }, [dreamNodes, requestNavigation]);

  // Carousel navigation handlers
  const handleCarouselLeft = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    cycleCarousel(dreamNode.id, 'left', totalItems);
  }, [dreamNode.id, cycleCarousel, totalItems]);

  const handleCarouselRight = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    cycleCarousel(dreamNode.id, 'right', totalItems);
  }, [dreamNode.id, cycleCarousel, totalItems]);

  // Should show carousel buttons (only if there are multiple items)
  const shouldShowCarouselButtons = totalItems > 1;

  // Carousel-aware fullscreen handler
  // For custom UI (html), open CustomUIFullScreenView directly
  // For canvas, delegate to the existing prop handler (open-dreamsong-fullscreen command)
  const handleFullScreenClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCustomUIView && currentItem) {
      // Open custom UI in fullscreen leaf
      try {
        const leafManager = serviceManager.getLeafManagerService();
        if (leafManager) {
          await leafManager.openCustomUIFullScreen(dreamNode, currentItem.path);
        }
      } catch (err) {
        console.error('Failed to open custom UI fullscreen:', err);
      }
    } else if (onFullScreenClick) {
      // Delegate to existing DreamSong fullscreen handler
      onFullScreenClick(e);
    }
  }, [isCustomUIView, currentItem, dreamNode, onFullScreenClick]);

  // Only show fullscreen button when not on holarchy view
  const shouldShowFullscreen = shouldShowFullscreenButton && !isHolarchyView;

  return (
    <div
      style={{
        position: 'absolute',
        width: '100%',
        height: '100%',
        borderRadius: dreamNodeStyles.dimensions.borderRadius,
        border: `${borderWidth}px solid ${nodeColors.border}`,
        background: nodeColors.fill,
        overflow: 'hidden',
        cursor: 'pointer !important',
        transition: dreamNodeStyles.transitions.default,
        boxShadow: shouldShowGlow ? getGoldenGlow(glowIntensity) : 'none',
        contain: 'layout style paint' as const,
        contentVisibility: 'auto' as const
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {/* Circular mask container */}
      <div
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          overflow: 'hidden',
          zIndex: 1
        }}
      >
        {/* Scrollable content container */}
        <div
          style={{
            width: '100%',
            height: '100%',
            overflow: 'auto',
            pointerEvents: 'auto'
          }}
        >
          {isHolarchyView ? (
            // Holarchy view - submodule circles
            <HolonView
              dreamNode={dreamNode}
              nodeSize={nodeSize}
              vaultService={vaultService}
            />
          ) : isCustomUIView && customUIBlobUrl ? (
            // Custom UI view - iframe with blob URL (file:// blocked by Chromium)
            <iframe
              ref={iframeRef}
              src={customUIBlobUrl}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                borderRadius: '50%',
                background: '#000'
              }}
              title={`${dreamNode.name} Custom UI`}
            />
          ) : isLoadingDreamSong || isLoadingCanvasFiles ? (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: dreamNodeStyles.colors.text.primary,
                pointerEvents: 'auto'
              }}
            >
              Loading...
            </div>
          ) : error ? (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: dreamNodeStyles.colors.text.primary,
                pointerEvents: 'auto',
                flexDirection: 'column',
                fontSize: '12px',
                textAlign: 'center',
                padding: '20px'
              }}
            >
              <div>DreamSong Error</div>
              <div style={{ marginTop: '8px', opacity: 0.7 }}>{error}</div>
            </div>
          ) : (
            <div style={{
              height: 'auto',
              minHeight: '100%',
              position: 'relative',
              paddingBottom: '20px'
            }}>
              <DreamSong
                blocks={blocks}
                className="flip-enter"
                sourceDreamNodeId={dreamNode.id}
                dreamNodeName={dreamNode.name}
                dreamTalkMedia={dreamNode.dreamTalkMedia}
                onMediaClick={handleMediaClick}
                embedded={true}
              />
            </div>
          )}
        </div>

        {/* Fade-to-black overlay - always show for visual consistency */}
        <div style={getMediaOverlayStyle()} />
      </div>

      {/* Carousel navigation buttons (left/right) */}
      {shouldShowCarouselButtons && (
        <>
          <NodeActionButton
            icon="lucide-chevron-left"
            position="left"
            onClick={handleCarouselLeft}
            size={64}
            iconSize={28}
          />
          <NodeActionButton
            icon="lucide-chevron-right"
            position="right"
            onClick={handleCarouselRight}
            size={64}
            iconSize={28}
          />
        </>
      )}

      {/* Full-screen button (top-center) — carousel-aware, only on content views */}
      {shouldShowFullscreen && (
        <NodeActionButton
          icon="lucide-maximize"
          position="top"
          onClick={handleFullScreenClick}
        />
      )}

      {/* Dream Explorer button (top-center) — only on holarchy view */}
      {shouldShowFullscreenButton && isHolarchyView && (
        <NodeActionButton
          icon="lucide-compass"
          position="top"
          onClick={(e) => {
            e.stopPropagation();
            const obsidianApp = serviceManager.getApp();
            if (obsidianApp) {
              (obsidianApp as any).commands.executeCommandById('interbrain:open-dream-explorer');
            }
          }}
        />
      )}

      {/* Flip button (bottom-center) */}
      {shouldShowFlipButton && (
        <NodeActionButton
          icon="lucide-rotate-3d"
          position="bottom"
          onClick={onFlipClick}
        />
      )}
    </div>
  );
};
