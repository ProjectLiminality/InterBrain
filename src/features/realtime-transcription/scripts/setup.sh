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

# Create virtual environment if it doesn't exist or has incompatible Python
NEED_NEW_VENV=false
if [ ! -d "$VENV_DIR" ]; then
    NEED_NEW_VENV=true
else
    # Check if existing venv has compatible Python version
    VENV_PYTHON="$VENV_DIR/bin/python3"
    if [ -f "$VENV_PYTHON" ]; then
        VENV_VERSION=$("$VENV_PYTHON" --version 2>&1 | awk '{print $2}' | cut -d. -f1,2)
        case "$VENV_VERSION" in
            3.9|3.10|3.11|3.12)
                echo "✅ Virtual environment exists with compatible Python $VENV_VERSION"
                ;;
            *)
                echo "⚠️  Existing venv has incompatible Python $VENV_VERSION, recreating..."
                rm -rf "$VENV_DIR"
                NEED_NEW_VENV=true
                ;;
        esac
    else
        echo "⚠️  Existing venv is corrupted, recreating..."
        rm -rf "$VENV_DIR"
        NEED_NEW_VENV=true
    fi
fi

if [ "$NEED_NEW_VENV" = true ]; then
    echo "📦 Creating virtual environment with $PYTHON_CMD..."
    $PYTHON_CMD -m venv "$VENV_DIR"
    echo "✅ Virtual environment created at $VENV_DIR"
fi

# Activate virtual environment
source "$VENV_DIR/bin/activate"

# Upgrade pip
echo "📥 Upgrading pip..."
pip install --upgrade pip > /dev/null 2>&1

# Install dependencies
echo "📥 Installing dependencies..."

# Check for portaudio on macOS (required by RealtimeSTT)
if [[ "$OSTYPE" == "darwin"* ]]; then
    if ! brew list portaudio &> /dev/null; then
        echo "📦 Installing portaudio (required by RealtimeSTT)..."
        brew install portaudio
    fi
fi

# Install RealtimeSTT and dependencies
pip install RealtimeSTT numpy

echo ""
echo "📥 Pre-downloading Whisper model (small.en)..."
echo "This may take 1-2 minutes but saves time on first transcription..."
echo ""

# Pre-download the model by running a quick test
# Note: We write to a temp file instead of using heredoc because RealtimeSTT
# uses multiprocessing which fails when the script comes from stdin
TEMP_SCRIPT=$(mktemp /tmp/whisper_preload_XXXXXX.py)
cat > "$TEMP_SCRIPT" << 'PYTHON_SCRIPT'
import sys
try:
    from RealtimeSTT import AudioToTextRecorder

    print("⏳ Initializing Whisper model (small.en)...")

    # Initialize recorder with default model - this downloads it
    recorder = AudioToTextRecorder(
        model='small.en',
        language='en',
        compute_type='float32',
        no_log_file=True
    )

    print("✅ Model downloaded successfully!")

    # Shutdown recorder
    recorder.shutdown()

except Exception as e:
    print(f"⚠️  Model pre-download skipped: {e}")
    print("Model will download automatically on first transcription run")
    sys.exit(0)  # Don't fail the setup
PYTHON_SCRIPT

python3 "$TEMP_SCRIPT"
rm -f "$TEMP_SCRIPT"

echo ""
echo "✅ Setup complete!"
echo ""
echo "The transcription feature is now ready to use."
echo "Obsidian will automatically use the virtual environment."
echo "Whisper model (small.en) is pre-downloaded and ready."
echo ""
echo "To test manually:"
echo "  source $VENV_DIR/bin/activate"
echo "  python $SCRIPT_DIR/interbrain-transcribe.py --output test.md"
