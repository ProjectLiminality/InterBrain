import React from 'react';
import { DreamNode, MediaFile } from '../types/dreamnode';
import { dreamNodeStyles, getNodeColors, getNodeGlow, getEditModeGlow, getMediaContainerStyle, getMediaOverlayStyle, getGitVisualState, getGitStateStyle, getGitGlow } from './dreamNodeStyles';
import { setIcon } from 'obsidian';

interface DreamTalkSideProps {
  dreamNode: DreamNode;
  isHovered: boolean;
  isEditModeActive: boolean;
  isPendingRelationship: boolean;
  shouldShowFlipButton: boolean;
  nodeSize: number;
  borderWidth: number;
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
  isEditModeActive,
  isPendingRelationship,
  shouldShowFlipButton,
  nodeSize,
  borderWidth,
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
        transform: isHovered ? `scale(${dreamNodeStyles.states.hover.scale}) translateZ(1px)` : 'scale(1) translateZ(1px)',
        animation: gitStyle.animation,
        backfaceVisibility: 'hidden',
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
      {/* DreamTalk Media Container */}
      {dreamNode.dreamTalkMedia[0] && (
        <div style={getMediaContainerStyle()}>
          <MediaRenderer media={dreamNode.dreamTalkMedia[0]} />
          {/* Fade-to-black overlay */}
          <div style={getMediaOverlayStyle()} />
          
          {/* Hover overlay with name */}
          {isHovered && (
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
                opacity: isHovered ? 1 : 0,
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

      {/* Empty state text - when no media */}
      {!dreamNode.dreamTalkMedia[0] && (
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
      {isHovered && onFullScreenClick && dreamNode.dreamTalkMedia[0] && (
        <div
          style={{
            position: 'absolute',
            top: '8px',
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
            zIndex: 20,
            pointerEvents: 'auto'
          }}
          onClick={(e) => {
            e.stopPropagation(); // Prevent event from bubbling to node
            onFullScreenClick(e);
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
        >
        </div>
      )}
      
      {/* Professional flip button - Obsidian style */}
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
            zIndex: 20,
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

/**
 * Renders different types of media in the DreamTalk circle
 */
function MediaRenderer({ media }: { media: MediaFile }) {
  const mediaStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    borderRadius: '50%'
  };

  if (media.type.startsWith('image/')) {
    return (
      <img 
        src={media.data} 
        alt="DreamTalk symbol"
        style={mediaStyle}
        draggable={false}
      />
    );
  }

  if (media.type.startsWith('video/')) {
    return (
      <video 
        src={media.data}
        style={mediaStyle}
        muted
        loop
        autoPlay
        playsInline
      />
    );
  }

  if (media.type.startsWith('audio/')) {
    return (
      <div
        style={{
          ...mediaStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.8)'
        }}
      >
        <audio 
          controls 
          src={media.data}
          style={{ 
            width: '90%', 
            maxWidth: '80px',
            filter: 'invert(1)'
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        ...mediaStyle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#FFFFFF',
        fontSize: '10px',
        background: 'rgba(0, 0, 0, 0.8)'
      }}
    >
      {media.type}
    </div>
  );
}