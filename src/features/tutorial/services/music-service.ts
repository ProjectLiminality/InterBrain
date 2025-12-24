/**
 * MusicService - Manages tutorial background music playback
 *
 * Uses HTML5 Audio API for reliable cross-platform playback.
 * Music file should be placed in the plugin's assets folder.
 */

export class MusicService {
  private audio: HTMLAudioElement | null = null;
  private isPlaying = false;
  private volume = 0.3; // Default volume (30%)
  private fadeInterval: ReturnType<typeof setInterval> | null = null;

  // Path to music file (relative to plugin folder)
  // Music: "Fractals" by Vincent Rubinetti from "The Music of 3Blue1Brown"
  // https://vincerubinetti.bandcamp.com/album/the-music-of-3blue1brown
  // TODO: Permission pending - see README.md for status
  private musicPath = 'src/features/tutorial/assets/TutorialMusic.mp3';

  /**
   * Initialize the audio element with the music file
   * @param app - Obsidian App instance for resource path resolution
   * @param pluginId - Plugin ID for resource path
   */
  initialize(app: any, pluginId: string = 'interbrain'): void {
    if (this.audio) {
      this.cleanup();
    }

    // Use Obsidian's app.vault.adapter to get proper resource URL
    // This bypasses Electron's file:// security restrictions
    const resourcePath = app.vault.adapter.getResourcePath(
      `.obsidian/plugins/${pluginId}/${this.musicPath}`
    );

    this.audio = new Audio(resourcePath);
    this.audio.loop = true;
    this.audio.volume = 0; // Start at 0 for fade-in
    this.audio.preload = 'auto';

    // Handle errors gracefully
    this.audio.onerror = (e) => {
      console.warn('[MusicService] Failed to load tutorial music:', e);
      console.warn('[MusicService] Expected path:', resourcePath);
      this.audio = null;
    };

    console.log('[MusicService] Initialized with path:', resourcePath);
  }

  /**
   * Start playing the music with a fade-in effect
   * @param fadeInDuration - Duration of fade-in in milliseconds (default 2000ms)
   */
  play(fadeInDuration = 2000): void {
    if (!this.audio) {
      console.warn('[MusicService] Cannot play - audio not initialized');
      return;
    }

    if (this.isPlaying) {
      console.log('[MusicService] Already playing');
      return;
    }

    // Clear any existing fade
    this.clearFade();

    // Start playback
    this.audio.volume = 0;
    const playPromise = this.audio.play();

    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          this.isPlaying = true;
          console.log('[MusicService] Playback started, fading in...');
          this.fadeIn(fadeInDuration);
        })
        .catch((error) => {
          // Autoplay was prevented (common in browsers)
          console.warn('[MusicService] Autoplay prevented:', error);
          // Will need user interaction to start - that's OK for tutorial
        });
    }
  }

  /**
   * Stop playing the music with a fade-out effect
   * @param fadeOutDuration - Duration of fade-out in milliseconds (default 1500ms)
   */
  stop(fadeOutDuration = 1500): void {
    if (!this.audio || !this.isPlaying) {
      return;
    }

    console.log('[MusicService] Stopping with fade-out...');
    this.fadeOut(fadeOutDuration, () => {
      if (this.audio) {
        this.audio.pause();
        this.audio.currentTime = 0;
      }
      this.isPlaying = false;
      console.log('[MusicService] Playback stopped');
    });
  }

  /**
   * Pause playback without resetting position
   */
  pause(): void {
    if (this.audio && this.isPlaying) {
      this.audio.pause();
      this.isPlaying = false;
      console.log('[MusicService] Paused');
    }
  }

  /**
   * Resume playback from current position
   */
  resume(): void {
    if (this.audio && !this.isPlaying) {
      this.audio.play();
      this.isPlaying = true;
      console.log('[MusicService] Resumed');
    }
  }

  /**
   * Set the volume (0.0 to 1.0)
   */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.audio && this.isPlaying) {
      this.audio.volume = this.volume;
    }
  }

  /**
   * Get current playback state
   */
  getState(): { isPlaying: boolean; volume: number; currentTime: number } {
    return {
      isPlaying: this.isPlaying,
      volume: this.volume,
      currentTime: this.audio?.currentTime ?? 0,
    };
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.clearFade();
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
    this.isPlaying = false;
    console.log('[MusicService] Cleaned up');
  }

  // ============ Private Methods ============

  private fadeIn(duration: number): void {
    this.clearFade();

    const steps = 50;
    const stepDuration = duration / steps;
    const volumeStep = this.volume / steps;
    let currentStep = 0;

    this.fadeInterval = setInterval(() => {
      currentStep++;
      if (this.audio) {
        this.audio.volume = Math.min(volumeStep * currentStep, this.volume);
      }

      if (currentStep >= steps) {
        this.clearFade();
        if (this.audio) {
          this.audio.volume = this.volume;
        }
      }
    }, stepDuration);
  }

  private fadeOut(duration: number, onComplete?: () => void): void {
    this.clearFade();

    const steps = 50;
    const stepDuration = duration / steps;
    const startVolume = this.audio?.volume ?? this.volume;
    const volumeStep = startVolume / steps;
    let currentStep = 0;

    this.fadeInterval = setInterval(() => {
      currentStep++;
      if (this.audio) {
        this.audio.volume = Math.max(startVolume - volumeStep * currentStep, 0);
      }

      if (currentStep >= steps) {
        this.clearFade();
        if (this.audio) {
          this.audio.volume = 0;
        }
        onComplete?.();
      }
    }, stepDuration);
  }

  private clearFade(): void {
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }
  }
}

// Singleton instance
export const musicService = new MusicService();
