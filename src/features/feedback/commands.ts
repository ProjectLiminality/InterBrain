/**
 * Feedback Commands
 *
 * Obsidian commands for bug reporting functionality.
 */

import type InterBrainPlugin from '../../main';
import { showFeedbackModal } from './components/FeedbackModal';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { errorCaptureService } from './services/error-capture-service';
import { serviceManager } from '../../core/services/service-manager';

/**
 * Register feedback-related commands
 */
export function registerFeedbackCommands(plugin: InterBrainPlugin): void {
  // Manual bug report command
  plugin.addCommand({
    id: 'report-bug',
    name: 'Report a Bug',
    callback: () => {
      showFeedbackModal(plugin.app);
    },
  });

  // ============================================================
  // TEST COMMANDS (for development/debugging)
  // ============================================================

  // Test: Trigger a test error for error capture
  plugin.addCommand({
    id: 'test-feedback-error-capture',
    name: '[Test] Trigger Error Capture',
    callback: () => {
      console.log('[Feedback Test] Throwing test error...');
      // Use setTimeout to make it an uncaught error
      setTimeout(() => {
        throw new Error('Test error from feedback system (intentional)');
      }, 0);
    },
  });

  // Test: Manually capture an error (bypasses window.onerror)
  plugin.addCommand({
    id: 'test-feedback-manual-capture',
    name: '[Test] Manual Error Capture',
    callback: () => {
      console.log('[Feedback Test] Manually capturing error...');
      const testError = new Error('Manually captured test error');
      errorCaptureService.captureError(testError, 'test-command');
    },
  });

  // Test: Reset rate limits
  plugin.addCommand({
    id: 'test-feedback-reset-limits',
    name: '[Test] Reset Rate Limits',
    callback: () => {
      const store = useInterBrainStore.getState();
      store.resetSessionReportCount();
      console.log('[Feedback Test] Rate limits reset');
      console.log('[Feedback Test] Session report count:', store.feedback.sessionReportCount);
      console.log('[Feedback Test] Last report timestamp:', store.feedback.lastReportTimestamp);
    },
  });

  // Test: Check current rate limit status
  plugin.addCommand({
    id: 'test-feedback-check-limits',
    name: '[Test] Check Rate Limit Status',
    callback: () => {
      const store = useInterBrainStore.getState();
      const canSend = store.canSendReport();
      const { sessionReportCount, lastReportTimestamp } = store.feedback;

      console.log('[Feedback Test] Rate limit status:');
      console.log('  - Can send report:', canSend);
      console.log('  - Session report count:', sessionReportCount);
      console.log('  - Last report timestamp:', lastReportTimestamp);
      if (lastReportTimestamp) {
        const timeSince = Date.now() - lastReportTimestamp;
        console.log('  - Time since last report:', Math.round(timeSince / 1000), 'seconds');
      }
    },
  });

  // Test: Simulate rapid reports (to test rate limiting)
  plugin.addCommand({
    id: 'test-feedback-rapid-reports',
    name: '[Test] Simulate Rapid Reports (3x)',
    callback: () => {
      const store = useInterBrainStore.getState();

      console.log('[Feedback Test] Simulating 3 rapid report attempts...');

      for (let i = 1; i <= 3; i++) {
        const canSend = store.canSendReport();
        console.log(`[Feedback Test] Attempt ${i}: canSendReport = ${canSend}`);

        if (canSend) {
          store.recordReportSent();
          console.log(`[Feedback Test] Attempt ${i}: Report recorded`);
        } else {
          console.log(`[Feedback Test] Attempt ${i}: BLOCKED by rate limit`);
        }
      }

      console.log('[Feedback Test] Final state:');
      console.log('  - Session report count:', store.feedback.sessionReportCount);
    },
  });

  // Test: View captured console logs
  plugin.addCommand({
    id: 'test-feedback-view-logs',
    name: '[Test] View Captured Logs',
    callback: () => {
      const logs = errorCaptureService.getLogs();
      console.log('[Feedback Test] Captured logs:', logs.length, 'entries');
      console.log('[Feedback Test] Log buffer:');
      logs.forEach((log, i) => {
        console.log(`  [${i}] [${log.level}] ${log.message}`);
      });
    },
  });

  // Test: Clear captured logs
  plugin.addCommand({
    id: 'test-feedback-clear-logs',
    name: '[Test] Clear Captured Logs',
    callback: () => {
      errorCaptureService.clearLogs();
      console.log('[Feedback Test] Log buffer cleared');
    },
  });

  // Test: Debug environment detection
  plugin.addCommand({
    id: 'test-feedback-debug-env',
    name: '[Test] Debug Environment Detection',
    callback: () => {
      console.log('[Feedback Test] === Environment Detection Debug ===');

      // Manifest
      const manifest = serviceManager.getManifest();
      console.log('[Feedback Test] serviceManager.getManifest():', manifest);

      // App object
      const app = serviceManager.getApp() as any;
      console.log('[Feedback Test] serviceManager.getApp():', app ? 'exists' : 'null');
      if (app) {
        console.log('[Feedback Test] app keys:', Object.keys(app).slice(0, 20));
        console.log('[Feedback Test] app.version:', app.version);
        console.log('[Feedback Test] app.appVersion:', app.appVersion);
        console.log('[Feedback Test] app.appId:', app.appId);
      }

      // UserAgent
      const userAgent = globalThis.navigator?.userAgent || '';
      console.log('[Feedback Test] navigator.userAgent:', userAgent);

      // Platform
      const platform = globalThis.navigator?.platform || '';
      console.log('[Feedback Test] navigator.platform:', platform);

      // Process (Node.js in Electron)
      const nodeProcess = (globalThis as any).process;
      console.log('[Feedback Test] process.arch:', nodeProcess?.arch);
      console.log('[Feedback Test] process.platform:', nodeProcess?.platform);

      // Parse attempts
      const obsidianMatch = userAgent.match(/obsidian\/(\d+\.\d+\.\d+)/i);
      console.log('[Feedback Test] Obsidian version from userAgent:', obsidianMatch?.[1] || 'not found');

      const macMatch = userAgent.match(/Mac OS X (\d+[._]\d+(?:[._]\d+)?)/);
      console.log('[Feedback Test] macOS version from userAgent:', macMatch?.[1]?.replace(/_/g, '.') || 'not found');

      const electronMatch = userAgent.match(/Electron\/(\d+\.\d+)/);
      console.log('[Feedback Test] Electron version from userAgent:', electronMatch?.[1] || 'not found');

      console.log('[Feedback Test] === End Debug ===');
    },
  });
}
