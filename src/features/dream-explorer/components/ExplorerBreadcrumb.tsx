/**
 * Explorer Breadcrumb
 *
 * Back arrow + clickable path segments + layout mode toggle button.
 * Positioned at the top of the Dream Explorer.
 * Root = DreamNode name, prevents navigation above rootPath.
 */

import React from 'react';
import { dreamNodeStyles } from '../../dreamnode/styles/dreamNodeStyles';
import type { ExplorerLayoutMode } from '../types/explorer';

interface ExplorerBreadcrumbProps {
  currentPath: string;
  rootPath: string;
  rootName: string;
  canGoBack: boolean;
  layoutMode: ExplorerLayoutMode;
  onGoBack: () => void;
  onNavigateTo: (path: string) => void;
  onCycleLayoutMode: () => void;
}

export const ExplorerBreadcrumb: React.FC<ExplorerBreadcrumbProps> = ({
  currentPath,
  rootPath,
  rootName,
  canGoBack,
  layoutMode,
  onGoBack,
  onNavigateTo,
  onCycleLayoutMode,
}) => {
  // Get the relative path from root
  const relativePath = currentPath.startsWith(rootPath)
    ? currentPath.slice(rootPath.length).replace(/^\//, '')
    : '';
  const segments = relativePath ? relativePath.split('/') : [];

  const isActive = layoutMode !== 'reduced';

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)',
        fontFamily: dreamNodeStyles.typography.fontFamily,
        fontSize: `${dreamNodeStyles.typography.fontSize.small}px`,
        color: dreamNodeStyles.colors.text.secondary,
        gap: '4px',
        flexWrap: 'wrap',
      }}
    >
      {/* Back button */}
      <button
        onClick={onGoBack}
        disabled={!canGoBack}
        style={{
          background: 'none',
          border: 'none',
          color: canGoBack ? dreamNodeStyles.colors.text.primary : 'rgba(255,255,255,0.3)',
          cursor: canGoBack ? 'pointer' : 'default',
          padding: '2px 6px',
          fontSize: '16px',
          lineHeight: 1,
          borderRadius: '4px',
          transition: 'background 0.15s',
        }}
        title="Go back"
        onMouseOver={e => { if (canGoBack) (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.1)'; }}
        onMouseOut={e => { (e.target as HTMLElement).style.background = 'none'; }}
      >
        ←
      </button>

      {/* Root = DreamNode name */}
      <span
        onClick={() => onNavigateTo(rootPath)}
        style={{
          cursor: currentPath !== rootPath ? 'pointer' : 'default',
          color: segments.length === 0 ? dreamNodeStyles.colors.text.primary : dreamNodeStyles.colors.text.secondary,
          fontWeight: segments.length === 0 ? dreamNodeStyles.typography.fontWeight.bold : dreamNodeStyles.typography.fontWeight.normal,
          transition: 'color 0.15s',
        }}
        onMouseOver={e => { if (currentPath !== rootPath) (e.target as HTMLElement).style.color = dreamNodeStyles.colors.text.primary; }}
        onMouseOut={e => { if (segments.length > 0) (e.target as HTMLElement).style.color = dreamNodeStyles.colors.text.secondary; }}
      >
        {rootName}
      </span>

      {segments.map((segment, idx) => {
        const pathUpTo = rootPath + '/' + segments.slice(0, idx + 1).join('/');
        const isLast = idx === segments.length - 1;

        return (
          <React.Fragment key={pathUpTo}>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>/</span>
            <span
              onClick={() => { if (!isLast) onNavigateTo(pathUpTo); }}
              style={{
                cursor: isLast ? 'default' : 'pointer',
                color: isLast ? dreamNodeStyles.colors.text.primary : dreamNodeStyles.colors.text.secondary,
                fontWeight: isLast ? dreamNodeStyles.typography.fontWeight.bold : dreamNodeStyles.typography.fontWeight.normal,
                transition: 'color 0.15s',
              }}
              onMouseOver={e => { if (!isLast) (e.target as HTMLElement).style.color = dreamNodeStyles.colors.text.primary; }}
              onMouseOut={e => { if (!isLast) (e.target as HTMLElement).style.color = dreamNodeStyles.colors.text.secondary; }}
            >
              {segment}
            </span>
          </React.Fragment>
        );
      })}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Layout mode toggle — cycles: reduced → equal → weighted */}
      <button
        onClick={onCycleLayoutMode}
        style={{
          background: isActive ? 'rgba(79, 195, 247, 0.2)' : 'none',
          border: `1px solid ${isActive ? dreamNodeStyles.colors.dream.border : 'rgba(255,255,255,0.2)'}`,
          color: isActive ? dreamNodeStyles.colors.dream.border : dreamNodeStyles.colors.text.secondary,
          cursor: 'pointer',
          padding: '2px 8px',
          fontSize: `${dreamNodeStyles.typography.fontSize.small}px`,
          fontFamily: dreamNodeStyles.typography.fontFamily,
          borderRadius: '4px',
          transition: 'all 0.15s',
        }}
        title={`Layout: ${layoutMode} (click to cycle)`}
      >
        {layoutMode}
      </button>
    </div>
  );
};
