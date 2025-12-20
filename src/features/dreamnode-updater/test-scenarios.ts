/**
 * Test Scenarios for Collaboration Testing
 *
 * Single source of truth for test data used by:
 * - Obsidian UI test commands (manual testing)
 * - Vitest automated tests
 *
 * IMPORTANT: The test setup creates SEPARATE working directories for each peer.
 * Each peer's commits are applied sequentially to their OWN repo, then pushed.
 * This means commits from the same peer MUST form a linear chain.
 *
 * The scenario below is designed so:
 * - Bob has 2 commits that build on each other (add section, then add file)
 * - Charlie has 1 commit (add his section)
 * - Alice's commit is relayed by BOTH Bob and Charlie (tests deduplication)
 *
 * When David (test perspective) tries to accept commits from multiple peers
 * that touch the same file (Bob's section + Charlie's section), a conflict
 * will occur - this is intentional and tests our conflict resolution!
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
 * The initial README that all peers start from.
 * Has clear sections with marker lines for conflict testing.
 */
const INITIAL_README = `# Shared Project

Welcome to our collaborative DreamNode!

## Vision

This section describes our shared vision.

## Contributors

This section will be updated as people contribute.

## Resources

Links and resources will be added here.

## Status

Just getting started...
`;

/**
 * Comprehensive test scenario covering all collaboration cases.
 *
 * Timeline:
 * 1. Alice creates the project (initial commit - done in setup)
 * 2. Bob adds his intro to Contributors section
 * 3. Bob adds a RESOURCES.md file (separate file, no conflict)
 * 4. Charlie adds his intro to Contributors section (WILL CONFLICT with Bob's)
 * 5. Alice's vision update is relayed by BOTH Bob and Charlie (tests deduplication)
 *
 * Test Cases Covered:
 * - Accept single commit (no conflict) ✓
 * - Accept commits from same peer (sequential, no conflict) ✓
 * - Accept commits from different peers touching different files (no conflict) ✓
 * - Accept commits from different peers touching SAME file (CONFLICT!) ✓
 * - Deduplication of relayed commits (same originalHash from multiple peers) ✓
 * - Preview mode and banner workflow ✓
 * - Rejection history and restore ✓
 */
export const SCENARIO_COMPREHENSIVE: TestScenario = {
  name: 'comprehensive',
  description: 'Tests: sequential commits, separate files, same-file conflicts, and deduplication',
  initialReadme: INITIAL_README,
  peers: [PEER_BOB, PEER_CHARLIE],
  commits: [
    // =========================================
    // COMMIT 1: Bob adds his intro (README edit)
    // =========================================
    // This is Bob's first commit, starts from INITIAL_README
    {
      author: 'bob',
      subject: "Add Bob's contributor introduction",
      body: `Adding my introduction to the Contributors section.

This is Bob's first contribution to the project.
It modifies the README by adding a subsection under Contributors.

TESTING: This commit alone should apply cleanly.
TESTING: If Charlie's intro is applied first, this will conflict.`,
      files: {
        'README.md': `# Shared Project

Welcome to our collaborative DreamNode!

## Vision

This section describes our shared vision.

## Contributors

This section will be updated as people contribute.

### Bob

Hi, I'm Bob! I'm passionate about decentralized systems and
knowledge gardening. Feel free to reach out if you want to
collaborate on any distributed tech projects.

**Interests:** P2P networks, Git internals, Obsidian plugins

## Resources

Links and resources will be added here.

## Status

Just getting started...
`
      },
      relayedBy: ['bob']
    },

    // =========================================
    // COMMIT 2: Bob adds a resources file
    // =========================================
    // This builds on Bob's commit 1 (in Bob's repo)
    // Creates a NEW file, so no conflict possible
    {
      author: 'bob',
      subject: "Add resources document",
      body: `Creating a separate RESOURCES.md file with helpful links.

This is a NEW FILE, not an edit to README.
Should never conflict with any other commit.

TESTING: This should always apply cleanly.`,
      files: {
        // Keep README as it was after Bob's commit 1
        'README.md': `# Shared Project

Welcome to our collaborative DreamNode!

## Vision

This section describes our shared vision.

## Contributors

This section will be updated as people contribute.

### Bob

Hi, I'm Bob! I'm passionate about decentralized systems and
knowledge gardening. Feel free to reach out if you want to
collaborate on any distributed tech projects.

**Interests:** P2P networks, Git internals, Obsidian plugins

## Resources

Links and resources will be added here.

## Status

Just getting started...
`,
        // New file
        'RESOURCES.md': `# Resources & Links

Curated by Bob

## Related Projects

- [InterBrain](https://github.com/ProjectLiminality/InterBrain) - Knowledge gardening
- [Radicle](https://radicle.xyz) - P2P code collaboration
- [IPFS](https://ipfs.tech) - Distributed file system

## Documentation

- [Git Internals](https://git-scm.com/book/en/v2/Git-Internals-Plumbing-and-Porcelain)
- [Obsidian Plugin Dev](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

## Community

- Discord: #interbrain-dev
- Matrix: #p2p-knowledge:matrix.org
`
      },
      relayedBy: ['bob']
    },

    // =========================================
    // COMMIT 3: Charlie adds his intro (README edit)
    // =========================================
    // This is Charlie's first commit, starts from INITIAL_README
    // (Charlie's repo doesn't have Bob's changes!)
    // WILL CONFLICT if David already accepted Bob's README changes
    {
      author: 'charlie',
      subject: "Add Charlie's contributor introduction",
      body: `Adding my introduction to the Contributors section.

This is Charlie's contribution to the project.

TESTING: This modifies the same section as Bob's intro.
TESTING: If Bob's intro was already accepted, this WILL CONFLICT.
TESTING: The conflict resolution modal should appear.
TESTING: AI Magic or search-replace should merge both intros.`,
      files: {
        'README.md': `# Shared Project

Welcome to our collaborative DreamNode!

## Vision

This section describes our shared vision.

## Contributors

This section will be updated as people contribute.

### Charlie

Hey there! I'm Charlie. I focus on UI/UX design and making
complex systems feel intuitive. Always happy to help with
design reviews or brainstorming sessions.

**Expertise:** Design systems, User research, Prototyping

## Resources

Links and resources will be added here.

## Status

Just getting started...
`
      },
      relayedBy: ['charlie']
    },

    // =========================================
    // COMMIT 4: Alice's vision (relayed by BOTH)
    // =========================================
    // Alice wrote this, Bob and Charlie both relay it
    // Tests deduplication - should appear ONCE in the modal
    // with "Also from: charlie" indicator
    {
      author: 'alice',
      subject: "Add project vision statement",
      body: `Adding a vision statement to guide the project.

This commit was authored by Alice and relayed through the network.
Both Bob and Charlie have this commit and are offering it to David.

TESTING: Should appear ONCE in the modal (deduplicated by originalHash)
TESTING: Should show "Also from: charlie" (or bob) indicator
TESTING: Accepting from either peer should work`,
      files: {
        // For Bob's relay: builds on Bob's README (with Bob's intro)
        // For Charlie's relay: builds on Charlie's README (with Charlie's intro)
        // We'll use a version that just adds the Vision content
        // The conflict (if any) will be in the Contributors section
        'VISION.md': `# Project Vision

> "We believe that knowledge grows best when shared freely
> and organized through genuine human connections rather
> than rigid hierarchies."
>
> — Alice

## Core Principles

1. **Social Resonance** - Ideas spread through trust networks
2. **Decentralization** - No central authority controls knowledge
3. **Organic Growth** - Structure emerges from use, not planning

## Goals

- Enable frictionless collaboration across the Liminal Web
- Preserve provenance while allowing remix and evolution
- Make knowledge gardening as natural as conversation
`
      },
      relayedBy: ['bob', 'charlie'],
      originalAuthor: 'alice'
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
