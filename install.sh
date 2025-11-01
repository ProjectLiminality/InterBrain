#!/bin/bash
# InterBrain Installation Script
# For macOS/Linux systems
# One-command setup: curl -fsSL https://raw.githubusercontent.com/ProjectLiminality/InterBrain/main/install.sh | bash

set -e  # Exit on error

echo "🚀 InterBrain Installation Script"
echo "=================================="
echo ""

# Color output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default vault name and location
DEFAULT_VAULT_NAME="DreamVault"
DEFAULT_VAULT_PARENT="$HOME"

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

# Function to print info
info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Function to refresh shell environment
refresh_shell_env() {
    # Ensure newly installed binaries are available
    hash -r 2>/dev/null || true

    # Add common paths explicitly
    export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.radicle/bin:$PATH"

    # Source shell profile if it exists
    if [ -f "$HOME/.zshrc" ]; then
        source "$HOME/.zshrc" 2>/dev/null || true
    elif [ -f "$HOME/.bashrc" ]; then
        source "$HOME/.bashrc" 2>/dev/null || true
    fi
}

echo "Step 1: Checking prerequisites..."
echo "-----------------------------------"

# Check for Homebrew (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    if ! command_exists brew; then
        warning "Homebrew not found. Installing..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

        # Add Homebrew to PATH based on architecture
        if [[ $(uname -m) == 'arm64' ]]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        else
            eval "$(/usr/local/bin/brew shellenv)"
        fi

        refresh_shell_env
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
        refresh_shell_env
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
        refresh_shell_env
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

    # Add Radicle to PATH for this session
    export PATH="$HOME/.radicle/bin:$PATH"
    refresh_shell_env

    success "Radicle installed"
else
    success "Radicle found ($(rad --version))"
fi

# Check for Obsidian
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo ""
    echo "Step 2: Checking for Obsidian..."
    echo "----------------------------------"

    if [ -d "/Applications/Obsidian.app" ]; then
        success "Obsidian found"
        OBSIDIAN_INSTALLED=true
    else
        warning "Obsidian not found. Installing..."
        brew install --cask obsidian
        success "Obsidian installed"
        OBSIDIAN_INSTALLED=true
    fi
else
    OBSIDIAN_INSTALLED=false
    warning "Non-macOS system detected. Please install Obsidian manually from https://obsidian.md"
fi

echo ""
echo "Step 3: Setting up vault..."
echo "----------------------------"

# Check if user wants to use existing vault or create new one
if [ -t 0 ]; then
    # Interactive mode (terminal attached)
    echo ""
    echo "Do you have an existing Obsidian vault?"
    read -p "Press Enter to create a new vault, or type the path to your existing vault: " USER_VAULT_PATH

    if [ -z "$USER_VAULT_PATH" ]; then
        # Create new vault
        echo ""
        read -p "Vault name (default: $DEFAULT_VAULT_NAME): " VAULT_NAME
        VAULT_NAME=${VAULT_NAME:-$DEFAULT_VAULT_NAME}

        read -p "Location (default: $DEFAULT_VAULT_PARENT): " VAULT_PARENT
        VAULT_PARENT=${VAULT_PARENT:-$DEFAULT_VAULT_PARENT}

        VAULT_PATH="$VAULT_PARENT/$VAULT_NAME"
    else
        VAULT_PATH="$USER_VAULT_PATH"
    fi
else
    # Non-interactive mode (piped from curl)
    VAULT_PATH="$DEFAULT_VAULT_PARENT/$DEFAULT_VAULT_NAME"
    info "Non-interactive mode: Creating vault at $VAULT_PATH"
fi

# Create vault if it doesn't exist
if [ ! -d "$VAULT_PATH" ]; then
    mkdir -p "$VAULT_PATH"
    success "Created vault directory: $VAULT_PATH"
else
    success "Using existing vault: $VAULT_PATH"
fi

# Create .obsidian directory structure if it doesn't exist
mkdir -p "$VAULT_PATH/.obsidian/plugins"

# Create minimal Obsidian config if it doesn't exist
if [ ! -f "$VAULT_PATH/.obsidian/app.json" ]; then
    cat > "$VAULT_PATH/.obsidian/app.json" << 'EOF'
{
  "showLineNumber": true,
  "spellcheck": true,
  "promptDelete": false
}
EOF
    success "Created Obsidian config"
fi

# Create community-plugins.json to enable InterBrain plugin
cat > "$VAULT_PATH/.obsidian/community-plugins.json" << 'EOF'
["interbrain"]
EOF

echo ""
echo "Step 4: Cloning InterBrain..."
echo "------------------------------"

# Clone into vault
INTERBRAIN_PATH="$VAULT_PATH/InterBrain"

if [ -d "$INTERBRAIN_PATH" ]; then
    # Check if it's actually the InterBrain repo
    if [ -d "$INTERBRAIN_PATH/.git" ]; then
        cd "$INTERBRAIN_PATH"
        REPO_URL=$(git config --get remote.origin.url 2>/dev/null || echo "")

        if [[ "$REPO_URL" == *"ProjectLiminality/InterBrain"* ]]; then
            warning "InterBrain already exists. Updating..."
            git pull origin main
        else
            echo ""
            error "Directory '$INTERBRAIN_PATH' already exists but is a different repository."
            echo ""
            echo "Please rename or move the existing directory, then run this script again:"
            echo "  mv '$INTERBRAIN_PATH' '$INTERBRAIN_PATH.backup'"
            echo ""
            exit 1
        fi
    else
        echo ""
        error "Directory '$INTERBRAIN_PATH' already exists but is not a git repository."
        echo ""
        echo "Please rename or move the existing directory, then run this script again:"
        echo "  mv '$INTERBRAIN_PATH' '$INTERBRAIN_PATH.backup'"
        echo ""
        exit 1
    fi
else
    echo "Cloning from GitHub..."
    cd "$VAULT_PATH"
    git clone https://github.com/ProjectLiminality/InterBrain.git
    cd InterBrain
fi

success "InterBrain code ready at: $INTERBRAIN_PATH"

echo ""
echo "Step 5: Building plugin..."
echo "--------------------------"

cd "$INTERBRAIN_PATH"
info "Installing dependencies (this may take a minute)..."
npm install --silent

info "Building plugin..."
npm run build

success "Plugin built successfully"

echo ""
echo "Step 6: Linking to vault..."
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
echo "Step 7: Radicle identity setup..."
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

    if [ -t 0 ]; then
        read -p "Press Enter to continue..."
        rad auth
    else
        echo ""
        error "Cannot create Radicle identity in non-interactive mode."
        echo "Please run this command after installation completes:"
        echo "  rad auth"
        echo ""
        RAD_DID="[Not created - run 'rad auth']"
        RAD_ALIAS="[Not created]"
    fi

    if rad self --did >/dev/null 2>&1; then
        success "Radicle identity created"
        RAD_DID=$(rad self --did)
        RAD_ALIAS=$(rad self --alias 2>/dev/null || echo "Unknown")
        echo "   DID: $RAD_DID"
        echo "   Alias: $RAD_ALIAS"
    fi
fi

echo ""
echo "Step 8: Starting Radicle node..."
echo "---------------------------------"

# Check if node is already running
if rad node status 2>/dev/null | grep -q "Running"; then
    success "Radicle node already running"
else
    echo "Starting Radicle node..."
    rad node start
    sleep 2
    success "Radicle node started"
fi

echo ""
echo "Step 9: Final verification..."
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

if ! rad node status 2>/dev/null | grep -q "Running"; then
    warning "Radicle node not running (you can start it with: rad node start)"
else
    success "Radicle node running"
fi

if [ "$OBSIDIAN_INSTALLED" = true ]; then
    success "Obsidian installed"
fi

echo ""
echo "Step 10: Opening Obsidian..."
echo "-----------------------------"

if [[ "$OSTYPE" == "darwin"* ]] && [ "$OBSIDIAN_INSTALLED" = true ]; then
    # Open Obsidian with the vault
    info "Opening Obsidian to your DreamVault..."
    sleep 1
    open -a Obsidian "$VAULT_PATH"
    success "Obsidian opened"
    echo ""
    info "Obsidian should open shortly. If not, open Obsidian and select:"
    info "  $VAULT_PATH"
fi

echo ""
echo "=================================="
if [ "$ALL_GOOD" = true ]; then
    echo -e "${GREEN}✅ Installation complete!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. In Obsidian: Click 'Trust author and enable plugins' when prompted"
    echo "2. Look for the InterBrain icon (🧠) in the left ribbon"
    echo "3. Click Clone URIs from your email to add DreamNodes"
    echo ""
    if [[ "$RAD_DID" != "[Not created - run 'rad auth']" ]]; then
        echo "Your Radicle identity:"
        echo "   DID: $RAD_DID"
        echo "   Alias: $RAD_ALIAS"
        echo ""
        echo "Share your DID with collaborators so they can follow you!"
    fi
else
    error "Installation completed with warnings. Please review the output above."
    echo ""
    echo "Common issues:"
    echo "• If Radicle commands don't work, try: source ~/.zshrc"
    echo "• If plugin doesn't appear, restart Obsidian"
    echo "• If you need help, see: https://github.com/ProjectLiminality/InterBrain/issues"
fi

echo ""
echo "Happy dreaming! 🌙✨"
echo ""
