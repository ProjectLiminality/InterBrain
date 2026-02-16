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
 *
 * When childPositioned is provided, renders skeleton child circles inside this
 * circle. They use the same coordinate system (offsets from center) but scaled
 * to fit inside this circle's diameter. Since the circle has overflow:hidden
 * and borderRadius:50%, children are naturally clipped. When the circle's
 * position/size animate via CSS transitions, children scale with it seamlessly.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { setIcon } from 'obsidian';
import { dreamNodeStyles, getGoldenGlow, getMediaContainerStyle, getMediaOverlayStyle } from '../../dreamnode/styles/dreamNodeStyles';
import { MediaRenderer } from '../../dreamnode/components/MediaRenderer';
import type { MediaFile } from '../../dreamnode/types/dreamnode';
import type { ExplorerItem } from '../types/explorer';
import type { PositionedItem } from '../types/explorer';

interface ExplorerCircleProps {
  item: ExplorerItem;
  x: number;
  y: number;
  r: number;
  isSelected: boolean;
  /** When true, render icon-based fallback for ALL items (skip MediaRenderer) */
  skeleton?: boolean;
  /** Child circle positions to render inside this circle (skeleton mode, for zoom preview) */
  childPositioned?: PositionedItem[];
  /** The container radius used to compute childPositioned — needed to scale children to fit inside this circle */
  childContainerRadius?: number;
  onClick?: (item: ExplorerItem, e: React.MouseEvent) => void;
  onDoubleClick?: (item: ExplorerItem) => void;
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

/** Format bytes into human-readable size */
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export const ExplorerCircle: React.FC<ExplorerCircleProps> = ({
  item,
  x,
  y,
  r,
  isSelected,
  skeleton = false,
  childPositioned,
  childContainerRadius,
  onClick,
  onDoubleClick,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const iconRef = useRef<HTMLDivElement>(null);

  const useMedia = !skeleton && shouldUseMediaRenderer(item);
  const mediaFile = useMedia ? buildMediaFile(item) : null;
  const hasMedia = useMedia && mediaFile;
  const hasChildren = childPositioned && childPositioned.length > 0 && childContainerRadius && childContainerRadius > 0;

  // Set Lucide icon via Obsidian's setIcon — large backdrop style
  // SVG uses 70% of container via CSS so it scales smoothly with CSS transitions
  useEffect(() => {
    if (hasMedia || hasChildren || !iconRef.current) return;
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
  }, [item, hasMedia, hasChildren]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick?.(item, e);
    },
    [item, onClick]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDoubleClick?.(item);
    },
    [item, onDoubleClick]
  );

  const borderColor = getBorderColor(item.type);
  const isSubmodule = item.type === 'dream-submodule' || item.type === 'dreamer-submodule';
  // Submodules get HolonView-style thick borders to stand out among files
  // r=0 circles (collapsed in reduced mode) get 0 border so they're fully invisible
  const borderWidth = r <= 0 ? 0 : isSubmodule
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
        cursor: r > 0 ? 'pointer' : 'default',
        pointerEvents: r > 0 ? 'auto' : 'none',
        transition: 'left 1s ease-in-out, top 1s ease-in-out, width 1s ease-in-out, height 1s ease-in-out, border-width 1s ease-in-out, font-size 1s ease-in-out, box-shadow 0.2s ease, transform 0.2s ease',
        fontSize: `${Math.max(8, vr * 0.15)}px`,
        boxShadow: showGlow ? getGoldenGlow(20) : 'none',
        transform: isHovered && !hasChildren ? 'scale(1.05)' : 'scale(1)',
        userSelect: 'none',
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={item.name}
    >
      {/* ── Child circles (zoom preview) ── */}
      {hasChildren && childContainerRadius && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        >
          {childPositioned!.map(child => {
            // Scale child positions from containerRadius coordinate space
            // to this circle's visual diameter. Children are positioned as
            // offsets from center, so we scale the offset and the radius.
            const scale = vr / childContainerRadius;
            const cx = child.x * scale;
            const cy = child.y * scale;
            const cr = child.r * scale;
            const cvr = cr * 0.95;
            const cd = cvr * 2;
            const childBorderColor = getBorderColor(child.item.type);
            const childIsSubmodule = child.item.type === 'dream-submodule' || child.item.type === 'dreamer-submodule';
            const childBorderWidth = childIsSubmodule
              ? Math.max(1, Math.min(4, Math.round(cr * 0.08)))
              : Math.max(0.5, Math.sqrt(cr) * 0.3);
            const childFontSize = Math.max(4, cvr * 0.15);

            return (
              <div
                key={`child-${child.item.path}`}
                style={{
                  position: 'absolute',
                  left: `calc(50% + ${cx}px - ${cvr}px)`,
                  top: `calc(50% + ${cy}px - ${cvr}px)`,
                  width: `${cd}px`,
                  height: `${cd}px`,
                  borderRadius: '50%',
                  border: `${childBorderWidth}px solid ${childBorderColor}`,
                  background: '#000000',
                  overflow: 'hidden',
                  fontSize: `${childFontSize}px`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                <span
                  style={{
                    maxWidth: '75%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontFamily: dreamNodeStyles.typography.fontFamily,
                    color: dreamNodeStyles.colors.text.primary,
                    lineHeight: 1.2,
                  }}
                >
                  {child.item.name}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Media items: image fills circle, hover shows name overlay ── */}
      {hasMedia && mediaFile && (
        <div style={{
          ...getMediaContainerStyle(),
          opacity: hasChildren ? 0 : 1,
          transition: 'opacity 1s ease-in-out',
        }}>
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
      {!hasMedia && !hasChildren && (
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

      {/* ── Size label at bottom — hover/select only ── */}
      {showGlow && !hasChildren && item.size > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '8%',
            left: 0,
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 11,
          }}
        >
          <span
            style={{
              fontSize: `${Math.max(7, vr * 0.11)}px`,
              fontFamily: 'monospace',
              color: 'rgba(255, 255, 255, 0.4)',
              lineHeight: 1,
            }}
          >
            {formatSize(item.size)}
          </span>
        </div>
      )}
    </div>
  );
};
