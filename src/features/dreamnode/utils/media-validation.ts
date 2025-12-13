/**
 * Media Validation Utilities - DreamNode supported media types
 *
 * This is the single source of truth for what media files DreamNodes support.
 * Other features (drag-and-drop, dreamnode-creator) should import from here.
 */

/**
 * MIME types supported for DreamTalk media
 */
export const SUPPORTED_MEDIA_TYPES = [
  // Images
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Videos
  'video/mp4',
  'video/webm',
  // Documents
  'application/pdf',
  // .link files may appear as text/plain or application/octet-stream
  'text/plain',
  'application/octet-stream'
] as const;

/**
 * File extensions supported for DreamTalk media
 * Used as fallback when MIME type detection is unreliable
 */
export const SUPPORTED_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
  '.mp4', '.webm',
  '.pdf',
  '.link'
] as const;

/**
 * Check if a file is a valid DreamTalk media file
 *
 * @param file - The file to validate
 * @returns true if the file is a supported media type
 */
export function isValidDreamTalkMedia(file: globalThis.File): boolean {
  // Check file extension as fallback for unreliable MIME types
  const fileName = file.name.toLowerCase();
  const hasValidExtension = SUPPORTED_EXTENSIONS.some(ext => fileName.endsWith(ext));

  if (hasValidExtension) {
    return true;
  }

  // Check MIME type
  return (SUPPORTED_MEDIA_TYPES as readonly string[]).includes(file.type);
}

/**
 * Get the media category for a file
 *
 * @param file - The file to categorize
 * @returns 'image' | 'video' | 'document' | 'link' | 'unknown'
 */
export function getMediaCategory(file: globalThis.File): 'image' | 'video' | 'document' | 'link' | 'unknown' {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.link')) {
    return 'link';
  }

  if (file.type.startsWith('image/')) {
    return 'image';
  }

  if (file.type.startsWith('video/')) {
    return 'video';
  }

  if (file.type === 'application/pdf' || fileName.endsWith('.pdf')) {
    return 'document';
  }

  return 'unknown';
}
