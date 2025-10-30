#!/bin/bash
# InterBrain Quick Installation Script for Testing
# For macOS/Linux systems

set -e  # Exit on error

echo "🚀 InterBrain Installation Script"
echo "=================================="
echo ""

# Color output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to print success
success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Function to print warning
warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Function to print error
error() {
    echo -e "${RED}❌ $1${NC}"
}

echo "Step 1: Checking prerequisites..."
echo "-----------------------------------"

# Check for Homebrew (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    if ! command_exists brew; then
        warning "Homebrew not found. Installing..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        success "Homebrew installed"
    else
        success "Homebrew found"
    fi
fi

# Check for Git
if ! command_exists git; then
    echo "Installing Git..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install git
    else
        sudo apt-get update && sudo apt-get install -y git
    fi
    success "Git installed"
else
    success "Git found ($(git --version))"
fi

# Check for Node.js
if ! command_exists node; then
    echo "Installing Node.js..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install node
    else
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
    success "Node.js installed"
else
    success "Node.js found ($(node --version))"
fi

# Check for Radicle
if ! command_exists rad; then
    echo "Installing Radicle..."
    curl -sSf https://radicle.xyz/install | sh

    # Source Radicle path for this session
    if [[ "$OSTYPE" == "darwin"* ]]; then
        export PATH="$HOME/.radicle/bin:$PATH"
    fi

    success "Radicle installed"
else
    success "Radicle found ($(rad --version))"
fi

echo ""
echo "Step 2: Getting vault path..."
echo "------------------------------"

# Ask for vault path
read -p "Enter your Obsidian vault path: " VAULT_PATH

if [ ! -d "$VAULT_PATH" ]; then
    error "Vault path does not exist: $VAULT_PATH"
    exit 1
fi

success "Vault found at: $VAULT_PATH"

echo ""
echo "Step 3: Cloning InterBrain..."
echo "------------------------------"

# Determine target directory (parent of vault)
INSTALL_DIR="$(dirname "$VAULT_PATH")"
INTERBRAIN_PATH="$INSTALL_DIR/InterBrain"

if [ -d "$INTERBRAIN_PATH" ]; then
    warning "InterBrain directory already exists. Updating..."
    cd "$INTERBRAIN_PATH"
    git pull origin main
else
    echo "Cloning from GitHub..."
    cd "$INSTALL_DIR"
    git clone https://github.com/ProjectLiminality/InterBrain.git
    cd InterBrain
fi

success "InterBrain code ready at: $INTERBRAIN_PATH"

echo ""
echo "Step 4: Building plugin..."
echo "--------------------------"

cd "$INTERBRAIN_PATH"
echo "Installing dependencies (this may take a minute)..."
npm install

echo "Building plugin..."
npm run build

success "Plugin built successfully"

echo ""
echo "Step 5: Linking to vault..."
echo "---------------------------"

PLUGINS_DIR="$VAULT_PATH/.obsidian/plugins"
SYMLINK_PATH="$PLUGINS_DIR/interbrain"

# Create plugins directory if it doesn't exist
mkdir -p "$PLUGINS_DIR"

# Remove old symlink if exists
if [ -L "$SYMLINK_PATH" ]; then
    rm "$SYMLINK_PATH"
    warning "Removed old symlink"
fi

# Create symlink
ln -s "$INTERBRAIN_PATH" "$SYMLINK_PATH"
success "Symlink created: $SYMLINK_PATH → $INTERBRAIN_PATH"

echo ""
echo "Step 6: Radicle identity setup..."
echo "----------------------------------"

# Check if Radicle identity exists
if rad self --did >/dev/null 2>&1; then
    success "Radicle identity already exists"
    RAD_DID=$(rad self --did)
    RAD_ALIAS=$(rad self --alias 2>/dev/null || echo "Unknown")
    echo "   DID: $RAD_DID"
    echo "   Alias: $RAD_ALIAS"
else
    warning "No Radicle identity found. Creating one..."
    echo ""
    echo "You will be asked to:"
    echo "  1. Enter an alias (your name or nickname)"
    echo "  2. Enter a passphrase (keep this safe!)"
    echo ""
    read -p "Press Enter to continue..."

    rad auth

    success "Radicle identity created"
    RAD_DID=$(rad self --did)
    RAD_ALIAS=$(rad self --alias 2>/dev/null || echo "Unknown")
    echo "   DID: $RAD_DID"
    echo "   Alias: $RAD_ALIAS"
fi

echo ""
echo "Step 7: Starting Radicle node..."
echo "---------------------------------"

# Check if node is already running
if rad node status | grep -q "Running"; then
    success "Radicle node already running"
else
    echo "Starting Radicle node..."
    rad node start
    sleep 2
    success "Radicle node started"
fi

echo ""
echo "Step 8: Final verification..."
echo "------------------------------"

# Verify everything
ALL_GOOD=true

if [ ! -L "$SYMLINK_PATH" ]; then
    error "Symlink not created"
    ALL_GOOD=false
else
    success "Plugin symlink exists"
fi

if [ ! -f "$INTERBRAIN_PATH/main.js" ]; then
    error "Plugin not built (main.js missing)"
    ALL_GOOD=false
else
    success "Plugin built (main.js exists)"
fi

if ! rad node status | grep -q "Running"; then
    warning "Radicle node not running (you can start it with: rad node start)"
else
    success "Radicle node running"
fi

echo ""
echo "=================================="
if [ "$ALL_GOOD" = true ]; then
    echo -e "${GREEN}✅ Installation complete!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Restart Obsidian (or reload plugins)"
    echo "2. Enable 'InterBrain' plugin in Settings → Community plugins"
    echo "3. You should see the InterBrain icon in the left ribbon"
    echo ""
    echo "Your Radicle identity:"
    echo "   DID: $RAD_DID"
    echo "   Alias: $RAD_ALIAS"
    echo ""
    echo "Share your DID with collaborators so they can follow you!"
    echo ""
    echo "For testing guidance, see: $INTERBRAIN_PATH/TESTING_CHECKLIST.md"
else
    error "Installation completed with warnings. Please review the output above."
fi
