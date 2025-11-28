/**
 * WebLinkAnalyzerService - AI-powered web page summarization
 *
 * Analyzes dropped web links using Claude API to generate personalized summaries
 * tailored to the user's profile from ~/.claude/CLAUDE.md
 */

import Anthropic from '@anthropic-ai/sdk';
import { Notice } from 'obsidian';
import { useInterBrainStore } from '../store/interbrain-store';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

const fsPromises = fs.promises;

interface PageContent {
  url: string;
  title: string;
  description: string;
  textContent: string;
  ogImage: string | null;
  allImages: string[];
}

interface AnalysisResult {
  title: string;
  summary: string;
  keyPoints: string[];
  relevance: string;
  representativeImageUrl: string | null;
}

/**
 * WebLinkAnalyzerService
 *
 * Provides AI-powered analysis of web pages, generating personalized summaries
 * based on the user's profile and downloading representative images.
 */
class WebLinkAnalyzerService {
  private vaultPath: string = '';

  /**
   * Initialize the service with vault path
   */
  initialize(vaultPath: string): void {
    this.vaultPath = vaultPath;
  }

  /**
   * Get API key from Obsidian plugin settings
   * Note: API key is stored in plugin.settings.claudeApiKey, not in Zustand store
   */
  private apiKey: string | null = null;

  /**
   * Set API key (called from plugin initialization)
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Get the configured API key
   */
  private getApiKey(): string | null {
    return this.apiKey;
  }

  /**
   * Main entry point: analyze a web link and update the DreamNode
   */
  async analyzeWebLink(
    nodeId: string,
    url: string,
    repoPath: string
  ): Promise<void> {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      new Notice('Anthropic API key not configured. Go to InterBrain settings to add your API key.');
      console.warn('WebLinkAnalyzerService: No API key configured');
      return;
    }

    try {
      console.log(`WebLinkAnalyzerService: Starting analysis of ${url}`);

      // Step 1: Fetch web page content
      const pageContent = await this.fetchPageContent(url);
      console.log(`WebLinkAnalyzerService: Fetched page "${pageContent.title}"`);

      // Step 2: Read user profile
      const userProfile = await this.getUserProfile();
      console.log(`WebLinkAnalyzerService: Loaded user profile (${userProfile.length} chars)`);

      // Step 3: Call Claude API for analysis
      const analysis = await this.generateSummary(pageContent, userProfile, apiKey);
      console.log(`WebLinkAnalyzerService: Generated summary for "${analysis.title}"`);

      // Step 4: Download representative image (if available)
      let imagePath: string | null = null;
      if (analysis.representativeImageUrl) {
        imagePath = await this.downloadImage(
          analysis.representativeImageUrl,
          path.join(this.vaultPath, repoPath)
        );
        if (imagePath) {
          console.log(`WebLinkAnalyzerService: Downloaded image to ${imagePath}`);
        }
      }

      // Step 5: Update DreamNode files
      await this.updateNodeContent(nodeId, repoPath, analysis, url, imagePath);

      // Success notification
      new Notice(`DreamNode enriched: ${analysis.title}`);
      console.log(`WebLinkAnalyzerService: Successfully enriched DreamNode ${nodeId}`);

    } catch (error) {
      console.error('WebLinkAnalyzerService: Analysis failed:', error);
      new Notice(`Could not analyze page: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetch web page content and extract relevant text
   */
  private async fetchPageContent(url: string): Promise<PageContent> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) InterBrain/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch page: HTTP ${response.status}`);
    }

    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? this.decodeHtmlEntities(titleMatch[1].trim()) : 'Untitled';

    // Extract meta description
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
                      html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);
    const description = descMatch ? this.decodeHtmlEntities(descMatch[1]) : '';

    // Extract og:image
    const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                         html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
    const ogImage = ogImageMatch ? ogImageMatch[1] : null;

    // Extract all image URLs for Claude to choose from
    const imgMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi);
    const allImages: string[] = [];
    for (const match of imgMatches) {
      const imgUrl = this.resolveUrl(match[1], url);
      if (imgUrl && !imgUrl.includes('data:') && !imgUrl.includes('tracking')) {
        allImages.push(imgUrl);
      }
    }

    // Extract text content (remove scripts, styles, and HTML tags)
    const cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Truncate to reasonable size for Claude
    const textContent = cleanHtml.substring(0, 8000);

    return {
      url,
      title,
      description,
      textContent,
      ogImage,
      allImages: allImages.slice(0, 10), // Limit to 10 images
    };
  }

  /**
   * Read user profile from ~/.claude/CLAUDE.md
   */
  private async getUserProfile(): Promise<string> {
    const claudeMdPath = path.join(os.homedir(), '.claude', 'CLAUDE.md');

    try {
      const content = await fsPromises.readFile(claudeMdPath, 'utf8');
      // Truncate if too long (keep first 4000 chars for context window efficiency)
      return content.substring(0, 4000);
    } catch (error) {
      console.warn('WebLinkAnalyzerService: Could not read ~/.claude/CLAUDE.md:', error);
      return 'No user profile available. Generate a general-purpose summary.';
    }
  }

  /**
   * Call Claude API to generate personalized summary
   */
  private async generateSummary(
    content: PageContent,
    userProfile: string,
    apiKey: string
  ): Promise<AnalysisResult> {
    const anthropic = new Anthropic({ apiKey });

    const systemPrompt = `You are analyzing a web page to create a personalized summary for a knowledge management system called InterBrain.

USER PROFILE:
${userProfile}

Based on the user's interests, role, and philosophical framework described above, create a summary that:
1. Highlights aspects most relevant to this specific user
2. Uses language and framing that resonates with their values
3. Extracts actionable insights aligned with their goals

You must respond with ONLY a valid JSON object (no markdown, no explanation) with this exact structure:
{
  "title": "A clear, descriptive title for this content",
  "summary": "2-3 paragraphs of personalized analysis",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "relevance": "Why this matters for this user specifically",
  "representativeImageUrl": "URL of the best image from the available images, or null if none suitable"
}`;

    const userPrompt = `Analyze this web page:

URL: ${content.url}
Page Title: ${content.title}
Meta Description: ${content.description}

Available Images:
- og:image: ${content.ogImage || 'none'}
- Other images: ${content.allImages.join(', ') || 'none'}

Page Content:
${content.textContent}

Choose the best representative image (prefer logos for organizations, infographics for concepts, og:image as fallback). Return null for representativeImageUrl if no good image is available.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      system: systemPrompt,
    });

    // Extract text content from response
    const responseText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');

    // Parse JSON response
    try {
      const result = JSON.parse(responseText);
      return {
        title: result.title || content.title,
        summary: result.summary || '',
        keyPoints: result.keyPoints || [],
        relevance: result.relevance || '',
        representativeImageUrl: result.representativeImageUrl || null,
      };
    } catch {
      console.error('WebLinkAnalyzerService: Failed to parse Claude response:', responseText);
      throw new Error('Failed to parse AI response');
    }
  }

  /**
   * Download image to the DreamNode repository
   */
  private async downloadImage(
    imageUrl: string,
    repoPath: string
  ): Promise<string | null> {
    try {
      // Extract filename from URL or generate one
      const urlPath = new globalThis.URL(imageUrl).pathname;
      let filename = path.basename(urlPath) || 'featured-image';

      // Ensure it has an extension
      if (!filename.includes('.')) {
        filename += '.jpg';
      }

      // Sanitize filename
      filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

      const imagePath = path.join(repoPath, filename);

      // Download image using Node.js http/https
      await new Promise<void>((resolve, reject) => {
        const protocol = imageUrl.startsWith('https') ? https : http;

        const request = protocol.get(imageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) InterBrain/1.0',
          },
        }, (response: typeof http.IncomingMessage) => {
          // Handle redirects
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            // Recursive call for redirect
            this.downloadImage(response.headers.location, repoPath)
              .then(result => {
                if (result) resolve();
                else reject(new Error('Redirect failed'));
              })
              .catch(reject);
            return;
          }

          if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode}`));
            return;
          }

          const fileStream = fs.createWriteStream(imagePath);
          response.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close();
            resolve();
          });

          fileStream.on('error', reject);
        });

        request.on('error', reject);
        request.setTimeout(30000, () => {
          request.destroy();
          reject(new Error('Download timeout'));
        });
      });

      return filename; // Return relative filename
    } catch (error) {
      console.warn('WebLinkAnalyzerService: Failed to download image:', error);
      return null;
    }
  }

  /**
   * Update DreamNode files with the analysis results
   */
  private async updateNodeContent(
    nodeId: string,
    repoPath: string,
    analysis: AnalysisResult,
    originalUrl: string,
    imagePath: string | null
  ): Promise<void> {
    const fullRepoPath = path.join(this.vaultPath, repoPath);

    // Generate README content
    const readmeContent = this.generateReadmeContent(analysis, originalUrl, imagePath);

    // Write README
    const readmePath = path.join(fullRepoPath, 'README.md');
    await fsPromises.writeFile(readmePath, readmeContent, 'utf8');

    // Update .udd file if we have an image
    if (imagePath) {
      await this.updateUddWithImage(fullRepoPath, imagePath);
    }

    // Update store with new title if different
    const store = useInterBrainStore.getState();
    const nodeData = store.realNodes.get(nodeId);
    if (nodeData && nodeData.node.name !== analysis.title) {
      const updatedNode = { ...nodeData.node, name: analysis.title };
      store.updateRealNode(nodeId, {
        ...nodeData,
        node: updatedNode,
        lastSynced: Date.now(),
      });
    }
  }

  /**
   * Generate rich README content from analysis
   */
  private generateReadmeContent(
    analysis: AnalysisResult,
    originalUrl: string,
    imagePath: string | null
  ): string {
    let content = `# ${analysis.title}\n\n`;

    content += `> **Source**: [${originalUrl}](${originalUrl})\n\n`;

    if (imagePath) {
      content += `![${analysis.title}](./${imagePath})\n\n`;
    }

    content += `## Summary\n\n${analysis.summary}\n\n`;

    if (analysis.keyPoints.length > 0) {
      content += `## Key Points\n\n`;
      for (const point of analysis.keyPoints) {
        content += `- ${point}\n`;
      }
      content += '\n';
    }

    if (analysis.relevance) {
      content += `## Relevance\n\n${analysis.relevance}\n\n`;
    }

    content += `---\n*AI-generated summary by InterBrain*\n`;

    return content;
  }

  /**
   * Update .udd file to reference the downloaded image as DreamTalk
   */
  private async updateUddWithImage(repoPath: string, imagePath: string): Promise<void> {
    const uddPath = path.join(repoPath, '.udd');

    try {
      const uddContent = await fsPromises.readFile(uddPath, 'utf8');
      const udd = JSON.parse(uddContent);

      // Set the image as dreamTalk
      udd.dreamTalk = imagePath;

      await fsPromises.writeFile(uddPath, JSON.stringify(udd, null, 2), 'utf8');
    } catch (error) {
      console.warn('WebLinkAnalyzerService: Failed to update .udd file:', error);
    }
  }

  /**
   * Decode HTML entities
   */
  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(/&nbsp;/g, ' ');
  }

  /**
   * Resolve relative URL to absolute
   */
  private resolveUrl(url: string, baseUrl: string): string | null {
    try {
      return new globalThis.URL(url, baseUrl).href;
    } catch {
      return null;
    }
  }
}

// Export singleton instance
export const webLinkAnalyzerService = new WebLinkAnalyzerService();
