/**
 * Title Sanitization Utility
 *
 * Provides unified title sanitization for DreamNode naming across all layers:
 * - Human-readable titles (stored in .udd): "Thunderstorm Generator"
 * - File system paths (PascalCase): "ThunderstormGenerator"
 * - GitHub repository names (PascalCase): "ThunderstormGenerator"
 *
 * Architecture Decision:
 * - .udd `title` field = SINGLE SOURCE OF TRUTH (human-readable with spaces)
 * - File system & GitHub = PascalCase transformation of title
 * - 100-character limit enforced uniformly (GitHub's limit)
 */

/**
 * Sanitize human-readable title to PascalCase for file system and GitHub
 *
 * Examples:
 * - "Thunderstorm Generator" → "ThunderstormGenerator"
 * - "Mind-Body Connection" → "MindBodyConnection"
 * - "Dream 2.0" → "Dream20"
 * - "Café Philosophy" → "CafePhilosophy"
 *
 * @param title - Human-readable title with spaces and special characters
 * @returns PascalCase string suitable for file paths and GitHub repo names
 */
export function sanitizeTitleToPascalCase(title: string): string {
  return title
    // Normalize unicode characters (é → e, ñ → n, etc.)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Split on whitespace, hyphens, underscores, and periods
    .split(/[\s\-_.]+/)
    // Filter out empty strings
    .filter(word => word.length > 0)
    // Capitalize first letter of each word, lowercase the rest
    .map(word => {
      // Remove any remaining special characters from word
      const cleaned = word.replace(/[^a-zA-Z0-9]/g, '');
      if (cleaned.length === 0) return '';
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
    })
    // Filter again after cleaning
    .filter(word => word.length > 0)
    // Join without separator (PascalCase)
    .join('')
    // Enforce 100-character limit (GitHub repository name limit)
    .substring(0, 100);
}

/**
 * Validate that a title can be successfully sanitized
 *
 * @param title - Title to validate
 * @returns Object with validation result and sanitized output
 */
export function validateTitle(title: string): {
  valid: boolean;
  sanitized: string;
  error?: string;
} {
  if (!title || title.trim().length === 0) {
    return {
      valid: false,
      sanitized: '',
      error: 'Title cannot be empty'
    };
  }

  const sanitized = sanitizeTitleToPascalCase(title);

  if (sanitized.length === 0) {
    return {
      valid: false,
      sanitized: '',
      error: 'Title must contain at least one alphanumeric character'
    };
  }

  return {
    valid: true,
    sanitized
  };
}

/**
 * Check if a string is already in PascalCase format
 *
 * @param str - String to check
 * @returns True if string is valid PascalCase
 */
export function isPascalCase(str: string): boolean {
  if (!str || str.length === 0) return false;

  // Must start with uppercase letter
  if (!/^[A-Z]/.test(str)) return false;

  // Must contain only alphanumeric characters
  if (!/^[A-Za-z0-9]+$/.test(str)) return false;

  return true;
}

/**
 * Convert PascalCase back to human-readable title (best effort)
 * Note: This is lossy - can't perfectly recover "Mind-Body" from "MindBody"
 *
 * @param pascalCase - PascalCase string
 * @returns Human-readable title with spaces
 */
export function pascalCaseToTitle(pascalCase: string): string {
  if (!pascalCase || pascalCase.length === 0) return '';

  return pascalCase
    // Insert space before uppercase letters (except first)
    .replace(/([A-Z])/g, ' $1')
    // Trim leading space
    .trim()
    // Collapse multiple spaces
    .replace(/\s+/g, ' ');
}
