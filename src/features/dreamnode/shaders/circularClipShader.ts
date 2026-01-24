/**
 * Circular Clip Shader - Content Layer
 *
 * Renders texture with:
 * - Circular cutout (discard outside radius 0.5)
 * - Aspect ratio correction (cover fit)
 * - Border ring (type-colored)
 * - Fade-to-black radial gradient
 */

import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D map;
  uniform bool hasTexture;
  uniform float aspectRatio; // texture width / height
  uniform vec3 borderColor;  // RGB color for border ring (already in linear space)
  uniform float borderWidth; // Border width as fraction of radius (0.0-0.5)

  // sRGB <-> Linear conversion functions
  vec3 sRGBToLinear(vec3 srgb) {
    return pow(srgb, vec3(2.2));
  }

  vec3 linearToSRGB(vec3 linear) {
    return pow(linear, vec3(1.0 / 2.2));
  }

  void main() {
    // Calculate distance from center (0.5, 0.5)
    vec2 center = vec2(0.5, 0.5);
    float dist = distance(vUv, center);

    // Discard pixels outside the circle
    if (dist > 0.5) {
      discard;
    }

    // Border ring: outer edge of circle
    // borderWidth is fraction of radius, so border starts at (0.5 - borderWidth)
    // Extend border to cover the softened edge zone
    float borderStart = 0.5 - borderWidth;
    if (dist > borderStart) {
      gl_FragColor = vec4(borderColor, 1.0);
      return;
    }

    // Content area (inside border)
    // Normalize distance to content area (0 at center, 1 at border edge)
    float contentRadius = borderStart;
    float normalizedDist = dist / contentRadius;

    // Get texture color
    vec4 texColor;
    if (hasTexture) {
      // Apply "cover" fit (same as CSS object-fit: cover)
      vec2 uv = vUv;

      // Remap UVs to content area (0 to borderStart maps to 0 to 1)
      uv = (uv - center) / (contentRadius * 2.0) + center;

      if (aspectRatio > 1.0) {
        // Texture is wider than tall (e.g., 16:9)
        float cropWidth = 1.0 / aspectRatio;
        float offset = (1.0 - cropWidth) / 2.0;
        uv.x = offset + uv.x * cropWidth;
      } else if (aspectRatio < 1.0) {
        // Texture is taller than wide (e.g., 9:16)
        float cropHeight = aspectRatio;
        float offset = (1.0 - cropHeight) / 2.0;
        uv.y = offset + uv.y * cropHeight;
      }

      texColor = texture2D(map, uv);
    } else {
      // Solid black when no texture
      texColor = vec4(0.0, 0.0, 0.0, 1.0);
    }

    // Apply fade-to-black radial gradient (vignette effect)
    // CSS reference: radial-gradient(circle, rgba(0,0,0,0) 50%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,1) 70%)
    // fadeEnd stays at edge, but start/mid stretched toward center by factor 2
    float fadeStart = contentRadius * 0.40;  // Start fade at 40% (was 70%, stretched 2x toward center)
    float fadeMid = contentRadius * 0.70;    // 50% black at 70% (was 85%, stretched 2x toward center)
    float fadeEnd = contentRadius * 0.97;    // Fully black at 97% (unchanged - right at border)

    float fadeAmount = 0.0;
    if (dist > fadeStart) {
      if (dist < fadeMid) {
        // 0% to 50% fade
        fadeAmount = smoothstep(fadeStart, fadeMid, dist) * 0.5;
      } else if (dist < fadeEnd) {
        // 50% to 100% fade
        fadeAmount = 0.5 + smoothstep(fadeMid, fadeEnd, dist) * 0.5;
      } else {
        // Fully black beyond fadeEnd
        fadeAmount = 1.0;
      }
    }

    // Mix texture with black based on fade amount
    vec3 finalColor = mix(texColor.rgb, vec3(0.0), fadeAmount);

    // Apply same color space compensation as border color
    // (linearToSRGB counteracts renderer's gamma correction)
    gl_FragColor = vec4(linearToSRGB(finalColor), 1.0);
  }
`;

// Default border colors from dreamNodeStyles
// Convert from linear to sRGB to counteract renderer's gamma correction
const BORDER_COLORS = {
  dream: new THREE.Color('#479FF8').convertLinearToSRGB(),   // Blue
  dreamer: new THREE.Color('#FF6B6B').convertLinearToSRGB()  // Red
};

// Border width as fraction of UV radius (0.5)
// Node diameter = 240px, border = 25px
// Border as fraction of diameter = 25/240 = 0.104
// In UV space (diameter = 1.0), border width = 0.104 / 2 = 0.052
// But visually this appears too thin - calibrated to 0.026 to match HTML appearance
const DEFAULT_BORDER_WIDTH = 0.026;

/**
 * Create circular clip material with border and gradient
 */
export function createCircularClipMaterial(
  texture: THREE.Texture | null = null,
  nodeType: 'dream' | 'dreamer' = 'dream'
): THREE.ShaderMaterial {
  // Calculate aspect ratio from texture if available
  let aspectRatio = 1.0;
  if (texture?.image) {
    const img = texture.image as globalThis.HTMLImageElement | globalThis.HTMLVideoElement;
    const width = img.width || (img as globalThis.HTMLVideoElement).videoWidth || 1;
    const height = img.height || (img as globalThis.HTMLVideoElement).videoHeight || 1;
    aspectRatio = width / height;
  }

  const borderColor = BORDER_COLORS[nodeType];

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      map: { value: texture },
      hasTexture: { value: texture !== null },
      aspectRatio: { value: aspectRatio },
      borderColor: { value: new THREE.Vector3(borderColor.r, borderColor.g, borderColor.b) },
      borderWidth: { value: DEFAULT_BORDER_WIDTH }
    },
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true
  });
}

/**
 * Update the texture and aspect ratio
 */
export function updateCircularClipTexture(
  material: THREE.ShaderMaterial,
  texture: THREE.Texture | null
): void {
  material.uniforms.map.value = texture;
  material.uniforms.hasTexture.value = texture !== null;

  // Update aspect ratio from new texture
  if (texture?.image) {
    const img = texture.image as globalThis.HTMLImageElement | globalThis.HTMLVideoElement;
    const width = img.width || (img as globalThis.HTMLVideoElement).videoWidth || 1;
    const height = img.height || (img as globalThis.HTMLVideoElement).videoHeight || 1;
    const aspectRatio = width / height;
    material.uniforms.aspectRatio.value = aspectRatio;
  } else {
    material.uniforms.aspectRatio.value = 1.0;
  }

  material.needsUpdate = true;
}

/**
 * Update border color (for node type changes)
 */
export function updateBorderColor(
  material: THREE.ShaderMaterial,
  nodeType: 'dream' | 'dreamer'
): void {
  const borderColor = BORDER_COLORS[nodeType];
  material.uniforms.borderColor.value = new THREE.Vector3(borderColor.r, borderColor.g, borderColor.b);
  material.needsUpdate = true;
}

export default createCircularClipMaterial;
