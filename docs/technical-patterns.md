# Technical Patterns from Prototype

This document contains proven algorithms and technical patterns extracted from the InterBrain prototype.

## Spatial Algorithms (Proven Working)

### Fibonacci Sphere Distribution

```javascript
const goldenRatio = (1 + Math.sqrt(5)) / 2;
const SPHERE_RADIUS = 1000;

// For each node at index i:
const phi = Math.acos(1 - 2 * i / (totalNodes + 1));
const theta = 2 * Math.PI * i / goldenRatio;
const x = SPHERE_RADIUS * Math.sin(phi) * Math.cos(theta);
const y = SPHERE_RADIUS * Math.sin(phi) * Math.sin(theta);
const z = SPHERE_RADIUS * Math.cos(phi);
```

### Honeycomb Layout for Search Results

```javascript
const calculateHoneycombPosition = (index, totalNodes) => {
  if (index === 0) return [0, 0, 0]; // Center position
  
  // Calculate ring and position within ring
  let ring = 1;
  let indexInRing = index;
  let totalNodesInRing = 6 * ring;
  
  while (indexInRing > totalNodesInRing) {
    indexInRing -= totalNodesInRing;
    ring += 1;
    totalNodesInRing = 6 * ring;
  }
  
  // Convert to hexagonal coordinates
  const x = 1.5 * q;
  const y = Math.sqrt(3) * (r + q / 2);
  
  return [x, y, ring];
};

const calculateNodeScale = (ring) => {
  return Math.max(0.25, 2 / (2 ** ring));
};
```

### Dynamic View Scaling

```javascript
const MAX_SCALE = 50;
const MIN_SCALE = 1;

// Scale based on distance from screen center
const calculateViewScaleFactor = (node, camera, size) => {
  const screenPosition = projectToScreen(node.position, camera, size);
  const distanceFromCenter = calculateDistanceFromCenter(screenPosition, size);
  const normalizedDistance = distanceFromCenter / maxDistance;
  const scale = MAX_SCALE * (1 - Math.min(1, normalizedDistance * 2));
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
};
```

## Visual Design System

### Color Palette

```javascript
const COLORS = {
  PRIMARY_RED: "#FF644E",
  PRIMARY_BLUE: "#00a2ff", 
  SPACE_BLACK: "#000000",
  TEXT_WHITE: "#FFFFFF",
  SCROLLBAR_GRAY: "#4a4a4a"
};
```

### Layout Constants

- Full viewport immersion: `100vw × 100vh`
- Fixed positioning with `overflow: hidden`
- Black space background for cosmic feel
- Custom dark scrollbars

### Layout State Management

**Three Primary States**:
1. **Spherical Layout**: Default constellation view using Fibonacci distribution
2. **Search Results**: Honeycomb pattern for relevant nodes, distant circle for others
3. **Focused Node**: Centered node with related nodes in close circle, unrelated in distant circle

**Animation Patterns**:
- Smooth transitions between layout states
- Camera reset on layout changes
- Scale interpolation based on screen position

## DreamTalk Component Implementation (Proven Working)

### Core Image Fitting Algorithm

```javascript
// Proven circular image fitting solution
const containerDimensions = { width: size, height: size }; // Square container
const mediaContainer = {
  width: `${dimensions.width * 0.8}px`,    // 80% of container
  height: `${dimensions.height * 0.8}px`,  // 80% of container
  position: 'absolute',
  top: '50%', left: '50%',
  transform: 'translate(-50%, -50%)',      // Perfect center
  borderRadius: '50%',                     // Circular crop
  overflow: 'hidden'
};

const mediaStyle = {
  width: '100%', height: '100%',
  objectFit: 'cover'                       // Crop to fill circle
};

// Radial gradient overlay for smooth circular fade
const circularFadeOverlay = {
  background: 'radial-gradient(circle, rgba(0,0,0,0) 50%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,1) 70%)',
  borderRadius: '49%'  // Slightly smaller for smooth edge
};
```

### Multi-Media Support Pattern

```javascript
const renderMedia = (mediaData) => {
  const commonStyle = { width: '100%', height: '100%', objectFit: 'cover' };
  
  switch (mediaData.type) {
    case 'image/jpeg': case 'image/png': case 'image/gif': case 'image/webp':
      return <img src={mediaData.data} style={commonStyle} />;
    case 'audio/mpeg': case 'audio/wav':
      return <div style={{...commonStyle, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <audio controls src={mediaData.data} style={{width: '90%', maxWidth: '200px'}} />
      </div>;
    case 'video/mp4': case 'video/webm':
      return <video controls src={mediaData.data} style={commonStyle} />;
    default: return null;
  }
};
```

### Carousel Navigation Logic

```javascript
// Multiple DreamTalk symbols per DreamNode
const [currentMediaIndex, setCurrentMediaIndex] = useState(0);

const handlePrevMedia = () => {
  setCurrentMediaIndex(prev => prev > 0 ? prev - 1 : mediaArray.length - 1);
};

const handleNextMedia = () => {
  setCurrentMediaIndex(prev => prev < mediaArray.length - 1 ? prev + 1 : 0);
};
```

### Visual Design Patterns

```javascript
// Color scheme from constants
const COLORS = { BLACK: '#000000', WHITE: '#FFFFFF', BLUE: '#00a2ff' };

// Circular container with border
const dreamNodeStyle = {
  borderRadius: '50%',
  border: `5px solid ${borderColor}`,  // Blue for Dreams, Red for Dreamers
  background: BLACK,
  overflow: 'hidden'
};

// Hover states with smooth transitions
const hoverOverlay = {
  background: 'rgba(0, 0, 0, 0.7)',
  transition: 'opacity 0.3s ease'
};
```

### Responsive Sizing Pattern

```javascript
// Dynamic container sizing
useEffect(() => {
  const updateDimensions = () => {
    const container = containerRef.current;
    const size = Math.min(container.offsetWidth, container.offsetHeight);
    setDimensions({ width: size, height: size });
  };
  
  updateDimensions();
  window.addEventListener('resize', updateDimensions);
  return () => window.removeEventListener('resize', updateDimensions);
}, []);
```

### Empty State Handling

```javascript
// Fallback when no media exists
const emptyState = {
  background: 'rgba(0, 0, 0, 0.7)',
  display: 'flex', flexDirection: 'column', 
  justifyContent: 'center', alignItems: 'center',
  opacity: !hasMedia ? 1 : 0,
  transition: 'opacity 0.3s ease'
};
```