import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { dreamNodeStyles, getNodeColors, getNodeGlow, getMediaContainerStyle, getMediaOverlayStyle } from '../../dreamspace/dreamNodeStyles';
import { useInterBrainStore } from '../../store/interbrain-store';

interface EditNode3DProps {
  position: [number, number, number];
  onSave: () => void;
  onCancel: () => void;
  onToggleSearchOff?: () => Promise<void>;
}

/**
 * EditNode3D - Unified in-space editing UI extending ProtoNode patterns
 * 
 * Reuses ProtoNode3D logic for consistency but works with existing DreamNode data.
 * Provides the same title editing, type selection, and DreamTalk file integration
 * but pre-populated with existing node data.
 */
export default function EditNode3D({ 
  position,
  onSave,
  onCancel,
  onToggleSearchOff
}: EditNode3DProps) {
  const titleInputRef = useRef<globalThis.HTMLInputElement>(null);
  const fileInputRef = useRef<globalThis.HTMLInputElement>(null);
  
  // Get edit mode state from store
  const { editMode, updateEditingNodeMetadata, setEditModeNewDreamTalkFile, setEditModeValidationErrors, setEditModeSearchActive } = useInterBrainStore();
  const { editingNode, validationErrors, newDreamTalkFile } = editMode;
  
  // Local UI state for immediate responsiveness
  const [localTitle, setLocalTitle] = useState(editingNode?.name || '');
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Debounced store updates - only update store 300ms after user stops typing
  const debounceTimeoutRef = useRef<number | null>(null);
  
  // Animation state (reuse ProtoNode3D patterns)
  // Position no longer animates during save - stays constant
  const [animatedOpacity, setAnimatedOpacity] = useState<number>(1.0);
  const [animatedUIOpacity, setAnimatedUIOpacity] = useState<number>(1.0);
  const animationStartTime = useRef<number | null>(null);
  
  // Animation frame loop for UI fade out only
  useFrame(() => {
    if (!animationStartTime.current) return;
    
    const elapsed = Date.now() - animationStartTime.current;
    const progress = Math.min(elapsed / 1000, 1); // 1 second duration
    
    // Ease-in-out function for smooth transition
    const easeInOut = progress < 0.5 
      ? 2 * progress * progress 
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    
    // Keep main node fully visible - it transitions to the actual DreamNode
    setAnimatedOpacity(1.0);
    
    // Fade out UI controls (buttons, type toggle, validation) smoothly
    const startUIOpacity = 1.0;
    const endUIOpacity = 0.0;
    const newUIOpacity = startUIOpacity + (endUIOpacity - startUIOpacity) * easeInOut;
    setAnimatedUIOpacity(newUIOpacity);
    
    // Complete animation
    if (progress >= 1) {
      animationStartTime.current = null;
      setAnimatedOpacity(1.0);
      setAnimatedUIOpacity(endUIOpacity);
    }
  });
  
  // Maintain persistent focus on text input when type changes (ProtoNode3D pattern)
  useEffect(() => {
    if (editingNode && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [editingNode?.type]);
  
  // Handle pre-filled dreamTalkMedia from existing node or new file
  useEffect(() => {
    if (newDreamTalkFile && !previewMedia) {
      // Prioritize new file over existing media
      const previewUrl = globalThis.URL.createObjectURL(newDreamTalkFile);
      setPreviewMedia(previewUrl);
      console.log(`[EditNode3D] Showing new DreamTalk file: ${newDreamTalkFile.name}`);
    } else if (editingNode?.dreamTalkMedia.length && !previewMedia) {
      // Fall back to existing media
      const existingMedia = editingNode.dreamTalkMedia[0];
      if (existingMedia.data) {
        console.log(`[EditNode3D] Loading existing DreamTalk media: ${existingMedia.path}`);
        setPreviewMedia(existingMedia.data);
      }
    }
  }, [editingNode?.dreamTalkMedia, newDreamTalkFile, previewMedia]);
  
  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        globalThis.clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);
  
  // Sync local title with store title (for external updates)
  useEffect(() => {
    if (editingNode?.name !== undefined) {
      setLocalTitle(editingNode.name);
    }
  }, [editingNode?.name]);
  
  if (!editingNode) {
    return null; // Should not render if no node is being edited
  }
  
  const nodeColors = getNodeColors(editingNode.type);
  const nodeSize = dreamNodeStyles.dimensions.nodeSizeThreeD;
  const borderWidth = dreamNodeStyles.dimensions.borderWidth;
  
  // Validation handlers (same as ProtoNode3D)
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
  
  // Debounced store update functions
  const updateStoreTitle = useCallback((title: string) => {
    updateEditingNodeMetadata({ name: title });
  }, [updateEditingNodeMetadata]);
  
  const debounceValidation = useCallback((title: string) => {
    validateTitle(title);
  }, [validateTitle]);
  
  // Event handlers - immediate local state update, debounced store updates
  const handleTitleChange = (e: React.ChangeEvent<globalThis.HTMLInputElement>) => {
    const title = e.target.value;
    
    // IMMEDIATE: Update local state for responsive UI
    setLocalTitle(title);
    
    // DEBOUNCED: Update store and validation only after user stops typing for 300ms
    if (debounceTimeoutRef.current) {
      globalThis.clearTimeout(debounceTimeoutRef.current);
    }
    
    debounceTimeoutRef.current = globalThis.setTimeout(() => {
      updateStoreTitle(title);
      debounceValidation(title);
    }, 300) as unknown as number;
  };
  
  const handleTypeChange = (type: 'dream' | 'dreamer') => {
    updateEditingNodeMetadata({ type });
    
    // TODO: Add warning about type change affecting relationships
    console.warn('Type change in edit mode - relationship implications need to be handled');
    
    // Refocus text input after type change to maintain persistent focus
    globalThis.setTimeout(() => {
      titleInputRef.current?.focus();
    }, 0);
  };
  
  // File handling (same patterns as ProtoNode3D)
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
    
    const files = Array.from(e.dataTransfer.files);
    const file = files[0];
    
    if (file && isValidMediaFile(file)) {
      console.log(`[EditNode3D] New DreamTalk media dropped: ${file.name}`);
      const previewUrl = globalThis.URL.createObjectURL(file);
      setPreviewMedia(previewUrl);
      
      // Store the new file in edit mode state for save processing
      setEditModeNewDreamTalkFile(file);
    }
  };
  
  const handleFileSelect = (e: React.ChangeEvent<globalThis.HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && isValidMediaFile(file)) {
      console.log(`[EditNode3D] New DreamTalk media selected: ${file.name}`);
      const previewUrl = globalThis.URL.createObjectURL(file);
      setPreviewMedia(previewUrl);
      
      // Store the new file in edit mode state for save processing
      setEditModeNewDreamTalkFile(file);
    }
  };
  
  const handleSave = () => {
    if (validateTitle(localTitle)) {
      setIsAnimating(true);
      
      // Start save animation (fading out UI controls)
      animationStartTime.current = Date.now();
      
      // Call onSave to trigger data persistence and liminal web transition
      // The parent component will handle the spatial layout change
      onSave();
      
      // The animation continues running to fade out the UI controls
      // EditModeOverlay will handle exit after successful save
      globalThis.setTimeout(() => {
        setIsAnimating(false);
      }, 1000);
    }
  };
  
  const handleCancel = () => {
    // Clean up preview URL if exists
    if (previewMedia) {
      globalThis.URL.revokeObjectURL(previewMedia);
    }
    onCancel();
  };
  
  // Toggle relationship search interface
  const handleToggleRelationshipSearch = () => {
    if (editMode.isSearchingRelationships) {
      // Turning OFF search mode - filter to pending relationships
      if (onToggleSearchOff) {
        onToggleSearchOff();
      } else {
        // Fallback - just turn off search without filtering
        setEditModeSearchActive(false);
      }
    } else {
      // Turning ON search mode - just activate the interface
      setEditModeSearchActive(true);
    }
  };

  // Keyboard handler (same as ProtoNode3D)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    // Note: Escape handling is now managed by global DreamspaceCanvas handler
  };
  
  const isSaveDisabled = !localTitle.trim() || !!validationErrors.title || isAnimating;
  
  return (
    <group position={position}>
      <Html
        position={[0, 0, 0]}
        center
        transform
        sprite
        distanceFactor={10}
        style={{
          pointerEvents: 'auto',
          userSelect: 'none'
        }}
      >
        <div 
          onKeyDown={handleKeyDown} 
          data-ui-element="edit-node"
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
            {/* DreamTalk Media Area or Drop Zone */}
            {previewMedia || editingNode.dreamTalkMedia.length > 0 ? (
              <div
                style={{
                  ...getMediaContainerStyle(),
                  opacity: animatedOpacity
                }}
              >
                {previewMedia ? (
                  // Show new media preview (from drag/drop or file select)
                  <img 
                    src={previewMedia}
                    alt="DreamTalk preview"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                ) : editingNode.dreamTalkMedia.length > 0 ? (
                  // Show existing media from DreamNode
                  <img 
                    src={editingNode.dreamTalkMedia[0].data}
                    alt="Current DreamTalk media"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                ) : null}
                <div style={getMediaOverlayStyle()} />
              </div>
            ) : (
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
                  opacity: animatedUIOpacity
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  fileInputRef.current?.click();
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
            )}
            
            {/* Text Input - Same as ProtoNode3D */}
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
                boxShadow: 'none',
                zIndex: 10,
                pointerEvents: 'auto',
                cursor: 'text'
              }}
              onClick={(e) => e.stopPropagation()}
            />
            
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>
          
          {/* Validation Error Display */}
          {validationErrors.title && (
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
                opacity: animatedUIOpacity
              }}
            >
              {validationErrors.title}
            </div>
          )}
          
          {/* Type Toggle Control - Same as ProtoNode3D */}
          <div
            style={{
              position: 'absolute',
              top: `${nodeSize + (validationErrors.title ? 40 : 20)}px`,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              opacity: animatedUIOpacity
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleTypeChange('dream');
              }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                padding: `${Math.max(8, nodeSize * 0.02)}px ${Math.max(16, nodeSize * 0.04)}px`,
                border: `${dreamNodeStyles.dimensions.toggleBorderWidth}px solid ${getNodeColors('dream').border}`,
                background: editingNode.type === 'dream' ? getNodeColors('dream').border : 'transparent',
                color: 'white',
                fontSize: `${Math.max(14, nodeSize * 0.035)}px`,
                fontFamily: dreamNodeStyles.typography.fontFamily,
                cursor: 'pointer',
                transition: 'background 0.2s ease',
                flex: '1',
                minWidth: '60px',
                borderRadius: `${Math.max(4, nodeSize * 0.01)}px 0 0 ${Math.max(4, nodeSize * 0.01)}px`,
                boxSizing: 'border-box',
                marginRight: '0.5px'
              }}
            >
              Dream
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleTypeChange('dreamer');
              }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                padding: `${Math.max(8, nodeSize * 0.02)}px ${Math.max(16, nodeSize * 0.04)}px`,
                border: `${dreamNodeStyles.dimensions.toggleBorderWidth}px solid ${getNodeColors('dreamer').border}`,
                background: editingNode.type === 'dreamer' ? getNodeColors('dreamer').border : 'transparent',
                color: 'white',
                fontSize: `${Math.max(14, nodeSize * 0.035)}px`,
                fontFamily: dreamNodeStyles.typography.fontFamily,
                cursor: 'pointer',
                transition: 'background 0.2s ease',
                flex: '1',
                minWidth: '60px',
                borderRadius: `0 ${Math.max(4, nodeSize * 0.01)}px ${Math.max(4, nodeSize * 0.01)}px 0`,
                boxSizing: 'border-box'
              }}
            >
              Dreamer
            </button>
          </div>
          
          {/* Action Buttons */}
          <div
            style={{
              position: 'absolute',
              top: `${nodeSize + (validationErrors.title ? 120 : 100)}px`,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: '12px',
              opacity: animatedUIOpacity
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCancel();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={isAnimating}
              style={{
                padding: `${Math.max(8, nodeSize * 0.02)}px ${Math.max(16, nodeSize * 0.04)}px`,
                border: '1px solid rgba(255,255,255,0.5)',
                background: 'transparent',
                color: isAnimating ? 'rgba(255,255,255,0.5)' : 'white',
                fontSize: `${Math.max(14, nodeSize * 0.035)}px`,
                fontFamily: dreamNodeStyles.typography.fontFamily,
                borderRadius: `${Math.max(4, nodeSize * 0.01)}px`,
                cursor: isAnimating ? 'not-allowed' : 'pointer',
                transition: dreamNodeStyles.transitions.default
              }}
            >
              Cancel
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSave();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={isSaveDisabled}
              style={{
                padding: `${Math.max(8, nodeSize * 0.02)}px ${Math.max(16, nodeSize * 0.04)}px`,
                border: 'none',
                background: isSaveDisabled 
                  ? 'rgba(255,255,255,0.3)' 
                  : nodeColors.border,
                color: isSaveDisabled ? 'rgba(255,255,255,0.5)' : 'white',
                fontSize: `${Math.max(14, nodeSize * 0.035)}px`,
                fontFamily: dreamNodeStyles.typography.fontFamily,
                borderRadius: `${Math.max(4, nodeSize * 0.01)}px`,
                cursor: isSaveDisabled ? 'not-allowed' : 'pointer',
                transition: dreamNodeStyles.transitions.default
              }}
            >
              {isAnimating ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggleRelationshipSearch();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={isAnimating}
              style={{
                padding: `${Math.max(8, nodeSize * 0.02)}px ${Math.max(16, nodeSize * 0.04)}px`,
                border: `1px solid ${editMode.isSearchingRelationships ? nodeColors.border : 'rgba(255,255,255,0.5)'}`,
                background: editMode.isSearchingRelationships ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: isAnimating ? 'rgba(255,255,255,0.5)' : 'white',
                fontSize: `${Math.max(14, nodeSize * 0.035)}px`,
                fontFamily: dreamNodeStyles.typography.fontFamily,
                borderRadius: `${Math.max(4, nodeSize * 0.01)}px`,
                cursor: isAnimating ? 'not-allowed' : 'pointer',
                transition: dreamNodeStyles.transitions.default,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px'
              }}
              title="Toggle relationship search"
            >
              🔗
            </button>
          </div>
        </div>
      </Html>
    </group>
  );
}

/**
 * Validate media file types for DreamTalk (same as ProtoNode3D)
 */
function isValidMediaFile(file: globalThis.File): boolean {
  const validTypes = [
    'image/png',
    'image/jpeg', 
    'image/jpg',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm'
  ];
  
  return validTypes.includes(file.type);
}