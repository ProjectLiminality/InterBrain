/**
 * useContentTexture Hook
 *
 * Loads DreamNode media directly from disk using Obsidian's getResourcePath API.
 * This bypasses Electron's file:// security restrictions and avoids base64 encoding.
 *
 * Key insight: DreamNodes are inside the vault, so we can use vault-relative paths
 * with app.vault.adapter.getResourcePath() to get Electron-safe URLs.
 */

import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { pdfjs } from 'react-pdf';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { DreamNode } from '../types/dreamnode';
import { serviceManager } from '../../../core/services/service-manager';
import { extractYouTubeVideoId } from '../../drag-and-drop';
import { parseLinkFileContent, isLinkFile, getLinkThumbnail } from '../../drag-and-drop';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface ContentTextureResult {
  texture: THREE.Texture | null;
  isVideo: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to create a THREE.Texture from DreamNode media using direct file loading.
 * Uses Obsidian's getResourcePath() to convert vault-relative paths to Electron-safe URLs.
 *
 * @param dreamNode - The DreamNode to load media from
 */
export function useContentTexture(dreamNode: DreamNode): ContentTextureResult {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep refs for cleanup
  const videoRef = useRef<globalThis.HTMLVideoElement | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);

  useEffect(() => {
    const media = dreamNode.dreamTalkMedia?.[0];

    // Get the Obsidian app instance
    const app = serviceManager.getApp();

    if (!media?.absolutePath) {
      setIsLoading(false);
      setTexture(null);
      return;
    }

    if (!app) {
      console.warn(`[useContentTexture] ${dreamNode.name}: Obsidian app not available`);
      setIsLoading(false);
      setError('Obsidian app not available');
      return;
    }

    // Cleanup previous resources
    const cleanup = () => {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = '';
        videoRef.current = null;
      }
      if (textureRef.current) {
        textureRef.current.dispose();
        textureRef.current = null;
      }
    };

    const loadTexture = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Handle .link files (need to read content first)
        if (isLinkFile(media.path)) {
          // For link files, we need the data to parse the link content
          // Fall back to the data field if available
          if (media.data) {
            const linkMetadata = parseLinkFileContent(media.data);
            if (linkMetadata?.type === 'youtube' && linkMetadata.videoId) {
              const thumbnailUrl = getLinkThumbnail(linkMetadata);
              if (thumbnailUrl) {
                const tex = await loadImageTexture(thumbnailUrl);
                textureRef.current = tex;
                setTexture(tex);
                setIsVideo(false);
                setIsLoading(false);
                return;
              }
            }
          }
          // For other link types, show placeholder
          setTexture(null);
          setIsVideo(false);
          setIsLoading(false);
          return;
        }

        // Handle external URLs (YouTube, etc.)
        if (media.path?.startsWith('url:') || media.absolutePath?.startsWith('http')) {
          if (media.type === 'youtube') {
            const videoId = extractYouTubeVideoId(media.data || media.absolutePath || '');
            if (videoId) {
              const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
              const tex = await loadImageTexture(thumbnailUrl);
              textureRef.current = tex;
              setTexture(tex);
              setIsVideo(false);
              setIsLoading(false);
              return;
            }
          }
          setTexture(null);
          setIsVideo(false);
          setIsLoading(false);
          return;
        }

        // Get vault-relative path from absolutePath
        // absolutePath is like: /Users/davidrug/ProjectLiminality/Campfire/Campfire.png
        // vaultPath is like: /Users/davidrug/ProjectLiminality
        // We need: Campfire/Campfire.png
        const adapter = app.vault.adapter as { basePath?: string };
        const vaultPath = adapter.basePath || '';

        if (!vaultPath) {
          console.error(`[useContentTexture] ${dreamNode.name}: Could not determine vault path`);
          setError('Could not determine vault path');
          setIsLoading(false);
          return;
        }

        // Convert absolute path to vault-relative path
        let vaultRelativePath = media.absolutePath;
        if (vaultRelativePath.startsWith(vaultPath)) {
          vaultRelativePath = vaultRelativePath.slice(vaultPath.length);
          // Remove leading slash if present
          if (vaultRelativePath.startsWith('/')) {
            vaultRelativePath = vaultRelativePath.slice(1);
          }
        }

        const resourceUrl = app.vault.adapter.getResourcePath(vaultRelativePath);

        // Handle image media
        if (media.type.startsWith('image/')) {
          const tex = await loadImageTexture(resourceUrl);
          textureRef.current = tex;
          setTexture(tex);
          setIsVideo(false);
          setIsLoading(false);
          return;
        }

        // Handle video media
        if (media.type.startsWith('video/')) {
          const { texture: videoTex, video } = await loadVideoTexture(resourceUrl);
          videoRef.current = video;
          textureRef.current = videoTex;
          setTexture(videoTex);
          setIsVideo(true);
          setIsLoading(false);
          return;
        }

        // Handle PDF - render first page to texture
        if (media.type.startsWith('application/pdf')) {
          const pdfTex = await loadPdfTexture(resourceUrl);
          textureRef.current = pdfTex;
          setTexture(pdfTex);
          setIsVideo(false);
          setIsLoading(false);
          return;
        }

        // Unsupported media type
        setTexture(null);
        setIsVideo(false);
        setIsLoading(false);

      } catch (err) {
        console.error(`[useContentTexture] ${dreamNode.name}: Failed to load texture:`, err);
        setError(err instanceof Error ? err.message : 'Failed to load texture');
        setTexture(null);
        setIsLoading(false);
      }
    };

    loadTexture();

    return cleanup;
  }, [dreamNode.id, dreamNode.dreamTalkMedia?.[0]?.absolutePath]);

  return { texture, isVideo, isLoading, error };
}

/**
 * Load an image URL into a THREE.Texture
 */
async function loadImageTexture(src: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      src,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        resolve(texture);
      },
      undefined,
      (err) => {
        reject(err);
      }
    );
  });
}

/**
 * Load a video URL into a THREE.VideoTexture
 */
async function loadVideoTexture(src: string): Promise<{ texture: THREE.VideoTexture; video: globalThis.HTMLVideoElement }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = src;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;

    video.onloadeddata = () => {
      const texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;

      // Start playing
      video.play().catch((err) => {
        console.warn('[useContentTexture] Video autoplay failed:', err);
      });

      resolve({ texture, video });
    };

    video.onerror = () => {
      reject(new Error('Failed to load video'));
    };

    // Trigger load
    video.load();
  });
}

/**
 * Load a PDF URL and render first page to a THREE.Texture
 * Renders to a square canvas with the PDF centered and scaled to fit (contain mode)
 * This ensures the full page is visible without cropping the title
 */
async function loadPdfTexture(src: string): Promise<THREE.Texture> {
  // Fetch PDF as ArrayBuffer (needed for app:// URLs)
  const response = await fetch(src);
  const arrayBuffer = await response.arrayBuffer();

  // Load PDF document
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  // Target square canvas size
  const canvasSize = 512;

  // Calculate scale to fit PDF within the canvas with some padding
  const viewport = page.getViewport({ scale: 1 });
  const padding = 0.1; // 10% padding on each side
  const availableSize = canvasSize * (1 - padding * 2);
  const scale = availableSize / Math.max(viewport.width, viewport.height);
  const scaledViewport = page.getViewport({ scale });

  // Create square canvas
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext('2d')!;

  // Fill with black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  // Center the PDF on the canvas
  const offsetX = (canvasSize - scaledViewport.width) / 2;
  const offsetY = (canvasSize - scaledViewport.height) / 2;

  // Save context state, translate, render, then restore
  ctx.save();
  ctx.translate(offsetX, offsetY);

  // Clip to the PDF viewport bounds to prevent any overflow
  ctx.beginPath();
  ctx.rect(0, 0, scaledViewport.width, scaledViewport.height);
  ctx.clip();

  // Fill PDF area with white (PDF background)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, scaledViewport.width, scaledViewport.height);

  // Render PDF page to canvas
  await page.render({
    canvasContext: ctx,
    canvas: canvas,
    viewport: scaledViewport,
    background: 'transparent'
  }).promise;

  ctx.restore();

  // Create texture from canvas
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return texture;
}

export default useContentTexture;
