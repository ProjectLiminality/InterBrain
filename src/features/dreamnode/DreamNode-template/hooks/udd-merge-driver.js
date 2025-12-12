#!/usr/bin/env node

/**
 * Custom Git Merge Driver for .udd Files
 *
 * Intelligently merges .udd files by:
 * - Keeping "ours" (local) liminalWebRelationships (private metadata)
 * - Accepting "theirs" (incoming) for all other fields (canonical content)
 *
 * Git calls this script with: <driver> %O %A %B %L %P
 * %O = ancestor's version
 * %A = current version (ours)
 * %B = other branch's version (theirs)
 * %L = conflict marker size (not used)
 * %P = pathname (not used)
 */

const fs = require('fs');

// Parse arguments from git
const ancestorPath = process.argv[2]; // %O
const currentPath = process.argv[3];   // %A (ours)
const otherPath = process.argv[4];     // %B (theirs)

try {
  // Read all three versions
  const current = JSON.parse(fs.readFileSync(currentPath, 'utf-8'));
  const other = JSON.parse(fs.readFileSync(otherPath, 'utf-8'));

  // Start with "theirs" (other) as base for canonical fields
  const merged = { ...other };

  // BUT: Always keep "ours" (current) for liminalWebRelationships
  merged.liminalWebRelationships = current.liminalWebRelationships || [];

  // Write merged result back to current path
  fs.writeFileSync(currentPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');

  // Exit 0 = merge successful, no conflicts
  process.exit(0);

} catch (error) {
  // If anything goes wrong, exit with error code so git knows merge failed
  console.error('UDD merge driver failed:', error.message);
  process.exit(1);
}
