/**
 * Explorer Circle
 *
 * A single circle in the Dream Explorer representing a file, folder, or submodule.
 * Reuses styling patterns from DreamNode components (border colors, golden glow).
 * Uses Obsidian's setIcon for Lucide icons, MediaRenderer for images/submodules.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { setIcon } from 'obsidian';
import { dreamNodeStyles, getGoldenGlow, getMediaContainerStyle, getMediaOverlayStyle } from '../../dreamnode/styles/dreamNodeStyles';
import { MediaRenderer } from '../../dreamnode/components/MediaRenderer';
import type { MediaFile } from '../../dreamnode/types/dreamnode';
import type { ExplorerItem } from '../types/explorer';

interface ExplorerCircleProps {
  item: ExplorerItem;
  x: number;
  y: number;
  r: number;
  isSelected: boolean;
  onClick: (item: ExplorerItem, e: React.MouseEvent) => void;
  onDoubleClick: (item: ExplorerItem) => void;
}

/** Get border color based on item type */
function getBorderColor(type: ExplorerItem['type']): string {
  switch (type) {
    case 'dream-submodule':
      return dreamNodeStyles.colors.dream.border; // Blue
    case 'dreamer-submodule':
      return dreamNodeStyles.colors.dreamer.border; // Red
    default:
      return '#FFFFFF'; // Pure white for local files/folders
  }
}

/** Get Lucide icon name for non-previewable items */
function getLucideIcon(item: ExplorerItem): string {
  if (item.type === 'readme') return 'lucide-file-text';
  if (item.type === 'folder') return 'lucide-folder';
  if (item.type === 'dream-submodule' || item.type === 'dreamer-submodule') return 'lucide-circle-dot';
  if (item.type === 'image') return 'lucide-image';

  const ext = item.name.split('.').pop()?.toLowerCase() || '';
  const codeExts = new Set(['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'json', 'yaml', 'yml', 'toml', 'html', 'css', 'scss']);
  if (codeExts.has(ext)) return 'lucide-file-code';
  if (ext === 'canvas') return 'lucide-layout-dashboard';
  return 'lucide-file';
}

/** Check if this item should use MediaRenderer (has preview media) */
function shouldUseMediaRenderer(item: ExplorerItem): boolean {
  return !!item.mediaAbsolutePath && (
    item.type === 'image' ||
    item.type === 'dream-submodule' ||
    item.type === 'dreamer-submodule'
  );
}

/** Build a minimal MediaFile from an ExplorerItem for MediaRenderer */
function buildMediaFile(item: ExplorerItem): MediaFile | null {
  if (!item.mediaAbsolutePath) return null;

  const ext = item.mediaAbsolutePath.split('.').pop()?.toLowerCase() || '';
  let type = 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') type = 'image/jpeg';
  else if (ext === 'gif') type = 'image/gif';
  else if (ext === 'webp') type = 'image/webp';
  else if (ext === 'svg') type = 'image/svg+xml';
  else if (ext === 'mp4') type = 'video/mp4';
  else if (ext === 'webm') type = 'video/webm';
  else if (ext === 'pdf') type = 'application/pdf';

  return {
    path: item.mediaAbsolutePath.split('/').pop() || item.name,
    type,
    size: item.size,
    data: '',
    absolutePath: item.mediaAbsolutePath,
  };
}

export const ExplorerCircle: React.FC<ExplorerCircleProps> = ({
  item,
  x,
  y,
  r,
  isSelected,
  onClick,
  onDoubleClick,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const iconRef = useRef<HTMLDivElement>(null);

  const useMedia = shouldUseMediaRenderer(item);
  const mediaFile = useMedia ? buildMediaFile(item) : null;
  const hasMedia = useMedia && mediaFile;

  // Set Lucide icon via Obsidian's setIcon
  useEffect(() => {
    if (hasMedia || !iconRef.current) return;
    const el = iconRef.current;
    el.innerHTML = '';
    const iconName = getLucideIcon(item);
    setIcon(el, iconName);
    // Style the SVG
    const svg = el.querySelector('svg');
    if (svg) {
      const iconSize = Math.max(16, Math.min(32, r * 0.4));
      svg.style.width = `${iconSize}px`;
      svg.style.height = `${iconSize}px`;
      svg.style.color = getBorderColor(item.type);
      svg.style.opacity = '0.7';
    }
  }, [item, r, hasMedia]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick(item, e);
    },
    [item, onClick]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDoubleClick(item);
    },
    [item, onDoubleClick]
  );

  const borderColor = getBorderColor(item.type);
  const borderWidth = Math.max(2, r * 0.06);
  const showGlow = isSelected || isHovered;
  const diameter = r * 2;
  const isSubmodule = item.type === 'dream-submodule' || item.type === 'dreamer-submodule';

  // Font size scales with circle radius
  const nameFontSize = Math.max(8, Math.min(14, r * 0.22));

  return (
    <div
      style={{
        position: 'absolute',
        left: `calc(50% + ${x}px - ${r}px)`,
        top: `calc(50% + ${y}px - ${r}px)`,
        width: `${diameter}px`,
        height: `${diameter}px`,
        borderRadius: '50%',
        border: `${borderWidth}px solid ${borderColor}`,
        background: '#000000',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'left 1s ease-in-out, top 1s ease-in-out, width 1s ease-in-out, height 1s ease-in-out, border-width 1s ease-in-out, box-shadow 0.2s ease, transform 0.2s ease',
        boxShadow: showGlow ? getGoldenGlow(20) : 'none',
        transform: isHovered ? 'scale(1.05)' : 'scale(1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={item.name}
    >
      {/* Media preview (submodules + images via MediaRenderer) */}
      {hasMedia && mediaFile && (
        <div style={getMediaContainerStyle()}>
          <MediaRenderer media={mediaFile} />
          <div style={getMediaOverlayStyle()} />

          {/* Hover overlay with name (submodules only — same pattern as SubmoduleCircle) */}
          {isSubmodule && isHovered && (
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
                pointerEvents: 'none',
                zIndex: 10,
              }}
            >
              <div
                style={{
                  color: dreamNodeStyles.colors.text.primary,
                  fontFamily: dreamNodeStyles.typography.fontFamily,
                  fontSize: Math.max(8, r * 0.15),
                  textAlign: 'center',
                  padding: '8px',
                }}
              >
                {item.name}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lucide icon for non-previewable items */}
      {!hasMedia && (
        <div
          ref={iconRef}
          style={{
            lineHeight: 1,
            marginBottom: '4px',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        />
      )}

      {/* Name label — always shown for non-media items, positioned at bottom for media */}
      {!hasMedia && (
        <span
          style={{
            maxWidth: `${diameter * 0.85}px`,
            textAlign: 'center',
            fontSize: `${nameFontSize}px`,
            fontFamily: dreamNodeStyles.typography.fontFamily,
            color: dreamNodeStyles.colors.text.primary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            lineHeight: 1.2,
          }}
        >
          {item.name}
        </span>
      )}

      {/* Name label for media items (non-submodule) — bottom positioned */}
      {hasMedia && !isSubmodule && (
        <span
          style={{
            position: 'absolute',
            bottom: `${Math.max(4, r * 0.12)}px`,
            maxWidth: `${diameter * 0.85}px`,
            textAlign: 'center',
            fontSize: `${nameFontSize}px`,
            fontFamily: dreamNodeStyles.typography.fontFamily,
            color: dreamNodeStyles.colors.text.primary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textShadow: '0 1px 4px rgba(0,0,0,0.9)',
            pointerEvents: 'none',
            lineHeight: 1.2,
            zIndex: 5,
          }}
        >
          {item.name}
        </span>
      )}
    </div>
  );
};
