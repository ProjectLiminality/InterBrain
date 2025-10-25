import React from 'react';
import { DreamNode, MediaFile } from '../types/dreamnode';
import { dreamNodeStyles, getNodeColors, getNodeGlow, getEditModeGlow, getMediaContainerStyle, getMediaOverlayStyle, getGitVisualState, getGitStateStyle, getGitGlow } from './dreamNodeStyles';
import { setIcon } from 'obsidian';
import { extractYouTubeVideoId } from '../utils/url-utils';
import { parseLinkFileContent, isLinkFile, getLinkThumbnail } from '../utils/link-file-utils';

interface DreamTalkSideProps {
  dreamNode: DreamNode;
  isHovered: boolean;
  isEditModeActive: boolean;
  isPendingRelationship: boolean;
  shouldShowFlipButton: boolean;
  shouldShowFullscreenButton: boolean;
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
  isEditModeActive: _isEditModeActive,
  isPendingRelationship,
  shouldShowFlipButton,
  shouldShowFullscreenButton,
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
        transform: isHovered ? `scale(${dreamNodeStyles.states.hover.scale})` : 'scale(1)',
        animation: gitStyle.animation,
        boxShadow: (() => {
          // Priority 1: Git status glow (always highest priority)
          if (gitStyle.glowIntensity > 0) {
            return getGitGlow(gitState, gitStyle.glowIntensity);
          }
          
          // Priority 2: Relationship glow (edit mode OR copilot mode)
          if (isPendingRelationship) {
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
      {/* DreamTalk Media Container - only show if media has actual data */}
      {dreamNode.dreamTalkMedia[0]?.data && dreamNode.dreamTalkMedia[0].data.length > 0 && (
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

      {/* Empty state text - when no media OR media data not loaded yet */}
      {(!dreamNode.dreamTalkMedia[0] || !dreamNode.dreamTalkMedia[0].data || dreamNode.dreamTalkMedia[0].data.length === 0) && (
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

      {/* Full-screen button (top-center, on front side) - Stable Click Wrapper */}
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
                  (iconElement as HTMLElement).style.width = '36px';
                  (iconElement as HTMLElement).style.height = '36px';
                }
              }
            }}
          />
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
                (iconElement as HTMLElement).style.width = '36px';
                (iconElement as HTMLElement).style.height = '36px';
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
    borderRadius: '50%',
    // GPU acceleration and anti-aliasing for better distant rendering
    transform: 'translateZ(0)',
    willChange: 'transform',
    imageRendering: 'auto' as const,
    WebkitFontSmoothing: 'antialiased' as const,
    backfaceVisibility: 'hidden' as const
  };

  // Don't render anything if media data not yet loaded (no loading placeholder)
  if (!media.data || media.data.length === 0) {
    return null;
  }

  // Handle .link files
  if (isLinkFile(media.path)) {
    try {
      const linkMetadata = parseLinkFileContent(media.data);

      if (linkMetadata) {
        // YouTube link file handling
        if (linkMetadata.type === 'youtube' && linkMetadata.videoId) {
          const thumbnailUrl = getLinkThumbnail(linkMetadata);
          if (thumbnailUrl) {
            return (
              <div style={{...mediaStyle, position: 'relative', overflow: 'hidden'}}>
                <img
                  src={thumbnailUrl}
                  alt="YouTube video thumbnail"
                  style={mediaStyle}
                  draggable={false}
                />
                {/* YouTube play icon overlay */}
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '40%',
                    height: '40%',
                    background: 'rgba(255, 0, 0, 0.8)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    pointerEvents: 'none'
                  }}
                >
                  ▶
                </div>
              </div>
            );
          }
        }

        // Generic website link file handling
        if (linkMetadata.type === 'website') {
          return (
            <div
              style={{
                ...mediaStyle,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 'bold'
              }}
            >
              🔗
            </div>
          );
        }

        // Fallback for other link types
        return (
          <div
            style={{
              ...mediaStyle,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 100, 200, 0.8)',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 'bold'
            }}
          >
            LINK
          </div>
        );
      }
    } catch (error) {
      console.error('Failed to parse .link file:', error);
    }

    // Fallback for invalid .link files
    return (
      <div
        style={{
          ...mediaStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(200, 100, 0, 0.8)',
          color: '#FFFFFF',
          fontSize: '10px',
          fontWeight: 'bold'
        }}
      >
        .LINK
      </div>
    );
  }

  // Handle legacy URL-based media (backward compatibility)
  if (media.path?.startsWith('url:') || media.absolutePath?.startsWith('http')) {
    const url = media.data || media.absolutePath;

    // YouTube URL handling
    if (media.type === 'youtube') {
      const videoId = extractYouTubeVideoId(url);
      if (videoId) {
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        return (
          <div style={{...mediaStyle, position: 'relative', overflow: 'hidden'}}>
            <img
              src={thumbnailUrl}
              alt="YouTube video thumbnail"
              style={mediaStyle}
              draggable={false}
            />
            {/* YouTube play icon overlay */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '40%',
                height: '40%',
                background: 'rgba(255, 0, 0, 0.8)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '16px',
                fontWeight: 'bold',
                pointerEvents: 'none'
              }}
            >
              ▶
            </div>
          </div>
        );
      }
    }

    // Generic website URL handling
    if (media.type === 'website') {
      return (
        <div
          style={{
            ...mediaStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: '#FFFFFF',
            fontSize: '12px',
            fontWeight: 'bold'
          }}
        >
          🔗
        </div>
      );
    }

    // Fallback for other URL types
    return (
      <div
        style={{
          ...mediaStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 100, 200, 0.8)',
          color: '#FFFFFF',
          fontSize: '12px',
          fontWeight: 'bold'
        }}
      >
        URL
      </div>
    );
  }

  // Handle file-based media (existing logic)
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

  if (media.type.startsWith('application/pdf')) {
    return (
      <div style={{...mediaStyle, overflow: 'hidden'}}>
        <iframe
          src={media.data}
          style={{
            width: '200%',
            height: '200%',
            transform: 'scale(0.5) translate(-50%, -50%)',
            transformOrigin: 'top left',
            border: 'none',
            pointerEvents: 'none'
          }}
          title="PDF preview"
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