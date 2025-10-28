/**
 * DreamSongWithExtensions - Local Obsidian wrapper with Node.js-dependent features
 *
 * This component wraps the pure DreamSong component and adds:
 * - Perspectives Section (for dream nodes)
 * - Conversations Section (for dreamer nodes)
 * - README Section (collapsible, at bottom)
 *
 * These extensions require Node.js APIs and are only available in Obsidian.
 * The standalone GitHub Pages viewer uses DreamSong directly.
 */

import React, { useState, useEffect } from 'react';
import { DreamSong } from './DreamSong';
import { PerspectivesSection } from './PerspectivesSection';
import { ConversationsSection } from './ConversationsSection';
import { ReadmeSection } from './ReadmeSection';
import { DreamSongBlock } from '../../types/dreamsong';
import { MediaFile, DreamNode } from '../../types/dreamnode';
import { Perspective, getPerspectiveService } from '../conversational-copilot/services/perspective-service';
import { useInterBrainStore } from '../../store/interbrain-store';

interface DreamSongWithExtensionsProps {
  blocks: DreamSongBlock[];
  className?: string;
  sourceDreamNodeId?: string;
  dreamNodeName?: string;
  dreamTalkMedia?: MediaFile[];
  onMediaClick?: (sourceDreamNodeId: string) => void;
  embedded?: boolean;
  githubPagesUrl?: string;
  dreamNode?: DreamNode;
  vaultPath?: string;
  onDreamerNodeClick?: (dreamerNodeId: string) => void;
  onEditCanvas?: () => void;
  onEditReadme?: () => void;
}

/**
 * Local-only wrapper that adds Perspectives, Conversations, and README sections
 * to the pure DreamSong canvas renderer
 */
export const DreamSongWithExtensions: React.FC<DreamSongWithExtensionsProps> = ({
  blocks,
  className,
  sourceDreamNodeId,
  dreamNodeName,
  dreamTalkMedia,
  onMediaClick,
  embedded = false,
  githubPagesUrl,
  dreamNode,
  vaultPath,
  onDreamerNodeClick,
  onEditCanvas,
  onEditReadme
}) => {
  const [perspectives, setPerspectives] = useState<Perspective[]>([]);
  const [isLoadingPerspectives, setIsLoadingPerspectives] = useState(false);

  // Check node type
  const isDreamerNode = dreamNode?.type === 'dreamer';

  // Subscribe to store for lazy loading trigger
  const spatialLayout = useInterBrainStore(state => state.spatialLayout);
  const selectedNode = useInterBrainStore(state => state.selectedNode);

  // Lazy-load perspectives only when node is selected in liminal-web mode
  useEffect(() => {
    const loadPerspectives = async () => {
      // Only load if:
      // 1. Not a dreamer node
      // 2. In liminal-web layout
      // 3. This node is selected
      // 4. Haven't loaded yet
      const isNodeSelected = spatialLayout === 'liminal-web' && selectedNode?.id === dreamNode?.id;

      if (!dreamNode || isDreamerNode || !isNodeSelected) {
        return;
      }

      // Skip if already loaded or loading
      if (perspectives.length > 0 || isLoadingPerspectives) {
        return;
      }

      setIsLoadingPerspectives(true);

      try {
        const perspectiveService = getPerspectiveService();
        const loadedPerspectives = await perspectiveService.loadPerspectives(dreamNode);
        setPerspectives(loadedPerspectives);
      } catch (error) {
        console.error('❌ [Perspectives] Failed to load:', error);
        setPerspectives([]);
      } finally {
        setIsLoadingPerspectives(false);
      }
    };

    loadPerspectives();
  }, [dreamNode?.id, isDreamerNode, spatialLayout, selectedNode?.id, perspectives.length, isLoadingPerspectives]);

  return (
    <>
      {/* Pure DreamSong canvas renderer */}
      <DreamSong
        blocks={blocks}
        className={className}
        sourceDreamNodeId={sourceDreamNodeId}
        dreamNodeName={dreamNodeName}
        dreamTalkMedia={dreamTalkMedia}
        onMediaClick={onMediaClick}
        embedded={embedded}
        githubPagesUrl={githubPagesUrl}
        onEditCanvas={onEditCanvas}
      />

      {/* Local-only extensions below */}
      {!embedded && (
        <>
          {/* Conversations Section (for dreamer nodes only) */}
          {isDreamerNode && vaultPath && dreamNode && (
            <ConversationsSection
              dreamerNode={dreamNode}
              vaultPath={vaultPath}
            />
          )}

          {/* Perspectives Section (for dream nodes only) */}
          {!isDreamerNode && (
            <>
              {isLoadingPerspectives && (
                <div style={{ padding: '2rem', textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9em' }}>
                    Loading perspectives...
                  </p>
                </div>
              )}
              {!isLoadingPerspectives && perspectives.length > 0 && vaultPath && onDreamerNodeClick && (
                <PerspectivesSection
                  perspectives={perspectives}
                  vaultPath={vaultPath}
                  onDreamerNodeClick={onDreamerNodeClick}
                />
              )}
            </>
          )}

          {/* README Section - Always at bottom, collapsed by default (if present) */}
          {dreamNode && vaultPath && (
            <ReadmeSection
              dreamNode={dreamNode}
              vaultPath={vaultPath}
              onEdit={onEditReadme}
            />
          )}
        </>
      )}
    </>
  );
};
