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
BOB_DREAMER_CHARLIE="$TEST_DIR/bob-dreamer-charlie"

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

  # Simulate Charlie making commits AND relaying Alice's commits
  CHARLIE_WORK="/tmp/charlie-work-$$"
  git clone "$CHARLIE_BARE" "$CHARLIE_WORK"
  cd "$CHARLIE_WORK"

  # Charlie's commit 1: Add his own file
  echo "Charlie's contribution" > charlie-doc.md
  git add charlie-doc.md
  git commit -m "Add Charlie's documentation"

  # Charlie relays Alice's commits via cherry-pick -x
  # This creates the "(cherry picked from commit ...)" trailer for deduplication
  git remote add alice "$ALICE_BARE"
  git fetch alice

  # Get Alice's commit hashes (excluding the initial shared commit)
  ALICE_COMMITS=$(git log alice/main --oneline --reverse | tail -n +2 | cut -d' ' -f1)

  log "Charlie cherry-picking Alice's commits..."
  for COMMIT in $ALICE_COMMITS; do
    git cherry-pick -x "$COMMIT" || {
      # Handle conflicts by accepting theirs
      git checkout --theirs .
      git add -A
      git cherry-pick --continue --no-edit
    }
    info "  Cherry-picked: $(git log -1 --oneline)"
  done

  # Charlie's unique commit: Add contributor intro
  cat > collaboration-memory.json << 'CONTRIB_EOF'
# Collaboration Notes
Charlie here! I've cherry-picked some great contributions from Alice.
CONTRIB_EOF
  git add collaboration-memory.json
  git commit -m "Add Charlie's contributor introduction"

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

  # Create Bob's Dreamer node for Charlie
  log "Creating Bob's Dreamer node for Charlie..."
  mkdir -p "$BOB_DREAMER_CHARLIE"
  cd "$BOB_DREAMER_CHARLIE"
  git init

  cat > .udd << 'EOF'
{
  "uuid": "charlie-dreamer-uuid",
  "title": "Charlie",
  "type": "dreamer",
  "dreamTalk": "",
  "submodules": [],
  "supermodules": [],
  "did": "did:key:z6MkCharlieFakeDID"
}
EOF

  git add .
  git commit -m "Create Dreamer node for Charlie"

  # Fetch updates in shared project
  log "Fetching updates in shared project..."
  cd "$SHARED_PROJECT"
  git fetch alice
  git fetch charlie

  log "Test environment setup complete!"
  echo ""
  info "Directory structure:"
  echo "  $SHARED_PROJECT       - Your working repo (Bob)"
  echo "  $ALICE_BARE           - Alice's remote (3 original commits)"
  echo "  $CHARLIE_BARE         - Charlie's remote (1 own + 3 relayed from Alice + 1 own)"
  echo "  $BOB_DREAMER_ALICE    - Dreamer node for Alice collaboration memory"
  echo "  $BOB_DREAMER_CHARLIE  - Dreamer node for Charlie collaboration memory"
  echo ""
  info "To see pending commits from Alice:"
  echo "  cd $SHARED_PROJECT && git log HEAD..alice/main --oneline"
  echo ""
  info "To see pending commits from Charlie:"
  echo "  cd $SHARED_PROJECT && git log HEAD..charlie/main --oneline"
  echo ""
  info "Deduplication test:"
  echo "  Alice's 3 commits appear in both alice/main AND charlie/main"
  echo "  Charlie's relayed commits have '(cherry picked from commit ...)' trailers"
  echo "  UI should show 'Also from: charlie' for Alice's commits (or vice versa)"
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

  # Abort any in-progress cherry-pick
  git cherry-pick --abort 2>/dev/null || true

  # Clear collaboration memory for Alice's Dreamer
  if [ -f "$BOB_DREAMER_ALICE/collaboration-memory.json" ]; then
    log "Clearing Alice's collaboration memory..."
    rm "$BOB_DREAMER_ALICE/collaboration-memory.json"
    cd "$BOB_DREAMER_ALICE"
    git add -A
    git commit -m "Reset: Clear collaboration memory" 2>/dev/null || true
  fi

  # Clear collaboration memory for Charlie's Dreamer
  if [ -f "$BOB_DREAMER_CHARLIE/collaboration-memory.json" ]; then
    log "Clearing Charlie's collaboration memory..."
    rm "$BOB_DREAMER_CHARLIE/collaboration-memory.json"
    cd "$BOB_DREAMER_CHARLIE"
    git add -A
    git commit -m "Reset: Clear collaboration memory" 2>/dev/null || true
  fi

  # Re-fetch from remotes
  cd "$SHARED_PROJECT"
  git fetch alice
  git fetch charlie

  log "Reset complete!"
  info "Shared project reset to initial commit"
  info "Collaboration memory cleared for both Alice and Charlie Dreamers"
  echo ""
  info "Pending commits:"
  echo "  Alice:   $(git log HEAD..alice/main --oneline | wc -l | tr -d ' ') commits"
  echo "  Charlie: $(git log HEAD..charlie/main --oneline | wc -l | tr -d ' ') commits"
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
