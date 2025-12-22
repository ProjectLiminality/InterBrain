#!/usr/bin/env npx tsx
/**
 * Local Collaboration Test Runner
 *
 * Runs the threefold-symmetric collaboration scenario using local bare repos.
 *
 * Usage:
 *   npx tsx src/features/social-resonance-filter/__tests__/collaboration/run-local-test.ts
 *   npx tsx src/features/social-resonance-filter/__tests__/collaboration/run-local-test.ts --reset
 */

import { localHarness } from './local-harness';
import { runAllPeersSequentially } from './scenario';
import { PeerIdentity } from './types';

/* eslint-disable no-undef */

async function main() {
  const args = process.argv.slice(2);
  const resetOnly = args.includes('--reset');

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Threefold Collaboration Test - Local Harness');
  console.log('═══════════════════════════════════════════════════════════════');

  try {
    // Setup or reset
    if (resetOnly) {
      console.log('\nResetting test environment...');
      await localHarness.reset();
      console.log('Reset complete.');
      return;
    }

    console.log('\nSetting up test environment...');
    await localHarness.setup();

    // Run the scenario for all peers
    console.log('\nRunning collaboration scenario...');
    const results = await runAllPeersSequentially(localHarness);

    // Print results
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  Results');
    console.log('═══════════════════════════════════════════════════════════════');

    let allPassed = true;
    const peers: PeerIdentity[] = ['alice', 'bob', 'charlie'];

    for (const peer of peers) {
      const result = results.get(peer);
      if (!result) {
        console.log(`\n[${peer.toUpperCase()}] ❌ No result`);
        allPassed = false;
        continue;
      }

      const passedCount = result.assertions.filter(a => a.passed).length;
      const totalCount = result.assertions.length;
      const status = result.success ? '✅' : '❌';

      console.log(`\n[${peer.toUpperCase()}] ${status} ${passedCount}/${totalCount} assertions passed`);

      if (!result.success) {
        allPassed = false;
        console.log(`  Phase: ${result.phase}`);
        if (result.error) {
          console.log(`  Error: ${result.error}`);
        }

        // Show failed assertions
        for (const assertion of result.assertions) {
          if (!assertion.passed) {
            console.log(`  ❌ ${assertion.name}`);
            if (assertion.expected) console.log(`     Expected: ${assertion.expected}`);
            if (assertion.actual) console.log(`     Actual: ${assertion.actual}`);
          }
        }
      }
    }

    // Summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    if (allPassed) {
      console.log('  ✅ ALL PEERS PASSED');
    } else {
      console.log('  ❌ SOME PEERS FAILED');
    }
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Cleanup option
    if (allPassed) {
      console.log('Test environment preserved at /tmp/interbrain-collab-test/');
      console.log('Run with --reset to clean and reset, or manually inspect.\n');
    }

    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Test runner failed:', error);
    process.exit(1);
  }
}

main();
