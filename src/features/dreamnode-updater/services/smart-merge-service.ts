/**
 * Smart Merge Service
 *
 * Handles merge conflicts during cherry-pick operations using a layered approach:
 *
 * 1. **Search-Replace Logic**: For simple conflicts where both changes preserve
 *    a common anchor line, apply changes as content-addressed replacements.
 *
 * 2. **AI Magic Glue**: For complex conflicts that can't be resolved algorithmically,
 *    use an LLM to semantically merge the changes.
 *
 * This allows us to handle most README/markdown collaboration conflicts without
 * AI, while gracefully falling back to AI for edge cases.
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// ============================================
// TYPES
// ============================================

export interface ConflictInfo {
  /** The file path with conflicts */
  filePath: string;
  /** The base version (common ancestor) */
  baseContent: string;
  /** Our version (current HEAD) */
  oursContent: string;
  /** Their version (incoming commit) */
  theirsContent: string;
  /** The raw conflict markers version */
  conflictContent: string;
  /** Individual conflict regions */
  conflictRegions: ConflictRegion[];
}

export interface ConflictRegion {
  /** Line number where conflict starts */
  startLine: number;
  /** Our side of the conflict */
  ours: string;
  /** Their side of the conflict */
  theirs: string;
  /** Context before the conflict */
  contextBefore: string;
  /** Context after the conflict */
  contextAfter: string;
}

export interface MergeResolution {
  /** Whether resolution succeeded */
  success: boolean;
  /** The merged content (if successful) */
  mergedContent?: string;
  /** Resolution method used */
  method: 'search-replace' | 'ai-magic' | 'manual' | 'failed';
  /** Human-readable explanation of what was done */
  explanation?: string;
  /** Error message if failed */
  error?: string;
}

// ============================================
// CONFLICT DETECTION & PARSING
// ============================================

/**
 * Parse a file with conflict markers into structured regions
 */
export function parseConflictMarkers(content: string): ConflictRegion[] {
  const regions: ConflictRegion[] = [];
  const lines = content.split('\n');

  let i = 0;
  let contextBefore = '';

  while (i < lines.length) {
    // Look for conflict start
    if (lines[i].startsWith('<<<<<<<')) {
      const startLine = i;
      let ours = '';
      let theirs = '';

      // Collect "ours" section
      i++;
      while (i < lines.length && !lines[i].startsWith('=======')) {
        ours += lines[i] + '\n';
        i++;
      }

      // Skip separator
      i++;

      // Collect "theirs" section
      while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
        theirs += lines[i] + '\n';
        i++;
      }

      // Find context after
      i++;
      let contextAfter = '';
      let contextLines = 0;
      while (i < lines.length && !lines[i].startsWith('<<<<<<<') && contextLines < 3) {
        contextAfter += lines[i] + '\n';
        i++;
        contextLines++;
      }

      regions.push({
        startLine,
        ours: ours.trimEnd(),
        theirs: theirs.trimEnd(),
        contextBefore: contextBefore.trimEnd(),
        contextAfter: contextAfter.trimEnd()
      });

      contextBefore = contextAfter;
    } else {
      // Build up context for next conflict
      const contextLines = contextBefore.split('\n');
      if (contextLines.length > 3) {
        contextBefore = contextLines.slice(-3).join('\n');
      }
      contextBefore += (contextBefore ? '\n' : '') + lines[i];
      i++;
    }
  }

  return regions;
}

/**
 * Get conflict information for a file during a failed cherry-pick
 */
export async function getConflictInfo(
  repoPath: string,
  filePath: string
): Promise<ConflictInfo | null> {
  try {
    // Read the conflicted file
    const { readFile } = await import('fs/promises');
    const path = await import('path');
    const fullPath = path.join(repoPath, filePath);
    const conflictContent = await readFile(fullPath, 'utf-8');

    if (!conflictContent.includes('<<<<<<<')) {
      return null; // No conflicts in this file
    }

    // Get base, ours, theirs versions using git
    let baseContent = '';
    let oursContent = '';
    let theirsContent = '';

    try {
      const { stdout: base } = await execAsync(
        `git show :1:"${filePath}"`,
        { cwd: repoPath }
      );
      baseContent = base;
    } catch {
      // Base might not exist for new files
    }

    try {
      const { stdout: ours } = await execAsync(
        `git show :2:"${filePath}"`,
        { cwd: repoPath }
      );
      oursContent = ours;
    } catch {
      // Ours might not exist
    }

    try {
      const { stdout: theirs } = await execAsync(
        `git show :3:"${filePath}"`,
        { cwd: repoPath }
      );
      theirsContent = theirs;
    } catch {
      // Theirs might not exist
    }

    const conflictRegions = parseConflictMarkers(conflictContent);

    return {
      filePath,
      baseContent,
      oursContent,
      theirsContent,
      conflictContent,
      conflictRegions
    };
  } catch (error) {
    console.error('[SmartMerge] Failed to get conflict info:', error);
    return null;
  }
}

// ============================================
// SEARCH-REPLACE RESOLUTION
// ============================================

/**
 * Try to resolve a conflict using search-replace logic
 *
 * This works when both sides of a conflict:
 * 1. Share a common "anchor" line that both preserve
 * 2. Are both additions (not competing modifications)
 */
export function trySearchReplaceResolution(conflict: ConflictInfo): MergeResolution {
  // For now, handle the simple case: single conflict region
  if (conflict.conflictRegions.length !== 1) {
    return {
      success: false,
      method: 'search-replace',
      error: `Multiple conflict regions (${conflict.conflictRegions.length}) - too complex for search-replace`
    };
  }

  const region = conflict.conflictRegions[0];

  // Parse both sides to find common anchor lines
  const oursLines = region.ours.split('\n');
  const theirsLines = region.theirs.split('\n');

  // Check if both sides start with the same line (common anchor)
  if (oursLines[0] === theirsLines[0] && oursLines[0].trim().length > 0) {
    // Both sides preserve the same first line - this is the anchor!
    const anchor = oursLines[0];

    // Get the additions from each side (everything after the anchor)
    const oursAdditions = oursLines.slice(1).join('\n');
    const theirsAdditions = theirsLines.slice(1).join('\n');

    // Combine: anchor + ours additions + theirs additions
    const merged = anchor + '\n' + oursAdditions + '\n' + theirsAdditions;

    // Now reconstruct the full file
    const mergedContent = reconstructFileWithResolution(
      conflict.conflictContent,
      region,
      merged
    );

    return {
      success: true,
      mergedContent,
      method: 'search-replace',
      explanation: `Both changes add content after "${anchor.substring(0, 50)}..." - combined both additions.`
    };
  }

  // Check if both sides end with the same line (trailing anchor)
  const oursLast = oursLines[oursLines.length - 1];
  const theirsLast = theirsLines[theirsLines.length - 1];

  if (oursLast === theirsLast && oursLast.trim().length > 0) {
    // Both preserve same ending - combine the beginnings
    const anchor = oursLast;
    const oursAdditions = oursLines.slice(0, -1).join('\n');
    const theirsAdditions = theirsLines.slice(0, -1).join('\n');

    const merged = oursAdditions + '\n' + theirsAdditions + '\n' + anchor;

    const mergedContent = reconstructFileWithResolution(
      conflict.conflictContent,
      region,
      merged
    );

    return {
      success: true,
      mergedContent,
      method: 'search-replace',
      explanation: `Both changes add content before "${anchor.substring(0, 50)}..." - combined both additions.`
    };
  }

  // Check if one side is a superset (contains all lines of the other)
  const oursSet = new Set(oursLines.filter(l => l.trim()));
  const theirsSet = new Set(theirsLines.filter(l => l.trim()));

  const oursInTheirs = [...oursSet].every(line => theirsSet.has(line));
  const theirsInOurs = [...theirsSet].every(line => oursSet.has(line));

  if (oursInTheirs && !theirsInOurs) {
    // Theirs contains all of ours plus more - take theirs
    const mergedContent = reconstructFileWithResolution(
      conflict.conflictContent,
      region,
      region.theirs
    );
    return {
      success: true,
      mergedContent,
      method: 'search-replace',
      explanation: 'Incoming changes include all local changes plus additions - accepted incoming.'
    };
  }

  if (theirsInOurs && !oursInTheirs) {
    // Ours contains all of theirs plus more - keep ours
    const mergedContent = reconstructFileWithResolution(
      conflict.conflictContent,
      region,
      region.ours
    );
    return {
      success: true,
      mergedContent,
      method: 'search-replace',
      explanation: 'Local changes include all incoming changes plus additions - kept local.'
    };
  }

  return {
    success: false,
    method: 'search-replace',
    error: 'No common anchor found and changes are not subsets - requires AI resolution'
  };
}

/**
 * Reconstruct a file by replacing a conflict region with resolved content
 */
function reconstructFileWithResolution(
  conflictContent: string,
  region: ConflictRegion,
  resolvedContent: string
): string {
  const lines = conflictContent.split('\n');
  const result: string[] = [];

  let i = 0;
  while (i < lines.length) {
    if (lines[i].startsWith('<<<<<<<')) {
      // Skip the entire conflict block
      while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
        i++;
      }
      i++; // Skip the >>>>>>> line

      // Insert resolved content
      result.push(resolvedContent);
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  return result.join('\n');
}

// ============================================
// AI MAGIC GLUE RESOLUTION
// ============================================

/**
 * Resolve a conflict using AI (Claude)
 */
export async function resolveWithAI(
  conflict: ConflictInfo
): Promise<MergeResolution> {
  try {
    // Dynamic import to avoid circular dependencies
    const { getInferenceService } = await import('../../ai-magic/services/inference-service');

    const inferenceService = getInferenceService();
    if (!inferenceService) {
      return {
        success: false,
        method: 'ai-magic',
        error: 'AI Magic service not available'
      };
    }

    const prompt = buildMergePrompt(conflict);

    const systemPrompt = `You are a git merge conflict resolver. Your job is to intelligently merge conflicting changes while preserving the intent of both sides.

Rules:
1. Always preserve ALL content from both sides unless they're truly duplicates
2. Maintain consistent formatting and style
3. If both sides add similar sections, include both
4. Never lose information - when in doubt, include it
5. Return ONLY the merged content, no explanations or markdown code blocks`;

    const response = await inferenceService.generate({
      prompt: `${systemPrompt}\n\n${prompt}`,
      maxTokens: 2000
    });

    if (!response.success || !response.content) {
      return {
        success: false,
        method: 'ai-magic',
        error: response.error || 'AI returned empty response'
      };
    }

    // Clean up AI response (remove any markdown code blocks if present)
    let mergedContent = response.content.trim();
    if (mergedContent.startsWith('```')) {
      mergedContent = mergedContent.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
    }

    // Reconstruct full file with AI resolution
    const fullMerged = reconstructFileWithResolution(
      conflict.conflictContent,
      conflict.conflictRegions[0],
      mergedContent
    );

    return {
      success: true,
      mergedContent: fullMerged,
      method: 'ai-magic',
      explanation: 'AI analyzed both changes and merged them semantically.'
    };
  } catch (error: any) {
    return {
      success: false,
      method: 'ai-magic',
      error: `AI resolution failed: ${error.message}`
    };
  }
}

function buildMergePrompt(conflict: ConflictInfo): string {
  const region = conflict.conflictRegions[0];

  return `Merge these two conflicting changes to ${conflict.filePath}:

CONTEXT BEFORE:
${region.contextBefore || '(start of relevant section)'}

VERSION A (current):
${region.ours}

VERSION B (incoming):
${region.theirs}

CONTEXT AFTER:
${region.contextAfter || '(end of relevant section)'}

Merge both changes intelligently. Both changes should be preserved - they are additions from different contributors.`;
}

// ============================================
// MAIN RESOLUTION FLOW
// ============================================

/**
 * Attempt to resolve all conflicts in a repository
 *
 * Uses layered approach:
 * 1. Try search-replace for each conflict
 * 2. Fall back to AI for unresolved conflicts
 */
export async function resolveConflicts(
  repoPath: string,
  options: { useAI?: boolean } = {}
): Promise<{
  success: boolean;
  resolutions: Map<string, MergeResolution>;
  summary: string;
}> {
  const { useAI = true } = options;
  const resolutions = new Map<string, MergeResolution>();

  try {
    // Get list of conflicted files
    const { stdout } = await execAsync(
      'git diff --name-only --diff-filter=U',
      { cwd: repoPath }
    );

    const conflictedFiles = stdout.trim().split('\n').filter(f => f);

    if (conflictedFiles.length === 0) {
      return {
        success: true,
        resolutions,
        summary: 'No conflicts to resolve'
      };
    }

    let allResolved = true;

    for (const filePath of conflictedFiles) {
      const conflict = await getConflictInfo(repoPath, filePath);

      if (!conflict) {
        continue;
      }

      // Try search-replace first
      let resolution = trySearchReplaceResolution(conflict);

      // If that failed and AI is enabled, try AI
      if (!resolution.success && useAI) {
        console.log(`[SmartMerge] Search-replace failed for ${filePath}, trying AI...`);
        resolution = await resolveWithAI(conflict);
      }

      resolutions.set(filePath, resolution);

      if (resolution.success && resolution.mergedContent) {
        // Write the resolved content
        const { writeFile } = await import('fs/promises');
        const path = await import('path');
        await writeFile(
          path.join(repoPath, filePath),
          resolution.mergedContent
        );

        // Stage the resolved file
        await execAsync(`git add "${filePath}"`, { cwd: repoPath });
      } else {
        allResolved = false;
      }
    }

    // Build summary
    const methods = Array.from(resolutions.values()).map(r => r.method);
    const searchReplaceCount = methods.filter(m => m === 'search-replace').length;
    const aiCount = methods.filter(m => m === 'ai-magic').length;
    const failedCount = methods.filter(m => m === 'failed').length;

    let summary = `Resolved ${resolutions.size} conflict(s): `;
    if (searchReplaceCount > 0) summary += `${searchReplaceCount} via search-replace, `;
    if (aiCount > 0) summary += `${aiCount} via AI, `;
    if (failedCount > 0) summary += `${failedCount} failed`;
    summary = summary.replace(/, $/, '');

    return {
      success: allResolved,
      resolutions,
      summary
    };
  } catch (error: any) {
    return {
      success: false,
      resolutions,
      summary: `Resolution failed: ${error.message}`
    };
  }
}

// ============================================
// SINGLETON
// ============================================

let smartMergeServiceInstance: SmartMergeService | null = null;

export class SmartMergeService {
  async getConflictInfo(repoPath: string, filePath: string) {
    return getConflictInfo(repoPath, filePath);
  }

  async resolveConflicts(repoPath: string, options?: { useAI?: boolean }) {
    return resolveConflicts(repoPath, options);
  }

  trySearchReplaceResolution(conflict: ConflictInfo) {
    return trySearchReplaceResolution(conflict);
  }

  async resolveWithAI(conflict: ConflictInfo) {
    return resolveWithAI(conflict);
  }
}

export function initializeSmartMergeService(): SmartMergeService {
  smartMergeServiceInstance = new SmartMergeService();
  return smartMergeServiceInstance;
}

export function getSmartMergeService(): SmartMergeService {
  if (!smartMergeServiceInstance) {
    smartMergeServiceInstance = new SmartMergeService();
  }
  return smartMergeServiceInstance;
}
