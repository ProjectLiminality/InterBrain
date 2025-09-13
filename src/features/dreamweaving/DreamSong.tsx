import React from 'react';
import { DreamSongBlock, MediaInfo } from '../../types/dreamsong';
import { MediaFile } from '../../types/dreamnode';
import separatorImage from '../../assets/images/Separator.png';
import styles from './dreamsong.module.css';

interface DreamSongProps {
  blocks: DreamSongBlock[];
  className?: string;
  sourceDreamNodeId?: string; // ID of the DreamNode this DreamSong belongs to (for scroll restoration)
  dreamNodeName?: string; // Name of the DreamNode for display in header
  dreamTalkMedia?: MediaFile[]; // DreamTalk media files to display above header
  onMediaClick?: (sourceDreamNodeId: string) => void; // Callback for media click navigation
  embedded?: boolean; // Whether this is being rendered in embedded context (e.g., 3D sphere back)
}

/**
 * DreamSong Component - Pure Presentational Component
 *
 * Layer 3 of the three-layer DreamSong architecture.
 * Purely presentational - renders blocks without any state management.
 * All data transformation happens in Layer 1 (parser).
 * All state management happens in Layer 2 (hook).
 */
export const DreamSong: React.FC<DreamSongProps> = ({
  blocks,
  className = '',
  sourceDreamNodeId,
  dreamNodeName,
  dreamTalkMedia,
  onMediaClick,
  embedded = false
}) => {
  const containerClass = `${styles.dreamSongContainer} ${embedded ? styles.embedded : ''} ${className}`.trim();

  // Check if we have content to display
  const hasContent = blocks.length > 0;

  // Helper function to render DreamTalk media
  const renderDreamTalkMedia = (): React.ReactNode => {
    console.log('🎵 [DreamSong] renderDreamTalkMedia called:', { dreamTalkMedia, embedded });

    if (!dreamTalkMedia || dreamTalkMedia.length === 0) {
      console.log('🎵 [DreamSong] No DreamTalk media found');
      return null;
    }

    // Use the first media file as the primary DreamTalk
    const primaryMedia = dreamTalkMedia[0];
    console.log('🎵 [DreamSong] Primary media:', primaryMedia);

    const commonProps = {
      style: { maxWidth: '100%', height: 'auto', borderRadius: '8px' }
    };

    // Handle MIME types
    const mimeType = primaryMedia.type.toLowerCase();
    console.log('🎵 [DreamSong] Processing MIME type:', mimeType);

    if (mimeType.startsWith('image/')) {
      console.log('🎵 [DreamSong] Rendering image DreamTalk');
      return (
        <img
          src={primaryMedia.data}
          alt="DreamTalk"
          {...commonProps}
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
          style={{ ...commonProps.style, maxHeight: '300px' }}
        >
          Your browser does not support video playback.
        </video>
      );
    }

    if (mimeType.startsWith('audio/')) {
      return (
        <div style={{ background: 'rgba(255,255,255,0.1)', padding: '12px', borderRadius: '8px' }}>
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

    return null;
  };

  if (!hasContent) {
    return (
      <div className={containerClass} style={{ pointerEvents: 'auto' }}>
        <div className={styles.dreamSongEmptyState}>
          <div className={styles.emptyStateIcon}>📖</div>
          <div className={styles.emptyStateText}>
            No DreamSong content yet
          </div>
          <div className={styles.emptyStateSubtitle}>
            Add content to your canvas to create a story flow
          </div>
        </div>
      </div>
    );
  }

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
        <div className={styles.dreamSongTitle}>
          {dreamNodeName || 'DreamSong'}
        </div>
        <img
          src={separatorImage}
          alt="Separator"
          className={styles.dreamSongSeparator}
        />
      </div>

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
        return (
          <div style={containerStyle} onClick={clickHandler}>
            <video
              className={styles.dreamSongMedia}
              src={media.src}
              controls
              preload="metadata"
              playsInline
            >
              Your browser does not support video playback.
            </video>
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
            <iframe
              src={media.src}
              className={styles.dreamSongMedia}
              style={{width: '100%', height: '400px', border: 'none'}}
              title={media.alt}
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