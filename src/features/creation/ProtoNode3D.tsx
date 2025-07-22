import React, { useState, useRef, useCallback } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { dreamNodeStyles, getNodeColors, getNodeGlow, getMediaContainerStyle, getMediaOverlayStyle } from '../../dreamspace/dreamNodeStyles';
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
  const titleInputRef = useRef<globalThis.HTMLInputElement>(null);
  const fileInputRef = useRef<globalThis.HTMLInputElement>(null);
  
  // Get creation state from store
  const { creationState, updateProtoNode, setValidationErrors } = useInterBrainStore();
  const { protoNode, validationErrors } = creationState;
  
  // Local UI state
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Unified animation state - position and opacity in one system
  const [animatedPosition, setAnimatedPosition] = useState<[number, number, number]>(position);
  const [animatedOpacity, setAnimatedOpacity] = useState<number>(1.0); // Start at full opacity
  const [animatedUIOpacity, setAnimatedUIOpacity] = useState<number>(1.0); // UI elements start fully visible
  const animationStartTime = useRef<number | null>(null);
  
  // Single useFrame for both position and opacity animation
  useFrame(() => {
    if (!animationStartTime.current) return;
    
    const elapsed = Date.now() - animationStartTime.current;
    const progress = Math.min(elapsed / 1000, 1); // 1 second duration
    
    // Ease-in-out function
    const easeInOut = progress < 0.5 
      ? 2 * progress * progress 
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    
    // Animate position: [0,0,-25] → [0,0,-75]
    const startZ = position[2]; // -25
    const endZ = -75; // Move to final position
    const newZ = startZ + (endZ - startZ) * easeInOut;
    setAnimatedPosition([position[0], position[1], newZ]);
    
    // Keep main node opacity at 1.0 (no animation)
    setAnimatedOpacity(1.0);
    
    // Animate UI elements opacity: 1.0 → 0.0 (fade out buttons/controls)
    const startUIOpacity = 1.0;
    const endUIOpacity = 0.0;
    const newUIOpacity = startUIOpacity + (endUIOpacity - startUIOpacity) * easeInOut;
    setAnimatedUIOpacity(newUIOpacity);
    
    // Complete animation
    if (progress >= 1) {
      animationStartTime.current = null;
      setAnimatedPosition([position[0], position[1], endZ]);
      setAnimatedOpacity(1.0); // Stay at full opacity
      setAnimatedUIOpacity(endUIOpacity);
    }
  });

  // Maintain persistent focus on text input when type changes
  React.useEffect(() => {
    if (protoNode && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [protoNode?.type]);
  
  // Handle pre-filled dreamTalkFile
  React.useEffect(() => {
    if (protoNode?.dreamTalkFile && !previewMedia) {
      // Create preview URL for pre-filled media
      const previewUrl = globalThis.URL.createObjectURL(protoNode.dreamTalkFile);
      setPreviewMedia(previewUrl);
      console.log('Created preview for pre-filled media:', protoNode.dreamTalkFile.name);
    }
  }, [protoNode?.dreamTalkFile, previewMedia]);
  
  if (!protoNode) {
    return null; // Should not render if no proto node exists
  }
  
  const nodeColors = getNodeColors(protoNode.type);
  const nodeSize = dreamNodeStyles.dimensions.nodeSizeThreeD; // Use 3D size to match existing nodes
  const borderWidth = dreamNodeStyles.dimensions.borderWidth; // Use shared border width
  
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
    // Refocus text input after type change to maintain persistent focus
    globalThis.setTimeout(() => {
      titleInputRef.current?.focus();
    }, 0);
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
    const file = e.target.files?.[0];
    if (file) {
      if (isValidMediaFile(file)) {
        updateProtoNode({ dreamTalkFile: file });
        const previewUrl = globalThis.URL.createObjectURL(file);
        setPreviewMedia(previewUrl);
      }
    }
  };
  
  const handleCreate = () => {
    if (validateTitle(protoNode.title)) {
      setIsAnimating(true);
      
      // Start unified animation (position + opacity)
      animationStartTime.current = Date.now();
      
      // Complete exactly when animation finishes
      globalThis.setTimeout(() => {
        setIsAnimating(false);
        onComplete(protoNode);
      }, 1000); // Exactly when animation completes
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
  
  const isCreateDisabled = !protoNode.title.trim() || !!validationErrors.title || isAnimating;
  
  return (
    <group position={animatedPosition}>
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
          data-ui-element="proto-node"
          onMouseDown={(e) => e.stopPropagation()} // Prevent sphere rotation
          onMouseMove={(e) => e.stopPropagation()} // Prevent sphere rotation
          onMouseUp={(e) => e.stopPropagation()} // Prevent sphere rotation
          onClick={(e) => e.stopPropagation()} // Prevent any click propagation
        >
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
              opacity: animatedOpacity,
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
                  ...getMediaContainerStyle(),
                  opacity: animatedOpacity // Animate media opacity with main node
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
                {/* Fade-to-black overlay (same as DreamNode3D) */}
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
                  zIndex: 9999,
                  pointerEvents: 'auto',
                  opacity: animatedUIOpacity // Fade out drag-drop text with other UI
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: '75%', // Move down more
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    color: dreamNodeStyles.colors.text.secondary,
                    fontSize: '24px', // Double the size
                    textAlign: 'center',
                    whiteSpace: 'nowrap'
                  }}
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent event bubbling
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation(); // Prevent rotation controls from capturing
                    e.preventDefault();
                  }}
                >
                  <div>Drop image here</div>
                  <div>or click to browse</div>
                </div>
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
                pointerEvents: 'none', // Allow clicks through to underlying elements
                opacity: (previewMedia || protoNode.dreamTalkFile) ? animatedUIOpacity : 1.0 // Only fade out if there's media behind
              }}
            >
              <input
                ref={titleInputRef}
                type="text"
                value={protoNode.title}
                onChange={handleTitleChange}
                placeholder="Name"
                autoFocus
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: dreamNodeStyles.colors.text.primary,
                  fontSize: `${Math.max(12, nodeSize * 0.08)}px`, // Match DreamNode3D text sizing
                  fontFamily: dreamNodeStyles.typography.fontFamily,
                  textAlign: 'center',
                  outline: 'none',
                  width: '80%',
                  height: `${Math.max(40, nodeSize * 0.08)}px`, // Explicit height for proper text display
                  padding: `${Math.max(8, nodeSize * 0.02)}px`, // Scale padding with node size for proper text height
                  pointerEvents: 'auto', // Re-enable pointer events for the input itself
                  boxShadow: 'none', // Remove any potential box shadow
                  borderRadius: '0' // Remove any border radius that might show an outline
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
                whiteSpace: 'nowrap',
                opacity: animatedUIOpacity // Fade out during animation
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
              opacity: animatedUIOpacity // Fade out during animation
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation(); // Prevent sphere rotation
                handleTypeChange('dream');
              }}
              onMouseDown={(e) => e.stopPropagation()} // Prevent sphere rotation
              style={{
                padding: `${Math.max(8, nodeSize * 0.02)}px ${Math.max(16, nodeSize * 0.04)}px`, // Scale with node size
                border: `${dreamNodeStyles.dimensions.toggleBorderWidth}px solid ${getNodeColors('dream').border}`, // Use shared toggle border width
                background: protoNode.type === 'dream' ? getNodeColors('dream').border : 'transparent', // Fill when selected
                color: 'white',
                fontSize: `${Math.max(14, nodeSize * 0.035)}px`, // Scale font with node size
                fontFamily: dreamNodeStyles.typography.fontFamily,
                cursor: 'pointer',
                transition: 'background 0.2s ease', // Only animate background fill
                flex: '1', // Equal width
                minWidth: '60px', // Ensure minimum width for symmetry
                borderRadius: `${Math.max(4, nodeSize * 0.01)}px 0 0 ${Math.max(4, nodeSize * 0.01)}px`, // Individual rounded left corners
                boxSizing: 'border-box',
                marginRight: '0.5px' // Minimal gap to show both border colors without black space
              }}
            >
              Dream
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation(); // Prevent sphere rotation
                handleTypeChange('dreamer');
              }}
              onMouseDown={(e) => e.stopPropagation()} // Prevent sphere rotation
              style={{
                padding: `${Math.max(8, nodeSize * 0.02)}px ${Math.max(16, nodeSize * 0.04)}px`, // Scale with node size
                border: `${dreamNodeStyles.dimensions.toggleBorderWidth}px solid ${getNodeColors('dreamer').border}`, // Use shared toggle border width
                background: protoNode.type === 'dreamer' ? getNodeColors('dreamer').border : 'transparent', // Fill when selected
                color: 'white',
                fontSize: `${Math.max(14, nodeSize * 0.035)}px`, // Scale font with node size
                fontFamily: dreamNodeStyles.typography.fontFamily,
                cursor: 'pointer',
                transition: 'background 0.2s ease', // Only animate background fill
                flex: '1', // Equal width
                minWidth: '60px', // Ensure minimum width for symmetry
                borderRadius: `0 ${Math.max(4, nodeSize * 0.01)}px ${Math.max(4, nodeSize * 0.01)}px 0`, // Individual rounded right corners
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
              top: `${nodeSize + (validationErrors.title ? 120 : 100)}px`, // Increased gap from 60/80 to 100/120
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: '12px',
              opacity: animatedUIOpacity // Fade out during animation
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation(); // Prevent sphere rotation
                handleCancel();
              }}
              onMouseDown={(e) => e.stopPropagation()} // Prevent sphere rotation
              disabled={isAnimating}
              style={{
                padding: `${Math.max(8, nodeSize * 0.02)}px ${Math.max(16, nodeSize * 0.04)}px`, // Scale with node size
                border: '1px solid rgba(255,255,255,0.5)',
                background: 'transparent',
                color: isAnimating ? 'rgba(255,255,255,0.5)' : 'white',
                fontSize: `${Math.max(14, nodeSize * 0.035)}px`, // Scale font with node size
                fontFamily: dreamNodeStyles.typography.fontFamily,
                borderRadius: `${Math.max(4, nodeSize * 0.01)}px`, // Scale border radius
                cursor: isAnimating ? 'not-allowed' : 'pointer',
                transition: dreamNodeStyles.transitions.default
              }}
            >
              Cancel
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation(); // Prevent sphere rotation
                handleCreate();
              }}
              onMouseDown={(e) => e.stopPropagation()} // Prevent sphere rotation
              disabled={isCreateDisabled}
              style={{
                padding: `${Math.max(8, nodeSize * 0.02)}px ${Math.max(16, nodeSize * 0.04)}px`, // Scale with node size
                border: 'none',
                background: isCreateDisabled 
                  ? 'rgba(255,255,255,0.3)' 
                  : nodeColors.border,
                color: isCreateDisabled ? 'rgba(255,255,255,0.5)' : 'white',
                fontSize: `${Math.max(14, nodeSize * 0.035)}px`, // Scale font with node size
                fontFamily: dreamNodeStyles.typography.fontFamily,
                borderRadius: `${Math.max(4, nodeSize * 0.01)}px`, // Scale border radius
                cursor: isCreateDisabled ? 'not-allowed' : 'pointer',
                transition: dreamNodeStyles.transitions.default
              }}
            >
              {isAnimating ? 'Creating...' : 'Create'}
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