/**
 * Feedback Slice - State management for bug reporting and feedback system
 *
 * Manages:
 * - User preferences (auto-report behavior, data inclusion toggles)
 * - Modal visibility state
 * - Current error context for reporting
 * - Rate limiting state
 *
 * Rate Limiting Design:
 * - MODAL throttle: 30s cooldown after modal shown (prevents error loop spam)
 * - SESSION limit: Max 10 submissions per session (prevents GitHub spam)
 * No time cooldown on submissions since modal throttle already prevents rapid fire.
 */

import { StateCreator } from 'zustand';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Auto-report preference for automatic error detection
 */
export type AutoReportPreference = 'always' | 'ask' | 'never';

/**
 * Captured error context for reporting
 */
export interface CapturedError {
  message: string;
  stack?: string;
  timestamp: number;
  source?: string; // 'uncaught' | 'unhandledrejection' | 'console.error' | 'manual'
}

/**
 * Feedback state
 */
export interface FeedbackState {
  // User preferences (persisted)
  autoReportPreference: AutoReportPreference;
  includeLogs: boolean;
  includeState: boolean;

  // Modal state (runtime)
  isModalOpen: boolean;
  currentError: CapturedError | null;

  // Modal throttle (runtime) - prevents modal spam during error loops
  lastModalTimestamp: number | null;
  modalThrottleNoticeShown: boolean;

  // Submit throttle (runtime) - prevents GitHub spam
  lastSubmitTimestamp: number | null;
  sessionSubmitCount: number;
}

// ============================================================================
// SLICE INTERFACE
// ============================================================================

export interface FeedbackSlice {
  feedback: FeedbackState;

  // Preference setters
  setAutoReportPreference: (preference: AutoReportPreference) => void;
  setIncludeLogs: (include: boolean) => void;
  setIncludeState: (include: boolean) => void;

  // Modal control
  openFeedbackModal: (error?: CapturedError) => void;
  closeFeedbackModal: () => void;

  // Modal throttle (for error detection)
  canShowModal: () => boolean;
  recordModalShown: () => void;
  shouldShowModalThrottleNotice: () => boolean;
  markModalThrottleNoticeShown: () => void;

  // Submit throttle (for GitHub submission)
  canSubmitReport: () => boolean;
  recordReportSubmitted: () => void;
  getSubmitCooldownSeconds: () => number;
  resetSessionCounts: () => void;

  // Legacy alias for compatibility
  canSendReport: () => boolean;
  recordReportSent: () => void;
  resetSessionReportCount: () => void;
  shouldShowCooldownNotice: () => boolean;
  markCooldownNoticeShown: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MODAL_THROTTLE_MS = 30000; // 30 seconds between modals
const MAX_SUBMITS_PER_SESSION = 10; // No time cooldown, just session limit

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialFeedbackState: FeedbackState = {
  autoReportPreference: 'ask',
  includeLogs: true,
  includeState: true,
  isModalOpen: false,
  currentError: null,
  lastModalTimestamp: null,
  modalThrottleNoticeShown: false,
  lastSubmitTimestamp: null,
  sessionSubmitCount: 0,
};

// ============================================================================
// SLICE CREATOR
// ============================================================================

export const createFeedbackSlice: StateCreator<
  FeedbackSlice,
  [],
  [],
  FeedbackSlice
> = (set, get) => ({
  feedback: initialFeedbackState,

  setAutoReportPreference: (preference) =>
    set((state) => ({
      feedback: { ...state.feedback, autoReportPreference: preference },
    })),

  setIncludeLogs: (include) =>
    set((state) => ({
      feedback: { ...state.feedback, includeLogs: include },
    })),

  setIncludeState: (include) =>
    set((state) => ({
      feedback: { ...state.feedback, includeState: include },
    })),

  openFeedbackModal: (error) =>
    set((state) => ({
      feedback: {
        ...state.feedback,
        isModalOpen: true,
        currentError: error || null,
      },
    })),

  closeFeedbackModal: () =>
    set((state) => ({
      feedback: {
        ...state.feedback,
        isModalOpen: false,
        currentError: null,
      },
    })),

  // ========== MODAL THROTTLE ==========

  canShowModal: () => {
    const { feedback } = get();
    if (!feedback.lastModalTimestamp) return true;

    const timeSinceLastModal = Date.now() - feedback.lastModalTimestamp;
    return timeSinceLastModal >= MODAL_THROTTLE_MS;
  },

  recordModalShown: () =>
    set((state) => ({
      feedback: {
        ...state.feedback,
        lastModalTimestamp: Date.now(),
        modalThrottleNoticeShown: false, // Reset for next throttle period
      },
    })),

  shouldShowModalThrottleNotice: () => {
    const { feedback } = get();
    if (!feedback.lastModalTimestamp) return false;

    const timeSinceLastModal = Date.now() - feedback.lastModalTimestamp;
    const inThrottle = timeSinceLastModal < MODAL_THROTTLE_MS;

    // If throttle expired, reset the flag
    if (!inThrottle && feedback.modalThrottleNoticeShown) {
      set((state) => ({
        feedback: { ...state.feedback, modalThrottleNoticeShown: false },
      }));
      return false;
    }

    return inThrottle && !feedback.modalThrottleNoticeShown;
  },

  markModalThrottleNoticeShown: () =>
    set((state) => ({
      feedback: { ...state.feedback, modalThrottleNoticeShown: true },
    })),

  // ========== SUBMIT THROTTLE ==========

  canSubmitReport: () => {
    const { feedback } = get();
    // Only check session limit - no time cooldown since modal is already throttled
    return feedback.sessionSubmitCount < MAX_SUBMITS_PER_SESSION;
  },

  recordReportSubmitted: () =>
    set((state) => ({
      feedback: {
        ...state.feedback,
        lastSubmitTimestamp: Date.now(),
        sessionSubmitCount: state.feedback.sessionSubmitCount + 1,
      },
    })),

  getSubmitCooldownSeconds: () => {
    // No time cooldown - kept for API compatibility but always returns 0
    return 0;
  },

  resetSessionCounts: () =>
    set((state) => ({
      feedback: {
        ...state.feedback,
        lastModalTimestamp: null,
        modalThrottleNoticeShown: false,
        lastSubmitTimestamp: null,
        sessionSubmitCount: 0,
      },
    })),

  // ========== LEGACY ALIASES ==========
  // For backwards compatibility with existing code

  canSendReport: () => get().canSubmitReport(),
  recordReportSent: () => get().recordReportSubmitted(),
  resetSessionReportCount: () => get().resetSessionCounts(),
  shouldShowCooldownNotice: () => get().shouldShowModalThrottleNotice(),
  markCooldownNoticeShown: () => get().markModalThrottleNoticeShown(),
});

// ============================================================================
// PERSISTENCE HELPERS
// ============================================================================

/**
 * Extract persistable feedback data
 */
export function extractFeedbackPersistenceData(state: FeedbackSlice): {
  feedbackPreferences: {
    autoReportPreference: AutoReportPreference;
    includeLogs: boolean;
    includeState: boolean;
  };
} {
  return {
    feedbackPreferences: {
      autoReportPreference: state.feedback.autoReportPreference,
      includeLogs: state.feedback.includeLogs,
      includeState: state.feedback.includeState,
    },
  };
}

/**
 * Restore feedback preferences from persisted data
 */
export function restoreFeedbackPersistenceData(persisted: {
  feedbackPreferences?: {
    autoReportPreference?: AutoReportPreference;
    includeLogs?: boolean;
    includeState?: boolean;
  };
}): Partial<FeedbackSlice> {
  if (!persisted.feedbackPreferences) {
    return {};
  }

  return {
    feedback: {
      ...initialFeedbackState,
      autoReportPreference:
        persisted.feedbackPreferences.autoReportPreference || 'ask',
      includeLogs: persisted.feedbackPreferences.includeLogs ?? true,
      includeState: persisted.feedbackPreferences.includeState ?? true,
    },
  };
}
