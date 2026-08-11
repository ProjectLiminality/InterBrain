/**
 * Git Sync Service - peer synchronization over GitHub remotes
 *
 * Handles remote synchronization for DreamNode repositories:
 * - Fetch updates from peers and remotes
 * - Pull/cherry-pick from peers
 * - Divergence detection
 * - Read-only repository detection
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execAsync = promisify(exec);

import { App } from 'obsidian';

// Type for accessing file system path from Obsidian vault adapter
interface VaultAdapter {
  path?: string;
  basePath?: string;
}

/**
 * Information about a single commit
 */
export interface CommitInfo {
  hash: string;
  author: string;
  email: string;
  timestamp: number;
  subject: string;
  body: string;
  source?: string; // The ref this commit came from (e.g., "Martina/main", "Bob/main", "rad/main")
}

/**
 * Result of fetching updates from remote
 */
export interface FetchResult {
  hasUpdates: boolean;
  commits: CommitInfo[];
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export class GitSyncService {
  private vaultPath: string = '';

  constructor(private app?: App) {
    if (app) {
      this.initializeVaultPath(app);
    }
  }

  private initializeVaultPath(app: App): void {
    const adapter = app.vault.adapter as VaultAdapter;

    let vaultPath = '';
    if (typeof adapter.path === 'string') {
      vaultPath = adapter.path;
    } else if (typeof adapter.basePath === 'string') {
      vaultPath = adapter.basePath;
    } else if (adapter.path && typeof adapter.path === 'object') {
      vaultPath = (adapter.path as any).path || (adapter.path as any).basePath || '';
    }

    this.vaultPath = vaultPath;
  }

  private getFullPath(repoPath: string): string {
    if (!this.vaultPath) {
      console.warn('GitSyncService: Vault path not initialized, using relative path');
      return repoPath;
    }
    return path.join(this.vaultPath, repoPath);
  }

  /**
   * Fetch updates from remote without merging
   * Returns metadata about new commits available
   */
  async fetchUpdates(repoPath: string): Promise<FetchResult> {
    const fullPath = this.getFullPath(repoPath);
    try {
      console.log(`GitSyncService: Fetching updates for ${fullPath}`);

      // First check if there's a remote configured
      const { stdout: remoteOutput } = await execAsync('git remote', { cwd: fullPath });
      if (!remoteOutput.trim()) {
        return {
          hasUpdates: false,
          commits: [],
          filesChanged: 0,
          insertions: 0,
          deletions: 0
        };
      }

      // The outbox (origin) is the fetch target (#409); legacy 'github'
      // remotes are adopted as origin by ensureOwnOutbox, and dead rad
      // remotes are ignored entirely.
      let remoteName = 'origin';
      const remotes = remoteOutput.trim().split('\n');
      if (!remotes.includes('origin')) {
        if (remotes.includes('github')) {
          remoteName = 'github';
        } else {
          const candidate = remotes.find((r: string) => r && r !== 'rad');
          if (!candidate) {
            return { hasUpdates: false, commits: [], filesChanged: 0, insertions: 0, deletions: 0 };
          }
          remoteName = candidate;
        }
      }

      console.log(`GitSyncService: Fetching from remote: ${remoteName}`);
      const execOptions: any = { cwd: fullPath };

      try {
        await execAsync(`git fetch ${remoteName}`, execOptions);
      } catch (fetchError: any) {
        const errorMsg = fetchError.message || '';
        const errorOutput = fetchError.stderr || fetchError.stdout || '';
        console.log(`GitSyncService: Fetch failed from ${remoteName}:`, errorMsg);
        if (errorOutput) {
          console.log(`GitSyncService: Fetch error output:`, errorOutput);
        }

        if (errorMsg.includes('Repository not found') ||
            errorMsg.includes('remote-rad') ||
            errorMsg.includes('Could not resolve host')) {
          console.log(`GitSyncService: Treating as no updates (remote unavailable or no access)`);
          return {
            hasUpdates: false,
            commits: [],
            filesChanged: 0,
            insertions: 0,
            deletions: 0
          };
        }
        throw fetchError;
      }

      // ALSO fetch from peer remotes (for pure p2p collaboration).
      //
      // A peer remote is a GitHub remote owned by someone who isn't me
      // (#409 invariant 2). Legacy `github` remotes pointing at MY OWN
      // published repo and dead `rad://` remotes are NOT peers — the old
      // "any remote that isn't origin" rule misread both.
      console.log(`GitSyncService: Checking for peer remotes...`);
      const { listPeerRemotes } = await import('./peer-remotes');
      const peerRemotes = new Set<string>(await listPeerRemotes(fullPath));

      if (peerRemotes.size > 0) {
        console.log(`GitSyncService: Found ${peerRemotes.size} peer remote(s): ${Array.from(peerRemotes).join(', ')}`);
        for (const peerName of peerRemotes) {
          try {
            console.log(`GitSyncService: Fetching from peer ${peerName}...`);
            await execAsync(`git fetch ${peerName}`, execOptions);
            console.log(`GitSyncService: Successfully fetched from ${peerName}`);
          } catch (peerFetchError: any) {
            console.warn(`GitSyncService: Failed to fetch from peer ${peerName}:`, peerFetchError.message);
          }
        }
      } else {
        console.log(`GitSyncService: No peer remotes found`);
      }

      // Check current branch
      const { stdout: branchOutput } = await execAsync('git branch --show-current', { cwd: fullPath });
      const currentBranch = branchOutput.trim();
      console.log(`[GitSyncService] Current branch: ${currentBranch}`);

      // Check upstream tracking branch
      try {
        const { stdout: upstreamOutput } = await execAsync(`git rev-parse --abbrev-ref ${currentBranch}@{upstream}`, { cwd: fullPath });
        console.log(`[GitSyncService] Upstream tracking: ${upstreamOutput.trim()}`);
      } catch {
        console.log(`[GitSyncService] No upstream tracking branch configured`);
      }

      // Build list of refs to check: upstream + all peer main branches
      const refsToCheck: string[] = [];

      try {
        const { stdout: upstreamRef } = await execAsync(`git rev-parse --abbrev-ref ${currentBranch}@{upstream}`, { cwd: fullPath });
        if (upstreamRef.trim()) {
          refsToCheck.push(upstreamRef.trim());
        }
      } catch {
        // No upstream, that's ok
      }

      for (const peerName of peerRemotes) {
        refsToCheck.push(`${peerName}/${currentBranch}`);
      }

      console.log(`[GitSyncService] Checking for updates from: ${refsToCheck.join(', ')}`);

      // Check each ref for new commits and track source
      const commits: CommitInfo[] = [];
      const seenHashes = new Set<string>();

      for (const ref of refsToCheck) {
        try {
          const { stdout } = await execAsync(
            `git log HEAD..${ref} --format="%H%x00%an%x00%ae%x00%at%x00%s%x00%b%x00"`,
            { cwd: fullPath }
          );
          if (stdout.trim()) {
            console.log(`[GitSyncService] Found updates from ${ref}`);

            const commitBlocks = stdout.trim().split('\x00\n').filter((block: string) => block.trim());

            for (const block of commitBlocks) {
              const parts = block.split('\x00');
              const hash = parts[0] || '';
              const author = parts[1] || 'Unknown';
              const email = parts[2] || '';
              const timestamp = parseInt(parts[3] || '0', 10);
              const subject = parts[4] || 'No subject';
              const body = parts[5] || '';

              if (seenHashes.has(hash)) {
                console.log(`[GitSyncService] Skipping duplicate commit ${hash.substring(0, 7)}`);
                continue;
              }

              try {
                await execAsync(`git cat-file -e ${hash}`, { cwd: fullPath });
                const { stdout: mergeBase } = await execAsync(`git merge-base HEAD ${hash}`, { cwd: fullPath });
                if (mergeBase.trim() === hash) {
                  console.log(`[GitSyncService] Commit ${hash.substring(0, 7)} already in history - skipping`);
                  continue;
                }
              } catch {
                // Commit doesn't exist locally or isn't reachable - include it
              }

              seenHashes.add(hash);
              commits.push({
                hash,
                author,
                email,
                timestamp,
                subject,
                body: body.trim(),
                source: ref
              });
            }
          }
        } catch {
          console.log(`[GitSyncService] No commits from ${ref} (may not exist)`);
        }
      }

      console.log('[GitSyncService] Parsed commits from all refs:', commits.length);

      if (commits.length === 0) {
        console.log('[GitSyncService] No updates from any peer or upstream');
        return {
          hasUpdates: false,
          commits: [],
          filesChanged: 0,
          insertions: 0,
          deletions: 0
        };
      }

      console.log('[GitSyncService] Commits with sources:', commits);

      // Get diff stats
      const { stdout: statsOutput } = await execAsync(
        'git diff --shortstat HEAD @{upstream}',
        { cwd: fullPath }
      );

      const filesMatch = statsOutput.match(/(\d+) files? changed/);
      const insertMatch = statsOutput.match(/(\d+) insertions?/);
      const deleteMatch = statsOutput.match(/(\d+) deletions?/);

      return {
        hasUpdates: true,
        commits,
        filesChanged: filesMatch ? parseInt(filesMatch[1], 10) : 0,
        insertions: insertMatch ? parseInt(insertMatch[1], 10) : 0,
        deletions: deleteMatch ? parseInt(deleteMatch[1], 10) : 0
      };
    } catch (error) {
      console.error('GitSyncService: Failed to fetch updates:', error);
      return {
        hasUpdates: false,
        commits: [],
        filesChanged: 0,
        insertions: 0,
        deletions: 0
      };
    }
  }

  /**
   * Pull updates from remote (cherry-pick or merge fetched changes)
   * For peer updates: cherry-picks specific commits to preserve attribution
   * For regular updates: uses git pull for fast-forward/merge
   */
  async pullUpdates(repoPath: string, commits?: string[]): Promise<void> {
    const fullPath = this.getFullPath(repoPath);
    try {
      // SPECIAL CASE: InterBrain node (550e8400-e29b-41d4-a716-446655440000)
      const fs = require('fs');
      const uddPath = path.join(fullPath, '.udd');
      let isInterBrainNode = false;

      try {
        const uddContent = fs.readFileSync(uddPath, 'utf-8');
        const udd = JSON.parse(uddContent);
        isInterBrainNode = udd.uuid === '550e8400-e29b-41d4-a716-446655440000';
      } catch {
        isInterBrainNode = false;
      }

      const execOptions = { cwd: fullPath };

      // InterBrain node: Always use simple pull
      if (isInterBrainNode) {
        console.log(`GitSyncService: InterBrain node detected - using simple pull strategy`);

        try {
          await execAsync('git cherry-pick --abort', execOptions);
        } catch {
          // No cherry-pick in progress, that's fine
        }

        console.log(`GitSyncService: Resetting local state to match remote (GitHub canonical)`);
        await execAsync('git fetch origin', execOptions);
        await execAsync('git reset --hard origin/main', execOptions);
        console.log(`GitSyncService: Successfully updated InterBrain node from GitHub`);
        return;
      }

      if (commits && commits.length > 0) {
        const lastCommit = commits[commits.length - 1];
        let canFastForward = false;

        try {
          const { stdout: mergeBaseOutput } = await execAsync(`git merge-base HEAD ${lastCommit}`, execOptions);
          const mergeBase = mergeBaseOutput.trim();
          const { stdout: headOutput } = await execAsync('git rev-parse HEAD', execOptions);
          const currentHead = headOutput.trim();

          if (mergeBase === currentHead) {
            canFastForward = true;
            console.log(`GitSyncService: Can fast-forward from ${currentHead} to ${lastCommit}`);
          }
        } catch (error) {
          console.log(`GitSyncService: Merge-base check failed, will use cherry-pick:`, error);
        }

        if (canFastForward) {
          console.log(`GitSyncService: Fast-forwarding to ${lastCommit}`);
          try {
            await execAsync(`git merge --ff-only ${lastCommit}`, execOptions);
            console.log(`GitSyncService: ✓ Fast-forwarded successfully`);
          } catch (error: any) {
            console.error(`GitSyncService: Fast-forward failed:`, error);
            throw new Error(`Failed to fast-forward: ${error.message}`);
          }
        } else {
          console.log(`GitSyncService: Cherry-picking ${commits.length} commit(s) from peer:`, commits);

          try {
            await execAsync('git cherry-pick --abort', execOptions);
            console.log(`GitSyncService: Aborted previous cherry-pick session`);
          } catch {
            // No cherry-pick in progress, that's fine
          }

          for (const commitHash of commits) {
            try {
              await execAsync(`git cherry-pick --autostash ${commitHash}`, execOptions);
              console.log(`GitSyncService: ✓ Cherry-picked ${commitHash}`);
            } catch (error: any) {
              if (error.message && error.message.includes('now empty')) {
                console.log(`GitSyncService: Commit ${commitHash} already applied - skipping`);
                await execAsync('git cherry-pick --skip', execOptions);
              } else {
                console.error(`GitSyncService: Cherry-pick conflict for ${commitHash}`);

                try {
                  await execAsync('git cherry-pick --abort', execOptions);
                  console.log(`GitSyncService: Aborted cherry-pick, working tree restored`);
                } catch (abortError) {
                  console.error(`GitSyncService: Failed to abort cherry-pick:`, abortError);
                }

                throw new Error(
                  `Cherry-pick conflict: The peer's changes conflict with your local changes. ` +
                  `Please commit or stash your local changes first, then try again.`
                );
              }
            }
          }
          console.log(`GitSyncService: Successfully cherry-picked all commits`);
        }
      } else {
        console.log(`GitSyncService: Pulling updates from upstream`);
        await execAsync('git pull --no-rebase', execOptions);
        console.log(`GitSyncService: Successfully pulled updates in: ${fullPath}`);
      }
    } catch (error) {
      console.error('GitSyncService: Failed to pull updates:', error);
      throw new Error(`Failed to pull updates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if branches have diverged (local and remote have different commits)
   */
  async checkDivergentBranches(repoPath: string): Promise<{ hasDivergence: boolean; localCommits: number; remoteCommits: number }> {
    const fullPath = this.getFullPath(repoPath);
    try {
      const { stdout: branchOutput } = await execAsync('git branch --show-current', { cwd: fullPath });
      const currentBranch = branchOutput.trim();

      if (!currentBranch) {
        return { hasDivergence: false, localCommits: 0, remoteCommits: 0 };
      }

      let upstream: string;
      try {
        const { stdout: upstreamOutput } = await execAsync(`git rev-parse --abbrev-ref ${currentBranch}@{upstream}`, { cwd: fullPath });
        upstream = upstreamOutput.trim();
      } catch {
        console.log(`GitSyncService: No upstream tracking branch for ${currentBranch}, skipping divergence check`);
        return { hasDivergence: false, localCommits: 0, remoteCommits: 0 };
      }

      const { stdout } = await execAsync(`git rev-list --left-right --count ${upstream}...HEAD`, { cwd: fullPath });
      const [remoteCommits, localCommits] = stdout.trim().split('\t').map(Number);

      const hasDivergence = localCommits > 0 && remoteCommits > 0;

      return { hasDivergence, localCommits, remoteCommits };
    } catch (error) {
      console.error('GitSyncService: Failed to check divergent branches:', error);
      return { hasDivergence: false, localCommits: 0, remoteCommits: 0 };
    }
  }

  /**
   * Check if repository is read-only (GitHub-only without push access)
   */
  async isReadOnlyRepo(repoPath: string): Promise<boolean> {
    const fullPath = this.getFullPath(repoPath);
    try {
      const { stdout: remotesOutput } = await execAsync('git remote -v', { cwd: fullPath });

      if (remotesOutput.includes('rad://') || remotesOutput.includes('rad\t')) {
        return false;
      }

      const hasGitHub = remotesOutput.includes('github.com');
      if (!hasGitHub) {
        return false;
      }

      const githubMatch = remotesOutput.match(/github\.com[:/]([^/]+)\/([^/\s.]+)/);
      if (!githubMatch) {
        return false;
      }

      const repoOwner = githubMatch[1];

      try {
        const { stdout: ghUser } = await execAsync('gh api user -q .login 2>&1', { cwd: fullPath });
        const currentUser = ghUser.trim();

        if (!currentUser) {
          return true;
        }

        return repoOwner !== currentUser;
      } catch {
        return true;
      }
    } catch (error) {
      console.error('GitSyncService: Failed to check read-only status:', error);
      return false;
    }
  }

  /**
   * Reset local branch to match remote (discard local commits)
   */
  async resetToRemote(repoPath: string): Promise<void> {
    const fullPath = this.getFullPath(repoPath);
    try {
      console.log(`GitSyncService: Resetting ${fullPath} to remote`);

      const { stdout: branchOutput } = await execAsync('git branch --show-current', { cwd: fullPath });
      const currentBranch = branchOutput.trim();

      if (!currentBranch) {
        throw new Error('Not on a branch');
      }

      await execAsync(`git reset --hard origin/${currentBranch}`, { cwd: fullPath });
      console.log(`GitSyncService: Successfully reset to origin/${currentBranch}`);
    } catch (error) {
      console.error('GitSyncService: Failed to reset to remote:', error);
      throw new Error(`Failed to reset to remote: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

}
