/**
 * NodeActionButton - Shared action button for DreamNode components
 *
 * Used by both DreamTalkSide and DreamSongSide for flip and fullscreen buttons.
 * Uses Obsidian's setIcon for consistent icon rendering.
 */

import React from 'react';
import { setIcon } from 'obsidian';

interface NodeActionButtonProps {
  /** Lucide icon name (e.g., 'lucide-maximize', 'lucide-rotate-3d') */
  icon: string;
  /** Click handler */
  onClick: (e: React.MouseEvent) => void;
  /** Button position: 'top' or 'bottom' */
  position: 'top' | 'bottom';
  /** Optional size in pixels (default: 84) */
  size?: number;
  /** Optional icon size in pixels (default: 36) */
  iconSize?: number;
}

/**
 * Circular action button with Obsidian icon
 */
export const NodeActionButton: React.FC<NodeActionButtonProps> = ({
  icon,
  onClick,
  position,
  size = 84,
  iconSize = 36
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        [position]: '8px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: `${size}px`,
        height: `${size}px`,
        cursor: 'pointer',
        zIndex: 100,
        pointerEvents: 'auto'
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
    >
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
          pointerEvents: 'none'
        }}
        ref={(el) => {
          if (el) {
            el.innerHTML = '';
            setIcon(el, icon);
            const iconElement = el.querySelector(`.${icon}`);
            if (iconElement) {
              (iconElement as HTMLElement).style.width = `${iconSize}px`;
              (iconElement as HTMLElement).style.height = `${iconSize}px`;
            }
          }
        }}
      />
    </div>
  );
};
