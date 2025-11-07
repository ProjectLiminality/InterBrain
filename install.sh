#!/bin/bash
# InterBrain Installation Script
# For macOS/Linux systems
#
# One-command setup (interactive):
#   bash <(curl -fsSL https://raw.githubusercontent.com/ProjectLiminality/InterBrain/main/install.sh)
#
# With personalized clone URI:
#   bash <(curl -fsSL https://raw.githubusercontent.com/ProjectLiminality/InterBrain/main/install.sh) --uri "obsidian://interbrain-clone?..."
#
# Testing flags:
#   --test-fail before-gh   Simulate failure before GitHub CLI installed (no automatic issue creation available)
#   --test-fail after-gh    Simulate failure after GitHub CLI installed (should offer automatic issue creation)

# Create log file FIRST (before anything else)
LOG_FILE="/tmp/interbrain-install-$(date +%Y%m%d-%H%M%S).log"

# Redirect all output to both terminal AND log file
exec > >(tee -a "$LOG_FILE")
exec 2>&1

# Log system diagnostics silently to log file only
{
  echo "=== InterBrain Installation Log ==="
  echo "Date: $(date)"
  echo "OS: $(uname -s) $(uname -r)"
  echo "Architecture: $(uname -m)"
  echo "Shell: $SHELL"
  echo "User: $USER"
  echo "Interactive: $([ -t 0 ] && echo 'Yes' || echo 'No (piped)')"
  echo "===================================="
  echo ""
} >> "$LOG_FILE" 2>&1

echo "🚀 InterBrain Installation Script"
echo "=================================="
echo ""

# Color output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Total number of steps (updated for new steps)
TOTAL_STEPS=15

# Default vault name and location
DEFAULT_VAULT_NAME="DreamVault"
DEFAULT_VAULT_PARENT="$HOME"

# Parse command-line arguments
CLONE_URI=""
TEST_FAIL=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --uri)
      CLONE_URI="$2"
      shift 2
      ;;
    --test-fail)
      TEST_FAIL="$2"
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

# Function to sanitize log (remove sensitive data)
sanitize_log() {
    cat "$LOG_FILE" | \
        sed "s|$HOME|~|g" | \
        sed "s|$USER|<USER>|g" | \
        sed -E 's/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,})/[EMAIL]/g' | \
        sed -E 's/(api[_-]?key|token|secret|password|passphrase)[:=][[:space:]]*[^ ]+/\1=<REDACTED>/gi'
}

# Function to copy log to clipboard
copy_to_clipboard() {
    local copied=false

    # Sanitize before copying
    SANITIZED_LOG=$(sanitize_log)

    if command_exists pbcopy; then
        echo "$SANITIZED_LOG" | pbcopy && copied=true
    elif command_exists xclip; then
        echo "$SANITIZED_LOG" | xclip -selection clipboard && copied=true
    elif command_exists xsel; then
        echo "$SANITIZED_LOG" | xsel --clipboard --input && copied=true
    elif command_exists clip.exe; then
        echo "$SANITIZED_LOG" | clip.exe && copied=true
    fi

    if [ "$copied" = true ]; then
        success "Installation log copied to clipboard!"
        echo ""
        info "Please paste it in a new issue at:"
        info "https://github.com/ProjectLiminality/InterBrain/issues/new"
    else
        warning "Could not copy to clipboard automatically."
        echo ""
        info "You can manually copy the log from:"
        info "  $LOG_FILE"
    fi
}

# Function to create GitHub issue
create_github_issue() {
    if ! command_exists gh; then
        warning "GitHub CLI ('gh') not installed yet."
        echo ""
        info "Install complete and this error will be reportable via GitHub CLI"
        echo ""
        copy_to_clipboard
        return
    fi

    # Check if gh is authenticated
    if ! gh auth status >/dev/null 2>&1; then
        warning "GitHub CLI not authenticated yet."
        echo ""
        info "Complete the installation and authenticate, then you can report issues directly"
        echo ""
        copy_to_clipboard
        return
    fi

    info "Creating GitHub issue with installation log..."

    # Sanitize log (remove sensitive data)
    SANITIZED_LOG=$(sanitize_log)

    gh issue create \
        --repo ProjectLiminality/InterBrain \
        --title "Install failed on $(uname -s) $(uname -r)" \
        --label "installation,bug" \
        --body "$(cat <<EOF
## Installation Error Report

**Generated**: $(date)
**OS**: $(uname -s) $(uname -r)
**Architecture**: $(uname -m)
**Shell**: $SHELL

---

## Installation Log

\`\`\`bash
$SANITIZED_LOG
\`\`\`

---

**Note**: Sensitive information has been automatically sanitized from this log.
EOF
)"

    if [ $? -eq 0 ]; then
        success "GitHub issue created!"
        echo ""
        info "Thank you for reporting this issue. We'll investigate and improve the installer."
    else
        error "Failed to create issue. Falling back to clipboard..."
        copy_to_clipboard
    fi
}

# Error handler
handle_error() {
    local exit_code=$1
    local line_number=$2

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    error "Installation failed at line $line_number"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "📋 Installation log saved to:"
    echo "   $LOG_FILE"
    echo ""
    echo "💡 You can safely rerun this script - it won't destroy existing data"
    echo ""

    # Only offer interactive feedback if terminal attached
    if [ -t 0 ]; then
        echo "Would you like to report this issue?"
        echo ""
        echo "  1) Create GitHub issue (if gh CLI is set up)"
        echo "  2) Copy log to clipboard"
        echo "  3) Just show me the log location"
        echo ""
        read -p "Choose [1/2/3]: " choice
        echo ""

        case $choice in
            1) create_github_issue ;;
            2) copy_to_clipboard ;;
            3) echo ""; info "Log: $LOG_FILE" ;;
            *) echo ""; info "No option selected. Log: $LOG_FILE" ;;
        esac
    else
        echo "To report this issue:"
        echo "  1) View log: cat $LOG_FILE"
        echo "  2) File issue: https://github.com/ProjectLiminality/InterBrain/issues"
    fi

    exit $exit_code
}

# Trap errors
trap 'handle_error $? $LINENO' ERR

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

    # For Radicle specifically, also update current shell's hash table
    if [ -d "$HOME/.radicle/bin" ]; then
        export PATH="$HOME/.radicle/bin:$PATH"
        hash -r 2>/dev/null || true
    fi

    # Source shell profile if it exists
    if [ -f "$HOME/.zshrc" ]; then
        source "$HOME/.zshrc" 2>/dev/null || true
    elif [ -f "$HOME/.bashrc" ]; then
        source "$HOME/.bashrc" 2>/dev/null || true
    elif [ -f "$HOME/.bash_profile" ]; then
        source "$HOME/.bash_profile" 2>/dev/null || true
    fi
}

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1/$TOTAL_STEPS: Checking prerequisites"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check for Homebrew (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    if ! command_exists brew; then
        warning "Homebrew not found."
        echo ""

        # Check if Xcode CLI tools are installed
        if ! xcode-select -p &>/dev/null; then
            info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            info "📦 Xcode Command Line Tools Required"
            info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo ""
            echo "Homebrew requires Xcode Command Line Tools to build packages."
            echo ""
            echo "Download details:"
            echo "  • Size: ~700 MB"
            echo "  • Time: 5-15 minutes (depending on connection)"
            echo "  • Required: Yes (cannot skip)"
            echo ""
            info "The download will begin automatically. Please be patient..."
            echo ""
            sleep 3  # Give user time to read
        fi

        if [ -t 0 ]; then
            # Interactive mode - proceed with installation
            echo "Installing Homebrew..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        else
            # Non-interactive mode - provide instructions
            echo ""
            error "Cannot install Homebrew in non-interactive mode (requires password)."
            echo ""
            echo "📋 Please run this command in your terminal:"
            echo ""
            echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
            echo ""
            echo "Then run the InterBrain installer again:"
            echo '  curl -fsSL https://raw.githubusercontent.com/ProjectLiminality/InterBrain/main/install.sh | bash'
            echo ""
            exit 1
        fi

        # Add Homebrew to PATH based on architecture
        if [[ $(uname -m) == 'arm64' ]]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
            echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        else
            eval "$(/usr/local/bin/brew shellenv)"
            echo 'eval "$(/usr/local/bin/brew shellenv)"' >> ~/.bash_profile
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

# TEST: Simulate failure before GitHub CLI (no gh available for issue creation)
if [ "$TEST_FAIL" = "before-gh" ]; then
    error "TEST FAILURE: Simulating error before GitHub CLI installation"
    false  # This triggers the ERR trap properly
fi

# Check for GitHub CLI
if ! command_exists gh; then
    echo "Installing GitHub CLI..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install gh
        refresh_shell_env
    else
        # Linux installation
        curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
        sudo apt update && sudo apt install gh
    fi

    # Verify it's accessible
    if command_exists gh; then
        success "GitHub CLI installed ($(gh --version | head -1))"
    else
        warning "GitHub CLI installed but not yet available in PATH"
        info "It will be available after restarting your terminal"
    fi
else
    success "GitHub CLI found ($(gh --version | head -1))"
fi

# Check for Radicle
RADICLE_AVAILABLE=true
if ! command_exists rad; then
    echo "Installing Radicle..."
    curl -sSf https://radicle.xyz/install | sh

    # Aggressively ensure rad is in PATH
    export PATH="$HOME/.radicle/bin:$PATH"
    hash -r 2>/dev/null || true
    refresh_shell_env

    # Verify it's actually available
    if command_exists rad; then
        success "Radicle installed and available ($(rad --version))"
    else
        warning "Radicle installed but not immediately available in PATH"
        info "The 'rad' command will be available after restarting your terminal"
        info "You can rerun this installer after restart to complete Radicle setup"
        RADICLE_AVAILABLE=false
    fi
else
    success "Radicle found ($(rad --version))"
fi

# Check for Obsidian
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo ""
    echo "Step 2/$TOTAL_STEPS: Checking for Obsidian..."
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
echo "Step 3/$TOTAL_STEPS: Setting up vault..."
echo "----------------------------"

# Vault setup for InterBrain
if [ -t 0 ]; then
    # Interactive mode - let user name their vault
    echo ""
    info "InterBrain works best in a dedicated vault (not mixed with regular notes)"
    echo ""
    read -p "Vault name (press Enter for default '$DEFAULT_VAULT_NAME'): " VAULT_NAME
    VAULT_NAME=${VAULT_NAME:-$DEFAULT_VAULT_NAME}

    VAULT_PATH="$DEFAULT_VAULT_PARENT/$VAULT_NAME"
else
    # Non-interactive mode - use defaults
    VAULT_NAME="$DEFAULT_VAULT_NAME"
    VAULT_PATH="$DEFAULT_VAULT_PARENT/$DEFAULT_VAULT_NAME"
    info "Non-interactive mode: Creating vault at $VAULT_PATH"
fi

# Check if vault already exists
if [ -d "$VAULT_PATH" ]; then
    # Vault exists - check if it's an InterBrain vault
    INTERBRAIN_PLUGIN_PATH="$VAULT_PATH/.obsidian/plugins/interbrain"

    if [ -L "$INTERBRAIN_PLUGIN_PATH" ] || [ -d "$INTERBRAIN_PLUGIN_PATH" ]; then
        # It's an InterBrain vault - safe to proceed
        success "Found existing InterBrain vault: $VAULT_PATH"
        info "Re-running setup to ensure everything is up to date..."
    else
        # It's an existing vault but NOT an InterBrain vault
        echo ""
        warning "Vault '$VAULT_NAME' already exists but is not an InterBrain vault"
        echo ""
        echo "⚠️  IMPORTANT: InterBrain works best in a dedicated vault."
        echo ""
        echo "Installing InterBrain into an existing vault with regular notes"
        echo "is not recommended. InterBrain uses a fundamentally different"
        echo "approach to knowledge management."
        echo ""
        info "Recommended approach:"
        echo "  1. Use a fresh vault for InterBrain (choose a different name)"
        echo "  2. Gradually migrate meaningful knowledge into your InterBrain vault"
        echo ""

        if [ -t 0 ]; then
            read -p "Continue anyway? [y/N]: " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo ""
                info "Installation cancelled. Please rerun with a different vault name."
                exit 0
            fi
            echo ""
            warning "Proceeding with existing vault (not recommended)..."
        else
            echo ""
            error "Cannot proceed in non-interactive mode with existing non-InterBrain vault"
            echo ""
            echo "Please either:"
            echo "  1. Run interactively and choose a different vault name"
            echo "  2. Remove or rename the existing vault at: $VAULT_PATH"
            echo ""
            exit 1
        fi
    fi
else
    # New vault - create it
    mkdir -p "$VAULT_PATH"
    success "Created new InterBrain vault: $VAULT_PATH"
fi

# Create .obsidian directory structure if it doesn't exist
mkdir -p "$VAULT_PATH/.obsidian/plugins"

echo ""
echo "Step 4/$TOTAL_STEPS: Cloning InterBrain..."
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

# Now parse .gitignore and create Obsidian config (after InterBrain is cloned)
info "Configuring Obsidian vault exclusions from .gitignore..."

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

# Only create/update app.json if it doesn't exist or .gitignore is newer
if [ ! -f "$VAULT_PATH/.obsidian/app.json" ] || [ "$GITIGNORE_PATH" -nt "$VAULT_PATH/.obsidian/app.json" ]; then
    # Create app.json with parsed filters
    cat > "$VAULT_PATH/.obsidian/app.json" << EOF
{
  "showLineNumber": true,
  "spellcheck": true,
  "promptDelete": false,
  "userIgnoreFilters": $FILTERS
}
EOF
    success "Created Obsidian config with $(echo "$FILTERS" | grep -o "InterBrain/" | wc -l | tr -d ' ') exclusion patterns"
else
    success "Obsidian config already up to date"
fi

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
echo "Step 5/$TOTAL_STEPS: Building plugin..."
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
echo "Step 6/$TOTAL_STEPS: Installing InterBrain theme..."
echo "---------------------------------------"

# Copy theme CSS to snippets directory
if [ -f "$INTERBRAIN_PATH/theme/interbrain.css" ]; then
    cp "$INTERBRAIN_PATH/theme/interbrain.css" "$VAULT_PATH/.obsidian/snippets/"
    success "InterBrain theme installed"
else
    warning "Theme file not found, skipping theme installation"
fi

echo ""
echo "Step 7/$TOTAL_STEPS: Installing Ollama for semantic search..."
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

    # Ensure Ollama service is running on macOS (only if installed via Homebrew)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # Check if Ollama was installed via Homebrew
        if brew list ollama &>/dev/null; then
            # Installed via Homebrew - manage with brew services
            if ! brew services list | grep -q "ollama.*started"; then
                info "Starting Ollama service..."
                brew services start ollama
            fi
        else
            # Installed via other method - check if running manually
            if ! pgrep -x "ollama" > /dev/null; then
                warning "Ollama installed but not running"
                info "Start it manually if needed (it may already be running as a service)"
            fi
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
echo "Step 8/$TOTAL_STEPS: Linking plugin to vault..."
echo "-----------------------------------"

PLUGINS_DIR="$VAULT_PATH/.obsidian/plugins"
mkdir -p "$PLUGINS_DIR"

SYMLINK_PATH="$PLUGINS_DIR/InterBrain"

# Remove old symlink if exists
if [ -L "$SYMLINK_PATH" ]; then
    rm "$SYMLINK_PATH"
    warning "Removed old symlink"
fi

# Create symlink
ln -s "$INTERBRAIN_PATH" "$SYMLINK_PATH"
success "Symlink created: $SYMLINK_PATH → $INTERBRAIN_PATH"

echo ""
echo "Step 9/$TOTAL_STEPS: GitHub account & authentication..."
echo "-------------------------------------------"

# Check if already authenticated
if gh auth status >/dev/null 2>&1; then
    success "GitHub CLI already authenticated"
    GH_USER=$(gh api user -q .login 2>/dev/null || echo "Unknown")
    echo "   Logged in as: $GH_USER"
else
    warning "GitHub CLI not authenticated"
    echo ""
    info "InterBrain uses GitHub for:"
    info "  • Collaborative DreamNode sharing"
    info "  • Version control and backups"
    info "  • Community features"
    echo ""

    if [ -t 0 ]; then
        # Interactive mode - offer authentication
        echo "Do you have a GitHub account?"
        echo ""
        echo "  1) Yes - Log in now"
        echo "  2) No - Create account and log in"
        echo "  3) Skip - I'll do this later"
        echo ""
        read -p "Choose [1/2/3]: " -n 1 gh_choice
        echo ""
        echo ""

        case $gh_choice in
            1)
                info "Starting GitHub authentication flow..."
                echo ""
                gh auth login -h github.com -p https -w

                if gh auth status >/dev/null 2>&1; then
                    success "GitHub authenticated successfully"
                    GH_USER=$(gh api user -q .login 2>/dev/null || echo "Unknown")
                    echo "   Logged in as: $GH_USER"
                else
                    warning "Authentication incomplete"
                    info "You can complete it later with: gh auth login"
                    info "Or rerun this installer - it's safe and non-destructive"
                    GH_USER="[Not authenticated]"
                fi
                ;;
            2)
                info "Opening GitHub signup page in your browser..."
                echo ""

                # Open signup page
                if [[ "$OSTYPE" == "darwin"* ]]; then
                    open "https://github.com/signup"
                elif command_exists xdg-open; then
                    xdg-open "https://github.com/signup"
                fi

                echo "After creating your account, press Enter to authenticate GitHub CLI..."
                read -p ""

                # Now run auth flow
                gh auth login -h github.com -p https -w

                if gh auth status >/dev/null 2>&1; then
                    success "GitHub account created and authenticated!"
                    GH_USER=$(gh api user -q .login 2>/dev/null || echo "Unknown")
                    echo "   Logged in as: $GH_USER"
                else
                    warning "Authentication incomplete"
                    info "You can complete it later with: gh auth login"
                    info "Or rerun this installer - it's safe and non-destructive"
                    GH_USER="[Not authenticated]"
                fi
                ;;
            3)
                info "Skipping GitHub authentication"
                info "You can authenticate later with: gh auth login"
                info "Or rerun this installer - it's safe and non-destructive"
                GH_USER="[Not authenticated]"
                ;;
            *)
                info "Invalid choice - skipping authentication"
                GH_USER="[Not authenticated]"
                ;;
        esac
    else
        # Non-interactive mode
        info "Non-interactive mode: Skipping GitHub authentication"
        echo ""
        info "To authenticate later, run: gh auth login"
        info "Or rerun this installer in an interactive terminal"
        GH_USER="[Not authenticated]"
    fi
fi

# TEST: Simulate failure after GitHub CLI installed (gh available for issue creation)
if [ "$TEST_FAIL" = "after-gh" ]; then
    error "TEST FAILURE: Simulating error after GitHub CLI installation"
    echo ""
    info "This should offer GitHub issue creation if gh is installed and authenticated"
    false  # This triggers the ERR trap properly
fi

echo ""
echo "Step 10/$TOTAL_STEPS: Radicle identity setup..."
echo "-----------------------------------"

# Only proceed if Radicle is available
if [ "$RADICLE_AVAILABLE" = false ]; then
    warning "Radicle not available in current session - skipping for now"
    info "Open a new terminal and rerun this script to complete Radicle setup"
    info "The installer is safe to run multiple times - it won't destroy data"
    RAD_DID="[Open new terminal and rerun installer]"
    RAD_ALIAS="[Not created]"
elif rad self --did >/dev/null 2>&1; then
    # Identity already exists
    success "Radicle identity already exists"
    RAD_DID=$(rad self --did)
    RAD_ALIAS=$(rad self --alias 2>/dev/null || echo "Unknown")
    echo "   DID: $RAD_DID"
    echo "   Alias: $RAD_ALIAS"
else
    # No identity - offer to create
    warning "No Radicle identity found"
    echo ""
    info "Radicle identity enables peer-to-peer collaboration."
    echo ""
    echo "You will be asked to:"
    echo "  1. Enter an alias (your name or nickname)"
    echo "  2. Create a passphrase (keep this safe!)"
    echo ""

    if [ -t 0 ]; then
        # Interactive mode - offer choice
        read -p "Create Radicle identity now? [Y/n] (you can skip and rerun installer later): " -n 1 -r
        echo ""
        echo ""

        if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
            rad auth

            if rad self --did >/dev/null 2>&1; then
                success "Radicle identity created"
                RAD_DID=$(rad self --did)
                RAD_ALIAS=$(rad self --alias 2>/dev/null || echo "Unknown")
                echo "   DID: $RAD_DID"
                echo "   Alias: $RAD_ALIAS"
            else
                warning "Identity creation incomplete"
                info "You can create it later with: rad auth"
                info "Or rerun this installer - it's safe and non-destructive"
                RAD_DID="[Run 'rad auth' to create]"
                RAD_ALIAS="[Not created]"
            fi
        else
            info "Skipping Radicle identity creation"
            info "You can create it later with: rad auth"
            info "Or rerun this installer - it's safe and non-destructive"
            RAD_DID="[Run 'rad auth' to create]"
            RAD_ALIAS="[Not created]"
        fi
    else
        # Non-interactive mode
        info "Non-interactive mode: Skipping Radicle identity creation"
        info "Run this command after installation: rad auth"
        info "Or rerun installer in interactive terminal"
        RAD_DID="[Run 'rad auth' to create]"
        RAD_ALIAS="[Not created]"
    fi
fi

echo ""
echo "Step 11/$TOTAL_STEPS: Starting Radicle node..."
echo "----------------------------------"

# Only attempt if Radicle is available and identity exists
if [ "$RADICLE_AVAILABLE" = false ]; then
    info "Skipping Radicle node (rad command not available yet)"
    info "Rerun installer after opening new terminal to complete setup"
elif [[ "$RAD_DID" == "["* ]]; then
    info "Skipping Radicle node (no identity created yet)"
    info "Create identity with 'rad auth' then start node with 'rad node start'"
else
    # Check if node is already running
    if rad node status 2>/dev/null | grep -qi "running"; then
        success "Radicle node already running"
    else
        echo "Starting Radicle node..."
        if rad node start 2>/dev/null; then
            sleep 2
            success "Radicle node started"
        else
            warning "Could not start Radicle node automatically"
            info "You can start it manually with: rad node start"
        fi
    fi
fi

echo ""
echo "Step 12/$TOTAL_STEPS: Setting up real-time transcription (Python + Whisper)..."
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
echo "Step 13/$TOTAL_STEPS: Final verification..."
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

if [ "$RADICLE_AVAILABLE" = true ]; then
    if rad node status 2>/dev/null | grep -qi "running"; then
        success "Radicle node running"
    else
        warning "Radicle node not running (start with: rad node start)"
    fi
else
    warning "Radicle not available (rerun installer after opening new terminal)"
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

if gh auth status >/dev/null 2>&1; then
    success "GitHub CLI authenticated"
else
    warning "GitHub CLI not authenticated (run: gh auth login)"
fi

echo ""
echo "Step 14/$TOTAL_STEPS: Registering vault with Obsidian..."
echo "-----------------------------"

if [[ "$OSTYPE" == "darwin"* ]] && [ "$OBSIDIAN_INSTALLED" = true ]; then
    # Kill Obsidian if running so it can read the updated config
    if pgrep -x "Obsidian" > /dev/null; then
        info "Closing Obsidian to update vault registry..."
        killall Obsidian 2>/dev/null || true
        sleep 1
    fi

    # Register vault in Obsidian's obsidian.json file
    OBSIDIAN_CONFIG="$HOME/Library/Application Support/obsidian/obsidian.json"

    # Create config directory if it doesn't exist
    mkdir -p "$HOME/Library/Application Support/obsidian"

    # Generate a random vault ID (16 character hex)
    VAULT_ID=$(openssl rand -hex 8)

    # Get current timestamp in milliseconds
    TIMESTAMP=$(date +%s)000

    if [ -f "$OBSIDIAN_CONFIG" ]; then
        # File exists - add vault to existing config using Python
        python3 << EOF
import json
import sys

config_file = "$OBSIDIAN_CONFIG"
vault_id = "$VAULT_ID"
vault_path = "$VAULT_PATH"
timestamp = $TIMESTAMP

try:
    with open(config_file, 'r') as f:
        config = json.load(f)
except:
    config = {"vaults": {}}

# Ensure vaults key exists
if "vaults" not in config:
    config["vaults"] = {}

# Add new vault
config["vaults"][vault_id] = {
    "path": vault_path,
    "ts": timestamp,
    "open": True
}

# Write back
with open(config_file, 'w') as f:
    json.dump(config, f)

print("Vault registered successfully")
EOF
        success "Vault registered in Obsidian"
    else
        # File doesn't exist - create new config
        cat > "$OBSIDIAN_CONFIG" << EOF
{"vaults":{"$VAULT_ID":{"path":"$VAULT_PATH","ts":$TIMESTAMP,"open":true}}}
EOF
        success "Created Obsidian config and registered vault"
    fi

    # Now open Obsidian with the vault by name (now that it's registered)
    info "Opening Obsidian with your vault..."

    # Extract vault name for URI
    VAULT_NAME=$(basename "$VAULT_PATH")

    # Give Obsidian time to fully restart and read the new config
    sleep 2

    # Open by vault name now that it's registered
    open "obsidian://open?vault=${VAULT_NAME}"
    success "Obsidian launched with vault: $VAULT_NAME"

    # If a clone URI was provided, trigger it after Obsidian loads
    if [ -n "$CLONE_URI" ]; then
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        info "🎯 Personalized Installation Detected"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "Waiting for InterBrain plugin to activate..."
        echo ""

        # Wait for plugin to load (much shorter now that vault opens properly)
        for i in {5..1}; do
            printf "\r   Triggering clone in %d seconds...  " $i
            sleep 1
        done
        echo ""
        echo ""

        # Extract vault name from path and add it to the URI
        VAULT_NAME=$(basename "$VAULT_PATH")

        # Add vault parameter to ensure URI goes to correct vault
        if [[ "$CLONE_URI" == *"?"* ]]; then
            # URI already has parameters, append with &
            MODIFIED_URI="${CLONE_URI}&vault=${VAULT_NAME}"
        else
            # URI has no parameters, add with ?
            MODIFIED_URI="${CLONE_URI}?vault=${VAULT_NAME}"
        fi

        info "Triggering clone URI for vault: $VAULT_NAME"
        open "$MODIFIED_URI"
        success "Clone URI triggered!"
        echo ""
        info "The clone operation is now running in the background."
        info "Watch for notifications in Obsidian about the clone progress."
        echo ""
        info "If you see 'vault not found', please:"
        info "  1. Wait a few more seconds for Obsidian to fully load"
        info "  2. Manually trigger the clone URI again from your email/link"
    fi

    echo ""
    info "Obsidian should be running. If not, open Obsidian and select:"
    info "  $VAULT_PATH"
fi

echo ""
echo "Step 15/$TOTAL_STEPS: Installation summary..."
echo "-------------------------------"

echo ""
echo "=================================="
if [ "$ALL_GOOD" = true ]; then
    echo -e "${GREEN}✅ Installation complete!${NC}"
else
    echo -e "${YELLOW}⚠️  Installation complete with optional steps remaining${NC}"
fi
echo "=================================="
echo ""

if [ -n "$CLONE_URI" ]; then
    echo "🎯 Personalized installation detected!"
    echo ""
    echo "The clone operation has been triggered automatically."
    echo "Your collaborator's DreamNodes and Dreamer profile will appear in InterBrain."
    echo ""
fi

echo "📋 Installation log saved to: $LOG_FILE"
echo ""

echo "Next steps:"
echo "1. In Obsidian: Click 'Trust author and enable plugins' when prompted"
echo "2. Look for the InterBrain icon (🧠) in the left ribbon"
echo "3. Use Command+R to reload the plugin during development"
echo "4. Run 'Full Index' command to enable semantic search"
if [ -z "$CLONE_URI" ]; then
    echo "5. Click Clone URIs from your email to add DreamNodes"
fi
echo ""

# Show authentication status
if [[ "$GH_USER" == "["* ]]; then
    warning "GitHub not authenticated - run: gh auth login"
    echo "   (Or rerun installer - it's safe to run multiple times)"
fi

if [[ "$RAD_DID" == "["* ]]; then
    warning "Radicle identity not created - run: rad auth"
    echo "   (Or rerun installer - it's safe to run multiple times)"
fi

if [ "$RADICLE_AVAILABLE" = false ]; then
    warning "Radicle not available in PATH yet"
    info "Open a new terminal and rerun this script to complete Radicle setup"
fi

echo ""
echo "⚙️  IMPORTANT: Configure settings for full functionality:"
echo ""
echo "In Obsidian Settings → InterBrain:"
echo ""
echo "• Anthropic API Key - Required for AI features:"
echo "  - Get your key from: https://console.anthropic.com/settings/keys"
echo "  - Used for conversation summaries and other LLM magic"
echo ""
echo "• Radicle Passphrase - Required for seamless Radicle operations:"
echo "  - This is the passphrase you created during 'rad auth'"
echo "  - Enables automatic peer-to-peer syncing without password prompts"
echo "  - Note: Stored locally in Obsidian's secure storage"
echo ""

if [[ "$RAD_DID" != "["* ]]; then
    echo "Your Radicle identity:"
    echo "   DID: $RAD_DID"
    echo "   Alias: $RAD_ALIAS"
    echo ""
    echo "Share your DID with collaborators so they can follow you!"
    echo ""
fi

if [[ "$GH_USER" != "["* ]]; then
    echo "Your GitHub account:"
    echo "   Username: $GH_USER"
    echo ""
fi

echo "💡 Remember: This installer is safe to run multiple times!"
echo "   It won't destroy existing data or configurations."
echo ""

echo "Happy dreaming! 🌙✨"
echo ""
