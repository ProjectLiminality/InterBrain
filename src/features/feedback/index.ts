/**
 * Feedback Feature - Bug Reporting and Feedback System
 *
 * Enables users to report issues (automatically on crash or manually)
 * with sliding scale of AI intelligence contribution.
 *
 * @module features/feedback
 */

// Store
export {
  FeedbackSlice,
  FeedbackState,
  CapturedError,
  AutoReportPreference,
  createFeedbackSlice,
  extractFeedbackPersistenceData,
  restoreFeedbackPersistenceData,
} from './store/slice';

// Services
export { errorCaptureService, LogEntry } from './services/error-capture-service';
export { feedbackService, SubmitResult, SystemInfo } from './services/feedback-service';
export { issueFormatterService, FeedbackData, RefinedIssue } from './services/issue-formatter-service';

// Components
export { FeedbackModal, showFeedbackModal } from './components/FeedbackModal';

// Commands
export { registerFeedbackCommands } from './commands';

// Settings
export { createFeedbackSettingsSection } from './settings-section';
