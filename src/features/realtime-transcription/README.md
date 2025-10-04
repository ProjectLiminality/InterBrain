# Real-Time Transcription Feature

A self-contained feature for real-time speech transcription using whisper_streaming with LocalAgreement-2 policy.

## Overview

This feature provides seamless voice-to-text capture during conversations, meetings, and ideation sessions. Transcripts appear in markdown files with timestamps, ready for semantic search indexing and DreamNode integration.

## Architecture

- **Python CLI Script**: `scripts/interbrain-transcribe.py` - Captures and transcribes audio
- **TypeScript Service**: `services/transcription-service.ts` - Process management and path resolution
- **Obsidian Commands**: `commands/transcription-commands.ts` - Start/Stop commands
- **Zustand Store**: `store/transcription-store.ts` - State management for process lifecycle

## Installation

### Automated Setup (Recommended)

The feature includes setup scripts that create a **self-contained virtual environment** inside the feature directory. This keeps all Python dependencies isolated and modular.

**macOS/Linux:**
```bash
cd src/features/realtime-transcription/scripts
./setup.sh
```

**Windows:**
```cmd
cd src\features\realtime-transcription\scripts
setup.bat
```

This will:
1. Create a virtual environment at `scripts/venv/`
2. Install all Python dependencies locally
3. Download the whisper model on first transcription (~500MB)

### Manual Installation (Alternative)

If you prefer to use your system Python:

```bash
pip install -r src/features/realtime-transcription/scripts/requirements.txt
```

**Note**: The Obsidian plugin will **automatically detect and use** the virtual environment if it exists, otherwise it falls back to system Python.

## Usage

### Via Obsidian Commands

1. Open a markdown file in Obsidian
2. Run command: "Start Real-Time Transcription" (Ctrl+Shift+T)
3. Speak into your microphone
4. Run command: "Stop Real-Time Transcription" (Ctrl+Shift+T again)

### Direct CLI Usage

```bash
python3 src/features/realtime-transcription/scripts/interbrain-transcribe.py \
  --output "/path/to/transcript.md" \
  --model "small.en"
```

## Output Format

```markdown
[2025-10-03 14:32:15] Hello my name is David I'm working on InterBrain transcription system.

[2025-10-03 14:32:47] The whisper streaming library uses local agreement to prevent duplicates.

[2025-10-03 14:33:12] This is a seamless experience just like macOS native dictation.
```

## System Requirements

- **macOS**: 10.15+ (Apple Silicon preferred)
- **Windows**: 10+ (with Python 3.8+)
- **Linux**: Any modern distro (with Python 3.8+)
- **Python**: 3.8+
- **Microphone**: Any USB or built-in mic
- **Disk Space**: ~1GB (for whisper models)

## Performance Expectations

- **Latency**: ~3.3 seconds (whisper_streaming benchmark)
- **Accuracy**: Whisper-grade (best in class)
- **CPU**: <50% on Apple Silicon M1
- **Memory**: ~150-200MB for Python process

## Future Integration Points

- **Semantic Search**: Auto-index transcripts after session ends
- **Copilot Mode**: Real-time transcription during DreamSong creation
- **DreamWeaving**: Transcribe video calls for DreamSong content

## Related Issues

- Epic 7: #334 - Conversational Copilot System (parent epic)
- Feature: #335 - Real-Time Transcription System

## Technical References

- [whisper_streaming (UFAL)](https://github.com/ufal/whisper_streaming)
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp)
- [LocalAgreement Paper](https://arxiv.org/html/2307.14743)
