#!/bin/bash
# Wrapper script to run Python with correct library paths for mosestokenizer

# Set library path for gettext (required by mosestokenizer)
export DYLD_FALLBACK_LIBRARY_PATH="/opt/homebrew/opt/gettext/lib:$DYLD_FALLBACK_LIBRARY_PATH"

# Execute the Python script with all arguments passed through
exec "$@"
