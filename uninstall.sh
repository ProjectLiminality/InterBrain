#!/bin/bash
# InterBrain Uninstall Script
# For macOS/Linux systems
#
# Usage:
#   bash uninstall.sh              # Normal mode (preserves shared dependencies)
#   bash uninstall.sh --full       # Nuclear mode (removes everything, including vault)

# Parse command-line arguments
FULL_UNINSTALL=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --full)
      FULL_UNINSTALL=true
      shift
      ;;
    *)
      shift
      ;;
  esac
done

echo "🗑️  InterBrain Uninstall Script"
echo "=================================="
echo ""

# Color output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
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

# Function to print info
info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

if [ "$FULL_UNINSTALL" = true ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    error "⚠️  NUCLEAR MODE: FULL UNINSTALL ⚠️"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    warning "This will remove EVERYTHING:"
    echo "  • All InterBrain dependencies (gh, rad, ollama, python venv)"
    echo "  • Homebrew"
    echo "  • Git"
    echo "  • Node.js"
    echo "  • Obsidian"
    echo "  • Your entire vault and all DreamNodes (DATA LOSS!)"
    echo ""
    error "This is intended ONLY for testing fresh installations!"
    echo ""
else
    echo "This will uninstall InterBrain dependencies:"
    echo "  • GitHub CLI (gh)"
    echo "  • Radicle (rad)"
    echo "  • Ollama"
    echo "  • Python dependencies (whisper_streaming virtual environment)"
    echo ""
    warning "This will NOT uninstall:"
    echo "  • Homebrew (shared with other apps)"
    echo "  • Git (shared with other apps)"
    echo "  • Node.js (shared with other apps)"
    echo "  • Obsidian (shared with other apps)"
    echo "  • Your vault or DreamNodes (data is preserved)"
    echo ""
    info "For complete removal (testing only), use: bash uninstall.sh --full"
    echo ""
fi

if [ -t 0 ]; then
    read -p "Continue with uninstall? [y/N]: " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        info "Uninstall cancelled."
        exit 0
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Starting uninstall process..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Uninstall GitHub CLI
echo "1. Uninstalling GitHub CLI..."
if command_exists gh; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew uninstall gh 2>/dev/null && success "GitHub CLI uninstalled" || warning "GitHub CLI uninstall failed (may not be installed via Homebrew)"
    else
        sudo apt remove gh -y 2>/dev/null && success "GitHub CLI uninstalled" || warning "GitHub CLI uninstall failed"
    fi
else
    info "GitHub CLI not installed, skipping"
fi

# Uninstall Radicle
echo ""
echo "2. Uninstalling Radicle..."
if command_exists rad; then
    # Stop Radicle node if running
    if rad node status 2>/dev/null | grep -qi "running"; then
        info "Stopping Radicle node..."
        rad node stop 2>/dev/null || true
    fi

    # Remove Radicle installation
    if [ -d "$HOME/.radicle" ]; then
        rm -rf "$HOME/.radicle"
        success "Radicle uninstalled"
    else
        warning "Radicle directory not found"
    fi
else
    info "Radicle not installed, skipping"
fi

# Uninstall Ollama
echo ""
echo "3. Uninstalling Ollama..."
if command_exists ollama; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # Stop Ollama service if running via Homebrew
        if brew list ollama &>/dev/null; then
            brew services stop ollama 2>/dev/null || true
            brew uninstall ollama 2>/dev/null && success "Ollama uninstalled" || warning "Ollama uninstall failed"
        else
            warning "Ollama installed but not via Homebrew - manual removal required"
            info "Remove Ollama manually: rm -rf ~/.ollama"
        fi
    else
        # Linux - remove Ollama directory
        if [ -d "$HOME/.ollama" ]; then
            rm -rf "$HOME/.ollama"
            success "Ollama uninstalled"
        fi
    fi
else
    info "Ollama not installed, skipping"
fi

# Remove Python virtual environment for transcription
echo ""
echo "4. Removing Python transcription environment..."
DEFAULT_VAULT_NAME="DreamVault"
DEFAULT_VAULT_PARENT="$HOME"

# Try to find InterBrain installation
POSSIBLE_PATHS=(
    "$DEFAULT_VAULT_PARENT/$DEFAULT_VAULT_NAME/InterBrain"
    "$HOME/DreamVault/InterBrain"
    "$(pwd)"
)

TRANSCRIPTION_DIR=""
for path in "${POSSIBLE_PATHS[@]}"; do
    if [ -d "$path/src/features/realtime-transcription/scripts/venv" ]; then
        TRANSCRIPTION_DIR="$path/src/features/realtime-transcription/scripts"
        break
    fi
done

if [ -n "$TRANSCRIPTION_DIR" ]; then
    rm -rf "$TRANSCRIPTION_DIR/venv"
    success "Python transcription environment removed"
else
    info "Python transcription environment not found, skipping"
fi

# NUCLEAR MODE: Remove shared dependencies and vault
if [ "$FULL_UNINSTALL" = true ]; then
    echo ""
    echo "5. Uninstalling Obsidian..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if [ -d "/Applications/Obsidian.app" ]; then
            # Kill Obsidian if running
            killall Obsidian 2>/dev/null || true
            sleep 1
            rm -rf "/Applications/Obsidian.app"
            success "Obsidian uninstalled"
        else
            info "Obsidian not found, skipping"
        fi

        # Remove Obsidian config
        if [ -d "$HOME/Library/Application Support/obsidian" ]; then
            rm -rf "$HOME/Library/Application Support/obsidian"
            success "Obsidian config removed"
        fi
    else
        warning "Non-macOS system - manually remove Obsidian if needed"
    fi

    echo ""
    echo "6. Uninstalling Node.js..."
    if command_exists node; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            brew uninstall node 2>/dev/null && success "Node.js uninstalled" || warning "Node.js uninstall failed"
        else
            sudo apt remove nodejs -y 2>/dev/null && success "Node.js uninstalled" || warning "Node.js uninstall failed"
        fi
    else
        info "Node.js not installed, skipping"
    fi

    echo ""
    echo "7. Uninstalling Git..."
    if command_exists git; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            brew uninstall git 2>/dev/null && success "Git uninstalled" || warning "Git uninstall failed"
        else
            sudo apt remove git -y 2>/dev/null && success "Git uninstalled" || warning "Git uninstall failed"
        fi
    else
        info "Git not installed, skipping"
    fi

    echo ""
    echo "8. Uninstalling Homebrew..."
    if [[ "$OSTYPE" == "darwin"* ]] && command_exists brew; then
        warning "Removing Homebrew (this may take a few minutes)..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/uninstall.sh)" -- --force
        success "Homebrew uninstalled"
    else
        info "Homebrew not installed or not on macOS, skipping"
    fi

    echo ""
    echo "9. Removing vault and all DreamNodes..."
    VAULT_PATH="$DEFAULT_VAULT_PARENT/$DEFAULT_VAULT_NAME"
    if [ -d "$VAULT_PATH" ]; then
        rm -rf "$VAULT_PATH"
        success "Vault removed: $VAULT_PATH"
    else
        info "Vault not found at default location, skipping"
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Uninstall complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$FULL_UNINSTALL" = true ]; then
    success "Complete system cleanup finished"
    echo ""
    warning "All InterBrain components and data have been removed"
    echo ""
    info "To reinstall from scratch, run:"
    info "  bash <(curl -fsSL https://raw.githubusercontent.com/ProjectLiminality/InterBrain/main/install.sh)"
else
    success "InterBrain dependencies removed"
    echo ""
    info "Your vault and DreamNodes are preserved at:"
    info "  $DEFAULT_VAULT_PARENT/$DEFAULT_VAULT_NAME"
    echo ""
    info "To reinstall InterBrain, run:"
    info "  bash <(curl -fsSL https://raw.githubusercontent.com/ProjectLiminality/InterBrain/main/install.sh)"
fi

echo ""
