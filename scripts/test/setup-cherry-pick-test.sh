#!/bin/bash
#
# Cherry-Pick Collaboration Test Harness
#
# Sets up a mock collaboration scenario for testing the cherry-pick workflow.
# Creates a test DreamNode with simulated peer branches.
#
# Directory structure:
#   /tmp/interbrain-cherry-pick-test/
#   ├── shared-project/          # The DreamNode (Bob's perspective)
#   ├── alice-bare/              # Alice's bare repo (simulates remote)
#   ├── charlie-bare/            # Charlie's bare repo (simulates remote)
#   └── bob-dreamer-alice/       # Bob's Dreamer node for Alice
#
# Usage:
#   ./setup-cherry-pick-test.sh         # Full setup
#   ./setup-cherry-pick-test.sh reset   # Reset to initial state
#

set -e

TEST_DIR="/tmp/interbrain-cherry-pick-test"
SHARED_PROJECT="$TEST_DIR/shared-project"
ALICE_BARE="$TEST_DIR/alice-bare"
CHARLIE_BARE="$TEST_DIR/charlie-bare"
BOB_DREAMER_ALICE="$TEST_DIR/bob-dreamer-alice"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
  echo -e "${GREEN}[TEST]${NC} $1"
}

info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

# Function to create initial setup
setup_fresh() {
  log "Creating fresh test environment at $TEST_DIR"

  # Clean up if exists
  if [ -d "$TEST_DIR" ]; then
    warn "Removing existing test directory"
    rm -rf "$TEST_DIR"
  fi

  mkdir -p "$TEST_DIR"

  # Create the shared project (Bob's working repo)
  log "Creating shared project..."
  mkdir -p "$SHARED_PROJECT"
  cd "$SHARED_PROJECT"
  git init

  # Create .udd file
  cat > .udd << 'EOF'
{
  "uuid": "test-shared-project-uuid",
  "title": "Shared Project",
  "type": "dream",
  "dreamTalk": "dreamtalk.png",
  "submodules": [],
  "supermodules": []
}
EOF

  # Create some initial content
  echo "# Shared Project" > README.md
  echo "Initial content from Bob" >> README.md

  git add .
  git commit -m "Initial commit: Create shared project"

  # Create Alice's bare repo and add as remote
  log "Creating Alice's bare repo..."
  git clone --bare "$SHARED_PROJECT" "$ALICE_BARE"

  # Add Alice as remote (simulating rad://repoId/aliceDid)
  cd "$SHARED_PROJECT"
  git remote add alice "$ALICE_BARE"

  # Simulate Alice making commits
  log "Simulating Alice's commits..."
  cd "$ALICE_BARE"

  # We need a temp working dir to make commits
  ALICE_WORK="/tmp/alice-work-$$"
  git clone "$ALICE_BARE" "$ALICE_WORK"
  cd "$ALICE_WORK"

  # Alice's commit 1: Add a new file
  echo "Alice's introduction" > alice-intro.md
  git add alice-intro.md
  git commit -m "Add Alice's introduction"

  # Alice's commit 2: Update README
  echo "" >> README.md
  echo "## Alice's Section" >> README.md
  echo "Content from Alice" >> README.md
  git add README.md
  git commit -m "Update README with Alice's section"

  # Alice's commit 3: Add another file
  echo "Alice's notes" > alice-notes.md
  git add alice-notes.md
  git commit -m "Add Alice's notes"

  # Push to bare repo
  git push origin main

  # Clean up temp dir
  rm -rf "$ALICE_WORK"

  # Create Charlie's bare repo
  log "Creating Charlie's bare repo..."
  cd "$SHARED_PROJECT"
  git clone --bare "$SHARED_PROJECT" "$CHARLIE_BARE"

  # Add Charlie as remote
  git remote add charlie "$CHARLIE_BARE"

  # Simulate Charlie making commits
  CHARLIE_WORK="/tmp/charlie-work-$$"
  git clone "$CHARLIE_BARE" "$CHARLIE_WORK"
  cd "$CHARLIE_WORK"

  # Charlie's commit 1: Add his own file
  echo "Charlie's contribution" > charlie-doc.md
  git add charlie-doc.md
  git commit -m "Add Charlie's documentation"

  # Charlie's commit 2: Cherry-pick from Alice (simulating relay)
  # First fetch Alice's commits
  git remote add alice "$ALICE_BARE"
  git fetch alice
  # Cherry-pick Alice's first commit with -x flag
  ALICE_FIRST_COMMIT=$(git log alice/main --oneline | tail -1 | cut -d' ' -f1)
  # Note: We skip this for simplicity - Charlie's commits are his own

  # Push to bare repo
  git push origin main

  rm -rf "$CHARLIE_WORK"

  # Create Bob's Dreamer node for Alice
  log "Creating Bob's Dreamer node for Alice..."
  mkdir -p "$BOB_DREAMER_ALICE"
  cd "$BOB_DREAMER_ALICE"
  git init

  cat > .udd << 'EOF'
{
  "uuid": "alice-dreamer-uuid",
  "title": "Alice",
  "type": "dreamer",
  "dreamTalk": "",
  "submodules": [],
  "supermodules": [],
  "did": "did:key:z6MkAliceFakeDID"
}
EOF

  git add .
  git commit -m "Create Dreamer node for Alice"

  # Fetch updates in shared project
  log "Fetching updates in shared project..."
  cd "$SHARED_PROJECT"
  git fetch alice
  git fetch charlie

  log "Test environment setup complete!"
  echo ""
  info "Directory structure:"
  echo "  $SHARED_PROJECT       - Your working repo (Bob)"
  echo "  $ALICE_BARE           - Alice's remote (3 commits ahead)"
  echo "  $CHARLIE_BARE         - Charlie's remote (1 commit ahead)"
  echo "  $BOB_DREAMER_ALICE    - Dreamer node for collaboration memory"
  echo ""
  info "To see pending commits from Alice:"
  echo "  cd $SHARED_PROJECT && git log HEAD..alice/main --oneline"
  echo ""
  info "To see pending commits from Charlie:"
  echo "  cd $SHARED_PROJECT && git log HEAD..charlie/main --oneline"
}

# Function to reset to initial state
reset_test() {
  log "Resetting test environment..."

  if [ ! -d "$TEST_DIR" ]; then
    warn "Test directory doesn't exist. Running full setup instead."
    setup_fresh
    return
  fi

  # Reset shared project to initial commit
  cd "$SHARED_PROJECT"
  INITIAL_COMMIT=$(git log --reverse --oneline | head -1 | cut -d' ' -f1)
  git reset --hard "$INITIAL_COMMIT"

  # Clear any stashes
  git stash clear 2>/dev/null || true

  # Clear collaboration memory
  if [ -f "$BOB_DREAMER_ALICE/collaboration-memory.json" ]; then
    rm "$BOB_DREAMER_ALICE/collaboration-memory.json"
    cd "$BOB_DREAMER_ALICE"
    git add -A
    git commit -m "Reset: Clear collaboration memory" 2>/dev/null || true
  fi

  # Re-fetch from remotes
  cd "$SHARED_PROJECT"
  git fetch alice
  git fetch charlie

  log "Reset complete!"
  info "Shared project reset to initial commit"
  info "Collaboration memory cleared"
}

# Main
case "${1:-}" in
  reset)
    reset_test
    ;;
  *)
    setup_fresh
    ;;
esac
