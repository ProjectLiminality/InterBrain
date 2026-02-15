/**
 * html-loader — Load local HTML files for iframe rendering in Obsidian/Electron
 *
 * Chromium blocks file:// in iframes. This module reads the HTML from disk,
 * rewrites relative resource paths (src="./foo.png") to Obsidian's app:// protocol
 * via getResourcePath(), and returns a blob URL safe to use as iframe src.
 */

import { App } from 'obsidian';

/**
 * Read an HTML file from the vault, resolve its relative resource paths to
 * Obsidian-safe app:// URLs, and return a blob URL for use as an iframe src.
 *
 * @param app        Obsidian App instance
 * @param htmlPath   Vault-relative path to the HTML file (e.g. "PRISM/index.html")
 * @returns          Blob URL string, or null on failure. Caller must revoke when done.
 */
export async function createHtmlBlobUrl(app: App, htmlPath: string): Promise<string | null> {
  try {
    const adapter = app.vault.adapter as any;

    // Derive the directory containing the HTML file (vault-relative)
    const dirPath = htmlPath.substring(0, htmlPath.lastIndexOf('/'));

    // Read the raw HTML content
    const htmlContent = await app.vault.adapter.read(htmlPath);

    // Replace relative paths in src and href attributes with Obsidian resource URLs
    // Matches: src="./foo.png"  src="foo.png"  href="./styles.css"
    // Excludes: absolute URLs (http://, https://, data:, //, #, mailto:, javascript:)
    const processed = htmlContent.replace(
      /((?:src|href|poster)\s*=\s*["'])(\.\/)?((?!https?:\/\/|data:|\/\/|#|mailto:|javascript:)[^"']+)(["'])/gi,
      (_match: string, prefix: string, dotSlash: string, relativePath: string, suffix: string) => {
        const vaultRelativePath = `${dirPath}/${relativePath}`;
        const resourceUrl = adapter.getResourcePath(vaultRelativePath);
        return `${prefix}${resourceUrl}${suffix}`;
      }
    );

    // Create blob URL
    const blob = new Blob([processed], { type: 'text/html' });
    return URL.createObjectURL(blob);
  } catch (err) {
    console.error('Failed to create HTML blob URL:', err);
    return null;
  }
}

/**
 * Revoke a previously created blob URL to free memory.
 */
export function revokeHtmlBlobUrl(blobUrl: string | null): void {
  if (blobUrl && blobUrl.startsWith('blob:')) {
    URL.revokeObjectURL(blobUrl);
  }
}
