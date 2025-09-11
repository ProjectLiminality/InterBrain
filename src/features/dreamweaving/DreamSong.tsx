import React, { useMemo } from 'react';
import { DreamSongData, DreamSongBlock, MediaInfo } from '../../types/dreamsong';
import './dreamsong.module.css';

interface DreamSongProps {
  dreamSongData: DreamSongData;
  className?: string;
  sourceDreamNodeId?: string; // ID of the DreamNode this DreamSong belongs to (for scroll restoration)
  onMediaClick?: (sourceDreamNodeId: string) => void; // Callback for media click navigation
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
  onMediaClick
}) => {
  // Memoize blocks to prevent unnecessary re-renders
  const blocks = useMemo(() => dreamSongData.blocks, [dreamSongData.blocks]);

  if (!dreamSongData.hasContent) {
    return (
      <div className={`dreamsong-container ${className}`} style={{ pointerEvents: 'auto' }}>
        <div className="dreamsong-empty-state">
          <div className="empty-state-icon">📖</div>
          <div className="empty-state-text">
            No DreamSong content yet
          </div>
          <div className="empty-state-subtitle">
            Add content to your canvas to create a story flow
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`dreamsong-container ${className}`} 
      style={{ pointerEvents: 'auto' }}
      data-node-id={sourceDreamNodeId}
    >
      <div className="dreamsong-header">
        <div className="dreamsong-title">DreamSong</div>
        <div className="dreamsong-block-count">
          {dreamSongData.totalBlocks} {dreamSongData.totalBlocks === 1 ? 'block' : 'blocks'}
        </div>
      </div>
      
      <div className="dreamsong-content" style={{ pointerEvents: 'auto' }}>
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
 * Individual DreamSong content block
 */
const DreamSongBlockComponent: React.FC<DreamSongBlockProps> = ({ block, blockIndex, onMediaClick }) => {
  const getBlockClassName = (): string => {
    const baseClass = 'dreamsong-block';
    const typeClass = `dreamsong-block--${block.type}`;
    
    // For media-text blocks, use explicit alignment from block data
    if (block.type === 'media-text') {
      const alignClass = block.isLeftAligned ? 'dreamsong-block--left-aligned' : 'dreamsong-block--right-aligned';
      return `${baseClass} ${typeClass} ${alignClass}`;
    }
    
    return `${baseClass} ${typeClass}`;
  };

  const renderMediaElement = (media: MediaInfo): React.ReactNode => {
    const commonProps = {
      className: 'dreamsong-media',
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
              className="dreamsong-media"
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
          <div className="dreamsong-audio-container" style={containerStyle} onClick={clickHandler}>
            <div className="dreamsong-audio-label">{media.alt}</div>
            <audio
              className="dreamsong-media"
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
              className="dreamsong-media"
              style={{width: '100%', height: '400px', border: 'none'}}
              title={media.alt}
            />
          </div>
        );
      
      default:
        return (
          <div className="dreamsong-media-error">
            Unsupported media type: {media.type}
          </div>
        );
    }
  };

  const renderTextElement = (text: string): React.ReactNode => {
    return (
      <div 
        className="dreamsong-text"
        dangerouslySetInnerHTML={{ __html: text }}
      />
    );
  };

  return (
    <div className={getBlockClassName()}>
      {/* Standalone text block */}
      {block.type === 'text' && block.text && (
        <div className="dreamsong-text-only">
          {renderTextElement(block.text)}
        </div>
      )}

      {/* Standalone media block */}
      {block.type === 'media' && block.media && (
        <div className="dreamsong-media-only">
          {renderMediaElement(block.media)}
        </div>
      )}

      {/* Media-text paired block with flip-flop layout */}
      {block.type === 'media-text' && block.media && block.text && (
        <div className="dreamsong-media-text">
          <div className="dreamsong-media-container">
            {renderMediaElement(block.media)}
          </div>
          <div className="dreamsong-text-container">
            {renderTextElement(block.text)}
          </div>
        </div>
      )}

      {/* Block number indicator for debugging */}
      <div className="dreamsong-block-number">
        {blockIndex + 1}
      </div>
    </div>
  );
};

export default DreamSong;