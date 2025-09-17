/**
 * DreamSong Media Resolver - Pure Path Resolution Functions
 *
 * Layer 1 of the three-layer DreamSong architecture.
 * Contains only pure functions for resolving media file paths to usable URLs.
 * Handles data URL conversion and MIME type detection.
 */

import { DreamSongBlock, MediaInfo } from '../../types/dreamsong';
import { VaultService } from '../vault-service';
import { parseLinkFileContent, isLinkFile, getLinkThumbnail } from '../../utils/link-file-utils';

// Access Node.js modules directly in Electron context
/* eslint-disable no-undef */
const fs = require('fs');
const path = require('path');
/* eslint-enable no-undef */

/**
 * Resolve media paths in all blocks, converting file paths to data URLs
 */
export async function resolveMediaPaths(
  blocks: DreamSongBlock[],
  dreamNodePath: string,
  vaultService: VaultService
): Promise<DreamSongBlock[]> {
  const resolvedBlocks: DreamSongBlock[] = [];

  for (const block of blocks) {
    if (block.media) {
      const resolvedMedia = await resolveMediaInfo(block.media, dreamNodePath, vaultService);
      resolvedBlocks.push({
        ...block,
        media: resolvedMedia
      });
    } else {
      resolvedBlocks.push(block);
    }
  }

  return resolvedBlocks;
}

/**
 * Resolve a single media info, converting file path to data URL
 */
export async function resolveMediaInfo(
  mediaInfo: MediaInfo,
  dreamNodePath: string,
  vaultService: VaultService
): Promise<MediaInfo> {
  try {
    // Check if the src is already a data URL or external URL
    if (mediaInfo.src.startsWith('data:') || mediaInfo.src.startsWith('http')) {
      return mediaInfo; // Already resolved
    }

    // Handle .link files specially
    if (mediaInfo.isLinkFile || isLinkFile(mediaInfo.src)) {
      return await resolveLinkFileInfo(mediaInfo, dreamNodePath, vaultService);
    }

    // Resolve file path to data URL
    const resolvedSrc = await resolveMediaPath(mediaInfo.src, dreamNodePath, vaultService);

    if (!resolvedSrc) {
      console.warn(`🚫 [Media Resolver] Could not resolve media path: ${mediaInfo.src}`);
      // Return original info - component will handle gracefully
      return mediaInfo;
    }

    return {
      ...mediaInfo,
      src: resolvedSrc
    };
  } catch (error) {
    console.error(`❌ [Media Resolver] Error resolving media ${mediaInfo.src}:`, error);
    return mediaInfo; // Return original on error
  }
}

/**
 * Resolve .link file info, extracting metadata and thumbnail URLs
 */
async function resolveLinkFileInfo(
  mediaInfo: MediaInfo,
  dreamNodePath: string,
  vaultService: VaultService
): Promise<MediaInfo> {
  try {
    // Check if file exists in vault
    const filePath = mediaInfo.src;
    const exists = await vaultService.fileExists(filePath);
    if (!exists) {
      console.warn(`🚫 [Media Resolver] .link file not found: ${filePath}`);
      return mediaInfo;
    }

    // Read .link file content
    const fullPath = getFullPath(filePath, vaultService);
    const linkContent = fs.readFileSync(fullPath, 'utf-8');

    // Parse .link file metadata
    const linkMetadata = parseLinkFileContent(linkContent);
    if (!linkMetadata) {
      console.warn(`🚫 [Media Resolver] Invalid .link file content: ${filePath}`);
      return mediaInfo;
    }

    // For YouTube videos, use thumbnail URL
    if (linkMetadata.type === 'youtube') {
      const thumbnailUrl = getLinkThumbnail(linkMetadata);
      if (thumbnailUrl) {
        return {
          ...mediaInfo,
          type: 'video',
          src: thumbnailUrl, // Use thumbnail URL for Canvas display
          alt: linkMetadata.title || mediaInfo.alt,
          isLinkFile: true, // Keep flag for components to know this is a .link file
          linkMetadata: linkMetadata // Pass full metadata for components
        };
      }
    }

    // For other link types, keep original URL (component will handle display)
    return {
      ...mediaInfo,
      src: linkMetadata.url,
      alt: linkMetadata.title || mediaInfo.alt,
      type: linkMetadata.type === 'youtube' ? 'video' : 'image', // Default fallback
      isLinkFile: true,
      linkMetadata: linkMetadata // Pass full metadata for components
    };

  } catch (error) {
    console.error(`❌ [Media Resolver] Error resolving .link file ${mediaInfo.src}:`, error);
    return mediaInfo; // Return original on error
  }
}

/**
 * Resolve media file path to data URL
 */
async function resolveMediaPath(
  filename: string,
  _dreamNodePath: string,
  vaultService: VaultService
): Promise<string | null> {
  try {
    // Canvas paths are already relative to the DreamNode
    const filePath = filename;

    // Check if file exists in vault
    const exists = await vaultService.fileExists(filePath);
    if (!exists) {
      console.warn(`🚫 [Media Resolver] Media file not found: ${filePath}`);
      return null;
    }

    // Convert to data URL
    return await filePathToDataUrl(filePath, vaultService);

  } catch (error) {
    console.error(`❌ [Media Resolver] Error resolving media path ${filename}:`, error);
    return null;
  }
}

/**
 * Convert file path to data URL using Node.js fs
 */
async function filePathToDataUrl(filePath: string, vaultService: VaultService): Promise<string> {
  // Get full path using VaultService helper
  const fullPath = getFullPath(filePath, vaultService);

  // Read file as binary using Node.js fs
  const buffer = fs.readFileSync(fullPath);

  // Convert to base64
  const base64 = buffer.toString('base64');

  // Get MIME type from file extension
  const mimeType = getMimeType(filePath);

  // Create base64 data URL
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Get full file system path
 */
function getFullPath(filePath: string, vaultService: VaultService): string {
  // Access VaultService's vault path
  const vaultPath = getVaultPath(vaultService);
  if (!vaultPath) {
    console.warn('Media Resolver: Vault path not initialized, using relative path');
    return filePath;
  }
  return path.join(vaultPath, filePath);
}

/**
 * Get vault path from VaultService
 */
function getVaultPath(vaultService: VaultService): string {
  // Access VaultService's private vaultPath via reflection
  return (vaultService as any).vaultPath || '';
}

/**
 * Get MIME type from file extension
 */
export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = {
    // Images
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    'ico': 'image/x-icon',

    // Videos
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'ogg': 'video/ogg',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'wmv': 'video/x-ms-wmv',

    // Audio
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'm4a': 'audio/mp4',
    'aac': 'audio/aac',
    'flac': 'audio/flac',

    // Documents
    'pdf': 'application/pdf'
  };

  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Check if a file extension is supported for media display
 */
export function isMediaFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const supportedExtensions = [
    // Images
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp',
    // Videos
    'mp4', 'webm', 'ogg', 'mov',
    // Audio
    'mp3', 'wav', 'm4a', 'aac',
    // Documents
    'pdf',
    // Link files
    'link'
  ];

  return supportedExtensions.includes(ext);
}

/**
 * Get media type category from filename
 */
export function getMediaTypeFromFilename(filename: string): 'video' | 'image' | 'audio' | 'pdf' | null {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (['mp4', 'webm', 'ogg', 'mov', 'avi', 'wmv'].includes(ext)) {
    return 'video';
  } else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) {
    return 'image';
  } else if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)) {
    return 'audio';
  } else if (ext === 'pdf') {
    return 'pdf';
  } else if (ext === 'link') {
    // .link files default to video type (will be resolved by media resolver)
    return 'video';
  }

  return null;
}