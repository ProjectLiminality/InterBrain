import React, { useCallback, useMemo } from 'react';
import { DreamNode } from '../types/dreamnode';
import { dreamNodeStyles, getNodeColors, getGoldenGlow, getMediaOverlayStyle } from '../styles/dreamNodeStyles';
import { DreamSong } from '../../dreamweaving/components/DreamSong';
import { useInterBrainStore } from '../../../core/store/interbrain-store';
import { useDreamSongData } from '../../dreamweaving/hooks/useDreamSongData';
import { CanvasParserService } from '../../dreamweaving/services/canvas-parser-service';
import { serviceManager } from '../../../core/services/service-manager';
import { NodeActionButton } from './NodeActionButton';
import { useCanvasFiles } from '../hooks/useCanvasFiles';
import { HolonView } from './HolonView';

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

  // Scan for all canvas files in the DreamNode
  const { canvasFiles, isLoading: isLoadingCanvasFiles } = useCanvasFiles(
    dreamNode.repoPath,
    vaultService
  );

  // Total carousel items: 1 (holarchy view) + canvas files count
  const totalItems = 1 + canvasFiles.length;

  // Get carousel state from store
  const carouselIndex = useInterBrainStore(state => state.getCarouselIndex(dreamNode.id));
  const cycleCarousel = useInterBrainStore(state => state.cycleCarousel);

  // Determine if currently showing holarchy view or a canvas
  const isHolarchyView = carouselIndex === HOLARCHY_VIEW_INDEX;

  // Get current canvas file if showing a DreamSong
  const currentCanvasFile = !isHolarchyView && canvasFiles.length > 0
    ? canvasFiles[carouselIndex - 1] // -1 because index 0 is holarchy
    : null;

  // Determine canvas path for the hook
  const canvasPath = currentCanvasFile
    ? currentCanvasFile.path
    : `${dreamNode.repoPath}/DreamSong.canvas`; // Fallback for hook, won't be used if holarchy view

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
  const setSelectedNode = useInterBrainStore(state => state.setSelectedNode);

  // Convert dreamNodes Map to array
  const dreamNodes = Array.from(dreamNodesMap.values()).map(data => data.node);

  // Handler for media click navigation
  const handleMediaClick = useCallback((sourceDreamNodeId: string) => {
    const targetNode = dreamNodes?.find(node =>
      node.id === sourceDreamNodeId || node.name === sourceDreamNodeId
    );

    if (targetNode) {
      setSelectedNode(targetNode);
    } else {
      console.warn(`DreamSongSide: No matching DreamNode found for "${sourceDreamNodeId}"`);
    }
  }, [dreamNodes, setSelectedNode]);

  // Carousel navigation handlers
  const handleCarouselLeft = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    cycleCarousel(dreamNode.id, 'left', totalItems);
  }, [dreamNode.id, cycleCarousel, totalItems]);

  const handleCarouselRight = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    cycleCarousel(dreamNode.id, 'right', totalItems);
  }, [dreamNode.id, cycleCarousel, totalItems]);

  // Determine current view title
  const currentViewTitle = isHolarchyView
    ? 'Holarchy'
    : currentCanvasFile?.displayTitle || 'DreamSong';

  // Should show carousel buttons (only if there are multiple items)
  const shouldShowCarouselButtons = totalItems > 1;

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
      {/* View title indicator at top */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '11px',
          color: dreamNodeStyles.colors.text.secondary,
          opacity: 0.7,
          zIndex: 50,
          whiteSpace: 'nowrap',
          pointerEvents: 'none'
        }}
      >
        {currentViewTitle}
      </div>

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

      {/* Full-screen button (top-center) */}
      {shouldShowFullscreenButton && onFullScreenClick && (
        <NodeActionButton
          icon="lucide-maximize"
          position="top"
          onClick={onFullScreenClick}
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
