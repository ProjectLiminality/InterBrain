/**
 * Test Scenarios for Collaboration Testing
 *
 * Single source of truth for test data used by:
 * - Obsidian UI test commands (manual testing)
 * - Vitest automated tests
 *
 * Contains one comprehensive scenario that covers all test cases:
 * - Multiple peers (Bob, Charlie)
 * - Unique commits from each peer
 * - Shared/relayed commits (same commit from multiple peers)
 * - Rich commit messages with subject + body
 */

/**
 * A commit in a test scenario
 */
export interface TestCommit {
  /** Who authored this commit originally */
  author: string;
  /** Commit subject line (first line, shown in compact view) */
  subject: string;
  /** Commit body (detailed description, shown when expanded) */
  body?: string;
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
// PEER DEFINITIONS
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
// COMPREHENSIVE TEST SCENARIO
// ============================================

/**
 * Comprehensive test scenario covering all collaboration cases:
 *
 * 1. Bob's unique commit - Only Bob offers this
 * 2. Charlie's unique commit - Only Charlie offers this
 * 3. Alice's shared commit - Both Bob AND Charlie relay this (tests deduplication)
 *
 * This allows testing:
 * - Accept/reject individual commits
 * - Preview mode with file changes
 * - Deduplication UI ("Also from: ...")
 * - Hover coupling between duplicate commits
 * - Rejection history and restore
 */
export const SCENARIO_COMPREHENSIVE: TestScenario = {
  name: 'comprehensive',
  description: 'All-in-one scenario: unique commits + shared/relayed commits for full testing',
  initialReadme: `# Shared Project

Welcome to our collaborative DreamNode!

## Contributors

This section will be updated as people contribute.

## Project Status

Just getting started...
`,
  peers: [PEER_BOB, PEER_CHARLIE],
  commits: [
    // =========================================
    // COMMIT 1: Bob's unique contribution
    // =========================================
    {
      author: 'bob',
      subject: "Add Bob's introduction section",
      body: `This commit adds a personal introduction section for Bob.

The section includes:
- A brief bio
- Bob's interests and expertise
- How to reach Bob for collaboration

This is a unique contribution that only Bob is offering.
You should see this commit ONLY under Bob's peer group.`,
      files: {
        'README.md': `# Shared Project

Welcome to our collaborative DreamNode!

## Contributors

This section will be updated as people contribute.

### Bob

Hi, I'm Bob! I'm passionate about decentralized systems and
knowledge gardening. Feel free to reach out if you want to
collaborate on any distributed tech projects.

**Interests:** P2P networks, Git internals, Obsidian plugins

## Project Status

Just getting started...
`
      },
      relayedBy: ['bob']
    },

    // =========================================
    // COMMIT 2: Charlie's unique contribution
    // =========================================
    {
      author: 'charlie',
      subject: "Add Charlie's introduction section",
      body: `This commit adds a personal introduction section for Charlie.

Charlie's section includes:
- Background information
- Areas of expertise
- Collaboration preferences

This is a unique contribution that only Charlie is offering.
You should see this commit ONLY under Charlie's peer group.`,
      files: {
        'README.md': `# Shared Project

Welcome to our collaborative DreamNode!

## Contributors

This section will be updated as people contribute.

### Charlie

Hey there! I'm Charlie. I focus on UI/UX design and making
complex systems feel intuitive. Always happy to help with
design reviews or brainstorming sessions.

**Expertise:** Design systems, User research, Prototyping

## Project Status

Just getting started...
`
      },
      relayedBy: ['charlie']
    },

    // =========================================
    // COMMIT 3: Alice's commit relayed by BOTH peers
    // =========================================
    {
      author: 'alice',
      subject: "Add project vision statement",
      body: `This commit adds a vision statement for the project.

Alice wrote this vision statement and shared it with the community.
Both Bob and Charlie are relaying this commit to you.

IMPORTANT: This tests DEDUPLICATION!
- You should see this commit appear ONCE in the modal
- It should show "Also from: charlie" (or bob) to indicate both peers have it
- Hovering should highlight the duplicate indicator
- Accepting from one peer should work for both`,
      files: {
        'README.md': `# Shared Project

Welcome to our collaborative DreamNode!

## Vision

> "We believe that knowledge grows best when shared freely
> and organized through genuine human connections rather
> than rigid hierarchies." — Alice

This project explores new ways of collaborative thinking
and distributed knowledge management.

## Contributors

This section will be updated as people contribute.

## Project Status

Just getting started...
`
      },
      relayedBy: ['bob', 'charlie'],
      originalAuthor: 'alice'
    },

    // =========================================
    // COMMIT 4: Bob adds a resources section
    // =========================================
    {
      author: 'bob',
      subject: "Add resources and links section",
      body: `Adding a resources section with helpful links.

This commit creates a new section in the README with:
- Links to related projects
- Documentation references
- Community resources

Another unique Bob contribution to test multiple commits per peer.`,
      files: {
        'README.md': `# Shared Project

Welcome to our collaborative DreamNode!

## Contributors

This section will be updated as people contribute.

### Bob

Hi, I'm Bob! I'm passionate about decentralized systems and
knowledge gardening. Feel free to reach out if you want to
collaborate on any distributed tech projects.

**Interests:** P2P networks, Git internals, Obsidian plugins

## Resources

### Related Projects
- [InterBrain](https://github.com/ProjectLiminality/InterBrain) - Knowledge gardening system
- [Radicle](https://radicle.xyz) - P2P code collaboration

### Documentation
- [Git Internals](https://git-scm.com/book/en/v2/Git-Internals-Plumbing-and-Porcelain)
- [Obsidian Plugin Development](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

## Project Status

Just getting started...
`
      },
      relayedBy: ['bob']
    }
  ]
};

// Default scenario - use the comprehensive one
export const DEFAULT_SCENARIO = SCENARIO_COMPREHENSIVE;

// All scenarios (just one now, but keeping array for compatibility)
export const ALL_SCENARIOS: TestScenario[] = [
  SCENARIO_COMPREHENSIVE
];

/**
 * Get a scenario by name
 */
export function getScenario(name: string): TestScenario | undefined {
  return ALL_SCENARIOS.find(s => s.name === name);
}
