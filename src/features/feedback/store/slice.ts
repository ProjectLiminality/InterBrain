/**
 * Feedback Slice - State management for bug reporting and feedback system
 *
 * Manages:
 * - User preferences (auto-report behavior, data inclusion toggles)
 * - Modal visibility state
 * - Current error context for reporting
 * - Rate limiting state
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

  // Rate limiting (runtime)
  lastReportTimestamp: number | null;
  sessionReportCount: number;
  cooldownNoticeShown: boolean; // Prevents spam: only show cooldown notice once per cooldown period
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

  // Reporting
  recordReportSent: () => void;
  canSendReport: () => boolean;
  resetSessionReportCount: () => void;

  // Cooldown notice
  markCooldownNoticeShown: () => void;
  shouldShowCooldownNotice: () => boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const RATE_LIMIT_MS = 30000; // 30 seconds between reports
const MAX_REPORTS_PER_SESSION = 10;

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialFeedbackState: FeedbackState = {
  autoReportPreference: 'ask',
  includeLogs: true,
  includeState: true,
  isModalOpen: false,
  currentError: null,
  lastReportTimestamp: null,
  sessionReportCount: 0,
  cooldownNoticeShown: false,
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

  recordReportSent: () =>
    set((state) => ({
      feedback: {
        ...state.feedback,
        lastReportTimestamp: Date.now(),
        sessionReportCount: state.feedback.sessionReportCount + 1,
      },
    })),

  canSendReport: () => {
    const { feedback } = get();
    const now = Date.now();

    // Check session limit
    if (feedback.sessionReportCount >= MAX_REPORTS_PER_SESSION) {
      return false;
    }

    // Check rate limit
    if (feedback.lastReportTimestamp) {
      const timeSinceLastReport = now - feedback.lastReportTimestamp;
      if (timeSinceLastReport < RATE_LIMIT_MS) {
        return false;
      }
    }

    return true;
  },

  resetSessionReportCount: () =>
    set((state) => ({
      feedback: {
        ...state.feedback,
        sessionReportCount: 0,
        lastReportTimestamp: null,
        cooldownNoticeShown: false,
      },
    })),

  markCooldownNoticeShown: () =>
    set((state) => ({
      feedback: { ...state.feedback, cooldownNoticeShown: true },
    })),

  shouldShowCooldownNotice: () => {
    const { feedback } = get();
    const now = Date.now();

    // Only show if we're in cooldown AND haven't shown notice yet
    if (!feedback.lastReportTimestamp) return false;

    const timeSinceLastReport = now - feedback.lastReportTimestamp;
    const inCooldown = timeSinceLastReport < RATE_LIMIT_MS;

    // If cooldown expired, reset the flag
    if (!inCooldown && feedback.cooldownNoticeShown) {
      set((state) => ({
        feedback: { ...state.feedback, cooldownNoticeShown: false },
      }));
      return false;
    }

    return inCooldown && !feedback.cooldownNoticeShown;
  },
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
