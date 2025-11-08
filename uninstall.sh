#!/bin/bash
# InterBrain Uninstall Script
# For macOS/Linux systems
#
# Usage:
#   bash uninstall.sh

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

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Uninstall complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

success "InterBrain dependencies removed"
echo ""
info "Your vault and DreamNodes are preserved at:"
info "  $DEFAULT_VAULT_PARENT/$DEFAULT_VAULT_NAME"
echo ""
info "To reinstall InterBrain, run:"
info "  bash <(curl -fsSL https://raw.githubusercontent.com/ProjectLiminality/InterBrain/main/install.sh)"
echo ""
