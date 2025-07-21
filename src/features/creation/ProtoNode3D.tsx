import React, { useState, useRef, useCallback } from 'react';
import { Html } from '@react-three/drei';
import { Group } from 'three';
import { dreamNodeStyles, getNodeColors, getNodeGlow } from '../../dreamspace/dreamNodeStyles';
import { useInterBrainStore, ProtoNode } from '../../store/interbrain-store';

interface ProtoNode3DProps {
  position: [number, number, number];
  onComplete: (protoNode: ProtoNode) => void;
  onCancel: () => void;
}

/**
 * ProtoNode3D - Translucent in-space creation UI
 * 
 * Renders a translucent version of a DreamNode that users can edit directly
 * in 3D space. Includes inline title editing, type selection, and DreamTalk
 * file integration.
 */
export default function ProtoNode3D({ 
  position,
  onComplete,
  onCancel
}: ProtoNode3DProps) {
  const groupRef = useRef<Group>(null);
  const titleInputRef = useRef<globalThis.HTMLInputElement>(null);
  const fileInputRef = useRef<globalThis.HTMLInputElement>(null);
  
  // Get creation state from store
  const { creationState, updateProtoNode, setValidationErrors } = useInterBrainStore();
  const { protoNode, validationErrors } = creationState;
  
  // Local UI state
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<string | null>(null);
  
  if (!protoNode) {
    return null; // Should not render if no proto node exists
  }
  
  const nodeColors = getNodeColors(protoNode.type);
  const nodeSize = dreamNodeStyles.dimensions.nodeSizeThreeD; // Use 3D size to match existing nodes
  const borderWidth = Math.max(1, nodeSize * 0.04); // Same calculation as DreamNode3D
  
  // Validation handlers
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
    updateProtoNode({ title });
    validateTitle(title);
  };
  
  const handleTypeChange = (type: 'dream' | 'dreamer') => {
    updateProtoNode({ type });
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const file = files[0];
    
    if (file && isValidMediaFile(file)) {
      updateProtoNode({ dreamTalkFile: file });
      // Create preview URL for display
      const previewUrl = globalThis.URL.createObjectURL(file);
      setPreviewMedia(previewUrl);
    }
  };
  
  const handleFileSelect = (e: React.ChangeEvent<globalThis.HTMLInputElement>) => {
    console.log('File input changed, files:', e.target.files);
    const file = e.target.files?.[0];
    if (file) {
      console.log('Selected file:', file.name, file.type);
      if (isValidMediaFile(file)) {
        console.log('File is valid, updating proto-node');
        updateProtoNode({ dreamTalkFile: file });
        const previewUrl = globalThis.URL.createObjectURL(file);
        setPreviewMedia(previewUrl);
      } else {
        console.warn('File type not valid:', file.type);
      }
    }
  };
  
  const handleCreate = () => {
    if (validateTitle(protoNode.title)) {
      onComplete(protoNode);
    }
  };
  
  const handleCancel = () => {
    // Clean up preview URL if exists
    if (previewMedia) {
      globalThis.URL.revokeObjectURL(previewMedia);
    }
    onCancel();
  };
  
  // Keyboard handler for the entire component
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCreate();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };
  
  const isCreateDisabled = !protoNode.title.trim() || !!validationErrors.title;
  
  return (
    <group ref={groupRef} position={position}>
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
        <div onKeyDown={handleKeyDown} data-ui-element="proto-node">
          {/* Main Proto-Node Circle */}
          <div
            style={{
              width: `${nodeSize}px`,
              height: `${nodeSize}px`,
              borderRadius: dreamNodeStyles.dimensions.borderRadius,
              border: `${borderWidth}px solid ${nodeColors.border}`,
              background: nodeColors.fill,
              overflow: 'hidden',
              position: 'relative',
              opacity: dreamNodeStyles.states.creation.opacity,
              transition: dreamNodeStyles.transitions.creation,
              boxShadow: getNodeGlow(protoNode.type, 15),
              fontFamily: dreamNodeStyles.typography.fontFamily
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* DreamTalk Media Area or Drop Zone */}
            {previewMedia || protoNode.dreamTalkFile ? (
              <div
                style={{
                  width: '80%',
                  height: '80%',
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: 'rgba(0, 0, 0, 0.8)'
                }}
              >
                {previewMedia && (
                  <img 
                    src={previewMedia}
                    alt="DreamTalk preview"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                )}
              </div>
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: dreamNodeStyles.colors.text.secondary,
                  fontSize: '12px',
                  textAlign: 'center',
                  padding: '20px',
                  cursor: 'pointer',
                  border: isDragOver ? '2px dashed rgba(255,255,255,0.5)' : 'none',
                  borderRadius: '50%',
                  zIndex: 9999,
                  pointerEvents: 'auto',
                  backgroundColor: 'rgba(255,0,0,0.1)' // Temporary: make it visible for debugging
                }}
                onClick={(e) => {
                  console.log('File picker area clicked');
                  e.stopPropagation(); // Prevent event bubbling
                  e.preventDefault();
                  fileInputRef.current?.click();
                }}
                onMouseDown={(e) => {
                  console.log('File picker area mouse down');
                  e.stopPropagation(); // Prevent rotation controls from capturing
                  e.preventDefault();
                }}
              >
                <div>Drop image here</div>
                <div>or click to browse</div>
              </div>
            )}
            
            {/* Title Input Overlay */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0, 0, 0, 0.7)',
                borderRadius: '50%',
                pointerEvents: 'none' // Allow clicks through to underlying elements
              }}
            >
              <input
                ref={titleInputRef}
                type="text"
                value={protoNode.title}
                onChange={handleTitleChange}
                placeholder="Node title..."
                autoFocus
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: dreamNodeStyles.colors.text.primary,
                  fontSize: `${dreamNodeStyles.typography.fontSize.base}px`,
                  fontFamily: dreamNodeStyles.typography.fontFamily,
                  textAlign: 'center',
                  outline: 'none',
                  width: '80%',
                  padding: '8px',
                  pointerEvents: 'auto' // Re-enable pointer events for the input itself
                }}
              />
            </div>
            
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
                whiteSpace: 'nowrap'
              }}
            >
              {validationErrors.title}
            </div>
          )}
          
          {/* Type Toggle Control */}
          <div
            style={{
              position: 'absolute',
              top: `${nodeSize + (validationErrors.title ? 40 : 20)}px`,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              borderRadius: '20px',
              overflow: 'hidden',
              border: '2px solid rgba(255,255,255,0.3)'
            }}
          >
            <button
              onClick={() => handleTypeChange('dream')}
              style={{
                padding: '8px 16px',
                border: 'none',
                background: protoNode.type === 'dream' ? getNodeColors('dream').border : 'transparent',
                color: 'white',
                fontSize: '14px',
                fontFamily: dreamNodeStyles.typography.fontFamily,
                cursor: 'pointer',
                transition: dreamNodeStyles.transitions.default
              }}
            >
              Dream
            </button>
            <button
              onClick={() => handleTypeChange('dreamer')}
              style={{
                padding: '8px 16px',
                border: 'none',
                background: protoNode.type === 'dreamer' ? getNodeColors('dreamer').border : 'transparent',
                color: 'white',
                fontSize: '14px',
                fontFamily: dreamNodeStyles.typography.fontFamily,
                cursor: 'pointer',
                transition: dreamNodeStyles.transitions.default
              }}
            >
              Dreamer
            </button>
          </div>
          
          {/* Action Buttons */}
          <div
            style={{
              position: 'absolute',
              top: `${nodeSize + (validationErrors.title ? 80 : 60)}px`,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: '12px'
            }}
          >
            <button
              onClick={handleCancel}
              style={{
                padding: '8px 16px',
                border: '1px solid rgba(255,255,255,0.5)',
                background: 'transparent',
                color: 'white',
                fontSize: '14px',
                fontFamily: dreamNodeStyles.typography.fontFamily,
                borderRadius: '4px',
                cursor: 'pointer',
                transition: dreamNodeStyles.transitions.default
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={isCreateDisabled}
              style={{
                padding: '8px 16px',
                border: 'none',
                background: isCreateDisabled 
                  ? 'rgba(255,255,255,0.3)' 
                  : nodeColors.border,
                color: isCreateDisabled ? 'rgba(255,255,255,0.5)' : 'white',
                fontSize: '14px',
                fontFamily: dreamNodeStyles.typography.fontFamily,
                borderRadius: '4px',
                cursor: isCreateDisabled ? 'not-allowed' : 'pointer',
                transition: dreamNodeStyles.transitions.default
              }}
            >
              Create
            </button>
          </div>
        </div>
      </Html>
    </group>
  );
}

/**
 * Validate media file types for DreamTalk
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