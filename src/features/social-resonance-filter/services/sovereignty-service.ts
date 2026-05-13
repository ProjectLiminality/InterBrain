/**
 * Sovereignty Service
 *
 * Owns the "every peer has their own GitHub outbox" model. For a given
 * DreamNode:
 *   - `origin` ALWAYS points to the current user's GitHub repo. If it
 *     doesn't, we either rename the existing origin to a peer remote (so
 *     we don't lose the link to whoever we cloned from) and create a fresh
 *     outbox, or we create an outbox from scratch.
 *   - "Share Changes" = auto-commit pending work, push origin.
 *   - "Invite Collaborators" = read origin's GitHub URL, produce an
 *     `interbrain://<uuid>?peer=<owner>/<repo>` link the user can paste
 *     anywhere.
 *
 * gh CLI is the identity. We never prompt for credentials; if `gh auth
 * status` says we're logged in, every git push over HTTPS to a repo we own
 * Just Works via gh's credential helper.
 */
import { UDDService } from '../../dreamnode/services/udd-service';

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const execAsync = promisify(exec);

export interface ShareResult {
  /** Final origin URL (https://github.com/<owner>/<repo>). */
  originUrl: string;
  /** Did we create the outbox just now? */
  createdOutbox: boolean;
  /** Did we have to commit something before pushing? */
  autoCommitted: boolean;
}

export interface InviteResult {
  /**
   * Clickable invite link in Obsidian protocol form:
   * obsidian://interbrain-clone?ids=github.com/<owner>/<repo>&senderName=<me>
   * The recipient's URI handler routes this to the existing GitHub clone
   * path, which then runs the rename-origin-to-peer + create-own-outbox
   * dance the first time they share back.
   */
  inviteUrl: string;
  /** The raw GitHub HTTPS URL of the user's outbox. */
  githubUrl: string;
  /** The interbrain:// transport URL (for advanced users / debugging). */
  transportUrl: string;
}

export class SovereigntyService {
  private ghPath: string | null = null;

  /** Locate the gh CLI. Same probing strategy as GitHubService. */
  private async detectGhPath(): Promise<string> {
    if (this.ghPath) return this.ghPath;
    for (const candidate of ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', 'gh']) {
      try {
        await execAsync(`${candidate} --version`);
        this.ghPath = candidate;
        return candidate;
      } catch {
        /* try next */
      }
    }
    throw new Error('GitHub CLI (gh) not found. Install it from https://cli.github.com');
  }

  /** Current authenticated gh username. */
  async getCurrentUser(): Promise<string> {
    const gh = await this.detectGhPath();
    const { stdout } = await execAsync(`"${gh}" api user -q .login`);
    const user = stdout.trim();
    if (!user) {
      throw new Error('Could not determine GitHub username from `gh api user`.');
    }
    return user;
  }

  /**
   * Push pending changes for this DreamNode to its GitHub outbox, creating
   * the outbox first if it doesn't exist yet.
   */
  async shareChanges(fullRepoPath: string, repoName: string): Promise<ShareResult> {
    const cwd = fullRepoPath;

    const autoCommitted = await this.autoCommitIfDirty(cwd);
    const { originUrl, createdOutbox } = await this.ensureOwnOutbox(cwd, repoName);

    const branch = await this.currentBranch(cwd);
    if (!createdOutbox) {
      // gh repo create --push already pushed; otherwise push now.
      await execAsync(`git push origin ${branch}`, { cwd });
    }

    return { originUrl, createdOutbox, autoCommitted };
  }

  /**
   * Produce a clickable invite for this DreamNode. Requires that the user
   * already has their own outbox (origin must point to a repo we own); if
   * not, we create one first so the link is immediately resolvable.
   *
   * Also returns the underlying interbrain:// transport URL for advanced
   * use (e.g., adding as a git remote directly).
   */
  async buildInvite(
    fullRepoPath: string,
    repoName: string,
    senderName?: string
  ): Promise<InviteResult> {
    const cwd = fullRepoPath;
    const udd = await UDDService.readUDD(cwd);
    const { originUrl } = await this.ensureOwnOutbox(cwd, repoName);

    const parsed = parseGitHubUrl(originUrl);
    if (!parsed) {
      throw new Error(`Origin is not a GitHub URL: ${originUrl}`);
    }

    const transportUrl = `interbrain://${udd.uuid}?peer=${parsed.owner}/${parsed.repo}`;
    // Clickable Obsidian-protocol invite that the URI handler already
    // understands (routes to cloneFromGitHub). We pass senderName AND
    // senderDid (both set to the gh username) so the URI handler's
    // existing collaboration handshake fires and creates a Dreamer node
    // for the sender on the recipient's side. Under rc.21, the gh
    // username is the canonical peer identity and replaces the legacy
    // did:key string in `.udd.did`.
    let inviteUrl = `obsidian://interbrain-clone?ids=github.com/${parsed.owner}/${parsed.repo}`;
    if (senderName) {
      inviteUrl += `&senderName=${encodeURIComponent(senderName)}`;
      inviteUrl += `&senderDid=${encodeURIComponent(senderName)}`;
    }
    return { inviteUrl, githubUrl: originUrl, transportUrl };
  }

  /**
   * Idempotently arrange remotes so `origin` is the current user's GitHub
   * repo. If origin already points there → no-op. If origin points to a
   * different owner → rename to that owner's peer remote and create a new
   * outbox. If no origin → create an outbox.
   */
  private async ensureOwnOutbox(
    cwd: string,
    repoName: string
  ): Promise<{ originUrl: string; createdOutbox: boolean }> {
    const me = await this.getCurrentUser();
    const existingOrigin = await this.tryGetRemoteUrl(cwd, 'origin');

    if (existingOrigin) {
      const parsed = parseGitHubUrl(existingOrigin);
      if (parsed && parsed.owner.toLowerCase() === me.toLowerCase()) {
        return { originUrl: existingOrigin, createdOutbox: false };
      }
      // Origin is someone else's (or non-GitHub). Preserve the link by
      // renaming it to a peer remote, then create our own outbox.
      if (parsed) {
        const peerName = sanitizePeerRemoteName(parsed.owner);
        await this.ensureRemote(cwd, peerName, existingOrigin);
        await execAsync(`git remote remove origin`, { cwd });
      } else {
        // Non-GitHub origin (e.g., legacy rad). Just drop it.
        await execAsync(`git remote remove origin`, { cwd });
      }
    }

    const { originUrl, created } = await this.ensureOutbox(cwd, me, repoName);
    return { originUrl, createdOutbox: created };
  }

  /**
   * Ensure a GitHub repo named `<me>/<repoName>` exists and is wired up as
   * `origin` on the local repo. Idempotent across runs:
   *   - repo doesn't exist on GitHub → create + push (gh repo create --push)
   *   - repo exists on GitHub, no origin locally → add origin + push
   *   - both exist and match → no-op (we shouldn't end up here; caller
   *     short-circuits when origin already points at me/repo)
   */
  private async ensureOutbox(
    cwd: string,
    me: string,
    repoName: string
  ): Promise<{ originUrl: string; created: boolean }> {
    const gh = await this.detectGhPath();
    const expectedUrl = `https://github.com/${me}/${repoName}`;

    // Does the repo already exist on GitHub under this user?
    let remoteExists = false;
    try {
      await execAsync(`"${gh}" repo view ${shellQuote(`${me}/${repoName}`)} --json name`);
      remoteExists = true;
    } catch {
      // Doesn't exist (or no read access) — we'll create it below.
    }

    if (remoteExists) {
      // Wire it as origin and push current HEAD. Use git, not gh, so we
      // don't trigger "repo already exists" from `gh repo create`.
      await this.ensureRemote(cwd, 'origin', expectedUrl);
      const branch = await this.currentBranch(cwd);
      await execAsync(`git push -u origin ${shellQuote(branch)}`, { cwd });
      return { originUrl: expectedUrl, created: false };
    }

    // Fresh create. `--push` does the initial push as part of creation.
    const { stdout } = await execAsync(
      `"${gh}" repo create ${shellQuote(repoName)} --public --source=. --remote=origin --push`,
      { cwd }
    );
    const match = stdout.match(/https:\/\/github\.com\/[^\s]+/);
    if (!match) {
      // Some gh versions only print "✓ Created repository ..."; fall back
      // to reading origin (gh sets it as part of --remote=origin).
      const url = await this.tryGetRemoteUrl(cwd, 'origin');
      if (!url) {
        throw new Error('Created repo but could not determine its URL.');
      }
      return { originUrl: url.replace(/\.git$/, ''), created: true };
    }
    return { originUrl: match[0].replace(/\.git$/, ''), created: true };
  }

  private async ensureRemote(cwd: string, name: string, url: string): Promise<void> {
    const existing = await this.tryGetRemoteUrl(cwd, name);
    if (existing === url) return;
    if (existing) {
      await execAsync(`git remote set-url ${shellQuote(name)} ${shellQuote(url)}`, { cwd });
    } else {
      await execAsync(`git remote add ${shellQuote(name)} ${shellQuote(url)}`, { cwd });
    }
  }

  private async tryGetRemoteUrl(cwd: string, name: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync(`git remote get-url ${shellQuote(name)}`, { cwd });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  private async currentBranch(cwd: string): Promise<string> {
    const { stdout } = await execAsync(`git branch --show-current`, { cwd });
    return stdout.trim() || 'main';
  }

  /**
   * Auto-commit any working-copy changes (including dirty submodules) so a
   * subsequent push has something coherent to send. Returns true if a
   * commit was created.
   */
  private async autoCommitIfDirty(cwd: string): Promise<boolean> {
    const { stdout: status } = await execAsync(`git status --porcelain`, { cwd });
    if (!status.trim()) return false;

    // Recurse into dirty submodules first so the parent picks up updated
    // pointers. Only follow paths we know are submodules.
    const submodulePaths = await this.listSubmodulePaths(cwd);
    const dirtySubmodules = status
      .split('\n')
      .filter((line: string) => line.startsWith(' M '))
      .map((line: string) => line.trim().slice(2).trim())
      .filter((p: string) => submodulePaths.includes(p));

    for (const sub of dirtySubmodules) {
      const subPath = path.join(cwd, sub);
      try {
        await execAsync(`git add -A`, { cwd: subPath });
        await execAsync(
          `git commit -m "Auto-commit submodule changes (${new Date().toISOString()})"`,
          { cwd: subPath }
        );
      } catch {
        // Submodule may already be clean after add; ignore.
      }
    }

    await execAsync(`git add -A`, { cwd });
    await execAsync(
      `git commit -m "Share changes (${new Date().toISOString()})"`,
      { cwd }
    );
    return true;
  }

  private async listSubmodulePaths(cwd: string): Promise<string[]> {
    try {
      const fs = require('fs').promises;
      const content = await fs.readFile(path.join(cwd, '.gitmodules'), 'utf-8');
      return content
        .split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l.startsWith('path ='))
        .map((l: string) => l.split('=')[1].trim());
    } catch {
      return [];
    }
  }
}

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  // Matches https://github.com/<owner>/<repo>(.git)? and git@github.com:<owner>/<repo>(.git)?
  const httpsMatch = url.match(/github\.com[/:]([^/]+)\/([^/\s.]+)(?:\.git)?$/);
  if (!httpsMatch) return null;
  return { owner: httpsMatch[1], repo: httpsMatch[2] };
}

/**
 * Map a GitHub username to a safe git remote name. Git remote names cannot
 * contain certain characters; users with hyphens are fine, but we lowercase
 * and strip anything weird for predictability.
 */
function sanitizePeerRemoteName(owner: string): string {
  return owner.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

function shellQuote(s: string): string {
  return `"${s.replace(/"/g, '\\"')}"`;
}

let _instance: SovereigntyService | null = null;
export function getSovereigntyService(): SovereigntyService {
  if (!_instance) _instance = new SovereigntyService();
  return _instance;
}
