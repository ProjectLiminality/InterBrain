/**
 * Shared UI Components for DreamNode Creator and Editor
 *
 * Reusable components that are used by both DreamNodeCreator3D and DreamNodeEditor3D.
 */

import React from 'react';
import { dreamNodeStyles } from '../styles/dreamNodeStyles';

/**
 * DropZone - File drop area for media upload
 * Used in both Creator and Editor for DreamTalk media selection.
 */
export function DropZone({ isDragOver, opacity, onClickBrowse }: {
  isDragOver: boolean;
  opacity: number;
  onClickBrowse: () => void;
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        cursor: 'pointer',
        border: isDragOver ? '2px dashed rgba(255,255,255,0.5)' : 'none',
        borderRadius: '50%',
        zIndex: 1,
        pointerEvents: 'auto',
        opacity
      }}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClickBrowse();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '75%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: dreamNodeStyles.colors.text.secondary,
          fontSize: '24px',
          textAlign: 'center',
          whiteSpace: 'nowrap',
          pointerEvents: 'none'
        }}
      >
        <div>Drop image here</div>
        <div>or click to browse</div>
      </div>
    </div>
  );
}

/**
 * ValidationError - Displays validation error message
 * Used in both Creator and Editor for title validation errors.
 */
export function ValidationError({ message, nodeSize, opacity }: {
  message: string;
  nodeSize: number;
  opacity: number;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: `${nodeSize + 10}px`,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(255, 0, 0, 0.8)',
        color: 'white',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        whiteSpace: 'nowrap',
        opacity
      }}
    >
      {message}
    </div>
  );
}
