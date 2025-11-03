#!/bin/bash
# InterBrain Installation Script
# For macOS/Linux systems
# One-command setup: curl -fsSL https://raw.githubusercontent.com/ProjectLiminality/InterBrain/main/install.sh | bash
# With URI: curl -fsSL https://raw.githubusercontent.com/ProjectLiminality/InterBrain/main/install.sh | bash -s -- --uri "obsidian://interbrain-clone?..."

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

# Total number of steps (for progress tracking)
TOTAL_STEPS=13

# Default vault name and location
DEFAULT_VAULT_NAME="DreamVault"
DEFAULT_VAULT_PARENT="$HOME"

# Parse command-line arguments
CLONE_URI=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --uri)
      CLONE_URI="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

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

# Function to show spinner during long operations
show_spinner() {
    local pid=$1
    local message=$2
    local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    local i=0

    echo -n "   "
    while kill -0 $pid 2>/dev/null; do
        i=$(( (i+1) %10 ))
        printf "\r   ${BLUE}${spin:$i:1}${NC} $message"
        sleep .1
    done
    printf "\r   ✓ $message\n"
}

# Function to run command with spinner
run_with_spinner() {
    local message=$1
    shift
    "$@" > /dev/null 2>&1 &
    show_spinner $! "$message"
    wait $!
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

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1/$TOTAL_STEPS: Checking prerequisites"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

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

# Parse .gitignore and create Obsidian config with smart exclusions
info "Parsing .gitignore patterns for vault exclusions..."

# Generate userIgnoreFilters from .gitignore
INTERBRAIN_PATH="$VAULT_PATH/InterBrain"
GITIGNORE_PATH="$INTERBRAIN_PATH/.gitignore"

# Always exclude .git directory (not in .gitignore but critical)
FILTERS='["InterBrain/.git"'

if [ -f "$GITIGNORE_PATH" ]; then
    # Parse .gitignore: filter comments, empty lines, and convert to JSON array
    while IFS= read -r line || [ -n "$line" ]; do
        # Skip empty lines and comments
        if [ -z "$line" ] || [[ "$line" =~ ^[[:space:]]*# ]]; then
            continue
        fi

        # Remove trailing slashes for consistency
        pattern="${line%/}"

        # Skip negation patterns (lines starting with !)
        if [[ "$pattern" =~ ^! ]]; then
            continue
        fi

        # Add InterBrain/ prefix and append to filters
        FILTERS="$FILTERS, \"InterBrain/$pattern\""
    done < "$GITIGNORE_PATH"
fi

# Close JSON array
FILTERS="$FILTERS]"

# Create app.json with parsed filters
cat > "$VAULT_PATH/.obsidian/app.json" << EOF
{
  "showLineNumber": true,
  "spellcheck": true,
  "promptDelete": false,
  "userIgnoreFilters": $FILTERS
}
EOF
success "Created Obsidian config with $(echo "$FILTERS" | grep -o "InterBrain/" | wc -l | tr -d ' ') exclusion patterns from .gitignore"

# Create community-plugins.json to enable InterBrain plugin
cat > "$VAULT_PATH/.obsidian/community-plugins.json" << 'EOF'
["interbrain"]
EOF

# Create snippets directory and enable InterBrain theme
mkdir -p "$VAULT_PATH/.obsidian/snippets"

# Create appearance.json with InterBrain theme enabled
cat > "$VAULT_PATH/.obsidian/appearance.json" << 'EOF'
{
  "accentColor": "#00A2FF",
  "theme": "obsidian",
  "baseFontSize": 16,
  "enabledCssSnippets": [
    "interbrain"
  ]
}
EOF
success "Created theme configuration"

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

# Install dependencies with spinner
npm install --silent > /dev/null 2>&1 &
show_spinner $! "Installing Node.js dependencies..."
wait $!

# Build with spinner
npm run build > /dev/null 2>&1 &
show_spinner $! "Building InterBrain plugin..."
wait $!

success "Plugin built successfully"

echo ""
echo "Step 6: Installing InterBrain theme..."
echo "---------------------------------------"

# Copy theme CSS to snippets directory
if [ -f "$INTERBRAIN_PATH/theme/interbrain.css" ]; then
    cp "$INTERBRAIN_PATH/theme/interbrain.css" "$VAULT_PATH/.obsidian/snippets/"
    success "InterBrain theme installed"
else
    warning "Theme file not found, skipping theme installation"
fi

echo ""
echo "Step 7: Installing Ollama for semantic search..."
echo "-------------------------------------------------"

# Check for Ollama
if ! command_exists ollama; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS: Install via Homebrew
        echo "Installing Ollama via Homebrew..."
        brew install ollama

        # Start Ollama service (Homebrew installs it as a service)
        brew services start ollama

        success "Ollama installed and service started"
    else
        # Linux: Use official install script
        echo "Installing Ollama..."
        curl -fsSL https://ollama.ai/install.sh | sh

        # Add Ollama to PATH for this session
        export PATH="$HOME/.ollama/bin:$PATH"
        refresh_shell_env

        success "Ollama installed"
    fi
else
    success "Ollama found ($(ollama --version 2>/dev/null || echo 'version unknown'))"

    # Ensure Ollama service is running on macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if ! brew services list | grep -q "ollama.*started"; then
            info "Starting Ollama service..."
            brew services start ollama
        fi
    fi
fi

# Pull the embedding model
if ollama list 2>/dev/null | grep -q "nomic-embed-text"; then
    success "nomic-embed-text model already installed"
else
    info "Downloading nomic-embed-text model (this may take 1-2 minutes)..."
    ollama pull nomic-embed-text > /dev/null 2>&1 &
    show_spinner $! "Pulling nomic-embed-text model..."
    wait $!
    success "nomic-embed-text model installed"
fi

echo ""
echo "Step 8: Linking plugin to vault..."
echo "-----------------------------------"

PLUGINS_DIR="$VAULT_PATH/.obsidian/plugins"
mkdir -p "$PLUGINS_DIR"

SYMLINK_PATH="$PLUGINS_DIR/interbrain"

# Remove old symlink if exists
if [ -L "$SYMLINK_PATH" ]; then
    rm "$SYMLINK_PATH"
    warning "Removed old symlink"
fi

# Create symlink
ln -s "$INTERBRAIN_PATH" "$SYMLINK_PATH"
success "Symlink created: $SYMLINK_PATH → $INTERBRAIN_PATH"

echo ""
echo "Step 9: Radicle identity setup..."
echo "-----------------------------------"

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
echo "Step 10: Starting Radicle node..."
echo "----------------------------------"

# Check if node is already running
if rad node status 2>/dev/null | grep -qi "running"; then
    success "Radicle node already running"
else
    echo "Starting Radicle node..."
    rad node start
    sleep 2
    success "Radicle node started"
fi

echo ""
echo "Step 11: Setting up real-time transcription (Python + Whisper)..."
echo "------------------------------------------------------------------"

# Check for Python 3
if ! command_exists python3; then
    echo "Installing Python 3..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install python3
        refresh_shell_env
    else
        sudo apt-get update && sudo apt-get install -y python3 python3-pip
    fi
    success "Python 3 installed"
else
    success "Python 3 found ($(python3 --version))"
fi

# Set up whisper_streaming virtual environment
TRANSCRIPTION_DIR="$INTERBRAIN_PATH/src/features/realtime-transcription/scripts"
if [ -d "$TRANSCRIPTION_DIR" ]; then
    cd "$INTERBRAIN_PATH/src/features/realtime-transcription/scripts"

    if [ ! -d "venv" ]; then
        info "Setting up Python environment (this may take 1-2 minutes)..."

        # Create venv
        python3 -m venv venv > /dev/null 2>&1 &
        show_spinner $! "Creating virtual environment..."
        wait $!

        # Install dependencies with spinner
        (
            source venv/bin/activate
            pip install --upgrade pip --quiet
            pip install -r requirements.txt --quiet
            deactivate
        ) > /dev/null 2>&1 &
        show_spinner $! "Installing whisper_streaming and dependencies..."
        wait $!

        success "Transcription environment ready"
    else
        success "Transcription environment already exists"
    fi
else
    warning "Transcription directory not found, skipping Python setup"
fi

echo ""
echo "Step 12: Final verification..."
echo "-------------------------------"

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

if ! rad node status 2>/dev/null | grep -qi "running"; then
    warning "Radicle node not running (you can start it with: rad node start)"
else
    success "Radicle node running"
fi

if [ "$OBSIDIAN_INSTALLED" = true ]; then
    success "Obsidian installed"
fi

if command_exists ollama && ollama list 2>/dev/null | grep -q "nomic-embed-text"; then
    success "Ollama with nomic-embed-text model ready"
else
    warning "Ollama or embedding model not ready"
fi

if command_exists python3; then
    success "Python 3 ready for transcription"
    if [ -d "$TRANSCRIPTION_DIR/venv" ]; then
        success "Whisper transcription environment ready"
    else
        warning "Whisper environment not set up"
    fi
else
    warning "Python 3 not installed (needed for transcription)"
fi

echo ""
echo "Step 13: Opening Obsidian..."
echo "-----------------------------"

if [[ "$OSTYPE" == "darwin"* ]] && [ "$OBSIDIAN_INSTALLED" = true ]; then
    # Open Obsidian with the vault
    info "Opening Obsidian to your DreamVault..."
    sleep 1
    open -a Obsidian "$VAULT_PATH"
    success "Obsidian opened"

    # If a clone URI was provided, trigger it after Obsidian loads
    if [ -n "$CLONE_URI" ]; then
        echo ""
        info "Waiting for Obsidian and InterBrain to initialize..."
        sleep 5  # Give Obsidian time to load the vault and enable plugins

        info "Triggering clone URI..."
        open "$CLONE_URI"
        success "Clone URI triggered - DreamNode(s) will appear shortly"
        echo ""
        info "The clone operation is running in the background."
        info "Watch for notifications in Obsidian about the clone progress."
    fi

    echo ""
    info "Obsidian should open shortly. If not, open Obsidian and select:"
    info "  $VAULT_PATH"
fi

echo ""
echo "=================================="
if [ "$ALL_GOOD" = true ]; then
    echo -e "${GREEN}✅ Installation complete!${NC}"
    echo ""
    if [ -n "$CLONE_URI" ]; then
        echo "🎯 Personalized installation detected!"
        echo ""
        echo "The clone operation has been triggered automatically."
        echo "Your collaborator's DreamNodes and Dreamer profile will appear in InterBrain."
        echo ""
    fi
    echo "Next steps:"
    echo "1. In Obsidian: Click 'Trust author and enable plugins' when prompted"
    echo "2. Look for the InterBrain icon (🧠) in the left ribbon"
    echo "3. Use Command+R to reload the plugin during development"
    echo "4. Run 'Full Index' command to enable semantic search"
    if [ -z "$CLONE_URI" ]; then
        echo "5. Click Clone URIs from your email to add DreamNodes"
    fi
    echo ""
    echo "⚙️  IMPORTANT: Configure settings for full functionality:"
    echo ""
    echo "In Obsidian Settings → InterBrain:"
    echo ""
    echo "• Anthropic API Key - Required for AI features:"
    echo "  - Get your key from: https://console.anthropic.com/settings/keys"
    echo "  - Used for conversation summaries and semantic analysis"
    echo ""
    echo "• Radicle Passphrase - Required for seamless Radicle operations:"
    echo "  - This is the passphrase you created during 'rad auth'"
    echo "  - Enables automatic peer-to-peer syncing without password prompts"
    echo "  - Note: Stored locally in Obsidian's secure storage"
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
