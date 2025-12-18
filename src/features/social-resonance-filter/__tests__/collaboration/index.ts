/**
 * Collaboration Testing Module
 *
 * Exports for programmatic use in CI and other test runners.
 */

export * from './types';
export { LocalCollaborationHarness, localHarness, TEST_BASE, PEERS, DREAMNODE_UUID } from './local-harness';
export { runCollaborationScenario, runAllPeersSequentially } from './scenario';
