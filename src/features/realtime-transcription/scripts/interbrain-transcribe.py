#!/usr/bin/env python3
"""
InterBrain Real-Time Transcription CLI

A minimalist CLI tool for real-time speech transcription using RealtimeSTT
with faster-whisper backend. Appends timestamped transcripts to markdown files.
Optionally records audio to file for Songline feature.

Usage:
    python3 interbrain-transcribe.py --output transcript.md
    python3 interbrain-transcribe.py --output transcript.md --model small.en
    python3 interbrain-transcribe.py --output transcript.md --record-audio --audio-output recording.wav
"""

import argparse
import signal
import subprocess
import sys
import threading
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

try:
    import sounddevice as sd
    import soundfile as sf
    import numpy as np
except ImportError as e:
    print(f"⚠️ Audio recording dependencies missing: {e}")
    print("Audio recording will not be available")
    print("Run: pip install sounddevice soundfile")
    sd = None
    sf = None
    np = None


class AudioRecorder:
    """Records audio to WAV file in a separate thread."""

    def __init__(self, output_path: Path, samplerate: int = 16000):
        self.output_path = output_path
        self.samplerate = samplerate
        self.recording = False
        self.audio_data = []
        self.stream = None
        self.thread = None

    def _audio_callback(self, indata, frames, time_info, status):
        """Called by sounddevice for each audio block."""
        if status:
            print(f"⚠️ Audio recording status: {status}", file=sys.stderr)
        if self.recording:
            self.audio_data.append(indata.copy())

    def start(self):
        """Start recording audio in background thread."""
        if sd is None:
            print("⚠️ Cannot record audio: sounddevice not available", file=sys.stderr)
            return

        print(f"🎙️ Starting audio recording to: {self.output_path}")
        self.recording = True
        self.audio_data = []

        try:
            # Open audio stream with callback
            self.stream = sd.InputStream(
                samplerate=self.samplerate,
                channels=1,  # Mono
                callback=self._audio_callback,
                dtype='float32'
            )
            self.stream.start()
            print("✅ Audio recording started")
        except Exception as e:
            print(f"❌ Failed to start audio recording: {e}", file=sys.stderr)
            self.recording = False

    def stop(self):
        """Stop recording and save to file."""
        if not self.recording:
            return

        print("🛑 Stopping audio recording...")
        self.recording = False

        # Stop stream
        if self.stream:
            self.stream.stop()
            self.stream.close()

        # Save audio data
        if self.audio_data and sf is not None:
            try:
                # Concatenate all audio chunks
                audio_array = np.concatenate(self.audio_data, axis=0)

                # Save as WAV
                sf.write(self.output_path, audio_array, self.samplerate)
                print(f"✅ Audio saved to: {self.output_path}")

                return True
            except Exception as e:
                print(f"❌ Failed to save audio: {e}", file=sys.stderr)
                return False
        return False


class TranscriptionSession:
    """Manages a real-time transcription session."""

    def __init__(
        self,
        output_path: Path,
        model: str = "small.en",
        language: Optional[str] = None,
        start_time: Optional[float] = None,
        audio_output: Optional[Path] = None,
    ):
        self.output_path = output_path
        self.model = model
        self.language = language
        self.running = False
        self.recorder = None
        self.audio_recorder = None

        # Start time will be set when audio recording actually starts (for perfect sync)
        # This ensures transcript timestamps match audio position exactly
        self.start_time = start_time if start_time is not None else None

        # Initialize audio recorder if output path provided
        if audio_output:
            self.audio_recorder = AudioRecorder(audio_output)

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
        if self.audio_recorder:
            print(f"🎵 Recording audio to: {self.audio_recorder.output_path}")
        print(f"💬 Speak into your microphone (Ctrl+C to stop)\n")

        try:
            # Start audio recording first and capture the exact start time
            if self.audio_recorder:
                self.audio_recorder.start()
                # Set start_time NOW for perfect timestamp synchronization
                if self.start_time is None:
                    self.start_time = time.time()
                    print(f"⏱️  Session start time: {self.start_time}")
            else:
                # No audio recording - use current time as fallback
                if self.start_time is None:
                    self.start_time = time.time()

            # Initialize recorder with faster-whisper model
            print("⏳ Initializing recorder (may take time on first run to download model)...")

            # Handle 'auto' language detection - set to None for RealtimeSTT auto-detect
            # Only multilingual models support auto-detection; English-only models (.en) always use 'en'
            effective_language = None if self.language == 'auto' else (self.language or 'en')

            recorder_config = {
                'model': self.model,
                'compute_type': 'float32',  # Explicitly set compute type to avoid float16 warning
                'no_log_file': True,  # Disable log file (prevents read-only filesystem errors on macOS)
                'silero_sensitivity': 0.4,  # Voice activity detection sensitivity
                'webrtc_sensitivity': 2,    # Additional VAD for better detection
                'post_speech_silence_duration': 0.2,  # Wait 200ms after speech ends (reduced for more frequent commits)
                'min_length_of_recording': 0.5,  # Minimum 500ms recording
                'min_gap_between_recordings': 0,  # No gap between recordings
                'level': 'WARNING',  # Reduce log verbosity
            }

            # Only set language if not auto-detecting (None means auto-detect in RealtimeSTT)
            if effective_language is not None:
                recorder_config['language'] = effective_language
                print(f"🌍 Language: {effective_language}")
            else:
                print("🌍 Language: Auto-detect")

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

        # Stop audio recording
        if self.audio_recorder:
            success = self.audio_recorder.stop()
            if success:
                # Convert WAV to MP3 if ffmpeg is available
                self._convert_to_mp3()

        print("✅ Transcription session ended")

    def _convert_to_mp3(self):
        """Convert recorded WAV to MP3 using ffmpeg."""
        if not self.audio_recorder:
            return

        wav_path = self.audio_recorder.output_path
        mp3_path = wav_path.with_suffix('.mp3')

        try:
            print(f"🔄 Converting to MP3...")
            result = subprocess.run(
                [
                    'ffmpeg', '-i', str(wav_path),
                    '-codec:a', 'libmp3lame',
                    '-b:a', '128k',  # 128kbps as specified
                    '-y',  # Overwrite output file
                    str(mp3_path)
                ],
                capture_output=True,
                text=True,
                timeout=60
            )

            if result.returncode == 0:
                # Success - delete WAV and update audio recorder path
                wav_path.unlink()
                self.audio_recorder.output_path = mp3_path
                print(f"✅ Audio converted to MP3: {mp3_path}")
            else:
                print(f"⚠️ MP3 conversion failed, keeping WAV: {result.stderr}", file=sys.stderr)

        except FileNotFoundError:
            print("⚠️ ffmpeg not found, keeping WAV format", file=sys.stderr)
        except subprocess.TimeoutExpired:
            print("⚠️ MP3 conversion timeout, keeping WAV", file=sys.stderr)
        except Exception as e:
            print(f"⚠️ MP3 conversion error: {e}, keeping WAV", file=sys.stderr)


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
    parser.add_argument(
        '--record-audio',
        action='store_true',
        help='Record audio to file (for Songline feature)'
    )
    parser.add_argument(
        '--audio-output',
        type=str,
        help='Audio output file path (WAV, will be converted to MP3)'
    )

    args = parser.parse_args()

    # Validate output path
    output_path = Path(args.output)
    if not output_path.parent.exists():
        print(f"❌ Output directory does not exist: {output_path.parent}")
        sys.exit(1)

    # Validate audio output if recording requested
    audio_output = None
    if args.record_audio or args.audio_output:
        if not args.audio_output:
            print("❌ --audio-output required when --record-audio is specified")
            sys.exit(1)
        audio_output = Path(args.audio_output)
        if not audio_output.parent.exists():
            print(f"❌ Audio output directory does not exist: {audio_output.parent}")
            sys.exit(1)

    # Create transcription session and start
    session = TranscriptionSession(
        output_path=output_path,
        model=args.model,
        language=args.language,
        start_time=args.start_time,
        audio_output=audio_output
    )

    try:
        session.start()
    except Exception as e:
        print(f"❌ Fatal error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
