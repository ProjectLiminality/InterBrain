#!/bin/bash
# Wrapper script to run Python with correct library paths and PATH

# Set library path for gettext (required by mosestokenizer)
export DYLD_FALLBACK_LIBRARY_PATH="/opt/homebrew/opt/gettext/lib:$DYLD_FALLBACK_LIBRARY_PATH"

# Add Homebrew bin to PATH for ffmpeg (required for MP3 conversion)
export PATH="/opt/homebrew/bin:$PATH"

# Execute the Python script with all arguments passed through
exec "$@"
