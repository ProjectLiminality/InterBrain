#!/bin/bash
#
# InterBrain Web Link Analyzer - Python Environment Setup
#
# This script creates a virtual environment and installs the required
# dependencies for the AI-powered web link analysis feature.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/venv"

echo "================================================"
echo "InterBrain Web Link Analyzer Setup"
echo "================================================"
echo ""

# Check for Python 3
echo "Checking for Python 3..."

PYTHON_CMD=""
for cmd in python3.12 python3.11 python3.10 python3.9 python3; do
    if command -v "$cmd" &> /dev/null; then
        version=$("$cmd" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+')
        major=$(echo "$version" | cut -d. -f1)
        minor=$(echo "$version" | cut -d. -f2)
        if [ "$major" -eq 3 ] && [ "$minor" -ge 9 ]; then
            PYTHON_CMD="$cmd"
            echo "Found $cmd (version $version)"
            break
        fi
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    echo "ERROR: Python 3.9 or higher is required but not found."
    echo "Please install Python 3.9+ and try again."
    exit 1
fi

# Create virtual environment
echo ""
echo "Creating virtual environment..."

if [ -d "$VENV_DIR" ]; then
    echo "Removing existing venv..."
    rm -rf "$VENV_DIR"
fi

"$PYTHON_CMD" -m venv "$VENV_DIR"
echo "Virtual environment created at: $VENV_DIR"

# Activate and install dependencies
echo ""
echo "Installing dependencies..."

source "$VENV_DIR/bin/activate"

# Upgrade pip first
pip install --upgrade pip --quiet

# Install anthropic SDK
echo "Installing anthropic SDK..."
pip install anthropic --quiet

echo ""
echo "================================================"
echo "Setup complete!"
echo "================================================"
echo ""
echo "The web link analyzer is ready to use."
echo "Virtual environment: $VENV_DIR"
echo ""
