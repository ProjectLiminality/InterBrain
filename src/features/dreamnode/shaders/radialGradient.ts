/**
 * Radial Gradient Shader
 *
 * Creates a circular fade-to-black effect at the edges of the DreamTalk.
 * Used for WebGL-native DreamTalk rendering.
 */

import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';

// Vertex shader - standard UV pass-through
export const radialGradientVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fragment shader - applies radial gradient and circular clipping
export const radialGradientFragmentShader = /* glsl */ `
  uniform sampler2D mediaTexture;
  uniform float fadeStart;
  uniform float fadeEnd;
  uniform vec3 fadeColor;
  uniform float opacity;

  varying vec2 vUv;

  void main() {
    // Sample the media texture
    vec4 mediaColor = texture2D(mediaTexture, vUv);

    // Calculate distance from center (0 at center, 1 at edge)
    // UV coords are 0-1, so center is at (0.5, 0.5)
    vec2 center = vec2(0.5, 0.5);
    float dist = length(vUv - center) * 2.0; // 0 at center, 1 at edge

    // Discard pixels outside the circle
    if (dist > 1.0) {
      discard;
    }

    // Calculate fade factor using smoothstep
    // fadeStart: where fade begins (e.g., 0.7 = 70% from center)
    // fadeEnd: where fade completes (e.g., 1.0 = at edge)
    float fadeAlpha = smoothstep(fadeStart, fadeEnd, dist);

    // Mix media color with fade color (typically black)
    vec3 finalColor = mix(mediaColor.rgb, fadeColor, fadeAlpha);

    // Output with opacity
    gl_FragColor = vec4(finalColor, mediaColor.a * opacity);
  }
`;

// Default uniforms for the shader
export const radialGradientUniforms = {
  mediaTexture: { value: null as THREE.Texture | null },
  fadeStart: { value: 0.7 },    // Fade starts at 70% from center
  fadeEnd: { value: 1.0 },      // Fade completes at edge
  fadeColor: { value: new THREE.Color(0x000000) }, // Fade to black
  opacity: { value: 1.0 }
};

// Create a reusable shader material using drei's shaderMaterial helper
export const RadialGradientMaterial = shaderMaterial(
  {
    mediaTexture: null,
    fadeStart: 0.7,
    fadeEnd: 1.0,
    fadeColor: new THREE.Color(0x000000),
    opacity: 1.0
  },
  radialGradientVertexShader,
  radialGradientFragmentShader
);

// Extend JSX namespace for TypeScript
import type { JSX as ReactJSX } from 'react';
declare global {
  namespace JSX {
    interface IntrinsicElements {
      radialGradientMaterial: ReactJSX.IntrinsicElements['meshBasicMaterial'] & {
          mediaTexture?: THREE.Texture | null;
          fadeStart?: number;
          fadeEnd?: number;
          fadeColor?: THREE.Color;
          opacity?: number;
          transparent?: boolean;
          side?: THREE.Side;
        };
    }
  }
}

export default RadialGradientMaterial;
