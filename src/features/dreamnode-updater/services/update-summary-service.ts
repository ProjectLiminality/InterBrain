/**
 * Update Summary Service
 *
 * Generates natural-language briefings of recent collaboration activity.
 * Like a colleague catching you up on "what's been going on" with a shared project.
 */

import { generateAI, AIMessage, getInferenceService } from '../../ai-magic';
import { FetchResult } from '../../social-resonance-filter/services/git-sync-service';

/**
 * Simple summary result - just the briefing text
 */
export interface UpdateSummary {
  /** The briefing text - what's been happening */
  briefing: string;
  /** @deprecated Legacy field for backwards compatibility */
  userFacingChanges: string;
  /** @deprecated Legacy field for backwards compatibility */
  technicalImprovements: string;
  /** @deprecated Legacy field for backwards compatibility */
  overallImpact: string;
}

// Target ~200-300 chars for small updates, more for larger ones
const TARGET_CHARS = 250;

export class UpdateSummaryService {
  /**
   * Generate a natural briefing of recent activity
   */
  async generateUpdateSummary(fetchResult: FetchResult): Promise<UpdateSummary> {
    const inferenceService = getInferenceService();
    const aiAvailable = await inferenceService.isAnyProviderAvailable();

    if (!aiAvailable) {
      return this.generateFallbackSummary(fetchResult);
    }

    try {
      const input = this.formatActivityLog(fetchResult);
      const messages: AIMessage[] = [
        {
          role: 'system',
          content: `You brief someone on recent project activity. Read the activity log and write a friendly, natural summary - like a colleague saying "here's what's been happening..."

Keep it to about ${TARGET_CHARS} characters. If the input is already short, just make it flow nicely. If it's long, focus on the highlights.

Write plain prose, no headers or bullet points. Just conversational text.`
        },
        {
          role: 'user',
          content: input
        }
      ];

      const response = await generateAI(messages, 'trivial', {
        maxTokens: 300,
        temperature: 0.4
      });

      console.log(`[UpdateSummary] Generated via ${response.provider}`);
      const briefing = response.content.trim();
      return { briefing, userFacingChanges: briefing, technicalImprovements: '', overallImpact: '' };
    } catch (error) {
      console.error('[UpdateSummary] AI generation failed:', error);
      return this.generateFallbackSummary(fetchResult);
    }
  }

  /**
   * Format the activity log that gets sent to the LLM
   */
  private formatActivityLog(fetchResult: FetchResult): string {
    // Group commits by author
    const byAuthor = new Map<string, string[]>();
    for (const commit of fetchResult.commits) {
      const author = (commit as any).author || 'Someone';
      if (!byAuthor.has(author)) {
        byAuthor.set(author, []);
      }
      byAuthor.get(author)!.push(commit.subject);
    }

    // Build readable log
    const lines: string[] = [];
    lines.push(`Recent activity (${fetchResult.commits.length} changes, ${fetchResult.filesChanged} files):\n`);

    for (const [author, subjects] of byAuthor) {
      lines.push(`${author}:`);
      for (const subject of subjects) {
        lines.push(`  - ${subject}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Fallback when no AI is available
   */
  private generateFallbackSummary(fetchResult: FetchResult): UpdateSummary {
    const { commits, filesChanged, insertions, deletions } = fetchResult;

    // Group by author
    const byAuthor = new Map<string, string[]>();
    for (const commit of commits) {
      const author = (commit as any).author || 'Someone';
      if (!byAuthor.has(author)) {
        byAuthor.set(author, []);
      }
      byAuthor.get(author)!.push(commit.subject);
    }

    // Build natural text
    const parts: string[] = [];
    for (const [author, subjects] of byAuthor) {
      if (subjects.length === 1) {
        parts.push(`${author}: "${subjects[0]}"`);
      } else {
        parts.push(`${author} made ${subjects.length} changes`);
      }
    }

    const briefing = parts.join('. ') + ` (${filesChanged} files, +${insertions}/-${deletions})`;
    return { briefing, userFacingChanges: briefing, technicalImprovements: '', overallImpact: '' };
  }
}

// Singleton
let updateSummaryService: UpdateSummaryService | null = null;

export function initializeUpdateSummaryService(): UpdateSummaryService {
  if (!updateSummaryService) {
    updateSummaryService = new UpdateSummaryService();
  }
  return updateSummaryService;
}

export function getUpdateSummaryService(): UpdateSummaryService {
  if (!updateSummaryService) {
    updateSummaryService = new UpdateSummaryService();
  }
  return updateSummaryService;
}
