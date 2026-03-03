import React from 'react';
import { DreamNode } from '../types/dreamnode';
import { dreamNodeStyles, getNodeColors, getGoldenGlow, getMediaContainerStyle, getMediaOverlayStyle } from '../styles/dreamNodeStyles';
import { NodeActionButton } from './NodeActionButton';
import { MediaRenderer } from './MediaRenderer';

interface DreamTalkSideProps {
  dreamNode: DreamNode;
  isHovered: boolean;
  isEditModeActive: boolean;
  isPendingRelationship: boolean;
  isRelationshipEditMode?: boolean; // In relationship-edit layout (hover shows glow preview)
  isTutorialHighlighted?: boolean; // Tutorial-triggered hover effect
  shouldShowFlipButton: boolean;
  shouldShowFullscreenButton: boolean;
  nodeSize: number;
  borderWidth: number;
  glowIntensity?: number; // Distance-scaled glow intensity
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  onFlipClick: (e: React.MouseEvent) => void;
  onFullScreenClick?: (e: React.MouseEvent) => void;
}

export const DreamTalkSide: React.FC<DreamTalkSideProps> = ({
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
  const nodeColors = getNodeColors(dreamNode.type);

  // Treat pending relationship or tutorial highlight as forced hover state
  // This shows name overlay for related nodes in edit mode or tutorial
  const effectiveHover = isHovered || isPendingRelationship || isTutorialHighlighted;

  // Glow conditions (no general hover glow - only specific contexts):
  // 1. isPendingRelationship - already marked as pending relationship
  // 2. isTutorialHighlighted - explicitly highlighted by tutorial system
  // 3. Hover in relationship-edit mode - preview that clicking would add relationship
  const shouldShowGlow = isPendingRelationship || isTutorialHighlighted || (isHovered && isRelationshipEditMode);

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
        // CSS containment for better browser rendering with many nodes
        contain: 'layout style paint' as const,
        contentVisibility: 'auto' as const
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {/* DreamTalk Media Container - show if media has absolutePath (for direct loading) OR base64 data */}
      {dreamNode.dreamTalkMedia[0] && (dreamNode.dreamTalkMedia[0].absolutePath || (dreamNode.dreamTalkMedia[0].data && dreamNode.dreamTalkMedia[0].data.length > 0)) && (
        <div style={getMediaContainerStyle()}>
          <MediaRenderer media={dreamNode.dreamTalkMedia[0]} />
          {/* Fade-to-black overlay */}
          <div style={getMediaOverlayStyle()} />

          {/* Hover overlay with name - shows for hover OR pending relationship */}
          {effectiveHover && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                background: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 1,
                transition: 'opacity 0.2s ease-in-out',
                pointerEvents: 'none',
                zIndex: 10
              }}
            >
              <div
                style={{
                  color: dreamNodeStyles.colors.text.primary,
                  fontFamily: dreamNodeStyles.typography.fontFamily,
                  fontSize: `${Math.max(12, nodeSize * 0.08)}px`,
                  textAlign: 'center',
                  padding: '8px'
                }}
              >
                {dreamNode.name}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state text - when no media available */}
      {(!dreamNode.dreamTalkMedia[0] || (!dreamNode.dreamTalkMedia[0].absolutePath && (!dreamNode.dreamTalkMedia[0].data || dreamNode.dreamTalkMedia[0].data.length === 0))) && (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: dreamNodeStyles.colors.text.primary,
            fontFamily: dreamNodeStyles.typography.fontFamily,
            fontSize: `${Math.max(12, nodeSize * 0.08)}px`,
            textAlign: 'center',
            padding: '8px'
          }}
        >
          {dreamNode.name}
        </div>
      )}

      {/* Node label */}
      <div
        style={{
          position: 'absolute',
          bottom: `-${nodeSize * 0.25}px`,
          left: '50%',
          transform: 'translateX(-50%)',
          color: dreamNodeStyles.colors.text.primary,
          fontFamily: dreamNodeStyles.typography.fontFamily,
          fontSize: `${Math.max(12, nodeSize * 0.1)}px`,
          textAlign: 'center',
          background: 'rgba(0, 0, 0, 0.8)',
          padding: '4px 8px',
          borderRadius: '4px',
          whiteSpace: 'nowrap',
          pointerEvents: 'none'
        }}
      >
        {dreamNode.name}
      </div>

      {/* Full-screen button (top-center, on front side) */}
      {shouldShowFullscreenButton && onFullScreenClick && (
        <NodeActionButton
          icon="lucide-maximize"
          position="top"
          onClick={onFullScreenClick}
        />
      )}

      {/* Flip button (bottom-center, on front side) */}
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