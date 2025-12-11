/**
 * Git Sync Service - P2P/Radicle synchronization operations
 *
 * Handles remote synchronization for DreamNode repositories:
 * - Fetch updates from peers and remotes
 * - Pull/cherry-pick from peers
 * - Push to available remotes (Radicle + GitHub)
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

      // Determine which remote to fetch from (avoid broken Radicle remotes if CLI not available)
      let remoteName = 'origin'; // Default
      const remotes = remoteOutput.trim().split('\n');

      try {
        // Try to get the upstream remote for current branch
        const { stdout: upstreamOutput } = await execAsync('git rev-parse --abbrev-ref --symbolic-full-name @{upstream}', { cwd: fullPath });
        const upstream = upstreamOutput.trim();
        if (upstream && upstream !== '@{upstream}') {
          // Extract remote name from refs/remotes/<remote>/<branch>
          const remoteMatch = upstream.match(/^([^/]+)\//);
          if (remoteMatch) {
            const detectedRemote = remoteMatch[1];

            // Skip 'rad' remote if Radicle CLI is not available
            if (detectedRemote === 'rad') {
              const { serviceManager } = await import('../../../core/services/service-manager');
              const radicleService = serviceManager.getRadicleService();
              const isRadicleAvailable = await radicleService.isAvailable();

              if (!isRadicleAvailable) {
                console.log(`GitSyncService: Skipping 'rad' remote - Radicle CLI not available`);
                // Fall through to manual selection below
              } else {
                remoteName = detectedRemote;
              }
            } else {
              remoteName = detectedRemote;
            }
          }
        }
      } catch {
        // No upstream configured, continue to manual selection
      }

      // If we're still on 'origin' (default), try to pick a better remote
      if (remoteName === 'origin' && !remotes.includes('origin')) {
        if (remotes.includes('github')) {
          remoteName = 'github';
        } else if (remotes.length > 0) {
          remoteName = remotes.find((r: string) => r !== 'rad') || remotes[0];
        }
      }

      console.log(`GitSyncService: Fetching from remote: ${remoteName}`);

      // If fetching from Radicle, enhance PATH with git-remote-rad helper
      const execOptions: any = { cwd: fullPath };
      if (remoteName === 'rad') {
        const homeDir = (globalThis as any).process?.env?.HOME || '';
        const radicleGitHelperPaths = [
          `${homeDir}/.radicle/bin`,
          '/usr/local/bin',
          '/opt/homebrew/bin'
        ];

        const enhancedPath = radicleGitHelperPaths.join(':') + ':' + ((globalThis as any).process?.env?.PATH || '');
        execOptions.env = {
          ...(globalThis as any).process.env,
          PATH: enhancedPath
        };
        console.log(`GitSyncService: Enhanced PATH for Radicle fetch: ${enhancedPath}`);
      }

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

      // ALSO fetch from peer remotes (for pure p2p collaboration)
      console.log(`GitSyncService: Checking for peer remotes...`);
      const { stdout: remoteVerbose } = await execAsync('git remote -v', { cwd: fullPath });
      const peerRemotes = new Set<string>();

      for (const line of remoteVerbose.split('\n')) {
        const match = line.match(/^(\S+)\s+rad:\/\/\S+\/(z6\w+)/);
        if (match) {
          const peerName = match[1];
          peerRemotes.add(peerName);
        }
      }

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

      // Enhance PATH for Radicle git-remote-rad helper
      const homeDir = (globalThis as any).process?.env?.HOME || '';
      const radicleGitHelperPaths = [
        `${homeDir}/.radicle/bin`,
        '/usr/local/bin',
        '/opt/homebrew/bin'
      ];

      const enhancedPath = radicleGitHelperPaths.join(':') + ':' + ((globalThis as any).process?.env?.PATH || '');
      const execOptions = {
        cwd: fullPath,
        env: {
          ...(globalThis as any).process.env,
          PATH: enhancedPath
        }
      };

      // InterBrain node: Always use simple pull (GitHub-only, no Radicle p2p)
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

  /**
   * Detect available git remote and push to it intelligently
   * Strategy:
   * - If both Radicle (rad) and GitHub (github) exist: Push to BOTH
   * - Otherwise: Priority is Radicle → GitHub → origin → first available
   */
  async pushToAvailableRemote(repoPath: string, radiclePassphrase?: string): Promise<{ remote: string; type: 'radicle' | 'github' | 'other' | 'dual' }> {
    const fullPath = this.getFullPath(repoPath);

    try {
      console.log(`\n🔍 [GitSyncService] ===== PUSH TO NETWORK DEBUG =====`);
      console.log(`📂 [GitSyncService] Full path: ${fullPath}`);

      // Check git status first
      const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: fullPath });
      const hasUncommittedChanges = !!statusOutput.trim();
      console.log(`📊 [GitSyncService] Git status:\n${statusOutput || '  (no changes)'}`);

      // If there are uncommitted changes, commit them first
      if (hasUncommittedChanges) {
        console.log(`⚠️ [GitSyncService] Found uncommitted changes - committing before push...`);

        // Check if any submodules have internal uncommitted changes
        const potentialSubmoduleChanges = statusOutput
          .split('\n')
          .filter((line: string) => line.startsWith(' M '))
          .map((line: string) => line.trim().substring(2).trim());

        console.log(`🔍 [GitSyncService] Found ${potentialSubmoduleChanges.length} potential submodule changes: ${potentialSubmoduleChanges.join(', ')}`);

        if (potentialSubmoduleChanges.length > 0) {
          const gitmodulesPath = path.join(fullPath, '.gitmodules');
          let submodulePaths: string[] = [];

          try {
            const fs = require('fs').promises;
            const gitmodulesContent = await fs.readFile(gitmodulesPath, 'utf-8');

            const lines = gitmodulesContent.split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('path =')) {
                const submodulePath = trimmed.split('=')[1].trim();
                submodulePaths.push(submodulePath);
              }
            }

            console.log(`📦 [GitSyncService] Submodule paths from .gitmodules: ${submodulePaths.join(', ')}`);
          } catch {
            console.log(`⚠️ [GitSyncService] No .gitmodules file found or couldn't read it`);
          }

          const submoduleChanges = potentialSubmoduleChanges.filter((p: string) =>
            submodulePaths.includes(p)
          );

          console.log(`📦 [GitSyncService] Confirmed ${submoduleChanges.length} submodule(s) with internal changes: ${submoduleChanges.join(', ')}`);

          if (submoduleChanges.length > 0) {
            console.log(`📦 [GitSyncService] Processing ${submoduleChanges.length} submodule commit(s)...`);

            try {
              for (const submodulePath of submoduleChanges) {
                const fullSubmodulePath = path.join(fullPath, submodulePath);

                console.log(`📦 [GitSyncService] Committing changes in submodule: ${submodulePath}`);

                await execAsync('git add -A', { cwd: fullSubmodulePath });

                const timestamp = new Date().toISOString();
                await execAsync(`git commit -m "Auto-commit submodule changes (${timestamp})"`, { cwd: fullSubmodulePath });

                console.log(`✅ [GitSyncService] Submodule ${submodulePath} committed`);
              }
            } catch (submoduleError: any) {
              console.warn(`⚠️ [GitSyncService] Could not process submodules: ${submoduleError.message}`);
              console.warn(`   Continuing with parent commit...`);
            }
          }
        }

        // Stage all changes (including updated submodule pointers)
        await execAsync('git add -A', { cwd: fullPath });

        // Commit with fallback message
        try {
          const timestamp = new Date().toISOString();
          const result = await execAsync(`git commit -m "Auto-commit before push (${timestamp})"`, { cwd: fullPath });
          console.log(`✅ [GitSyncService] Changes committed with fallback message`);
          console.log(`   Commit output: ${result.stdout}`);
        } catch (commitError: any) {
          console.error(`❌ [GitSyncService] Git commit failed:`, commitError);
          console.error(`   stderr: ${commitError.stderr || 'none'}`);
          console.error(`   stdout: ${commitError.stdout || 'none'}`);
          throw new Error(`Failed to commit changes: ${commitError.message}`);
        }
      }

      // Check current branch
      const { stdout: branchOutput } = await execAsync('git branch --show-current', { cwd: fullPath });
      const currentBranch = branchOutput.trim();
      console.log(`🌿 [GitSyncService] Current branch: ${currentBranch}`);

      // Get all configured remotes
      const { stdout: remotesOutput } = await execAsync('git remote -v', { cwd: fullPath });
      console.log(`🌐 [GitSyncService] Configured remotes:\n${remotesOutput}`);

      const { stdout: remoteListOutput } = await execAsync('git remote', { cwd: fullPath });
      const remotes = remoteListOutput.trim().split('\n').filter((r: string) => r);

      if (remotes.length === 0) {
        console.log(`⚠️ [GitSyncService] No remotes found - initializing Radicle...`);

        const { serviceManager } = await import('../../../core/services/service-manager');
        const radicleService = serviceManager.getRadicleService();

        if (!await radicleService.isAvailable()) {
          throw new Error('No git remotes configured and Radicle CLI not available. Please install Radicle or set up GitHub.');
        }

        const dirName = path.basename(fullPath);
        console.log(`🔧 [GitSyncService] Initializing ${dirName} as Radicle repository...`);
        await radicleService.init(fullPath, dirName, undefined, undefined);
        console.log(`✅ [GitSyncService] Radicle initialized!`);

        const { stdout: newRemoteList } = await execAsync('git remote', { cwd: fullPath });
        remotes.length = 0;
        remotes.push(...newRemoteList.trim().split('\n').filter((r: string) => r));
      }

      const hasRadicle = remotes.includes('rad');
      const hasGitHub = remotes.includes('github');
      const hasOrigin = remotes.includes('origin');

      // DUAL REMOTE MODE: If both Radicle and GitHub exist, push to BOTH
      if (hasRadicle && hasGitHub) {
        console.log(`\n🌐 [GitSyncService] DUAL REMOTE MODE: Found both Radicle and GitHub`);
        console.log(`📡 [GitSyncService] Strategy: Radicle (collaboration) + GitHub (publishing)`);

        console.log(`\n🚀 [GitSyncService] [1/2] Pushing to Radicle...`);
        const { serviceManager } = await import('../../../core/services/service-manager');
        const radicleService = serviceManager.getRadicleService();
        await radicleService.share(fullPath, radiclePassphrase);
        console.log(`✅ [GitSyncService] Radicle sync complete!`);

        console.log(`\n🚀 [GitSyncService] [2/2] Pushing to GitHub...`);
        const { stdout: ghPushOutput, stderr: ghPushError } = await execAsync(`git push github ${currentBranch}`, { cwd: fullPath });
        console.log(`📤 [GitSyncService] GitHub push stdout:\n${ghPushOutput || '(empty)'}`);
        if (ghPushError) {
          console.log(`⚠️ [GitSyncService] GitHub push stderr:\n${ghPushError}`);
        }
        console.log(`✅ [GitSyncService] GitHub push complete!`);

        console.log(`\n🎉 [GitSyncService] DUAL PUSH COMPLETE: Radicle + GitHub`);
        return { remote: 'rad + github', type: 'dual' };
      }

      // SINGLE REMOTE MODE: Priority-based selection
      if (hasRadicle) {
        console.log(`\n🚀 [GitSyncService] Found Radicle remote - using RadicleService.share()`);
        const { serviceManager } = await import('../../../core/services/service-manager');
        const radicleService = serviceManager.getRadicleService();
        await radicleService.share(fullPath, radiclePassphrase);
        console.log(`✅ [GitSyncService] Radicle sync complete!`);
        return { remote: 'rad', type: 'radicle' };
      }

      if (hasGitHub) {
        console.log(`\n🚀 [GitSyncService] Found GitHub remote - pushing to github ${currentBranch}`);
        const { stdout: pushOutput, stderr: pushError } = await execAsync(`git push github ${currentBranch}`, { cwd: fullPath });
        console.log(`📤 [GitSyncService] Push stdout:\n${pushOutput || '(empty)'}`);
        if (pushError) {
          console.log(`⚠️ [GitSyncService] Push stderr:\n${pushError}`);
        }
        console.log(`✅ [GitSyncService] GitHub push complete!`);
        return { remote: 'github', type: 'github' };
      }

      if (hasOrigin) {
        try {
          const { stdout: originUrl } = await execAsync('git remote get-url origin', { cwd: fullPath });
          const isGitHub = originUrl.includes('github.com');

          console.log(`\n🚀 [GitSyncService] Found origin remote (${isGitHub ? 'GitHub' : 'other'}): ${originUrl.trim()}`);

          if (isGitHub && originUrl.startsWith('https://')) {
            console.log(`⚠️ [GitSyncService] Skipping GitHub HTTPS remote (requires authentication)`);
            throw new Error('GitHub HTTPS remote requires authentication - skipping');
          }

          console.log(`🚀 [GitSyncService] Pushing to origin ${currentBranch}...`);
          const { stdout: pushOutput, stderr: pushError } = await execAsync(`git push origin ${currentBranch}`, { cwd: fullPath });
          console.log(`📤 [GitSyncService] Push stdout:\n${pushOutput || '(empty)'}`);
          if (pushError) {
            console.log(`⚠️ [GitSyncService] Push stderr:\n${pushError}`);
          }
          console.log(`✅ [GitSyncService] Origin push complete!`);
          return { remote: 'origin', type: isGitHub ? 'github' : 'other' };
        } catch (error) {
          console.error('❌ [GitSyncService] Failed to push to origin:', error);
        }
      }

      // Fallback: Try remaining remotes in order
      console.log(`\n🔍 [GitSyncService] Trying remaining remotes in order...`);

      for (const remote of remotes) {
        try {
          const { stdout: remoteUrl } = await execAsync(`git remote get-url ${remote}`, { cwd: fullPath });
          const isGitHubHttps = remoteUrl.includes('github.com') && remoteUrl.startsWith('https://');

          if (isGitHubHttps) {
            console.log(`⚠️ [GitSyncService] Skipping ${remote} (GitHub HTTPS requires auth): ${remoteUrl.trim()}`);
            continue;
          }

          console.log(`\n🚀 [GitSyncService] Trying remote: ${remote} (${remoteUrl.trim()})`);
          const { stdout: pushOutput, stderr: pushError } = await execAsync(`git push ${remote} ${currentBranch}`, { cwd: fullPath });
          console.log(`📤 [GitSyncService] Push stdout:\n${pushOutput || '(empty)'}`);
          if (pushError) {
            console.log(`⚠️ [GitSyncService] Push stderr:\n${pushError}`);
          }
          console.log(`✅ [GitSyncService] Push complete to ${remote}!`);

          const isGitHub = remoteUrl.includes('github.com');
          return { remote, type: isGitHub ? 'github' : 'other' };
        } catch (error) {
          console.warn(`⚠️ [GitSyncService] Failed to push to ${remote}, trying next...`, error);
          continue;
        }
      }

      throw new Error('No pushable remotes available (all remotes require authentication or failed)');

    } catch (error) {
      console.error('❌ [GitSyncService] Failed to push to remote:', error);
      if (error instanceof Error) {
        console.error('❌ [GitSyncService] Error details:', {
          message: error.message,
          stack: error.stack
        });
      }
      throw new Error(`Failed to push changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
