import { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Group, Vector3, Quaternion } from 'three';

interface SphereRotationControlsProps {
  groupRef: React.RefObject<Group>;
}

/**
 * Virtual trackball projection using Google Earth's algorithm
 * Maps screen coordinates to 3D hemisphere following Shoemake's approach
 */
function virtualTrackballProjection(x: number, y: number, width: number, height: number): Vector3 {
  // Convert screen coordinates to normalized device coordinates [-1, 1]
  const normalizedX = (2 * x / width) - 1;
  const normalizedY = 1 - (2 * y / height); // Flip Y axis for screen coordinates
  
  // Calculate radius for hemisphere (use minimum dimension)
  const radius = Math.min(width, height) / 2;
  const sphereRadius = 1.0; // Normalized sphere radius
  
  // Scale normalized coordinates by sphere radius
  const scaledX = normalizedX * sphereRadius;
  const scaledY = normalizedY * sphereRadius;
  
  // Calculate length squared for efficient comparison
  const lengthSq = scaledX * scaledX + scaledY * scaledY;
  const radiusSq = sphereRadius * sphereRadius;
  
  let z: number;
  if (lengthSq <= radiusSq / 2) {
    // Inside sphere: use actual sphere surface z = √(r² - x² - y²)
    z = Math.sqrt(radiusSq - lengthSq);
  } else {
    // Outside sphere: use Bell's hyperbolic sheet z = r²/2 / √(x² + y²)
    z = (radiusSq / 2) / Math.sqrt(lengthSq);
  }
  
  return new Vector3(scaledX, scaledY, z).normalize();
}

/**
 * Calculate quaternion rotation between two 3D points on virtual trackball
 * Uses cross product for axis and dot product for angle (Google Earth approach)
 */
function calculateTrackballRotation(from: Vector3, to: Vector3): Quaternion {
  // Calculate rotation axis using cross product
  const axis = new Vector3().crossVectors(from, to);
  
  // Calculate rotation angle using dot product: θ = cos⁻¹(p·q / |p||q|)
  const angle = from.angleTo(to);
  
  // Handle parallel vectors (no rotation needed)
  if (axis.lengthSq() < 0.000001) {
    return new Quaternion(0, 0, 0, 1); // Identity quaternion
  }
  
  // Create quaternion from axis-angle: q = [cos(θ/2), sin(θ/2) * n]
  axis.normalize();
  return new Quaternion().setFromAxisAngle(axis, angle);
}

/**
 * Google Earth style virtual trackball rotation controls
 * 
 * Features:
 * - Virtual trackball algorithm with quaternion mathematics
 * - Physics-based momentum with exponential damping (325ms time constant)
 * - Velocity estimation with low-pass filtering
 * - No gimbal lock, smooth rotation at all orientations
 */
export default function SphereRotationControls({ groupRef }: SphereRotationControlsProps) {
  const { gl } = useThree();
  const canvas = gl.domElement;
  
  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const lastTrackballPos = useRef<Vector3>(new Vector3());
  
  // Quaternion rotation state (prevents accumulation errors)
  const currentRotation = useRef<Quaternion>(new Quaternion(0, 0, 0, 1));
  
  // Physics-based momentum (Google Earth style)
  const angularVelocity = useRef<Quaternion>(new Quaternion(0, 0, 0, 1));
  const dampingTimeConstant = 325; // milliseconds (based on iOS momentum scrolling research)
  
  // Velocity estimation with moving average
  const velocityHistory = useRef<{ quaternion: Quaternion; timestamp: number }[]>([]);
  const velocityFilterAlpha = 0.2; // Low-pass filter constant
  
  // Mouse event handlers
  const handleMouseDown = (event: MouseEvent) => {
    event.preventDefault();
    setIsDragging(true);
    
    // Get canvas bounding rect for accurate coordinate calculation
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Project mouse position to virtual trackball
    lastTrackballPos.current = virtualTrackballProjection(mouseX, mouseY, rect.width, rect.height);
    
    // Stop any existing momentum
    angularVelocity.current.set(0, 0, 0, 1);
    velocityHistory.current = [];
  };
  
  const handleMouseMove = (event: MouseEvent) => {
    if (!isDragging || !groupRef.current) return;
    
    // Get canvas bounding rect for accurate coordinate calculation
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Project current mouse position to virtual trackball
    const currentTrackballPos = virtualTrackballProjection(mouseX, mouseY, rect.width, rect.height);
    
    // Calculate rotation quaternion using Google Earth algorithm (inverted for natural drag)
    const rotationQuaternion = calculateTrackballRotation(currentTrackballPos, lastTrackballPos.current);
    
    // Apply rotation to current rotation state (quaternion multiplication)
    currentRotation.current.multiplyQuaternions(rotationQuaternion, currentRotation.current);
    
    // Set group rotation from quaternion (prevents accumulation errors)
    groupRef.current.setRotationFromQuaternion(currentRotation.current);
    
    // Velocity storage disabled for debugging
    // velocityHistory.current.push({...})
    
    // Update last position for next frame
    lastTrackballPos.current.copy(currentTrackballPos);
  };
  
  const handleMouseUp = (event: MouseEvent) => {
    event.preventDefault();
    setIsDragging(false);
    
    // Momentum calculation disabled for debugging
    // angularVelocity.current.set(0, 0, 0, 1);
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
  
  // Momentum disabled for debugging
  useFrame((state, delta) => {
    // Momentum system disabled
    return;
  });
  
  return null; // This component only handles interactions, no visual rendering
}