/**
 * Coherence Beacon Service
 *
 * Detects and handles "coherence beacons" - metadata in git commits signaling
 * when one DreamNode becomes a submodule of another.
 *
 * Primary entry point: checkCommitsForBeacons() - called by dreamnode-updater
 * after pulling commits, which hands off beacon commits for user decision.
 *
 * REJECTION TRACKING: Currently placeholder - returns rejection info to caller.
 * Future: Unified commit rejection system in dreamnode-updater will handle
 * tracking rejected commits (both regular and beacon commits) in one place.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

import { App, Plugin } from 'obsidian';
import { RadicleService } from '../social-resonance-filter/services/radicle-service';
import { VaultService } from '../../core/services/vault-service';
import { GitDreamNodeService } from '../dreamnode/services/git-dreamnode-service';
import { getURIHandlerService } from '../uri-handler';
import {
  findDreamerByDID,
  getSubmoduleNames,
  readGitmodules,
  fileExists
} from '../dreamnode/utils/vault-scanner';
import { UDDService } from '../dreamnode/services/udd-service';
import { pushToRadicle } from '../dreamnode/utils/git-utils';

export interface CoherenceBeacon {
  type: 'supermodule';
  radicleId: string;
  title: string;
  commitHash: string;
  commitMessage: string;
  /** The parent commit that included this as a submodule (when beacon was ignited) */
  atCommit?: string;
}

/**
 * Result of beacon rejection - returned to caller for tracking
 */
export interface BeaconRejectionInfo {
  commitHash: string;
  radicleId: string;
  title: string;
  rejectedAt: string;
}

/**
 * Result of igniting a beacon for a single submodule
 */
export interface IgniteBeaconResult {
  submoduleName: string;
  status: 'created' | 'skipped' | 'error';
  message?: string;
}

export class CoherenceBeaconService {
  private vaultPath: string = '';
  private gitDreamNodeService: GitDreamNodeService;

  constructor(
    private app: App,
    private _vaultService: VaultService,
    private _radicleService: RadicleService,
    plugin: Plugin
  ) {
    this.initializeVaultPath(app);
    this.gitDreamNodeService = new GitDreamNodeService(plugin);
  }

  private initializeVaultPath(app: App): void {
    const adapter = app.vault.adapter as { path?: string; basePath?: string };
    if (typeof adapter.path === 'string') {
      this.vaultPath = adapter.path;
    } else if (typeof adapter.basePath === 'string') {
      this.vaultPath = adapter.basePath;
    }
  }

  /**
   * Check a DreamNode for beacons by fetching from network and parsing commits.
   * Used by the check-coherence-beacons command for manual beacon discovery.
   *
   * Note: For the update workflow, dreamnode-updater calls checkCommitsForBeacons()
   * directly after pulling commits.
   */
  async checkForBeacons(dreamNodePath: string): Promise<CoherenceBeacon[]> {
    const path = require('path');
    const fullPath = path.join(this.vaultPath, dreamNodePath);

    try {
      // Fetch from Radicle network (non-fatal if no seeds available)
      const radCmd = await this.getRadCommand();
      try {
        await execAsync(`"${radCmd}" sync --fetch`, { cwd: fullPath });
      } catch (fetchError) {
        console.warn('[CoherenceBeacon] Fetch failed (continuing with local refs):', fetchError);
      }

      // Get current HEAD commit
      const { stdout: currentHead } = await execAsync('git rev-parse HEAD', { cwd: fullPath });
      const headCommit = currentHead.trim();

      // Get commits from Radicle remotes that we don't have
      let logOutput = '';
      try {
        const { stdout } = await execAsync(
          `git log ${headCommit}..refs/remotes/rad/main --format="%H|%s|%b"`,
          { cwd: fullPath }
        );
        logOutput = stdout;
      } catch {
        // No new commits or rad/main doesn't exist
        return [];
      }

      if (!logOutput.trim()) {
        return [];
      }

      // Parse commits for beacons
      return this.parseCommitsForBeacons(logOutput);
    } catch (error) {
      console.error('[CoherenceBeacon] Error checking for beacons:', error);
      throw error;
    }
  }

  /**
   * Check specific commits for coherence beacons.
   * Primary entry point - called by dreamnode-updater after pulling commits.
   */
  async checkCommitsForBeacons(
    _dreamNodePath: string,
    commits: Array<{ hash: string; subject: string; body: string }>
  ): Promise<CoherenceBeacon[]> {
    const beacons: CoherenceBeacon[] = [];
    const BEACON_REGEX = /COHERENCE_BEACON:\s*({.*?})/g;

    for (const commit of commits) {
      const fullMessage = `${commit.subject}\n${commit.body}`;
      const match = BEACON_REGEX.exec(fullMessage);

      if (match) {
        try {
          const beaconData = JSON.parse(match[1]);

          if (beaconData.type === 'supermodule') {
            beacons.push({
              type: 'supermodule',
              radicleId: beaconData.radicleId,
              title: beaconData.title,
              commitHash: commit.hash,
              commitMessage: commit.subject,
              atCommit: beaconData.atCommit // Preserve parent commit reference
            });
          }
        } catch {
          // Skip invalid beacon JSON
        }
      }
    }

    return beacons;
  }

  /**
   * Accept a beacon: clone supermodule, establish relationships, merge commit.
   * Atomic operation - commit only merged if all clones succeed.
   */
  async acceptBeacon(dreamNodePath: string, beacon: CoherenceBeacon): Promise<void> {
    const path = require('path');
    const fullPath = path.join(this.vaultPath, dreamNodePath);

    try {
      // Check if already applied
      const { stdout: currentCommitMsg } = await execAsync('git log -1 --format="%b"', { cwd: fullPath });
      if (currentCommitMsg.includes(`COHERENCE_BEACON: {"type":"supermodule","radicleId":"${beacon.radicleId}"`)) {
        // Verify DreamNode exists
        const dreamNodeUddPath = path.join(this.vaultPath, beacon.title, '.udd');
        if (await fileExists(dreamNodeUddPath)) {
          return; // Already fully applied
        }
        // Beacon commit exists but DreamNode not cloned - continue
      }

      // PHASE 1: Clone supermodule
      const uriHandler = getURIHandlerService();
      const cloneResult = await uriHandler.cloneFromRadicle(beacon.radicleId, false);

      if (cloneResult === 'error') {
        throw new Error(
          `Failed to clone "${beacon.title}" from Radicle network.\n\n` +
          `NETWORK DELAY: Repositories may take 2-5 minutes to propagate.\n\n` +
          `WHAT TO DO:\n` +
          `• Wait a few minutes and run "Check for Updates" again\n` +
          `• The beacon commit remains unmerged - you can safely retry\n\n` +
          `Radicle ID: ${beacon.radicleId}`
        );
      }

      const clonedNodePath = path.join(this.vaultPath, beacon.title);

      // PHASE 2: Initialize submodules (using dreamnode utilities)
      await this.initializeSubmodules(clonedNodePath);

      // PHASE 3: Establish peer relationships (using dreamnode utilities)
      const sourcePeerDID = await this.getSourcePeerDID(fullPath);
      if (sourcePeerDID) {
        await this.establishPeerRelationships(beacon.title, sourcePeerDID);
      }

      // PHASE 4: Merge beacon commit (all clones succeeded)
      try {
        await execAsync(`git cherry-pick ${beacon.commitHash}`, { cwd: fullPath });
      } catch (cherryPickError: any) {
        if (cherryPickError.message?.includes('now empty')) {
          await execAsync('git cherry-pick --skip', { cwd: fullPath });
        } else {
          throw cherryPickError;
        }
      }
    } catch (error) {
      console.error('[CoherenceBeacon] Beacon acceptance failed:', error);
      throw error;
    }
  }

  /**
   * Reject a beacon: returns rejection info for caller to track.
   *
   * NOTE: This is a placeholder for a future unified rejection system.
   * Currently returns rejection info that the caller (dreamnode-updater)
   * should track. In the future, dreamnode-updater will maintain a
   * unified system for tracking all rejected commits.
   *
   * @returns Rejection info for the caller to persist/track
   */
  async rejectBeacon(_dreamNodePath: string, beacon: CoherenceBeacon): Promise<BeaconRejectionInfo> {
    // Return rejection info - caller is responsible for tracking
    // Future: dreamnode-updater will handle unified commit rejection tracking
    return {
      commitHash: beacon.commitHash,
      radicleId: beacon.radicleId,
      title: beacon.title,
      rejectedAt: new Date().toISOString()
    };
  }

  // ===== Beacon Ignition (Outgoing Beacons) =====

  /**
   * Ignite coherence beacons for all submodules of a parent DreamNode.
   *
   * For each submodule, creates a COHERENCE_BEACON commit in the sovereign repo
   * that signals "you are included in this parent project". Uses non-invasive
   * push to avoid forcing user's unpublished work.
   *
   * Called when user clicks "Share Changes" on a DreamNode that has submodules.
   *
   * @param parentPath - Vault-relative path to the parent DreamNode
   * @returns Array of results per submodule
   */
  async igniteBeacons(parentPath: string): Promise<IgniteBeaconResult[]> {
    const path = require('path');
    const results: IgniteBeaconResult[] = [];
    const parentFullPath = path.join(this.vaultPath, parentPath);

    try {
      // Get parent's info
      const parentUDD = await UDDService.readUDD(parentFullPath);
      const parentRadicleId = parentUDD.radicleId;
      const parentTitle = parentUDD.title;

      if (!parentRadicleId) {
        console.warn('[CoherenceBeacon] Cannot ignite beacons - parent has no Radicle ID');
        return results;
      }

      // Get current parent commit (the one that includes these submodules)
      const { stdout: parentCommit } = await execAsync('git rev-parse HEAD', { cwd: parentFullPath });
      const atCommit = parentCommit.trim();

      // Get all submodules from .gitmodules
      const submodules = await readGitmodules(parentFullPath);

      if (submodules.length === 0) {
        console.log('[CoherenceBeacon] No submodules found - nothing to ignite');
        return results;
      }

      // Process each submodule
      for (const submodule of submodules) {
        const sovereignPath = path.join(this.vaultPath, submodule.name);

        try {
          // Check if sovereign exists
          if (!(await fileExists(path.join(sovereignPath, '.git')))) {
            results.push({
              submoduleName: submodule.name,
              status: 'skipped',
              message: 'Sovereign repo not found at vault root'
            });
            continue;
          }

          // Check if beacon already exists for this parent
          const alreadyExists = await UDDService.hasSupermodule(sovereignPath, parentRadicleId);
          if (alreadyExists) {
            results.push({
              submoduleName: submodule.name,
              status: 'skipped',
              message: 'Beacon already exists'
            });
            continue;
          }

          // Create the beacon commit using non-invasive push
          await this.createBeaconCommit(
            sovereignPath,
            parentRadicleId,
            parentTitle,
            atCommit
          );

          results.push({
            submoduleName: submodule.name,
            status: 'created'
          });

        } catch (error) {
          console.error(`[CoherenceBeacon] Failed to ignite beacon for ${submodule.name}:`, error);
          results.push({
            submoduleName: submodule.name,
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return results;
    } catch (error) {
      console.error('[CoherenceBeacon] Failed to ignite beacons:', error);
      throw error;
    }
  }

  /**
   * Create a beacon commit in a sovereign repo using non-invasive push.
   *
   * This avoids forcing the user to push their unpublished work by:
   * 1. Stashing uncommitted changes
   * 2. Detaching to the last pushed commit
   * 3. Creating the beacon commit there
   * 4. Pushing only that commit
   * 5. Rebasing local work on top
   * 6. Restoring stash
   */
  private async createBeaconCommit(
    sovereignPath: string,
    parentRadicleId: string,
    parentTitle: string,
    atCommit: string
  ): Promise<void> {
    let stashCreated = false;
    let originalBranch = '';

    try {
      // 0. Get current branch name
      const { stdout: branchOutput } = await execAsync('git branch --show-current', { cwd: sovereignPath });
      originalBranch = branchOutput.trim() || 'main';

      // 1. Stash uncommitted changes
      const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: sovereignPath });
      if (statusOutput.trim()) {
        await execAsync('git stash push -m "InterBrain beacon stash"', { cwd: sovereignPath });
        stashCreated = true;
        console.log('[CoherenceBeacon] Stashed uncommitted changes');
      }

      // 2. Determine which remote to use (rad for Radicle, origin for GitHub)
      let remoteName = 'origin';
      try {
        await execAsync('git remote get-url rad', { cwd: sovereignPath });
        remoteName = 'rad';
      } catch {
        // No rad remote, try origin
      }

      // Fetch latest
      try {
        await execAsync(`git fetch ${remoteName}`, { cwd: sovereignPath });
      } catch {
        // No remote configured - that's OK, we'll just commit locally
        console.log('[CoherenceBeacon] No remote configured - creating local beacon only');
      }

      // Check if we have a remote to compare against
      let hasRemote = false;
      let lastPushed = '';
      try {
        const { stdout: remoteRef } = await execAsync(`git rev-parse ${remoteName}/main`, { cwd: sovereignPath });
        lastPushed = remoteRef.trim();
        hasRemote = true;
      } catch {
        // No remote or no remote/main - use current HEAD
        const { stdout: headRef } = await execAsync('git rev-parse HEAD', { cwd: sovereignPath });
        lastPushed = headRef.trim();
      }

      // 3. Check if we need to detach (are there unpushed commits?)
      const { stdout: currentHead } = await execAsync('git rev-parse HEAD', { cwd: sovereignPath });
      const needsDetach = hasRemote && currentHead.trim() !== lastPushed;

      if (needsDetach) {
        // Detach to last pushed commit
        await execAsync(`git checkout --detach ${lastPushed}`, { cwd: sovereignPath });
        console.log('[CoherenceBeacon] Detached to last pushed commit');
      }

      // 4. Update .udd with supermodule entry
      const entry = {
        radicleId: parentRadicleId,
        title: parentTitle,
        atCommit: atCommit,
        addedAt: Date.now()
      };
      await UDDService.addSupermoduleEntry(sovereignPath, entry);

      // 5. Create beacon commit
      const beaconData = JSON.stringify({
        type: 'supermodule',
        radicleId: parentRadicleId,
        title: parentTitle,
        atCommit: atCommit
      });
      const commitMessage = `Add supermodule relationship: ${parentTitle}\n\nCOHERENCE_BEACON: ${beaconData}`;

      await execAsync('git add .udd', { cwd: sovereignPath });
      await execAsync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { cwd: sovereignPath });
      console.log('[CoherenceBeacon] Created beacon commit');

      // Get the beacon commit hash (we're in detached HEAD, so HEAD is the beacon)
      const { stdout: beaconCommitOutput } = await execAsync('git rev-parse HEAD', { cwd: sovereignPath });
      const beaconCommit = beaconCommitOutput.trim();

      // 6. Push if we have a remote (using shared Radicle-aware push utility)
      if (hasRemote) {
        const pushSuccess = await pushToRadicle(sovereignPath, 'HEAD:main', remoteName);
        if (pushSuccess) {
          console.log(`[CoherenceBeacon] Pushed beacon commit to ${remoteName}`);
        } else {
          console.warn('[CoherenceBeacon] Push failed - beacon commit created locally (can be pushed later)');
        }
      }

      // 7. Return to original branch and rebase if we detached
      if (needsDetach) {
        await execAsync(`git checkout ${originalBranch}`, { cwd: sovereignPath });
        try {
          // Rebase onto the beacon commit (not remote/main, which may not have updated if push failed)
          await execAsync(`git rebase ${beaconCommit}`, { cwd: sovereignPath });
          console.log('[CoherenceBeacon] Rebased local work on top of beacon');
        } catch {
          // Rebase conflict - abort and warn user
          await execAsync('git rebase --abort', { cwd: sovereignPath });
          console.warn('[CoherenceBeacon] Rebase conflict - user will need to manually rebase');
        }
      }

    } finally {
      // 8. Restore stash if we created one
      if (stashCreated) {
        try {
          await execAsync('git stash pop', { cwd: sovereignPath });
          console.log('[CoherenceBeacon] Restored stashed changes');
        } catch (stashError) {
          console.warn('[CoherenceBeacon] Failed to restore stash:', stashError);
        }
      }
    }
  }

  // ===== Private Helper Methods =====

  private async getRadCommand(): Promise<string> {
    const os = require('os');
    const path = require('path');

    const homeDir = os.homedir();
    const possiblePaths = [
      path.join(homeDir, '.radicle', 'bin', 'rad'),
      '/usr/local/bin/rad',
      'rad'
    ];

    for (const radPath of possiblePaths) {
      if (await fileExists(radPath)) {
        return radPath;
      }
    }
    return 'rad';
  }

  private parseCommitsForBeacons(logOutput: string): CoherenceBeacon[] {
    const beacons: CoherenceBeacon[] = [];
    const BEACON_REGEX = /COHERENCE_BEACON:\s*({.*?})/g;

    for (const commitLine of logOutput.split('\n').filter(line => line.trim())) {
      const [hash, subject, ...bodyParts] = commitLine.split('|');
      const fullMessage = `${subject}\n${bodyParts.join('|')}`;

      const match = BEACON_REGEX.exec(fullMessage);
      if (match) {
        try {
          const beaconData = JSON.parse(match[1]);
          if (beaconData.type === 'supermodule') {
            beacons.push({
              type: beaconData.type,
              radicleId: beaconData.radicleId,
              title: beaconData.title,
              commitHash: hash,
              commitMessage: fullMessage,
              atCommit: beaconData.atCommit // Preserve parent commit reference
            });
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }

    return beacons;
  }

  /**
   * Initialize submodules for a cloned DreamNode.
   * Uses dreamnode/utils/vault-scanner for gitmodules parsing.
   */
  private async initializeSubmodules(clonedNodePath: string): Promise<void> {
    const path = require('path');

    // Use dreamnode utility to parse gitmodules
    const submodules = await readGitmodules(clonedNodePath);

    if (submodules.length === 0) {
      return; // No submodules
    }

    // Clone any missing sovereign copies (Radicle submodules only)
    for (const submodule of submodules) {
      if (!submodule.url.startsWith('rad://')) {
        continue; // Skip non-Radicle submodules
      }

      const radicleId = `rad:${submodule.url.replace('rad://', '')}`;

      // Check if sovereign exists at vault root
      const vaultRootPath = path.join(this.vaultPath, submodule.name);
      const gitPath = path.join(vaultRootPath, '.git');

      if (!(await fileExists(gitPath))) {
        // Clone missing sovereign
        try {
          const uriHandler = getURIHandlerService();
          await uriHandler.cloneFromRadicle(radicleId, false);
          // Recursively handle nested submodules
          await this.initializeSubmodules(path.join(this.vaultPath, submodule.name));
        } catch (cloneError) {
          console.error(`[CoherenceBeacon] Failed to clone submodule ${submodule.name}:`, cloneError);
        }
      }
    }

    // Git-native submodule initialization
    try {
      const os = require('os');
      const homeDir = os.homedir();
      const nodeProcess = (globalThis as any).process;
      const enhancedPath = `${homeDir}/.radicle/bin:/usr/local/bin:/opt/homebrew/bin:${nodeProcess?.env?.PATH || ''}`;

      await execAsync('git submodule update --init --recursive', {
        cwd: clonedNodePath,
        env: {
          ...nodeProcess?.env,
          PATH: enhancedPath,
          GIT_ALLOW_PROTOCOL: 'file:rad'
        }
      });
    } catch {
      // Non-fatal - sovereigns were cloned, submodule links may be stale
    }
  }

  private async getSourcePeerDID(fullPath: string): Promise<string | null> {
    try {
      const { stdout: remotes } = await execAsync('git remote -v', { cwd: fullPath });
      const peerMatch = remotes.match(/rad:\/\/[^\\/]+\/(z6\w+)/);
      if (peerMatch) {
        return `did:key:${peerMatch[1]}`;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Establish peer relationships between cloned nodes and source peer's Dreamer.
   * Uses dreamnode utilities for vault scanning and gitmodules parsing.
   */
  private async establishPeerRelationships(rootNodeName: string, peerDID: string): Promise<void> {
    const path = require('path');

    try {
      // Use dreamnode utility to find Dreamer by DID
      const dreamer = await findDreamerByDID(this.vaultPath, peerDID);

      if (!dreamer) {
        return; // No Dreamer node found for this peer
      }

      // Collect all nodes to relate (root + submodules)
      const nodesToRelate: string[] = [rootNodeName];
      const rootNodePath = path.join(this.vaultPath, rootNodeName);

      // Use dreamnode utility to get submodule names
      const submoduleNames = await getSubmoduleNames(rootNodePath);
      nodesToRelate.push(...submoduleNames);

      // Add relationships using GitDreamNodeService
      for (const nodeName of nodesToRelate) {
        const nodePath = path.join(this.vaultPath, nodeName);
        try {
          const udd = await UDDService.readUDD(nodePath);
          if (udd.uuid) {
            await this.gitDreamNodeService.addRelationship(udd.uuid, dreamer.uuid);
          }
        } catch {
          // Skip nodes without valid UDD
        }
      }
    } catch (error) {
      console.error('[CoherenceBeacon] Error establishing peer relationships:', error);
      // Non-critical - don't fail beacon acceptance
    }
  }
}
