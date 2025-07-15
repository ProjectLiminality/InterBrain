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
  const angularVelocity = useRef<{ axis: Vector3; speed: number }>({ axis: new Vector3(), speed: 0 });
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
    angularVelocity.current.speed = 0;
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
    
    // Store velocity for momentum calculation
    velocityHistory.current.push({
      quaternion: rotationQuaternion.clone(),
      timestamp: Date.now()
    });
    
    // Keep only recent history (last 100ms for smooth velocity estimation)
    const cutoffTime = Date.now() - 100;
    velocityHistory.current = velocityHistory.current.filter(entry => entry.timestamp > cutoffTime);
    
    // Update last position for next frame
    lastTrackballPos.current.copy(currentTrackballPos);
  };
  
  const handleMouseUp = (event: MouseEvent) => {
    event.preventDefault();
    setIsDragging(false);
    
    // Calculate final angular velocity for momentum
    if (velocityHistory.current.length >= 2) {
      // Get recent velocity samples for smoothing
      const recentSamples = velocityHistory.current.slice(-5); // Last 5 samples
      let totalAxis = new Vector3();
      let totalSpeed = 0;
      let totalWeight = 0;
      
      // Weighted average with exponential decay (more recent = higher weight)
      for (let i = 0; i < recentSamples.length - 1; i++) {
        const weight = Math.exp(-velocityFilterAlpha * (recentSamples.length - 1 - i));
        const deltaQuaternion = recentSamples[i + 1].quaternion;
        const deltaTime = (recentSamples[i + 1].timestamp - recentSamples[i].timestamp) / 1000; // Convert to seconds
        
        // Extract axis and angle from quaternion
        const axis = new Vector3(deltaQuaternion.x, deltaQuaternion.y, deltaQuaternion.z);
        const angle = 2 * Math.acos(Math.abs(deltaQuaternion.w));
        
        if (axis.length() > 0.000001 && deltaTime > 0) {
          axis.normalize();
          const speed = angle / deltaTime; // Angular speed in radians per second
          
          // Accumulate weighted averages
          totalAxis.add(axis.clone().multiplyScalar(weight * speed));
          totalSpeed += weight * speed;
          totalWeight += weight;
        }
      }
      
      // Set final angular velocity
      if (totalWeight > 0 && totalSpeed > 0) {
        angularVelocity.current.axis = totalAxis.divideScalar(totalSpeed).normalize();
        angularVelocity.current.speed = totalSpeed / totalWeight;
      } else {
        angularVelocity.current.speed = 0;
      }
    } else {
      // No momentum if insufficient data
      angularVelocity.current.speed = 0;
    }
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
  
  // Physics-based momentum with exponential damping
  useFrame((state, delta) => {
    if (isDragging || !groupRef.current) return;
    
    // Check if there's any angular velocity
    if (angularVelocity.current.speed < 0.001) {
      return; // No momentum
    }
    
    // Apply exponential damping: v(t) = v₀ * e^(-t/τ)
    // Where τ = dampingTimeConstant = 325ms
    const dampingFactor = Math.exp(-delta * 1000 / dampingTimeConstant);
    angularVelocity.current.speed *= dampingFactor;
    
    // Calculate rotation for this frame using the SAME method as drag
    const frameAngle = angularVelocity.current.speed * delta; // Angle for this frame
    const frameRotation = new Quaternion().setFromAxisAngle(angularVelocity.current.axis, frameAngle);
    
    // Apply momentum rotation using IDENTICAL mathematics to drag system
    currentRotation.current.multiplyQuaternions(frameRotation, currentRotation.current);
    groupRef.current.setRotationFromQuaternion(currentRotation.current);
  });
  
  return null; // This component only handles interactions, no visual rendering
}