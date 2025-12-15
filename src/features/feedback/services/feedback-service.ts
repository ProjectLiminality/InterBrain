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
import { requestUrl } from 'obsidian';
import { useInterBrainStore } from '../../../core/store/interbrain-store';
import { serviceManager } from '../../../core/services/service-manager';
import { errorCaptureService } from './error-capture-service';
import { issueFormatterService, FeedbackData } from './issue-formatter-service';
import { settingsStatusService } from '../../settings/settings-status-service';
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
  wasDuplicate?: boolean; // True if report was added to existing issue
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
      reproductionSteps?: string;
    }
  ): Promise<SubmitResult> {
    try {
      // Check session limit (no time cooldown - modal throttle handles spam prevention)
      const store = useInterBrainStore.getState();

      if (!store.canSubmitReport()) {
        return {
          success: false,
          error: 'Session limit reached (10 reports). Please restart Obsidian to send more.',
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
      // Strategy 1: Hash-based (reliable, automatic) - for errors with stack traces
      // Strategy 2: AI semantic (when no hash but AI refinement enabled) - for manual reports
      let duplicateUrl = await this.checkForDuplicateByHash(feedbackData);

      if (!duplicateUrl && !feedbackData.errorHash && options.useAiRefinement) {
        // No hash available (manual report) - use AI semantic deduplication
        duplicateUrl = await this.checkForDuplicateByAi(feedbackData);
      }

      if (duplicateUrl) {
        // Add comment to existing issue instead of creating duplicate
        await this.addCommentToIssue(duplicateUrl, feedbackData, options.useAiRefinement);
        store.recordReportSent();
        return {
          success: true,
          issueUrl: duplicateUrl,
          wasDuplicate: true,
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
    options: { includeLogs: boolean; includeState: boolean; reproductionSteps?: string }
  ): FeedbackData {
    const systemInfo = this.getSystemInfo();
    const navigationHistory = this.getNavigationHistory();

    // Compute error hash for cross-user deduplication
    const errorHash = error
      ? issueFormatterService.computeErrorHash(error)
      : null;

    return {
      error: error || undefined,
      userDescription,
      reproductionSteps: options.reproductionSteps || undefined,
      systemInfo,
      consoleLogs: options.includeLogs
        ? errorCaptureService.getLogsAsString()
        : undefined,
      storeState: options.includeState
        ? this.getSanitizedStoreState()
        : undefined,
      navigationHistory,
      errorHash: errorHash || undefined,
    };
  }

  /**
   * Get system information
   */
  private getSystemInfo(): SystemInfo {
    const manifest = serviceManager.getManifest();

    // Parse platform info for human-readable output
    const platformInfo = this.getPlatformInfo();

    return {
      pluginVersion: manifest?.version || 'unknown',
      obsidianVersion: this.getObsidianVersion(),
      platform: platformInfo.os,
      platformVersion: platformInfo.details,
    };
  }

  /**
   * Get Obsidian version from userAgent or runtime
   */
  private getObsidianVersion(): string {
    // Try to get from userAgent first (most reliable)
    // Note: userAgent shows "obsidian/1.8.10" (lowercase)
    const userAgent = globalThis.navigator?.userAgent || '';
    const obsidianMatch = userAgent.match(/obsidian\/(\d+\.\d+\.\d+)/i);
    if (obsidianMatch) {
      return obsidianMatch[1];
    }

    // Fallback: try undocumented app properties
    const app = serviceManager.getApp() as any;
    if (app?.version) return app.version;
    if (app?.appVersion) return app.appVersion;

    return 'unknown';
  }

  /**
   * Get detailed platform information
   */
  private getPlatformInfo(): { os: string; details: string } {
    const userAgent = globalThis.navigator?.userAgent || '';
    const platform = globalThis.navigator?.platform || '';

    // Detect OS from userAgent (more reliable than navigator.platform)
    let os = 'Unknown';
    let details = '';

    if (userAgent.includes('Mac OS X')) {
      os = 'macOS';
      // Extract version: "Mac OS X 10_15_7" or "Mac OS X 14_1"
      const match = userAgent.match(/Mac OS X (\d+[._]\d+(?:[._]\d+)?)/);
      if (match) {
        details = match[1].replace(/_/g, '.');
      }
      // Detect Apple Silicon vs Intel
      if (platform === 'MacIntel') {
        // Check if running under Rosetta or native ARM
        // In Electron, we can check process.arch if available
        const nodeProcess = (globalThis as any).process;
        if (nodeProcess?.arch === 'arm64') {
          details += ' (Apple Silicon)';
        } else if (nodeProcess?.arch === 'x64') {
          details += ' (Intel)';
        }
      }
    } else if (userAgent.includes('Windows')) {
      os = 'Windows';
      const match = userAgent.match(/Windows NT (\d+\.\d+)/);
      if (match) {
        // Map NT version to Windows version
        const ntVersion = match[1];
        const windowsVersions: Record<string, string> = {
          '10.0': '10/11',
          '6.3': '8.1',
          '6.2': '8',
          '6.1': '7',
        };
        details = windowsVersions[ntVersion] || ntVersion;
      }
    } else if (userAgent.includes('Linux')) {
      os = 'Linux';
      if (userAgent.includes('Ubuntu')) {
        details = 'Ubuntu';
      } else if (userAgent.includes('Fedora')) {
        details = 'Fedora';
      } else if (userAgent.includes('Arch')) {
        details = 'Arch';
      }
    }

    return { os, details };
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
   * Check if a similar issue already exists using error hash.
   * This enables cross-user deduplication - Alice and Bob hitting the same
   * bug will have the same error hash, allowing their reports to be grouped.
   */
  private async checkForDuplicateByHash(
    data: FeedbackData
  ): Promise<string | null> {
    if (!data.errorHash) return null;

    try {
      // Search for issues containing this exact error hash
      // The hash format IB-ERR-XXXXXXXX is unique enough to avoid false positives
      const env = getExtendedEnv();
      const { stdout } = await execAsync(
        `gh issue list --repo ${this.REPO} --state open --search "${data.errorHash}" --json url --limit 1`,
        { env }
      );

      const issues = JSON.parse(stdout);
      if (issues.length > 0) {
        console.log(`[FeedbackService] Found duplicate by hash ${data.errorHash}:`, issues[0].url);
        return issues[0].url;
      }
    } catch (err) {
      console.warn('[FeedbackService] Hash-based duplicate check failed:', err);
    }

    return null;
  }

  /**
   * Check if a similar issue already exists using AI semantic matching.
   * Used for manual reports without stack traces where hash-based dedup isn't possible.
   * This bridges the gap by using AI to do what humans do: search before posting.
   *
   * Flow:
   * 1. Generate AI title + summary for the new report
   * 2. Compare against existing issues (which may be AI-refined or raw)
   * 3. AI determines if semantically the same bug
   */
  private async checkForDuplicateByAi(
    data: FeedbackData
  ): Promise<string | null> {
    const apiKey = settingsStatusService.getSettings()?.claudeApiKey;
    if (!apiKey) return null;

    try {
      // Step 1: Generate AI title + summary for the new report
      const refinedReport = await this.generateAiTitleAndSummary(data, apiKey);
      if (!refinedReport) {
        console.warn('[FeedbackService] Could not generate AI summary for dedup');
        return null;
      }

      // Step 2: Fetch recent open issues
      const env = getExtendedEnv();
      const { stdout } = await execAsync(
        `gh issue list --repo ${this.REPO} --state open --label bug --json number,title,body --limit 20`,
        { env }
      );

      const issues = JSON.parse(stdout);
      if (issues.length === 0) return null;

      // Step 3: Build comparison - extract title + summary/description from existing issues
      // Issues may be AI-refined (have "**Summary:**") or raw (just user description)
      const existingIssues = issues.map((issue: { number: number; title: string; body: string }) => {
        const body = issue.body || '';
        // Try to extract AI summary if present
        const summaryMatch = body.match(/\*\*Summary:\*\*\s*([^\n]+)/);
        const summary = summaryMatch?.[1]?.trim();
        // Fall back to first 200 chars of body (user description in raw format)
        const description = summary || body.slice(0, 200);
        return `#${issue.number}: ${issue.title}\n${description}`;
      }).join('\n\n---\n\n');

      // Step 4: Ask AI to compare refined report against existing issues
      const prompt = `You are helping deduplicate bug reports for InterBrain (an Obsidian plugin).

NEW REPORT (AI-refined title and summary):
Title: ${refinedReport.title}
Summary: ${refinedReport.summary}

EXISTING OPEN BUG REPORTS:
${existingIssues}

Task: Determine if the NEW REPORT describes the SAME problem as any existing issue.
- Match only if clearly the same bug/problem (same behavior, same functionality area)
- Don't match if just vaguely related or in the same general area
- Consider that existing issues may be phrased differently but describe the same underlying bug

Respond with ONLY one of:
- The issue number (e.g., "42") if this is a duplicate
- "NEW" if this is a novel issue

Your response:`;

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
          max_tokens: 50,
          messages: [{ role: 'user', content: prompt }],
        }),
        throw: false,
      });

      if (response.status !== 200) {
        console.warn('[FeedbackService] AI dedup comparison error:', response.status);
        return null;
      }

      const result = response.json;
      const aiResponse = result.content?.[0]?.text?.trim();

      if (!aiResponse || aiResponse.toUpperCase() === 'NEW') {
        return null;
      }

      // Extract issue number
      const issueNumber = parseInt(aiResponse, 10);
      if (isNaN(issueNumber)) {
        console.warn('[FeedbackService] AI returned unexpected response:', aiResponse);
        return null;
      }

      const matchedIssue = issues.find((i: { number: number }) => i.number === issueNumber);
      if (matchedIssue) {
        const issueUrl = `https://github.com/${this.REPO}/issues/${issueNumber}`;
        console.log(`[FeedbackService] AI found semantic duplicate: ${issueUrl}`);
        return issueUrl;
      }
    } catch (err) {
      console.warn('[FeedbackService] AI semantic dedup failed:', err);
    }

    return null;
  }

  /**
   * Generate just title and summary for deduplication comparison
   * (lighter than full formatWithAi, focused on what we need for matching)
   */
  private async generateAiTitleAndSummary(
    data: FeedbackData,
    apiKey: string
  ): Promise<{ title: string; summary: string } | null> {
    const prompt = `Analyze this bug report and provide a concise title and summary.

User description: ${data.userDescription}
${data.error?.message ? `Error: ${data.error.message}` : ''}

Respond in this exact format:
TITLE: [concise title, max 60 chars]
SUMMARY: [1-2 sentence summary of what's happening]`;

    try {
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
          max_tokens: 200,
          messages: [{ role: 'user', content: prompt }],
        }),
        throw: false,
      });

      if (response.status !== 200) return null;

      const content = response.json?.content?.[0]?.text;
      if (!content) return null;

      const titleMatch = content.match(/TITLE:\s*(.+)/);
      const summaryMatch = content.match(/SUMMARY:\s*(.+)/);

      return {
        title: titleMatch?.[1]?.trim() || data.userDescription.slice(0, 60),
        summary: summaryMatch?.[1]?.trim() || data.userDescription,
      };
    } catch {
      return null;
    }
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
- InterBrain: v${data.systemInfo.pluginVersion}
- Obsidian: v${data.systemInfo.obsidianVersion}
- Platform: ${data.systemInfo.platform}${data.systemInfo.platformVersion ? ` (${data.systemInfo.platformVersion})` : ''}

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

Environment:
- InterBrain plugin version: ${data.systemInfo.pluginVersion}
- Obsidian version: ${data.systemInfo.obsidianVersion}
- Operating system: ${data.systemInfo.platform} ${data.systemInfo.platformVersion || ''}

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
- InterBrain: v${data.systemInfo.pluginVersion}
- Obsidian: v${data.systemInfo.obsidianVersion}
- Platform: ${data.systemInfo.platform}${data.systemInfo.platformVersion ? ` (${data.systemInfo.platformVersion})` : ''}

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
