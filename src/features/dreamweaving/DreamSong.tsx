import React, { useMemo } from 'react';
import { DreamSongData, DreamSongBlock, MediaInfo } from '../../types/dreamsong';
import separatorImage from '../../assets/images/Separator.png';
import styles from './dreamsong.module.css';

interface DreamSongProps {
  dreamSongData: DreamSongData;
  className?: string;
  sourceDreamNodeId?: string; // ID of the DreamNode this DreamSong belongs to (for scroll restoration)
  dreamNodeName?: string; // Name of the DreamNode for display in header
  onMediaClick?: (sourceDreamNodeId: string) => void; // Callback for media click navigation
  embedded?: boolean; // Whether this is being rendered in embedded context (e.g., 3D sphere back)
}

/**
 * DreamSong Component
 * 
 * Pure content component that displays a linear story flow generated from canvas dependency graphs.
 * Features flip-flop layout with alternating media-text positioning.
 * Container-agnostic - can be rendered in any context (embedded, full-screen, etc.).
 */
export const DreamSong: React.FC<DreamSongProps> = ({
  dreamSongData,
  className = '',
  sourceDreamNodeId,
  dreamNodeName,
  onMediaClick,
  embedded = false
}) => {
  // Memoize blocks to prevent unnecessary re-renders
  const blocks = useMemo(() => dreamSongData.blocks, [dreamSongData.blocks]);

  const containerClass = `${styles.dreamSongContainer} ${embedded ? styles.embedded : ''} ${className}`.trim();

  if (!dreamSongData.hasContent) {
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

  // Calculate flip-flop index for media-text pairs only
  const blocksWithFlipFlop = useMemo(() => {
    let mediaTextPairIndex = 0;
    return blocks.map((block) => {
      if (block.type === 'media-text') {
        const isLeftAligned = mediaTextPairIndex % 2 === 0;
        mediaTextPairIndex++;
        return { ...block, isLeftAligned };
      }
      return block;
    });
  }, [blocks]);

  return (
    <div
      className={containerClass}
      style={{ pointerEvents: 'auto' }}
      data-node-id={sourceDreamNodeId}
    >
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
        {blocksWithFlipFlop.map((block, index) => (
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
 * Individual DreamSong content block
 */
const DreamSongBlockComponent: React.FC<DreamSongBlockProps> = ({ block, blockIndex: _blockIndex, onMediaClick }) => {
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
};

export default DreamSong;