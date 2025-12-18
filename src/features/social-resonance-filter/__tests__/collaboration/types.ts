/**
 * Collaboration Test Types
 *
 * Shared types for the threefold-symmetric collaboration testing scenario.
 */

export type PeerIdentity = 'alice' | 'bob' | 'charlie';

export interface PeerRemote {
  name: string;
  url: string;
}

export interface PeerConfig {
  /** Which peer this instance represents */
  identity: PeerIdentity;
  /** Path to this peer's working repo */
  workingRepoPath: string;
  /** Path to this peer's Dreamer nodes (for collaboration memory) */
  dreamerBasePath: string;
  /** Remote configurations for other peers */
  remotes: Record<PeerIdentity, PeerRemote | undefined>;
}

export interface TestResult {
  success: boolean;
  phase: string;
  assertions: AssertionResult[];
  error?: string;
}

export interface AssertionResult {
  name: string;
  passed: boolean;
  expected?: string;
  actual?: string;
}

export interface CommitRecord {
  hash: string;
  subject: string;
  author: PeerIdentity;
}

/**
 * Harness interface - implemented differently for local vs Radicle testing
 */
export interface CollaborationHarness {
  /** Set up the test environment */
  setup(): Promise<void>;

  /** Get config for a specific peer */
  getPeerConfig(identity: PeerIdentity): PeerConfig;

  /** Clean up after tests */
  teardown(): Promise<void>;

  /** Reset to initial state (for re-running) */
  reset(): Promise<void>;
}
