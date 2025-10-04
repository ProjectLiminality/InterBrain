#!/bin/bash
# Setup script for real-time transcription feature
# Creates a self-contained Python virtual environment

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/venv"

echo "🔧 Setting up Real-Time Transcription environment..."

# Check for gettext (required by mosestokenizer)
if ! command -v msgfmt &> /dev/null; then
    echo "📦 Installing gettext (required by mosestokenizer)..."
    if command -v brew &> /dev/null; then
        brew install gettext
    else
        echo "⚠️  gettext not found. Please install it manually:"
        echo "  macOS: brew install gettext"
        echo "  Ubuntu/Debian: sudo apt-get install gettext"
        exit 1
    fi
fi

# Check for compatible Python version (3.9-3.12 required by whisper-streaming)
if command -v python3.12 &> /dev/null; then
    PYTHON_CMD=python3.12
elif command -v python3.11 &> /dev/null; then
    PYTHON_CMD=python3.11
elif command -v python3.10 &> /dev/null; then
    PYTHON_CMD=python3.10
elif command -v python3.9 &> /dev/null; then
    PYTHON_CMD=python3.9
else
    echo "❌ Python 3.9-3.12 is required for whisper-streaming."
    echo "Found Python version:"
    python3 --version 2>&1 || echo "No python3 found"
    echo ""
    echo "Please install a compatible Python version:"
    echo "  brew install python@3.12"
    exit 1
fi

# Check Python version
PYTHON_VERSION=$($PYTHON_CMD --version 2>&1 | awk '{print $2}')
echo "📍 Found Python $PYTHON_VERSION"

# Create virtual environment if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
    echo "📦 Creating virtual environment..."
    $PYTHON_CMD -m venv "$VENV_DIR"
    echo "✅ Virtual environment created at $VENV_DIR"
else
    echo "✅ Virtual environment already exists"
fi

# Activate virtual environment
source "$VENV_DIR/bin/activate"

# Upgrade pip
echo "📥 Upgrading pip..."
pip install --upgrade pip > /dev/null 2>&1

# Install dependencies
echo "📥 Installing dependencies..."

# Install whisper-streaming without pyalsaaudio (Linux-only dependency)
pip install --no-deps whisper-streaming
pip install sounddevice numpy faster-whisper

# Install other dependencies
pip install librosa opus-fast-mosestokenizer websockets

echo ""
echo "✅ Setup complete!"
echo ""
echo "The transcription feature is now ready to use."
echo "Obsidian will automatically use the virtual environment."
echo ""
echo "To test manually:"
echo "  source $VENV_DIR/bin/activate"
echo "  python $SCRIPT_DIR/interbrain-transcribe.py --output test.md"
