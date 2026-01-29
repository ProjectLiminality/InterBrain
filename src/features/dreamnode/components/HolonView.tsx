/**
 * HolonView - Holarchy submodule view component
 *
 * Displays a DreamNode's submodules as circle-packed thumbnails.
 * Each circle shows the submodule's DreamTalk media and can be clicked
 * to navigate to that submodule.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DreamNode } from '../types/dreamnode';
import { VaultService } from '../../../core/services/vault-service';
import { UDDService } from '../services/udd-service';
import { useInterBrainStore } from '../../../core/store/interbrain-store';
import { packCirclesInParent } from '../utils/circle-packing';
import { dreamNodeStyles, getNodeColors, getMediaContainerStyle, getMediaOverlayStyle } from '../styles/dreamNodeStyles';
import { MediaRenderer } from './MediaRenderer';

interface HolonViewProps {
  dreamNode: DreamNode;
  nodeSize: number;
  vaultService: VaultService;
}

interface SubmoduleCircleProps {
  submoduleNode: DreamNode;
  position: { x: number; y: number };
  radius: number;
  onSubmoduleClick: (node: DreamNode) => void;
  isZooming: boolean;
  isZoomTarget: boolean;
}

/**
 * Individual submodule circle component
 * Uses shared MediaRenderer for identical styling to DreamTalkSide
 */
const SubmoduleCircle: React.FC<SubmoduleCircleProps> = ({
  submoduleNode,
  position,
  radius,
  onSubmoduleClick,
  isZooming,
  isZoomTarget
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const nodeColors = getNodeColors(submoduleNode.type);

  // Get media from submodule
  const media = submoduleNode.dreamTalkMedia[0];
  const hasMedia = media && (media.absolutePath || (media.data && media.data.length > 0));

  // Visual radius is 90% of packed radius to create spacing between circles
  const visualRadius = radius * 0.9;

  // Calculate border width proportional to visual radius (same ratio as main nodes)
  // Main nodes: 25px border on 240px node = ~10.4%, but cap it for small circles
  const borderWidth = Math.max(2, Math.min(8, Math.round(visualRadius * 0.08)));

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSubmoduleClick(submoduleNode);
  }, [submoduleNode, onSubmoduleClick]);

  // Calculate styles for zoom animation
  const getTransformStyle = (): React.CSSProperties => {
    if (isZooming && isZoomTarget) {
      return {
        transform: `translate(${position.x}px, ${position.y}px) scale(4)`,
        zIndex: 999,
        opacity: 1
      };
    }
    if (isZooming && !isZoomTarget) {
      return {
        transform: `translate(${position.x}px, ${position.y}px) scale(1)`,
        opacity: 0
      };
    }
    return {
      transform: `translate(${position.x}px, ${position.y}px) scale(1)`,
      opacity: 1
    };
  };

  return (
    <div
      style={{
        position: 'absolute',
        width: visualRadius * 2,
        height: visualRadius * 2,
        left: '50%',
        top: '50%',
        marginLeft: -visualRadius,
        marginTop: -visualRadius,
        borderRadius: dreamNodeStyles.dimensions.borderRadius,
        border: `${borderWidth}px solid ${nodeColors.border}`,
        background: nodeColors.fill,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: isZooming ? 'all 0.8s ease-in-out' : dreamNodeStyles.transitions.default,
        contain: 'layout style paint',
        contentVisibility: 'auto',
        ...getTransformStyle()
      }}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Media content - using shared MediaRenderer for identical styling */}
      {hasMedia ? (
        <div style={getMediaContainerStyle()}>
          <MediaRenderer media={media} />
          {/* Fade-to-black overlay - same as DreamTalkSide */}
          <div style={getMediaOverlayStyle()} />

          {/* Hover overlay with name */}
          {isHovered && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                borderRadius: dreamNodeStyles.dimensions.borderRadius,
                background: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 1,
                transition: 'opacity 0.2s ease-in-out',
                pointerEvents: 'none',
                zIndex: 10
              }}
            >
              <div
                style={{
                  color: dreamNodeStyles.colors.text.primary,
                  fontFamily: dreamNodeStyles.typography.fontFamily,
                  fontSize: Math.max(8, visualRadius * 0.15),
                  textAlign: 'center',
                  padding: '8px'
                }}
              >
                {submoduleNode.name}
              </div>
            </div>
          )}
        </div>
      ) : (
        // Empty state - show name (matching DreamTalkSide empty state)
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: dreamNodeStyles.colors.text.primary,
            fontFamily: dreamNodeStyles.typography.fontFamily,
            fontSize: Math.max(8, visualRadius * 0.15),
            textAlign: 'center',
            padding: '8px'
          }}
        >
          {submoduleNode.name}
        </div>
      )}
    </div>
  );
};

/**
 * Main HolonView component
 */
export const HolonView: React.FC<HolonViewProps> = ({
  dreamNode,
  nodeSize,
  vaultService
}) => {
  const [submoduleIds, setSubmoduleIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomingSubmoduleId, setZoomingSubmoduleId] = useState<string | null>(null);

  // Get all DreamNodes from store to resolve submodule IDs
  const dreamNodesMap = useInterBrainStore(state => state.dreamNodes);
  const setSelectedNode = useInterBrainStore(state => state.setSelectedNode);
  const startFlipAnimation = useInterBrainStore(state => state.startFlipAnimation);

  // Load submodule IDs from UDD file
  // Note: Supermodule spatial layout is handled by SpatialOrchestrator subscribing to flip state
  useEffect(() => {
    const loadHolarchyData = async () => {
      if (!dreamNode.repoPath || !vaultService) return;

      setIsLoading(true);
      setError(null);

      try {
        const fullPath = vaultService.getFullPath(dreamNode.repoPath);
        const udd = await UDDService.readUDD(fullPath);
        setSubmoduleIds(udd.submodules || []);
      } catch (err) {
        console.error('Failed to load holarchy data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load holarchy data');
        setSubmoduleIds([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadHolarchyData();
  }, [dreamNode.repoPath, vaultService]);

  // Resolve submodule IDs to DreamNode objects
  // Priority: radicleId (canonical) > UUID (legacy) > name (last resort)
  const submoduleNodes = useMemo(() => {
    return submoduleIds
      .map(id => {
        // First try to find by radicleId (canonical schema)
        for (const data of dreamNodesMap.values()) {
          if (data.node.radicleId === id) {
            return data.node;
          }
        }

        // Fallback: try to find by UUID/ID (legacy data)
        const byId = dreamNodesMap.get(id);
        if (byId) return byId.node;

        // Last resort: try to find by name
        for (const data of dreamNodesMap.values()) {
          if (data.node.name === id) {
            return data.node;
          }
        }
        return null;
      })
      .filter((node): node is DreamNode => node !== null);
  }, [submoduleIds, dreamNodesMap]);

  // Calculate circle positions
  const parentRadius = nodeSize / 2 * 0.95; // Use most of the node area for submodules
  const circlePositions = useMemo(() => {
    return packCirclesInParent(submoduleNodes.length, parentRadius, 0.15);
  }, [submoduleNodes.length, parentRadius]);

  // Handle submodule click - initiate zoom animation then navigate
  // Stays in holarchy mode: selects the submodule AND flips it to show its holarchy
  const handleSubmoduleClick = useCallback((submodule: DreamNode) => {
    // Start zoom animation
    setZoomingSubmoduleId(submodule.id);

    // After animation, navigate to submodule and flip it to back side
    setTimeout(() => {
      setSelectedNode(submodule);
      // Flip the newly selected node to back side to stay in holarchy navigation mode
      startFlipAnimation(submodule.id, 'front-to-back');
      setZoomingSubmoduleId(null);
    }, 800); // Match animation duration
  }, [setSelectedNode, startFlipAnimation]);

  // Loading state
  if (isLoading) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: dreamNodeStyles.colors.text.secondary,
          fontSize: '12px'
        }}
      >
        Loading submodules...
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          color: dreamNodeStyles.colors.text.secondary,
          fontSize: '11px',
          textAlign: 'center',
          padding: '20px'
        }}
      >
        <div>Error loading holarchy</div>
        <div style={{ marginTop: '8px', opacity: 0.7 }}>{error}</div>
      </div>
    );
  }

  // Empty state - no submodules
  if (submoduleNodes.length === 0) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          color: dreamNodeStyles.colors.text.secondary,
          fontSize: '12px',
          textAlign: 'center'
        }}
      >
        <div style={{ opacity: 0.7 }}>No submodules</div>
        <div
          style={{
            marginTop: '8px',
            fontSize: '10px',
            opacity: 0.5
          }}
        >
          Weave DreamTalks into a DreamSong to create submodules
        </div>
      </div>
    );
  }

  // Render submodule circles
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {submoduleNodes.map((submodule, index) => {
        const position = circlePositions[index];
        if (!position) return null;

        return (
          <SubmoduleCircle
            key={submodule.id}
            submoduleNode={submodule}
            position={{ x: position.x, y: position.y }}
            radius={position.radius}
            onSubmoduleClick={handleSubmoduleClick}
            isZooming={zoomingSubmoduleId !== null}
            isZoomTarget={zoomingSubmoduleId === submodule.id}
          />
        );
      })}
    </div>
  );
};
