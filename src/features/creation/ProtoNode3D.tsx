import React, { useState, useRef, useCallback } from 'react';
import { Html } from '@react-three/drei';
import { Group } from 'three';
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
  const groupRef = useRef<Group>(null);
  const titleInputRef = useRef<globalThis.HTMLInputElement>(null);
  const fileInputRef = useRef<globalThis.HTMLInputElement>(null);
  
  // Get creation state from store
  const { creationState, updateProtoNode, setValidationErrors } = useInterBrainStore();
  const { protoNode, validationErrors } = creationState;
  
  // Local UI state
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentOpacity, setCurrentOpacity] = useState<number>(dreamNodeStyles.states.creation.opacity);
  
  // Manual animation state
  const [animatedPosition, setAnimatedPosition] = useState<[number, number, number]>(position);
  const animationRef = useRef<{
    startTime: number;
    startPosition: [number, number, number];
    endPosition: [number, number, number];
    duration: number;
    isAnimating: boolean;
  } | null>(null);
  
  // useFrame for smooth manual animation
  useFrame(() => {
    if (!animationRef.current || !animationRef.current.isAnimating) return;
    
    const { startTime, startPosition, endPosition, duration } = animationRef.current;
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Ease-in-out function
    const easeInOut = progress < 0.5 
      ? 2 * progress * progress 
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    
    // Interpolate position
    const newPosition: [number, number, number] = [
      startPosition[0] + (endPosition[0] - startPosition[0]) * easeInOut,
      startPosition[1] + (endPosition[1] - startPosition[1]) * easeInOut,
      startPosition[2] + (endPosition[2] - startPosition[2]) * easeInOut,
    ];
    
    setAnimatedPosition(newPosition);
    
    // Stop animation when complete
    if (progress >= 1) {
      animationRef.current.isAnimating = false;
      setAnimatedPosition(endPosition);
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
      console.log('ProtoNode3D: handleCreate called, starting animation');
      // Start animation from current position (25 units) to final position (75 units)
      setIsAnimating(true);
      
      // Calculate final position (move Z from -25 to -75, keeping X and Y same)
      const finalPosition: [number, number, number] = [
        position[0], 
        position[1], 
        -75  // Move further from camera
      ];
      
      // Start position animation
      console.log('ProtoNode3D: Starting manual position animation from', position, 'to', finalPosition);
      console.log('ProtoNode3D: Current animated position:', animatedPosition);
      
      // Start manual animation
      animationRef.current = {
        startTime: Date.now(),
        startPosition: position,
        endPosition: finalPosition,
        duration: 1000, // 1 second
        isAnimating: true
      };
      
      // After animation completes, call onComplete
      // The parent will handle hiding the proto-node after node creation
      globalThis.setTimeout(() => {
        console.log('ProtoNode3D: Animation complete, calling onComplete');
        setIsAnimating(false);
        onComplete(protoNode);
      }, 1100); // Slightly after animation completes to ensure smooth transition
      
      // Animate opacity from 0.7 to 1.0 over 1 second using simple interpolation
      const startOpacity = dreamNodeStyles.states.creation.opacity;
      const endOpacity = 1.0;
      const duration = 1000; // 1 second
      const startTime = Date.now();
      
      const animateOpacity = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease-in-out function (similar to React Spring's default)
        const easeInOut = progress < 0.5 
          ? 2 * progress * progress 
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        const newOpacity = startOpacity + (endOpacity - startOpacity) * easeInOut;
        setCurrentOpacity(newOpacity);
        
        if (progress < 1) {
          globalThis.requestAnimationFrame(animateOpacity);
        }
      };
      
      globalThis.requestAnimationFrame(animateOpacity);
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
    <group 
      ref={groupRef} 
      position={animatedPosition}
    >
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
              opacity: currentOpacity,
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
              gap: '12px'
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