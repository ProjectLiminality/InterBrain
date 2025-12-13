import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractUrlsFromText,
  validateUrl,
  extractYouTubeVideoId,
  getYouTubeEmbedUrl,
  generateYouTubeIframe,
  generateMarkdownLink,
  getUrlMetadata,
  processDroppedUrlData
} from './url-utils';

describe('url-utils', () => {
  describe('extractUrlsFromText', () => {
    it('should extract plain text URLs', () => {
      const text = 'Check out https://example.com and http://test.org';
      const urls = extractUrlsFromText(text);
      expect(urls).toContain('https://example.com');
      expect(urls).toContain('http://test.org');
    });

    it('should extract URLs from HTML href attributes', () => {
      const html = '<a href="https://example.com">Link</a>';
      const urls = extractUrlsFromText(html);
      expect(urls).toContain('https://example.com');
    });

    it('should deduplicate URLs', () => {
      const text = 'https://example.com and https://example.com again';
      const urls = extractUrlsFromText(text);
      expect(urls.filter(u => u === 'https://example.com')).toHaveLength(1);
    });

    it('should handle URLs with query parameters', () => {
      const text = 'Visit https://example.com/path?foo=bar&baz=qux';
      const urls = extractUrlsFromText(text);
      expect(urls).toContain('https://example.com/path?foo=bar&baz=qux');
    });

    it('should return empty array for text without URLs', () => {
      const text = 'No URLs here, just plain text.';
      const urls = extractUrlsFromText(text);
      expect(urls).toHaveLength(0);
    });

    it('should handle mixed HTML and plain text', () => {
      const content = '<a href="https://html.com">HTML</a> and https://plain.com';
      const urls = extractUrlsFromText(content);
      expect(urls).toContain('https://html.com');
      expect(urls).toContain('https://plain.com');
    });
  });

  describe('validateUrl', () => {
    it('should return true for valid https URL', () => {
      expect(validateUrl('https://example.com')).toBe(true);
    });

    it('should return true for valid http URL', () => {
      expect(validateUrl('http://example.com')).toBe(true);
    });

    it('should return false for invalid URL', () => {
      expect(validateUrl('not a url')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(validateUrl('')).toBe(false);
    });

    it('should return false for file:// protocol', () => {
      expect(validateUrl('file:///path/to/file')).toBe(false);
    });

    it('should return false for javascript: protocol', () => {
      expect(validateUrl('javascript:alert(1)')).toBe(false);
    });

    it('should handle URLs with ports', () => {
      expect(validateUrl('https://localhost:3000')).toBe(true);
    });

    it('should handle URLs with paths and fragments', () => {
      expect(validateUrl('https://example.com/path/to/page#section')).toBe(true);
    });
  });

  describe('extractYouTubeVideoId', () => {
    it('should extract ID from standard watch URL', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('should extract ID from short youtu.be URL', () => {
      expect(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('should extract ID from embed URL', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('should extract ID from watch URL with additional parameters', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120')).toBe('dQw4w9WgXcQ');
    });

    it('should extract ID from URL with v parameter not first', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/watch?list=PLabc&v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('should return null for non-YouTube URL', () => {
      expect(extractYouTubeVideoId('https://vimeo.com/123456')).toBeNull();
    });

    it('should return null for invalid YouTube URL', () => {
      expect(extractYouTubeVideoId('https://youtube.com/about')).toBeNull();
    });

    it('should handle youtube.com/v/ format', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/v/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });
  });

  describe('getYouTubeEmbedUrl', () => {
    it('should generate correct embed URL', () => {
      expect(getYouTubeEmbedUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    });

    it('should handle video IDs with special characters', () => {
      expect(getYouTubeEmbedUrl('abc-_123')).toBe('https://www.youtube.com/embed/abc-_123');
    });
  });

  describe('generateYouTubeIframe', () => {
    it('should generate iframe with default dimensions', () => {
      const iframe = generateYouTubeIframe('dQw4w9WgXcQ');
      expect(iframe).toContain('width="560"');
      expect(iframe).toContain('height="315"');
      expect(iframe).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ"');
    });

    it('should generate iframe with custom dimensions', () => {
      const iframe = generateYouTubeIframe('dQw4w9WgXcQ', 800, 450);
      expect(iframe).toContain('width="800"');
      expect(iframe).toContain('height="450"');
    });

    it('should include required iframe attributes', () => {
      const iframe = generateYouTubeIframe('dQw4w9WgXcQ');
      expect(iframe).toContain('allowfullscreen');
      expect(iframe).toContain('frameborder="0"');
      expect(iframe).toContain('title="YouTube video player"');
    });
  });

  describe('generateMarkdownLink', () => {
    it('should generate link with title', () => {
      const link = generateMarkdownLink('https://example.com', 'Example Site');
      expect(link).toBe('[Example Site](https://example.com)');
    });

    it('should use URL as title when no title provided', () => {
      const link = generateMarkdownLink('https://example.com');
      expect(link).toBe('[https://example.com](https://example.com)');
    });

    it('should handle URLs with special characters', () => {
      const link = generateMarkdownLink('https://example.com/path?q=test&a=1', 'Search');
      expect(link).toBe('[Search](https://example.com/path?q=test&a=1)');
    });
  });

  describe('getUrlMetadata', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should return invalid metadata for invalid URL', async () => {
      const metadata = await getUrlMetadata('not a url');
      expect(metadata.isValid).toBe(false);
      expect(metadata.type).toBe('unknown');
    });

    it('should identify YouTube URLs and extract video ID', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ title: 'Test Video' })
      });
      vi.stubGlobal('fetch', mockFetch);

      const metadata = await getUrlMetadata('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(metadata.isValid).toBe(true);
      expect(metadata.type).toBe('youtube');
      expect(metadata.videoId).toBe('dQw4w9WgXcQ');
      expect(metadata.embedUrl).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    });

    it('should use video ID as title when YouTube API fails', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404
      });
      vi.stubGlobal('fetch', mockFetch);

      const metadata = await getUrlMetadata('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(metadata.title).toBe('dQw4w9WgXcQ');
    });

    it('should identify regular website URLs', async () => {
      const metadata = await getUrlMetadata('https://example.com/page');
      expect(metadata.isValid).toBe(true);
      expect(metadata.type).toBe('website');
      expect(metadata.title).toBe('example.com');
    });

    it('should include hostname as title for websites', async () => {
      const metadata = await getUrlMetadata('https://subdomain.example.org/path');
      expect(metadata.title).toBe('subdomain.example.org');
    });
  });

  describe('processDroppedUrlData', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 404
      }));
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should process plain URL string', async () => {
      const metadata = await processDroppedUrlData('https://example.com');
      expect(metadata).not.toBeNull();
      expect(metadata?.isValid).toBe(true);
      expect(metadata?.url).toBe('https://example.com');
    });

    it('should handle URL with whitespace', async () => {
      const metadata = await processDroppedUrlData('  https://example.com  \n');
      expect(metadata).not.toBeNull();
      expect(metadata?.url).toBe('https://example.com');
    });

    it('should extract URL from HTML content', async () => {
      const html = '<a href="https://example.com">Click here</a>';
      const metadata = await processDroppedUrlData(html);
      expect(metadata).not.toBeNull();
      expect(metadata?.url).toBe('https://example.com');
    });

    it('should return first valid URL when multiple present', async () => {
      const text = 'https://first.com and https://second.com';
      const metadata = await processDroppedUrlData(text);
      expect(metadata).not.toBeNull();
      expect(metadata?.url).toBe('https://first.com');
    });

    it('should return null for invalid input', async () => {
      const metadata = await processDroppedUrlData('not a url at all');
      expect(metadata).toBeNull();
    });

    it('should handle empty string', async () => {
      const metadata = await processDroppedUrlData('');
      expect(metadata).toBeNull();
    });
  });
});
