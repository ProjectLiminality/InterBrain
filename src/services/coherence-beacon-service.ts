// Access Node.js modules directly in Electron context
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

import { App } from 'obsidian';
import { RadicleService } from './radicle-service';
import { VaultService } from './vault-service';

export interface CoherenceBeacon {
  type: 'supermodule';
  radicleId: string;
  title: string;
  commitHash: string;
  commitMessage: string;
}

export class CoherenceBeaconService {
  private vaultPath: string = '';

  constructor(
    private app: App,
    private vaultService: VaultService,
    private radicleService: RadicleService
  ) {
    this.initializeVaultPath(app);
  }

  private initializeVaultPath(app: App): void {
    const adapter = app.vault.adapter as { path?: string; basePath?: string };

    let vaultPath = '';
    if (typeof adapter.path === 'string') {
      vaultPath = adapter.path;
    } else if (typeof adapter.basePath === 'string') {
      vaultPath = adapter.basePath;
    } else if (adapter.path && typeof adapter.path === 'object') {
      const pathObj = adapter.path as Record<string, string>;
      vaultPath = pathObj.path || pathObj.basePath || '';
    }

    this.vaultPath = vaultPath;
  }

  /**
   * Get the rad command path (from RadicleService or default to 'rad')
   */
  private async getRadCommand(): Promise<string> {
    const os = require('os');
    const path = require('path');

    // Check common locations for rad CLI
    const homeDir = os.homedir();
    const possiblePaths = [
      path.join(homeDir, '.radicle', 'bin', 'rad'),
      '/usr/local/bin/rad',
      'rad' // fallback to PATH
    ];

    const fs = require('fs').promises;
    for (const radPath of possiblePaths) {
      try {
        await fs.access(radPath);
        return radPath;
      } catch {
        continue;
      }
    }

    return 'rad'; // Default to PATH
  }

  /**
   * Check a DreamNode for new commits containing COHERENCE_BEACON metadata
   * This is the main entry point for detecting supermodule updates
   */
  async checkForBeacons(dreamNodePath: string): Promise<CoherenceBeacon[]> {
    const path = require('path');
    const fullPath = path.join(this.vaultPath, dreamNodePath);

    console.log(`CoherenceBeaconService: Checking ${dreamNodePath} for beacons...`);

    try {
      // Fetch latest from Radicle network using rad sync --fetch
      console.log(`CoherenceBeaconService: Fetching from Radicle network...`);
      const radCmd = await this.getRadCommand();
      console.log(`CoherenceBeaconService: Using rad command: ${radCmd}`);

      const { stdout: fetchOutput, stderr: fetchError } = await execAsync(`"${radCmd}" sync --fetch`, { cwd: fullPath });
      console.log(`CoherenceBeaconService: Fetch output:`, fetchOutput);
      if (fetchError) {
        console.log(`CoherenceBeaconService: Fetch stderr:`, fetchError);
      }

      // Get current HEAD commit
      const { stdout: currentHead } = await execAsync('git rev-parse HEAD', { cwd: fullPath });
      const headCommit = currentHead.trim();
      console.log(`CoherenceBeaconService: Current HEAD: ${headCommit}`);

      // List all available remote refs
      const { stdout: refsOutput } = await execAsync('git for-each-ref refs/remotes/', { cwd: fullPath });
      console.log(`CoherenceBeaconService: Available remote refs:\n${refsOutput}`);

      // Get commits from Radicle remotes that we don't have in our branch
      // Radicle uses refs/remotes/rad/* instead of FETCH_HEAD
      // Check all rad/* remote branches for new commits
      let logOutput = '';
      try {
        const { stdout } = await execAsync(
          `git log ${headCommit}..refs/remotes/rad/main --format="%H|%s|%b"`,
          { cwd: fullPath }
        );
        logOutput = stdout;
        console.log(`CoherenceBeaconService: Log output (HEAD..rad/main):\n${logOutput || '(empty)'}`);
      } catch (error) {
        // If rad/main doesn't exist or no new commits, that's okay
        console.log(`CoherenceBeaconService: No new commits in rad/main (this may be expected)`);
        console.log(`CoherenceBeaconService: Error details:`, error);
      }

      if (!logOutput.trim()) {
        console.log(`CoherenceBeaconService: No new commits found - checking if already up to date`);

        // Check if rad/main exists and what commit it's at
        try {
          const { stdout: radMainCommit } = await execAsync('git rev-parse refs/remotes/rad/main', { cwd: fullPath });
          console.log(`CoherenceBeaconService: rad/main commit: ${radMainCommit.trim()}`);
          console.log(`CoherenceBeaconService: Already up to date - no new commits to fetch`);
        } catch {
          console.log(`CoherenceBeaconService: rad/main ref does not exist`);
        }

        return [];
      }

      // Parse commits for COHERENCE_BEACON
      const beacons = this.parseCommitsForBeacons(logOutput);

      console.log(`CoherenceBeaconService: Found ${beacons.length} beacon(s)`);
      return beacons;

    } catch (error) {
      console.error(`CoherenceBeaconService: Error checking for beacons:`, error);
      throw error;
    }
  }

  /**
   * Parse git log output for COHERENCE_BEACON metadata
   */
  private parseCommitsForBeacons(logOutput: string): CoherenceBeacon[] {
    const beacons: CoherenceBeacon[] = [];
    const BEACON_REGEX = /COHERENCE_BEACON:\s*({.*?})/g;

    // Split by commit (each commit starts with hash)
    const commits = logOutput.split('\n').filter(line => line.trim());

    for (const commitLine of commits) {
      const [hash, subject, ...bodyParts] = commitLine.split('|');
      const body = bodyParts.join('|');
      const fullMessage = `${subject}\n${body}`;

      // Look for COHERENCE_BEACON in commit message
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

            console.log(`CoherenceBeaconService: Found beacon for ${beaconData.title} (${beaconData.radicleId})`);
          }
        } catch (parseError) {
          console.warn(`CoherenceBeaconService: Failed to parse beacon JSON:`, parseError);
        }
      }
    }

    return beacons;
  }

  /**
   * Accept a beacon: cherry-pick the commit and clone the supermodule
   */
  async acceptBeacon(dreamNodePath: string, beacon: CoherenceBeacon): Promise<void> {
    const path = require('path');
    const fullPath = path.join(this.vaultPath, dreamNodePath);

    console.log(`CoherenceBeaconService: Accepting beacon for ${beacon.title}...`);

    try {
      // Check for uncommitted changes and stash if needed
      const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: fullPath });
      const hasUncommittedChanges = statusOutput.trim().length > 0;

      if (hasUncommittedChanges) {
        console.log(`CoherenceBeaconService: Uncommitted changes detected, stashing...`);
        await execAsync('git stash push -m "CoherenceBeacon: Temporary stash before accepting beacon"', { cwd: fullPath });
      }

      // Cherry-pick the commit with the beacon
      console.log(`CoherenceBeaconService: Cherry-picking commit ${beacon.commitHash}...`);
      await execAsync(`git cherry-pick ${beacon.commitHash}`, { cwd: fullPath });

      // Restore stashed changes if we stashed them
      if (hasUncommittedChanges) {
        console.log(`CoherenceBeaconService: Restoring stashed changes...`);
        try {
          await execAsync('git stash pop', { cwd: fullPath });
        } catch (error) {
          console.warn(`CoherenceBeaconService: Could not auto-restore stashed changes (may have conflicts):`, error);
          console.log(`CoherenceBeaconService: Changes are saved in stash - use 'git stash pop' manually if needed`);
        }
      }

      // Clone the supermodule repository
      console.log(`CoherenceBeaconService: Cloning supermodule ${beacon.title}...`);
      const destinationPath = path.join(this.vaultPath, beacon.title);

      await this.radicleService.clone(beacon.radicleId, destinationPath);

      console.log(`CoherenceBeaconService: Successfully accepted beacon and cloned ${beacon.title}`);

    } catch (error) {
      console.error(`CoherenceBeaconService: Error accepting beacon:`, error);
      throw error;
    }
  }

  /**
   * Reject a beacon: do nothing (don't cherry-pick the commit)
   */
  async rejectBeacon(dreamNodePath: string, beacon: CoherenceBeacon): Promise<void> {
    console.log(`CoherenceBeaconService: Rejected beacon for ${beacon.title} - no action taken`);
    // Intentionally do nothing - commit stays in FETCH_HEAD, not merged into HEAD
    // User maintains their own perspective without this supermodule relationship
  }
}
