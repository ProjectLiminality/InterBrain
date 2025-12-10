import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { setIcon } from 'obsidian';
import { dreamNodeStyles, getNodeColors, getNodeGlow, getMediaContainerStyle, getMediaOverlayStyle, isValidDreamTalkMedia } from '../dreamnode';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { useOrchestrator } from '../../core/context/orchestrator-context';
import { UIService } from '../../core/services/ui-service';
import { saveEditModeChanges, getFreshNodeData, cancelEditMode } from './services/editor-service';
import RelationshipSearchInput from './RelationshipSearchInput';
import { serviceManager } from '../../core/services/service-manager';
import type { DreamNode } from '../dreamnode';

const uiService = new UIService();

/**
 * DreamNodeEditor3D - Self-contained in-space editing UI for DreamNodes
 *
 * This component:
 * - Renders when edit mode is active (checks store state internally)
 * - Shows at the center position overlaying the selected node
 * - Handles title editing and contact info (dreamer only)
 * - Manages media upload/drag-drop
 * - Toggles relationship search interface
 * - Calls EditorService for persistence
 *
 * Note: Node type (dream/dreamer) is immutable after creation as it
 * defines the relationship ontology in the liminal web.
 */
export default function DreamNodeEditor3D() {
  const titleInputRef = useRef<globalThis.HTMLInputElement>(null);
  const fileInputRef = useRef<globalThis.HTMLInputElement>(null);

  // Store state and actions
  const {
    editMode,
    updateEditingNodeMetadata,
    setEditModeNewDreamTalkFile,
    setEditModeValidationErrors,
    setEditModeSearchActive,
    setEditModeSearchResults,
    exitEditMode
  } = useInterBrainStore();

  const { editingNode, validationErrors, newDreamTalkFile } = editMode;

  // Orchestrator for animations
  const orchestrator = useOrchestrator();

  // Position at center, slightly in front of the regular DreamNode3D
  const centerPosition: [number, number, number] = [0, 0, -49.9];

  // Local UI state for immediate responsiveness
  const [localTitle, setLocalTitle] = useState(editingNode?.name || '');
  const [localEmail, setLocalEmail] = useState('');
  const [localPhone, setLocalPhone] = useState('');
  const [localDid, setLocalDid] = useState('');
  const [localRadicleId, setLocalRadicleId] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // Debounced store updates
  const debounceTimeoutRef = useRef<number | null>(null);

  // Animation state
  const [animatedOpacity, setAnimatedOpacity] = useState<number>(1.0);
  const [animatedUIOpacity, setAnimatedUIOpacity] = useState<number>(1.0);
  const animationStartTime = useRef<number | null>(null);

  // Animation frame loop for UI fade out
  useFrame(() => {
    if (!animationStartTime.current) return;

    const elapsed = Date.now() - animationStartTime.current;
    const progress = Math.min(elapsed / 1000, 1);
    const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    setAnimatedOpacity(1.0); // Keep main node visible
    setAnimatedUIOpacity(1 - ease); // Fade out UI controls

    if (progress >= 1) {
      animationStartTime.current = null;
      setAnimatedUIOpacity(0);
    }
  });

  // Validation (must be before early return - rules of hooks)
  const validateTitle = useCallback((title: string) => {
    const errors: Record<string, string> = {};

    if (!title.trim()) {
      errors.title = 'Title is required';
    } else if (title.length > 255) {
      errors.title = 'Title must be less than 255 characters';
    } else if (/[<>:"/\\|?*]/.test(title)) {
      errors.title = 'Title contains invalid characters';
    }

    setEditModeValidationErrors({ ...validationErrors, title: errors.title });
    return Object.keys(errors).length === 0;
  }, [setEditModeValidationErrors, validationErrors]);

  // Focus title input when entering edit mode
  useEffect(() => {
    if (editingNode && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [editingNode?.id]);

  // Handle pre-filled dreamTalkMedia
  useEffect(() => {
    if (newDreamTalkFile && !previewMedia) {
      const previewUrl = globalThis.URL.createObjectURL(newDreamTalkFile);
      setPreviewMedia(previewUrl);
    } else if (editingNode?.dreamTalkMedia.length && !previewMedia && !newDreamTalkFile) {
      const existingMedia = editingNode.dreamTalkMedia[0];
      if (existingMedia.data) {
        setPreviewMedia(existingMedia.data);
      }
    }
  }, [editingNode?.dreamTalkMedia, newDreamTalkFile, previewMedia]);

  // Cleanup debounce timeout
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        globalThis.clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Sync local title with store
  useEffect(() => {
    if (editingNode?.name !== undefined) {
      setLocalTitle(editingNode.name);
    }
  }, [editingNode?.name]);

  // Load contact info for dreamer nodes
  useEffect(() => {
    if (!editingNode || editingNode.type !== 'dreamer') {
      setLocalEmail('');
      setLocalPhone('');
      setLocalDid('');
      setLocalRadicleId('');
      return;
    }

    setLocalEmail(editingNode.email || '');
    setLocalPhone(editingNode.phone || '');
    setLocalDid(editingNode.did || '');
    setLocalRadicleId(editingNode.radicleId || '');
  }, [editingNode?.id, editingNode?.type]);

  // Debounced store update (must be before early return - rules of hooks)
  const updateStoreTitle = useCallback((title: string) => {
    updateEditingNodeMetadata({ name: title });
  }, [updateEditingNodeMetadata]);

  // Don't render if edit mode is not active
  if (!editMode.isActive || !editingNode) {
    return null;
  }

  const nodeColors = getNodeColors(editingNode.type);
  const nodeSize = dreamNodeStyles.dimensions.nodeSizeThreeD;
  const borderWidth = dreamNodeStyles.dimensions.borderWidth;

  // Event handlers
  const handleTitleChange = (e: React.ChangeEvent<globalThis.HTMLInputElement>) => {
    const title = e.target.value;
    setLocalTitle(title);

    if (debounceTimeoutRef.current) {
      globalThis.clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = globalThis.setTimeout(() => {
      updateStoreTitle(title);
      validateTitle(title);
    }, 300) as unknown as number;
  };

  const handleEmailChange = (e: React.ChangeEvent<globalThis.HTMLInputElement>) => {
    const email = e.target.value;
    setLocalEmail(email);
    updateEditingNodeMetadata({ email });
  };

  const handlePhoneChange = (e: React.ChangeEvent<globalThis.HTMLInputElement>) => {
    const phone = e.target.value;
    setLocalPhone(phone);
    updateEditingNodeMetadata({ phone });
  };

  const handleDidChange = (e: React.ChangeEvent<globalThis.HTMLInputElement>) => {
    const did = e.target.value;
    setLocalDid(did);
    updateEditingNodeMetadata({ did });
  };

  // File handling
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
    if (!file) return;

    if (!isValidDreamTalkMedia(file)) {
      return;
    }

    try {
      const previewUrl = globalThis.URL.createObjectURL(file);
      setPreviewMedia(previewUrl);
    } catch {
      if (editingNode) {
        const existingMedia = editingNode.dreamTalkMedia.find(m => m.path === file.name);
        if (existingMedia?.data) {
          setPreviewMedia(existingMedia.data);
        }
      }
    }

    setEditModeNewDreamTalkFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<globalThis.HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && isValidDreamTalkMedia(file)) {
      const previewUrl = globalThis.URL.createObjectURL(file);
      setPreviewMedia(previewUrl);
      setEditModeNewDreamTalkFile(file);
    }
  };

  // Save handler
  const handleSave = async () => {
    if (!validateTitle(localTitle)) return;

    setIsAnimating(true);
    animationStartTime.current = Date.now();

    const result = await saveEditModeChanges();

    if (!result.success) {
      uiService.showError(result.error || 'Failed to save changes');
      setIsAnimating(false);
      return;
    }

    // Get fresh node data and transition
    const freshNode = await getFreshNodeData(editingNode.id);
    if (freshNode) {
      useInterBrainStore.getState().setSelectedNode(freshNode);
      useInterBrainStore.getState().setSpatialLayout('liminal-web');

      if (orchestrator) {
        orchestrator.animateToLiminalWebFromEdit(freshNode.id);
      }

      globalThis.setTimeout(() => {
        setIsAnimating(false);
        exitEditMode();
      }, 1000);
    }
  };

  // Cancel handler
  const handleCancel = () => {
    if (previewMedia) {
      globalThis.URL.revokeObjectURL(previewMedia);
    }
    cancelEditMode();
  };

  // Toggle relationship search
  const handleToggleRelationshipSearch = async () => {
    if (editMode.isSearchingRelationships) {
      // Turning OFF - show pending relationships only
      setEditModeSearchActive(false);

      const pendingRelationshipIds = editMode.pendingRelationships;
      if (pendingRelationshipIds.length > 0 && editingNode) {
        const dreamNodeService = serviceManager.getActive();
        const relatedNodes = await Promise.all(
          pendingRelationshipIds.map(id => dreamNodeService.get(id))
        );
        const validRelatedNodes = relatedNodes.filter((node): node is DreamNode => node !== null);
        setEditModeSearchResults(validRelatedNodes);

        if (orchestrator) {
          orchestrator.clearEditModeData();
          globalThis.setTimeout(() => {
            orchestrator.showEditModeSearchResults(editingNode.id, validRelatedNodes);
          }, 10);
        }
      } else {
        setEditModeSearchResults([]);
      }
    } else {
      // Turning ON
      setEditModeSearchActive(true);
    }
  };

  // Keyboard handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  };

  const isSaveDisabled = !localTitle.trim() || !!validationErrors.title || isAnimating;

  return (
    <group>
      <group position={centerPosition}>
        <Html
          center
          transform
          sprite
          distanceFactor={10}
          style={{ pointerEvents: 'auto', userSelect: 'none' }}
        >
          <div
            onKeyDown={handleKeyDown}
            data-ui-element="dreamnode-editor"
            onMouseDown={(e) => e.stopPropagation()}
            onMouseMove={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Main Edit Node Circle */}
            <div
              style={{
                width: `${nodeSize}px`,
                height: `${nodeSize}px`,
                borderRadius: dreamNodeStyles.dimensions.borderRadius,
                border: `${borderWidth}px solid ${nodeColors.border}`,
                background: nodeColors.fill,
                overflow: 'hidden',
                position: 'relative',
                opacity: animatedOpacity,
                transition: dreamNodeStyles.transitions.creation,
                boxShadow: getNodeGlow(editingNode.type, 15),
                fontFamily: dreamNodeStyles.typography.fontFamily
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {/* DreamTalk Media Area */}
              {previewMedia || editingNode.dreamTalkMedia.length > 0 ? (
                <div style={{ ...getMediaContainerStyle(), opacity: animatedOpacity }}>
                  {previewMedia ? (
                    <img
                      src={previewMedia}
                      alt="DreamTalk preview"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : editingNode.dreamTalkMedia.length > 0 ? (
                    <img
                      src={editingNode.dreamTalkMedia[0].data}
                      alt="Current DreamTalk media"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : null}
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
              <ValidationError
                message={validationErrors.title}
                nodeSize={nodeSize}
                opacity={animatedUIOpacity}
              />
            )}

            {/* Contact Info Fields (dreamer only) */}
            {editingNode.type === 'dreamer' && (
              <ContactFields
                email={localEmail}
                phone={localPhone}
                did={localDid}
                radicleId={localRadicleId}
                onEmailChange={handleEmailChange}
                onPhoneChange={handlePhoneChange}
                onDidChange={handleDidChange}
                nodeSize={nodeSize}
                hasError={!!validationErrors.title}
                opacity={animatedUIOpacity}
              />
            )}

            {/* Action Buttons */}
            <ActionButtons
              onCancel={handleCancel}
              onSave={handleSave}
              onToggleSearch={handleToggleRelationshipSearch}
              isDisabled={isSaveDisabled}
              isAnimating={isAnimating}
              isSearchActive={editMode.isSearchingRelationships}
              nodeSize={nodeSize}
              nodeType={editingNode.type}
              hasError={!!validationErrors.title}
              opacity={animatedUIOpacity}
              nodeColors={nodeColors}
            />
          </div>
        </Html>
      </group>

      {/* Relationship Search Interface */}
      {editMode.isSearchingRelationships && (
        <RelationshipSearchInput position={centerPosition} />
      )}
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

function ContactFields({ email, phone, did, radicleId, onEmailChange, onPhoneChange, onDidChange, nodeSize, hasError, opacity }: {
  email: string;
  phone: string;
  did: string;
  radicleId: string;
  onEmailChange: (e: React.ChangeEvent<globalThis.HTMLInputElement>) => void;
  onPhoneChange: (e: React.ChangeEvent<globalThis.HTMLInputElement>) => void;
  onDidChange: (e: React.ChangeEvent<globalThis.HTMLInputElement>) => void;
  nodeSize: number;
  hasError: boolean;
  opacity: number;
}) {
  const inputStyle = {
    padding: '14px 16px',
    background: 'rgba(0,0,0,0.6)',
    border: '1px solid rgba(255,255,255,0.4)',
    borderRadius: '6px',
    color: 'white',
    fontSize: '24px',
    fontFamily: dreamNodeStyles.typography.fontFamily,
    textAlign: 'center' as const,
    outline: 'none',
    height: '48px',
    boxSizing: 'border-box' as const
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: `${nodeSize + (hasError ? 40 : 20)}px`,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        opacity,
        width: '300px'
      }}
    >
      <input
        type="email"
        value={email}
        onChange={onEmailChange}
        placeholder="Email (optional)"
        style={inputStyle}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />
      <input
        type="tel"
        value={phone}
        onChange={onPhoneChange}
        placeholder="Phone (optional)"
        style={inputStyle}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />
      <input
        type="text"
        value={did}
        onChange={onDidChange}
        placeholder="DID (optional)"
        style={inputStyle}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />
      <input
        type="text"
        value={radicleId}
        disabled
        placeholder="Radicle ID (auto-generated)"
        style={{
          ...inputStyle,
          background: 'rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.25)',
          color: 'rgba(255,255,255,0.6)',
          cursor: 'not-allowed'
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function ActionButtons({ onCancel, onSave, onToggleSearch, isDisabled, isAnimating, isSearchActive, nodeSize, nodeType, hasError, opacity, nodeColors }: {
  onCancel: () => void;
  onSave: () => void;
  onToggleSearch: () => void;
  isDisabled: boolean;
  isAnimating: boolean;
  isSearchActive: boolean;
  nodeSize: number;
  nodeType: 'dream' | 'dreamer';
  hasError: boolean;
  opacity: number;
  nodeColors: ReturnType<typeof getNodeColors>;
}) {
  const basePadding = `${Math.max(8, nodeSize * 0.02)}px ${Math.max(16, nodeSize * 0.04)}px`;
  const fontSize = `${Math.max(14, nodeSize * 0.035)}px`;
  const borderRadius = `${Math.max(4, nodeSize * 0.01)}px`;

  // Calculate top position based on node type and error state
  // Dreamer nodes have contact fields, dream nodes go straight to buttons
  const topOffset = nodeType === 'dreamer'
    ? nodeSize + (hasError ? 300 : 280)
    : nodeSize + (hasError ? 40 : 20);

  return (
    <div
      style={{
        position: 'absolute',
        top: `${topOffset}px`,
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
        onClick={(e) => { e.stopPropagation(); onSave(); }}
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
        {isAnimating ? 'Saving...' : 'Save'}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onToggleSearch(); }}
        onMouseDown={(e) => e.stopPropagation()}
        disabled={isAnimating}
        style={{
          padding: basePadding,
          border: `1px solid ${isSearchActive ? nodeColors.border : 'rgba(255,255,255,0.5)'}`,
          background: isSearchActive ? 'rgba(255,255,255,0.1)' : 'transparent',
          color: isAnimating ? 'rgba(255,255,255,0.5)' : 'white',
          fontSize,
          fontFamily: dreamNodeStyles.typography.fontFamily,
          borderRadius,
          cursor: isAnimating ? 'not-allowed' : 'pointer',
          transition: dreamNodeStyles.transitions.default,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        title="Toggle relationship search"
        ref={(el) => {
          if (el) {
            el.innerHTML = '';
            setIcon(el, 'lucide-git-compare-arrows');
          }
        }}
      />
    </div>
  );
}
