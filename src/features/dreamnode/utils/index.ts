/**
 * DreamNode Utilities - Stateless functions for DreamNode operations
 *
 * - git-utils: Git command wrappers
 * - vault-scanner: Filesystem discovery
 * - repo-initializer: Repository creation
 * - title-sanitization: Title to folder name conversion
 * - git-operations: Legacy class (deprecated, use git-utils)
 */

// Stateless git operations
export * from './git-utils';

// Vault discovery utilities
export * from './vault-scanner';

// Repository creation utilities
export * from './repo-initializer';

// Title utilities
export { sanitizeTitleToPascalCase } from './title-sanitization';

// Legacy class - kept for backward compatibility
// TODO: Migrate usages to git-utils functions, then remove
export { GitOperationsService } from './git-operations';
