/**
 * Normalize user input into a bare GitHub username (#392).
 *
 * People paste identities in many forms — "@handle", a profile URL, a handle
 * with stray whitespace. The stored canonical identity is always the bare
 * username, since it keys the peer registry and remote resolution.
 */
export function normalizeGithubUsername(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '');
}
