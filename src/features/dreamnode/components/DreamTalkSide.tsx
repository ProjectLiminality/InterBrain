import React from 'react';
import { DreamNode, MediaFile } from '../types/dreamnode';
import { dreamNodeStyles, getNodeColors, getGoldenGlow, getMediaContainerStyle, getMediaOverlayStyle } from '../styles/dreamNodeStyles';
import { extractYouTubeVideoId } from '../../drag-and-drop';
import { parseLinkFileContent, isLinkFile, getLinkThumbnail } from '../../drag-and-drop';
import { PDFPreview } from './PDFPreview';
import { NodeActionButton } from './NodeActionButton';

interface DreamTalkSideProps {
  dreamNode: DreamNode;
  isHovered: boolean;
  isEditModeActive: boolean;
  isPendingRelationship: boolean;
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

  // Treat pending relationship as forced hover state
  // This shows name overlay and glow for related nodes in edit mode
  const effectiveHover = isHovered || isPendingRelationship;

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
      {/* DreamTalk Media Container - only show if media has actual data */}
      {dreamNode.dreamTalkMedia[0]?.data && dreamNode.dreamTalkMedia[0].data.length > 0 && (
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
    backfaceVisibility: 'hidden' as const,
    // CSS containment for better browser rendering with many nodes
    contain: 'layout style paint' as const,
    contentVisibility: 'auto' as const
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
    // Use a larger width for better quality PDF rendering that fills the circle
    // Render at 600px for crisp display and let CSS scale/clip to fit
    return (
      <PDFPreview
        src={media.data}
        width={600}
        thumbnailMode={true}
        style={{
          ...mediaStyle,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          borderRadius: mediaStyle.borderRadius
        }}
      />
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