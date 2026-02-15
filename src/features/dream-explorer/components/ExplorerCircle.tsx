/**
 * Explorer Circle
 *
 * A single circle in the Dream Explorer representing a file, folder, or submodule.
 * Reuses styling patterns from DreamNode components (border colors, golden glow).
 * Uses Obsidian's setIcon for Lucide icons, MediaRenderer for images/submodules.
 *
 * Visual pattern mirrors DreamTalkSide:
 * - Media items: image fills circle, hover shows dark overlay with centered name
 * - Icon items: large icon fills circle as backdrop, name centered on top
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

/**
 * Finder-style middle truncation: show beginning and end of filename
 * with ellipsis in the middle. The tail portion is ~40% of the name.
 */
function middleTruncate(name: string): { head: string; tail: string } {
  const tailLen = Math.max(4, Math.ceil(name.length * 0.3));
  return {
    head: name.slice(0, name.length - tailLen).trimEnd(),
    tail: name.slice(name.length - tailLen).trimStart(),
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

  // Set Lucide icon via Obsidian's setIcon — large backdrop style
  // SVG uses 70% of container via CSS so it scales smoothly with CSS transitions
  useEffect(() => {
    if (hasMedia || !iconRef.current) return;
    const el = iconRef.current;
    el.innerHTML = '';
    const iconName = getLucideIcon(item);
    setIcon(el, iconName);
    const svg = el.querySelector('svg');
    if (svg) {
      svg.style.width = '70%';
      svg.style.height = '70%';
      svg.style.color = getBorderColor(item.type);
      svg.style.opacity = '0.15';
    }
  }, [item, hasMedia]);

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
  const isSubmodule = item.type === 'dream-submodule' || item.type === 'dreamer-submodule';
  // Submodules get HolonView-style thick borders to stand out among files
  const borderWidth = isSubmodule
    ? Math.max(2, Math.min(8, Math.round(r * 0.08)))
    : Math.max(1.5, Math.sqrt(r) * 0.3);
  const showGlow = isSelected || isHovered;
  // Visual radius is 95% of packed radius — creates uniform gaps between circles
  // (same pattern as HolonView's SubmoduleCircle)
  const vr = r * 0.95;
  const diameter = vr * 2;

  return (
    <div
      style={{
        position: 'absolute',
        left: `calc(50% + ${x}px - ${vr}px)`,
        top: `calc(50% + ${y}px - ${vr}px)`,
        width: `${diameter}px`,
        height: `${diameter}px`,
        borderRadius: '50%',
        border: `${borderWidth}px solid ${borderColor}`,
        background: '#000000',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'left 1s ease-in-out, top 1s ease-in-out, width 1s ease-in-out, height 1s ease-in-out, border-width 1s ease-in-out, font-size 1s ease-in-out, box-shadow 0.2s ease, transform 0.2s ease',
        fontSize: `${Math.max(8, vr * 0.15)}px`,
        boxShadow: showGlow ? getGoldenGlow(20) : 'none',
        transform: isHovered ? 'scale(1.05)' : 'scale(1)',
        userSelect: 'none',
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={item.name}
    >
      {/* ── Media items: image fills circle, hover shows name overlay ── */}
      {hasMedia && mediaFile && (
        <div style={getMediaContainerStyle()}>
          <MediaRenderer media={mediaFile} />
          <div style={getMediaOverlayStyle()} />

          {/* Name overlay — always visible for submodules, hover-only for others */}
          {(isSubmodule || isHovered) && (
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
              <span
                style={{
                  maxWidth: '75%',
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'center',
                  color: dreamNodeStyles.colors.text.primary,
                  fontFamily: dreamNodeStyles.typography.fontFamily,
                  fontSize: 'inherit',
                  lineHeight: 1.2,
                  padding: '8px',
                }}
              >
                <span style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                  flexShrink: 1,
                }}>
                  {middleTruncate(item.name).head}
                </span>
                <span style={{
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}>
                  {middleTruncate(item.name).tail}
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Icon items: large icon backdrop + centered name ── */}
      {!hasMedia && (
        <>
          {/* Large icon as backdrop — fills the circle, low opacity */}
          <div
            ref={iconRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          />

          {/* Centered name on top of icon backdrop — Finder-style middle truncation */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            <span
              style={{
                maxWidth: '75%',
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'center',
                fontSize: 'inherit',
                fontFamily: dreamNodeStyles.typography.fontFamily,
                color: dreamNodeStyles.colors.text.primary,
                lineHeight: 1.2,
              }}
            >
              <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
                flexShrink: 1,
              }}>
                {middleTruncate(item.name).head}
              </span>
              <span style={{
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}>
                {middleTruncate(item.name).tail}
              </span>
            </span>
          </div>
        </>
      )}
    </div>
  );
};
