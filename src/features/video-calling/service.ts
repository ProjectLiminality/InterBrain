/* eslint-disable no-undef */
// Access Node.js modules directly in Electron context
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * VideoCallService - Cross-platform video calling abstraction
 *
 * - macOS: Launches FaceTime automatically
 * - Windows/Linux: Shows guidance to manually start a video call
 */
export class FaceTimeService {

  /**
   * Check if running on macOS
   */
  private isMacOS(): boolean {
    return process.platform === 'darwin';
  }

  /**
   * Check if FaceTime is available (macOS only)
   */
  async isFaceTimeAvailable(): Promise<boolean> {
    if (!this.isMacOS()) {
      return false;
    }

    try {
      // Check if FaceTime app exists by trying to get its path
      const { stdout } = await execAsync('osascript -e "POSIX path of (path to application \\"FaceTime\\")"');
      return stdout.trim().length > 0;
    } catch (error) {
      console.error('[FaceTimeService] FaceTime not found:', error);
      return false;
    }
  }

  /**
   * Initiate a video call with the given contact
   *
   * On macOS: Launches FaceTime
   * On Windows/Linux: Returns a message for the user to start manually
   *
   * @param email - Email address or phone number to call
   * @returns Object indicating whether call was auto-started or needs manual action
   */
  async startCall(email: string): Promise<{ autoStarted: boolean; message: string }> {
    // Validate input
    if (!email || email.trim() === '') {
      throw new Error('Contact information (email or phone) is required to start a video call');
    }

    // Non-macOS: Return guidance for manual call
    if (!this.isMacOS()) {
      return {
        autoStarted: false,
        message: `Copilot mode started. Please manually start a video call with ${email} using your preferred video calling app (Zoom, Google Meet, Teams, etc.)`
      };
    }

    // macOS: Check FaceTime availability
    const isAvailable = await this.isFaceTimeAvailable();
    if (!isAvailable) {
      return {
        autoStarted: false,
        message: `Copilot mode started. FaceTime not available — please manually start a video call with ${email}.`
      };
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

      return {
        autoStarted: true,
        message: `FaceTime call started with ${email}`
      };
    } catch (error) {
      console.error('[FaceTimeService] Failed to initiate call:', error);
      throw new Error(`Failed to start FaceTime call: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * End the current FaceTime call (if any)
   *
   * Note: This quits the FaceTime app entirely. A more sophisticated
   * implementation could detect and end only the active call.
   * On non-macOS, this is a no-op.
   */
  async endCall(): Promise<void> {
    // No-op on non-macOS
    if (!this.isMacOS()) {
      return;
    }

    try {
      const appleScript = `
        tell application "FaceTime"
          quit
        end tell
      `;

      await execAsync(`osascript -e '${appleScript.replace(/'/g, "'\\''")}'`);
    } catch (error) {
      console.error('[FaceTimeService] Failed to end call:', error);
      throw new Error(`Failed to end FaceTime call: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
