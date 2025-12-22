/**
 * Local Collaboration Harness
 *
 * Sets up a local test environment using bare git repos to simulate
 * peer remotes. This allows testing the full collaboration flow
 * without needing actual Radicle infrastructure.
 *
 * Directory structure created:
 *   /tmp/interbrain-collab-test/
 *   ├── shared-origin/           # Bare repo (initial shared state)
 *   ├── alice/
 *   │   ├── working/             # Alice's working repo
 *   │   ├── bare/                # Alice's "remote" (what others fetch from)
 *   │   └── dreamers/            # Alice's Dreamer nodes
 *   │       ├── bob/             # Alice's view of Bob
 *   │       └── charlie/         # Alice's view of Charlie
 *   ├── bob/
 *   │   ├── working/
 *   │   ├── bare/
 *   │   └── dreamers/
 *   │       ├── alice/
 *   │       └── charlie/
 *   └── charlie/
 *       ├── working/
 *       ├── bare/
 *       └── dreamers/
 *           ├── alice/
 *           └── bob/
 */

import {
  CollaborationHarness,
  PeerConfig,
  PeerIdentity,
  PeerRemote
} from './types';

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

const TEST_BASE = '/tmp/interbrain-collab-test';
const PEERS: PeerIdentity[] = ['alice', 'bob', 'charlie'];
const DREAMNODE_UUID = 'test-shared-dreamnode-uuid';

export class LocalCollaborationHarness implements CollaborationHarness {
  private initialized = false;

  async setup(): Promise<void> {
    if (this.initialized) {
      await this.reset();
      return;
    }

    console.log('[LocalHarness] Setting up test environment...');

    // Clean slate
    try {
      await fs.rm(TEST_BASE, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
    await fs.mkdir(TEST_BASE, { recursive: true });

    // Create shared origin with initial content
    const originPath = path.join(TEST_BASE, 'shared-origin');
    await execAsync(`git init --bare "${originPath}"`);

    // Create a temp repo to make initial commit
    const tempPath = path.join(TEST_BASE, 'temp-init');
    await fs.mkdir(tempPath);
    await execAsync('git init', { cwd: tempPath });
    await execAsync('git config user.email "test@example.com"', { cwd: tempPath });
    await execAsync('git config user.name "Test"', { cwd: tempPath });

    // Create .udd file
    const uddContent = JSON.stringify({
      uuid: DREAMNODE_UUID,
      title: 'Shared DreamNode',
      type: 'dream',
      dreamTalk: '',
      submodules: [],
      supermodules: []
    }, null, 2);
    await fs.writeFile(path.join(tempPath, '.udd'), uddContent);

    // Create README
    await fs.writeFile(
      path.join(tempPath, 'README.md'),
      '# Shared DreamNode\n\nInitial content for collaboration testing.\n'
    );

    await execAsync('git add .', { cwd: tempPath });
    await execAsync('git commit -m "Initial commit: Shared DreamNode"', { cwd: tempPath });
    await execAsync(`git remote add origin "${originPath}"`, { cwd: tempPath });
    await execAsync('git push -u origin main', { cwd: tempPath });

    // Clean up temp
    await fs.rm(tempPath, { recursive: true, force: true });

    // Set up each peer
    for (const peer of PEERS) {
      await this.setupPeer(peer, originPath);
    }

    // Cross-link peers (add each other as remotes)
    for (const peer of PEERS) {
      await this.linkPeerRemotes(peer);
    }

    this.initialized = true;
    console.log('[LocalHarness] Setup complete');
  }

  private async setupPeer(peer: PeerIdentity, originPath: string): Promise<void> {
    const peerBase = path.join(TEST_BASE, peer);
    const workingPath = path.join(peerBase, 'working');
    const barePath = path.join(peerBase, 'bare');
    const dreamersPath = path.join(peerBase, 'dreamers');

    // Clone to working directory
    await execAsync(`git clone "${originPath}" "${workingPath}"`);
    await execAsync(`git config user.email "${peer}@example.com"`, { cwd: workingPath });
    await execAsync(`git config user.name "${peer.charAt(0).toUpperCase() + peer.slice(1)}"`, { cwd: workingPath });

    // Create bare repo (this peer's "remote" for others to fetch from)
    await execAsync(`git clone --bare "${workingPath}" "${barePath}"`);

    // Add bare as a remote called "mine" for easy pushing
    await execAsync(`git remote add mine "${barePath}"`, { cwd: workingPath });

    // Create Dreamer nodes for other peers
    await fs.mkdir(dreamersPath, { recursive: true });

    for (const otherPeer of PEERS) {
      if (otherPeer === peer) continue;

      const dreamerPath = path.join(dreamersPath, otherPeer);
      await fs.mkdir(dreamerPath);
      await execAsync('git init', { cwd: dreamerPath });
      await execAsync(`git config user.email "${peer}@example.com"`, { cwd: dreamerPath });
      await execAsync(`git config user.name "${peer.charAt(0).toUpperCase() + peer.slice(1)}"`, { cwd: dreamerPath });

      // Create .udd for Dreamer
      const dreamerUdd = JSON.stringify({
        uuid: `${otherPeer}-dreamer-uuid`,
        title: otherPeer.charAt(0).toUpperCase() + otherPeer.slice(1),
        type: 'dreamer',
        dreamTalk: '',
        submodules: [],
        supermodules: [],
        did: `did:key:z6Mk${otherPeer}FakeDID`
      }, null, 2);
      await fs.writeFile(path.join(dreamerPath, '.udd'), dreamerUdd);

      await execAsync('git add .', { cwd: dreamerPath });
      await execAsync(`git commit -m "Create Dreamer node for ${otherPeer}"`, { cwd: dreamerPath });
    }
  }

  private async linkPeerRemotes(peer: PeerIdentity): Promise<void> {
    const workingPath = path.join(TEST_BASE, peer, 'working');

    for (const otherPeer of PEERS) {
      if (otherPeer === peer) continue;

      const otherBarePath = path.join(TEST_BASE, otherPeer, 'bare');
      await execAsync(`git remote add ${otherPeer} "${otherBarePath}"`, { cwd: workingPath });
    }
  }

  getPeerConfig(identity: PeerIdentity): PeerConfig {
    const peerBase = path.join(TEST_BASE, identity);

    const remotes: Record<PeerIdentity, PeerRemote | undefined> = {
      alice: undefined,
      bob: undefined,
      charlie: undefined
    };

    for (const otherPeer of PEERS) {
      if (otherPeer === identity) continue;
      remotes[otherPeer] = {
        name: otherPeer,
        url: path.join(TEST_BASE, otherPeer, 'bare')
      };
    }

    return {
      identity,
      workingRepoPath: path.join(peerBase, 'working'),
      dreamerBasePath: path.join(peerBase, 'dreamers'),
      remotes
    };
  }

  async teardown(): Promise<void> {
    console.log('[LocalHarness] Tearing down...');
    try {
      await fs.rm(TEST_BASE, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
    this.initialized = false;
  }

  async reset(): Promise<void> {
    console.log('[LocalHarness] Resetting to initial state...');

    for (const peer of PEERS) {
      const workingPath = path.join(TEST_BASE, peer, 'working');
      const dreamersPath = path.join(TEST_BASE, peer, 'dreamers');

      // Reset working repo to initial commit
      const { stdout: logOutput } = await execAsync(
        'git log --reverse --format="%H" | head -1',
        { cwd: workingPath }
      );
      const initialCommit = logOutput.trim();
      if (initialCommit) {
        await execAsync(`git checkout -f ${initialCommit}`, { cwd: workingPath });
        await execAsync('git branch -f main HEAD', { cwd: workingPath });
        await execAsync('git checkout main', { cwd: workingPath });
      }

      // Reset bare repo
      await execAsync(`git push mine main --force`, { cwd: workingPath });

      // Clear collaboration memory from Dreamer nodes
      for (const otherPeer of PEERS) {
        if (otherPeer === peer) continue;
        const memoryFile = path.join(dreamersPath, otherPeer, 'collaboration-memory.json');
        try {
          await fs.unlink(memoryFile);
        } catch {
          // File might not exist
        }
      }

      // Re-fetch from other peers to get clean refs
      for (const otherPeer of PEERS) {
        if (otherPeer === peer) continue;
        await execAsync(`git fetch ${otherPeer}`, { cwd: workingPath });
      }
    }

    console.log('[LocalHarness] Reset complete');
  }
}

// Export singleton for convenience
export const localHarness = new LocalCollaborationHarness();

// Export constants
export { TEST_BASE, PEERS, DREAMNODE_UUID };
