#!/usr/bin/env node
/**
 * Git Hook Helper Script
 *
 * Provides Node.js utilities for git hooks to interact with InterBrain systems:
 * - Canvas submodule synchronization
 * - Bidirectional supermodule relationship tracking
 *
 * This script is designed to be called from shell-based git hooks.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============================================================================
// UDD File Operations
// ============================================================================

/**
 * Read and parse a .udd file
 */
function readUDD(dreamNodePath) {
  const uddPath = path.join(dreamNodePath, '.udd');

  try {
    const content = fs.readFileSync(uddPath, 'utf-8');
    const udd = JSON.parse(content);

    if (!udd.uuid || !udd.title || !udd.type) {
      throw new Error(`Invalid .udd file: missing required fields`);
    }

    return udd;
  } catch (error) {
    throw new Error(`Failed to read .udd from ${dreamNodePath}: ${error.message}`);
  }
}

/**
 * Write a UDD object to a .udd file
 */
function writeUDD(dreamNodePath, udd) {
  const uddPath = path.join(dreamNodePath, '.udd');

  try {
    const content = JSON.stringify(udd, null, 2);
    fs.writeFileSync(uddPath, content, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to write .udd to ${dreamNodePath}: ${error.message}`);
  }
}

/**
 * Add a supermodule relationship to a child's .udd file
 */
function addSupermodule(childPath, parentUUID) {
  const udd = readUDD(childPath);

  if (udd.supermodules.includes(parentUUID)) {
    return false; // Already exists
  }

  udd.supermodules.push(parentUUID);
  writeUDD(childPath, udd);
  return true; // Added
}

/**
 * Remove a supermodule relationship from a child's .udd file
 */
function removeSupermodule(childPath, parentUUID) {
  const udd = readUDD(childPath);

  const index = udd.supermodules.indexOf(parentUUID);
  if (index === -1) {
    return false; // Doesn't exist
  }

  udd.supermodules.splice(index, 1);
  writeUDD(childPath, udd);
  return true; // Removed
}

/**
 * Add a submodule relationship to a parent's .udd file
 */
function addSubmodule(parentPath, childUUID) {
  const udd = readUDD(parentPath);

  if (udd.submodules.includes(childUUID)) {
    return false; // Already exists
  }

  udd.submodules.push(childUUID);
  writeUDD(parentPath, udd);
  return true; // Added
}

/**
 * Remove a submodule relationship from a parent's .udd file
 */
function removeSubmodule(parentPath, childUUID) {
  const udd = readUDD(parentPath);

  const index = udd.submodules.indexOf(childUUID);
  if (index === -1) {
    return false; // Doesn't exist
  }

  udd.submodules.splice(index, 1);
  writeUDD(parentPath, udd);
  return true; // Removed
}

// ============================================================================
// Git Operations
// ============================================================================

/**
 * Execute a git command in the specified directory
 */
function gitExec(command, cwd) {
  try {
    return execSync(command, { cwd, encoding: 'utf-8' });
  } catch (error) {
    throw new Error(`Git command failed: ${command}\n${error.message}`);
  }
}

/**
 * Get list of submodules from .gitmodules file
 */
function getSubmodules(repoPath) {
  const gitmodulesPath = path.join(repoPath, '.gitmodules');

  if (!fs.existsSync(gitmodulesPath)) {
    return [];
  }

  const content = fs.readFileSync(gitmodulesPath, 'utf-8');
  const submodules = [];

  // Parse .gitmodules format
  const lines = content.split('\n');
  let currentSubmodule = null;

  for (const line of lines) {
    const submoduleMatch = line.match(/^\[submodule "(.+)"\]$/);
    if (submoduleMatch) {
      currentSubmodule = { name: submoduleMatch[1], path: '', url: '' };
      continue;
    }

    if (currentSubmodule) {
      const pathMatch = line.match(/^\s*path\s*=\s*(.+)$/);
      const urlMatch = line.match(/^\s*url\s*=\s*(.+)$/);

      if (pathMatch) {
        currentSubmodule.path = pathMatch[1].trim();
      }
      if (urlMatch) {
        currentSubmodule.url = urlMatch[1].trim();
      }

      // If we have both path and url, add to list
      if (currentSubmodule.path && currentSubmodule.url) {
        submodules.push(currentSubmodule);
        currentSubmodule = null;
      }
    }
  }

  return submodules;
}

/**
 * Initialize a submodule to ensure its working directory is populated
 */
function initializeSubmodule(repoPath, submodulePath) {
  try {
    gitExec(`git submodule update --init "${submodulePath}"`, repoPath);
    return true;
  } catch (error) {
    console.error(`Failed to initialize submodule ${submodulePath}:`, error.message);
    return false;
  }
}

/**
 * Compare submodules between two commits
 */
function compareSubmodules(repoPath, oldCommit, newCommit) {
  const oldSubmodules = new Set();
  const newSubmodules = new Set();

  // Get submodules from old commit
  try {
    const oldGitmodules = gitExec(`git show ${oldCommit}:.gitmodules`, repoPath);
    const oldList = parseGitmodulesContent(oldGitmodules);
    oldList.forEach(sub => oldSubmodules.add(sub.path));
  } catch (error) {
    // No .gitmodules in old commit, that's fine
  }

  // Get submodules from new commit
  try {
    const newGitmodules = gitExec(`git show ${newCommit}:.gitmodules`, repoPath);
    const newList = parseGitmodulesContent(newGitmodules);
    newList.forEach(sub => newSubmodules.add(sub.path));
  } catch (error) {
    // No .gitmodules in new commit, that's fine
  }

  const added = [...newSubmodules].filter(path => !oldSubmodules.has(path));
  const removed = [...oldSubmodules].filter(path => !newSubmodules.has(path));

  return { added, removed };
}

/**
 * Parse .gitmodules content into submodule objects
 */
function parseGitmodulesContent(content) {
  const submodules = [];
  const lines = content.split('\n');
  let currentSubmodule = null;

  for (const line of lines) {
    const submoduleMatch = line.match(/^\[submodule "(.+)"\]$/);
    if (submoduleMatch) {
      currentSubmodule = { name: submoduleMatch[1], path: '', url: '' };
      continue;
    }

    if (currentSubmodule) {
      const pathMatch = line.match(/^\s*path\s*=\s*(.+)$/);
      const urlMatch = line.match(/^\s*url\s*=\s*(.+)$/);

      if (pathMatch) {
        currentSubmodule.path = pathMatch[1].trim();
      }
      if (urlMatch) {
        currentSubmodule.url = urlMatch[1].trim();
      }

      if (currentSubmodule.path && currentSubmodule.url) {
        submodules.push(currentSubmodule);
        currentSubmodule = null;
      }
    }
  }

  return submodules;
}

// ============================================================================
// Post-Commit Hook: Supermodule Tracking
// ============================================================================

/**
 * Update supermodule relationships after a commit
 * Called by post-commit hook
 */
function updateSupermodules(repoPath) {
  console.error('Post-Commit Hook: Checking for submodule changes...');

  try {
    // Compare HEAD with HEAD~1 to find submodule changes
    const changes = compareSubmodules(repoPath, 'HEAD~1', 'HEAD');

    if (changes.added.length === 0 && changes.removed.length === 0) {
      console.error('Post-Commit Hook: No submodule changes detected');
      return;
    }

    console.error(`Post-Commit Hook: Found ${changes.added.length} added, ${changes.removed.length} removed submodules`);

    // Get parent's UUID
    const parentUDD = readUDD(repoPath);
    const parentUUID = parentUDD.uuid;
    const parentTitle = parentUDD.title;

    let parentUDDModified = false;

    // Process added submodules
    for (const submodulePath of changes.added) {
      const fullSubmodulePath = path.join(repoPath, submodulePath);

      console.error(`Post-Commit Hook: Processing added submodule: ${submodulePath}`);

      // Initialize submodule to ensure .udd is accessible
      if (!initializeSubmodule(repoPath, submodulePath)) {
        console.error(`Post-Commit Hook: Failed to initialize ${submodulePath}, skipping`);
        continue;
      }

      try {
        // Read child's UUID
        const childUDD = readUDD(fullSubmodulePath);
        const childUUID = childUDD.uuid;
        const childTitle = childUDD.title;

        // Update parent's .udd (add child to submodules array)
        if (addSubmodule(repoPath, childUUID)) {
          console.error(`Post-Commit Hook: Added ${childTitle} to parent's submodules`);
          parentUDDModified = true;
        }

        // Update child's .udd (add parent to supermodules array)
        if (addSupermodule(fullSubmodulePath, parentUUID)) {
          console.error(`Post-Commit Hook: Added ${parentTitle} to ${childTitle}'s supermodules`);

          // Commit the change in the child repository
          try {
            gitExec('git add .udd', fullSubmodulePath);
            gitExec(`git commit -m "Add supermodule relationship: ${parentTitle}"`, fullSubmodulePath);
            console.error(`Post-Commit Hook: Committed supermodule relationship in ${childTitle}`);
          } catch (error) {
            console.error(`Post-Commit Hook: Failed to commit child changes: ${error.message}`);
          }
        }

      } catch (error) {
        console.error(`Post-Commit Hook: Error processing ${submodulePath}: ${error.message}`);
      }
    }

    // Process removed submodules
    for (const submodulePath of changes.removed) {
      console.error(`Post-Commit Hook: Processing removed submodule: ${submodulePath}`);

      try {
        // For removed submodules, we need to get UUID from the old commit
        const uddContent = gitExec(`git show HEAD~1:${submodulePath}/.udd`, repoPath);
        const childUDD = JSON.parse(uddContent);
        const childUUID = childUDD.uuid;
        const childTitle = childUDD.title;

        // Update parent's .udd (remove child from submodules array)
        if (removeSubmodule(repoPath, childUUID)) {
          console.error(`Post-Commit Hook: Removed ${childTitle} from parent's submodules`);
          parentUDDModified = true;
        }

        // For removed submodules, we can't update the child repo if it's already deleted
        // This is acceptable - the relationship will be stale in the child until it's used again
        console.error(`Post-Commit Hook: Note - ${childTitle}'s supermodules not updated (repo removed)`);

      } catch (error) {
        console.error(`Post-Commit Hook: Error processing removed ${submodulePath}: ${error.message}`);
      }
    }

    // Commit parent's .udd changes if needed
    if (parentUDDModified) {
      try {
        gitExec('git add .udd', repoPath);
        gitExec('git commit -m "Update submodule relationships"', repoPath);
        console.error('Post-Commit Hook: Committed parent .udd changes');
      } catch (error) {
        console.error(`Post-Commit Hook: Failed to commit parent .udd: ${error.message}`);
      }
    }

    console.error('Post-Commit Hook: Supermodule tracking complete');

  } catch (error) {
    console.error(`Post-Commit Hook: Fatal error: ${error.message}`);
    // Don't fail the commit - just log the error
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

function main() {
  const command = process.argv[2];
  const repoPath = process.cwd(); // Hooks run in repo directory

  try {
    if (command === 'update-supermodules') {
      updateSupermodules(repoPath);
    } else {
      console.error(`Unknown command: ${command}`);
      console.error('Usage: hook-helper.js [update-supermodules]');
      process.exit(1);
    }
  } catch (error) {
    console.error(`Hook helper failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export for testing
module.exports = {
  readUDD,
  writeUDD,
  addSupermodule,
  removeSupermodule,
  addSubmodule,
  removeSubmodule,
  getSubmodules,
  compareSubmodules,
  updateSupermodules
};
