import React, { useState, useRef, useEffect } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { dreamNodeStyles, getNodeColors, getNodeGlow, getMediaContainerStyle, getMediaOverlayStyle } from '../../dreamspace/dreamNodeStyles';
import { useInterBrainStore } from '../../store/interbrain-store';

interface SearchNode3DProps {
  position: [number, number, number];
  onSave: (query: string, dreamTalkFile?: globalThis.File, additionalFiles?: globalThis.File[]) => void;
  onCancel: () => void;
}

/**
 * SearchNode3D - Search interface that visually appears as a Dream-type DreamNode
 * 
 * Extends ProtoNode3D architecture for consistent UI/UX. The search query becomes
 * the title input, and supports drag-and-drop for multi-modal search functionality.
 * 
 * Animation: Spawns from sphere surface (5000 units) and flies to focus position (50 units)
 * using easeOutQuart over 1 second to match spatial orchestration timing.
 */
export default function SearchNode3D({ 
  position,
  onSave,
  onCancel
}: SearchNode3DProps) {
  const titleInputRef = useRef<globalThis.HTMLInputElement>(null);
  const fileInputRef = useRef<globalThis.HTMLInputElement>(null);
  
  // Get search state from store  
  const { searchInterface, setSearchQuery } = useInterBrainStore();
  
  // Local UI state for immediate responsiveness
  const [localQuery, setLocalQuery] = useState(searchInterface.currentQuery);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<string | null>(null);
  const [dreamTalkFile, setDreamTalkFile] = useState<globalThis.File | null>(null);
  const [additionalFiles, setAdditionalFiles] = useState<globalThis.File[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Debounced store update - only update store 300ms after user stops typing
  const debounceTimeoutRef = React.useRef<number | null>(null);
  
  // Animation state - handles both spawn and save animations
  const [animatedPosition, setAnimatedPosition] = useState<[number, number, number]>([
    position[0], 
    position[1], 
    -5000 // Start at sphere surface distance
  ]);
  const [animatedOpacity, setAnimatedOpacity] = useState<number>(1.0);
  const [animatedUIOpacity, setAnimatedUIOpacity] = useState<number>(0.0); // UI starts hidden during spawn
  const animationStartTime = useRef<number | null>(Date.now()); // Start animation immediately
  const [animationType, setAnimationType] = useState<'spawn' | 'save'>('spawn');
  
  // Animation handler: supports both spawn and save animations
  useFrame(() => {
    if (!animationStartTime.current) return;
    
    const elapsed = Date.now() - animationStartTime.current;
    const progress = Math.min(elapsed / 1000, 1); // 1 second duration
    
    if (animationType === 'spawn') {
      // Spawn animation: 5000 → 50 units using easeOutQuart
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      
      // Animate position: [0,0,-5000] → [0,0,-50]
      const startZ = -5000;
      const endZ = position[2]; // Target position (-50)
      const newZ = startZ + (endZ - startZ) * easeOutQuart;
      setAnimatedPosition([position[0], position[1], newZ]);
      
      // Keep main node fully visible during spawn
      setAnimatedOpacity(1.0);
      
      // Animate UI elements: 0.0 → 1.0 (fade in UI controls after spawn)
      const startUIOpacity = 0.0;
      const endUIOpacity = 1.0;
      const newUIOpacity = startUIOpacity + (endUIOpacity - startUIOpacity) * easeOutQuart;
      setAnimatedUIOpacity(newUIOpacity);
      
      // Complete spawn animation
      if (progress >= 1) {
        animationStartTime.current = null;
        setAnimatedPosition(position);
        setAnimatedOpacity(1.0);
        setAnimatedUIOpacity(1.0);
        
        // Auto-focus search input after spawn animation
        globalThis.setTimeout(() => {
          titleInputRef.current?.focus();
        }, 50);
      }
    } else if (animationType === 'save') {
      // Save animation: current position → [0,0,-75] using easeInOut (like ProtoNode)
      const easeInOut = progress < 0.5 
        ? 2 * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      
      // Animate position: [0,0,-50] → [0,0,-75]
      const startZ = position[2]; // -50 (current focus position)
      const endZ = -75; // Move away like ProtoNode
      const newZ = startZ + (endZ - startZ) * easeInOut;
      setAnimatedPosition([position[0], position[1], newZ]);
      
      // Keep main node opacity at 1.0 (no fade)
      setAnimatedOpacity(1.0);
      
      // Animate UI elements: 1.0 → 0.0 (fade out buttons/controls)
      const startUIOpacity = 1.0;
      const endUIOpacity = 0.0;
      const newUIOpacity = startUIOpacity + (endUIOpacity - startUIOpacity) * easeInOut;
      setAnimatedUIOpacity(newUIOpacity);
      
      // Complete save animation
      if (progress >= 1) {
        animationStartTime.current = null;
        setAnimatedPosition([position[0], position[1], endZ]);
        setAnimatedOpacity(1.0);
        setAnimatedUIOpacity(endUIOpacity);
      }
    }
  });
  
  // Auto-focus on mount (fallback if animation completes before useEffect)
  useEffect(() => {
    if (!animationStartTime.current) {
      globalThis.setTimeout(() => {
        titleInputRef.current?.focus();
      }, 50);
    }
  }, []);
  
  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        globalThis.clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);
  
  // Sync local query with store query (for external resets)
  useEffect(() => {
    setLocalQuery(searchInterface.currentQuery);
  }, [searchInterface.currentQuery]);
  
  // Dream-type node styling for search node (blue)
  const nodeColors = getNodeColors('dream');
  const nodeSize = dreamNodeStyles.dimensions.nodeSizeThreeD;
  const borderWidth = dreamNodeStyles.dimensions.borderWidth;
  
  // Debounced store update function
  const updateStoreQuery = React.useCallback((query: string) => {
    setSearchQuery(query);
  }, [setSearchQuery]);
  
  // Event handlers - immediate local state update, debounced store update
  const handleQueryChange = (e: React.ChangeEvent<globalThis.HTMLInputElement>) => {
    const query = e.target.value;
    
    // IMMEDIATE: Update local state for responsive UI
    setLocalQuery(query);
    
    // DEBOUNCED: Update store only after user stops typing for 300ms
    if (debounceTimeoutRef.current) {
      globalThis.clearTimeout(debounceTimeoutRef.current);
    }
    
    debounceTimeoutRef.current = globalThis.setTimeout(() => {
      updateStoreQuery(query);
    }, 300) as unknown as number;
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent bubbling to DreamspaceCanvas
    setIsDragOver(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent bubbling to DreamspaceCanvas
    setIsDragOver(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation(); // CRITICAL: Prevent bubbling to DreamspaceCanvas
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const file = files[0];
    
    if (file) {
      if (isValidMediaFile(file)) {
        // Set as DreamTalk media
        setDreamTalkFile(file);
        const previewUrl = globalThis.URL.createObjectURL(file);
        setPreviewMedia(previewUrl);
      } else {
        // Add as additional file
        setAdditionalFiles(prev => [...prev, file]);
      }
    }
  };
  
  const handleFileSelect = (e: React.ChangeEvent<globalThis.HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (isValidMediaFile(file)) {
        setDreamTalkFile(file);
        const previewUrl = globalThis.URL.createObjectURL(file);
        setPreviewMedia(previewUrl);
      }
    }
  };
  
  const handleSave = () => {
    if (localQuery.trim()) {
      setIsAnimating(true);
      
      // Switch to save animation and start timing
      setAnimationType('save');
      animationStartTime.current = Date.now();
      
      // Mark that save animation is in progress (keeps SearchNode rendered)
      const store = useInterBrainStore.getState();
      store.setSearchSaving(true);
      
      // IMMEDIATELY trigger constellation return to run in parallel with save animation
      // This makes all nodes start moving from sphere surface to constellation NOW
      store.setSpatialLayout('constellation');
      
      // Complete exactly when animation finishes (node will be fully faded out)
      globalThis.setTimeout(() => {
        setIsAnimating(false);
        onSave(localQuery, dreamTalkFile || undefined, additionalFiles);
        
        // Keep SearchNode rendered for 200ms longer to ensure temporal overlap
        // This prevents flicker by ensuring new DreamNode is fully rendered before unmount
        globalThis.setTimeout(() => {
          store.setSearchSaving(false); // Now safe to unmount SearchNode
        }, 200); // Extended overlap to guarantee DreamNode is rendered
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
      handleSave();
    }
    // Note: Escape handling is now managed by global DreamspaceCanvas handler
  };
  
  const isSaveDisabled = !localQuery.trim() || isAnimating;
  
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
          data-ui-element="search-node"
          onMouseDown={(e) => e.stopPropagation()} // Prevent sphere rotation
          onMouseMove={(e) => e.stopPropagation()} // Prevent sphere rotation
          onMouseUp={(e) => e.stopPropagation()} // Prevent sphere rotation
          onClick={(e) => e.stopPropagation()} // Prevent any click propagation
        >
          {/* Main Search Node Circle - Blue Dream-type styling */}
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
              boxShadow: getNodeGlow('dream', 15), // Blue dream glow
              fontFamily: dreamNodeStyles.typography.fontFamily
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* DreamTalk Media Area or Drop Zone */}
            {previewMedia || dreamTalkFile ? (
              <div
                style={{
                  ...getMediaContainerStyle(),
                  opacity: animatedOpacity
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
                  zIndex: 1, // Lower z-index than text input
                  pointerEvents: 'auto',
                  opacity: animatedUIOpacity // Fade in with other UI
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
                    pointerEvents: 'none' // Let parent handle clicks
                  }}
                >
                  <div>Drop image here</div>
                  <div>or click to browse</div>
                </div>
              </div>
            )}
            
            {/* Text Input - Clean, rectangular, always positioned in center */}
            <input
              ref={titleInputRef}
              type="text"
              value={localQuery}
              onChange={handleQueryChange}
              placeholder="Search query..."
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: `${Math.max(120, nodeSize * 0.7)}px`, // Responsive width
                height: `${Math.max(32, nodeSize * 0.12)}px`, // Adequate height for descenders
                padding: `${Math.max(8, nodeSize * 0.02)}px ${Math.max(12, nodeSize * 0.03)}px`,
                background: 'transparent', // Completely transparent
                border: 'none', // No border
                borderRadius: '4px', // Rectangular with subtle rounding
                color: dreamNodeStyles.colors.text.primary,
                fontSize: `${Math.max(14, nodeSize * 0.08)}px`,
                fontFamily: dreamNodeStyles.typography.fontFamily,
                textAlign: 'center',
                outline: 'none',
                boxShadow: 'none',
                zIndex: 10, // Above file selection area
                pointerEvents: 'auto',
                cursor: 'text'
              }}
              onClick={(e) => e.stopPropagation()}
            />
            
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,.pdf,.txt,.md,.doc,.docx"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>
          
          {/* Additional Files Indicator */}
          {additionalFiles.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: `${nodeSize + 10}px`,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(100, 100, 255, 0.8)',
                color: 'white',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                whiteSpace: 'nowrap',
                opacity: animatedUIOpacity
              }}
            >
              {additionalFiles.length} file{additionalFiles.length > 1 ? 's' : ''} added
            </div>
          )}
          
          {/* Action Buttons */}
          <div
            style={{
              position: 'absolute',
              top: `${nodeSize + (additionalFiles.length > 0 ? 60 : 40)}px`,
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
          </div>
        </div>
      </Html>
    </group>
  );
}

/**
 * Validate media file types for DreamTalk (reused from ProtoNode3D)
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