// Access Node.js modules directly in Electron context
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

import { App } from 'obsidian';
import { RadicleService } from './radicle-service';
import { VaultService } from './vault-service';
import { getURIHandlerService } from './uri-handler-service';

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
      // First verify this is actually a Radicle repository
      // Check if rad remote exists (rad:// URL pattern)
      try {
        const { stdout: remotes } = await execAsync('git remote -v', { cwd: fullPath });
        const hasRadicleRemote = remotes.includes('rad://');

        if (!hasRadicleRemote) {
          console.log(`CoherenceBeaconService: ${dreamNodePath} is not a Radicle repository (no rad:// remotes), skipping`);
          return [];
        }
      } catch (error) {
        console.log(`CoherenceBeaconService: Could not check remotes for ${dreamNodePath}:`, error);
        return [];
      }

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

      // Filter out previously rejected beacons (local tracking)
      const unrejectedBeacons = await this.filterRejectedBeacons(beacons, fullPath);

      console.log(`CoherenceBeaconService: Found ${beacons.length} beacon(s), ${unrejectedBeacons.length} not previously rejected`);
      return unrejectedBeacons;

    } catch (error) {
      console.error(`CoherenceBeaconService: Error checking for beacons:`, error);
      throw error;
    }
  }

  /**
   * Check specific commits (that were just pulled) for coherence beacons
   * This is used after merging updates to detect new supermodule relationships
   */
  async checkCommitsForBeacons(dreamNodePath: string, commits: Array<{ hash: string; subject: string; body: string }>): Promise<CoherenceBeacon[]> {
    const path = require('path');
    const fullPath = path.join(this.vaultPath, dreamNodePath);

    console.log(`CoherenceBeaconService: Checking ${commits.length} pulled commit(s) for beacons...`);

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

            console.log(`CoherenceBeaconService: ✨ Found beacon in commit ${commit.hash.substring(0, 7)}: ${beaconData.title}`);
          }
        } catch (error) {
          console.warn(`CoherenceBeaconService: Failed to parse beacon data:`, error);
        }
      }
    }

    // Filter out previously rejected beacons
    const unrejectedBeacons = await this.filterRejectedBeacons(beacons, fullPath);
    console.log(`CoherenceBeaconService: Found ${beacons.length} beacon(s), ${unrejectedBeacons.length} not previously rejected`);

    return unrejectedBeacons;
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
      // Check if the commit is already applied (look for the beacon metadata in current HEAD)
      const { stdout: currentCommitMsg } = await execAsync('git log -1 --format="%b"', { cwd: fullPath });
      const alreadyApplied = currentCommitMsg.includes(`COHERENCE_BEACON: {"type":"supermodule","radicleId":"${beacon.radicleId}"`);

      if (alreadyApplied) {
        console.log(`CoherenceBeaconService: Beacon already applied to this branch - skipping cherry-pick`);
      } else {
        // Cherry-pick the commit with the beacon
        // Git will automatically handle conflicts if they occur (rare for .udd/.gitmodules changes)
        console.log(`CoherenceBeaconService: Cherry-picking commit ${beacon.commitHash}...`);
        try {
          await execAsync(`git cherry-pick ${beacon.commitHash}`, { cwd: fullPath });
        } catch (cherryPickError: any) {
          // Check if error is "now empty" (commit already applied)
          if (cherryPickError.message && cherryPickError.message.includes('now empty')) {
            console.log(`CoherenceBeaconService: Cherry-pick is empty (changes already applied) - skipping`);
            await execAsync('git cherry-pick --skip', { cwd: fullPath });
          } else {
            console.error(`CoherenceBeaconService: Cherry-pick failed - user may need to resolve conflicts manually`);
            throw cherryPickError;
          }
        }
      }

      // Clone the supermodule using URIHandler's infrastructure
      // This reuses the complete clone workflow: clone → rename → init submodules → scan vault → index → constellation → auto-focus
      console.log(`CoherenceBeaconService: Cloning supermodule ${beacon.title}...`);
      const uriHandler = getURIHandlerService();
      const cloneResult = await uriHandler.cloneFromRadicle(beacon.radicleId, false);

      let clonedNodePath: string | null = null;

      if (cloneResult === 'success') {
        console.log(`CoherenceBeaconService: Successfully accepted beacon and cloned ${beacon.title}`);
        clonedNodePath = path.join(this.vaultPath, beacon.title);
      } else if (cloneResult === 'skipped') {
        console.log(`CoherenceBeaconService: Supermodule ${beacon.title} already existed - beacon accepted`);
        clonedNodePath = path.join(this.vaultPath, beacon.title);
      } else {
        console.error(`CoherenceBeaconService: Failed to clone supermodule ${beacon.title}`);
        return;
      }

      // STEP 2: Initialize and recursively clone submodules
      if (clonedNodePath) {
        await this.initializeAndCloneSubmodules(clonedNodePath, beacon.title);
      }

      // STEP 3: Establish peer relationships for all cloned nodes
      // Find the peer who sent this beacon (the delegate of the source repo we cloned FROM)
      const sourcePeerDID = await this.getSourcePeerDID(fullPath);
      if (sourcePeerDID) {
        await this.establishPeerRelationships(beacon.title, sourcePeerDID);
      }

    } catch (error) {
      console.error(`CoherenceBeaconService: Error accepting beacon:`, error);
      throw error;
    }
  }

  /**
   * Initialize submodules and recursively clone them as sovereign DreamNodes
   *
   * Option A approach: Clone both nested AND sovereign for maximum compatibility
   */
  private async initializeAndCloneSubmodules(clonedNodePath: string, nodeName: string): Promise<void> {
    console.log(`CoherenceBeaconService: Initializing submodules in ${nodeName}...`);

    try {
      // Check if .gitmodules exists
      const path = require('path');
      const fs = require('fs').promises;
      const gitmodulesPath = path.join(clonedNodePath, '.gitmodules');

      try {
        await fs.access(gitmodulesPath);
      } catch {
        console.log(`CoherenceBeaconService: No .gitmodules found in ${nodeName} - no submodules to initialize`);
        return;
      }

      // Parse .gitmodules to find submodule Radicle IDs
      const gitmodulesContent = await fs.readFile(gitmodulesPath, 'utf-8');
      const submodulePattern = /\[submodule "([^"]+)"\]\s+path = ([^\n]+)\s+url = rad:\/\/([^\n]+)/g;
      let match;

      while ((match = submodulePattern.exec(gitmodulesContent)) !== null) {
        const submoduleName = match[1];
        const submodulePath = match[2].trim();
        const radicleId = `rad:${match[3].trim()}`; // Re-add 'rad:' prefix

        console.log(`CoherenceBeaconService: Found submodule: ${submoduleName} (${radicleId})`);

        // STEP 1: Clone as sovereign DreamNode to vault root
        const vaultRootPath = path.join(this.vaultPath, submoduleName);
        try {
          await fs.access(vaultRootPath);
          console.log(`CoherenceBeaconService: ${submoduleName} already exists at vault root - skipping sovereign clone`);
        } catch {
          console.log(`CoherenceBeaconService: Cloning ${submoduleName} as sovereign DreamNode...`);
          const uriHandler = getURIHandlerService();
          await uriHandler.cloneFromRadicle(radicleId, false);

          // Recursively handle ITS submodules
          await this.initializeAndCloneSubmodules(vaultRootPath, submoduleName);
        }

        // STEP 2: Clone into nested submodule path for media file resolution
        const nestedSubmodulePath = path.join(clonedNodePath, submodulePath);

        // Check if it's a valid git repository, not just an empty directory
        let needsClone = true;
        try {
          const gitDir = path.join(nestedSubmodulePath, '.git');
          await fs.access(gitDir);
          console.log(`CoherenceBeaconService: ${submoduleName} already exists in nested path - skipping nested clone`);
          needsClone = false;
        } catch {
          // Either doesn't exist or is an empty directory - need to clone
        }

        if (needsClone) {
          console.log(`CoherenceBeaconService: Cloning ${submoduleName} to nested submodule path...`);

          // Remove empty directory if it exists
          try {
            await fs.rm(nestedSubmodulePath, { recursive: true, force: true });
          } catch {
            // Directory might not exist - that's fine
          }

          // Use rad clone directly into the submodule path
          const { RadicleServiceImpl } = await import('./radicle-service');
          const radicleService = new RadicleServiceImpl(this.app);

          // Clone to parent directory (rad clone will create the submodule directory)
          const parentDir = path.dirname(nestedSubmodulePath);
          const cloneResult = await radicleService.clone(radicleId, parentDir);

          // If rad clone added a UUID suffix to avoid naming conflicts, rename to clean name
          if (cloneResult.repoName !== submoduleName) {
            console.log(`CoherenceBeaconService: Renaming "${cloneResult.repoName}" to "${submoduleName}" for nested submodule`);
            const clonedPath = path.join(parentDir, cloneResult.repoName);
            await fs.rename(clonedPath, nestedSubmodulePath);
          }
        }
      }

    } catch (error) {
      console.error(`CoherenceBeaconService: Error initializing submodules:`, error);
      // Don't throw - submodule initialization is not critical
    }
  }

  /**
   * Get the DID of the peer who owns the source repository
   */
  private async getSourcePeerDID(fullPath: string): Promise<string | null> {
    try {
      // List all remotes to see what we have
      const { stdout: remotes } = await execAsync('git remote -v', { cwd: fullPath });
      console.log(`CoherenceBeaconService: All remotes for ${fullPath}:\n${remotes}`);

      // Extract DID from ANY remote with format: rad://RID/DID
      // Git remotes store short format (z6Mks...), but .udd stores full format (did:key:z6Mks...)
      const peerMatch = remotes.match(/rad:\/\/[^\/]+\/(z6\w+)/);
      if (peerMatch) {
        const shortDID = peerMatch[1];
        const fullDID = `did:key:${shortDID}`;
        console.log(`CoherenceBeaconService: Found source peer DID: ${fullDID}`);
        return fullDID;
      }

      console.warn(`CoherenceBeaconService: No peer DID found in remotes`);
      return null;
    } catch (error) {
      console.warn(`CoherenceBeaconService: Could not determine source peer DID:`, error);
      return null;
    }
  }

  /**
   * Establish liminal web relationships between all cloned nodes and the source peer's Dreamer node
   */
  private async establishPeerRelationships(rootNodeName: string, peerDID: string): Promise<void> {
    console.log(`CoherenceBeaconService: Establishing peer relationships for ${rootNodeName} with ${peerDID}...`);

    try {
      const { UDDService } = await import('./udd-service');
      const path = require('path');

      // Find all DreamNodes at vault root (including the one we just cloned and its submodules)
      const fs = require('fs').promises;
      const vaultEntries = await fs.readdir(this.vaultPath, { withFileTypes: true });

      const dreamNodes: string[] = [];
      for (const entry of vaultEntries) {
        if (entry.isDirectory()) {
          const uddPath = path.join(this.vaultPath, entry.name, '.udd');
          try {
            await fs.access(uddPath);
            dreamNodes.push(entry.name);
          } catch {
            // Not a DreamNode
          }
        }
      }

      // Find the Dreamer node for this peer DID
      let dreamerNodePath: string | null = null;
      for (const nodeName of dreamNodes) {
        const nodePath = path.join(this.vaultPath, nodeName);
        try {
          const udd = await UDDService.readUDD(nodePath);
          if (udd.type === 'dreamer' && udd.radicleId === peerDID) {
            dreamerNodePath = nodePath;
            console.log(`CoherenceBeaconService: Found Dreamer node: ${nodeName}`);
            break;
          }
        } catch {
          continue;
        }
      }

      if (!dreamerNodePath) {
        console.log(`CoherenceBeaconService: No Dreamer node found for peer ${peerDID} - skipping relationship creation`);
        return;
      }

      // Get Dreamer UUID
      const dreamerUDD = await UDDService.readUDD(dreamerNodePath);
      const dreamerUUID = dreamerUDD.uuid;

      if (!dreamerUUID) {
        console.warn(`CoherenceBeaconService: Dreamer node has no UUID`);
        return;
      }

      // Collect all nodes that were cloned (root + all submodules)
      const nodesToRelate: string[] = [rootNodeName];

      // Parse .gitmodules to find all submodules
      const rootNodePath = path.join(this.vaultPath, rootNodeName);
      const gitmodulesPath = path.join(rootNodePath, '.gitmodules');
      try {
        const fs = require('fs').promises;
        await fs.access(gitmodulesPath);
        const gitmodulesContent = await fs.readFile(gitmodulesPath, 'utf-8');
        const submodulePattern = /\[submodule "([^"]+)"\]/g;
        let match;
        while ((match = submodulePattern.exec(gitmodulesContent)) !== null) {
          nodesToRelate.push(match[1]);
        }
      } catch {
        // No .gitmodules - just root node
      }

      // Add relationships for all collected nodes
      for (const nodeName of nodesToRelate) {
        const nodePath = path.join(this.vaultPath, nodeName);
        try {
          const udd = await UDDService.readUDD(nodePath);

          if (!udd.liminalWebRelationships.includes(dreamerUUID)) {
            udd.liminalWebRelationships.push(dreamerUUID);
            await UDDService.writeUDD(nodePath, udd);
            console.log(`CoherenceBeaconService: ✓ Added relationship: ${nodeName} → Dreamer`);
          }
        } catch (error) {
          console.warn(`CoherenceBeaconService: Could not relate ${nodeName} to Dreamer:`, error);
        }
      }

    } catch (error) {
      console.error(`CoherenceBeaconService: Error establishing peer relationships:`, error);
      // Don't throw - relationship creation is not critical
    }
  }

  /**
   * Reject a beacon: record rejection to prevent it from reappearing
   */
  async rejectBeacon(dreamNodePath: string, beacon: CoherenceBeacon): Promise<void> {
    const path = require('path');
    const fullPath = path.join(this.vaultPath, dreamNodePath);

    console.log(`CoherenceBeaconService: Rejecting beacon for ${beacon.title}...`);

    // Record rejection in local git config (per-repository)
    const rejectionFile = path.join(fullPath, '.git', 'interbrain-rejected-beacons.json');

    try {
      const fs = require('fs').promises;

      // Load existing rejections
      let rejections: Record<string, string> = {};
      try {
        const content = await fs.readFile(rejectionFile, 'utf-8');
        rejections = JSON.parse(content);
      } catch {
        // File doesn't exist yet - start fresh
      }

      // Add this rejection with timestamp
      rejections[beacon.commitHash] = new Date().toISOString();

      // Save back to file
      await fs.writeFile(rejectionFile, JSON.stringify(rejections, null, 2), 'utf-8');

      console.log(`CoherenceBeaconService: Recorded rejection for ${beacon.title} (commit ${beacon.commitHash})`);

    } catch (error) {
      console.error(`CoherenceBeaconService: Failed to record rejection (non-critical):`, error);
      // Don't fail the rejection if we can't write the file
    }
  }

  /**
   * Filter out previously rejected beacons
   */
  private async filterRejectedBeacons(beacons: CoherenceBeacon[], dreamNodePath: string): Promise<CoherenceBeacon[]> {
    const path = require('path');
    const rejectionFile = path.join(dreamNodePath, '.git', 'interbrain-rejected-beacons.json');

    try {
      const fs = require('fs').promises;
      const content = await fs.readFile(rejectionFile, 'utf-8');
      const rejections: Record<string, string> = JSON.parse(content);

      // Filter out beacons whose commit hashes are in the rejection list
      const filtered = beacons.filter(beacon => !(beacon.commitHash in rejections));

      if (beacons.length !== filtered.length) {
        console.log(`CoherenceBeaconService: Filtered out ${beacons.length - filtered.length} previously rejected beacon(s)`);
      }

      return filtered;

    } catch {
      // No rejection file or parse error - return all beacons
      return beacons;
    }
  }
}
