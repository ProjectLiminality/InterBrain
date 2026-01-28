/**
 * HolonView - Holarchy submodule view component
 *
 * Displays a DreamNode's submodules as circle-packed thumbnails.
 * Each circle shows the submodule's DreamTalk media and can be clicked
 * to navigate to that submodule.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DreamNode, MediaFile } from '../types/dreamnode';
import { VaultService } from '../../../core/services/vault-service';
import { UDDService } from '../services/udd-service';
import { useInterBrainStore } from '../../../core/store/interbrain-store';
import { useOrchestrator } from '../../../core/context/orchestrator-context';
import { packCirclesInParent } from '../utils/circle-packing';
import { dreamNodeStyles, getNodeColors, getMediaContainerStyle } from '../styles/dreamNodeStyles';

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
  const hasMedia = media?.data && media.data.length > 0;

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSubmoduleClick(submoduleNode);
  }, [submoduleNode, onSubmoduleClick]);

  // Calculate styles for zoom animation
  const getTransformStyle = (): React.CSSProperties => {
    if (isZooming && isZoomTarget) {
      // Zooming circle scales up and moves to center
      return {
        transform: `translate(${position.x}px, ${position.y}px) scale(4)`,
        zIndex: 999,
        opacity: 1
      };
    }
    if (isZooming && !isZoomTarget) {
      // Other circles fade out during zoom
      return {
        transform: `translate(${position.x}px, ${position.y}px) scale(1)`,
        opacity: 0
      };
    }
    // Normal state
    return {
      transform: `translate(${position.x}px, ${position.y}px) scale(1)`,
      opacity: 1
    };
  };

  return (
    <div
      style={{
        position: 'absolute',
        width: radius * 2,
        height: radius * 2,
        left: '50%',
        top: '50%',
        marginLeft: -radius,
        marginTop: -radius,
        borderRadius: '50%',
        border: `2px solid ${nodeColors.border}`,
        background: nodeColors.fill,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: isZooming ? 'all 0.8s ease-in-out' : 'all 0.2s ease',
        ...getTransformStyle()
      }}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Media content */}
      {hasMedia ? (
        <div style={getMediaContainerStyle()}>
          <img
            src={media.data}
            alt={submoduleNode.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: '50%'
            }}
            draggable={false}
          />
        </div>
      ) : (
        // Empty state - show name
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: dreamNodeStyles.colors.text.primary,
            fontSize: Math.max(8, radius * 0.3),
            textAlign: 'center',
            padding: '4px'
          }}
        >
          {submoduleNode.name}
        </div>
      )}

      {/* Hover overlay with name */}
      {isHovered && (
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
            zIndex: 10
          }}
        >
          <div
            style={{
              color: dreamNodeStyles.colors.text.primary,
              fontSize: Math.max(8, radius * 0.25),
              textAlign: 'center',
              padding: '4px'
            }}
          >
            {submoduleNode.name}
          </div>
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
  const [supermoduleIds, setSupermoduleIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomingSubmoduleId, setZoomingSubmoduleId] = useState<string | null>(null);

  // Get all DreamNodes from store to resolve submodule IDs
  const dreamNodesMap = useInterBrainStore(state => state.dreamNodes);
  const setSelectedNode = useInterBrainStore(state => state.setSelectedNode);

  // Get orchestrator for supermodule spatial layout
  const orchestrator = useOrchestrator();

  // Load submodule and supermodule IDs from UDD file
  useEffect(() => {
    const loadHolarchyData = async () => {
      if (!dreamNode.repoPath || !vaultService) return;

      setIsLoading(true);
      setError(null);

      try {
        const fullPath = vaultService.getFullPath(dreamNode.repoPath);
        const udd = await UDDService.readUDD(fullPath);
        setSubmoduleIds(udd.submodules || []);

        // Extract supermodule IDs (handle both string and SupermoduleEntry formats)
        const extractedSupermoduleIds = (udd.supermodules || []).map(entry =>
          typeof entry === 'string' ? entry : entry.radicleId
        );
        setSupermoduleIds(extractedSupermoduleIds);
      } catch (err) {
        console.error('Failed to load holarchy data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load holarchy data');
        setSubmoduleIds([]);
        setSupermoduleIds([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadHolarchyData();
  }, [dreamNode.repoPath, vaultService]);

  // Trigger supermodule spatial layout when HolonView mounts with supermodules
  useEffect(() => {
    if (!orchestrator || supermoduleIds.length === 0 || isLoading) {
      return; // Early return with no cleanup needed
    }

    // Show supermodules in rings around the center node
    orchestrator.showSupermodulesInRings(dreamNode.id, supermoduleIds);

    // Cleanup: restore dreamers when HolonView unmounts
    return () => {
      orchestrator.showDreamersInRings(dreamNode.id);
    };
  }, [orchestrator, dreamNode.id, supermoduleIds, isLoading]);

  // Resolve submodule IDs to DreamNode objects
  const submoduleNodes = useMemo(() => {
    return submoduleIds
      .map(id => {
        // First try to find by UUID/ID
        const byId = dreamNodesMap.get(id);
        if (byId) return byId.node;

        // Then try to find by radicleId
        for (const [_, data] of dreamNodesMap) {
          // Check if this node's UDD has a matching radicleId
          // For now, just match by name as a fallback
          if (data.node.id === id || data.node.name === id) {
            return data.node;
          }
        }
        return null;
      })
      .filter((node): node is DreamNode => node !== null);
  }, [submoduleIds, dreamNodesMap]);

  // Calculate circle positions
  const parentRadius = nodeSize / 2 * 0.85; // Leave some margin
  const circlePositions = useMemo(() => {
    return packCirclesInParent(submoduleNodes.length, parentRadius, 0.15);
  }, [submoduleNodes.length, parentRadius]);

  // Handle submodule click - initiate zoom animation then navigate
  const handleSubmoduleClick = useCallback((submodule: DreamNode) => {
    // Start zoom animation
    setZoomingSubmoduleId(submodule.id);

    // After animation, navigate to submodule
    setTimeout(() => {
      setSelectedNode(submodule);
      setZoomingSubmoduleId(null);
    }, 800); // Match animation duration
  }, [setSelectedNode]);

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
