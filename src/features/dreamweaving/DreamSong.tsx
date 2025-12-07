import React from 'react';
import { DreamSongBlock, MediaInfo } from '../../core/types/dreamsong';
import { MediaFile } from '../../core/types/dreamnode';
import separatorImage from '../../assets/images/Separator.png';
import styles from './dreamsong.module.css';
import { PDFPreview } from '../../core/components/PDFPreview';

interface DreamSongProps {
  blocks: DreamSongBlock[];
  className?: string;
  sourceDreamNodeId?: string; // ID of the DreamNode this DreamSong belongs to (for scroll restoration)
  dreamNodeName?: string; // Name of the DreamNode for display in header
  dreamTalkMedia?: MediaFile[]; // DreamTalk media files to display above header
  onMediaClick?: (sourceDreamNodeId: string) => void; // Callback for media click navigation
  embedded?: boolean; // Whether this is being rendered in embedded context (e.g., 3D sphere back)
  githubPagesUrl?: string; // GitHub Pages URL for "View on Web" button
  onEditCanvas?: () => void; // Callback for editing canvas file
}

/**
 * DreamSong Component - Pure Canvas Renderer
 *
 * Browser-safe component that renders DreamSong canvas content.
 * No Node.js dependencies - works in both Obsidian and GitHub Pages.
 *
 * For local Obsidian use with extensions (Perspectives, README, etc.),
 * use DreamSongWithExtensions wrapper instead.
 */
export const DreamSong: React.FC<DreamSongProps> = ({
  blocks,
  className = '',
  sourceDreamNodeId,
  dreamNodeName,
  dreamTalkMedia,
  onMediaClick,
  embedded = false,
  githubPagesUrl,
  onEditCanvas
}) => {
  const containerClass = `${styles.dreamSongContainer} ${embedded ? styles.embedded : ''} ${className}`.trim();

  // Helper function to render DreamTalk media
  const renderDreamTalkMedia = (): React.ReactNode => {
    if (!dreamTalkMedia || dreamTalkMedia.length === 0) {
      return null;
    }

    // Use the first media file as the primary DreamTalk
    const primaryMedia = dreamTalkMedia[0];

    const commonProps = {
      style: { maxWidth: '100%', height: 'auto', borderRadius: '8px' }
    };

    // Handle MIME types
    const mimeType = primaryMedia.type.toLowerCase();

    if (mimeType.startsWith('image/')) {
      return (
        <img
          src={primaryMedia.data}
          alt="DreamTalk"
          {...commonProps}
          style={{ ...commonProps.style, cursor: onMediaClick ? 'pointer' : 'default' }}
          onClick={onMediaClick && sourceDreamNodeId ? () => onMediaClick(sourceDreamNodeId) : undefined}
        />
      );
    }

    if (mimeType.startsWith('video/')) {
      return (
        <video
          src={primaryMedia.data}
          controls
          preload="metadata"
          playsInline
          style={{ ...commonProps.style, maxHeight: '300px', cursor: onMediaClick ? 'pointer' : 'default' }}
          onClick={onMediaClick && sourceDreamNodeId ? () => onMediaClick(sourceDreamNodeId) : undefined}
        >
          Your browser does not support video playback.
        </video>
      );
    }

    if (mimeType.startsWith('audio/')) {
      return (
        <div
          style={{
            background: 'rgba(255,255,255,0.1)',
            padding: '12px',
            borderRadius: '8px',
            cursor: onMediaClick ? 'pointer' : 'default'
          }}
          onClick={onMediaClick && sourceDreamNodeId ? () => onMediaClick(sourceDreamNodeId) : undefined}
        >
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', marginBottom: '8px', fontWeight: '500' }}>
            DreamTalk Audio
          </div>
          <audio
            src={primaryMedia.data}
            controls
            preload="metadata"
            style={{ width: '100%' }}
          >
            Your browser does not support audio playback.
          </audio>
        </div>
      );
    }

    if (mimeType === 'application/pdf') {
      return (
        <div
          style={{
            background: 'rgba(255,255,255,0.1)',
            padding: '12px',
            borderRadius: '8px',
            cursor: onMediaClick ? 'pointer' : 'default'
          }}
          onClick={onMediaClick && sourceDreamNodeId ? () => onMediaClick(sourceDreamNodeId) : undefined}
        >
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', marginBottom: '8px', fontWeight: '500' }}>
            DreamTalk PDF
          </div>
          <PDFPreview
            src={primaryMedia.data}
            width={600}
            thumbnailMode={false}
            style={{
              width: '100%',
              maxHeight: '500px',
              overflow: 'auto',
              borderRadius: '8px',
              backgroundColor: 'white'
            }}
          />
        </div>
      );
    }

    return null;
  };

  // Always render UI - header with title and conditional sections
  return (
    <div
      className={containerClass}
      style={{ pointerEvents: 'auto' }}
      data-node-id={sourceDreamNodeId}
    >
      {/* DreamTalk media displayed above everything - only in non-embedded mode */}
      {!embedded && renderDreamTalkMedia() && (
        <div className={styles.dreamTalkSection}>
          {renderDreamTalkMedia()}
        </div>
      )}

      <div className={styles.dreamSongHeader}>
        {/* "View on Web" button - top right corner (only in fullscreen with GitHub Pages URL) */}
        {!embedded && githubPagesUrl && (
          <svg
            viewBox="0 0 16 16"
            width="40"
            height="40"
            fill="currentColor"
            className={styles.viewOnWebButton}
            onClick={() => window.open(githubPagesUrl, '_blank', 'noopener,noreferrer')}
            aria-label="View DreamSong on GitHub Pages"
            role="button"
            tabIndex={0}
            onKeyPress={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                window.open(githubPagesUrl, '_blank', 'noopener,noreferrer');
              }
            }}
          >
            <title>View on GitHub Pages</title>
            <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path>
          </svg>
        )}

        <div className={styles.dreamSongTitle}>
          {dreamNodeName || 'DreamSong'}
        </div>
        <img
          src={separatorImage}
          alt="Separator"
          className={styles.dreamSongSeparator}
        />
      </div>

      {/* Canvas content section with optional edit button */}
      {blocks.length > 0 && (
            <div style={{ position: 'relative' }}>
              {onEditCanvas && !embedded && (
                <button
                  onClick={onEditCanvas}
                  style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1rem',
                    padding: '0.5rem',
                    cursor: 'pointer',
                    border: '1px solid var(--background-modifier-border)',
                    borderRadius: '4px',
                    background: 'var(--background-secondary)',
                    color: 'var(--text-muted)',
                    opacity: 0.6,
                    transition: 'opacity 0.2s',
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                  title="Edit DreamSong canvas"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                </button>
              )}
              <div className={styles.dreamSongContent} style={{ pointerEvents: 'auto' }}>
                {blocks.map((block, index) => (
                  <DreamSongBlockComponent
                    key={block.id}
                    block={block}
                    blockIndex={index}
                    onMediaClick={onMediaClick}
                  />
                ))}
              </div>
            </div>
          )}
    </div>
  );
};

interface DreamSongBlockProps {
  block: DreamSongBlock;
  blockIndex: number;
  onMediaClick?: (sourceDreamNodeId: string) => void;
}

/**
 * Individual DreamSong content block - Memoized for performance
 */
const DreamSongBlockComponent = React.memo<DreamSongBlockProps>(({ block, blockIndex: _blockIndex, onMediaClick }) => {
  const getBlockClassName = (): string => {
    const baseClass = styles.dreamSongBlock;

    // For media-text blocks, use explicit alignment from block data
    if (block.type === 'media-text') {
      const typeClass = styles.dreamSongBlockMediaText;
      const alignClass = block.isLeftAligned ? styles.dreamSongBlockLeftAligned : styles.dreamSongBlockRightAligned;
      return `${baseClass} ${typeClass} ${alignClass}`;
    }

    if (block.type === 'text') {
      return `${baseClass} ${styles.dreamSongBlockText}`;
    }

    if (block.type === 'media') {
      return `${baseClass} ${styles.dreamSongBlockMedia}`;
    }

    return baseClass;
  };

  const renderMediaElement = (media: MediaInfo): React.ReactNode => {
    const commonProps = {
      className: styles.dreamSongMedia,
      alt: media.alt,
      loading: 'lazy' as const
    };

    const isClickable = media.sourceDreamNodeId && onMediaClick;
    const clickHandler = isClickable 
      ? (e: React.MouseEvent) => {
          e.stopPropagation();
          onMediaClick!(media.sourceDreamNodeId!);
        }
      : undefined;

    const containerStyle = isClickable 
      ? { cursor: 'pointer' } 
      : {};

    switch (media.type) {
      case 'image':
        return (
          <div style={containerStyle} onClick={clickHandler}>
            <img
              {...commonProps}
              src={media.src}
              alt={media.alt}
            />
          </div>
        );
      
      case 'video':
        // Special handling for .link files (YouTube thumbnails)
        if (media.isLinkFile && media.linkMetadata?.type === 'youtube') {
          return (
            <div
              style={{
                ...containerStyle,
                position: 'relative',
                display: 'inline-block'
              }}
              onClick={clickHandler}
            >
              <img
                className={styles.dreamSongMedia}
                src={media.src} // This is the thumbnail URL
                alt={media.alt}
                loading="lazy"
              />
              {/* YouTube play button overlay */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '60px',
                  height: '60px',
                  backgroundColor: 'rgba(255, 0, 0, 0.9)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '24px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  transition: 'all 0.2s ease',
                  zIndex: 10
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (media.linkMetadata?.url) {
                    window.open(media.linkMetadata.url, '_blank');
                  }
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.1)';
                  e.currentTarget.style.backgroundColor = 'rgba(255, 0, 0, 1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)';
                  e.currentTarget.style.backgroundColor = 'rgba(255, 0, 0, 0.9)';
                }}
              >
                ▶
              </div>
            </div>
          );
        }

        // Regular video handling
        return (
          <div
            style={{
              ...containerStyle,
              position: 'relative'
            }}
          >
            <video
              className={styles.dreamSongMedia}
              src={media.src}
              controls
              preload="metadata"
              playsInline
              onClickCapture={(e) => {
                // Prevent default video click behavior and handle DreamNode selection
                e.preventDefault();
                e.stopPropagation();

                // Calculate click position relative to video
                const rect = e.currentTarget.getBoundingClientRect();
                const relativeY = (e.clientY - rect.top) / rect.height;

                // Only handle clicks outside the controls area (bottom ~20%)
                if (relativeY < 0.8 && clickHandler) {
                  clickHandler(e);
                }
              }}
            >
              Your browser does not support video playback.
            </video>

            {/* Transparent overlay for DreamNode selection (avoiding controls area) */}
            {isClickable && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: '20%', // Leave space for video controls
                  zIndex: 1,
                  cursor: 'pointer'
                }}
                onClick={clickHandler}
              />
            )}
          </div>
        );
      
      case 'audio':
        return (
          <div className={styles.dreamSongAudioContainer} style={containerStyle} onClick={clickHandler}>
            <div className={styles.dreamSongAudioLabel}>{media.alt}</div>
            <audio
              className={styles.dreamSongMedia}
              src={media.src}
              controls
              preload="metadata"
            >
              Your browser does not support audio playback.
            </audio>
          </div>
        );
      
      case 'pdf':
        return (
          <div style={containerStyle} onClick={clickHandler}>
            <PDFPreview
              src={media.src}
              width={600}
              thumbnailMode={false}
              style={{
                width: '100%',
                maxHeight: '500px',
                overflow: 'auto',
                borderRadius: '8px',
                backgroundColor: 'white'
              }}
            />
          </div>
        );
      
      default:
        return (
          <div className={styles.dreamSongMediaError}>
            Unsupported media type: {media.type}
          </div>
        );
    }
  };

  const renderTextElement = (text: string): React.ReactNode => {
    return (
      <div 
        className={styles.dreamSongText}
        dangerouslySetInnerHTML={{ __html: text }}
      />
    );
  };

  return (
    <div className={getBlockClassName()}>
      {/* Standalone text block */}
      {block.type === 'text' && block.text && (
        <div className={styles.dreamSongTextOnly}>
          {renderTextElement(block.text)}
        </div>
      )}

      {/* Standalone media block */}
      {block.type === 'media' && block.media && (
        <div className={styles.dreamSongMediaOnly}>
          {renderMediaElement(block.media)}
        </div>
      )}

      {/* Media-text paired block with flip-flop layout */}
      {block.type === 'media-text' && block.media && block.text && (
        <div className={styles.dreamSongMediaText}>
          <div className={styles.dreamSongMediaContainer}>
            {renderMediaElement(block.media)}
          </div>
          <div className={styles.dreamSongTextContainer}>
            {renderTextElement(block.text)}
          </div>
        </div>
      )}

    </div>
  );
});

// Add display name for debugging
DreamSongBlockComponent.displayName = 'DreamSongBlockComponent';

export default DreamSong;