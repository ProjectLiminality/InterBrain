/**
 * Issue Formatter Service - Formats feedback data into GitHub issue markdown
 *
 * Supports two modes:
 * 1. Raw format: Simple structured markdown with all data
 * 2. AI-refined format: Uses Claude API to generate better titles, summaries
 */

import { requestUrl } from 'obsidian';
import { CapturedError } from '../store/slice';

// ============================================================================
// TYPES
// ============================================================================

export interface FeedbackData {
  error?: CapturedError;
  userDescription: string;
  reproductionSteps?: string; // Optional user-provided steps (AI should NOT make these up)
  systemInfo: {
    pluginVersion: string;
    obsidianVersion: string;
    platform: string;
    platformVersion: string;
  };
  consoleLogs?: string;
  storeState?: string;
  navigationHistory?: string[];
  errorHash?: string; // Computed hash for cross-user deduplication
}

export interface RefinedIssue {
  title: string;
  body: string;
}

// ============================================================================
// ISSUE FORMATTER SERVICE
// ============================================================================

class IssueFormatterService {
  /**
   * Compute a stable error hash for cross-user deduplication.
   * Hash is based on error message + normalized stack frame.
   * This allows different users hitting the same bug to be grouped together.
   *
   * IMPORTANT: Line numbers in bundled code change between builds, so we
   * normalize them out for plugin code while keeping them for source files.
   */
  computeErrorHash(error: CapturedError | undefined): string | null {
    if (!error) return null;

    // Extract first meaningful stack frame (skip the error message line)
    const stackLines = error.stack?.split('\n') || [];
    let firstFrame = '';
    for (const line of stackLines) {
      // Match patterns like "at functionName (file.js:123:45)" or "at file.js:123:45"
      if (line.includes(':') && (line.includes('at ') || line.match(/:\d+:\d+/))) {
        firstFrame = line.trim();
        if (firstFrame) break;
      }
    }

    // Normalize the stack frame for stable hashing across builds/versions:
    // 1. For bundled plugin code (plugin:interbrain:XXXX), strip line numbers
    //    because they change with every build
    // 2. For regular source files, keep file:line but strip column (minor variance)
    let normalizedFrame = firstFrame
      .replace(/^\s*at\s+/, '') // Remove "at " prefix
      .replace(/\(eval at [^)]+\),?\s*/, '') // Remove eval wrapper
      .trim();

    // Handle plugin:interbrain:XXXX:YYY format - strip all line/col numbers
    // These change between builds, defeating cross-version deduplication
    if (normalizedFrame.includes('plugin:interbrain')) {
      normalizedFrame = normalizedFrame.replace(/plugin:interbrain:\d+(:\d+)?/g, 'plugin:interbrain');
    }

    // For regular files: keep filename and line, strip column
    // file.js:123:45 → file.js:123
    normalizedFrame = normalizedFrame
      .replace(/\(.*[/\\]([^/\\]+:\d+)(:\d+)?\)/, '$1') // Extract file:line from parens
      .replace(/.*[/\\]([^/\\]+:\d+)(:\d+)?$/, '$1'); // Extract from bare path

    // Create hash input: message + normalized stack location
    const hashInput = `${error.message}|${normalizedFrame}`;

    // Simple but consistent hash (djb2 algorithm)
    let hash = 5381;
    for (let i = 0; i < hashInput.length; i++) {
      hash = (hash * 33) ^ hashInput.charCodeAt(i);
    }

    // Convert to hex string with prefix for searchability
    const hashHex = (hash >>> 0).toString(16).padStart(8, '0');
    return `IB-ERR-${hashHex}`;
  }

  /**
   * Format feedback data as raw markdown
   */
  formatRaw(data: FeedbackData): string {
    const sections: string[] = [];

    // Header
    sections.push('## Bug Report\n');

    // Error info
    if (data.error) {
      sections.push(`**Error:** ${data.error.message}\n`);
    }

    // User description
    sections.push('**User Description:**');
    sections.push(data.userDescription || '_No description provided_');
    sections.push('');

    // Reproduction steps (only if user provided)
    if (data.reproductionSteps) {
      sections.push('**Reproduction Steps:**');
      sections.push(data.reproductionSteps);
      sections.push('');
    }

    // Environment
    sections.push('**Environment:**');
    sections.push(`- InterBrain: v${data.systemInfo.pluginVersion}`);
    sections.push(`- Obsidian: v${data.systemInfo.obsidianVersion}`);
    sections.push(`- Platform: ${data.systemInfo.platform}${data.systemInfo.platformVersion ? ` (${data.systemInfo.platformVersion})` : ''}`);
    sections.push('');

    // Stack trace
    if (data.error?.stack) {
      sections.push('**Stack Trace:**');
      sections.push('```');
      sections.push(data.error.stack);
      sections.push('```');
      sections.push('');
    }

    // Console logs
    if (data.consoleLogs) {
      sections.push('<details>');
      sections.push('<summary>Console Logs (last 50)</summary>');
      sections.push('');
      sections.push('```');
      sections.push(data.consoleLogs);
      sections.push('```');
      sections.push('</details>');
      sections.push('');
    }

    // Store state
    if (data.storeState) {
      sections.push('<details>');
      sections.push('<summary>Store State Snapshot</summary>');
      sections.push('');
      sections.push('```json');
      sections.push(data.storeState);
      sections.push('```');
      sections.push('</details>');
      sections.push('');
    }

    // Navigation history
    if (data.navigationHistory && data.navigationHistory.length > 0) {
      sections.push('**Navigation History:**');
      sections.push(data.navigationHistory.map((id) => `- ${id}`).join('\n'));
      sections.push('');
    }

    // Error hash for cross-user deduplication
    if (data.errorHash) {
      sections.push(`**Error ID:** \`${data.errorHash}\``);
      sections.push('');
    }

    // Footer
    sections.push('---');
    sections.push('_Auto-generated by InterBrain Feedback System_');

    return sections.join('\n');
  }

  /**
   * Format feedback data with AI refinement
   *
   * Uses Claude API to:
   * - Generate a concise, descriptive title
   * - Summarize the issue
   * - Infer reproduction steps
   * - Suggest investigation areas
   */
  async formatWithAi(data: FeedbackData): Promise<RefinedIssue> {
    // Try to use Claude API if available
    try {
      const refined = await this.callClaudeApi(data);
      if (refined) {
        return refined;
      }
    } catch (err) {
      console.warn('[IssueFormatter] AI refinement failed, using raw format:', err);
    }

    // Fallback to raw format
    return {
      title: this.generateSimpleTitle(data),
      body: this.formatRaw(data),
    };
  }

  /**
   * Generate a simple title from the error/description
   */
  private generateSimpleTitle(data: FeedbackData): string {
    if (data.error) {
      const errorLine = data.error.message.split('\n')[0].slice(0, 60);
      return `Bug: ${errorLine}`;
    }

    const descLine = data.userDescription.split('\n')[0].slice(0, 60);
    return `Bug: ${descLine}`;
  }

  /**
   * Call Claude API for issue refinement
   */
  private async callClaudeApi(data: FeedbackData): Promise<RefinedIssue | null> {
    // Import settings service to check for API key
    const { settingsStatusService } = await import(
      '../../settings/settings-status-service'
    );

    const apiKey = settingsStatusService.getSettings()?.claudeApiKey;
    if (!apiKey) {
      return null; // No API key, can't use AI
    }

    const prompt = this.buildPrompt(data);

    // Use Obsidian's requestUrl to avoid CORS issues
    const response = await requestUrl({
      url: 'https://api.anthropic.com/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
      throw: false, // Don't throw on error status codes
    });

    if (response.status !== 200) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const result = response.json;
    const content = result.content?.[0]?.text;

    if (!content) {
      return null;
    }

    // Parse the structured response
    return this.parseAiResponse(content, data);
  }

  /**
   * Build the prompt for Claude
   */
  private buildPrompt(data: FeedbackData): string {
    // Note: We intentionally do NOT ask AI to generate reproduction steps or investigation areas.
    // - Reproduction steps should only come from user (if provided)
    // - Investigation areas require codebase knowledge we don't have
    return `You are analyzing a bug report for InterBrain, an Obsidian plugin for knowledge gardening.

Please analyze this bug report and provide:
1. A concise title (max 60 chars) - describe the core issue
2. A 1-2 sentence summary - what is happening and when
3. Category: Bug / UX Issue / Performance / Crash
4. Estimated complexity: Trivial / Minor / Moderate / Complex

Error: ${data.error?.message || 'No error message'}
Stack trace: ${data.error?.stack?.slice(0, 500) || 'None'}
User description: ${data.userDescription}
${data.reproductionSteps ? `User-provided reproduction steps: ${data.reproductionSteps}` : ''}

Environment:
- InterBrain plugin version: ${data.systemInfo.pluginVersion}
- Obsidian version: ${data.systemInfo.obsidianVersion}
- Operating system: ${data.systemInfo.platform} ${data.systemInfo.platformVersion || ''}

Respond in this exact format:
TITLE: [your title]
SUMMARY: [your summary]
CATEGORY: [category]
COMPLEXITY: [complexity]`;
  }

  /**
   * Parse Claude's response into structured format
   */
  private parseAiResponse(content: string, data: FeedbackData): RefinedIssue {
    // Extract fields from response
    const titleMatch = content.match(/TITLE:\s*(.+)/);
    const summaryMatch = content.match(/SUMMARY:\s*(.+)/);
    const categoryMatch = content.match(/CATEGORY:\s*(.+)/);
    const complexityMatch = content.match(/COMPLEXITY:\s*(.+)/);

    const title = titleMatch?.[1]?.trim() || this.generateSimpleTitle(data);
    const summary = summaryMatch?.[1]?.trim() || data.userDescription;
    const category = categoryMatch?.[1]?.trim() || 'Bug';
    const complexity = complexityMatch?.[1]?.trim() || 'Unknown';

    // Build refined body
    const sections: string[] = [];

    sections.push(`## Bug Report: ${title}\n`);
    sections.push(`**Summary:** ${summary}\n`);
    sections.push(`**Category:** ${category}\n`);
    sections.push(`**Estimated Complexity:** ${complexity}\n`);

    // Only include reproduction steps if user provided them (never AI-generated)
    if (data.reproductionSteps) {
      sections.push('**Reproduction Steps:**');
      sections.push(data.reproductionSteps);
      sections.push('');
    }

    if (data.error) {
      sections.push('**Error:**');
      sections.push(`\`${data.error.message}\``);
      sections.push('');
    }

    // Error hash for cross-user deduplication
    if (data.errorHash) {
      sections.push(`**Error ID:** \`${data.errorHash}\``);
      sections.push('');
    }

    // Raw data in collapsible
    sections.push('<details>');
    sections.push('<summary>Raw Data</summary>');
    sections.push('');
    sections.push(this.formatRaw(data));
    sections.push('</details>');
    sections.push('');

    sections.push('---');
    sections.push('_AI-refined by InterBrain Feedback System_');

    return {
      title: `Bug: ${title}`,
      body: sections.join('\n'),
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const issueFormatterService = new IssueFormatterService();
