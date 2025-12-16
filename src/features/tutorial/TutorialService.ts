/**
 * TutorialService - Manages tutorial state and progression
 *
 * Tracks:
 * - First-time user detection
 * - Current tutorial step
 * - Tutorial completion status
 *
 * Uses localStorage for persistence across sessions
 */

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  position?: [number, number, number]; // 3D position for tooltip
  targetNodeId?: string; // If highlighting a specific node
  duration?: number; // Auto-advance after N seconds
}

/**
 * Position-based golden dot animation
 */
export interface GoldenDotPositionAnimation {
  from: [number, number, number];
  to: [number, number, number];
  fromNodeId?: never;
  toNodeId?: never;
  controlPoints?: [number, number, number][];
  duration?: number;
  size?: number;
  easing?: 'linear' | 'easeInOut' | 'easeIn' | 'easeOut';
}

/**
 * Node-based golden dot animation (resolves positions from store)
 */
export interface GoldenDotNodeAnimation {
  fromNodeId: string;
  toNodeId: string;
  from?: never;
  to?: never;
  controlPoints?: [number, number, number][];
  duration?: number;
  size?: number;
  easing?: 'linear' | 'easeInOut' | 'easeIn' | 'easeOut';
}

export type GoldenDotAnimation = GoldenDotPositionAnimation | GoldenDotNodeAnimation;

export class TutorialService {
  private static STORAGE_KEY = 'interbrain-tutorial-state';
  private currentStep: number = -1; // -1 = inactive, 0+ = active tutorial step
  private onStepChangeCallbacks: Array<(step: TutorialStep | null) => void> = [];

  // Golden dot state (decoupled from tutorial steps)
  private goldenDotAnimation: GoldenDotAnimation | null = null;
  private onGoldenDotCallbacks: Array<(animation: GoldenDotAnimation | null) => void> = [];

  /**
   * Tutorial steps definition
   */
  private steps: TutorialStep[] = [
    {
      id: 'welcome',
      title: 'Enter Liminal Space',
      description: 'Welcome to the space between thoughts',
      position: [0, 0, -25],
      duration: 4000 // Show for 4 seconds
    },
    {
      id: 'dreamspace-intro',
      title: 'This is the DreamSpace',
      description: 'A 3D canvas for your ideas to live and breathe',
      position: [0, 2, -25],
      duration: 5000
    },
    {
      id: 'create-node',
      title: 'Create Your First Dream',
      description: 'Press Space to enter creation mode',
      position: [0, -1, -25],
      duration: 10000
    }
  ];

  /**
   * Check if user has completed tutorial
   */
  hasCompletedTutorial(): boolean {
    const state = this.loadState();
    return state.completed || false;
  }

  /**
   * Check if tutorial should auto-start
   *
   * TEMP: Always return true for testing
   */
  shouldAutoStart(): boolean {
    return true; // TEMP: Always show tutorial for testing
    // return !this.hasCompletedTutorial(); // Normal behavior
  }

  /**
   * Start tutorial from beginning
   */
  start(): void {
    this.currentStep = 0;
    this.saveState({ completed: false, currentStep: 0 });
    this.notifyStepChange();
  }

  /**
   * Advance to next step
   */
  next(): void {
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
      this.saveState({ completed: false, currentStep: this.currentStep });
      this.notifyStepChange();
    } else {
      this.complete();
    }
  }

  /**
   * Go to previous step
   */
  previous(): void {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.saveState({ completed: false, currentStep: this.currentStep });
      this.notifyStepChange();
    }
  }

  /**
   * Skip tutorial
   */
  skip(): void {
    this.complete();
  }

  /**
   * Complete tutorial
   */
  complete(): void {
    this.saveState({ completed: true, currentStep: this.steps.length });
    this.currentStep = -1; // Return to inactive state
    this.notifyStepChange(); // null step indicates completion
  }

  /**
   * Get current step
   */
  getCurrentStep(): TutorialStep | null {
    if (this.currentStep >= 0 && this.currentStep < this.steps.length) {
      return this.steps[this.currentStep];
    }
    return null;
  }

  /**
   * Subscribe to step changes
   */
  onStepChange(callback: (step: TutorialStep | null) => void): () => void {
    this.onStepChangeCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.onStepChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.onStepChangeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Reset tutorial (for testing)
   */
  reset(): void {
    globalThis.localStorage.removeItem(TutorialService.STORAGE_KEY);
    this.currentStep = -1; // Return to inactive state
  }

  // ============ Golden Dot Methods (Decoupled) ============

  /**
   * Trigger a golden dot animation (position-based or node-based)
   */
  animateGoldenDot(animation: GoldenDotAnimation): void {
    this.goldenDotAnimation = animation;
    this.notifyGoldenDotChange();
  }

  /**
   * Trigger a golden dot animation between two nodes by ID
   * Convenience method for node-based animations
   */
  animateGoldenDotBetweenNodes(
    fromNodeId: string,
    toNodeId: string,
    options?: {
      duration?: number;
      size?: number;
      easing?: 'linear' | 'easeInOut' | 'easeIn' | 'easeOut';
    }
  ): void {
    this.goldenDotAnimation = {
      fromNodeId,
      toNodeId,
      duration: options?.duration,
      size: options?.size,
      easing: options?.easing,
    };
    this.notifyGoldenDotChange();
  }

  /**
   * Clear golden dot (called when animation completes)
   */
  clearGoldenDot(): void {
    this.goldenDotAnimation = null;
    this.notifyGoldenDotChange();
  }

  /**
   * Get current golden dot animation
   */
  getGoldenDotAnimation(): GoldenDotAnimation | null {
    return this.goldenDotAnimation;
  }

  /**
   * Subscribe to golden dot changes
   */
  onGoldenDotChange(callback: (animation: GoldenDotAnimation | null) => void): () => void {
    this.onGoldenDotCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.onGoldenDotCallbacks.indexOf(callback);
      if (index > -1) {
        this.onGoldenDotCallbacks.splice(index, 1);
      }
    };
  }

  private notifyGoldenDotChange(): void {
    const animation = this.goldenDotAnimation;
    this.onGoldenDotCallbacks.forEach(callback => callback(animation));
  }

  // ============ Private Methods ============

  private notifyStepChange(): void {
    const step = this.getCurrentStep();
    this.onStepChangeCallbacks.forEach(callback => callback(step));
  }

  private loadState(): { completed: boolean; currentStep: number } {
    const stored = globalThis.localStorage.getItem(TutorialService.STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error('Failed to load tutorial state:', e);
      }
    }
    return { completed: false, currentStep: 0 };
  }

  private saveState(state: { completed: boolean; currentStep: number }): void {
    globalThis.localStorage.setItem(TutorialService.STORAGE_KEY, JSON.stringify(state));
  }
}

// Singleton instance
export const tutorialService = new TutorialService();
