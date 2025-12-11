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

export interface CoherenceBeacon {
  type: 'supermodule';
  radicleId: string;
  title: string;
  commitHash: string;
  commitMessage: string;
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
      // Fetch from Radicle network
      const radCmd = await this.getRadCommand();
      await execAsync(`"${radCmd}" sync --fetch`, { cwd: fullPath });

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
              commitMessage: commit.subject
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
              commitMessage: fullMessage
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
