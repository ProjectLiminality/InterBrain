/**
 * MediaRenderer - Shared media rendering component for DreamTalk circles
 *
 * This component handles rendering all media types (images, videos, audio, PDFs,
 * YouTube links, website links) with consistent styling across DreamTalkSide
 * and HolonView submodule circles.
 */

import React, { useMemo } from 'react';
import { MediaFile } from '../types/dreamnode';
import { extractYouTubeVideoId } from '../../drag-and-drop';
import { parseLinkFileContent, isLinkFile, getLinkThumbnail } from '../../drag-and-drop';
import { PDFPreview } from './PDFPreview';
import { serviceManager } from '../../../core/services/service-manager';

/**
 * Get resource URL from absolutePath using Obsidian's getResourcePath
 * This avoids base64 encoding and loads directly from disk
 */
export function getMediaResourceUrl(absolutePath: string | undefined): string | null {
  if (!absolutePath) return null;

  const app = serviceManager.getApp();
  if (!app) return null;

  const adapter = app.vault.adapter as { basePath?: string };
  const vaultPath = adapter.basePath || '';

  if (!vaultPath) return null;

  // Convert absolute path to vault-relative path
  let vaultRelativePath = absolutePath;
  if (vaultRelativePath.startsWith(vaultPath)) {
    vaultRelativePath = vaultRelativePath.slice(vaultPath.length);
    if (vaultRelativePath.startsWith('/')) {
      vaultRelativePath = vaultRelativePath.slice(1);
    }
  }

  return app.vault.adapter.getResourcePath(vaultRelativePath);
}

/**
 * Shared media style for circular DreamTalk display
 */
export const mediaStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  borderRadius: '50%',
  // GPU acceleration and anti-aliasing for better distant rendering
  transform: 'translateZ(0)',
  willChange: 'transform',
  imageRendering: 'auto',
  WebkitFontSmoothing: 'antialiased',
  backfaceVisibility: 'hidden',
  // CSS containment for better browser rendering with many nodes
  contain: 'layout style paint',
  contentVisibility: 'auto'
};

interface MediaRendererProps {
  media: MediaFile;
}

/**
 * Renders different types of media in the DreamTalk circle
 */
export const MediaRenderer: React.FC<MediaRendererProps> = ({ media }) => {
  // Try to get resource URL from absolutePath (fast, no base64)
  // Fall back to media.data (base64) if absolutePath not available
  const resourceUrl = useMemo(() => getMediaResourceUrl(media.absolutePath), [media.absolutePath]);
  const mediaSrc = resourceUrl || media.data;

  // Don't render anything if no media source available
  if (!mediaSrc || mediaSrc.length === 0) {
    return null;
  }

  // Handle .link files
  if (isLinkFile(media.path)) {
    try {
      const linkMetadata = parseLinkFileContent(media.data);

      if (linkMetadata) {
        // YouTube link file handling
        if (linkMetadata.type === 'youtube' && linkMetadata.videoId) {
          const thumbnailUrl = getLinkThumbnail(linkMetadata);
          if (thumbnailUrl) {
            return (
              <div style={{...mediaStyle, position: 'relative', overflow: 'hidden'}}>
                <img
                  src={thumbnailUrl}
                  alt="YouTube video thumbnail"
                  style={mediaStyle}
                  draggable={false}
                />
                {/* YouTube play icon overlay */}
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '40%',
                    height: '40%',
                    background: 'rgba(255, 0, 0, 0.8)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    pointerEvents: 'none'
                  }}
                >
                  ▶
                </div>
              </div>
            );
          }
        }

        // Generic website link file handling
        if (linkMetadata.type === 'website') {
          return (
            <div
              style={{
                ...mediaStyle,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 'bold'
              }}
            >
              🔗
            </div>
          );
        }

        // Fallback for other link types
        return (
          <div
            style={{
              ...mediaStyle,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 100, 200, 0.8)',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 'bold'
            }}
          >
            LINK
          </div>
        );
      }
    } catch (error) {
      console.error('Failed to parse .link file:', error);
    }

    // Fallback for invalid .link files
    return (
      <div
        style={{
          ...mediaStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(200, 100, 0, 0.8)',
          color: '#FFFFFF',
          fontSize: '10px',
          fontWeight: 'bold'
        }}
      >
        .LINK
      </div>
    );
  }

  // Handle legacy URL-based media (backward compatibility)
  if (media.path?.startsWith('url:') || media.absolutePath?.startsWith('http')) {
    const url = media.data || media.absolutePath;

    // YouTube URL handling
    if (media.type === 'youtube') {
      const videoId = extractYouTubeVideoId(url);
      if (videoId) {
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        return (
          <div style={{...mediaStyle, position: 'relative', overflow: 'hidden'}}>
            <img
              src={thumbnailUrl}
              alt="YouTube video thumbnail"
              style={mediaStyle}
              draggable={false}
            />
            {/* YouTube play icon overlay */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '40%',
                height: '40%',
                background: 'rgba(255, 0, 0, 0.8)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '16px',
                fontWeight: 'bold',
                pointerEvents: 'none'
              }}
            >
              ▶
            </div>
          </div>
        );
      }
    }

    // Generic website URL handling
    if (media.type === 'website') {
      return (
        <div
          style={{
            ...mediaStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: '#FFFFFF',
            fontSize: '12px',
            fontWeight: 'bold'
          }}
        >
          🔗
        </div>
      );
    }

    // Fallback for other URL types
    return (
      <div
        style={{
          ...mediaStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 100, 200, 0.8)',
          color: '#FFFFFF',
          fontSize: '12px',
          fontWeight: 'bold'
        }}
      >
        URL
      </div>
    );
  }

  // Handle file-based media (existing logic)
  if (media.type.startsWith('image/')) {
    return (
      <img
        src={mediaSrc}
        alt="DreamTalk symbol"
        style={mediaStyle}
        draggable={false}
      />
    );
  }

  if (media.type.startsWith('video/')) {
    return (
      <video
        src={mediaSrc}
        style={mediaStyle}
        muted
        loop
        autoPlay
        playsInline
      />
    );
  }

  if (media.type.startsWith('audio/')) {
    return (
      <div
        style={{
          ...mediaStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.8)'
        }}
      >
        <audio
          controls
          src={mediaSrc}
          style={{
            width: '90%',
            maxWidth: '80px',
            filter: 'invert(1)'
          }}
        />
      </div>
    );
  }

  if (media.type.startsWith('application/pdf')) {
    // Use a larger width for better quality PDF rendering that fills the circle
    // Render at 600px for crisp display and let CSS scale/clip to fit
    // Note: PDF still needs base64 data for pdfjs
    return (
      <PDFPreview
        src={media.data || mediaSrc}
        width={600}
        thumbnailMode={true}
        style={{
          ...mediaStyle,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          borderRadius: mediaStyle.borderRadius
        }}
      />
    );
  }

  return (
    <div
      style={{
        ...mediaStyle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#FFFFFF',
        fontSize: '10px',
        background: 'rgba(0, 0, 0, 0.8)'
      }}
    >
      {media.type}
    </div>
  );
};
