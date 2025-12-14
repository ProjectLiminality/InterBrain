/**
 * Error Capture Service - Captures console logs and error events
 *
 * Features:
 * - Ring buffer for console logs (last 50 entries)
 * - Window error and unhandled rejection handlers
 * - Error deduplication via hash
 * - Rate limiting awareness
 *
 * This service runs silently in the background, capturing context
 * that will be included in bug reports when requested.
 */

import { CapturedError } from '../store/slice';

// ============================================================================
// TYPES
// ============================================================================

export interface LogEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  message: string;
  timestamp: number;
  args?: string[];
}

export interface ErrorCaptureCallbacks {
  onError: (error: CapturedError) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const LOG_BUFFER_SIZE = 50;
const ERROR_HASH_EXPIRY_MS = 60000; // 1 minute - don't trigger for same error

// ============================================================================
// ERROR CAPTURE SERVICE
// ============================================================================

class ErrorCaptureService {
  private logBuffer: LogEntry[] = [];
  private seenErrorHashes: Map<string, number> = new Map();
  private callbacks: ErrorCaptureCallbacks | null = null;
  private isInitialized = false;

  // Store original console methods for restoration
  private originalConsole: {
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
    info: typeof console.info;
    debug: typeof console.debug;
  } | null = null;

  /**
   * Initialize error capture with callbacks
   */
  initialize(callbacks: ErrorCaptureCallbacks): void {
    if (this.isInitialized) {
      console.warn('[ErrorCaptureService] Already initialized');
      return;
    }

    this.callbacks = callbacks;
    this.setupConsoleCapture();
    this.setupErrorHandlers();
    this.isInitialized = true;

    console.log('[ErrorCaptureService] Initialized');
  }

  /**
   * Cleanup and restore original console methods
   */
  cleanup(): void {
    if (!this.isInitialized) return;

    this.restoreConsole();
    this.removeErrorHandlers();
    this.logBuffer = [];
    this.seenErrorHashes.clear();
    this.callbacks = null;
    this.isInitialized = false;
  }

  /**
   * Get captured logs (copy of buffer)
   */
  getLogs(): LogEntry[] {
    return [...this.logBuffer];
  }

  /**
   * Get logs formatted as string for issue body
   */
  getLogsAsString(): string {
    return this.logBuffer
      .map((entry) => {
        const time = new Date(entry.timestamp).toISOString();
        const args = entry.args?.length ? ` ${entry.args.join(' ')}` : '';
        return `[${time}] [${entry.level.toUpperCase()}] ${entry.message}${args}`;
      })
      .join('\n');
  }

  /**
   * Clear the log buffer
   */
  clearLogs(): void {
    this.logBuffer = [];
  }

  /**
   * Manually capture an error (for React error boundaries, etc.)
   */
  captureError(error: Error, source: string = 'manual'): void {
    const capturedError: CapturedError = {
      message: error.message,
      stack: error.stack,
      timestamp: Date.now(),
      source,
    };

    this.handleCapturedError(capturedError);
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private setupConsoleCapture(): void {
    // Store originals
    this.originalConsole = {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      info: console.info.bind(console),
      debug: console.debug.bind(console),
    };

    // Wrap each console method
    const levels: Array<'log' | 'warn' | 'error' | 'info' | 'debug'> = [
      'log',
      'warn',
      'error',
      'info',
      'debug',
    ];

    for (const level of levels) {
      const original = this.originalConsole[level];
      console[level] = (...args: unknown[]) => {
        this.addLogEntry(level, args);
        original(...args);
      };
    }
  }

  private restoreConsole(): void {
    if (!this.originalConsole) return;

    console.log = this.originalConsole.log;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
    console.info = this.originalConsole.info;
    console.debug = this.originalConsole.debug;
    this.originalConsole = null;
  }

  private addLogEntry(
    level: 'log' | 'warn' | 'error' | 'info' | 'debug',
    args: unknown[]
  ): void {
    const entry: LogEntry = {
      level,
      message: this.formatArg(args[0]),
      timestamp: Date.now(),
      args: args.slice(1).map(this.formatArg),
    };

    this.logBuffer.push(entry);

    // Maintain ring buffer size
    while (this.logBuffer.length > LOG_BUFFER_SIZE) {
      this.logBuffer.shift();
    }
  }

  private formatArg(arg: unknown): string {
    if (arg === undefined) return 'undefined';
    if (arg === null) return 'null';
    if (typeof arg === 'string') return arg;
    if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
    if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
    try {
      return JSON.stringify(arg, null, 2);
    } catch {
      return String(arg);
    }
  }

  private setupErrorHandlers(): void {
    // Global error handler
    globalThis.addEventListener('error', this.handleWindowError);

    // Unhandled promise rejection handler
    globalThis.addEventListener(
      'unhandledrejection',
      this.handleUnhandledRejection
    );
  }

  private removeErrorHandlers(): void {
    globalThis.removeEventListener('error', this.handleWindowError);
    globalThis.removeEventListener(
      'unhandledrejection',
      this.handleUnhandledRejection
    );
  }

  private handleWindowError = (event: any): void => {
    const capturedError: CapturedError = {
      message: event.message || 'Unknown error',
      stack: event.error?.stack,
      timestamp: Date.now(),
      source: 'uncaught',
    };

    this.handleCapturedError(capturedError);
  };

  private handleUnhandledRejection = (event: any): void => {
    let message = 'Unhandled promise rejection';
    let stack: string | undefined;

    if (event.reason instanceof Error) {
      message = event.reason.message;
      stack = event.reason.stack;
    } else if (typeof event.reason === 'string') {
      message = event.reason;
    }

    const capturedError: CapturedError = {
      message,
      stack,
      timestamp: Date.now(),
      source: 'unhandledrejection',
    };

    this.handleCapturedError(capturedError);
  };

  private handleCapturedError(error: CapturedError): void {
    // Skip expected/benign errors
    if (this.shouldIgnoreError(error)) {
      return;
    }

    // Check for duplicate (deduplication)
    const hash = this.hashError(error);
    const lastSeen = this.seenErrorHashes.get(hash);
    const now = Date.now();

    if (lastSeen && now - lastSeen < ERROR_HASH_EXPIRY_MS) {
      // Same error recently seen, skip
      return;
    }

    this.seenErrorHashes.set(hash, now);

    // Clean up old hashes
    this.cleanupOldHashes();

    // Notify callback
    this.callbacks?.onError(error);
  }

  private shouldIgnoreError(error: CapturedError): boolean {
    const ignorePatterns = [
      // User-initiated cancellations
      /user cancelled/i,
      /user aborted/i,
      /aborted by user/i,
      // Network retries (expected behavior)
      /network request failed/i,
      /fetch failed/i,
      // Validation errors (not bugs)
      /validation error/i,
      /invalid input/i,
      // Extension errors (not ours)
      /extension context invalidated/i,
      // ResizeObserver errors (benign)
      /ResizeObserver loop/i,
    ];

    return ignorePatterns.some((pattern) => pattern.test(error.message));
  }

  private hashError(error: CapturedError): string {
    // Simple hash based on message and first line of stack
    const stackFirstLine = error.stack?.split('\n')[1]?.trim() || '';
    const toHash = `${error.message}|${stackFirstLine}`;

    // Simple string hash
    let hash = 0;
    for (let i = 0; i < toHash.length; i++) {
      const char = toHash.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  private cleanupOldHashes(): void {
    const now = Date.now();
    for (const [hash, timestamp] of this.seenErrorHashes) {
      if (now - timestamp > ERROR_HASH_EXPIRY_MS) {
        this.seenErrorHashes.delete(hash);
      }
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const errorCaptureService = new ErrorCaptureService();
