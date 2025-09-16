/**
 * URL validation and metadata extraction utilities for InterBrain
 */

export interface UrlMetadata {
  url: string;
  title?: string;
  type: 'youtube' | 'website' | 'unknown';
  isValid: boolean;
  videoId?: string; // For YouTube videos
  embedUrl?: string; // For embedding
}

/**
 * Extract URLs from various text formats (plain text, HTML, etc.)
 */
export function extractUrlsFromText(text: string): string[] {
  // Handle HTML content - extract href attributes
  const htmlUrlRegex = /href\s*=\s*["']([^"']+)["']/gi;
  const htmlMatches = Array.from(text.matchAll(htmlUrlRegex), m => m[1]);

  // Handle plain text URLs
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const textMatches = Array.from(text.matchAll(urlRegex), m => m[0]);

  // Combine and deduplicate
  const allUrls = [...htmlMatches, ...textMatches];
  return [...new Set(allUrls)];
}

/**
 * Validate if a string is a valid URL
 */
export function validateUrl(urlString: string): boolean {
  try {
    const url = new globalThis.URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Extract YouTube video ID from various YouTube URL formats
 */
export function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
    /youtube\.com\/.*[?&]v=([^&\n?#]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Generate YouTube embed URL from video ID
 */
export function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}`;
}

/**
 * Get URL metadata for display and processing
 */
export function getUrlMetadata(urlString: string): UrlMetadata {
  const isValid = validateUrl(urlString);

  if (!isValid) {
    return {
      url: urlString,
      type: 'unknown',
      isValid: false
    };
  }

  // Check if it's a YouTube URL
  const videoId = extractYouTubeVideoId(urlString);
  if (videoId) {
    return {
      url: urlString,
      type: 'youtube',
      isValid: true,
      videoId,
      embedUrl: getYouTubeEmbedUrl(videoId),
      title: `YouTube Video: ${videoId}`
    };
  }

  // Default to website type
  const url = new globalThis.URL(urlString);
  return {
    url: urlString,
    type: 'website',
    isValid: true,
    title: url.hostname
  };
}

/**
 * Generate Obsidian-compatible iframe markup for YouTube videos
 */
export function generateYouTubeIframe(videoId: string, width = 560, height = 315): string {
  const embedUrl = getYouTubeEmbedUrl(videoId);
  return `<iframe width="${width}" height="${height}" src="${embedUrl}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
}

/**
 * Create a simple markdown link for non-YouTube URLs
 */
export function generateMarkdownLink(url: string, title?: string): string {
  const linkTitle = title || url;
  return `[${linkTitle}](${url})`;
}

/**
 * Process dropped URL data and extract the first valid URL
 */
export function processDroppedUrlData(urlData: string): UrlMetadata | null {
  // Clean up the URL data (remove whitespace, newlines)
  const cleanedData = urlData.trim();

  // Try to extract URLs from the data
  const urls = extractUrlsFromText(cleanedData);

  // If no URLs found, try treating the whole string as a URL
  if (urls.length === 0) {
    const metadata = getUrlMetadata(cleanedData);
    return metadata.isValid ? metadata : null;
  }

  // Return metadata for the first valid URL
  for (const url of urls) {
    const metadata = getUrlMetadata(url);
    if (metadata.isValid) {
      return metadata;
    }
  }

  return null;
}