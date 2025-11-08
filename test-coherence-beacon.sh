#!/bin/bash
#
# Coherence Beacon Testing Workflow
# Quick script to test coherence beacon functionality without manual DreamSong editing
#

set -e  # Exit on error

VAULT_PATH="/Users/davidrug/DreamVault"
CYLINDER_PATH="$VAULT_PATH/Cylinder"
CIRCLE_PATH="$VAULT_PATH/Circle"
SQUARE_PATH="$VAULT_PATH/Square"

echo "🧪 Coherence Beacon Testing Workflow"
echo "===================================="
echo ""

# Function to create minimal test DreamSong canvas
create_test_canvas() {
  local repo_path=$1
  local repo_name=$2
  local canvas_file="$repo_path/${repo_name}.canvas"

  echo "📝 Creating test canvas for $repo_name..."

  # Minimal canvas with just text node
  cat > "$canvas_file" << 'EOF'
{
  "nodes": [
    {
      "id": "test-node-1",
      "type": "text",
      "text": "Test DreamSong for coherence beacon",
      "x": 0,
      "y": 0,
      "width": 250,
      "height": 100
    }
  ],
  "edges": []
}
EOF

  echo "✓ Created $canvas_file"
}

# Function to check for coherence beacon commits
check_coherence_beacons() {
  local repo_path=$1
  local repo_name=$2

  echo ""
  echo "🔍 Checking $repo_name for COHERENCE_BEACON commits..."

  cd "$repo_path"

  local beacon_commits=$(git log --all --format="%H|%s|%b%x00" -20 | grep -c "COHERENCE_BEACON" || true)

  if [ "$beacon_commits" -gt 0 ]; then
    echo "✅ Found $beacon_commits coherence beacon commit(s) in $repo_name!"
    echo ""
    echo "Recent beacon commits:"
    git log --all --format="%h - %s" --grep="COHERENCE_BEACON" -5
  else
    echo "❌ No coherence beacon commits found in $repo_name"
  fi
}

# Step 1: Reset test DreamNodes to clean state
echo "1️⃣  Resetting Cylinder and Circle to clean state..."
echo ""

cd "$CYLINDER_PATH"
if [ -f "Cylinder.canvas" ]; then
  git rm -f "Cylinder.canvas" 2>/dev/null || rm -f "Cylinder.canvas"
  echo "   Removed Cylinder.canvas"
fi

cd "$CIRCLE_PATH"
if [ -f "Circle.canvas" ]; then
  git rm -f "Circle.canvas" 2>/dev/null || rm -f "Circle.canvas"
  echo "   Removed Circle.canvas"
fi

# Step 2: Create test canvases
echo ""
echo "2️⃣  Creating test DreamSong canvases..."
echo ""

create_test_canvas "$CYLINDER_PATH" "Cylinder"
create_test_canvas "$CIRCLE_PATH" "Circle"

# Step 3: Stage and commit
echo ""
echo "3️⃣  Committing test canvases..."
echo ""

cd "$CYLINDER_PATH"
git add Cylinder.canvas
git commit -m "Add test DreamSong canvas for coherence beacon testing" || echo "   (no changes to commit in Cylinder)"

cd "$CIRCLE_PATH"
git add Circle.canvas
git commit -m "Add test DreamSong canvas for coherence beacon testing" || echo "   (no changes to commit in Circle)"

# Step 4: Check current state
echo ""
echo "4️⃣  Current state of repositories:"
echo ""

echo "📦 Square supermodules:"
cat "$SQUARE_PATH/.udd" | jq '.supermodules'

echo ""
echo "📦 Cylinder submodules (.gitmodules):"
cat "$CYLINDER_PATH/.gitmodules" 2>/dev/null || echo "   (no .gitmodules file)"

# Step 5: Instructions for next steps
echo ""
echo "=================================="
echo "🎯 NEXT STEPS - Run in Obsidian:"
echo "=================================="
echo ""
echo "1. Open Cylinder DreamNode in InterBrain"
echo "2. Run command: 'Sync Canvas Submodules'"
echo "3. Check console for COHERENCE_BEACON commit logs"
echo "4. Run this script again with 'check' argument to verify"
echo ""
echo "Example: ./test-coherence-beacon.sh check"
echo ""

# If "check" argument provided, check for beacons
if [ "$1" == "check" ]; then
  echo ""
  echo "=================================="
  echo "🔍 CHECKING FOR COHERENCE BEACONS"
  echo "=================================="

  check_coherence_beacons "$SQUARE_PATH" "Square"
  check_coherence_beacons "$CIRCLE_PATH" "Circle"

  echo ""
  echo "📊 Square .udd supermodules:"
  cat "$SQUARE_PATH/.udd" | jq '.supermodules'

  echo ""
  echo "📊 Circle .udd supermodules:"
  cat "$CIRCLE_PATH/.udd" | jq '.supermodules'
fi

echo ""
echo "✅ Done!"
