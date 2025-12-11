/**
 * Submodule Sync Utilities
 *
 * Handles detection and synchronization of submodule updates from their standalone network versions.
 *
 * Workflow: Alice updates Circle (standalone) → shares to network →
 *           Alice runs "Check for Updates" on Cylinder → sees Circle submodule has updates
 */

const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

export interface SubmoduleUpdate {
  name: string;
  path: string;
  commitsAhead: number;
}

interface ParsedSubmodule {
  path: string;
  url: string;
  name: string;
}

/**
 * Parse .gitmodules file to extract submodule information
 */
export function parseGitmodules(content: string): ParsedSubmodule[] {
  const submodules: ParsedSubmodule[] = [];
  const lines = content.split('\n');

  let currentSubmodule: Partial<ParsedSubmodule> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Start of new submodule section
    if (trimmed.startsWith('[submodule ')) {
      if (currentSubmodule && currentSubmodule.path && currentSubmodule.url) {
        submodules.push(currentSubmodule as ParsedSubmodule);
      }
      const nameMatch = trimmed.match(/\[submodule "([^"]+)"\]/);
      currentSubmodule = {
        name: nameMatch ? nameMatch[1] : '',
        path: '',
        url: ''
      };
    }
    // Path entry
    else if (trimmed.startsWith('path = ') && currentSubmodule) {
      currentSubmodule.path = trimmed.substring(7).trim();
    }
    // URL entry
    else if (trimmed.startsWith('url = ') && currentSubmodule) {
      currentSubmodule.url = trimmed.substring(6).trim();

      // Extract name from Radicle URL if not already set
      if (!currentSubmodule.name && currentSubmodule.url.includes('rad://')) {
        // For Radicle URLs, the name should match the standalone repo name
        // We'll infer it from the path since that's how we clone them
        currentSubmodule.name = path.basename(currentSubmodule.path);
      }
    }
  }

  // Don't forget the last submodule
  if (currentSubmodule && currentSubmodule.path && currentSubmodule.url) {
    submodules.push(currentSubmodule as ParsedSubmodule);
  }

  return submodules;
}

/**
 * Check if submodules have updates from their standalone network versions
 * Returns array of submodules with updates
 */
export async function checkSubmoduleUpdatesFromNetwork(
  parentPath: string,
  vaultPath: string
): Promise<SubmoduleUpdate[]> {
  const submoduleUpdates: SubmoduleUpdate[] = [];

  try {
    // Parse .gitmodules to find submodules
    const gitmodulesPath = path.join(parentPath, '.gitmodules');
    try {
      await fs.access(gitmodulesPath);
    } catch {
      // No .gitmodules file - no submodules to check
      return submoduleUpdates;
    }

    const gitmodulesContent = await fs.readFile(gitmodulesPath, 'utf-8');
    const submodules = parseGitmodules(gitmodulesContent);

    if (submodules.length === 0) {
      return submoduleUpdates;
    }

    // Check each submodule for updates from standalone version
    for (const submodule of submodules) {
      const submodulePath = path.join(parentPath, submodule.path);
      const standalonePath = path.join(vaultPath, submodule.name);

      // Check if both standalone and submodule exist
      try {
        await fs.access(standalonePath);
        await fs.access(submodulePath);
      } catch {
        continue;
      }

      // Compare commit hashes: standalone vs submodule
      try {
        const standaloneHead = await execAsync('git rev-parse HEAD', { cwd: standalonePath });
        const submoduleHead = await execAsync('git rev-parse HEAD', { cwd: submodulePath });

        const standaloneCommit = standaloneHead.stdout.trim();
        const submoduleCommit = submoduleHead.stdout.trim();

        if (standaloneCommit !== submoduleCommit) {
          // Check if standalone is ahead of submodule
          try {
            const { stdout: commitsAhead } = await execAsync(
              `git rev-list --count ${submoduleCommit}..${standaloneCommit}`,
              { cwd: standalonePath }
            );

            const numCommitsAhead = parseInt(commitsAhead.trim());

            if (numCommitsAhead > 0) {
              submoduleUpdates.push({
                name: submodule.name,
                path: submodule.path,
                commitsAhead: numCommitsAhead
              });
            }
          } catch (error) {
            console.warn(`[SubmoduleSync] Could not compare commits for ${submodule.name}:`, error);
          }
        }
      } catch (error) {
        console.warn(`[SubmoduleSync] Failed to check ${submodule.name}:`, error);
      }
    }
  } catch (error) {
    console.error('[SubmoduleSync] Error checking submodules:', error);
  }

  return submoduleUpdates;
}

/**
 * Update submodules by pulling from their standalone versions
 */
export async function updateSubmodulesFromStandalone(
  parentPath: string,
  vaultPath: string,
  submoduleUpdates: SubmoduleUpdate[]
): Promise<{ success: boolean; updated: string[]; failed: string[] }> {
  const updated: string[] = [];
  const failed: string[] = [];

  for (const submodule of submoduleUpdates) {
    try {
      const submodulePath = path.join(parentPath, submodule.path);
      const standalonePath = path.join(vaultPath, submodule.name);

      // Pull standalone commits into submodule
      // Use git pull with relative path to standalone
      const relativePath = path.relative(submodulePath, standalonePath);
      await execAsync(`git pull ${relativePath} main`, { cwd: submodulePath });

      updated.push(submodule.name);
    } catch (error) {
      console.error(`[SubmoduleSync] Failed to update ${submodule.name}:`, error);
      failed.push(submodule.name);
    }
  }

  // Update parent's submodule pointers and commit if any succeeded
  if (updated.length > 0) {
    try {
      // Stage all submodule pointer updates
      for (const submodule of submoduleUpdates.filter(s => updated.includes(s.name))) {
        await execAsync(`git add ${submodule.path}`, { cwd: parentPath });
      }

      // Commit the submodule pointer updates
      const submoduleNames = updated.join(', ');
      await execAsync(
        `git commit -m "[submodules] Update ${submoduleNames} from standalone versions"`,
        { cwd: parentPath }
      );
    } catch (error) {
      console.error('[SubmoduleSync] Failed to commit submodule updates:', error);
      return { success: false, updated, failed };
    }
  }

  return { success: failed.length === 0, updated, failed };
}
