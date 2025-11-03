/**
 * Update Summary Service
 *
 * Uses LLM to generate user-friendly summaries of git updates
 * Translates technical commit messages into plain English focused on UX impact
 */

import { ClaudeProvider, LLMMessage } from '../features/conversational-copilot/services/llm-provider';
import { FetchResult } from './git-service';

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
    const commitList = fetchResult.commits.map((commit, i) =>
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

    return {
      userFacingChanges: userFacingMatch?.[1]?.trim() || 'Various updates and improvements',
      technicalImprovements: technicalMatch?.[1]?.trim() || 'Improved stability and performance',
      overallImpact: overallMatch?.[1]?.trim() || 'Recommended update for better experience'
    };
  }

  /**
   * Generate a simple fallback summary without LLM
   */
  private generateFallbackSummary(fetchResult: FetchResult): UpdateSummary {
    const { commits, filesChanged } = fetchResult;

    // Simple heuristics
    const isMajor = commits.length > 10 || filesChanged > 20;
    const hasFeatures = commits.some(c =>
      c.subject.toLowerCase().includes('add') ||
      c.subject.toLowerCase().includes('feature')
    );
    const hasFixes = commits.some(c =>
      c.subject.toLowerCase().includes('fix') ||
      c.subject.toLowerCase().includes('bug')
    );

    let userFacing = '';
    if (hasFeatures && hasFixes) {
      userFacing = `This update includes new features and bug fixes across ${commits.length} commits.`;
    } else if (hasFeatures) {
      userFacing = `This update adds new features and improvements.`;
    } else if (hasFixes) {
      userFacing = `This update fixes several bugs and issues.`;
    } else {
      userFacing = `This update includes various improvements and refinements.`;
    }

    const technical = `Improved stability and performance across ${filesChanged} files.`;

    const overall = isMajor
      ? 'Major update recommended for best experience'
      : 'Minor update with helpful improvements';

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
