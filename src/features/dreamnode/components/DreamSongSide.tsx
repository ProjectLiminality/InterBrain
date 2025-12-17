import React, { useCallback, useMemo } from 'react';
import { DreamNode } from '../types/dreamnode';
import { dreamNodeStyles, getNodeColors, getGoldenGlow, getMediaOverlayStyle } from '../styles/dreamNodeStyles';
import { DreamSong } from '../../dreamweaving/components/DreamSong'; // Use pure DreamSong for 3D back side (embedded context)
import { useInterBrainStore } from '../../../core/store/interbrain-store';
import { useDreamSongData } from '../../dreamweaving/hooks/useDreamSongData';
import { CanvasParserService } from '../../dreamweaving/services/canvas-parser-service';
import { serviceManager } from '../../../core/services/service-manager';
import { NodeActionButton } from './NodeActionButton';

interface DreamSongSideProps {
  dreamNode: DreamNode;
  isHovered: boolean;
  isEditModeActive: boolean;
  isPendingRelationship: boolean;
  isTutorialHighlighted?: boolean; // Tutorial-triggered hover effect
  shouldShowFlipButton: boolean;
  shouldShowFullscreenButton: boolean;
  nodeSize: number;
  borderWidth: number;
  glowIntensity?: number; // Distance-scaled glow intensity
  // dreamSongData and isLoadingDreamSong removed - handled by hook
  // isVisible removed - relying on CSS backface-visibility for optimization
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  onFlipClick: (e: React.MouseEvent) => void;
  onFullScreenClick?: (e: React.MouseEvent) => void;
}

export const DreamSongSide: React.FC<DreamSongSideProps> = ({
  dreamNode,
  isHovered,
  isEditModeActive: _isEditModeActive,
  isPendingRelationship,
  isTutorialHighlighted = false,
  shouldShowFlipButton,
  shouldShowFullscreenButton,
  nodeSize: _nodeSize,
  borderWidth,
  glowIntensity = dreamNodeStyles.states.hover.glowIntensity,
  // dreamSongData and isLoadingDreamSong removed - using hook
  // isVisible parameter removed for simplicity
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


  // Use the new hook for DreamSong data (with dreamNode for Songline feature detection)
  const canvasPath = `${dreamNode.repoPath}/DreamSong.canvas`;
  const { blocks, isLoading: isLoadingDreamSong, error } = useDreamSongData(
    canvasPath,
    dreamNode.repoPath,
    { canvasParser, vaultService, dreamNode },
    dreamNode.id
  );
  const nodeColors = getNodeColors(dreamNode.type);

  // Treat pending relationship or tutorial highlight as forced hover state
  const effectiveHover = isHovered || isPendingRelationship || isTutorialHighlighted;

  // Connect to store for media click navigation
  const dreamNodesMap = useInterBrainStore(state => state.dreamNodes);
  const setSelectedNode = useInterBrainStore(state => state.setSelectedNode);

  // Convert dreamNodes Map to array (same pattern as DreamspaceCanvas)
  const dreamNodes = Array.from(dreamNodesMap.values()).map(data => data.node);

  // Handler for media click navigation
  const handleMediaClick = useCallback((sourceDreamNodeId: string) => {
    // Find the DreamNode by ID or name
    const targetNode = dreamNodes?.find(node =>
      node.id === sourceDreamNodeId || node.name === sourceDreamNodeId
    );

    if (targetNode) {
      setSelectedNode(targetNode);
    } else {
      console.warn(`DreamSongSide: No matching DreamNode found for "${sourceDreamNodeId}"`);
    }
  }, [dreamNodes, setSelectedNode]);

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
        boxShadow: effectiveHover ? getGoldenGlow(glowIntensity) : 'none',
        // CSS containment for better browser rendering with many nodes
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
            pointerEvents: 'auto' // Enable scrolling interaction
          }}
        >
          {/* Always render DreamSong - it handles empty states internally */}
          {isLoadingDreamSong ? (
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
              Loading DreamSong...
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

      {/* Full-screen button (top-center, on back side) */}
      {shouldShowFullscreenButton && onFullScreenClick && (
        <NodeActionButton
          icon="lucide-maximize"
          position="top"
          onClick={onFullScreenClick}
        />
      )}

      {/* Flip button (bottom-center, on back side) */}
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