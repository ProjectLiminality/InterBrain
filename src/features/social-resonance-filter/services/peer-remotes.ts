/**
 * Peer-remote classification (#409, invariant 2):
 *
 *   `origin` is yours; a PEER is any other remote whose URL is a GitHub
 *   repo owned by someone who isn't you.
 *
 * The old rule ("any remote that isn't origin") misread legacy remotes as
 * peers: a pre-v0.16 `github` remote pointing at YOUR OWN published repo
 * showed up as a peer sending you your own commits (the ArkCrystal
 * symptom), and dead `rad://` remotes poisoned fetch loops.
 *
 * Classification:
 *   - github.com URL (https or ssh), owner ≠ me   → peer
 *   - github.com URL, owner == me                 → NOT a peer (legacy
 *     `github` remote — my own repo; adopted as origin by ensureOwnOutbox)
 *   - interbrain://<uuid>?peer=<owner...>         → peer iff hint owner ≠ me
 *   - rad://, filesystem paths, anything else     → NOT a peer (unresolvable
 *     legacy config)
 *
 * When the GitHub username can't be determined (gh missing/offline) we keep
 * every github/interbrain remote as a peer — degraded but functional.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/** Session cache — the signed-in username doesn't change mid-session. */
let cachedUsername: string | null | undefined;

async function getOwnGithubUsername(): Promise<string | null> {
  if (cachedUsername !== undefined) return cachedUsername;
  try {
    const { getSovereigntyService } = await import('./sovereignty-service');
    cachedUsername = (await getSovereigntyService().getCurrentUser()).toLowerCase();
  } catch {
    cachedUsername = null;
  }
  return cachedUsername;
}

/** For tests / sign-out flows. */
export function resetPeerRemoteCache(): void {
  cachedUsername = undefined;
}

/** Extract the owner from a remote URL, or null if not a GitHub-ish URL. */
export function ownerFromRemoteUrl(url: string): string | null {
  const native = url.match(/^(?:https?:\/\/(?:www\.)?github\.com\/|git@github\.com:)([^/\s]+)/i);
  if (native) return native[1].toLowerCase();
  if (url.startsWith('interbrain://')) {
    const query = url.split('?')[1] ?? '';
    for (const pair of query.split('&')) {
      if (pair.startsWith('peer=')) {
        const hint = decodeURIComponent(pair.slice(5));
        const owner = hint.split('/')[0]?.trim().toLowerCase();
        if (owner) return owner;
      }
    }
    // interbrain URL without a peer hint — owner unknown.
    return null;
  }
  return null;
}

/** Is this (name, url) pair a peer remote, given my (lowercased) username? */
export function isPeerRemote(name: string, url: string, myUsername: string | null): boolean {
  if (name === 'origin') return false;
  const isGithub = /^(?:https?:\/\/(?:www\.)?github\.com\/|git@github\.com:)/i.test(url);
  const isInterbrain = url.startsWith('interbrain://');
  if (!isGithub && !isInterbrain) return false; // rad://, local paths, etc.
  const owner = ownerFromRemoteUrl(url);
  if (myUsername && owner && owner === myUsername) return false; // my own repo
  return true;
}

/**
 * List the peer remotes of a repo (names only), applying the invariant-2
 * classification.
 */
export async function listPeerRemotes(cwd: string): Promise<string[]> {
  const myUsername = await getOwnGithubUsername();
  const { stdout } = await execAsync('git remote -v', { cwd });
  const peers = new Set<string>();
  for (const line of stdout.split('\n')) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((?:fetch|push)\)$/);
    if (!match) continue;
    const [, name, url] = match;
    if (isPeerRemote(name, url, myUsername)) peers.add(name);
  }
  return Array.from(peers);
}
