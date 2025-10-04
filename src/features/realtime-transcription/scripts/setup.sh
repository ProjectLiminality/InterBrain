#!/bin/bash
# Setup script for real-time transcription feature
# Creates a self-contained Python virtual environment

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/venv"

echo "🔧 Setting up Real-Time Transcription environment..."

# Check if Python 3 is available
if command -v python3 &> /dev/null; then
    PYTHON_CMD=python3
elif command -v python &> /dev/null; then
    PYTHON_CMD=python
else
    echo "❌ Python 3.8+ is required but not found."
    echo "Please install Python from https://www.python.org/downloads/"
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
pip install -r "$SCRIPT_DIR/requirements.txt"

echo ""
echo "✅ Setup complete!"
echo ""
echo "The transcription feature is now ready to use."
echo "Obsidian will automatically use the virtual environment."
echo ""
echo "To test manually:"
echo "  source $VENV_DIR/bin/activate"
echo "  python $SCRIPT_DIR/interbrain-transcribe.py --output test.md"
