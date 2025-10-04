#!/usr/bin/env python3
"""
InterBrain Real-Time Transcription CLI

A minimalist CLI tool for real-time speech transcription using whisper_streaming
with LocalAgreement-2 policy. Appends timestamped, duplicate-free transcripts
to markdown files.

Usage:
    python3 interbrain-transcribe.py --output transcript.md
    python3 interbrain-transcribe.py --output transcript.md --model small.en --device "MacBook Pro Microphone"
"""

import argparse
import signal
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

# Check for required dependencies
try:
    import numpy as np
    import sounddevice as sd
    from whisper_streaming import WhisperStreamingTranscriber
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
        device: Optional[str] = None,
        language: Optional[str] = None,
        sample_rate: int = 16000
    ):
        self.output_path = output_path
        self.model = model
        self.device = device
        self.language = language
        self.sample_rate = sample_rate
        self.running = False
        self.transcriber = None

        # Create output file and parent directories if needed
        self.output_path.parent.mkdir(parents=True, exist_ok=True)

        # Register signal handlers for graceful shutdown
        signal.signal(signal.SIGTERM, self._handle_shutdown)
        signal.signal(signal.SIGINT, self._handle_shutdown)

    def _handle_shutdown(self, signum, frame):
        """Handle shutdown signals gracefully."""
        print("\n⏹️  Transcription stopped")
        self.running = False
        sys.exit(0)

    def _append_transcript(self, text: str):
        """Append timestamped transcript to markdown file."""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        entry = f"[{timestamp}] {text}\n\n"

        try:
            with open(self.output_path, "a", encoding="utf-8") as f:
                f.write(entry)
            print(f"✅ {text}")
        except IOError as e:
            print(f"❌ Cannot write to {self.output_path}. {e}")
            sys.exit(1)

    def _on_transcription(self, segments):
        """Callback for whisper_streaming transcription events."""
        for segment in segments:
            if segment.get("final"):
                text = segment.get("text", "").strip()
                if text:
                    self._append_transcript(text)

    def start(self):
        """Start the transcription session."""
        print(f"🎙️  Starting transcription to: {self.output_path}")
        print(f"📝 Model: {self.model}")

        # Initialize whisper_streaming transcriber
        try:
            print("📥 Loading whisper model (may download on first run)...")
            self.transcriber = WhisperStreamingTranscriber(
                model=self.model,
                language=self.language,
                local_agreement=2  # LocalAgreement-2 policy
            )
            print("✅ Model loaded successfully")
        except Exception as e:
            print(f"❌ Failed to load whisper model: {e}")
            sys.exit(1)

        # Get audio device
        if self.device:
            device_id = self._find_device(self.device)
            if device_id is None:
                self._list_devices()
                sys.exit(1)
        else:
            device_id = None  # Use default device

        print("🔴 Recording... (Ctrl+C to stop)\n")
        self.running = True

        # Start audio stream
        try:
            with sd.InputStream(
                samplerate=self.sample_rate,
                channels=1,
                dtype=np.float32,
                device=device_id,
                callback=self._audio_callback
            ):
                while self.running:
                    sd.sleep(100)
        except sd.PortAudioError as e:
            if "Permission denied" in str(e) or "UNANSWERED" in str(e):
                print("❌ Microphone permission denied.")
                print("Grant access in System Settings → Privacy & Security → Microphone.")
            else:
                print(f"❌ Audio device error: {e}")
            sys.exit(1)

    def _audio_callback(self, indata, frames, time, status):
        """Callback for audio stream processing."""
        if status:
            print(f"⚠️  Audio buffer issue: {status}")

        # Process audio chunk with whisper_streaming
        if self.transcriber and self.running:
            audio_chunk = indata.flatten()
            try:
                segments = self.transcriber.process_audio(audio_chunk)
                self._on_transcription(segments)
            except Exception as e:
                print(f"⚠️  Transcription error: {e}")

    def _find_device(self, device_name: str) -> Optional[int]:
        """Find audio device by name."""
        devices = sd.query_devices()
        for i, device in enumerate(devices):
            if device_name.lower() in device["name"].lower():
                return i

        print(f"❌ Device '{device_name}' not found.")
        return None

    def _list_devices(self):
        """List available audio devices."""
        print("\nAvailable audio devices:")
        devices = sd.query_devices()
        for i, device in enumerate(devices):
            if device["max_input_channels"] > 0:
                print(f"  - {device['name']}")


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Real-time speech transcription with whisper_streaming"
    )
    parser.add_argument(
        "--output",
        type=str,
        required=True,
        help="Path to output markdown file (absolute or relative)"
    )
    parser.add_argument(
        "--model",
        type=str,
        default="small.en",
        help="Whisper model size (tiny, base, small.en, medium, large)"
    )
    parser.add_argument(
        "--device",
        type=str,
        help="Microphone device name for selection"
    )
    parser.add_argument(
        "--language",
        type=str,
        help="Language code (default: auto-detect)"
    )

    args = parser.parse_args()

    # Validate output path
    output_path = Path(args.output).resolve()

    # Create and start transcription session
    session = TranscriptionSession(
        output_path=output_path,
        model=args.model,
        device=args.device,
        language=args.language
    )

    session.start()


if __name__ == "__main__":
    main()
