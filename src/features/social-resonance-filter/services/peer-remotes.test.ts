import { describe, it, expect } from 'vitest';
import { isPeerRemote, ownerFromRemoteUrl } from './peer-remotes';

/**
 * Invariant 2 (#409): origin is yours; a peer is any other remote whose URL
 * is a GitHub repo owned by someone who isn't you.
 */
describe('ownerFromRemoteUrl', () => {
  it('extracts the owner from native GitHub URLs', () => {
    expect(ownerFromRemoteUrl('https://github.com/Alice/Square5')).toBe('alice');
    expect(ownerFromRemoteUrl('https://github.com/Alice/Square5.git')).toBe('alice');
    expect(ownerFromRemoteUrl('git@github.com:Alice/Square5.git')).toBe('alice');
  });

  it('extracts the owner from interbrain:// peer hints', () => {
    expect(ownerFromRemoteUrl('interbrain://abc-123?peer=Alice')).toBe('alice');
    expect(ownerFromRemoteUrl('interbrain://abc-123?peer=Alice%2FSquare5')).toBe('alice');
  });

  it('returns null for non-GitHub URLs', () => {
    expect(ownerFromRemoteUrl('rad://z1234abcd')).toBeNull();
    expect(ownerFromRemoteUrl('/Users/me/Vault/Square5')).toBeNull();
    expect(ownerFromRemoteUrl('interbrain://abc-123')).toBeNull();
  });
});

describe('isPeerRemote', () => {
  const me = 'projectliminality';

  it('someone else\'s GitHub repo is a peer', () => {
    expect(isPeerRemote('interfaceguy', 'https://github.com/InterfaceGuy/Square5', me)).toBe(true);
  });

  it('origin is never a peer', () => {
    expect(isPeerRemote('origin', 'https://github.com/InterfaceGuy/Square5', me)).toBe(false);
  });

  it('my own repo under a legacy `github` remote is NOT a peer (ArkCrystal case)', () => {
    expect(isPeerRemote('github', 'https://github.com/ProjectLiminality/ArkCrystal.git', me)).toBe(false);
  });

  it('dead rad:// and filesystem remotes are NOT peers', () => {
    expect(isPeerRemote('rad', 'rad://z1234abcd', me)).toBe(false);
    expect(isPeerRemote('sovereign', '/Users/me/Vault/Square5', me)).toBe(false);
  });

  it('legacy interbrain:// remotes count as peers via their hint owner', () => {
    expect(isPeerRemote('alice', 'interbrain://abc?peer=Alice', me)).toBe(true);
    expect(isPeerRemote('mine', 'interbrain://abc?peer=ProjectLiminality', me)).toBe(false);
  });

  it('degrades gracefully when my username is unknown', () => {
    // Can't exclude own repos without knowing who "me" is — keep GitHub
    // remotes as peers rather than dropping real collaboration.
    expect(isPeerRemote('github', 'https://github.com/ProjectLiminality/X', null)).toBe(true);
    expect(isPeerRemote('rad', 'rad://z1234', null)).toBe(false);
  });
});
