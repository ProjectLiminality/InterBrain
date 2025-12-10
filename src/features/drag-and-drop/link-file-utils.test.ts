import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Buffer } from 'buffer';
import {
  createLinkFileContent,
  parseLinkFileContent,
  getLinkFileName,
  isLinkFile,
  linkMetadataToUrlMetadata,
  getLinkThumbnail,
  validateLinkMetadata,
  LinkFileMetadata
} from './link-file-utils';
import { UrlMetadata } from './url-utils';

describe('link-file-utils', () => {
  // Mock Date for consistent timestamps in tests
  const mockDate = new Date('2025-01-15T10:30:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createLinkFileContent', () => {
    it('should create valid JSON for website URL', () => {
      const urlMetadata: UrlMetadata = {
        url: 'https://example.com',
        type: 'website',
        isValid: true,
        title: 'Example Site'
      };

      const content = createLinkFileContent(urlMetadata);
      const parsed = JSON.parse(content);

      expect(parsed.url).toBe('https://example.com');
      expect(parsed.type).toBe('website');
      expect(parsed.title).toBe('Example Site');
      expect(parsed.created).toBe('2025-01-15T10:30:00.000Z');
    });

    it('should include YouTube-specific metadata for YouTube URLs', () => {
      const urlMetadata: UrlMetadata = {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        type: 'youtube',
        isValid: true,
        videoId: 'dQw4w9WgXcQ',
        embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        title: 'Never Gonna Give You Up'
      };

      const content = createLinkFileContent(urlMetadata);
      const parsed = JSON.parse(content);

      expect(parsed.type).toBe('youtube');
      expect(parsed.videoId).toBe('dQw4w9WgXcQ');
      expect(parsed.embedUrl).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
      expect(parsed.thumbnail).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg');
    });

    it('should use provided title over URL metadata title', () => {
      const urlMetadata: UrlMetadata = {
        url: 'https://example.com',
        type: 'website',
        isValid: true,
        title: 'Original Title'
      };

      const content = createLinkFileContent(urlMetadata, 'Custom Title');
      const parsed = JSON.parse(content);

      expect(parsed.title).toBe('Custom Title');
    });

    it('should generate embedUrl if not provided for YouTube', () => {
      const urlMetadata: UrlMetadata = {
        url: 'https://www.youtube.com/watch?v=abc123',
        type: 'youtube',
        isValid: true,
        videoId: 'abc123'
        // No embedUrl provided
      };

      const content = createLinkFileContent(urlMetadata);
      const parsed = JSON.parse(content);

      expect(parsed.embedUrl).toBe('https://www.youtube.com/embed/abc123');
    });
  });

  describe('parseLinkFileContent', () => {
    it('should parse valid JSON link file', () => {
      const content = JSON.stringify({
        url: 'https://example.com',
        type: 'website',
        title: 'Test',
        created: '2025-01-15T10:30:00.000Z'
      });

      const parsed = parseLinkFileContent(content);

      expect(parsed).not.toBeNull();
      expect(parsed?.url).toBe('https://example.com');
      expect(parsed?.type).toBe('website');
    });

    it('should parse legacy base64-encoded data URLs', () => {
      const jsonContent = JSON.stringify({
        url: 'https://example.com',
        type: 'website',
        created: '2025-01-15T10:30:00.000Z'
      });
      const base64 = Buffer.from(jsonContent).toString('base64');
      const dataUrl = `data:application/json;base64,${base64}`;

      const parsed = parseLinkFileContent(dataUrl);

      expect(parsed).not.toBeNull();
      expect(parsed?.url).toBe('https://example.com');
    });

    it('should return null for invalid JSON', () => {
      const parsed = parseLinkFileContent('not json at all');
      expect(parsed).toBeNull();
    });

    it('should return null for JSON missing required url field', () => {
      const content = JSON.stringify({
        type: 'website',
        created: '2025-01-15T10:30:00.000Z'
      });

      const parsed = parseLinkFileContent(content);
      expect(parsed).toBeNull();
    });

    it('should return null for JSON missing required type field', () => {
      const content = JSON.stringify({
        url: 'https://example.com',
        created: '2025-01-15T10:30:00.000Z'
      });

      const parsed = parseLinkFileContent(content);
      expect(parsed).toBeNull();
    });

    it('should handle malformed data URLs gracefully', () => {
      const parsed = parseLinkFileContent('data:invalid');
      expect(parsed).toBeNull();
    });
  });

  describe('getLinkFileName', () => {
    it('should generate filename from title for website', () => {
      const urlMetadata: UrlMetadata = {
        url: 'https://example.com/article',
        type: 'website',
        isValid: true,
        title: 'My Article Title'
      };

      const filename = getLinkFileName(urlMetadata);
      expect(filename).toBe('my-article-title.link');
    });

    it('should sanitize special characters', () => {
      const urlMetadata: UrlMetadata = {
        url: 'https://example.com',
        type: 'website',
        isValid: true,
        title: 'Title: With "Special" Characters!'
      };

      const filename = getLinkFileName(urlMetadata);
      expect(filename).toBe('title-with-special-characters.link');
    });

    it('should use provided title over URL metadata title', () => {
      const urlMetadata: UrlMetadata = {
        url: 'https://example.com',
        type: 'website',
        isValid: true,
        title: 'URL Title'
      };

      const filename = getLinkFileName(urlMetadata, 'Custom Title');
      expect(filename).toBe('custom-title.link');
    });

    it('should use video ID format for YouTube without title', () => {
      const urlMetadata: UrlMetadata = {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        type: 'youtube',
        isValid: true,
        videoId: 'dQw4w9WgXcQ'
      };

      const filename = getLinkFileName(urlMetadata);
      expect(filename).toBe('youtube-dQw4w9WgXcQ.link');
    });

    it('should prefer title over video ID for YouTube when title available', () => {
      const urlMetadata: UrlMetadata = {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        type: 'youtube',
        isValid: true,
        videoId: 'dQw4w9WgXcQ',
        title: 'Never Gonna Give You Up'
      };

      const filename = getLinkFileName(urlMetadata);
      expect(filename).toBe('never-gonna-give-you-up.link');
    });

    it('should fall back to domain when no title', () => {
      const urlMetadata: UrlMetadata = {
        url: 'https://www.example.com/some/path',
        type: 'website',
        isValid: true
      };

      const filename = getLinkFileName(urlMetadata);
      expect(filename).toBe('example-com.link');
    });

    it('should handle URL as title gracefully', () => {
      const urlMetadata: UrlMetadata = {
        url: 'https://example.com',
        type: 'website',
        isValid: true,
        title: 'https://example.com' // Title is same as URL
      };

      const filename = getLinkFileName(urlMetadata);
      expect(filename).toBe('example-com.link');
    });

    it('should return fallback for invalid URL without title', () => {
      const urlMetadata: UrlMetadata = {
        url: 'not-a-valid-url',
        type: 'unknown',
        isValid: false
      };

      const filename = getLinkFileName(urlMetadata);
      expect(filename).toBe('link-file.link');
    });

    it('should collapse multiple spaces and dashes', () => {
      const urlMetadata: UrlMetadata = {
        url: 'https://example.com',
        type: 'website',
        isValid: true,
        title: 'Title   with    spaces'
      };

      const filename = getLinkFileName(urlMetadata);
      expect(filename).toBe('title-with-spaces.link');
    });
  });

  describe('isLinkFile', () => {
    it('should return true for .link files', () => {
      expect(isLinkFile('video.link')).toBe(true);
    });

    it('should return true for .LINK files (case insensitive)', () => {
      expect(isLinkFile('VIDEO.LINK')).toBe(true);
    });

    it('should return true for files in subdirectories', () => {
      expect(isLinkFile('/path/to/video.link')).toBe(true);
    });

    it('should return false for non-.link files', () => {
      expect(isLinkFile('video.mp4')).toBe(false);
      expect(isLinkFile('document.txt')).toBe(false);
      expect(isLinkFile('image.png')).toBe(false);
    });

    it('should return false for files with .link in the name but not extension', () => {
      expect(isLinkFile('my.link.file.txt')).toBe(false);
    });
  });

  describe('linkMetadataToUrlMetadata', () => {
    it('should convert link metadata to URL metadata', () => {
      const linkMetadata: LinkFileMetadata = {
        url: 'https://example.com',
        type: 'website',
        title: 'Example',
        created: '2025-01-15T10:30:00.000Z'
      };

      const urlMetadata = linkMetadataToUrlMetadata(linkMetadata);

      expect(urlMetadata.url).toBe('https://example.com');
      expect(urlMetadata.type).toBe('website');
      expect(urlMetadata.title).toBe('Example');
      expect(urlMetadata.isValid).toBe(true);
    });

    it('should include YouTube-specific fields', () => {
      const linkMetadata: LinkFileMetadata = {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        type: 'youtube',
        title: 'Test Video',
        videoId: 'dQw4w9WgXcQ',
        embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
        created: '2025-01-15T10:30:00.000Z'
      };

      const urlMetadata = linkMetadataToUrlMetadata(linkMetadata);

      expect(urlMetadata.videoId).toBe('dQw4w9WgXcQ');
      expect(urlMetadata.embedUrl).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    });
  });

  describe('getLinkThumbnail', () => {
    it('should return thumbnail URL for YouTube videos', () => {
      const linkMetadata: LinkFileMetadata = {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        type: 'youtube',
        videoId: 'dQw4w9WgXcQ',
        created: '2025-01-15T10:30:00.000Z'
      };

      const thumbnail = getLinkThumbnail(linkMetadata);
      expect(thumbnail).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg');
    });

    it('should prefer stored thumbnail over generated one', () => {
      const linkMetadata: LinkFileMetadata = {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        type: 'youtube',
        videoId: 'dQw4w9WgXcQ',
        thumbnail: 'https://custom.thumbnail.com/image.jpg',
        created: '2025-01-15T10:30:00.000Z'
      };

      const thumbnail = getLinkThumbnail(linkMetadata);
      expect(thumbnail).toBe('https://custom.thumbnail.com/image.jpg');
    });

    it('should return null for non-YouTube links', () => {
      const linkMetadata: LinkFileMetadata = {
        url: 'https://example.com',
        type: 'website',
        created: '2025-01-15T10:30:00.000Z'
      };

      const thumbnail = getLinkThumbnail(linkMetadata);
      expect(thumbnail).toBeNull();
    });

    it('should return null for YouTube type without videoId', () => {
      const linkMetadata: LinkFileMetadata = {
        url: 'https://youtube.com',
        type: 'youtube',
        created: '2025-01-15T10:30:00.000Z'
        // No videoId
      };

      const thumbnail = getLinkThumbnail(linkMetadata);
      expect(thumbnail).toBeNull();
    });
  });

  describe('validateLinkMetadata', () => {
    it('should return true for valid website metadata', () => {
      const metadata = {
        url: 'https://example.com',
        type: 'website',
        created: '2025-01-15T10:30:00.000Z'
      };

      expect(validateLinkMetadata(metadata)).toBe(true);
    });

    it('should return true for valid YouTube metadata with optional fields', () => {
      const metadata = {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        type: 'youtube',
        title: 'Test Video',
        videoId: 'dQw4w9WgXcQ',
        embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
        created: '2025-01-15T10:30:00.000Z'
      };

      expect(validateLinkMetadata(metadata)).toBe(true);
    });

    it('should return false for null', () => {
      expect(validateLinkMetadata(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(validateLinkMetadata(undefined)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(validateLinkMetadata('string')).toBe(false);
      expect(validateLinkMetadata(123)).toBe(false);
      expect(validateLinkMetadata([])).toBe(false);
    });

    it('should return false for missing url', () => {
      const metadata = {
        type: 'website',
        created: '2025-01-15T10:30:00.000Z'
      };

      expect(validateLinkMetadata(metadata)).toBe(false);
    });

    it('should return false for missing type', () => {
      const metadata = {
        url: 'https://example.com',
        created: '2025-01-15T10:30:00.000Z'
      };

      expect(validateLinkMetadata(metadata)).toBe(false);
    });

    it('should return false for missing created', () => {
      const metadata = {
        url: 'https://example.com',
        type: 'website'
      };

      expect(validateLinkMetadata(metadata)).toBe(false);
    });

    it('should return false for invalid type value', () => {
      const metadata = {
        url: 'https://example.com',
        type: 'invalid-type',
        created: '2025-01-15T10:30:00.000Z'
      };

      expect(validateLinkMetadata(metadata)).toBe(false);
    });

    it('should accept all valid type values', () => {
      const baseMetadata = {
        url: 'https://example.com',
        created: '2025-01-15T10:30:00.000Z'
      };

      expect(validateLinkMetadata({ ...baseMetadata, type: 'youtube' })).toBe(true);
      expect(validateLinkMetadata({ ...baseMetadata, type: 'website' })).toBe(true);
      expect(validateLinkMetadata({ ...baseMetadata, type: 'unknown' })).toBe(true);
    });

    it('should return false for wrong type of optional fields', () => {
      const metadata = {
        url: 'https://example.com',
        type: 'website',
        created: '2025-01-15T10:30:00.000Z',
        title: 123 // Should be string
      };

      expect(validateLinkMetadata(metadata)).toBe(false);
    });
  });
});
