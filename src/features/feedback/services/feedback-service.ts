/**
 * Feedback Service - Core orchestration for bug reporting
 *
 * Responsibilities:
 * - Collect all data streams (error, logs, state, system info)
 * - Sanitize sensitive data before submission
 * - Check for duplicate issues via gh CLI
 * - Submit issues to GitHub via gh CLI
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { useInterBrainStore } from '../../../core/store/interbrain-store';
import { serviceManager } from '../../../core/services/service-manager';
import { errorCaptureService } from './error-capture-service';
import { issueFormatterService, FeedbackData } from './issue-formatter-service';
import { CapturedError } from '../store/slice';

const execAsync = promisify(exec);

/**
 * Get environment with extended PATH for gh CLI detection
 * Obsidian/Electron may not have the full shell PATH
 */
function getExtendedEnv(): Record<string, string> {
  const nodeProcess = (globalThis as any).process;
  const env = { ...nodeProcess?.env };

  // Add common gh install locations to PATH
  const extraPaths = [
    '/opt/homebrew/bin',      // macOS ARM Homebrew
    '/usr/local/bin',         // macOS Intel Homebrew / Linux
    '/usr/bin',               // System
    `${env.HOME}/.local/bin`, // Linux user installs
  ].filter(Boolean);

  env.PATH = [...extraPaths, env.PATH].join(':');
  return env;
}

// ============================================================================
// TYPES
// ============================================================================

export interface SubmitResult {
  success: boolean;
  issueUrl?: string;
  error?: string;
}

export interface SystemInfo {
  pluginVersion: string;
  obsidianVersion: string;
  platform: string;
  platformVersion: string;
}

// ============================================================================
// FEEDBACK SERVICE
// ============================================================================

class FeedbackService {
  private readonly REPO = 'ProjectLiminality/InterBrain';

  /**
   * Check if gh CLI is available and authenticated
   */
  async isGhCliAvailable(): Promise<boolean> {
    try {
      const env = getExtendedEnv();
      await execAsync('gh auth status', { env });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Submit a bug report to GitHub
   */
  async submitReport(
    error: CapturedError | null,
    userDescription: string,
    options: {
      includeLogs: boolean;
      includeState: boolean;
      useAiRefinement: boolean;
    }
  ): Promise<SubmitResult> {
    try {
      // Check rate limiting
      const store = useInterBrainStore.getState();
      if (!store.canSendReport()) {
        return {
          success: false,
          error: 'Rate limit exceeded. Please wait before sending another report.',
        };
      }

      // Check gh CLI availability
      const ghAvailable = await this.isGhCliAvailable();
      if (!ghAvailable) {
        return {
          success: false,
          error: 'GitHub CLI not available. Please run `gh auth login` first.',
        };
      }

      // Collect feedback data
      const feedbackData = this.collectFeedbackData(
        error,
        userDescription,
        options
      );

      // Check for duplicate issues
      const duplicateUrl = await this.checkForDuplicate(feedbackData);
      if (duplicateUrl) {
        // Add comment to existing issue instead
        await this.addCommentToIssue(duplicateUrl, feedbackData, options.useAiRefinement);
        store.recordReportSent();
        return {
          success: true,
          issueUrl: duplicateUrl,
          error: 'Added comment to existing issue',
        };
      }

      // Format the issue body
      let issueBody: string;
      let issueTitle: string;

      if (options.useAiRefinement) {
        const refined = await issueFormatterService.formatWithAi(feedbackData);
        issueBody = refined.body;
        issueTitle = refined.title;
      } else {
        issueBody = issueFormatterService.formatRaw(feedbackData);
        issueTitle = this.generateTitle(error, userDescription);
      }

      // Create the issue
      const issueUrl = await this.createIssue(issueTitle, issueBody);
      store.recordReportSent();

      return {
        success: true,
        issueUrl,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Failed to submit report: ${errorMessage}`,
      };
    }
  }

  /**
   * Collect all feedback data
   */
  private collectFeedbackData(
    error: CapturedError | null,
    userDescription: string,
    options: { includeLogs: boolean; includeState: boolean }
  ): FeedbackData {
    const systemInfo = this.getSystemInfo();
    const navigationHistory = this.getNavigationHistory();

    return {
      error: error || undefined,
      userDescription,
      systemInfo,
      consoleLogs: options.includeLogs
        ? errorCaptureService.getLogsAsString()
        : undefined,
      storeState: options.includeState
        ? this.getSanitizedStoreState()
        : undefined,
      navigationHistory,
    };
  }

  /**
   * Get system information
   */
  private getSystemInfo(): SystemInfo {
    const app = serviceManager.getApp() as any;
    const manifest = app?.plugins?.manifests?.['interbrain'];

    // Get platform info from navigator (works in Electron environment)
    const platform = globalThis.navigator?.platform || 'unknown';
    const userAgent = globalThis.navigator?.userAgent || '';

    return {
      pluginVersion: manifest?.version || 'unknown',
      obsidianVersion: app?.appVersion || 'unknown',
      platform: platform,
      platformVersion: userAgent,
    };
  }

  /**
   * Get navigation history from store
   */
  private getNavigationHistory(): string[] {
    const state = useInterBrainStore.getState();
    const history = state.navigationHistory?.history || [];
    return history
      .slice(-10)
      .filter((entry) => entry.nodeId)
      .map((entry) => entry.nodeId as string);
  }

  /**
   * Get sanitized store state (remove sensitive data)
   */
  private getSanitizedStoreState(): string {
    const state = useInterBrainStore.getState();

    // Create a sanitized copy with only safe fields
    const sanitized: Record<string, unknown> = {
      spatialLayout: state.spatialLayout,
      selectedNode: state.selectedNode
        ? {
            id: state.selectedNode.id,
            name: state.selectedNode.name,
            type: state.selectedNode.type,
          }
        : null,
      copilotMode: {
        isActive: state.copilotMode.isActive,
        conversationPartner: state.copilotMode.conversationPartner
          ? '[REDACTED]'
          : null,
      },
      editMode: {
        isActive: state.editMode.isActive,
      },
      creationState: {
        isCreating: state.creationState.isCreating,
      },
      searchInterface: {
        isActive: state.searchInterface.isActive,
        currentQuery: state.searchInterface.currentQuery,
      },
      constellationData: {
        nodeCount: state.constellationData.positions?.size || 0,
      },
      // Explicitly exclude sensitive fields:
      // - claudeApiKey (from settings)
      // - radiclePassphrase
      // - any file paths
    };

    return JSON.stringify(sanitized, null, 2);
  }

  /**
   * Generate a simple issue title
   */
  private generateTitle(
    error: CapturedError | null,
    userDescription: string
  ): string {
    if (error) {
      // Take first line of error message, max 60 chars
      const errorLine = error.message.split('\n')[0].slice(0, 60);
      return `Bug: ${errorLine}`;
    }

    // Use user description, max 60 chars
    const descLine = userDescription.split('\n')[0].slice(0, 60);
    return `Bug: ${descLine}`;
  }

  /**
   * Check if a similar issue already exists
   */
  private async checkForDuplicate(
    data: FeedbackData
  ): Promise<string | null> {
    if (!data.error) return null;

    try {
      // Search for issues with similar error message
      const searchQuery = data.error.message.slice(0, 50).replace(/"/g, '\\"');
      const env = getExtendedEnv();
      const { stdout } = await execAsync(
        `gh issue list --repo ${this.REPO} --state open --search "${searchQuery}" --json url --limit 1`,
        { env }
      );

      const issues = JSON.parse(stdout);
      if (issues.length > 0) {
        return issues[0].url;
      }
    } catch {
      // Search failed, proceed with new issue
    }

    return null;
  }

  /**
   * Add a comment to an existing issue
   */
  private async addCommentToIssue(
    issueUrl: string,
    data: FeedbackData,
    useAiRefinement: boolean
  ): Promise<void> {
    let comment: string;

    if (useAiRefinement) {
      // Use AI to generate a refined comment
      try {
        comment = await this.generateAiComment(data);
      } catch (err) {
        console.warn('[FeedbackService] AI comment generation failed, using raw:', err);
        comment = this.generateRawComment(data);
      }
    } else {
      comment = this.generateRawComment(data);
    }

    // Extract issue number from URL
    const issueNumber = issueUrl.split('/').pop();

    // Use temp file to avoid escaping issues with complex markdown
    const tempFile = `/tmp/interbrain-comment-${Date.now()}.md`;
    const fs = require('fs');
    await fs.promises.writeFile(tempFile, comment, 'utf-8');

    try {
      const env = getExtendedEnv();
      await execAsync(
        `gh issue comment ${issueNumber} --repo ${this.REPO} --body-file "${tempFile}"`,
        { env }
      );
    } finally {
      try {
        await fs.promises.unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Generate a raw comment (no AI)
   */
  private generateRawComment(data: FeedbackData): string {
    return `## Additional Report

Another user encountered this issue.

**User Description:**
${data.userDescription || 'No description provided'}

**Environment:**
- Plugin: ${data.systemInfo.pluginVersion}
- Platform: ${data.systemInfo.platform}

**Timestamp:** ${new Date().toISOString()}

<details>
<summary>Stack Trace</summary>

\`\`\`
${data.error?.stack || 'No stack trace'}
\`\`\`

</details>

---
*Auto-added by InterBrain Feedback System*`;
  }

  /**
   * Generate an AI-refined comment for duplicate issues
   *
   * Design principle: AI ENHANCES, never REPLACES raw data.
   * - AI summary at top for human readability
   * - Full raw data in collapsible section for completeness
   */
  private async generateAiComment(data: FeedbackData): Promise<string> {
    const { requestUrl } = await import('obsidian');
    const { settingsStatusService } = await import(
      '../../settings/settings-status-service'
    );

    const apiKey = settingsStatusService.getSettings()?.claudeApiKey;
    if (!apiKey) {
      throw new Error('No API key available');
    }

    const prompt = `You are analyzing an additional occurrence of a known bug in InterBrain (an Obsidian plugin).

This error was already reported. Generate a BRIEF analysis (3-5 sentences max) that highlights:
1. Whether this confirms the original report or adds new information
2. Any notable environmental differences (if apparent)
3. Pattern significance (e.g., "confirms reproducibility" or "suggests edge case")

Error: ${data.error?.message || 'No error message'}
User description: ${data.userDescription}
Platform: ${data.systemInfo.platform}
Plugin version: ${data.systemInfo.pluginVersion}

Respond with ONLY the analysis paragraph, no headers or formatting. Be concise.`;

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
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
      throw: false,
    });

    if (response.status !== 200) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const result = response.json;
    const aiAnalysis = result.content?.[0]?.text;

    if (!aiAnalysis) {
      throw new Error('No content in response');
    }

    // Build comment with AI summary + full raw data
    // AI enhances but never replaces - all raw data preserved
    return `## Additional Report

**AI Analysis:** ${aiAnalysis}

**User Description:**
${data.userDescription || '_No description provided_'}

**Environment:**
- Plugin: ${data.systemInfo.pluginVersion}
- Obsidian: ${data.systemInfo.obsidianVersion}
- Platform: ${data.systemInfo.platform}

**Timestamp:** ${new Date().toISOString()}

<details>
<summary>Full Stack Trace</summary>

\`\`\`
${data.error?.stack || 'No stack trace available'}
\`\`\`

</details>

${data.consoleLogs ? `<details>
<summary>Console Logs</summary>

\`\`\`
${data.consoleLogs}
\`\`\`

</details>

` : ''}${data.storeState ? `<details>
<summary>Store State</summary>

\`\`\`json
${data.storeState}
\`\`\`

</details>

` : ''}---
*AI-refined by InterBrain Feedback System*`;
  }

  /**
   * Create a new GitHub issue
   */
  private async createIssue(
    title: string,
    body: string
  ): Promise<string> {
    // Use a temp file to avoid shell escaping issues with the body
    // Note: Using require('fs') for Node.js fs in Electron (dynamic import doesn't work)
    const tempFile = `/tmp/interbrain-issue-${Date.now()}.md`;
    const fs = require('fs');
    await fs.promises.writeFile(tempFile, body, 'utf-8');

    try {
      const env = getExtendedEnv();
      const { stdout } = await execAsync(
        `gh issue create --repo ${this.REPO} --title "${title.replace(/"/g, '\\"')}" --body-file "${tempFile}" --label bug`,
        { env }
      );

      // Parse the issue URL from stdout
      const urlMatch = stdout.match(/https:\/\/github\.com\/[^\s]+/);
      return urlMatch ? urlMatch[0] : stdout.trim();
    } finally {
      // Clean up temp file
      try {
        await fs.promises.unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const feedbackService = new FeedbackService();
