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
  /**
   * Trim an audio file to create a sovereign clip
   * Uses ffmpeg for fast, accurate audio extraction
   *
   * @param options - Trim configuration
   * @returns Promise that resolves when trim is complete
   */
  async trimAudio(options: AudioTrimOptions): Promise<void> {
    const { sourceAudioPath, outputAudioPath, startTime, endTime } = options;

    // Validate inputs
    if (startTime < 0 || endTime <= startTime) {
      throw new Error(`Invalid time range: ${startTime}s -> ${endTime}s`);
    }

    // Check source file exists
    try {
      await fs.access(sourceAudioPath);
    } catch (error) {
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
      const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', async (code) => {
        if (code === 0) {
          // Verify output file was created
          try {
            await fs.access(outputAudioPath);
            console.log(`✅ [AudioTrim] Successfully created clip: ${path.basename(outputAudioPath)}`);
            resolve();
          } catch (error) {
            reject(new Error(`ffmpeg completed but output file not found: ${outputAudioPath}`));
          }
        } else {
          console.error(`[AudioTrim] ffmpeg stderr:\n${stderr}`);
          reject(new Error(`ffmpeg failed with exit code ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`Failed to spawn ffmpeg: ${error.message}. Is ffmpeg installed?`));
      });
    });
  }

  /**
   * Generate a unique filename for a trimmed audio clip
   * Format: perspectives/clip-{uuid}.{ext}
   */
  generateClipFilename(uuid: string, sourceExtension: string): string {
    return `perspectives/clip-${uuid}${sourceExtension}`;
  }

  /**
   * Check if ffmpeg is available on the system
   */
  async checkFfmpegAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const ffmpeg = spawn('ffmpeg', ['-version'], {
        stdio: 'ignore'
      });

      ffmpeg.on('close', (code) => {
        resolve(code === 0);
      });

      ffmpeg.on('error', () => {
        resolve(false);
      });
    });
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
