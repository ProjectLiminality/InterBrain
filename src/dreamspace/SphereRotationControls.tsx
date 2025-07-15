import { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Group } from 'three';

interface SphereRotationControlsProps {
  groupRef: React.RefObject<Group>;
}

/**
 * Handles mouse drag interaction for rotating the DreamNode sphere
 * 
 * Features:
 * - Mouse drag rotates the entire group (inverted controls for natural feel)
 * - Momentum/physics for natural sphere interaction
 * - Smooth interpolation for 60fps performance
 * - Click and drag only (no pointer lock needed)
 */
export default function SphereRotationControls({ groupRef }: SphereRotationControlsProps) {
  const { gl } = useThree();
  const canvas = gl.domElement;
  
  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  
  // Rotation velocity for momentum
  const rotationVelocity = useRef({ x: 0, y: 0 });
  const damping = 0.95; // Momentum decay factor
  
  // Sensitivity for mouse movement
  const sensitivity = 0.005;
  
  // Mouse event handlers
  const handleMouseDown = (event: MouseEvent) => {
    event.preventDefault();
    setIsDragging(true);
    lastMousePos.current = { x: event.clientX, y: event.clientY };
    
    // Stop any existing momentum
    rotationVelocity.current = { x: 0, y: 0 };
  };
  
  const handleMouseMove = (event: MouseEvent) => {
    if (!isDragging || !groupRef.current) return;
    
    const deltaX = event.clientX - lastMousePos.current.x;
    const deltaY = event.clientY - lastMousePos.current.y;
    
    // Inverted controls for natural sphere dragging feel
    // Drag right → sphere rotates left (like dragging a physical sphere)
    groupRef.current.rotation.y -= deltaX * sensitivity;
    groupRef.current.rotation.x -= deltaY * sensitivity;
    
    // Update velocity for momentum
    rotationVelocity.current.x = -deltaY * sensitivity * 0.2;
    rotationVelocity.current.y = -deltaX * sensitivity * 0.2;
    
    lastMousePos.current = { x: event.clientX, y: event.clientY };
  };
  
  const handleMouseUp = (event: MouseEvent) => {
    event.preventDefault();
    setIsDragging(false);
  };
  
  // Prevent context menu on right click
  const handleContextMenu = (event: MouseEvent) => {
    event.preventDefault();
  };
  
  // Set up mouse event listeners
  useEffect(() => {
    const handleMouseLeave = () => {
      setIsDragging(false);
    };
    
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [isDragging]); // Re-run when isDragging changes
  
  // Apply momentum when not dragging
  useFrame(() => {
    if (!groupRef.current) return;
    
    // Apply momentum when not actively dragging
    if (!isDragging) {
      groupRef.current.rotation.x += rotationVelocity.current.x;
      groupRef.current.rotation.y += rotationVelocity.current.y;
      
      // Apply damping to slow down momentum
      rotationVelocity.current.x *= damping;
      rotationVelocity.current.y *= damping;
      
      // Stop tiny movements to prevent jitter
      if (Math.abs(rotationVelocity.current.x) < 0.001) {
        rotationVelocity.current.x = 0;
      }
      if (Math.abs(rotationVelocity.current.y) < 0.001) {
        rotationVelocity.current.y = 0;
      }
    }
  });
  
  return null; // This component only handles interactions, no visual rendering
}