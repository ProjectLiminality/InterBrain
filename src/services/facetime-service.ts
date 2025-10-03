// Access Node.js modules directly in Electron context
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * FaceTimeService - Handles FaceTime integration via AppleScript
 *
 * Provides cross-platform abstraction for video calling, currently implemented
 * for macOS FaceTime with future support planned for Windows/Linux alternatives.
 */
export class FaceTimeService {

  /**
   * Check if FaceTime is available on the current system
   */
  async isFaceTimeAvailable(): Promise<boolean> {
    try {
      // Check if we're on macOS and FaceTime app exists
      const { stdout } = await execAsync('osascript -e "exists application \\"FaceTime\\""');
      return stdout.trim() === 'true';
    } catch (error) {
      console.error('FaceTime availability check failed:', error);
      return false;
    }
  }

  /**
   * Initiate a FaceTime call with the given contact
   *
   * @param email - Email address or phone number to call
   * @throws Error if FaceTime is not available or call initiation fails
   */
  async startCall(email: string): Promise<void> {
    // Validate input
    if (!email || email.trim() === '') {
      throw new Error('Contact information (email or phone) is required to start a FaceTime call');
    }

    // Check FaceTime availability
    const isAvailable = await this.isFaceTimeAvailable();
    if (!isAvailable) {
      throw new Error('FaceTime is not available on this system. Please ensure you are running macOS with FaceTime installed.');
    }

    try {
      // AppleScript to launch FaceTime with contact pre-filled
      const appleScript = `
        tell application "FaceTime"
          activate
          delay 0.5
          open location "facetime://${email}"
        end tell
      `;

      await execAsync(`osascript -e '${appleScript.replace(/'/g, "'\\''")}'`);
      console.log(`FaceTime call initiated to: ${email}`);
    } catch (error) {
      console.error('Failed to initiate FaceTime call:', error);
      throw new Error(`Failed to start FaceTime call: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * End the current FaceTime call (if any)
   *
   * Note: This quits the FaceTime app entirely. A more sophisticated
   * implementation could detect and end only the active call.
   */
  async endCall(): Promise<void> {
    try {
      const appleScript = `
        tell application "FaceTime"
          quit
        end tell
      `;

      await execAsync(`osascript -e '${appleScript.replace(/'/g, "'\\''")}'`);
      console.log('FaceTime call ended');
    } catch (error) {
      console.error('Failed to end FaceTime call:', error);
      throw new Error(`Failed to end FaceTime call: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
