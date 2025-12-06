/**
 * Audio Trimming Service
 *
 * Creates sovereign audio clips from conversation recordings by trimming audio files
 * to specific time ranges instead of using temporal masking.
 *
 * This ensures Songline perspectives are fully contained within Dreamer nodes
 * and can be shared/collaborated on using standard git patterns.
 */

// Access Node.js modules directly in Electron context
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

export interface AudioTrimOptions {
  sourceAudioPath: string;  // Absolute path to source audio file
  outputAudioPath: string;   // Absolute path where trimmed clip should be saved
  startTime: number;         // Start time in seconds
  endTime: number;           // End time in seconds
}

export class AudioTrimmingService {
  private ffmpegPath: string | null = null;

  /**
   * Find ffmpeg executable path
   * Checks common locations since Electron doesn't inherit full shell PATH
   */
  private async findFfmpegPath(): Promise<string | null> {
    if (this.ffmpegPath) {
      return this.ffmpegPath;
    }

    // Common ffmpeg locations
    const possiblePaths = [
      'ffmpeg', // Try PATH first
      '/opt/homebrew/bin/ffmpeg', // Homebrew on Apple Silicon
      '/usr/local/bin/ffmpeg',    // Homebrew on Intel Mac
      '/usr/bin/ffmpeg',           // Linux
      'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe', // Windows
      'C:\\ffmpeg\\bin\\ffmpeg.exe'  // Windows alternate
    ];

    for (const ffmpegPath of possiblePaths) {
      try {
        // Test if this path works
        const result = await new Promise<boolean>((resolve) => {
          const test = spawn(ffmpegPath, ['-version'], {
            stdio: 'ignore'
          });

          test.on('close', (code: number | null) => resolve(code === 0));
          test.on('error', () => resolve(false));

          setTimeout(() => {
            test.kill();
            resolve(false);
          }, 1000);
        });

        if (result) {
          console.log(`[AudioTrim] Found ffmpeg at: ${ffmpegPath}`);
          this.ffmpegPath = ffmpegPath;
          return ffmpegPath;
        }
      } catch {
        // Try next path
        continue;
      }
    }

    console.log('[AudioTrim] ffmpeg not found in any common location');
    return null;
  }

  /**
   * Trim an audio file to create a sovereign clip
   * Uses ffmpeg for fast, accurate audio extraction
   *
   * @param options - Trim configuration
   * @returns Promise that resolves when trim is complete
   */
  async trimAudio(options: AudioTrimOptions): Promise<void> {
    const { sourceAudioPath, outputAudioPath, startTime, endTime } = options;

    // Find ffmpeg executable
    const ffmpegPath = await this.findFfmpegPath();
    if (!ffmpegPath) {
      throw new Error('ffmpeg not found. Please install ffmpeg and try again.');
    }

    // Validate inputs
    if (startTime < 0 || endTime <= startTime) {
      throw new Error(`Invalid time range: ${startTime}s -> ${endTime}s`);
    }

    // Check source file exists
    try {
      await fs.access(sourceAudioPath);
    } catch {
      throw new Error(`Source audio file not found: ${sourceAudioPath}`);
    }

    // Ensure output directory exists
    const outputDir = path.dirname(outputAudioPath);
    await fs.mkdir(outputDir, { recursive: true });

    const duration = endTime - startTime;

    console.log(`[AudioTrim] Trimming audio:`);
    console.log(`  Source: ${sourceAudioPath}`);
    console.log(`  Output: ${outputAudioPath}`);
    console.log(`  Time range: ${startTime}s -> ${endTime}s (duration: ${duration}s)`);

    // Use ffmpeg to extract audio segment
    // -i: input file
    // -ss: start time (in seconds)
    // -t: duration (in seconds)
    // -c copy: copy codec (fast, no re-encoding)
    // -y: overwrite output file if exists
    const ffmpegArgs = [
      '-ss', startTime.toString(),
      '-i', sourceAudioPath,
      '-t', duration.toString(),
      '-c', 'copy',
      '-y',
      outputAudioPath
    ];

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn(ffmpegPath, ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stderr = '';

      ffmpeg.stderr.on('data', (data: any) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', async (code: number | null) => {
        if (code === 0) {
          // Verify output file was created
          try {
            await fs.access(outputAudioPath);
            console.log(`✅ [AudioTrim] Successfully created clip: ${path.basename(outputAudioPath)}`);
            resolve();
          } catch {
            reject(new Error(`ffmpeg completed but output file not found: ${outputAudioPath}`));
          }
        } else {
          console.error(`[AudioTrim] ffmpeg stderr:\n${stderr}`);
          reject(new Error(`ffmpeg failed with exit code ${code}`));
        }
      });

      ffmpeg.on('error', (error: Error) => {
        reject(new Error(`Failed to spawn ffmpeg: ${error.message}. Is ffmpeg installed?`));
      });
    });
  }

  /**
   * Generate a descriptive filename for a trimmed audio clip
   * Format: perspectives/{peerName}~{myName}-{timestamp}.{ext}
   * Example: perspectives/Alice~Bob-2025-11-17-1430.mp3
   */
  generateClipFilename(
    peerName: string,
    myName: string,
    timestamp: Date,
    sourceExtension: string
  ): string {
    // Sanitize names for filesystem (remove invalid characters)
    const sanitizeName = (name: string) => name.replace(/[<>:"/\\|?*]/g, '-');
    const cleanPeerName = sanitizeName(peerName);
    const cleanMyName = sanitizeName(myName);

    // Format timestamp: YYYY-MM-DD-HHMM
    const year = timestamp.getFullYear();
    const month = String(timestamp.getMonth() + 1).padStart(2, '0');
    const day = String(timestamp.getDate()).padStart(2, '0');
    const hours = String(timestamp.getHours()).padStart(2, '0');
    const minutes = String(timestamp.getMinutes()).padStart(2, '0');
    const timestampStr = `${year}-${month}-${day}-${hours}${minutes}`;

    return `perspectives/${cleanPeerName}~${cleanMyName}-${timestampStr}${sourceExtension}`;
  }

  /**
   * Check if ffmpeg is available on the system
   */
  async checkFfmpegAvailable(): Promise<boolean> {
    console.log('[AudioTrim] Checking for ffmpeg availability...');
    const ffmpegPath = await this.findFfmpegPath();
    const available = ffmpegPath !== null;

    if (available) {
      console.log(`[AudioTrim] ✓ ffmpeg available at: ${ffmpegPath}`);
    } else {
      console.log('[AudioTrim] ✗ ffmpeg not found');
    }

    return available;
  }
}

// Singleton instance
let _audioTrimmingServiceInstance: AudioTrimmingService | null = null;

export function initializeAudioTrimmingService(): void {
  _audioTrimmingServiceInstance = new AudioTrimmingService();
  console.log('[AudioTrim] Service initialized');
}

export function getAudioTrimmingService(): AudioTrimmingService {
  if (!_audioTrimmingServiceInstance) {
    throw new Error('AudioTrimmingService not initialized. Call initializeAudioTrimmingService() first.');
  }
  return _audioTrimmingServiceInstance;
}
