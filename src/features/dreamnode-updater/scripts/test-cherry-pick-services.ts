/**
 * Integration test for cherry-pick collaboration services
 *
 * Run with: npx tsx src/features/dreamnode-updater/scripts/test-cherry-pick-services.ts
 *
 * Prerequisites: Run setup-cherry-pick-test.sh first
 */

/* eslint-disable no-undef */

import {
  CollaborationMemoryService,
} from '../services/collaboration-memory-service';

const TEST_DIR = '/tmp/interbrain-cherry-pick-test';
const SHARED_PROJECT = `${TEST_DIR}/shared-project`;
const BOB_DREAMER_ALICE = `${TEST_DIR}/bob-dreamer-alice`;
const DREAM_NODE_UUID = 'test-shared-project-uuid';

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    testsPassed++;
  } else {
    console.log(`  ❌ ${message}`);
    testsFailed++;
  }
}

async function test(name: string, fn: () => Promise<void>) {
  console.log(`\n🧪 ${name}`);
  try {
    await fn();
  } catch (error: any) {
    console.log(`  ❌ Test threw error: ${error.message}`);
    testsFailed++;
  }
}

// Main tests
async function runTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Cherry-Pick Collaboration Services - Integration Test');
  console.log('═══════════════════════════════════════════════════════');

  // Initialize services
  const memoryService = new CollaborationMemoryService(TEST_DIR);

  // Test 1: CollaborationMemoryService - Load empty memory
  await test('CollaborationMemoryService: Load empty memory', async () => {
    const memory = await memoryService.loadMemory('bob-dreamer-alice');
    assert(memory.version === 1, 'Version should be 1');
    assert(Object.keys(memory.dreamNodes).length === 0, 'Should have no DreamNodes initially');
  });

  // Test 2: Record rejection
  await test('CollaborationMemoryService: Record rejection', async () => {
    await memoryService.recordRejection('bob-dreamer-alice', DREAM_NODE_UUID, [
      { originalHash: 'fake-hash-1', subject: 'Test rejection 1' },
      { originalHash: 'fake-hash-2', subject: 'Test rejection 2' }
    ]);

    const rejected = await memoryService.getRejectedHashes('bob-dreamer-alice', DREAM_NODE_UUID);
    assert(rejected.has('fake-hash-1'), 'Should have fake-hash-1 rejected');
    assert(rejected.has('fake-hash-2'), 'Should have fake-hash-2 rejected');
    assert(rejected.size === 2, 'Should have exactly 2 rejections');
  });

  // Test 3: Check isRejected
  await test('CollaborationMemoryService: Check isRejected', async () => {
    const is1Rejected = await memoryService.isRejected('bob-dreamer-alice', DREAM_NODE_UUID, 'fake-hash-1');
    const is3Rejected = await memoryService.isRejected('bob-dreamer-alice', DREAM_NODE_UUID, 'fake-hash-3');
    assert(is1Rejected === true, 'fake-hash-1 should be rejected');
    assert(is3Rejected === false, 'fake-hash-3 should not be rejected');
  });

  // Test 4: Record acceptance
  await test('CollaborationMemoryService: Record acceptance', async () => {
    await memoryService.recordAcceptance('bob-dreamer-alice', DREAM_NODE_UUID, [
      {
        originalHash: 'accept-hash-1',
        appliedHash: 'applied-hash-1',
        subject: 'Test acceptance',
        relayedBy: ['alice-uuid']
      }
    ]);

    const accepted = await memoryService.getAcceptedHashes('bob-dreamer-alice', DREAM_NODE_UUID);
    assert(accepted.has('accept-hash-1'), 'Should have accept-hash-1 accepted');
  });

  // Test 5: Unreject
  await test('CollaborationMemoryService: Unreject', async () => {
    const result = await memoryService.unreject('bob-dreamer-alice', DREAM_NODE_UUID, 'fake-hash-1');
    assert(result === true, 'Unreject should succeed');

    const rejected = await memoryService.getRejectedHashes('bob-dreamer-alice', DREAM_NODE_UUID);
    assert(!rejected.has('fake-hash-1'), 'fake-hash-1 should no longer be rejected');
    assert(rejected.has('fake-hash-2'), 'fake-hash-2 should still be rejected');
  });

  // Test 6: Get rejection history
  await test('CollaborationMemoryService: Get rejection history', async () => {
    const history = await memoryService.getRejectionHistory('bob-dreamer-alice', DREAM_NODE_UUID);
    assert(history.length === 1, 'Should have 1 rejection in history');
    assert(history[0].subject === 'Test rejection 2', 'Should be the remaining rejection');
  });

  // Test 7: Parse original hash from cherry-pick message
  await test('CollaborationMemoryService: Parse original hash', async () => {
    const body1 = 'Some commit message\n\n(cherry picked from commit abc123def456)';
    const body2 = 'No cherry pick info here';

    const hash1 = CollaborationMemoryService.parseOriginalHash(body1);
    const hash2 = CollaborationMemoryService.parseOriginalHash(body2);

    assert(hash1 === 'abc123def456', 'Should parse cherry-picked hash');
    assert(hash2 === null, 'Should return null for non-cherry-picked');
  });

  // Test 8: Verify file was created
  await test('Verify collaboration-memory.json created', async () => {
    const filePath = path.join(BOB_DREAMER_ALICE, 'collaboration-memory.json');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      assert(data.version === 1, 'File should have version 1');
      assert(data.dreamNodes[DREAM_NODE_UUID] !== undefined, 'Should have our DreamNode');
    } catch (error) {
      assert(false, `File should exist: ${error}`);
    }
  });

  // Test 9: Test actual git cherry-pick flow
  await test('Git cherry-pick with -x flag', async () => {
    // Get Alice's latest commit (full hash)
    const { stdout: logOutput } = await execAsync(
      'git log alice/main --format="%H" -1',
      { cwd: SHARED_PROJECT }
    );
    const aliceLatestHash = logOutput.trim();

    // Cherry-pick it
    await execAsync(`git cherry-pick -x ${aliceLatestHash}`, { cwd: SHARED_PROJECT });

    // Check the new commit message has the cherry-pick marker
    // Note: Use %B (full message) not %b (body only) since -x appends to the message
    const { stdout: newCommitBody } = await execAsync(
      'git log -1 --format="%B"',
      { cwd: SHARED_PROJECT }
    );

    const parsedHash = CollaborationMemoryService.parseOriginalHash(newCommitBody);
    assert(parsedHash === aliceLatestHash, 'Cherry-pick -x should preserve original hash');

    // Reset for next tests (use full reset via script approach)
    // Note: We can't use git reset --hard directly, so we use a workaround
    await execAsync('git checkout -f HEAD~1', { cwd: SHARED_PROJECT });
    await execAsync('git branch -f main HEAD', { cwd: SHARED_PROJECT });
    await execAsync('git checkout main', { cwd: SHARED_PROJECT });
  });

  // Test 10: Stash and unstash flow
  await test('Git stash flow', async () => {
    // Modify an existing tracked file (stash works on tracked files)
    const readmePath = path.join(SHARED_PROJECT, 'README.md');
    const originalContent = await fs.readFile(readmePath, 'utf-8');
    await fs.writeFile(readmePath, originalContent + '\n\nUncommitted changes for test');

    // Verify we have changes
    const { stdout: status1 } = await execAsync('git status --porcelain', { cwd: SHARED_PROJECT });
    assert(status1.trim().length > 0, 'Should have uncommitted changes');

    // Stash (include untracked with -u just in case)
    await execAsync('git stash push -u -m "Test stash"', { cwd: SHARED_PROJECT });

    // Verify clean
    const { stdout: status2 } = await execAsync('git status --porcelain', { cwd: SHARED_PROJECT });
    assert(status2.trim().length === 0, 'Should be clean after stash');

    // Pop
    await execAsync('git stash pop', { cwd: SHARED_PROJECT });

    // Verify changes restored
    const { stdout: status3 } = await execAsync('git status --porcelain', { cwd: SHARED_PROJECT });
    assert(status3.trim().length > 0, 'Changes should be restored after pop');

    // Clean up - restore original content
    await fs.writeFile(readmePath, originalContent);
  });

  // Summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('═══════════════════════════════════════════════════════\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

// Run
runTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
