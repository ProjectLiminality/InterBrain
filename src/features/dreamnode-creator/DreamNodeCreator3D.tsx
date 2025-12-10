import React, { useState, useRef, useCallback } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { dreamNodeStyles, getNodeColors, getNodeGlow, getMediaContainerStyle, getMediaOverlayStyle } from '../dreamnode/styles/dreamNodeStyles';
import { isValidDreamTalkMedia } from '../dreamnode';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { useOrchestrator } from '../../core/context/orchestrator-context';
import { serviceManager } from '../../core/services/service-manager';
import { UIService } from '../../core/services/ui-service';
import type { DraftDreamNode } from './store/slice';

const uiService = new UIService();

/**
 * DreamNodeCreator3D - Translucent in-space creation UI for DreamNodes
 *
 * This is a self-contained component that:
 * - Renders when creation mode is active (checks store state internally)
 * - Shows a translucent preview at the specified 3D position
 * - Handles title input, type selection, and media upload
 * - Calls GitDreamNodeService.create() on completion
 * - Manages its own animation for the creation transition
 */
export default function DreamNodeCreator3D() {
  const titleInputRef = useRef<globalThis.HTMLInputElement>(null);
  const fileInputRef = useRef<globalThis.HTMLInputElement>(null);

  // Store state and actions
  const {
    creationState,
    updateDraft,
    setValidationErrors,
    completeCreation,
    cancelCreation
  } = useInterBrainStore();

  const { draft, validationErrors } = creationState;

  // Orchestrator for position calculation
  const orchestrator = useOrchestrator();

  // Local UI state
  const [localTitle, setLocalTitle] = useState(draft?.title || '');
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // Animation state
  const [animatedPosition, setAnimatedPosition] = useState<[number, number, number]>(
    draft?.position || [0, 0, -25]
  );
  const [animatedUIOpacity, setAnimatedUIOpacity] = useState(1.0);
  const animationStartTime = useRef<number | null>(null);

  // Animation: move z toward -75, fade out UI
  useFrame(() => {
    if (!animationStartTime.current || !draft) return;

    const progress = Math.min((Date.now() - animationStartTime.current) / 1000, 1);
    const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    setAnimatedPosition([draft.position[0], draft.position[1], draft.position[2] + (-75 - draft.position[2]) * ease]);
    setAnimatedUIOpacity(1 - ease);

    if (progress >= 1) animationStartTime.current = null;
  });

  // Focus title input on type change
  React.useEffect(() => {
    if (draft && titleInputRef.current) titleInputRef.current.focus();
  }, [draft?.type]);

  // Generate preview URL for pre-filled media
  React.useEffect(() => {
    if (draft?.dreamTalkFile && !previewMedia) {
      setPreviewMedia(globalThis.URL.createObjectURL(draft.dreamTalkFile));
    }
  }, [draft?.dreamTalkFile, previewMedia]);

  // Don't render if not in creation mode
  if (!creationState.isCreating || !draft) {
    return null;
  }

  const nodeColors = getNodeColors(draft.type);
  const nodeSize = dreamNodeStyles.dimensions.nodeSizeThreeD;
  const borderWidth = dreamNodeStyles.dimensions.borderWidth;

  // Validation
  const validateTitle = useCallback((title: string) => {
    const errors: Record<string, string> = {};

    if (!title.trim()) {
      errors.title = 'Title is required';
    } else if (title.length > 255) {
      errors.title = 'Title must be less than 255 characters';
    } else if (/[<>:"/\\|?*]/.test(title)) {
      errors.title = 'Title contains invalid characters';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [setValidationErrors]);

  // Event handlers
  const handleTitleChange = (e: React.ChangeEvent<globalThis.HTMLInputElement>) => {
    const title = e.target.value;
    setLocalTitle(title);
    updateDraft({ title });
  };

  const handleTypeChange = (type: 'dream' | 'dreamer') => {
    updateDraft({ type });
    globalThis.setTimeout(() => titleInputRef.current?.focus(), 0);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file && isValidDreamTalkMedia(file)) {
      updateDraft({ dreamTalkFile: file });
      setPreviewMedia(globalThis.URL.createObjectURL(file));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<globalThis.HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && isValidDreamTalkMedia(file)) {
      updateDraft({ dreamTalkFile: file });
      setPreviewMedia(globalThis.URL.createObjectURL(file));
    }
  };

  const handleCreate = async () => {
    if (!validateTitle(localTitle)) return;

    setIsAnimating(true);
    animationStartTime.current = Date.now();

    // Wait for animation, then create
    globalThis.setTimeout(async () => {
      try {
        let finalPosition = draft.position;
        if (orchestrator) {
          finalPosition = orchestrator.calculateForwardPositionOnSphere();
        }

        const service = serviceManager.getActive();
        await service.create(
          draft.title,
          draft.type,
          draft.dreamTalkFile,
          finalPosition,
          draft.additionalFiles
        );

        globalThis.setTimeout(() => {
          setIsAnimating(false);
          completeCreation();
        }, 100);
      } catch (error) {
        console.error('DreamNodeCreator3D: Failed to create:', error);
        uiService.showError(error instanceof Error ? error.message : 'Failed to create DreamNode');
        setIsAnimating(false);
      }
    }, 1000);
  };

  const handleCancel = () => {
    if (previewMedia) {
      globalThis.URL.revokeObjectURL(previewMedia);
    }
    cancelCreation();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCreate();
    }
  };

  const isCreateDisabled = !localTitle.trim() || !!validationErrors.title || isAnimating;

  return (
    <group position={animatedPosition}>
      <Html center transform sprite distanceFactor={10} style={{ pointerEvents: 'auto', userSelect: 'none' }}>
        <div
          onKeyDown={handleKeyDown}
          data-ui-element="dreamnode-creator"
          onMouseDown={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Main Circle */}
          <div
            style={{
              width: `${nodeSize}px`,
              height: `${nodeSize}px`,
              borderRadius: dreamNodeStyles.dimensions.borderRadius,
              border: `${borderWidth}px solid ${nodeColors.border}`,
              background: nodeColors.fill,
              overflow: 'hidden',
              position: 'relative',
              transition: dreamNodeStyles.transitions.creation,
              boxShadow: getNodeGlow(draft.type, 15),
              fontFamily: dreamNodeStyles.typography.fontFamily
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Media Preview or Drop Zone */}
            {previewMedia || draft.dreamTalkFile || draft.urlMetadata ? (
              <div style={getMediaContainerStyle()}>
                {previewMedia && (
                  <img src={previewMedia} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
                {draft.urlMetadata && !previewMedia && (
                  <UrlPreview urlMetadata={draft.urlMetadata} />
                )}
                <div style={getMediaOverlayStyle()} />
              </div>
            ) : (
              <DropZone
                isDragOver={isDragOver}
                opacity={animatedUIOpacity}
                onClickBrowse={() => fileInputRef.current?.click()}
              />
            )}

            {/* Title Input */}
            <input
              ref={titleInputRef}
              type="text"
              value={localTitle}
              onChange={handleTitleChange}
              placeholder="Name"
              autoFocus
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: `${Math.max(120, nodeSize * 0.7)}px`,
                height: `${Math.max(32, nodeSize * 0.12)}px`,
                padding: `${Math.max(8, nodeSize * 0.02)}px ${Math.max(12, nodeSize * 0.03)}px`,
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                color: dreamNodeStyles.colors.text.primary,
                fontSize: `${Math.max(14, nodeSize * 0.08)}px`,
                fontFamily: dreamNodeStyles.typography.fontFamily,
                textAlign: 'center',
                outline: 'none',
                zIndex: 10,
                pointerEvents: 'auto',
                cursor: 'text'
              }}
              onClick={(e) => e.stopPropagation()}
            />

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,application/pdf,.pdf"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>

          {/* Validation Error */}
          {validationErrors.title && (
            <ValidationError message={validationErrors.title} nodeSize={nodeSize} opacity={animatedUIOpacity} />
          )}

          {/* Type Toggle */}
          <TypeToggle
            currentType={draft.type}
            onChange={handleTypeChange}
            nodeSize={nodeSize}
            hasError={!!validationErrors.title}
            opacity={animatedUIOpacity}
          />

          {/* Action Buttons */}
          <ActionButtons
            onCancel={handleCancel}
            onCreate={handleCreate}
            isDisabled={isCreateDisabled}
            isAnimating={isAnimating}
            nodeSize={nodeSize}
            hasError={!!validationErrors.title}
            opacity={animatedUIOpacity}
            nodeColors={nodeColors}
          />
        </div>
      </Html>
    </group>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function DropZone({ isDragOver, opacity, onClickBrowse }: {
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

function UrlPreview({ urlMetadata }: { urlMetadata: DraftDreamNode['urlMetadata'] }) {
  if (!urlMetadata) return null;

  if (urlMetadata.type === 'youtube' && urlMetadata.videoId) {
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <img
          src={`https://img.youtube.com/vi/${urlMetadata.videoId}/maxresdefault.jpg`}
          alt="YouTube thumbnail"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '40%',
            height: '40%',
            background: 'rgba(255, 0, 0, 0.8)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '16px',
            fontWeight: 'bold',
            pointerEvents: 'none'
          }}
        >
          ▶
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: urlMetadata.type === 'website'
          ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
          : 'rgba(0, 100, 200, 0.8)',
        color: '#FFFFFF',
        fontSize: '24px',
        fontWeight: 'bold'
      }}
    >
      {urlMetadata.type === 'website' ? '🔗' : 'URL'}
    </div>
  );
}

function ValidationError({ message, nodeSize, opacity }: {
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

function TypeToggle({ currentType, onChange, nodeSize, hasError, opacity }: {
  currentType: 'dream' | 'dreamer';
  onChange: (type: 'dream' | 'dreamer') => void;
  nodeSize: number;
  hasError: boolean;
  opacity: number;
}) {
  const buttonStyle = (type: 'dream' | 'dreamer') => ({
    padding: `${Math.max(8, nodeSize * 0.02)}px ${Math.max(16, nodeSize * 0.04)}px`,
    border: `${dreamNodeStyles.dimensions.toggleBorderWidth}px solid ${getNodeColors(type).border}`,
    background: currentType === type ? getNodeColors(type).border : 'transparent',
    color: 'white',
    fontSize: `${Math.max(14, nodeSize * 0.035)}px`,
    fontFamily: dreamNodeStyles.typography.fontFamily,
    cursor: 'pointer',
    transition: 'background 0.2s ease',
    flex: '1',
    minWidth: '60px',
    boxSizing: 'border-box' as const
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: `${nodeSize + (hasError ? 40 : 20)}px`,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        opacity
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onChange('dream'); }}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          ...buttonStyle('dream'),
          borderRadius: `${Math.max(4, nodeSize * 0.01)}px 0 0 ${Math.max(4, nodeSize * 0.01)}px`,
          marginRight: '0.5px'
        }}
      >
        Dream
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onChange('dreamer'); }}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          ...buttonStyle('dreamer'),
          borderRadius: `0 ${Math.max(4, nodeSize * 0.01)}px ${Math.max(4, nodeSize * 0.01)}px 0`
        }}
      >
        Dreamer
      </button>
    </div>
  );
}

function ActionButtons({ onCancel, onCreate, isDisabled, isAnimating, nodeSize, hasError, opacity, nodeColors }: {
  onCancel: () => void;
  onCreate: () => void;
  isDisabled: boolean;
  isAnimating: boolean;
  nodeSize: number;
  hasError: boolean;
  opacity: number;
  nodeColors: ReturnType<typeof getNodeColors>;
}) {
  const basePadding = `${Math.max(8, nodeSize * 0.02)}px ${Math.max(16, nodeSize * 0.04)}px`;
  const fontSize = `${Math.max(14, nodeSize * 0.035)}px`;
  const borderRadius = `${Math.max(4, nodeSize * 0.01)}px`;

  return (
    <div
      style={{
        position: 'absolute',
        top: `${nodeSize + (hasError ? 120 : 100)}px`,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: '12px',
        opacity
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onCancel(); }}
        onMouseDown={(e) => e.stopPropagation()}
        disabled={isAnimating}
        style={{
          padding: basePadding,
          border: '1px solid rgba(255,255,255,0.5)',
          background: 'transparent',
          color: isAnimating ? 'rgba(255,255,255,0.5)' : 'white',
          fontSize,
          fontFamily: dreamNodeStyles.typography.fontFamily,
          borderRadius,
          cursor: isAnimating ? 'not-allowed' : 'pointer',
          transition: dreamNodeStyles.transitions.default
        }}
      >
        Cancel
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onCreate(); }}
        onMouseDown={(e) => e.stopPropagation()}
        disabled={isDisabled}
        style={{
          padding: basePadding,
          border: 'none',
          background: isDisabled ? 'rgba(255,255,255,0.3)' : nodeColors.border,
          color: isDisabled ? 'rgba(255,255,255,0.5)' : 'white',
          fontSize,
          fontFamily: dreamNodeStyles.typography.fontFamily,
          borderRadius,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          transition: dreamNodeStyles.transitions.default
        }}
      >
        {isAnimating ? 'Creating...' : 'Create'}
      </button>
    </div>
  );
}
