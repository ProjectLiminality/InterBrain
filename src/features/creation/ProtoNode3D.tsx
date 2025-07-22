import React, { useState, useRef, useCallback } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
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
  const [animatedOpacity, setAnimatedOpacity] = useState<number>(dreamNodeStyles.states.creation.opacity);
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
    const endZ = -75;
    const newZ = startZ + (endZ - startZ) * easeInOut;
    setAnimatedPosition([position[0], position[1], newZ]);
    
    // Animate main node opacity: 0.7 → 1.0
    const startOpacity = dreamNodeStyles.states.creation.opacity;
    const endOpacity = 1.0;
    const newOpacity = startOpacity + (endOpacity - startOpacity) * easeInOut;
    setAnimatedOpacity(newOpacity);
    
    // Animate UI elements opacity: 1.0 → 0.0 (fade out buttons/controls)
    const startUIOpacity = 1.0;
    const endUIOpacity = 0.0;
    const newUIOpacity = startUIOpacity + (endUIOpacity - startUIOpacity) * easeInOut;
    setAnimatedUIOpacity(newUIOpacity);
    
    // Complete animation
    if (progress >= 1) {
      animationStartTime.current = null;
      setAnimatedPosition([position[0], position[1], endZ]);
      setAnimatedOpacity(endOpacity);
      setAnimatedUIOpacity(endUIOpacity);
    }
  });

  // Maintain persistent focus on text input when type changes
  React.useEffect(() => {
    if (protoNode && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [protoNode?.type]);
  
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
      console.log('ProtoNode3D: Starting creation animation');
      setIsAnimating(true);
      
      // Start unified animation (position + opacity)
      animationStartTime.current = Date.now();
      
      // Complete after animation finishes
      globalThis.setTimeout(() => {
        console.log('ProtoNode3D: Animation complete, calling onComplete');
        setIsAnimating(false);
        onComplete(protoNode);
      }, 1100); // Slightly after 1 second animation
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
                  fontSize: `${Math.max(12, nodeSize * 0.08)}px`, // Match DreamNode3D text sizing
                  fontFamily: dreamNodeStyles.typography.fontFamily,
                  textAlign: 'center',
                  outline: 'none',
                  width: '80%',
                  height: `${Math.max(40, nodeSize * 0.08)}px`, // Explicit height for proper text display
                  padding: `${Math.max(8, nodeSize * 0.02)}px`, // Scale padding with node size for proper text height
                  pointerEvents: 'auto', // Re-enable pointer events for the input itself
                  caretColor: 'transparent' // Hide the text cursor
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
              borderRadius: '20px',
              overflow: 'hidden',
              border: '2px solid rgba(255,255,255,0.3)',
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
                border: 'none',
                background: protoNode.type === 'dream' ? getNodeColors('dream').border : 'transparent',
                color: 'white',
                fontSize: `${Math.max(14, nodeSize * 0.035)}px`, // Scale font with node size
                fontFamily: dreamNodeStyles.typography.fontFamily,
                cursor: 'pointer',
                transition: dreamNodeStyles.transitions.default
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
                border: 'none',
                background: protoNode.type === 'dreamer' ? getNodeColors('dreamer').border : 'transparent',
                color: 'white',
                fontSize: `${Math.max(14, nodeSize * 0.035)}px`, // Scale font with node size
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