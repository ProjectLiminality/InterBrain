#!/usr/bin/env python3
"""
InterBrain Real-Time Transcription CLI

A minimalist CLI tool for real-time speech transcription using RealtimeSTT
with faster-whisper backend. Appends timestamped transcripts to markdown files.

Usage:
    python3 interbrain-transcribe.py --output transcript.md
    python3 interbrain-transcribe.py --output transcript.md --model small.en
"""

import argparse
import signal
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

# Check for required dependencies
try:
    from RealtimeSTT import AudioToTextRecorder
except ImportError as e:
    print(f"❌ Missing dependency: {e}")
    print("Run: pip install -r requirements.txt")
    sys.exit(1)


class TranscriptionSession:
    """Manages a real-time transcription session."""

    def __init__(
        self,
        output_path: Path,
        model: str = "small.en",
        language: Optional[str] = None,
        start_time: Optional[float] = None,
    ):
        self.output_path = output_path
        self.model = model
        self.language = language
        self.running = False
        self.recorder = None

        # Use provided start time or current time for relative timestamps
        self.start_time = start_time if start_time is not None else time.time()

        # Set up signal handlers for graceful shutdown
        signal.signal(signal.SIGTERM, self._handle_shutdown)
        signal.signal(signal.SIGINT, self._handle_shutdown)

    def _handle_shutdown(self, signum, frame):
        """Handle shutdown signals gracefully."""
        print("\n🛑 Shutting down transcription...")
        self.stop()
        sys.exit(0)


    def _format_relative_time(self, elapsed_seconds: float) -> str:
        """Format elapsed time as MM:SS"""
        minutes = int(elapsed_seconds // 60)
        seconds = int(elapsed_seconds % 60)
        return f"{minutes}:{seconds:02d}"

    def _write_transcript(self, text: str):
        """Write transcribed text to output file with relative timestamp."""
        if not text or not text.strip():
            print("⚠️  Empty text, skipping write")
            return

        # Calculate elapsed time since session start
        elapsed = time.time() - self.start_time
        timestamp = self._format_relative_time(elapsed)
        line = f"[{timestamp}] {text.strip()}\n\n"

        try:
            with open(self.output_path, 'a', encoding='utf-8') as f:
                f.write(line)
                f.flush()  # Ensure immediate write
            print(f"✅ Transcribed: {text.strip()}")
        except Exception as e:
            print(f"❌ Error writing to file: {e}", file=sys.stderr)

    def start(self):
        """Start the transcription session."""
        print(f"🎙️  Starting transcription...")
        print(f"📝 Output: {self.output_path}")
        print(f"🤖 Model: {self.model}")
        print(f"💬 Speak into your microphone (Ctrl+C to stop)\n")

        try:
            # Initialize recorder with faster-whisper model
            print("⏳ Initializing recorder (may take time on first run to download model)...")

            recorder_config = {
                'model': self.model,
                'language': self.language or 'en',
                'no_log_file': True,  # Disable log file (prevents read-only filesystem errors on macOS)
                'silero_sensitivity': 0.4,  # Voice activity detection sensitivity
                'webrtc_sensitivity': 2,    # Additional VAD for better detection
                'post_speech_silence_duration': 0.2,  # Wait 200ms after speech ends (reduced for more frequent commits)
                'min_length_of_recording': 0.5,  # Minimum 500ms recording
                'min_gap_between_recordings': 0,  # No gap between recordings
                'level': 'WARNING',  # Reduce log verbosity
            }

            self.recorder = AudioToTextRecorder(**recorder_config)

            print("✅ Model loaded successfully")
            print("🎤 Listening for speech...")

            self.running = True

            # Blocking mode: recorder.text() waits for complete utterances
            while self.running:
                text = self.recorder.text()  # Blocks until speech is detected and transcribed

                # Write the final transcription to file
                if text and text.strip():
                    self._write_transcript(text)

        except KeyboardInterrupt:
            print("\n🛑 Stopped by user")
            self.stop()
        except Exception as e:
            print(f"❌ Transcription error: {e}", file=sys.stderr)
            self.stop()
            raise

    def stop(self):
        """Stop the transcription session."""
        self.running = False
        if self.recorder:
            try:
                self.recorder.shutdown()
            except Exception as e:
                print(f"⚠️  Error during shutdown: {e}", file=sys.stderr)
        print("✅ Transcription session ended")


def main():
    parser = argparse.ArgumentParser(
        description="Real-time speech transcription with RealtimeSTT"
    )
    parser.add_argument(
        '--output',
        type=str,
        required=True,
        help='Output markdown file path'
    )
    parser.add_argument(
        '--model',
        type=str,
        default='small.en',
        help='Whisper model size (default: small.en)'
    )
    parser.add_argument(
        '--language',
        type=str,
        default='en',
        help='Language code (default: en)'
    )
    parser.add_argument(
        '--device',
        type=str,
        help='Audio input device (not used with RealtimeSTT - uses default mic)'
    )
    parser.add_argument(
        '--start-time',
        type=float,
        help='Session start time (Unix timestamp) for relative timestamps'
    )

    args = parser.parse_args()

    # Validate output path
    output_path = Path(args.output)
    if not output_path.parent.exists():
        print(f"❌ Output directory does not exist: {output_path.parent}")
        sys.exit(1)

    # Create transcription session and start
    session = TranscriptionSession(
        output_path=output_path,
        model=args.model,
        language=args.language,
        start_time=args.start_time
    )

    try:
        session.start()
    except Exception as e:
        print(f"❌ Fatal error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
