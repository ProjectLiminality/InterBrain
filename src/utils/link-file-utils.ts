/**
 * Link File Utilities for InterBrain
 *
 * Handles creation, parsing, and management of .link files that represent
 * URLs as trackable files in the vault. These files contain JSON metadata
 * and behave like regular media files in the system.
 */

import { UrlMetadata, getYouTubeEmbedUrl } from './url-utils';

export interface LinkFileMetadata {
  /** Original URL */
  url: string;

  /** Type of link */
  type: 'youtube' | 'website' | 'unknown';

  /** Display title */
  title?: string;

  /** Thumbnail URL (for YouTube videos) */
  thumbnail?: string;

  /** YouTube video ID (if applicable) */
  videoId?: string;

  /** Embed URL (if applicable) */
  embedUrl?: string;

  /** Creation timestamp */
  created: string;
}

/**
 * Create .link file content from URL metadata
 */
export function createLinkFileContent(urlMetadata: UrlMetadata, title?: string): string {
  console.log('🔗 [createLinkFileContent] Creating link file content with:', {
    urlMetadata,
    title
  });

  const linkMetadata: LinkFileMetadata = {
    url: urlMetadata.url,
    type: urlMetadata.type,
    title: title || urlMetadata.title,
    created: new Date().toISOString()
  };

  // Add YouTube-specific metadata
  if (urlMetadata.type === 'youtube' && urlMetadata.videoId) {
    linkMetadata.videoId = urlMetadata.videoId;
    linkMetadata.embedUrl = urlMetadata.embedUrl || getYouTubeEmbedUrl(urlMetadata.videoId);
    linkMetadata.thumbnail = `https://img.youtube.com/vi/${urlMetadata.videoId}/maxresdefault.jpg`;
    console.log('🔗 [createLinkFileContent] Added YouTube metadata:', {
      videoId: linkMetadata.videoId,
      embedUrl: linkMetadata.embedUrl,
      thumbnail: linkMetadata.thumbnail
    });
  }

  const jsonContent = JSON.stringify(linkMetadata, null, 2);
  console.log('🔗 [createLinkFileContent] Generated JSON content:', jsonContent);
  console.log('🔗 [createLinkFileContent] Content length:', jsonContent.length);

  return jsonContent;
}

/**
 * Parse .link file content and return metadata
 */
export function parseLinkFileContent(content: string): LinkFileMetadata | null {
  try {
    const metadata = JSON.parse(content) as LinkFileMetadata;

    // Validate required fields
    if (!metadata.url || !metadata.type) {
      console.warn('Invalid .link file: missing required fields (url, type)');
      return null;
    }

    return metadata;
  } catch (error) {
    console.error('Failed to parse .link file content:', error);
    return null;
  }
}

/**
 * Generate appropriate filename for a .link file
 */
export function getLinkFileName(urlMetadata: UrlMetadata, title?: string): string {
  const sanitize = (str: string): string => {
    return str
      .replace(/[^a-zA-Z0-9-_\s]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
  };

  // Use provided title or extracted title
  const displayTitle = title || urlMetadata.title;

  if (urlMetadata.type === 'youtube' && urlMetadata.videoId) {
    // For YouTube, prefer title but fall back to video ID
    if (displayTitle && displayTitle !== urlMetadata.url) {
      return `${sanitize(displayTitle)}.link`;
    }
    return `youtube-${urlMetadata.videoId}.link`;
  }

  if (displayTitle && displayTitle !== urlMetadata.url) {
    return `${sanitize(displayTitle)}.link`;
  }

  // Fallback: extract domain from URL
  try {
    const url = new globalThis.URL(urlMetadata.url);
    const domain = url.hostname.replace(/^www\./, '');
    return `${sanitize(domain)}.link`;
  } catch {
    return 'link-file.link';
  }
}

/**
 * Check if a file path is a .link file
 */
export function isLinkFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.link');
}

/**
 * Convert LinkFileMetadata back to UrlMetadata for compatibility
 */
export function linkMetadataToUrlMetadata(linkMetadata: LinkFileMetadata): UrlMetadata {
  return {
    url: linkMetadata.url,
    title: linkMetadata.title,
    type: linkMetadata.type,
    isValid: true,
    videoId: linkMetadata.videoId,
    embedUrl: linkMetadata.embedUrl
  };
}

/**
 * Generate thumbnail URL for a link file
 */
export function getLinkThumbnail(linkMetadata: LinkFileMetadata): string | null {
  if (linkMetadata.type === 'youtube' && linkMetadata.videoId) {
    return linkMetadata.thumbnail || `https://img.youtube.com/vi/${linkMetadata.videoId}/maxresdefault.jpg`;
  }

  // Could add more thumbnail sources for other link types in the future
  return null;
}

/**
 * Validate .link file metadata structure
 */
export function validateLinkMetadata(metadata: unknown): metadata is LinkFileMetadata {
  return (
    typeof metadata === 'object' &&
    metadata !== null &&
    typeof (metadata as any).url === 'string' &&
    typeof (metadata as any).type === 'string' &&
    ['youtube', 'website', 'unknown'].includes((metadata as any).type) &&
    typeof (metadata as any).created === 'string' &&
    ((metadata as any).title === undefined || typeof (metadata as any).title === 'string') &&
    ((metadata as any).thumbnail === undefined || typeof (metadata as any).thumbnail === 'string') &&
    ((metadata as any).videoId === undefined || typeof (metadata as any).videoId === 'string') &&
    ((metadata as any).embedUrl === undefined || typeof (metadata as any).embedUrl === 'string')
  );
}