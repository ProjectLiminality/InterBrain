/**
 * useMediaTexture Hook
 *
 * Converts DreamNode media (images, videos) into THREE.js textures for WebGL rendering.
 * This replaces DOM-based rendering with GPU-native textures for better performance.
 */

import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { DreamNode, MediaFile } from '../types/dreamnode';
import { extractYouTubeVideoId } from '../../drag-and-drop';
import { parseLinkFileContent, isLinkFile, getLinkThumbnail } from '../../drag-and-drop';

export interface MediaTextureResult {
  texture: THREE.Texture | null;
  isVideo: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to create a THREE.Texture from DreamNode media
 * Handles images, videos, YouTube thumbnails, and link files
 * @param dreamNode - The DreamNode to load media from
 * @param mediaLoadTrigger - Optional trigger to force re-evaluation when media loads asynchronously
 */
export function useMediaTexture(dreamNode: DreamNode, mediaLoadTrigger?: number): MediaTextureResult {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep refs for cleanup
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);

  useEffect(() => {
    const media = dreamNode.dreamTalkMedia?.[0];

    console.log(`[useMediaTexture] ${dreamNode.name}: media=`, media?.type, 'data length=', media?.data?.length || 0);

    if (!media?.data || media.data.length === 0) {
      console.log(`[useMediaTexture] ${dreamNode.name}: No media data, skipping`);
      setIsLoading(false);
      setTexture(null);
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
        // Handle .link files
        if (isLinkFile(media.path)) {
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
          // For other link types, we'll show a placeholder
          setTexture(null);
          setIsVideo(false);
          setIsLoading(false);
          return;
        }

        // Handle legacy URL-based media
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

        // Handle image media
        if (media.type.startsWith('image/')) {
          console.log(`[useMediaTexture] ${dreamNode.name}: Loading image texture...`);
          const tex = await loadImageTexture(media.data);
          console.log(`[useMediaTexture] ${dreamNode.name}: Image texture loaded!`, tex);
          textureRef.current = tex;
          setTexture(tex);
          setIsVideo(false);
          setIsLoading(false);
          return;
        }

        // Handle video media
        if (media.type.startsWith('video/')) {
          console.log(`[useMediaTexture] ${dreamNode.name}: Loading video texture...`);
          const { texture: videoTex, video } = await loadVideoTexture(media.data);
          console.log(`[useMediaTexture] ${dreamNode.name}: Video texture loaded!`, videoTex);
          videoRef.current = video;
          textureRef.current = videoTex;
          setTexture(videoTex);
          setIsVideo(true);
          setIsLoading(false);
          return;
        }

        // Handle PDF - for now show placeholder (PDF rendering would need canvas baking)
        if (media.type.startsWith('application/pdf')) {
          // TODO: Implement PDF canvas baking in Phase 3
          setTexture(null);
          setIsVideo(false);
          setIsLoading(false);
          return;
        }

        // Unsupported media type
        setTexture(null);
        setIsVideo(false);
        setIsLoading(false);

      } catch (err) {
        console.error('[useMediaTexture] Failed to load texture:', err);
        setError(err instanceof Error ? err.message : 'Failed to load texture');
        setTexture(null);
        setIsLoading(false);
      }
    };

    loadTexture();

    return cleanup;
    // Use stable reference - only re-run when node ID changes, media data changes, or trigger fires
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dreamNode.id, dreamNode.dreamTalkMedia?.[0]?.data, mediaLoadTrigger]);

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
async function loadVideoTexture(src: string): Promise<{ texture: THREE.VideoTexture; video: HTMLVideoElement }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = src;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    video.onloadeddata = () => {
      const texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;

      // Start playing
      video.play().catch((err) => {
        console.warn('[useMediaTexture] Video autoplay failed:', err);
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

export default useMediaTexture;
