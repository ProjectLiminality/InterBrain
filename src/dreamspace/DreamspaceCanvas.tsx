import { Canvas } from '@react-three/fiber';

export default function DreamspaceCanvas() {
  return (
    <div className="dreamspace-canvas-container">
      <Canvas
        camera={{
          position: [0, 0, 1000],
          fov: 75,
          near: 0.1,
          far: 10000
        }}
        style={{
          width: '100%',
          height: '100%',
          background: '#000000'
        }}
      >
        {/* Empty scene - foundation for future DreamNode objects */}
        {/* Camera is automatically created by R3F based on camera prop */}
      </Canvas>
    </div>
  );
}