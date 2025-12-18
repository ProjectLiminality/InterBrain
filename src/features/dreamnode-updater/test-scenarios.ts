/**
 * Test Scenarios for Collaboration Testing
 *
 * Single source of truth for test data used by:
 * - Obsidian UI test commands (manual testing)
 * - Vitest automated tests
 *
 * Each scenario defines the initial state of commits and peers.
 * The testing pathway diverges after setup:
 * - UI tests: User interacts manually
 * - Automated tests: Script runs accept/reject sequences
 */

/**
 * A commit in a test scenario
 */
export interface TestCommit {
  /** Who authored this commit originally */
  author: string;
  /** Commit subject line */
  subject: string;
  /** File changes - key is filename, value is content */
  files: Record<string, string>;
  /** Which peers are offering/relaying this commit */
  relayedBy: string[];
  /** Optional: original author if this is a relay (for provenance chain) */
  originalAuthor?: string;
}

/**
 * A peer in a test scenario
 */
export interface TestPeer {
  /** Peer name (used for git remote name) */
  name: string;
  /** Display name */
  displayName: string;
  /** Fake DID for testing */
  did: string;
  /** UUID for the Dreamer node */
  uuid: string;
}

/**
 * Complete test scenario definition
 */
export interface TestScenario {
  /** Scenario name for identification */
  name: string;
  /** Description of what this scenario tests */
  description: string;
  /** Initial README content for the DreamNode */
  initialReadme: string;
  /** Peers in this scenario */
  peers: TestPeer[];
  /** Commits to create (in order) */
  commits: TestCommit[];
}

// ============================================
// PEER DEFINITIONS (reusable across scenarios)
// ============================================

export const PEER_BOB: TestPeer = {
  name: 'bob',
  displayName: 'Bob',
  did: 'did:key:z6MkTestBobDID12345',
  uuid: 'collab-test-bob-uuid'
};

export const PEER_CHARLIE: TestPeer = {
  name: 'charlie',
  displayName: 'Charlie',
  did: 'did:key:z6MkTestCharlieDID67890',
  uuid: 'collab-test-charlie-uuid'
};

export const PEER_ALICE: TestPeer = {
  name: 'alice',
  displayName: 'Alice',
  did: 'did:key:z6MkTestAliceDID11111',
  uuid: 'collab-test-alice-uuid'
};

// ============================================
// TEST SCENARIOS
// ============================================

/**
 * Basic scenario: Each peer has one unique commit
 * Tests: Basic accept/reject flow, deduplication filtering
 */
export const SCENARIO_BASIC: TestScenario = {
  name: 'basic',
  description: 'Each peer has one unique commit modifying README',
  initialReadme: `# Collaboration Test Node

This is a test DreamNode for collaboration UI testing.

## Contributors

(none yet)
`,
  peers: [PEER_BOB, PEER_CHARLIE],
  commits: [
    {
      author: 'bob',
      subject: "Add Bob's section to README",
      files: {
        'README.md': `# Collaboration Test Node

This is a test DreamNode for collaboration UI testing.

## Contributors

### Bob's Contribution

Hello from Bob! I added this section to demonstrate collaboration.
`
      },
      relayedBy: ['bob']
    },
    {
      author: 'charlie',
      subject: "Add Charlie's section to README",
      files: {
        'README.md': `# Collaboration Test Node

This is a test DreamNode for collaboration UI testing.

## Contributors

### Charlie's Contribution

Greetings from Charlie! This is my addition to the project.
`
      },
      relayedBy: ['charlie']
    }
  ]
};

/**
 * Relay scenario: Alice's commit is relayed by both Bob and Charlie
 * Tests: Duplicate detection, "Also from" UI, provenance tracking
 */
export const SCENARIO_RELAY: TestScenario = {
  name: 'relay',
  description: "Alice's commit relayed by both Bob and Charlie (tests deduplication)",
  initialReadme: `# Collaboration Test Node

This is a test DreamNode for collaboration UI testing.

## History

Project started.
`,
  peers: [PEER_BOB, PEER_CHARLIE],
  commits: [
    {
      author: 'alice',
      subject: "Add Alice's important update",
      files: {
        'README.md': `# Collaboration Test Node

This is a test DreamNode for collaboration UI testing.

## History

Project started.

### Alice's Update

This critical update comes from Alice and should appear only once,
even though both Bob and Charlie are relaying it to you.
`
      },
      relayedBy: ['bob', 'charlie'],
      originalAuthor: 'alice'
    },
    {
      author: 'bob',
      subject: "Bob's own contribution",
      files: {
        'bob-notes.md': '# Bob Notes\n\nSome notes from Bob.\n'
      },
      relayedBy: ['bob']
    }
  ]
};

/**
 * Mixed scenario: Combination of unique and relayed commits
 * Tests: Full UI with mixed commit types
 */
export const SCENARIO_MIXED: TestScenario = {
  name: 'mixed',
  description: 'Mix of unique commits and relayed commits',
  initialReadme: `# Collaboration Test Node

A shared project for testing the collaboration workflow.
`,
  peers: [PEER_BOB, PEER_CHARLIE],
  commits: [
    // Alice's commit relayed by both
    {
      author: 'alice',
      subject: 'Shared foundation from Alice',
      files: {
        'README.md': `# Collaboration Test Node

A shared project for testing the collaboration workflow.

## Foundation

This foundation was laid by Alice and is shared by the community.
`
      },
      relayedBy: ['bob', 'charlie'],
      originalAuthor: 'alice'
    },
    // Bob's unique commit
    {
      author: 'bob',
      subject: "Bob's unique feature",
      files: {
        'bob-feature.md': '# Bob Feature\n\nA feature only Bob is offering.\n'
      },
      relayedBy: ['bob']
    },
    // Charlie's unique commit
    {
      author: 'charlie',
      subject: "Charlie's unique feature",
      files: {
        'charlie-feature.md': '# Charlie Feature\n\nA feature only Charlie is offering.\n'
      },
      relayedBy: ['charlie']
    }
  ]
};

// Default scenario for quick testing
export const DEFAULT_SCENARIO = SCENARIO_BASIC;

// All scenarios for iteration
export const ALL_SCENARIOS: TestScenario[] = [
  SCENARIO_BASIC,
  SCENARIO_RELAY,
  SCENARIO_MIXED
];

/**
 * Get a scenario by name
 */
export function getScenario(name: string): TestScenario | undefined {
  return ALL_SCENARIOS.find(s => s.name === name);
}
