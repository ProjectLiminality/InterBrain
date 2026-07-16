import { describe, it, expect } from 'vitest';
import { normalizeGithubUsername } from './github-username';

describe('normalizeGithubUsername', () => {
  it('passes a bare username through', () => {
    expect(normalizeGithubUsername('octocat')).toBe('octocat');
  });

  it('strips a leading @', () => {
    expect(normalizeGithubUsername('@octocat')).toBe('octocat');
  });

  it('extracts the username from a profile URL', () => {
    expect(normalizeGithubUsername('https://github.com/octocat')).toBe('octocat');
    expect(normalizeGithubUsername('http://www.github.com/octocat/')).toBe('octocat');
  });

  it('drops any path beyond the username', () => {
    expect(normalizeGithubUsername('https://github.com/octocat/some-repo')).toBe('octocat');
  });

  it('trims whitespace', () => {
    expect(normalizeGithubUsername('  octocat  ')).toBe('octocat');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeGithubUsername('')).toBe('');
    expect(normalizeGithubUsername('   ')).toBe('');
  });
});
