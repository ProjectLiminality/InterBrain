/**
 * Tiny frontend logger that forwards into the daemon's structured log file.
 *
 * Use for events that meaningfully advance state, surface user-facing errors,
 * or provide diagnostic value across runs. Routine UI reactions don't need
 * this — `console.log` is still fine for in-flight DevTools work.
 */

import { invoke } from '@tauri-apps/api/core';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function logEvent(
  level: LogLevel,
  source: string,
  message: string,
  fields?: Record<string, unknown>,
): void {
  // Best-effort: never throw from here, never block.
  invoke('log_event', { level, source, message, fields: fields ?? null }).catch(() => {});
  // Mirror to console so it's also visible in DevTools.
  const fn = level === 'error' ? console.error
    : level === 'warn' ? console.warn
    : console.log;
  fn(`[${source}] ${message}`, fields ?? '');
}
