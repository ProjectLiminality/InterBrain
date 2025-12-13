/**
 * Repository Initializer Utilities - Create new DreamNode repositories
 *
 * Pure functions for repository creation - no store interaction.
 * The service orchestrates these functions and handles store updates.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const execAsync = promisify(exec);
const fsPromises = fs.promises;

// ============================================================================
// TYPES
// ============================================================================

export interface RepoConfig {
  uuid: string;
  title: string;
  type: 'dream' | 'dreamer';
  dreamTalkFilename?: string;
  metadata?: {
    did?: string;
    email?: string;
    phone?: string;
  };
}

// ============================================================================
// REPOSITORY CREATION
// ============================================================================

/**
 * Create a new directory for a DreamNode repository
 */
export async function createRepoDirectory(repoPath: string): Promise<void> {
  await fsPromises.mkdir(repoPath, { recursive: true });
}

/**
 * Initialize a git repository with a template
 */
export async function initGitWithTemplate(repoPath: string, templatePath: string): Promise<void> {
  await execAsync(`git init --template="${templatePath}" "${repoPath}"`);

  // Make hooks executable
  const hooksDir = path.join(repoPath, '.git', 'hooks');
  const preCommitHook = path.join(hooksDir, 'pre-commit');

  try {
    await fsPromises.access(preCommitHook);
    await execAsync(`chmod +x "${preCommitHook}"`);
  } catch {
    // Hook doesn't exist, that's fine
  }
}

/**
 * Write a File object to disk
 */
export async function writeFileToDisk(repoPath: string, file: globalThis.File): Promise<string> {
  const filePath = path.join(repoPath, file.name);
  const buffer = await file.arrayBuffer();
  await fsPromises.writeFile(filePath, globalThis.Buffer.from(buffer));
  return filePath;
}

/**
 * Write multiple files to a repository
 */
export async function writeFilesToDisk(repoPath: string, files: globalThis.File[]): Promise<string[]> {
  const paths: string[] = [];
  for (const file of files) {
    const filePath = await writeFileToDisk(repoPath, file);
    paths.push(filePath);
  }
  return paths;
}

// ============================================================================
// TEMPLATE PROCESSING
// ============================================================================

/**
 * Replace placeholders in the template UDD file
 */
export async function processUDDTemplate(
  repoPath: string,
  config: RepoConfig
): Promise<void> {
  const uddPath = path.join(repoPath, '.git', 'udd');

  let content = await fsPromises.readFile(uddPath, 'utf-8');

  // Replace template placeholders
  content = content
    .replace('TEMPLATE_UUID_PLACEHOLDER', config.uuid)
    .replace('TEMPLATE_TITLE_PLACEHOLDER', config.title)
    .replace('"type": "dream"', `"type": "${config.type}"`)
    .replace('TEMPLATE_DREAMTALK_PLACEHOLDER', config.dreamTalkFilename || '')
    .replace('TEMPLATE_RADICLE_ID_PLACEHOLDER', '');

  // Add optional metadata for Dreamer nodes
  if (config.metadata) {
    const udd = JSON.parse(content);
    if (config.metadata.did) udd.did = config.metadata.did;
    if (config.metadata.email) udd.email = config.metadata.email;
    if (config.metadata.phone) udd.phone = config.metadata.phone;
    content = JSON.stringify(udd, null, 2);
  }

  await fsPromises.writeFile(uddPath, content);
}

/**
 * Replace placeholders in template README
 */
export async function processReadmeTemplate(repoPath: string, title: string): Promise<void> {
  const readmePath = path.join(repoPath, '.git', 'README.md');

  try {
    let content = await fsPromises.readFile(readmePath, 'utf-8');
    content = content.replace(/TEMPLATE_TITLE_PLACEHOLDER/g, title);
    await fsPromises.writeFile(readmePath, content);
  } catch {
    // README doesn't exist in template, that's fine
  }
}

/**
 * Move template files from .git directory to working directory
 */
export async function moveTemplateFiles(repoPath: string): Promise<void> {
  const gitDir = path.join(repoPath, '.git');

  const filesToMove = [
    { source: 'udd', dest: '.udd' },
    { source: 'README.md', dest: 'README.md' },
    { source: 'LICENSE', dest: 'LICENSE' }
  ];

  for (const { source, dest } of filesToMove) {
    const sourcePath = path.join(gitDir, source);
    const destPath = path.join(repoPath, dest);

    try {
      await fsPromises.access(sourcePath);
      await fsPromises.rename(sourcePath, destPath);
    } catch {
      // File doesn't exist, skip
    }
  }
}

// ============================================================================
// DREAMER NODE SETUP
// ============================================================================

const INTERBRAIN_UUID = '550e8400-e29b-41d4-a716-446655440000';

/**
 * Set up Dreamer-specific files (.gitignore and liminal-web.json)
 */
export async function setupDreamerNode(repoPath: string): Promise<void> {
  // Create .gitignore with liminal-web.json excluded
  const gitignorePath = path.join(repoPath, '.gitignore');
  await fsPromises.writeFile(gitignorePath, 'liminal-web.json\n');

  // Create liminal-web.json with InterBrain connection
  const liminalWebPath = path.join(repoPath, 'liminal-web.json');

  let liminalWeb: { relationships: string[] } = { relationships: [] };

  // Check if file already exists (from prior operations)
  try {
    const existingContent = await fsPromises.readFile(liminalWebPath, 'utf-8');
    liminalWeb = JSON.parse(existingContent);
  } catch {
    // File doesn't exist, use empty relationships
  }

  // Ensure InterBrain connection
  if (!liminalWeb.relationships.includes(INTERBRAIN_UUID)) {
    liminalWeb.relationships.push(INTERBRAIN_UUID);
  }

  await fsPromises.writeFile(liminalWebPath, JSON.stringify(liminalWeb, null, 2));
}

// ============================================================================
// GIT OPERATIONS
// ============================================================================

/**
 * Make initial commit for a new DreamNode
 */
export async function makeInitialCommit(repoPath: string, title: string): Promise<boolean> {
  try {
    await execAsync('git add -A', { cwd: repoPath });

    const escapedTitle = title.replace(/"/g, '\\"');
    await execAsync(`git commit -m "Initialize DreamNode: ${escapedTitle}"`, { cwd: repoPath });

    return true;
  } catch (error: any) {
    // Pre-commit hook may output to stderr causing exec to throw
    // Verify commit succeeded by checking HEAD
    try {
      await execAsync('git rev-parse HEAD', { cwd: repoPath });
      return true; // Commit succeeded despite stderr
    } catch {
      // HEAD doesn't exist - commit really failed
      throw error;
    }
  }
}

/**
 * Verify a repository was created successfully
 */
export async function verifyRepoCreated(repoPath: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse HEAD', { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Sanitize a title to create a valid repository name
 */
export function sanitizeRepoName(title: string): string {
  // Use the shared utility from title-sanitization.ts
  // This is just a re-export for convenience
  const { sanitizeTitleToPascalCase } = require('./title-sanitization');
  return sanitizeTitleToPascalCase(title);
}

// fileExists is exported from vault-scanner.ts - use that one
