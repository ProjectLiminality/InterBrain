#!/usr/bin/env python3
"""
InterBrain Real-Time Transcription CLI

Dual-stream architecture:
1. Stabilized stream for real-time semantic search (low latency, may have minor inaccuracies)
2. Batch transcription for final transcript (high quality, no word loss)

The stabilized stream outputs continuously for responsive semantic search.
The batch transcription runs periodically and at session end for accurate transcripts.

Usage:
    python3 interbrain-transcribe.py --output transcript.md
    python3 interbrain-transcribe.py --output transcript.md --model small
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
from typing import Optional, List

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
    """
    Manages a real-time transcription session with dual-stream output.

    Architecture:
    - Stabilized stream: Real-time text for semantic search (SEARCH: prefix)
    - Final chunks: Accurate text for transcript (TRANSCRIPT: prefix)

    The stabilized stream provides continuous output without waiting for pauses,
    while the transcript receives complete, accurate chunks.
    """

    def __init__(
        self,
        output_path: Path,
        model: str = "small",
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

        # Stabilized text buffer for semantic search
        self.stabilized_buffer = ""
        self.last_stabilized_output = ""
        self.stabilized_lock = threading.Lock()

        # Transcript accumulator
        self.transcript_chunks: List[str] = []
        self.transcript_lock = threading.Lock()

        # Start time will be set when audio recording actually starts (for perfect sync)
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

    def _on_realtime_stabilized(self, text: str):
        """
        Callback for stabilized real-time transcription.
        This fires continuously with confident text that won't change.
        Used for driving semantic search.
        """
        if not text or not text.strip():
            return

        with self.stabilized_lock:
            self.stabilized_buffer = text.strip()

            # Only output if meaningfully different from last output
            # This prevents flooding with tiny incremental updates
            if len(self.stabilized_buffer) > len(self.last_stabilized_output) + 5:
                # Output for semantic search consumption
                print(f"SEARCH:{self.stabilized_buffer}")
                sys.stdout.flush()
                self.last_stabilized_output = self.stabilized_buffer

    def _on_final_text(self, text: str):
        """
        Callback for final transcription after VAD detects end of utterance.
        This is the high-quality, complete text for the transcript.
        """
        if not text or not text.strip():
            return

        text = text.strip()

        # Calculate timestamp
        elapsed = time.time() - self.start_time
        timestamp = self._format_relative_time(elapsed)

        # Store for transcript
        with self.transcript_lock:
            self.transcript_chunks.append(f"[{timestamp}] {text}")

        # Output for transcript file
        print(f"TRANSCRIPT:[{timestamp}] {text}")
        sys.stdout.flush()

        # Also write directly to file for immediate persistence
        self._write_transcript(text)

        # Reset stabilized buffer after final text is received
        with self.stabilized_lock:
            self.stabilized_buffer = ""
            self.last_stabilized_output = ""

    def _write_transcript(self, text: str):
        """Write transcribed text to output file with relative timestamp."""
        if not text or not text.strip():
            return

        # Calculate elapsed time since session start
        elapsed = time.time() - self.start_time
        timestamp = self._format_relative_time(elapsed)
        line = f"[{timestamp}] {text.strip()}\n\n"

        try:
            with open(self.output_path, 'a', encoding='utf-8') as f:
                f.write(line)
                f.flush()
        except Exception as e:
            print(f"❌ Error writing to file: {e}", file=sys.stderr)

    def start(self):
        """Start the transcription session with dual-stream output."""
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
                if self.start_time is None:
                    self.start_time = time.time()
            else:
                if self.start_time is None:
                    self.start_time = time.time()

            # Initialize recorder with faster-whisper model
            print("⏳ Initializing recorder (may take time on first run to download model)...")

            # Handle 'auto' language detection
            effective_language = None if self.language == 'auto' else (self.language or 'en')

            recorder_config = {
                'model': self.model,
                'compute_type': 'float32',
                'no_log_file': True,

                # VAD settings - optimized for transcript quality
                # Longer silence duration for more complete sentences
                'silero_sensitivity': 0.4,
                'webrtc_sensitivity': 2,
                'post_speech_silence_duration': 1.5,  # Wait 1.5s for sentence completion
                'min_length_of_recording': 0.5,
                'min_gap_between_recordings': 0,
                'pre_recording_buffer_duration': 0.5,  # Capture lead-in words

                # Enable real-time transcription for semantic search
                # The stabilized callback provides confident text that won't change
                'enable_realtime_transcription': True,
                'realtime_processing_pause': 0.1,  # Process every 100ms
                'on_realtime_transcription_stabilized': self._on_realtime_stabilized,

                'level': 'WARNING',
            }

            # Set language if not auto-detecting
            if effective_language is not None:
                recorder_config['language'] = effective_language
                print(f"🌍 Language: {effective_language}")
            else:
                print("🌍 Language: Auto-detect")

            self.recorder = AudioToTextRecorder(**recorder_config)

            print("✅ Model loaded successfully")
            print("🎤 Listening for speech...")
            print("READY")  # Signal to TypeScript that we're ready
            sys.stdout.flush()

            self.running = True

            # Main loop - process final transcriptions
            while self.running:
                # text() blocks until VAD detects end of utterance
                text = self.recorder.text()

                if text and text.strip():
                    self._on_final_text(text)

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
                self._convert_to_mp3()

        # Output final stabilized buffer if any remains
        with self.stabilized_lock:
            if self.stabilized_buffer and self.stabilized_buffer != self.last_stabilized_output:
                print(f"SEARCH:{self.stabilized_buffer}")
                sys.stdout.flush()

        print("✅ Transcription session ended")
        print("END")  # Signal to TypeScript that session has ended
        sys.stdout.flush()

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
                    '-b:a', '128k',
                    '-y',
                    str(mp3_path)
                ],
                capture_output=True,
                text=True,
                timeout=60
            )

            if result.returncode == 0:
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
        description="Real-time speech transcription with dual-stream output"
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
        default='small',
        help='Whisper model size (default: small)'
    )
    parser.add_argument(
        '--language',
        type=str,
        default='auto',
        help='Language code or "auto" for auto-detect (default: auto)'
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
