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
const fsPromises = require('fs/promises');
const path = require('path');

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
    const fullPath = path.join(repoPath, filePath);
    const conflictContent = await fsPromises.readFile(fullPath, 'utf-8');

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
    console.log('[SmartMerge] Could not parse conflict info:', error);
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

  // Debug: log what we're comparing
  console.log('[SearchReplace] Attempting resolution...');
  console.log('[SearchReplace] Ours (' + oursLines.length + ' lines):');
  oursLines.forEach((line, i) => console.log(`  [${i}] ${JSON.stringify(line)}`));
  console.log('[SearchReplace] Theirs (' + theirsLines.length + ' lines):');
  theirsLines.forEach((line, i) => console.log(`  [${i}] ${JSON.stringify(line)}`));
  console.log('[SearchReplace] First line match:', oursLines[0] === theirsLines[0]);
  console.log('[SearchReplace] Last line match:', oursLines[oursLines.length - 1] === theirsLines[theirsLines.length - 1]);

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
 * @param conflict - The conflict information
 * @param refinements - Optional array of user refinement instructions for iterative improvement
 */
export async function resolveWithAI(
  conflict: ConflictInfo,
  refinements?: string[]
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

    const userPrompt = buildMergePrompt(conflict, refinements);

    const systemPrompt = `You are a git merge conflict resolver. Your task is to intelligently combine two versions of content that have diverged.

RULES:
1. PRESERVE ALL CONTENT from both versions - never discard changes from either side
2. When both versions add different content (sections, paragraphs, items), include ALL additions
3. When both versions modify the same content differently, combine the intent of both changes
4. Maintain the original formatting style and structure
5. Prefer minimal integration - add incoming content at the natural location rather than restructuring existing content
6. Output ONLY the merged content - no explanations, no markdown code fences, no meta-commentary`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt }
    ];

    const response = await inferenceService.generate(messages, 'standard');

    if (!response.content) {
      return {
        success: false,
        method: 'ai-magic',
        error: 'AI returned empty response'
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

    const hasRefinements = refinements && refinements.length > 0;
    return {
      success: true,
      mergedContent: fullMerged,
      method: 'ai-magic',
      explanation: hasRefinements
        ? `AI refined the merge based on: "${refinements[refinements.length - 1]}"`
        : 'AI analyzed both changes and merged them semantically.'
    };
  } catch (error: any) {
    return {
      success: false,
      method: 'ai-magic',
      error: `AI resolution failed: ${error.message}`
    };
  }
}

function buildMergePrompt(conflict: ConflictInfo, refinements?: string[]): string {
  const region = conflict.conflictRegions[0];

  let prompt = `Merge conflict in: ${conflict.filePath}

CONTEXT (content before the conflict):
${region.contextBefore || '(beginning of section)'}

--- VERSION A (current state) ---
${region.ours}

--- VERSION B (incoming changes) ---
${region.theirs}

CONTEXT (content after the conflict):
${region.contextAfter || '(end of section)'}

Combine VERSION A and VERSION B into unified content. Both versions represent valid changes that should be preserved.`;

  // Add refinement instructions if provided
  if (refinements && refinements.length > 0) {
    prompt += `\n\nUSER REFINEMENT INSTRUCTIONS:\n`;
    refinements.forEach((instruction, i) => {
      prompt += `${i + 1}. ${instruction}\n`;
    });
    prompt += `\nApply these refinements to the merged result.`;
  }

  prompt += `\n\nOutput only the merged content that replaces the conflict region.`;

  return prompt;
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

    const conflictedFiles = stdout.trim().split('\n').filter((f: string) => f);

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
        await fsPromises.writeFile(
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

  async resolveWithAI(conflict: ConflictInfo, refinements?: string[]) {
    return resolveWithAI(conflict, refinements);
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
