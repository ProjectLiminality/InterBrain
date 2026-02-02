/**
 * ServiceLifecycleManager - Coordinates async service initialization
 *
 * Solves the race condition problem by enforcing explicit phases:
 * 1. BOOTSTRAP - Set vault context, load settings
 * 2. HYDRATE - Read IndexedDB, validate persisted data
 * 3. SCAN - Scan vault (only if needed based on vault state)
 * 4. READY - UI can interact, services available
 * 5. BACKGROUND - Heavy operations (indexing, sync)
 *
 * Each phase must complete before the next begins. Features can subscribe
 * to phase completion events to coordinate their initialization.
 */

// Simple EventEmitter implementation for browser compatibility
type EventHandler = (...args: unknown[]) => void;

class SimpleEventEmitter {
  private listeners = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  once(event: string, handler: EventHandler): void {
    const wrapper = (...args: unknown[]) => {
      this.off(event, wrapper);
      handler(...args);
    };
    this.on(event, wrapper);
  }

  off(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: string, ...args: unknown[]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(...args);
        } catch (error) {
          console.error(`[Lifecycle] Event handler error for ${event}:`, error);
        }
      }
    }
  }
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Lifecycle phases in execution order
 */
export enum LifecyclePhase {
  UNINITIALIZED = 'uninitialized',
  BOOTSTRAP = 'bootstrap',
  HYDRATE = 'hydrate',
  SCAN = 'scan',
  READY = 'ready',
  BACKGROUND = 'background',
}

/**
 * Phase execution result
 */
export interface PhaseResult {
  phase: LifecyclePhase;
  success: boolean;
  duration: number;
  error?: Error;
  metadata?: Record<string, unknown>;
}

/**
 * Lifecycle events
 */
export type LifecycleEvent =
  | 'phase:start'
  | 'phase:complete'
  | 'phase:error'
  | 'ready'
  | 'shutdown:start'
  | 'shutdown:complete';

/**
 * Phase handler function
 */
export type PhaseHandler = () => Promise<Record<string, unknown> | void>;

/**
 * Registered phase with handler and dependencies
 */
interface RegisteredPhase {
  name: LifecyclePhase;
  handler: PhaseHandler;
  timeout: number;
}

// ============================================================================
// SERVICE LIFECYCLE MANAGER
// ============================================================================

/**
 * Singleton manager that coordinates all async service initialization
 */
class ServiceLifecycleManagerImpl {
  private emitter = new SimpleEventEmitter();
  private currentPhase: LifecyclePhase = LifecyclePhase.UNINITIALIZED;
  private completedPhases = new Set<LifecyclePhase>();
  private phaseResults = new Map<LifecyclePhase, PhaseResult>();
  private phases = new Map<LifecyclePhase, RegisteredPhase>();
  private isShuttingDown = false;
  private pendingOperations: Promise<unknown>[] = [];

  constructor() {
    // Set up default phase order with timeouts
    this.definePhase(LifecyclePhase.BOOTSTRAP, 5000);
    this.definePhase(LifecyclePhase.HYDRATE, 10000);
    this.definePhase(LifecyclePhase.SCAN, 30000);
    this.definePhase(LifecyclePhase.READY, 1000);
    this.definePhase(LifecyclePhase.BACKGROUND, 60000);
  }

  /**
   * Define a phase with its timeout
   */
  private definePhase(phase: LifecyclePhase, timeout: number): void {
    this.phases.set(phase, {
      name: phase,
      handler: async () => {},
      timeout,
    });
  }

  /**
   * Register a handler for a phase
   */
  registerPhaseHandler(phase: LifecyclePhase, handler: PhaseHandler): void {
    const existing = this.phases.get(phase);
    if (!existing) {
      throw new Error(`Unknown phase: ${phase}`);
    }
    existing.handler = handler;
  }

  /**
   * Get the current lifecycle phase
   */
  getCurrentPhase(): LifecyclePhase {
    return this.currentPhase;
  }

  /**
   * Check if a phase has completed
   */
  isPhaseComplete(phase: LifecyclePhase): boolean {
    return this.completedPhases.has(phase);
  }

  /**
   * Check if the manager is ready (READY phase complete)
   */
  isReady(): boolean {
    return this.completedPhases.has(LifecyclePhase.READY);
  }

  /**
   * Check if shutdown is in progress
   */
  isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Get result of a completed phase
   */
  getPhaseResult(phase: LifecyclePhase): PhaseResult | undefined {
    return this.phaseResults.get(phase);
  }

  /**
   * Wait for a specific phase to complete
   */
  async waitForPhase(phase: LifecyclePhase): Promise<PhaseResult> {
    // If already complete, return immediately
    const existing = this.phaseResults.get(phase);
    if (existing) {
      return existing;
    }

    // Otherwise wait for completion event
    return new Promise((resolve) => {
      const handler = (...args: unknown[]) => {
        const result = args[0] as PhaseResult;
        if (result.phase === phase) {
          this.emitter.off('phase:complete', handler);
          resolve(result);
        }
      };
      this.emitter.on('phase:complete', handler);
    });
  }

  /**
   * Run all phases in sequence
   */
  async runLifecycle(): Promise<void> {
    const phaseOrder = [
      LifecyclePhase.BOOTSTRAP,
      LifecyclePhase.HYDRATE,
      LifecyclePhase.SCAN,
      LifecyclePhase.READY,
      LifecyclePhase.BACKGROUND,
    ];

    console.log('[Lifecycle] Starting lifecycle execution...');
    const startTime = Date.now();

    for (const phase of phaseOrder) {
      if (this.isShuttingDown) {
        console.log(`[Lifecycle] Shutdown requested, stopping at ${phase}`);
        break;
      }

      await this.runPhase(phase);
    }

    const totalDuration = Date.now() - startTime;
    console.log(`[Lifecycle] Lifecycle complete in ${totalDuration}ms`);
  }

  /**
   * Run a specific phase
   */
  async runPhase(phase: LifecyclePhase): Promise<PhaseResult> {
    const registeredPhase = this.phases.get(phase);
    if (!registeredPhase) {
      throw new Error(`Unknown phase: ${phase}`);
    }

    console.log(`[Lifecycle] Phase ${phase}: starting...`);
    this.currentPhase = phase;
    this.emitter.emit('phase:start', phase);

    const startTime = Date.now();
    let result: PhaseResult;

    try {
      // Run with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Phase ${phase} timed out after ${registeredPhase.timeout}ms`));
        }, registeredPhase.timeout);
      });

      const metadata = await Promise.race([
        registeredPhase.handler(),
        timeoutPromise,
      ]);

      const duration = Date.now() - startTime;
      result = {
        phase,
        success: true,
        duration,
        metadata: metadata as Record<string, unknown> | undefined,
      };

      console.log(`[Lifecycle] Phase ${phase}: complete in ${duration}ms`);

    } catch (error) {
      const duration = Date.now() - startTime;
      result = {
        phase,
        success: false,
        duration,
        error: error instanceof Error ? error : new Error(String(error)),
      };

      console.error(`[Lifecycle] Phase ${phase}: FAILED after ${duration}ms:`, error);
      this.emitter.emit('phase:error', result);
    }

    this.completedPhases.add(phase);
    this.phaseResults.set(phase, result);
    this.emitter.emit('phase:complete', result);

    // Emit ready event when READY phase completes
    if (phase === LifecyclePhase.READY && result.success) {
      this.emitter.emit('ready');
    }

    return result;
  }

  /**
   * Track a pending async operation (for graceful shutdown)
   */
  trackOperation<T>(promise: Promise<T>): Promise<T> {
    if (this.isShuttingDown) {
      // During shutdown, reject new operations
      return Promise.reject(new Error('Shutdown in progress'));
    }

    const tracked = promise.finally(() => {
      const index = this.pendingOperations.indexOf(tracked);
      if (index > -1) {
        this.pendingOperations.splice(index, 1);
      }
    });

    this.pendingOperations.push(tracked);
    return tracked;
  }

  /**
   * Initiate graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      console.log('[Lifecycle] Shutdown already in progress');
      return;
    }

    console.log('[Lifecycle] Initiating graceful shutdown...');
    this.isShuttingDown = true;
    this.emitter.emit('shutdown:start');

    // Wait for pending operations with timeout
    if (this.pendingOperations.length > 0) {
      console.log(`[Lifecycle] Waiting for ${this.pendingOperations.length} pending operations...`);

      const timeout = new Promise<void>((resolve) => {
        setTimeout(() => {
          console.warn('[Lifecycle] Shutdown timeout - some operations may be incomplete');
          resolve();
        }, 5000);
      });

      await Promise.race([
        Promise.allSettled(this.pendingOperations),
        timeout,
      ]);
    }

    console.log('[Lifecycle] Shutdown complete');
    this.emitter.emit('shutdown:complete');
  }

  /**
   * Reset for testing or plugin reload
   */
  reset(): void {
    this.currentPhase = LifecyclePhase.UNINITIALIZED;
    this.completedPhases.clear();
    this.phaseResults.clear();
    this.isShuttingDown = false;
    this.pendingOperations = [];

    // Reset phase handlers to empty
    for (const registered of this.phases.values()) {
      registered.handler = async () => {};
    }
  }

  // ============================================================================
  // EVENT EMITTER WRAPPERS
  // ============================================================================

  on(event: LifecycleEvent, listener: (...args: unknown[]) => void): void {
    this.emitter.on(event, listener);
  }

  once(event: LifecycleEvent, listener: (...args: unknown[]) => void): void {
    this.emitter.once(event, listener);
  }

  off(event: LifecycleEvent, listener: (...args: unknown[]) => void): void {
    this.emitter.off(event, listener);
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const serviceLifecycleManager = new ServiceLifecycleManagerImpl();

// Re-export for convenience
export type ServiceLifecycleManager = typeof serviceLifecycleManager;
