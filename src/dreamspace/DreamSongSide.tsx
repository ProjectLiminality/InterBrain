import React from 'react';
import { DreamNode } from '../types/dreamnode';
import { dreamNodeStyles, getNodeColors, getNodeGlow, getEditModeGlow, getGitVisualState, getGitStateStyle, getGitGlow } from './dreamNodeStyles';
import { DreamSong } from '../features/dreamweaving/DreamSong';
import { DreamSongData } from '../types/dreamsong';
import { setIcon } from 'obsidian';

interface DreamSongSideProps {
  dreamNode: DreamNode;
  isHovered: boolean;
  isEditModeActive: boolean;
  isPendingRelationship: boolean;
  shouldShowFlipButton: boolean;
  nodeSize: number;
  borderWidth: number;
  dreamSongData: DreamSongData | null;
  isLoadingDreamSong: boolean;
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
  nodeSize,
  borderWidth,
  dreamSongData,
  isLoadingDreamSong,
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
        transform: `rotateY(180deg) translateZ(-2px) ${isHovered ? `scale(${dreamNodeStyles.states.hover.scale})` : 'scale(1)'}`,
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
      {/* DreamSong content wrapper with circular masking */}
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
        {dreamSongData ? (
          <DreamSong 
            dreamSongData={dreamSongData}
            className="flip-enter"
          />
        ) : isLoadingDreamSong ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: dreamNodeStyles.colors.text.primary
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
              color: dreamNodeStyles.colors.text.primary
            }}
          >
            No DreamSong available
          </div>
        )}
      </div>

      {/* Full-screen button (top-center, on back side) */}
      {isHovered && onFullScreenClick && (
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