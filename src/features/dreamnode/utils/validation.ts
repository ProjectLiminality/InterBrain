/**
 * Validation Utilities for DreamNode Creation and Editing
 *
 * Shared validation logic used by DreamNodeCreator3D and DreamNodeEditor3D.
 */

/**
 * Validation errors for DreamNode title
 */
export interface TitleValidationErrors {
  title?: string;
}

/**
 * Validate a DreamNode title
 *
 * Rules:
 * - Title is required (cannot be empty or whitespace only)
 * - Title must be less than 255 characters
 * - Title cannot contain invalid filesystem characters: < > : " / \ | ? *
 *
 * @param title - The title to validate
 * @returns Object with validation errors, empty if valid
 */
export function validateDreamNodeTitle(title: string): TitleValidationErrors {
  const errors: TitleValidationErrors = {};

  if (!title.trim()) {
    errors.title = 'Title is required';
  } else if (title.length > 255) {
    errors.title = 'Title must be less than 255 characters';
  } else if (/[<>:"/\\|?*]/.test(title)) {
    errors.title = 'Title contains invalid characters';
  }

  return errors;
}

/**
 * Check if title validation passed
 *
 * @param errors - The validation errors object
 * @returns true if no errors, false otherwise
 */
export function isTitleValid(errors: TitleValidationErrors): boolean {
  return Object.keys(errors).length === 0;
}
