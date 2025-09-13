import React, { useCallback } from 'react';
import { DreamNode } from '../types/dreamnode';
import { dreamNodeStyles, getNodeColors, getNodeGlow, getEditModeGlow, getMediaOverlayStyle, getGitVisualState, getGitStateStyle, getGitGlow } from './dreamNodeStyles';
import { DreamSong } from '../features/dreamweaving/DreamSong';
import { DreamSongData } from '../types/dreamsong';
import { useInterBrainStore } from '../store/interbrain-store';
import { setIcon } from 'obsidian';

interface DreamSongSideProps {
  dreamNode: DreamNode;
  isHovered: boolean;
  isEditModeActive: boolean;
  isPendingRelationship: boolean;
  shouldShowFlipButton: boolean;
  shouldShowFullscreenButton: boolean;
  nodeSize: number;
  borderWidth: number;
  dreamSongData: DreamSongData | null;
  isLoadingDreamSong: boolean;
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
  isEditModeActive,
  isPendingRelationship,
  shouldShowFlipButton,
  shouldShowFullscreenButton,
  nodeSize: _nodeSize,
  borderWidth,
  dreamSongData,
  isLoadingDreamSong,
  // isVisible parameter removed for simplicity
  onMouseEnter,
  onMouseLeave,
  onClick,
  onDoubleClick,
  onFlipClick,
  onFullScreenClick
}) => {
  const nodeColors = getNodeColors(dreamNode.type);
  const gitState = getGitVisualState(dreamNode.gitStatus);
  const gitStyle = getGitStateStyle(gitState);

  // Connect to store for media click navigation
  const realNodes = useInterBrainStore(state => state.realNodes);
  const setSelectedNode = useInterBrainStore(state => state.setSelectedNode);
  
  // Convert realNodes Map to dreamNodes array (same pattern as DreamspaceCanvas)
  const dreamNodes = Array.from(realNodes.values()).map(data => data.node);

  // Handler for media click navigation
  const handleMediaClick = useCallback((sourceDreamNodeId: string) => {
    // Find the DreamNode by ID or name
    const targetNode = dreamNodes?.find(node => 
      node.id === sourceDreamNodeId || node.name === sourceDreamNodeId
    );
    
    if (targetNode) {
      setSelectedNode(targetNode);
    }
  }, [dreamNodes, setSelectedNode]);

  return (
    <div
      style={{
        position: 'absolute',
        width: '100%',
        height: '100%',
        borderRadius: dreamNodeStyles.dimensions.borderRadius,
        border: `${borderWidth}px ${gitStyle.borderStyle} ${nodeColors.border}`,
        background: nodeColors.fill,
        overflow: 'hidden',
        cursor: 'pointer !important',
        transition: `${dreamNodeStyles.transitions.default}, ${dreamNodeStyles.transitions.gitState}`,
        transform: isHovered ? `scale(${dreamNodeStyles.states.hover.scale})` : 'scale(1)',
        animation: gitStyle.animation,
        boxShadow: (() => {
          // Priority 1: Git status glow (always highest priority)
          if (gitStyle.glowIntensity > 0) {
            return getGitGlow(gitState, gitStyle.glowIntensity);
          }
          
          // Priority 2: Edit mode relationship glow
          if (isEditModeActive && isPendingRelationship) {
            return getEditModeGlow(25); // Strong gold glow for relationships
          }
          
          // Priority 3: Hover glow (fallback)
          return isHovered ? getNodeGlow(dreamNode.type, dreamNodeStyles.states.hover.glowIntensity) : 'none';
        })()
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
          {dreamSongData ? (
            <div style={{ 
              height: 'auto', 
              minHeight: '100%',
              position: 'relative',
              paddingBottom: '20px' // Extra space to ensure scrollable area
            }}>
              <DreamSong
                dreamSongData={dreamSongData}
                className="flip-enter"
                sourceDreamNodeId={dreamNode.id}
                dreamNodeName={dreamNode.name}
                onMediaClick={handleMediaClick}
                embedded={true}
              />
            </div>
          ) : isLoadingDreamSong ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: dreamNodeStyles.colors.text.primary,
              pointerEvents: 'auto' // Allow content interaction
            }}
          >
            Loading DreamSong...
          </div>
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: dreamNodeStyles.colors.text.primary,
              pointerEvents: 'auto' // Allow content interaction
            }}
          >
            No DreamSong available
          </div>
        )}
        </div>
        
        {/* Fade-to-black overlay - positioned outside scrolling container but inside circular mask */}
        {dreamSongData && (
          <div style={getMediaOverlayStyle()} />
        )}
      </div>

      {/* Full-screen button (top-center, on back side) - Stable Click Wrapper */}
      {shouldShowFullscreenButton && onFullScreenClick && (
        <div
          style={{
            position: 'absolute',
            top: '8px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '84px',
            height: '84px',
            cursor: 'pointer',
            zIndex: 100, // Much higher z-index to override any overlays
            pointerEvents: 'auto'
          }}
          onClick={(e) => {
            e.stopPropagation(); // Prevent event from bubbling to node
            onFullScreenClick(e);
          }}
        >
          {/* Visual button - DOM manipulation happens here, not on click handler */}
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              background: '#000000',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              color: '#fff',
              transition: 'all 0.2s ease',
              zIndex: 99,
              pointerEvents: 'none' // Clicks pass through to wrapper
            }}
            ref={(el) => {
              if (el) {
                // Clear existing content and add Obsidian icon
                el.innerHTML = '';
                setIcon(el, 'lucide-maximize');
                // Scale icon for larger button
                const iconElement = el.querySelector('.lucide-maximize');
                if (iconElement) {
                  (iconElement as any).style.width = '36px';
                  (iconElement as any).style.height = '36px';
                }
              }
            }}
          />
        </div>
      )}

      {/* Flip button (bottom-center, on back side) */}
      {shouldShowFlipButton && (
        <div
          style={{
            position: 'absolute',
            bottom: '8px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '84px',
            height: '84px',
            borderRadius: '50%',
            background: '#000000',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer !important',
            fontSize: '12px',
            color: '#fff',
            transition: 'all 0.2s ease',
            zIndex: 100,
            pointerEvents: 'auto'
          }}
          onClick={(e) => {
            e.stopPropagation(); // Prevent event from bubbling to node
            onFlipClick(e);
          }}
          ref={(el) => {
            if (el) {
              // Clear existing content and add Obsidian icon
              el.innerHTML = '';
              setIcon(el, 'lucide-rotate-3d');
              // Scale icon for larger button
              const iconElement = el.querySelector('.lucide-rotate-3d');
              if (iconElement) {
                (iconElement as any).style.width = '36px';
                (iconElement as any).style.height = '36px';
              }
            }
          }}
        >
        </div>
      )}
    </div>
  );
};