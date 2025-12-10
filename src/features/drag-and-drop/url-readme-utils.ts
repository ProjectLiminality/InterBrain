/**
 * URL README Utilities
 *
 * Functions for generating README content and .link files from URLs.
 * Used by GitDreamNodeService for URL-based DreamNode creation.
 */

import { MediaFile } from '../dreamnode';
import { UrlMetadata, generateYouTubeIframe, generateMarkdownLink } from './url-utils';
import { createLinkFileContent, getLinkFileName } from './link-file-utils';
import { VaultService } from '../../core/services/vault-service';

/**
 * Result of writing a .link file
 */
export interface LinkFileResult {
  fileName: string;
  content: string;
  media: MediaFile;
}

/**
 * Write a .link file for URL metadata and return the media info
 */
export async function writeLinkFile(
  vaultService: VaultService,
  repoPath: string,
  urlMetadata: UrlMetadata,
  title: string
): Promise<LinkFileResult> {
  const linkFileName = getLinkFileName(urlMetadata, title);
  const linkFileContent = createLinkFileContent(urlMetadata, title);

  // Write .link file to repository
  const linkFilePath = vaultService.joinPath(repoPath, linkFileName);
  await vaultService.writeFile(linkFilePath, linkFileContent);

  return {
    fileName: linkFileName,
    content: linkFileContent,
    media: {
      path: linkFileName,
      absolutePath: vaultService.getFullPath(linkFilePath),
      type: urlMetadata.type,
      data: linkFileContent,
      size: linkFileContent.length
    }
  };
}

/**
 * Create README content for URLs
 */
export function createUrlReadmeContent(urlMetadata: UrlMetadata, title?: string): string {
  let content = '';

  if (title) {
    content += `# ${title}\n\n`;
  }

  if (urlMetadata.type === 'youtube' && urlMetadata.videoId) {
    content += generateYouTubeIframe(urlMetadata.videoId, 560, 315);
    content += '\n\n';
    content += `[${urlMetadata.title || 'YouTube Video'}](${urlMetadata.url})`;
  } else {
    content += generateMarkdownLink(urlMetadata.url, urlMetadata.title);
  }

  return content;
}

/**
 * Append URL content to an existing README
 */
export async function appendUrlToReadme(
  vaultService: VaultService,
  repoPath: string,
  urlMetadata: UrlMetadata
): Promise<void> {
  const readmePath = vaultService.joinPath(repoPath, 'README.md');
  const urlContent = createUrlReadmeContent(urlMetadata);

  try {
    const existingContent = await vaultService.readFile(readmePath);
    const newContent = existingContent + '\n\n' + urlContent;
    await vaultService.writeFile(readmePath, newContent);
  } catch {
    // Create new README if it doesn't exist
    await vaultService.writeFile(readmePath, urlContent);
  }
}

/**
 * Write a new README with URL content
 */
export async function writeUrlReadme(
  vaultService: VaultService,
  repoPath: string,
  urlMetadata: UrlMetadata,
  title: string
): Promise<void> {
  const readmePath = vaultService.joinPath(repoPath, 'README.md');
  const content = createUrlReadmeContent(urlMetadata, title);
  await vaultService.writeFile(readmePath, content);
}
