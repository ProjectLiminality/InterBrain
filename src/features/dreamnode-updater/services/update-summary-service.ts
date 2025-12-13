/**
 * Update Summary Service
 *
 * Uses LLM to generate user-friendly summaries of git updates
 * Translates technical commit messages into plain English focused on UX impact
 */

import { ClaudeProvider, LLMMessage } from '../../conversational-copilot/services/llm-provider';
import { FetchResult } from '../../social-resonance-filter/services/git-sync-service';

export interface UpdateSummary {
  userFacingChanges: string;
  technicalImprovements: string;
  overallImpact: string;
}

export class UpdateSummaryService {
  private llmProvider: ClaudeProvider | null = null;

  constructor(apiKey?: string) {
    if (apiKey) {
      this.llmProvider = new ClaudeProvider(apiKey);
    }
  }

  /**
   * Set or update the API key for LLM provider
   */
  setApiKey(apiKey: string): void {
    this.llmProvider = new ClaudeProvider(apiKey);
  }

  /**
   * Generate a user-friendly summary of updates
   */
  async generateUpdateSummary(fetchResult: FetchResult): Promise<UpdateSummary> {
    if (!this.llmProvider) {
      // Fallback to simple formatting if no LLM available
      return this.generateFallbackSummary(fetchResult);
    }

    try {
      const prompt = this.buildPrompt(fetchResult);
      const messages: LLMMessage[] = [
        {
          role: 'system',
          content: 'You are a helpful assistant that translates technical git commit messages into user-friendly summaries. Focus on what users will experience, not technical implementation details.'
        },
        {
          role: 'user',
          content: prompt
        }
      ];

      const response = await this.llmProvider.generateCompletion(messages, {
        model: 'claude-haiku-4-5', // Fast, cost-effective model for summaries
        maxTokens: 1024,
        temperature: 0.7
      });

      return this.parseResponse(response.content);
    } catch (error) {
      console.error('[UpdateSummary] LLM generation failed, using fallback:', error);
      return this.generateFallbackSummary(fetchResult);
    }
  }

  /**
   * Build the prompt for LLM
   */
  private buildPrompt(fetchResult: FetchResult): string {
    const commitList = fetchResult.commits.map((commit: any, i: number) =>
      `${i + 1}. ${commit.subject}${commit.body ? '\n   ' + commit.body : ''}`
    ).join('\n\n');

    return `I have ${fetchResult.commits.length} new commits available for a software update:

${commitList}

Stats: ${fetchResult.filesChanged} files changed, ${fetchResult.insertions} insertions(+), ${fetchResult.deletions} deletions(-)

Please provide a user-friendly summary in 3 sections:

1. **User-Facing Changes** (2-3 sentences): What new features, improvements, or fixes will users directly experience?
2. **Technical Improvements** (1-2 sentences): Summarize any performance, stability, or internal improvements as "more stable", "more performant", or "improved reliability".
3. **Overall Impact** (1 sentence): Brief recommendation - is this a critical update, nice-to-have improvement, or minor update?

Keep it concise, friendly, and focused on user experience. Use simple language.`;
  }

  /**
   * Parse LLM response into structured summary
   */
  private parseResponse(content: string): UpdateSummary {
    // Try to extract sections from LLM response
    const userFacingMatch = content.match(/User-Facing Changes[:\s]+(.*?)(?=Technical Improvements|Overall Impact|$)/is);
    const technicalMatch = content.match(/Technical Improvements[:\s]+(.*?)(?=Overall Impact|$)/is);
    const overallMatch = content.match(/Overall Impact[:\s]+(.*?)$/is);

    // Helper to clean markdown formatting
    const cleanMarkdown = (text: string): string => {
      return text
        .replace(/#{1,6}\s+/g, '') // Remove markdown headers
        .replace(/\*\*/g, '')      // Remove bold
        .replace(/\*/g, '')        // Remove italic
        .replace(/`/g, '')         // Remove code markers
        .trim();
    };

    return {
      userFacingChanges: cleanMarkdown(userFacingMatch?.[1] || 'Various updates and improvements'),
      technicalImprovements: cleanMarkdown(technicalMatch?.[1] || 'Improved stability and performance'),
      overallImpact: cleanMarkdown(overallMatch?.[1] || 'Recommended update for better experience')
    };
  }

  /**
   * Generate a simple fallback summary without LLM
   * Extracts key information from commit messages and presents them clearly
   */
  private generateFallbackSummary(fetchResult: FetchResult): UpdateSummary {
    const { commits, filesChanged, insertions, deletions } = fetchResult;

    // Categorize commits by keywords
    const features = commits.filter((c: any) =>
      /\b(add|feature|new|implement|create)\b/i.test(c.subject)
    );
    const fixes = commits.filter((c: any) =>
      /\b(fix|bug|issue|resolve|correct)\b/i.test(c.subject)
    );
    const improvements = commits.filter((c: any) =>
      /\b(improve|enhance|update|refactor|optimize|clean)\b/i.test(c.subject)
    );
    const docs = commits.filter((c: any) =>
      /\b(doc|readme|comment)\b/i.test(c.subject)
    );

    // Build user-facing summary from actual commit subjects
    const userFacingParts: string[] = [];

    if (features.length > 0) {
      const featureList = features.slice(0, 3).map((c: any) =>
        c.subject.replace(/^(add|feature|new|implement|create)[:\s]*/i, '').trim()
      );
      if (features.length <= 2) {
        userFacingParts.push(`New: ${featureList.join(', ')}`);
      } else {
        userFacingParts.push(`${features.length} new features including ${featureList[0]}`);
      }
    }

    if (fixes.length > 0) {
      const fixList = fixes.slice(0, 2).map((c: any) =>
        c.subject.replace(/^(fix|bug|issue|resolve|correct)[:\s]*/i, '').trim()
      );
      if (fixes.length <= 2) {
        userFacingParts.push(`Fixed: ${fixList.join(', ')}`);
      } else {
        userFacingParts.push(`${fixes.length} bug fixes`);
      }
    }

    if (improvements.length > 0 && userFacingParts.length < 2) {
      const improvementList = improvements.slice(0, 2).map((c: any) =>
        c.subject.replace(/^(improve|enhance|update|refactor|optimize|clean)[:\s]*/i, '').trim()
      );
      userFacingParts.push(`Improved: ${improvementList[0]}`);
    }

    const userFacing = userFacingParts.length > 0
      ? userFacingParts.join('. ') + '.'
      : `${commits.length} update${commits.length > 1 ? 's' : ''} with various improvements.`;

    // Build technical summary
    const technicalParts: string[] = [];

    if (filesChanged > 0) {
      technicalParts.push(`${filesChanged} file${filesChanged > 1 ? 's' : ''} changed`);
    }
    if (insertions > 0) {
      technicalParts.push(`${insertions} additions`);
    }
    if (deletions > 0) {
      technicalParts.push(`${deletions} deletions`);
    }
    if (docs.length > 0) {
      technicalParts.push(`documentation updates`);
    }

    const technical = technicalParts.length > 0
      ? technicalParts.join(', ') + '.'
      : 'Code improvements and refinements.';

    // Determine overall impact
    const isMajor = commits.length > 10 || filesChanged > 20;
    const hasCriticalFixes = fixes.some((c: any) =>
      /\b(critical|urgent|security|crash|data loss)\b/i.test(c.subject + c.body)
    );

    let overall = '';
    if (hasCriticalFixes) {
      overall = '⚠️ Important update with critical fixes';
    } else if (isMajor) {
      overall = '📦 Major update with significant changes';
    } else if (features.length > fixes.length) {
      overall = '✨ Nice update with new features';
    } else if (fixes.length > 0) {
      overall = '🔧 Helpful update with bug fixes';
    } else {
      overall = '📝 Minor update with refinements';
    }

    return {
      userFacingChanges: userFacing,
      technicalImprovements: technical,
      overallImpact: overall
    };
  }
}

// Singleton instance
let updateSummaryService: UpdateSummaryService | null = null;

export function initializeUpdateSummaryService(apiKey?: string): UpdateSummaryService {
  if (!updateSummaryService) {
    updateSummaryService = new UpdateSummaryService(apiKey);
  } else if (apiKey) {
    updateSummaryService.setApiKey(apiKey);
  }
  return updateSummaryService;
}

export function getUpdateSummaryService(): UpdateSummaryService {
  if (!updateSummaryService) {
    // Initialize with no API key - will use fallback summaries
    updateSummaryService = new UpdateSummaryService();
  }
  return updateSummaryService;
}
