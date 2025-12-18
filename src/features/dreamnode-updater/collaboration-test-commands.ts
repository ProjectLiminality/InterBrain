/**
 * Collaboration Test Commands
 *
 * Commands for testing the cherry-pick collaboration UI end-to-end.
 * These commands set up test conditions in your vault so you can interact
 * with the real UI using real git operations.
 *
 * Test Flow:
 * 1. Run "Setup Collaboration Test" - creates test DreamNode with peer commits
 * 2. Select the test DreamNode
 * 3. Run "Cherry-Pick Preview" - shows CherryPickPreviewModal with real commits
 * 4. Interact with the UI to accept/reject commits
 * 5. Verify the collaboration memory was updated correctly
 */

import { Plugin, Notice } from 'obsidian';
import { UIService } from '../../core/services/ui-service';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import {
  CherryPickPreviewModal,
  type CherryPickPreviewConfig
} from './ui/cherry-pick-preview-modal';
import { getCherryPickWorkflowService } from './services/cherry-pick-workflow-service';
import {
  showPreviewBanner,
  hidePreviewBanner,
  initializePreviewBanner
} from './ui/preview-banner';
import { RejectionHistoryModal } from './ui/rejection-history-modal';
import {
  DEFAULT_SCENARIO,
  ALL_SCENARIOS,
  type TestScenario,
  PEER_BOB,
  PEER_CHARLIE
} from './test-scenarios';

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

// Test constants - following real InterBrain ontology
const TEST_NODE_PATH = '_collab-test-node';
const TEST_NODE_UUID = 'collab-test-dream-uuid';
const TEST_NODE_NAME = 'Collaboration Test Node';

// Dreamer paths derived from scenario peers
const BOB_DREAMER_PATH = '_collab-test-bob';
const CHARLIE_DREAMER_PATH = '_collab-test-charlie';

// Hidden folder for peer bare repos (simulating Radicle storage)
const PEER_REPOS_PATH = '.collab-test-peer-repos';

// Current active scenario (can be changed via command)
let activeScenario: TestScenario = DEFAULT_SCENARIO;

/**
 * Helper: Setup test environment from a scenario
 */
async function setupTestEnvironment(
  plugin: Plugin,
  uiService: UIService,
  scenario: TestScenario
): Promise<void> {
  const adapter = (plugin.app.vault.adapter as any);
  const vaultPath = adapter.basePath || '';
  const testNodePath = path.join(vaultPath, TEST_NODE_PATH);
  const bobDreamerPath = path.join(vaultPath, BOB_DREAMER_PATH);
  const charlieDreamerPath = path.join(vaultPath, CHARLIE_DREAMER_PATH);
  const peerReposPath = path.join(vaultPath, PEER_REPOS_PATH);

  const notice = uiService.showLoading(`Setting up scenario: ${scenario.name}...`);

  try {
    // Clean up any existing test environment
    for (const pathToRemove of [testNodePath, bobDreamerPath, charlieDreamerPath, peerReposPath]) {
      try {
        await fs.rm(pathToRemove, { recursive: true, force: true });
      } catch {
        // Directory might not exist
      }
    }

    // ========================================
    // Step 1: Create the DreamNode (shared project)
    // ========================================
    await fs.mkdir(testNodePath, { recursive: true });
    await execAsync('git init', { cwd: testNodePath });
    await execAsync('git config user.email "alice@test.local"', { cwd: testNodePath });
    await execAsync('git config user.name "Alice"', { cwd: testNodePath });

    const dreamUdd = JSON.stringify({
      uuid: TEST_NODE_UUID,
      title: TEST_NODE_NAME,
      type: 'dream',
      dreamTalk: '',
      submodules: [],
      supermodules: []
    }, null, 2);
    await fs.writeFile(path.join(testNodePath, '.udd'), dreamUdd);

    // Use scenario's initial README
    await fs.writeFile(path.join(testNodePath, 'README.md'), scenario.initialReadme);

    await execAsync('git add .', { cwd: testNodePath });
    await execAsync('git commit -m "Initial commit: Test DreamNode"', { cwd: testNodePath });

    // ========================================
    // Step 2: Create peer bare repos and commits from scenario
    // ========================================
    await fs.mkdir(peerReposPath, { recursive: true });

    // Create bare repos for each peer
    const peerWorkPaths: Record<string, string> = {};
    const peerBarePaths: Record<string, string> = {};

    for (const peer of scenario.peers) {
      const barePath = path.join(peerReposPath, `${peer.name}-fork.git`);
      const workPath = path.join(peerReposPath, `${peer.name}-work`);

      await execAsync(`git clone --bare "${testNodePath}" "${barePath}"`);
      await execAsync(`git clone "${barePath}" "${workPath}"`);
      await execAsync(`git config user.email "${peer.name}@test.local"`, { cwd: workPath });
      await execAsync(`git config user.name "${peer.displayName}"`, { cwd: workPath });

      peerBarePaths[peer.name] = barePath;
      peerWorkPaths[peer.name] = workPath;
    }

    // Create commits from scenario
    // For relayed commits, we simulate the relay chain
    for (const commit of scenario.commits) {
      for (const relayPeerName of commit.relayedBy) {
        const workPath = peerWorkPaths[relayPeerName];
        if (!workPath) continue;

        // Write all files for this commit
        for (const [filename, content] of Object.entries(commit.files)) {
          await fs.writeFile(path.join(workPath, filename), content);
        }

        await execAsync('git add .', { cwd: workPath });

        // If this is a relayed commit (originalAuthor differs from relay peer),
        // simulate cherry-pick by adding the provenance marker
        if (commit.originalAuthor && commit.originalAuthor !== relayPeerName) {
          // First, create the "original" commit message with provenance
          // In real scenario, this would come from cherry-pick -x
          const fakeOriginalHash = `abc${commit.author}${Date.now().toString(16)}`.slice(0, 12);
          const commitMsg = `${commit.subject}\n\n(cherry picked from commit ${fakeOriginalHash})`;
          await execAsync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { cwd: workPath });
        } else {
          await execAsync(`git commit -m "${commit.subject}"`, { cwd: workPath });
        }

        await execAsync('git push origin main', { cwd: workPath });
      }
    }

    // Add peer remotes to the DreamNode
    for (const peer of scenario.peers) {
      const barePath = peerBarePaths[peer.name];
      await execAsync(`git remote add ${peer.name} "${barePath}"`, { cwd: testNodePath });
      await execAsync(`git fetch ${peer.name}`, { cwd: testNodePath });
    }

    // ========================================
    // Step 3: Create Dreamer nodes
    // ========================================
    for (const peer of scenario.peers) {
      const dreamerPath = path.join(vaultPath, `_collab-test-${peer.name}`);
      await fs.mkdir(dreamerPath, { recursive: true });
      await execAsync('git init', { cwd: dreamerPath });
      await execAsync('git config user.email "alice@test.local"', { cwd: dreamerPath });
      await execAsync('git config user.name "Alice"', { cwd: dreamerPath });

      const dreamerUdd = JSON.stringify({
        uuid: peer.uuid,
        title: peer.displayName,
        type: 'dreamer',
        dreamTalk: '',
        submodules: [],
        supermodules: [],
        did: peer.did
      }, null, 2);
      await fs.writeFile(path.join(dreamerPath, '.udd'), dreamerUdd);

      const liminalWeb = JSON.stringify({
        relationships: [TEST_NODE_UUID]
      }, null, 2);
      await fs.writeFile(path.join(dreamerPath, 'liminal-web.json'), liminalWeb);

      await execAsync('git add .', { cwd: dreamerPath });
      await execAsync(`git commit -m "Create ${peer.displayName}'s Dreamer node"`, { cwd: dreamerPath });
    }

    notice.hide();

    // Trigger vault rescan
    const { serviceManager } = await import('../../core/services/service-manager');
    await serviceManager.scanVault();

    // Build commit summary
    const commitSummary = scenario.commits
      .map(c => `  - ${c.subject} (from ${c.relayedBy.join(', ')})`)
      .join('\n');

    uiService.showSuccess(
      `Scenario "${scenario.name}" ready!\n\n` +
      `${scenario.description}\n\n` +
      `Created:\n` +
      `  📦 ${TEST_NODE_NAME} (DreamNode)\n` +
      scenario.peers.map(p => `  👤 ${p.displayName} (Dreamer)`).join('\n') + `\n\n` +
      `Commits:\n${commitSummary}\n\n` +
      `Select the test node and run "Cherry-Pick Preview"`
    );

  } catch (error: any) {
    notice.hide();
    console.error('[CollabTest] Setup failed:', error);
    uiService.showError(`Setup failed: ${error.message}`);
  }
}

export function registerCollaborationTestCommands(plugin: Plugin, uiService: UIService): void {
  // Initialize preview banner
  initializePreviewBanner(plugin.app);

  /**
   * Setup Collaboration Test
   *
   * Creates a proper InterBrain test environment from the active scenario.
   * Uses test-scenarios.ts as the single source of truth for test data.
   */
  plugin.addCommand({
    id: 'setup-collaboration-test',
    name: 'Setup Collaboration Test',
    callback: async () => {
      await setupTestEnvironment(plugin, uiService, activeScenario);
    }
  });

  /**
   * Switch Test Scenario
   *
   * Allows switching between different test scenarios (basic, relay, mixed).
   */
  plugin.addCommand({
    id: 'switch-test-scenario',
    name: 'Switch Test Scenario',
    callback: async () => {
      // Simple rotation through scenarios
      const currentIndex = ALL_SCENARIOS.findIndex(s => s.name === activeScenario.name);
      const nextIndex = (currentIndex + 1) % ALL_SCENARIOS.length;
      activeScenario = ALL_SCENARIOS[nextIndex];

      uiService.showSuccess(
        `Switched to scenario: ${activeScenario.name}\n\n` +
        `${activeScenario.description}\n\n` +
        `Run "Setup Collaboration Test" to apply.`
      );
    }
  });

  /**
   * Cherry-Pick Preview
   *
   * Shows the CherryPickPreviewModal for the selected DreamNode.
   * This is the new collaboration-focused update UI.
   */
  plugin.addCommand({
    id: 'cherry-pick-preview',
    name: 'Cherry-Pick Preview (Collaboration)',
    callback: async () => {
      const store = useInterBrainStore.getState();
      const selectedNode = store.selectedNode;

      if (!selectedNode) {
        uiService.showError('Please select a DreamNode first');
        return;
      }

      const adapter = (plugin.app.vault.adapter as any);
      const vaultPath = adapter.basePath || '';
      const fullPath = path.join(vaultPath, selectedNode.repoPath);

      const notice = uiService.showLoading('Fetching peer commits...');

      try {
        // Get list of remotes (potential peers)
        const { stdout: remotesOutput } = await execAsync('git remote', { cwd: fullPath });
        const remotes = remotesOutput.trim().split('\n').filter((r: string) => r && r !== 'origin');

        if (remotes.length === 0) {
          notice.hide();
          uiService.showInfo('No peer remotes found. Add remotes to collaborate.');
          return;
        }

        // Fetch from all remotes
        for (const remote of remotes) {
          try {
            await execAsync(`git fetch ${remote}`, { cwd: fullPath });
          } catch {
            console.warn(`[CherryPick] Failed to fetch from ${remote}`);
          }
        }

        // Build peer list for workflow service
        // Map remote names to Dreamer node paths
        const peerPathMap: Record<string, string> = {
          'bob': BOB_DREAMER_PATH,
          'charlie': CHARLIE_DREAMER_PATH
        };
        const peerUuidMap: Record<string, string> = {
          'bob': PEER_BOB.uuid,
          'charlie': PEER_CHARLIE.uuid
        };

        const peers = remotes.map((remote: string) => ({
          uuid: peerUuidMap[remote] || `${remote}-uuid`,
          name: remote,
          repoPath: peerPathMap[remote] || `_collab-test-${remote}`
        }));

        // Use workflow service to get pending commits (filters accepted/rejected)
        const workflowService = getCherryPickWorkflowService();
        const peerGroups = await workflowService.getPendingCommits(
          selectedNode.repoPath,
          selectedNode.id,
          peers
        );

        notice.hide();

        if (peerGroups.length === 0 || peerGroups.every(g => g.commits.length === 0)) {
          uiService.showInfo('No pending commits from peers.');
          return;
        }

        // Show the modal
        const config: CherryPickPreviewConfig = {
          dreamNodePath: selectedNode.repoPath,
          dreamNodeUuid: selectedNode.id,
          dreamNodeName: selectedNode.name,
          peerGroups,
          onAccept: async (commits, peerRepoPath) => {
            new Notice(`Accepted ${commits.length} commit(s) from ${peerRepoPath}`);
            console.log('[CherryPick] Accepted:', commits);
          },
          onReject: async (commits, peerRepoPath) => {
            new Notice(`Rejected ${commits.length} commit(s) from ${peerRepoPath}`);
            console.log('[CherryPick] Rejected:', commits);
          },
          onCancel: () => {
            console.log('[CherryPick] Cancelled');
          }
        };

        const modal = new CherryPickPreviewModal(plugin.app, config);
        modal.open();

      } catch (error: any) {
        notice.hide();
        console.error('[CherryPick] Preview failed:', error);
        uiService.showError(`Preview failed: ${error.message}`);
      }
    }
  });

  /**
   * Show Preview Banner (Demo)
   *
   * Demonstrates the floating preview banner UI.
   */
  plugin.addCommand({
    id: 'show-preview-banner-demo',
    name: 'Show Preview Banner (Demo)',
    callback: async () => {
      // First, check if there's actually a preview active
      const workflowService = getCherryPickWorkflowService();

      if (!workflowService.isPreviewActive()) {
        // Create a fake preview state for demo purposes
        uiService.showInfo('No active preview. Starting demo banner...');

        // Show demo banner
        showPreviewBanner({
          onAccept: async () => {
            new Notice('Demo: Accept clicked');
          },
          onReject: async () => {
            new Notice('Demo: Reject clicked');
          },
          onCancel: async () => {
            new Notice('Demo: Cancel clicked');
          }
        });

        // The banner won't show because there's no preview state
        // This is expected - in real use, you'd start a preview first
        return;
      }

      // Show real banner for active preview
      showPreviewBanner({
        onAccept: async () => {
          const result = await workflowService.acceptPreview('_collab-test-dreamers/bob');
          new Notice(result.message);
        },
        onReject: async () => {
          const result = await workflowService.rejectPreview('_collab-test-dreamers/bob');
          new Notice(result.message);
        },
        onCancel: async () => {
          const result = await workflowService.cancelPreview();
          new Notice(result.message);
        }
      });
    }
  });

  /**
   * Hide Preview Banner
   */
  plugin.addCommand({
    id: 'hide-preview-banner',
    name: 'Hide Preview Banner',
    callback: () => {
      hidePreviewBanner();
    }
  });

  /**
   * Show Rejection History
   *
   * Opens the RejectionHistoryModal for the selected DreamNode.
   */
  plugin.addCommand({
    id: 'show-rejection-history',
    name: 'Show Rejection History',
    callback: async () => {
      const store = useInterBrainStore.getState();
      const selectedNode = store.selectedNode;

      if (!selectedNode) {
        uiService.showError('Please select a DreamNode first');
        return;
      }

      // For testing, use the test peers (proper Dreamer nodes)
      const peers = [
        { name: 'Bob', repoPath: BOB_DREAMER_PATH },
        { name: 'Charlie', repoPath: CHARLIE_DREAMER_PATH }
      ];

      const modal = new RejectionHistoryModal(plugin.app, {
        dreamNodePath: selectedNode.repoPath,
        dreamNodeUuid: selectedNode.id,
        dreamNodeName: selectedNode.name,
        peers,
        onUnreject: (peerRepoPath, hashes) => {
          new Notice(`Unrejected ${hashes.length} commit(s) from ${peerRepoPath}`);
        }
      });

      modal.open();
    }
  });

  /**
   * Reset Collaboration Test
   *
   * Resets git history and collaboration memory without deleting repos.
   * Much faster for iterating on tests.
   */
  plugin.addCommand({
    id: 'reset-collaboration-test',
    name: 'Reset Collaboration Test',
    callback: async () => {
      const adapter = (plugin.app.vault.adapter as any);
      const vaultPath = adapter.basePath || '';
      const testNodePath = path.join(vaultPath, TEST_NODE_PATH);
      const bobDreamerPath = path.join(vaultPath, BOB_DREAMER_PATH);
      const charlieDreamerPath = path.join(vaultPath, CHARLIE_DREAMER_PATH);

      const notice = uiService.showLoading('Resetting test state...');

      try {
        // Reset test node to initial commit (before any cherry-picks)
        await execAsync('git checkout main', { cwd: testNodePath });
        const { stdout: logOutput } = await execAsync('git log --oneline --reverse', { cwd: testNodePath });
        const firstCommit = logOutput.trim().split('\n')[0]?.split(' ')[0];
        if (firstCommit) {
          await execAsync(`git reset --hard ${firstCommit}`, { cwd: testNodePath });
        }

        // Remove bob-contribution.md and charlie-contribution.md if they exist
        try {
          await fs.rm(path.join(testNodePath, 'bob-contribution.md'));
        } catch { /* doesn't exist */ }
        try {
          await fs.rm(path.join(testNodePath, 'charlie-contribution.md'));
        } catch { /* doesn't exist */ }

        // Clear collaboration memory from both Dreamer nodes
        try {
          await fs.rm(path.join(bobDreamerPath, 'collaboration-memory.json'));
        } catch { /* doesn't exist */ }
        try {
          await fs.rm(path.join(charlieDreamerPath, 'collaboration-memory.json'));
        } catch { /* doesn't exist */ }

        // Re-fetch from peers to ensure we see their commits again
        await execAsync('git fetch bob', { cwd: testNodePath });
        await execAsync('git fetch charlie', { cwd: testNodePath });

        notice.hide();
        uiService.showSuccess('Test state reset! Bob and Charlie commits are pending again.');

      } catch (error: any) {
        notice.hide();
        console.error('[CollabTest] Reset failed:', error);
        uiService.showError(`Reset failed: ${error.message}`);
      }
    }
  });

  /**
   * Cleanup Collaboration Test
   *
   * Removes the test environment created by Setup Collaboration Test.
   */
  plugin.addCommand({
    id: 'cleanup-collaboration-test',
    name: 'Cleanup Collaboration Test',
    callback: async () => {
      const adapter = (plugin.app.vault.adapter as any);
      const vaultPath = adapter.basePath || '';

      const confirmed = await uiService.showConfirmDialog(
        'Cleanup Test Environment',
        'This will remove:\n' +
        `  - ${TEST_NODE_PATH}/ (DreamNode)\n` +
        `  - ${BOB_DREAMER_PATH}/ (Bob's Dreamer)\n` +
        `  - ${CHARLIE_DREAMER_PATH}/ (Charlie's Dreamer)\n` +
        `  - ${PEER_REPOS_PATH}/ (peer repos)\n\n` +
        'Continue?',
        'Cleanup',
        'Cancel'
      );

      if (!confirmed) return;

      const notice = uiService.showLoading('Cleaning up...');

      try {
        await fs.rm(path.join(vaultPath, TEST_NODE_PATH), { recursive: true, force: true });
        await fs.rm(path.join(vaultPath, BOB_DREAMER_PATH), { recursive: true, force: true });
        await fs.rm(path.join(vaultPath, CHARLIE_DREAMER_PATH), { recursive: true, force: true });
        await fs.rm(path.join(vaultPath, PEER_REPOS_PATH), { recursive: true, force: true });

        notice.hide();

        // Trigger vault rescan
        const { serviceManager } = await import('../../core/services/service-manager');
        await serviceManager.scanVault();

        uiService.showSuccess('Test environment cleaned up');
      } catch (error: any) {
        notice.hide();
        uiService.showError(`Cleanup failed: ${error.message}`);
      }
    }
  });
}
